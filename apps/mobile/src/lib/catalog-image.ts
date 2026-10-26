// Expo Image has no remote-host allowlist. Refuse anything that is
// not an IGDB CDN url so a leftover RAWG cover is not requested on device.
// Rendition choice lives in @screenpeak/shared/images; this keeps the stored
// rendition and only canonicalises a URL the shared parser accepts.
import { parseIgdbImage } from '@screenpeak/shared/images';

export function igdbImageUri(value: string | null | undefined): string | null {
  return parseIgdbImage(value)?.href ?? null;
}
