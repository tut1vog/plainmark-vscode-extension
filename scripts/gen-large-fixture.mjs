import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { section } from './large-fixture-section.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '../tests/source-preservation/fixtures/no-edit/large.md');

const sections = [];
for (let i = 1; i <= 1400; i++) {
  sections.push(
    section(
      i,
      'byte-fidelity',
      `This is the second paragraph of section ${i}. Lorem ipsum dolor sit amet, consectetur ` +
        `adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
    ),
  );
}

const content = sections.join('');
writeFileSync(out, content);
console.log(`wrote ${content.length} bytes`);
