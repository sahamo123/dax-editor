// The playback engine: plays the EDIT (a sequence of trimmed clips) with two media elements used ping-pong style.
// While one plays the current clip, the other is preloaded and seeked to the next clip's in-point, so switching at a
// cut is instant. The playing element's clock is the master clock: the playhead is derived from its currentTime.
// No React and no DOM globals here, so it can be unit tested with fake media elements.

import { clamp } from "../lib/time";
import { fadeFactor } from "./fades";

/** The part of HTMLVideoElement the engine uses (so tests can pass a fake). */
export interface MediaSlot {
  currentTime: number;
  readonly paused: boolean;
  readonly seeking: boolean;
  readonly ended: boolean;
  /** HTMLMediaElement.readyState: 0 nothing, 2 has the current frame, 4 can play through. */
  readonly readyState: number;
  volume: number;
  playbackRate: number;
  src: string;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** One clip prepared for playback. Times are seconds; `in`/`out` are source time, `start` is timeline time. */
export interface EngineClip {
  id: string;
  assetId: string;
  /** Proxy video URL, or null when the asset is unknown (the clip plays as black). */
  url: string | null;
  start: number;
  in: number;
  out: number;
  /** Linear gain; the preview cannot exceed 1 (see {@link MediaSlot.volume}). */
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

/** How the engine reports back. Implemented by the PreviewPane glue. */
export interface EngineHost {
  /** Playback moved the playhead to this timeline time. */
  onPlayhead(seconds: number): void;
  /** Playback reached the end (or the start, when reversing) and stopped. */
  onEnded(): void;
  /** Which element is showing, and how opaque it is (fades from/to black). The other element is hidden. */
  onVisual(active: 0 | 1, opacity: number): void;
  /** The browser refused to start playback without a user gesture (or it started again). */
  onBlocked(blocked: boolean): void;
  /** True while waiting for media to load or buffer at the current position. */
  onBuffering(buffering: boolean): void;
  /** A media file failed to load. */
  onMediaError(assetId: string): void;
}

/** Tunable options. */
export interface EngineOptions {
  /** Switch to the next clip this many seconds early, to hide the frame-timing slack of the render loop. */
  lead?: number;
}

interface Slot {
  media: MediaSlot;
  /** URL currently loaded, so the same file is not reloaded. */
  url: string | null;
  /** Index of the clip this element is prepared for, or -1. */
  clipIndex: number;
  /** The element has finished seeking to its target and can show a frame. */
  ready: boolean;
  /** Source time we last asked this element to seek to. */
  target: number;
  /** A newer seek request received while one was already running. */
  pending: number | null;
  /** Listener handles for disposal. */
  off: () => void;
}

const SETTLE_TOLERANCE = 0.1;
const SEEK_TOLERANCE_PLAYING = 0.15;
const SEEK_TOLERANCE_PAUSED = 0.001;

/** Plays the edit. Create one per preview, feed it clips, and call {@link PlaybackEngine.tick} every animation frame. */
export class PlaybackEngine {
  private clips: EngineClip[] = [];
  private slots: [Slot, Slot];
  private active: 0 | 1 = 0;
  /** Index of the clip the active element is playing. */
  private ci = -1;
  private isPlaying = false;
  private rate = 1;
  private loopOn = false;
  private mutedOn = false;
  private holdingFor: number | null = null;
  private lastTick: number | null = null;
  private lastReported = 0;
  private readonly lead: number;

  /** @param slots Two media elements (ideally `<video>` elements stacked on top of each other). */
  constructor(
    slots: [MediaSlot, MediaSlot],
    private readonly host: EngineHost,
    options: EngineOptions = {},
  ) {
    this.lead = options.lead ?? 1 / 60;
    this.slots = [this.makeSlot(slots[0], 0), this.makeSlot(slots[1], 1)];
  }

