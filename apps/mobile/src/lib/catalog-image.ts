// Expo Image on SDK 57 has no remote-host allowlist. Refuse anything that is
// not an IGDB CDN url so a leftover RAWG cover is not requested on device.
const IGDB_IMAGE = /^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_[A-Za-z0-9_]+\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/;

export function igdbImageUri(value: string | null | undefined): string | null {
  if (!value || !IGDB_IMAGE.test(value)) return null;
  return value;
}
