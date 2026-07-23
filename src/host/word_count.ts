const cjk_chars = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
const cjk_punctuation = /[\u3000-\u303f\uff01-\uff0f\uff1a-\uff20\uff3b-\uff40\uff5b-\uff65]/gu;

export function count_words(text: string): number {
  const cjk = text.match(cjk_chars)?.length ?? 0;
  const rest =
    text.replace(cjk_chars, ' ').replace(cjk_punctuation, ' ').match(/\S+/g)?.length ?? 0;
  return cjk + rest;
}

export function word_count_label(count: number): string {
  return count === 1 ? '1 Word' : `${count} Words`;
}