  private makeSlot(media: MediaSlot, which: 0 | 1): Slot {
    const slot: Slot = {
      media,
      url: null,
      clipIndex: -1,
      ready: false,
      target: 0,
      pending: null,
      off: () => {},
    };
    // Called when a seek finishes or new data arrives. A freshly loaded file already sitting at the target time
    // (for example source time 0) never fires `seeked`, so `loadeddata`/`canplay` must be able to settle it too.
    const settle = () => {
      if (slot.url === null) return;
      if (slot.pending !== null && !media.seeking) {
        const next = slot.pending;
        slot.pending = null;
        slot.target = next;
        media.currentTime = next;
        return;
      }
      if (media.seeking || slot.pending !== null) return;
      if (media.readyState < 2 || Math.abs(media.currentTime - slot.target) > SETTLE_TOLERANCE)
        return;
      if (slot.ready) return;
      slot.ready = true;
      if (which === this.active) {
        this.host.onBuffering(false);
        // A seek that interrupted playback resumes now that a frame is ready.
        if (this.isPlaying && this.rate > 0 && this.holdingFor === null && media.paused)
          this.startMedia(slot);
      }
    };
    const onError = () => {
      const clip = this.clips[slot.clipIndex];
      if (clip) this.host.onMediaError(clip.assetId);
    };
    media.addEventListener("seeked", settle);
    media.addEventListener("loadeddata", settle);
    media.addEventListener("canplay", settle);
    media.addEventListener("error", onError);
    slot.off = () => {
      media.removeEventListener("seeked", settle);
      media.removeEventListener("loadeddata", settle);
      media.removeEventListener("canplay", settle);
      media.removeEventListener("error", onError);
    };
    return slot;
  }

  private get cur(): Slot {
    return this.slots[this.active];
  }

  private get standby(): Slot {
    return this.slots[this.active === 0 ? 1 : 0];
  }

  /** Total length of the edit in seconds. */
  get duration(): number {
    const last = this.clips[this.clips.length - 1];
    return last ? last.start + (last.out - last.in) : 0;
  }

  /** True while the engine is in the playing state (including buffering). */
  get playing(): boolean {
    return this.isPlaying;
  }

  private clipEnd(c: EngineClip): number {
    return c.start + (c.out - c.in);
  }

  private indexAt(t: number): number {
    if (this.clips.length === 0) return -1;
    for (let i = 0; i < this.clips.length; i++) {
      const c = this.clips[i];
      if (c && t >= c.start && t < this.clipEnd(c)) return i;
    }
    return t < 0 ? 0 : this.clips.length - 1;
  }

  // ---- loading and seeking individual elements ----

  /** Point `slot` at clip `index` and seek it to timeline time `t` (within that clip). */
  private prepare(slot: Slot, index: number, t: number): void {
    const clip = this.clips[index];
    if (!clip) return;
    const src = clamp(clip.in + (t - clip.start), clip.in, clip.out);
    slot.clipIndex = index;
    if (slot.url !== clip.url) {
      slot.url = clip.url;
      slot.ready = false;
      slot.pending = null;
      if (clip.url) slot.media.src = clip.url;
      else slot.media.pause();
    }
    this.seekMedia(slot, src);
  }

  private seekMedia(slot: Slot, sourceTime: number): void {
    slot.ready = false;
    slot.target = sourceTime;
    if (slot.url === null) {
      slot.ready = true;
      return;
    }
    if (slot.media.seeking) {
      // Coalesce: only the latest target matters, and a seek is already running.
      slot.pending = sourceTime;
      return;
    }
    slot.media.currentTime = sourceTime;
  }

  /** Make the standby element ready for the clip after the current one, unless it will continue seamlessly. */
  private preloadNext(): void {
    const next = this.ci + 1;
    const nextClip = this.clips[next];
    const cur = this.clips[this.ci];
    const sb = this.standby;
    sb.media.pause();
    sb.media.volume = 0;
    if (!nextClip || !cur) {
      sb.clipIndex = -1;
      return;
    }
    if (this.isContinuous(cur, nextClip)) {
      sb.clipIndex = -1;
      return;
    }
    if (
      sb.clipIndex === next &&
      sb.url === nextClip.url &&
      Math.abs(sb.target - nextClip.in) < 1e-6
    )
      return;
    this.prepare(sb, next, nextClip.start);
  }

  private isContinuous(a: EngineClip, b: EngineClip): boolean {
    return a.url !== null && a.url === b.url && Math.abs(b.in - a.out) < 0.002;
  }

  private startMedia(slot: Slot): void {
    slot.media.playbackRate = this.rate > 0 ? this.rate : 1;
    let result: Promise<void> | undefined;
    try {
      result = slot.media.play();
    } catch {
      this.host.onBlocked(true);
      return;
    }
    result?.then(
      () => this.host.onBlocked(false),
      (err: unknown) => {
        // AbortError just means a newer load/pause interrupted this play(); only a policy refusal is "blocked".
        if (err instanceof Error && err.name === "NotAllowedError") {
          this.isPlaying = false;
          this.host.onBlocked(true);
        }
      },
    );
  }

