// Copies the 4:3 SVG flags for the 48 qualified teams from the flag-icons
// package (MIT) into public/flags/, plus a neutral tbd.svg placeholder.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'node_modules/flag-icons/flags/4x3');
const DEST = join(ROOT, 'public/flags');

mkdirSync(DEST, { recursive: true });

const teams = JSON.parse(readFileSync(join(ROOT, 'src/data/teams.json'), 'utf8'));
let n = 0;
for (const { flag } of Object.values(teams)) {
  copyFileSync(join(SRC, `${flag}.svg`), join(DEST, `${flag}.svg`));
  n++;
}

writeFileSync(
  join(DEST, 'tbd.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480">
<rect width="640" height="480" fill="#3c4a5c"/>
<text x="320" y="285" font-family="sans-serif" font-size="160" fill="#8fa3b8" text-anchor="middle">?</text>
</svg>
`
);
console.log(`copied ${n} flags + tbd.svg to public/flags/`);
