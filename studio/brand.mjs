// Brands the TV app for one studio channel: node studio/brand.mjs <slug>
// Writes packages/shared-ui/src/channel.ts, which every TV build (Fire OS, Vega, web) reads.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const slug = process.argv[2];
if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
  console.error('Usage: node studio/brand.mjs <channel-slug>');
  process.exit(1);
}
const channelFile = resolve(import.meta.dirname, 'public', 'c', slug, 'channel.json');
const channel = JSON.parse(await readFile(channelFile, 'utf8').catch(() => {
  console.error(`No channel "${slug}" yet. Build it in the studio first (${channelFile}).`);
  process.exit(1);
}));

const target = resolve(import.meta.dirname, '..', 'packages', 'shared-ui', 'src', 'channel.ts');
await writeFile(
  target,
  `// Written by \`node studio/brand.mjs <slug>\`: each creator's app is built from this file.
// The catalog stays remote, so creators add videos without shipping a new build.
export const channel = ${JSON.stringify(
    { name: channel.name, tagline: channel.tagline, catalogUrl: channel.catalogUrl, primary: channel.primary },
    null,
    2,
  ).replace(/"([a-zA-Z]+)":/g, '$1:')};
`,
);
console.log(`Branded the TV app as "${channel.name}" -> ${target}`);
