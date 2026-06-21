import { type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type PluginValue, type ViewUpdate } from '@codemirror/view';
import { create_logger } from '../log.js';

const log = create_logger('oracle-pin');

interface TextMetrics {
  lineHeight: number;
  charWidth: number;
  textHeight: number;
}

interface DocViewInternal {
  measureTextSize: () => TextMetrics;
}

interface ObserverInternal {
  ignore: (f: () => void) => void;
}

const SAMPLE_TEXT = 'abc def ghi jkl mno pqr stu'; // 27 chars — matches CM6's own fallback

function read_doc_view(view: EditorView): DocViewInternal | null {
  const dv = (view as unknown as { docView?: Partial<DocViewInternal> }).docView;
  return dv && typeof dv.measureTextSize === 'function' ? (dv as DocViewInternal) : null;
}

// CM6's DocView.measureTextSize samples the FIRST short (<=20 char), all-text,
// ASCII rendered line as the document-wide oracle line-height; on tall lines
// (revealed headings, callout titles) that qualify, the sample flips between tall
// and body height as the viewport moves, a >0.3px change rebuilds the whole height
// map, the estimated total swings ~2000px, and the viewport snaps ("Measure loop
// restarted more than 5 times"). Pin the metric to CM6's own stable synthetic-line
// fallback so the oracle line-height never flips. Written against @codemirror/view
// 6.42.1; a rename of measureTextSize makes this a safe no-op (snap returns, caught
// by smoke).
export const oracle_line_height_pin: Extension = ViewPlugin.fromClass(
  class implements PluginValue {
    private patched: DocViewInternal | null = null;
    private original: (() => TextMetrics) | null = null;
    private cached: TextMetrics | null = null;

    constructor(private readonly view: EditorView) {
      // docView is assigned after plugin values are created (CM6 dist 7854 vs 7858),
      // so the synchronous attempt misses on construction; the microtask runs once
      // the constructor has finished (docView present) but before the first measure.
      if (!this.install()) {
        queueMicrotask(() => {
          if (!this.install())
            log.warn('docView.measureTextSize unavailable — oracle pin inert (CM6 internal changed?)');
        });
      }
    }

    update(update: ViewUpdate): void {
      if (update.geometryChanged) this.cached = null;
      this.install(); // re-pin if a reconfigure swapped docView; cheap no-op otherwise
    }

    destroy(): void {
      this.restore();
    }

    private install(): boolean {
      const dv = read_doc_view(this.view);
      if (!dv) return false;
      if (this.patched === dv) return true;
      this.restore();
      this.patched = dv;
      this.original = dv.measureTextSize.bind(dv);
      this.cached = null;
      dv.measureTextSize = (): TextMetrics => this.measure();
      return true;
    }

    private restore(): void {
      if (this.patched && this.original) this.patched.measureTextSize = this.original;
      this.patched = null;
      this.original = null;
    }

    private measure(): TextMetrics {
      if (this.cached) return this.cached;
      const measured = this.measure_body();
      if (measured && measured.lineHeight > 0) {
        this.cached = measured;
        return measured;
      }
      return this.original!();
    }

    // Replica of CM6's synthetic-line fallback (dist 3332–3346): a bare `.cm-line`
    // inherits only body typography, so its box height is the stable body line-height.
    private measure_body(): TextMetrics | null {
      const dummy = document.createElement('div');
      dummy.className = 'cm-line';
      dummy.style.width = '99999px';
      dummy.style.position = 'absolute';
      dummy.textContent = SAMPLE_TEXT;
      let result: TextMetrics | null = null;
      const run = (): void => {
        this.view.contentDOM.appendChild(dummy);
        const text_node = dummy.firstChild;
        let rect: DOMRect | undefined;
        if (text_node) {
          const range = document.createRange();
          range.selectNodeContents(text_node);
          rect = range.getClientRects()[0];
        }
        const line_height = dummy.getBoundingClientRect().height;
        const char_width = rect && rect.width ? rect.width / SAMPLE_TEXT.length : 7;
        const text_height = rect && rect.height ? rect.height : line_height;
        dummy.remove();
        result = { lineHeight: line_height, charWidth: char_width, textHeight: text_height };
      };
      const observer = (this.view as unknown as { observer?: Partial<ObserverInternal> }).observer;
      if (observer && typeof observer.ignore === 'function') (observer.ignore as ObserverInternal['ignore'])(run);
      else run();
      return result;
    }
  },
);
