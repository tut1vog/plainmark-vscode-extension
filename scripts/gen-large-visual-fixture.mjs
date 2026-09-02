import { writeFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { section } from './large-fixture-section.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '../tests/visual/fixtures/large-doc.md');

const sections = [];
for (let i = 1; i <= 1400; i++) {
  let block = section(
    i,
    'the renderer',
    `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor ` +
      `incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud ` +
      `exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.`,
  );

  if (i % 20 === 0) {
    block += `Inline math: $x_{${i}}^2 + y^2 = z^2$.\n\n`;
    block += `$$\n\\sum_{k=1}^{${i}} k = \\frac{${i}(${i}+1)}{2}\n$$\n\n`;
  }

  if (i % 40 === 0) {
    block += `![sample image](img/sample.png)\n\n`;
  }

  sections.push(block);
}

const content = sections.join('');
writeFileSync(out, content);
const size = statSync(out).size;
console.log(`wrote ${size} bytes (${(size / 1024 / 1024).toFixed(2)} MB) to ${out}`);
