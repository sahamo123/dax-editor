// Fixed pixel sizes of the timeline layout. The CSS in ui/editor.css reads the same numbers through CSS variables
// set on the timeline root, so layout code and styles cannot drift apart.

/** Width of the sticky lane-label column on the left. Time zero sits at this x offset. */
export const GUTTER = 64;
/** Height of the time ruler. */
export const RULER_H = 28;
/** Height of one overlay lane. */
export const LANE_H = 30;
/** Height of the main video lane. */
export const VIDEO_H = 88;
/** Space above and below a clip block inside the video lane. */
export const CLIP_PAD = 5;
/** Height of the filmstrip part of a clip block. */
export const THUMB_H = 46;
/** Height of the waveform part of a clip block. */
export const WAVE_H = VIDEO_H - 2 * CLIP_PAD - THUMB_H;
/** Width of a trim handle's hit area at each end of a block. */
export const HANDLE_W = 9;
/** Extra seconds of empty room after the last item, so there is somewhere to drop or drag to. */
export const TAIL_SECONDS = 8;
/** Pixel step used to quantise the visible window, so scrolling re-renders blocks only now and then. */
export const WINDOW_QUANTUM = 320;
/** Extra pixels rendered beyond each edge of the visible window. */
export const WINDOW_MARGIN = 480;
/** Highest volume the drag line can reach (1 = 100%). */
export const MAX_UI_VOLUME = 2;
