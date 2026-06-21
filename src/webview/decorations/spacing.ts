import { EditorView } from '@codemirror/view';

// Collapses doubled .cm-line padding on adjacent opt-in constructs. margin-collapse is impossible because CM6 forbids margins on .cm-line (height-map rule).
export const spacing_extension = EditorView.theme({
  '.cm-line.plainmark-collapse-adjacent:has(+ .cm-line.plainmark-collapse-adjacent)': {
    paddingBottom: '0',
  },
});
