/**
 * Shared mutable scroll state for the landing film.
 *
 * Written once per scroll tick by the ScrollTrigger onUpdate handler and read
 * every animation frame by the frame player and the 3D accent layer — no React
 * state, no re-renders, no tearing concerns (single writer, rAF readers).
 */
export const scrollState = {
  /** global progress through the film, 0..1 */
  p: 0,
  /** smoothed scroll velocity (progress units / second), for motion accents */
  v: 0,
  /** active chapter index 0..9 */
  chapter: 0,
};
