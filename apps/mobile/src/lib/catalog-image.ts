// Expo Image on SDK 57 has no remote-host allowlist. Refuse anything that is
// not an IGDB CDN url so a leftover RAWG cover is not requested on device.
// The same host, path, and protocol-relative form the web parser accepts.
const PATH = /^\/igdb\/image\/upload\/t_([A-Za-z0-9_]+)\/([A-Za-z0-9_-]+)\.(jpg|png|webp)$/;

export function igdbImageUri(value: string | null | undefined): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.startsWith('//') ? `https:${value}` : value);
  } catch {
    return null;
  }
  const match = url.pathname.match(PATH);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'images.igdb.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match
  ) {
    return null;
  }
  return `https://images.igdb.com/igdb/image/upload/t_${match[1]}/${match[2]}.${match[3]}`;
}
