// Minimal `DataTransfer` mock for paste-flow tests (T28.6). Clones the
// shape used by Lexical's
// `packages/lexical/src/__tests__/utils/index.tsx::DataTransferMock` (MIT) —
// a `Map<string, string>` backing `setData` / `getData` / `types`. Lexical's
// version is the cleanest published pattern; we copy the surface area
// verbatim (no compatibility shim is needed for our flow).

export class DataTransferMock implements DataTransfer {
  private readonly _data: Map<string, string> = new Map();

  dropEffect: DataTransfer['dropEffect'] = 'none';
  effectAllowed: DataTransfer['effectAllowed'] = 'all';
  readonly files: FileList = Object.assign([] as unknown as FileList, { item: () => null });
  readonly items: DataTransferItemList = [] as unknown as DataTransferItemList;

  get types(): readonly string[] {
    return Array.from(this._data.keys());
  }

  setData(format: string, data: string): void {
    this._data.set(format, data);
  }

  getData(format: string): string {
    return this._data.get(format) ?? '';
  }

  clearData(format?: string): void {
    if (format == null) this._data.clear();
    else this._data.delete(format);
  }

  setDragImage(): void {
    /* no-op */
  }
}
