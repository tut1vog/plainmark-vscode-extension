import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '../tests/source-preservation/fixtures/no-edit/large.md');

const sections = [];
for (let i = 1; i <= 1400; i++) {
  sections.push(
    `## Section ${i}\n\n` +
    `This is the first paragraph of section ${i}. It contains **bold text**, *italic text*, ` +
    `\`inline code\`, and a [link](https://example.com/section/${i}). Normal prose text ` +
    `to add realistic bulk to the document and exercise byte-fidelity at scale.\n\n` +
    `This is the second paragraph of section ${i}. Lorem ipsum dolor sit amet, consectetur ` +
    `adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.\n\n` +
    `- List item alpha in section ${i}\n` +
    `- List item beta in section ${i}\n` +
    `- List item gamma with **bold** in section ${i}\n\n` +
    `> Blockquote in section ${i} with *emphasis* and \`code snippet\`.\n\n` +
    '```\n' +
    `const result${i} = compute(${i});\n` +
    `console.log(result${i});\n` +
    '```\n\n'
  );
}

const content = sections.join('');
writeFileSync(out, content);
console.log(`wrote ${content.length} bytes`);
