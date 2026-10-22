// OwnChannel Studio: `npm start` in studio/, then open http://localhost:4310
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, resolve, sep } from 'node:path';
import { describeVideo, grabFrame, metaFromFileName, parseChannelRequest, probeDuration, toCatalogItem } from './lib.mjs';

// 8xxx often falls inside Windows' Hyper-V excluded port ranges (EACCES); 7070 is AnyDesk's.
const PORT = Number(process.env.PORT || 4310);
const STUDIO_DIR = import.meta.dirname;
const PUBLIC_DIR = resolve(STUDIO_DIR, 'public');
const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-5-5';
const lanIp = () =>
  Object.values(networkInterfaces()).flat().find(i => i?.family === 'IPv4' && !i.internal)?.address || 'localhost';
// The TV downloads catalog and posters from here, so it must be reachable from the TV (LAN IP or a public host).
const BASE_URL = (process.env.PUBLIC_BASE_URL || `http://${lanIp()}:${PORT}`).replace(/\/$/, '');
const FRAME_POINTS = [0.1, 0.5, 0.85];
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };

const readJson = async path => JSON.parse(await readFile(path, 'utf8').catch(() => 'null'));
const posterUrl = (slug, id) => `${BASE_URL}/c/${slug}/${id}-1.jpg`;

async function processVideo(spec, video, dir, existingCategories, warnings) {
  const id = createHash('sha1').update(video.url).digest('hex').slice(0, 10);
  const durationSec = await probeDuration(video.url);
  const framePaths = FRAME_POINTS.map((_, n) => join(dir, `${id}-${n}.jpg`));
  await Promise.all(FRAME_POINTS.map((point, n) => grabFrame(video.url, Math.floor(durationSec * point), framePaths[n])));
  let meta = metaFromFileName(video.url);
  if (API_KEY) {
    try {
      meta = await describeVideo({ framePaths, notes: video.notes, url: video.url, channel: spec, existingCategories, apiKey: API_KEY, model: MODEL });
    } catch (error) {
      console.error(`AI metadata failed for ${video.url}:`, error);
      warnings.push(`AI could not describe ${video.url}; used the file name instead.`);
    }
  }
  return toCatalogItem({ id, meta, durationSec, posterUrl: posterUrl(spec.slug, id), videoUrl: video.url, featured: false });
}

// Re-publishing only processes new URLs; videos already in the catalog keep their metadata.
async function buildChannel(spec) {
  const dir = join(PUBLIC_DIR, 'c', spec.slug);
  await mkdir(dir, { recursive: true });
  const previous = await readJson(join(dir, 'catalog.json'));
  const known = new Map((previous?.items ?? []).map(item => [item.sources[0]?.url, item]));
  const warnings = [];
  const items = [];
  for (const video of spec.videos) {
    const old = known.get(video.url);
    if (old) {
      items.push({ ...old, images: { poster_16x9: posterUrl(spec.slug, old.id) } });
      continue;
    }
    const categories = [...new Set(items.map(item => item.category))];
    try {
      items.push(await processVideo(spec, video, dir, categories, warnings));
    } catch (error) {
      console.error(`Skipped ${video.url}:`, error);
      warnings.push(`Skipped ${video.url}: the video could not be read (${String(error.stderr || error.message).trim().split('\n').pop()}).`);
    }
  }
  if (!items.length) throw Object.assign(new Error('None of the videos could be read'), { status: 400, warnings });
  const catalog = {
    catalog_version: '1',
    updated_at: new Date().toISOString(),
    items: items.map((item, i) => ({ ...item, trending: i < 3 })),
  };
  const catalogUrl = `${BASE_URL}/c/${spec.slug}/catalog.json`;
  await writeFile(join(dir, 'catalog.json'), JSON.stringify(catalog, null, 2));
  await writeFile(
    join(dir, 'channel.json'),
    JSON.stringify({ name: spec.name, tagline: spec.tagline, primary: spec.primary, catalogUrl }, null, 2),
  );
  return { slug: spec.slug, catalogUrl, catalog, warnings, ai: Boolean(API_KEY) };
}

const readBody = req =>
  new Promise((ok, fail) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 1_000_000) {
        fail(new Error('Request too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*' });
  res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
};

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'POST' && pathname === '/api/channels') {
      let spec;
      try {
        spec = parseChannelRequest(JSON.parse(await readBody(req)));
      } catch (error) {
        return send(res, 400, { error: error.message });
      }
      try {
        return send(res, 200, await buildChannel(spec));
      } catch (error) {
        if (error.status === 400) return send(res, 400, { error: `${error.message}. ${error.warnings.join(' ')}` });
        throw error;
      }
    }
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
    if (pathname === '/') return send(res, 200, await readFile(join(STUDIO_DIR, 'index.html')), TYPES['.html']);
    const file = resolve(PUBLIC_DIR, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(PUBLIC_DIR + sep)) return send(res, 404, { error: 'Not found' });
    const data = await readFile(file).catch(() => null);
    if (!data) return send(res, 404, { error: 'Not found' });
    return send(res, 200, data, TYPES[extname(file)] || 'application/octet-stream');
  } catch (error) {
    console.error(`${req.method} ${pathname} failed:`, error);
    return send(res, 500, { error: 'Something went wrong while building the channel. Check the studio log.' });
  }
}).listen(PORT, () => {
  console.log(`OwnChannel Studio on http://localhost:${PORT}  (TV-facing base: ${BASE_URL})`);
  console.log(API_KEY ? `AI metadata: ${MODEL}` : 'AI metadata: off (set ANTHROPIC_API_KEY in studio/.env)');
});
