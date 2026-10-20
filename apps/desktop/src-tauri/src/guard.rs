//! Orphan prevention for the engine-server sidecar: platform-specific safety nets that make sure
//! the server (and the processes it starts, such as FFmpeg) cannot outlive the app.
//!
//! Layers, from most to least portable:
//!
//! 1. **stdin protocol** (all platforms, implemented in `sidecar.rs`): the server's stdin is a pipe
//!    held only by the shell. When the shell dies for any reason, even `SIGKILL` or a crash, the
//!    kernel closes the pipe and the server sees end-of-input and exits.
//! 2. **Linux `PR_SET_PDEATHSIG`**: the kernel sends the server `SIGTERM` the moment the thread
//!    that spawned it dies. This covers a server that is busy and not reading stdin.
//! 3. **Unix process group**: the server leads its own group, so a graceful shutdown can signal
//!    the server and everything it started (`killpg`).
//! 4. **Windows job object** with kill-on-close: the server is placed in a job that the kernel
//!    tears down, killing every process in it, when the shell's handle disappears.
//!
//! macOS has no `PDEATHSIG` equivalent, so it relies on layers 1 and 3.

use std::process::{Child, Command};

/// A signal we may send to the server's process group.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GroupSignal {
    /// Polite request to terminate (`SIGTERM`); the server cleans up its children.
    Term,
    /// Unconditional kill (`SIGKILL`).
    Kill,
}

#[cfg(unix)]
mod imp {
    use super::*;
    use std::os::unix::process::CommandExt;

    /// Resource released when the shell is done with the child. Nothing to hold on Unix.
    #[derive(Debug)]
    pub struct Guard;

    /// Prepare `cmd` before spawning: lead a new process group and, on Linux, ask the kernel to
    /// send `SIGTERM` if the spawning thread dies.
    ///
    /// The spawning thread must outlive the app's useful life: Linux ties `PDEATHSIG` to the
    /// *thread*, not the process, so the caller spawns from a dedicated long-lived thread.
    pub fn configure_command(cmd: &mut Command) {
        cmd.process_group(0);
        #[cfg(target_os = "linux")]
        {
            // SAFETY: the closure runs between fork and exec and only calls async-signal-safe
            // functions (`prctl`, `getppid`) and builds an io::Error from errno.
            let parent = std::process::id() as libc::pid_t;
            unsafe {
                cmd.pre_exec(move || {
                    if libc::prctl(
                        libc::PR_SET_PDEATHSIG,
                        libc::SIGTERM as libc::c_ulong,
                        0,
                        0,
                        0,
                    ) == -1
                    {
                        return Err(std::io::Error::last_os_error());
                    }
                    // The parent may have died between fork and prctl; the signal would never
                    // arrive then, so bail out instead of becoming an orphan.
                    if libc::getppid() != parent {
                        return Err(std::io::Error::other("parent exited before exec"));
                    }
                    Ok(())
                });
            }
        }
    }

    /// Post-spawn hook. Unix needs nothing beyond [`configure_command`].
    pub fn attach(_child: &Child) -> Option<Guard> {
        Some(Guard)
    }

    /// Send `signal` to the process group led by `pid`. Returns whether the group still existed.
    pub fn signal_group(pid: u32, signal: GroupSignal) -> bool {
        let sig = match signal {
            GroupSignal::Term => libc::SIGTERM,
            GroupSignal::Kill => libc::SIGKILL,
        };
        // SAFETY: killpg has no memory-safety preconditions; an invalid pid just fails.
        unsafe { libc::killpg(pid as libc::pid_t, sig) == 0 }
    }

    /// Whether any process is still alive in the group led by `pid`.
    pub fn group_exists(pid: u32) -> bool {
        // Signal 0 performs the existence/permission check without delivering anything.
        // SAFETY: as above.
        unsafe { libc::killpg(pid as libc::pid_t, 0) == 0 }
    }
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::ffi::c_void;
    use std::os::windows::io::AsRawHandle;
    use std::os::windows::process::CommandExt;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    /// `CREATE_NO_WINDOW`: do not flash a console window for the server.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    /// Owns a job object configured with kill-on-close. Dropping it (or the shell dying, which
    /// closes the handle) makes Windows terminate every process still in the job.
    #[derive(Debug)]
    pub struct Guard(HANDLE);

    // SAFETY: a job-object HANDLE is just a kernel object reference; it may be used and closed
    // from any thread.
    unsafe impl Send for Guard {}

    impl Drop for Guard {
        fn drop(&mut self) {
            // SAFETY: the handle was created by CreateJobObjectW and is closed exactly once.
            unsafe {
                CloseHandle(self.0);
            }
        }
    }

    /// Prepare `cmd` before spawning: no console window.
    pub fn configure_command(cmd: &mut Command) {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    /// Put the freshly spawned `child` into a new kill-on-close job object.
    ///
    /// There is a tiny window between process creation and assignment during which the child
    /// could start grandchildren that escape the job; a Node server does not do that within its
    /// first milliseconds. Returns `None` if the job cannot be set up, in which case the stdin
    /// protocol is the only safety net.
    pub fn attach(child: &Child) -> Option<Guard> {
        // SAFETY: plain Win32 calls with correctly sized, zero-initialised structures.
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return None;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let configured = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            let assigned = configured != 0
                && AssignProcessToJobObject(job, child.as_raw_handle() as HANDLE) != 0;
            if !assigned {
                CloseHandle(job);
                return None;
            }
            Some(Guard(job))
        }
    }

    /// Windows has no process groups to signal; the job object does the cleanup.
    pub fn signal_group(_pid: u32, _signal: GroupSignal) -> bool {
        false
    }

    /// See [`signal_group`]: always `false` on Windows.
    pub fn group_exists(_pid: u32) -> bool {
        false
    }
}

pub use imp::{attach, configure_command, group_exists, signal_group, Guard};
