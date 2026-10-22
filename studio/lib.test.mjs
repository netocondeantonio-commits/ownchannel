import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_VIDEOS, metaFromFileName, parseChannelRequest, parseVideoUrl, posterFrame, slugify, toCatalogItem } from './lib.mjs';

test('posterFrame uses Claude pick only when valid', () => {
  assert.equal(posterFrame({ poster_frame: 0 }), 0);
  assert.equal(posterFrame({ poster_frame: 7 }), 1);
  assert.equal(posterFrame(metaFromFileName('https://x.io/a.mp4')), 1);
});

test('slugify keeps a safe folder name', () => {
  assert.equal(slugify('Igreja São João: Cultos & Aulas!'), 'igreja-sao-joao-cultos-aulas');
  assert.equal(slugify('../../etc'), 'etc');
});

test('parseVideoUrl only accepts http(s)', () => {
  assert.equal(parseVideoUrl(' https://cdn.example.com/a.mp4 '), 'https://cdn.example.com/a.mp4');
  assert.throws(() => parseVideoUrl('file:///etc/passwd'), /Not an http/);
  assert.throws(() => parseVideoUrl('concat:a.mp4|b.mp4'));
});

test('parseChannelRequest validates input', () => {
  const spec = parseChannelRequest({ name: 'Hillside Church', primary: 'red', videos: [{ url: 'https://x.io/a.mp4', notes: 'Easter' }, { url: ' ' }] });
  assert.equal(spec.slug, 'hillside-church');
  assert.equal(spec.primary, '#007AFF');
  assert.deepEqual(spec.videos, [{ url: 'https://x.io/a.mp4', notes: 'Easter' }]);
  assert.throws(() => parseChannelRequest({ name: '', videos: [{ url: 'https://x.io/a.mp4' }] }), /name is required/);
  assert.throws(() => parseChannelRequest({ name: 'A', videos: [] }), /at least one video/);
  const tooMany = Array.from({ length: MAX_VIDEOS + 1 }, (_, i) => ({ url: `https://x.io/${i}.mp4` }));
  assert.throws(() => parseChannelRequest({ name: 'A', videos: tooMany }), /Max/);
});

test('toCatalogItem matches the TV app catalog shape', () => {
  const item = toCatalogItem({
    id: 'abc',
    meta: { title: 'T', description: 'D', category: 'Sermons', genres: ['Faith'], content_rating: 'XX' },
    durationSec: 90,
    posterUrl: 'http://h/c/s/abc-1.jpg',
    videoUrl: 'https://x.io/a.mp4',
    featured: true,
  });
  assert.equal(item.content_rating, 'TV-G');
  assert.equal(item.images.poster_16x9, 'http://h/c/s/abc-1.jpg');
  assert.deepEqual(item.sources, [{ type: 'video/mp4', url: 'https://x.io/a.mp4' }]);
  assert.equal(item.trending, true);
});

test('metaFromFileName builds a readable title', () => {
  assert.equal(metaFromFileName('https://x.io/v/easter_sunday-service.mp4').title, 'Easter Sunday Service');
});
