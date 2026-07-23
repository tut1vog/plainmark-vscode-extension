export function count_words(text: string): number {
  return text.match(/\S+/g)?.length ?? 0;
}

export function word_count_label(count: number): string {
  return count === 1 ? '1 Word' : `${count} Words`;
}
