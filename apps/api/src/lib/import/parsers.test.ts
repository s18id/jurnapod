// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Streaming Parser Tests (Story 7.5 — TD-008/TD-009)
 *
 * Verifies that parseCSV and parseExcel:
 *  - Yield rows incrementally (streaming, not full-buffer materialisation)
 *  - Produce identical output to the sync (non-streaming) counterparts
 *  - Handle edge cases: empty files, BOM, missing headers, short rows
 */

import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import * as XLSX from 'xlsx';

import {
  parseCSV,
  parseCSVSync,
  parseExcel,
  parseExcelSync,
} from './parsers.js';
import type { ImportRow } from './types.js';

// ============================================================================
// Helpers
// ============================================================================

function csvBuf(text: string): Buffer {
  return Buffer.from(text, 'utf-8');
}

async function collect(iter: AsyncIterable<ImportRow>): Promise<ImportRow[]> {
  const rows: ImportRow[] = [];
  for await (const row of iter) rows.push(row);
  return rows;
}

/** Assert that the iterable rejects with an ImportError matching the given code */
async function assertRejectsWithCode(
  iter: AsyncIterable<ImportRow>,
  code: string,
  messagePattern?: RegExp,
): Promise<void> {
  await assert.rejects(collect(iter), (err: unknown) => {
    const e = err as { code?: string; message?: string };
    assert.equal(e.code, code, `expected error code ${code}`);
    if (messagePattern) {
      assert.match(e.message ?? '', messagePattern);
    }
    return true;
  });
}

function makeXlsxBuffer(sheetData: string[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// ============================================================================
// CSV Streaming — TD-008
// ============================================================================

describe('parseCSV streaming (TD-008)', () => {
  test('yields all data rows, skipping header', async () => {
    const buf = csvBuf('name,qty\nApple,5\nBanana,3\n');
    const rows = await collect(parseCSV(buf));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].data['name'], 'Apple');
    assert.equal(rows[1].data['name'], 'Banana');
  });

  test('streaming output matches parseCSVSync output', async () => {
    const lines = ['sku,name,price'];
    for (let i = 0; i < 500; i++) lines.push(`SKU${i},Item ${i},${i * 100}`);
    const buf = csvBuf(lines.join('\n'));

    const streamRows = await collect(parseCSV(buf));
    const syncResult = parseCSVSync(buf);

    assert.equal(streamRows.length, syncResult.rows.length, 'row counts must match');

    for (let i = 0; i < streamRows.length; i++) {
      assert.deepEqual(
        streamRows[i].data,
        syncResult.rows[i].data,
        `row ${i} data mismatch`,
      );
    }
  });

  test('yields rows one at a time (incremental — queue drains properly)', async () => {
    const buf = csvBuf('id,val\n1,a\n2,b\n3,c\n');
    const iter = parseCSV(buf);
    const received: string[] = [];
    for await (const row of iter) {
      received.push(String(row.data['id']));
    }
    assert.deepEqual(received, ['1', '2', '3']);
  });

  test('throws PARSE_ERROR for empty CSV (no header row)', async () => {
    const buf = csvBuf('');
    await assertRejectsWithCode(parseCSV(buf), 'PARSE_ERROR', /No headers found/);
  });

  test('skips empty rows by default', async () => {
    const buf = csvBuf('name,qty\nApple,5\n\nBanana,3\n');
    const rows = await collect(parseCSV(buf));
    assert.equal(rows.length, 2);
  });

  test('handles UTF-8 BOM correctly', async () => {
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const content = Buffer.from('name,qty\nOrange,7\n', 'utf-8');
    const buf = Buffer.concat([bom, content]);
    const rows = await collect(parseCSV(buf));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].data['name'], 'Orange');
  });

  test('marks short rows with ROW_TOO_SHORT error code', async () => {
    const buf = csvBuf('a,b,c\n1,2\n3,4,5\n');
    const rows = await collect(parseCSV(buf));
    // First data row has only 2 cells, header has 3
    assert.equal(rows.length, 2);
    // Short row is still yielded (consumers decide what to do with it)
    assert.equal(rows[0].rawData.length, 2);
  });

  test('throws FILE_TOO_LARGE for oversized buffers', async () => {
    const huge = Buffer.alloc(51 * 1024 * 1024, 'x'); // 51 MB
    await assertRejectsWithCode(parseCSV(huge), 'FILE_TOO_LARGE');
  });

  test('throws MISSING_HEADER when required column absent', async () => {
    const buf = csvBuf('name,qty\nApple,5\n');
    const opts = {
      columnMappings: [{ sourceColumn: 'sku', targetField: 'sku', fieldType: 'string' as const, required: true }],
    };
    await assertRejectsWithCode(parseCSV(buf, opts), 'MISSING_HEADER', /Missing required columns/);
  });

  test('semicolon delimiter is respected', async () => {
    const buf = csvBuf('name;qty\nApple;5\n');
    const rows = await collect(parseCSV(buf, { delimiter: ';' }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].data['qty'], '5');
  });
});

