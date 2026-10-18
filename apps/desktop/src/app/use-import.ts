// The one "Import video" action, shared by the top bar, the empty state and the media bin: use the native file
// dialog when there is one, otherwise open the typed-path dialog.

import { useCallback } from "react";
import { pickFiles } from "../platform";
import { useApp, useController } from "./context";

/** Returns a function that starts an import. Safe to call from any button. */
export function useImport(): () => Promise<void> {
  const controller = useController();
  const patchUi = useApp((s) => s.patchUi);
  return useCallback(async () => {
    try {
      const picked = await pickFiles();
      if (picked === null) patchUi({ importOpen: true, importNote: null });
      else if (picked.length > 0) await controller.importPaths(picked);
    } catch (err) {
      // A failing native dialog should not strand the user: fall back to typing a path.
      patchUi({
        importOpen: true,
        importNote: `The file dialog is not available (${err instanceof Error ? err.message : "unknown error"}). Type the path instead.`,
      });
    }
  }, [controller, patchUi]);
}
