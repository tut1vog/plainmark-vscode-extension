// SHELL-C-16 — large-document advisory. Typing latency grows roughly linearly
// with document size; above ~2 MB the whole-document live render turns
// sluggish, and the built-in text editor is the better tool.
export const LARGE_FILE_WARN_THRESHOLD = 2 * 1024 * 1024;

export function should_warn_large_file(
  doc_length: number,
  already_warned: boolean,
): boolean {
  return !already_warned && doc_length > LARGE_FILE_WARN_THRESHOLD;
}

export function large_file_warning_message(doc_length: number): string {
  const mb = (doc_length / (1024 * 1024)).toFixed(1);
  return `Plainmark: this document is ${mb} MB. Documents this large can make typing sluggish — for smoother editing, reopen the file with the built-in text editor (right-click the editor tab → "Reopen Editor With…").`;
}