// ============================================================================
// Excel Row-by-Row — TD-009
// ============================================================================

describe('parseExcel row-by-row (TD-009)', () => {
  test('yields all data rows, skipping header', async () => {
    const buf = makeXlsxBuffer([['name', 'qty'], ['Apple', '5'], ['Banana', '3']]);
    const rows = await collect(parseExcel(buf));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].data['name'], 'Apple');
    assert.equal(rows[1].data['name'], 'Banana');
  });

  test('streaming output matches parseExcelSync output', async () => {
    const data: (string | number)[][] = [['sku', 'name', 'price']];
    for (let i = 0; i < 300; i++) data.push([`SKU${i}`, `Item ${i}`, i * 100]);
    const buf = makeXlsxBuffer(data as string[][]);

    const streamRows = await collect(parseExcel(buf));
    const syncResult = parseExcelSync(buf);

    assert.equal(streamRows.length, syncResult.rows.length, 'row counts must match');

    for (let i = 0; i < streamRows.length; i++) {
      assert.deepEqual(
        streamRows[i].data,
        syncResult.rows[i].data,
        `row ${i} data mismatch`,
      );
    }
  });

  test('throws PARSE_ERROR for empty sheet', async () => {
    const wb = XLSX.utils.book_new();
    const ws: XLSX.WorkSheet = {};
    XLSX.utils.book_append_sheet(wb, ws, 'Empty');
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    await assertRejectsWithCode(parseExcel(buf), 'PARSE_ERROR', /empty/i);
  });

  test('sheet with only blank header cells yields zero data rows', async () => {
    // ['', '', ''] is a non-empty row — createHeaderMap skips blank cells so no
    // data columns map, and the single "header" row produces no data rows.
    const buf = makeXlsxBuffer([['', '', '']]);
    const rows = await collect(parseExcel(buf));
    assert.equal(rows.length, 0);
  });

  test('skips empty rows by default', async () => {
    const buf = makeXlsxBuffer([['name', 'qty'], ['Apple', '5'], ['', ''], ['Banana', '3']]);
    const rows = await collect(parseExcel(buf));
    assert.equal(rows.length, 2);
  });

  test('numeric cell values are converted to strings', async () => {
    const buf = makeXlsxBuffer([['id', 'amount'], ['1', '9999']]);
    const rows = await collect(parseExcel(buf));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].data['id'], '1');
    assert.equal(rows[0].data['amount'], '9999');
  });

  test('throws MISSING_HEADER when required column absent', async () => {
    const buf = makeXlsxBuffer([['name', 'qty'], ['Apple', '5']]);
    const opts = {
      columnMappings: [{ sourceColumn: 'sku', targetField: 'sku', fieldType: 'string' as const, required: true }],
    };
    await assertRejectsWithCode(parseExcel(buf, opts), 'MISSING_HEADER', /Missing required columns/);
  });

  test('throws FILE_TOO_LARGE for oversized buffers', async () => {
    const huge = Buffer.alloc(51 * 1024 * 1024, 0);
    await assertRejectsWithCode(parseExcel(huge), 'FILE_TOO_LARGE');
  });

  test('named sheet is selected when sheetName option provided', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x'], ['ignored']]), 'First');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['name'], ['Target']]), 'Data');
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

    const rows = await collect(parseExcel(buf, { sheetName: 'Data' }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].data['name'], 'Target');
  });
});
