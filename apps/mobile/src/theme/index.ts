// The one theme entry point for ScreenPeak mobile: `import { colors, face } from '@/theme'`.
// Values come from packages/shared/tokens.ts (mirrors the web's globals.css);
// only the font-file mapping is mobile-specific. Never hardcode a hex, font name
// or spacing value in a component — add it to packages/shared/tokens.ts instead.
export {
  alpha,
  avatarTint,
  colorScheme,
  colors,
  hitTarget,
  overlays,
  radius,
  ratingTier,
  seam,
  space,
  tierColor,
  tracking,
  trackingPx,
  typeScale,
} from '@screenpeak/shared/tokens'
export { face, fontFiles } from './fonts'
export { text } from './text'