  // ---- public control ----

  /** Replace the clip list (after the project changed). Keeps playing/paused state and re-syncs to `playhead`. */
  setClips(clips: EngineClip[], playhead: number): void {
    const reshaped =
      clips.length !== this.clips.length || clips.some((c, i) => this.clips[i]?.url !== c.url);
    this.clips = clips;
    // Slots hold indices into the old list. Forget them, but keep the loaded files: seek() decides what to reuse.
    if (reshaped) for (const s of this.slots) s.clipIndex = -1;
    this.seek(playhead);
  }

  /** Jump to timeline time `t`. Safe to call very frequently (drag scrubbing): seeks are coalesced. */
  seek(t: number): void {
    this.holdingFor = null;
    const index = this.indexAt(t);
    const clip = this.clips[index];
    if (!clip) {
      this.ci = -1;
      this.cur.media.pause();
      this.standby.media.pause();
      this.host.onVisual(this.active, 0);
      return;
    }
    const time = clamp(t, 0, this.duration);
    const local = clamp(time - clip.start, 0, clip.out - clip.in);
    const sourceTime = clip.in + local;
    this.lastReported = time;
    this.lastTick = null;

    const reuse = this.cur.url === clip.url && clip.url !== null;
    // While playing forward a small mismatch is just clock drift; paused and reverse stepping must be exact.
    const tolerance =
      this.isPlaying && this.rate > 0 ? SEEK_TOLERANCE_PLAYING : SEEK_TOLERANCE_PAUSED;
    const atSpot =
      reuse &&
      !this.cur.media.seeking &&
      Math.abs(this.cur.media.currentTime - sourceTime) <= tolerance;

    if (atSpot && this.cur.ready) {
      this.ci = index;
      this.cur.clipIndex = index;
    } else {
      // A preloaded element for exactly this clip becomes the active one (instant, no reload).
      const sb = this.standby;
      if (sb.clipIndex === index && sb.url === clip.url && sb.url !== null && !this.isPlaying) {
        this.cur.media.pause();
        this.active = this.active === 0 ? 1 : 0;
      }
      this.ci = index;
      this.cur.media.pause();
      this.prepare(this.cur, index, time);
      if (this.isPlaying && this.rate > 0) this.host.onBuffering(true);
    }
    this.applyLevels(clip, local);
    this.preloadNext();
    this.host.onPlayhead(time);
    if (this.isPlaying && this.rate > 0 && this.cur.ready && this.cur.media.paused)
      this.startMedia(this.cur);
  }

  /** Start or stop playing from the current position. */
  setPlaying(playing: boolean): void {
    if (playing === this.isPlaying) return;
    this.isPlaying = playing;
    this.lastTick = null;
    if (!playing) {
      this.holdingFor = null;
      this.cur.media.pause();
      this.standby.media.pause();
      this.host.onBuffering(false);
      return;
    }
    if (this.ci < 0) this.seek(this.lastReported);
    if (this.rate > 0 && this.cur.ready) this.startMedia(this.cur);
  }

  /** Set the playback speed: 1, 2, 4 forward; -1, -2, -4 reverse (stepped and silent). */
  setRate(rate: number): void {
    if (rate === this.rate) return;
    const wasReverse = this.rate < 0;
    this.rate = rate;
    this.lastTick = null;
    if (rate < 0) {
      this.cur.media.pause();
    } else {
      this.cur.media.playbackRate = rate;
      if (this.isPlaying && wasReverse) this.seek(this.lastReported);
    }
  }

  /** Loop back to the start when the end is reached. */
  setLoop(loop: boolean): void {
    this.loopOn = loop;
  }

  /** Silence the preview. */
  setMuted(muted: boolean): void {
    this.mutedOn = muted;
    const clip = this.clips[this.ci];
    if (clip) this.applyLevels(clip, this.lastReported - clip.start);
  }

  /** Reload the elements (for example after a media file that was still being prepared became available). */
  reload(): void {
    for (const s of this.slots) {
      s.url = null;
      s.clipIndex = -1;
    }
    this.seek(this.lastReported);
  }

