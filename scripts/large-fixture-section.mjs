// One section of the ~1 MB stress fixtures. The two generators differ only in
// the purpose phrase, the second paragraph, and the extras they append.
export function section(i, purpose, second_paragraph) {
  return (
    `## Section ${i}\n\n` +
    `This is the first paragraph of section ${i}. It contains **bold text**, *italic text*, ` +
    `\`inline code\`, and a [link](https://example.com/section/${i}). Normal prose text ` +
    `to add realistic bulk to the document and exercise ${purpose} at scale.\n\n` +
    `${second_paragraph}\n\n` +
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
