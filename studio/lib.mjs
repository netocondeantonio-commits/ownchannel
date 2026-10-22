// OwnChannel Studio core: turns a creator's video links into the catalog.json the TV app reads.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CONTENT_RATINGS = ['TV-Y', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA'];
export const MAX_VIDEOS = 30;

export const slugify = text =>
  String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

// Only http(s): ffmpeg would otherwise read local files or other protocols from a pasted "URL".
export const parseVideoUrl = raw => {
  const url = new URL(String(raw).trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Not an http(s) URL: ${raw}`);
  return url.href;
};

// Request body -> clean channel spec. Throws a readable error on bad input.
export const parseChannelRequest = body => {
  const name = String(body?.name ?? '').trim().slice(0, 60);
  if (!name) throw new Error('Channel name is required');
  const primary = /^#[0-9a-fA-F]{6}$/.test(body?.primary ?? '') ? body.primary : '#007AFF';
  const videos = (Array.isArray(body?.videos) ? body.videos : [])
    .filter(v => String(v?.url ?? '').trim())
    .map(v => ({ url: parseVideoUrl(v.url), notes: String(v.notes ?? '').trim().slice(0, 500) }));
  if (!videos.length) throw new Error('Add at least one video URL');
  if (videos.length > MAX_VIDEOS) throw new Error(`Max ${MAX_VIDEOS} videos per channel`);
  return {
    slug: slugify(name) || 'channel',
    name,
    tagline: String(body?.tagline ?? '').trim().slice(0, 80),
    primary,
    videos,
  };
};

// Same shape as the template's CatalogItem (packages/shared-ui/src/data/moviesData.ts).
export const toCatalogItem = ({ id, meta, durationSec, posterUrl, videoUrl, featured }) => ({
  id,
  type: 'movie',
  title: meta.title,
  category: meta.category,
  genres: meta.genres,
  trending: featured,
  rating_count: 0,
  rating_stars: 0,
  content_rating: CONTENT_RATINGS.includes(meta.content_rating) ? meta.content_rating : 'TV-G',
  release_year: new Date().getFullYear(),
  duration_sec: durationSec,
  images: { poster_16x9: posterUrl },
  sources: [{ type: 'video/mp4', url: videoUrl }],
  description: meta.description,
});

const FFMPEG_NET = ['-protocol_whitelist', 'http,https,tls,tcp,crypto'];

export const probeDuration = async url => {
  const { stdout } = await run(
    'ffprobe',
    [...FFMPEG_NET, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', url],
    { timeout: 60_000 },
  );
  return Math.round(Number(stdout.trim())) || 0;
};

export const grabFrame = (url, atSec, outPath) =>
  run(
    'ffmpeg',
    [...FFMPEG_NET, '-y', '-v', 'error', '-ss', String(atSec), '-i', url, '-frames:v', '1', '-vf', 'scale=1280:-2', '-q:v', '3', outPath],
    { timeout: 120_000 },
  );

// Which grabbed frame becomes the poster: Claude's pick, else the middle one.
export const posterFrame = meta => ([0, 1, 2].includes(meta?.poster_frame) ? meta.poster_frame : 1);

// Fallback metadata when there is no API key: title from the file name.
export const metaFromFileName = url => {
  const file = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'Video').replace(/\.[a-z0-9]+$/i, '');
  const title = file.replace(/[-_.]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim() || 'Video';
  return { title, description: '', category: 'Videos', genres: [], content_rating: 'TV-G' };
};

const META_TOOL = {
  name: 'save_metadata',
  description: 'Save the TV catalog metadata for one video.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short viewer-facing title, max 60 characters, without the channel name or tagline' },
      description: {
        type: 'string',
        description: '2-3 sentences on what the viewer will see or learn (the topic, story or event), never a description of the frames themselves',
      },
      category: {
        type: 'string',
        description:
          'Home-screen row, 1-3 words, a genre a viewer browses by (e.g. "Sermons", "Kids", "Workouts", "Interviews", "Missions"). Reuse an existing row only if this video truly belongs there; otherwise start a new row.',
      },
      genres: { type: 'array', items: { type: 'string' }, maxItems: 3 },
      content_rating: { type: 'string', enum: CONTENT_RATINGS },
      poster_frame: {
        type: 'integer',
        enum: [0, 1, 2],
        description: 'Index of the frame that makes the best TV poster: bright, sharp and showing the subject. Never a black, blurry or text-only frame.',
      },
    },
    required: ['title', 'description', 'category', 'genres', 'content_rating', 'poster_frame'],
  },
};

// Claude looks at frames from the video plus the creator's notes and writes the catalog entry.
export const describeVideo = async ({ framePaths, notes, url, channel, existingCategories, apiKey, model }) => {
  const images = await Promise.all(
    framePaths.map(async p => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: (await readFile(p)).toString('base64') },
    })),
  );
  const prompt = [
    `You write catalog metadata for "${channel.name}", a creator's own Fire TV channel${channel.tagline ? ` (${channel.tagline})` : ''}.`,
    `The images are frames from one video (start, middle, end). File: ${url.split('/').pop()}.`,
    `Creator notes: ${notes || 'none'}.`,
    `Rows already on the home screen: ${existingCategories.join(', ') || 'none yet'}. A good channel has 2-6 rows.`,
    'The file name and notes are strong hints about the topic. Write in English. Never invent facts the frames, file name or notes do not support.',
  ].join('\n');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      tools: [META_TOOL],
      tool_choice: { type: 'tool', name: META_TOOL.name },
      messages: [{ role: 'user', content: [...images, { type: 'text', text: prompt }] }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const meta = data.content?.find(block => block.type === 'tool_use')?.input;
  if (!meta?.title) throw new Error('Claude returned no metadata');
  return meta;
};
