import { describe, expect, it } from 'vitest';

import { igdbImageUri } from './catalog-image';

const CANONICAL = 'https://images.igdb.com/igdb/image/upload/t_thumb/co123.jpg';

describe('igdbImageUri', () => {
  it('accepts a canonical IGDB url', () => {
    expect(igdbImageUri(CANONICAL)).toBe(CANONICAL);
  });

  it('accepts a protocol-relative url and a mixed-case host', () => {
    expect(igdbImageUri('//images.igdb.com/igdb/image/upload/t_cover_big/co123.png')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_cover_big/co123.png',
    );
    expect(igdbImageUri('HTTPS://IMAGES.IGDB.COM/igdb/image/upload/t_thumb/co123.jpg')).toBe(CANONICAL);
  });

  it('rejects a RAWG url and anything that is not the IGDB image path', () => {
    expect(igdbImageUri('https://media.rawg.io/media/games/example.jpg')).toBeNull();
    expect(igdbImageUri('http://images.igdb.com/igdb/image/upload/t_thumb/co123.jpg')).toBeNull();
    expect(igdbImageUri('https://images.igdb.com/igdb/image/upload/t_thumb/co123.jpg?x=1')).toBeNull();
    expect(igdbImageUri(null)).toBeNull();
  });
});
