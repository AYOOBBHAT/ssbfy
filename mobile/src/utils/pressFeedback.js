import { motion } from '../theme/motion';

/**
 * Standard press feedback for buttons, rows, and list items.
 * @returns {object | null} style fragment for Pressable `style` callback
 */
export function pressFeedbackStyle(pressed, disabled = false) {
  if (disabled) return { opacity: motion.disabled.opacity };
  if (pressed) return { opacity: motion.press.opacity };
  return null;
}

/**
 * Softer feedback for large cards — opacity only (no scale; smoother on low-end Android).
 */
export function pressCardStyle(pressed, disabled = false) {
  if (disabled) return { opacity: motion.disabled.opacity };
  if (pressed) return { opacity: motion.press.cardOpacity };
  return null;
}

/** Merge base styles with press feedback in Pressable callbacks. */
export function withPressStyle(base, pressed, disabled, variant = 'default') {
  const feedback =
    variant === 'card'
      ? pressCardStyle(pressed, disabled)
      : pressFeedbackStyle(pressed, disabled);
  return feedback ? [base, feedback] : [base];
}
