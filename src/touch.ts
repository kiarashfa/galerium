/** True when the primary input is touch (phones/tablets). Hybrid laptops with
 *  a mouse/trackpad as primary pointer keep the desktop scheme. */
export const isTouchDevice =
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches ||
    (navigator.maxTouchPoints > 0 && window.matchMedia?.('(hover: none)').matches))
