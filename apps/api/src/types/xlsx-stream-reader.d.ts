// Type declarations for xlsx-stream-reader (no bundled TypeScript types)
declare module 'xlsx-stream-reader' {
  export interface XlsxStreamReaderRow {
    values: (string | number | boolean | Date | null)[];
    formulas: (string | null)[];
    attributes: {
      r: number;
      ht?: string;
      customFormat?: string;
      hidden?: string;
    };
  }

  export interface XlsxStreamReaderWorksheet {
    id: number;
    name: string;
    rowCount: number;
    on(event: 'row', handler: (row: XlsxStreamReaderRow) => void): this;
    on(event: 'end', handler: () => void): this;
    on(event: 'error', handler: (err: Error) => void): this;
    process(): void;
    skip(): void;
  }

  export interface XlsxStreamReaderInstance {
    on(event: 'error', handler: (err: Error) => void): this;
    on(event: 'worksheet', handler: (worksheet: XlsxStreamReaderWorksheet) => void): this;
    on(event: 'sharedStrings', handler: () => void): this;
    on(event: 'styles', handler: () => void): this;
    on(event: 'end', handler: () => void): this;
    pipe<T extends NodeJS.WritableStream>(dest: T): XlsxStreamReaderInstance;
    unpipe(dest?: NodeJS.WritableStream): this;
  }

  export default class XlsxStreamReader {
    constructor(options?: { verbose?: boolean; formatting?: boolean; saxTrim?: boolean });
  }
}
