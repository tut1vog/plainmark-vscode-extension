import { ParseContext } from '@codemirror/language';

type Work = (until: number | (() => boolean), upto?: number) => boolean;

// CM6 parses state updates on a 20ms wall-clock budget, which worker contention can exhaust, leaving partial trees.
const proto = ParseContext.prototype as unknown as { work: Work };
const work = proto.work;
if (typeof work !== 'function')
  throw new Error('ParseContext.prototype.work is gone; update tests/parse-budget.setup.ts');
proto.work = function (this: ParseContext, until, upto) {
  return work.call(this, typeof until === 'number' ? 1e9 : until, upto);
};
