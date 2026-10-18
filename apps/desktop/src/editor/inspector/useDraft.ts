// A form field that edits a local draft and sends it after a pause (or on blur), so typing never sends one command
// per keystroke. The draft follows the server value whenever the user is not in the middle of an edit.

import type { CommandResponse } from "@dax/protocol";
import { useCallback, useEffect, useRef, useState } from "react";

/** Milliseconds of quiet after the last change before the draft is sent. */
const DRAFT_DELAY_MS = 400;

/**
 * Draft state for one field.
 * @param source The current value from the project (truth).
 * @param commit Sends the value; its response is checked so a rejected edit snaps the field back to `source`.
 * @param delay Debounce in milliseconds.
 * @returns `[draft, setDraft, flush]`: `flush` sends a pending edit immediately (call it on blur).
 */
export function useDraft<T>(
  source: T,
  commit: (value: T) => Promise<CommandResponse | undefined> | undefined,
  delay = DRAFT_DELAY_MS,
): readonly [T, (value: T) => void, () => void] {
  const [draft, setDraftState] = useState(source);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(source);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    if (!dirty.current) {
      latest.current = source;
      setDraftState(source);
    }
  }, [source]);

  const flush = useCallback(() => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    if (!dirty.current) return;
    dirty.current = false;
    const result = commitRef.current(latest.current);
    // Revert the field if the server refused the value.
    result?.then((res) => {
      if (res && !res.ok) {
        latest.current = sourceRef.current;
        setDraftState(sourceRef.current);
      }
    });
  }, []);

  const setDraft = useCallback(
    (value: T) => {
      latest.current = value;
      dirty.current = true;
      setDraftState(value);
      if (timer.current !== undefined) clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );

  // Send anything still pending when the field goes away (for example the selection changed).
  useEffect(() => flush, [flush]);

  return [draft, setDraft, flush] as const;
}
