import { channel } from '../channel';

export const colors = {
  // Primary colors
  primary: channel.primary,
  secondary: '#5856D6',

  // Backgrounds
  background: '#000000',
  backgroundElevated: '#141414',
  card: '#1C1C1E',
  cardElevated: '#2C2C2E',
  overlay: '#1A1A1A',

  // Text colors with proper contrast (WCAG AAA compliant)
  text: '#FFFFFF',
  textSecondary: '#C7C7CC',
  textTertiary: '#8E8E93',
  textOnPrimary: '#000000',

  // Border and dividers
  border: '#48484A',
  borderLight: '#38383A',
  divider: '#2C2C2E',

  // Status colors
  notification: '#FF453A',
  error: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',
  info: '#0A84FF',

  // Focus and interaction states
  focus: '#FFFFFF',
  focusBorder: '#FFFFFF',
  focusBackground: '#FFFFFF',
  focusBackgroundSecondary: 'rgba(255, 255, 255, 0.15)',
  focusGlow: 'rgba(255, 255, 255, 0.4)',

  // Interactive states
  pressedOverlay: 'rgba(255, 255, 255, 0.1)',
  hoverOverlay: 'rgba(255, 255, 255, 0.08)',

  // Glass surfaces: translucent panels without blur (backdrop blur is too costly on TV GPUs)
  glass: 'rgba(18, 18, 28, 0.55)',
  glassStrong: 'rgba(12, 12, 20, 0.8)',
  glassBorder: 'rgba(255, 255, 255, 0.14)',

  // Scrim and overlays
  scrimLight: 'rgba(0, 0, 0, 0.4)',
  scrimMedium: 'rgba(0, 0, 0, 0.6)',
  scrimDark: 'rgba(0, 0, 0, 0.85)',
};
