// Glue between the editor store (what the user asked for) and the PlaybackEngine (what the media elements do).
// It runs synchronously inside store notifications so that play() is called inside the user's click/keypress,
// which is what browser autoplay policies require.

import type { EditorStore } from "../store";
import type { PlaybackEngine } from "./engine";

/**
 * Make `engine` follow `store`: seeks when the playhead is moved by the user/app, starts and stops with `playing`,
 * and mirrors speed, loop and mute. Returns a function that disconnects.
 */
export function connectEngine(engine: PlaybackEngine, store: EditorStore): () => void {
  const initial = store.getState();
  engine.setMuted(initial.muted);
  engine.setLoop(initial.loop);
  engine.setRate(initial.rate);
  engine.seek(initial.playhead);
  engine.setPlaying(initial.playing);
  let prev = initial;

  return store.subscribe(() => {
    const s = store.getState();
    const before = prev;
    // Update first: the engine reports the playhead back into the store, which re-enters this callback.
    prev = s;
    if (s.muted !== before.muted) engine.setMuted(s.muted);
    if (s.loop !== before.loop) engine.setLoop(s.loop);
    if (s.rate !== before.rate) engine.setRate(s.rate);
    // Seek before starting, so "play from the beginning" starts at the beginning.
    if (s.seekToken !== before.seekToken) engine.seek(s.playhead);
    if (s.playing !== before.playing) engine.setPlaying(s.playing);
  });
}