  /** Stop and release listeners. */
  dispose(): void {
    this.isPlaying = false;
    for (const s of this.slots) {
      s.media.pause();
      s.off();
    }
  }

  // ---- the render loop ----

  /** Advance the engine. Call from `requestAnimationFrame`; `now` is a millisecond clock. */
  tick(now: number): void {
    const clip = this.clips[this.ci];
    if (!this.isPlaying || !clip) {
      this.lastTick = now;
      return;
    }
    if (this.rate < 0) {
      this.tickReverse(now);
      return;
    }
    this.lastTick = now;

    if (this.holdingFor !== null) {
      this.tryResumeAfterHold();
      return;
    }

    const media = this.cur.media;
    if (!this.cur.ready) {
      this.host.onBuffering(true);
      return;
    }
    if (media.paused && !media.ended) {
      // Autoplay refused or the element was paused by the browser; do not run the clock.
      return;
    }
    const local = media.currentTime - clip.in;
    const timelineTime = clip.start + local;
    const end = this.clipEnd(clip);
    if (timelineTime >= end - this.lead * this.rate || media.ended) {
      this.advance();
      return;
    }
    this.lastReported = clamp(timelineTime, clip.start, end);
    this.applyLevels(clip, local);
    this.host.onPlayhead(this.lastReported);
  }

  private tickReverse(now: number): void {
    const dt = this.lastTick === null ? 0 : (now - this.lastTick) / 1000;
    this.lastTick = now;
    const t = this.lastReported - dt * Math.abs(this.rate);
    if (t <= 0) {
      this.seek(0);
      this.stop();
      return;
    }
    this.seek(t);
    // seek() clears the tick clock; restore it so the next step measures from now.
    this.lastTick = now;
  }

  private stop(): void {
    this.isPlaying = false;
    this.cur.media.pause();
    this.standby.media.pause();
    this.host.onBuffering(false);
    this.host.onEnded();
  }

  /** The current clip is over: continue into the next one, loop, or stop. */
  private advance(): void {
    const cur = this.clips[this.ci];
    const next = this.clips[this.ci + 1];
    if (!cur) return;
    if (!next) {
      if (this.loopOn) {
        this.seek(0);
        return;
      }
      this.cur.media.pause();
      this.lastReported = this.duration;
      this.host.onPlayhead(this.duration);
      this.stop();
      return;
    }
    if (this.isContinuous(cur, next) && !this.cur.media.ended) {
      // Same file, no jump in source time (e.g. after a split): just keep playing.
      this.ci += 1;
      this.cur.clipIndex = this.ci;
      this.lastReported = next.start;
      this.applyLevels(next, this.cur.media.currentTime - next.in);
      this.preloadNext();
      this.host.onPlayhead(next.start);
      return;
    }
    const sb = this.standby;
    if (sb.clipIndex === this.ci + 1 && sb.ready) {
      this.swapTo(this.ci + 1);
      return;
    }
    // The next clip is not ready yet (very short clip, slow disk). Hold at the cut until it is.
    this.cur.media.pause();
    this.holdingFor = this.ci + 1;
    this.lastReported = next.start;
    this.host.onPlayhead(next.start);
    this.host.onBuffering(true);
    if (sb.clipIndex !== this.ci + 1) this.prepare(sb, this.ci + 1, next.start);
  }

  private tryResumeAfterHold(): void {
    const idx = this.holdingFor;
    if (idx === null) return;
    if (this.standby.clipIndex === idx && this.standby.ready) {
      this.holdingFor = null;
      this.swapTo(idx);
    }
  }

  /** Make the preloaded element the playing one. */
  private swapTo(index: number): void {
    const old = this.cur;
    this.active = this.active === 0 ? 1 : 0;
    this.ci = index;
    const clip = this.clips[index];
    if (!clip) return;
    this.applyLevels(clip, 0);
    this.startMedia(this.cur);
    old.media.pause();
    this.lastReported = clip.start;
    this.host.onBuffering(false);
    this.host.onPlayhead(clip.start);
    this.preloadNext();
  }

  private applyLevels(clip: EngineClip, local: number): void {
    const f = fadeFactor(local, clip.out - clip.in, clip.fadeIn, clip.fadeOut);
    this.cur.media.volume = this.mutedOn || this.rate < 0 ? 0 : clamp(clip.volume * f, 0, 1);
    this.host.onVisual(this.active, f);
  }
}
