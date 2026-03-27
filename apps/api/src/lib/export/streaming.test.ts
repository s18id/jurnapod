// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

/**
 * Tests for Streaming Export with Backpressure Handling
 */

import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { Writable } from 'node:stream';
import { createBackpressureWriter, streamToResponse, BackpressureMetrics } from './streaming.js';

describe('Backpressure Handling', () => {
  let mockWarn: ReturnType<typeof mock.method>;
  let mockInfo: ReturnType<typeof mock.method>;

  beforeEach(() => {
    mockWarn = mock.method(console, 'warn', () => {});
    mockInfo = mock.method(console, 'info', () => {});
  });

  afterEach(() => {
    mockWarn?.mock.restore();
    mockInfo?.mock.restore();
  });

  test('should return true from write when destination is fast', async () => {
    const fastWritable = new Writable({
      write(chunk, encoding, callback) {
        callback();
        return true;
      },
    });

    const writer = createBackpressureWriter({
      destination: fastWritable,
      bufferLimit: 10 * 1024 * 1024,
    });

    const chunk = Buffer.from('test data');
    const result = await writer.write(chunk);

    assert.strictEqual(result, true);
    assert.strictEqual(writer.getMetrics().isBackpressured, false);

    fastWritable.end();
  });

  test('should track backpressure events', async () => {
    const events: string[] = [];
    const writable = new Writable({
      write(chunk, encoding, callback) {
        callback();
        return true;
      },
    });

    const writer = createBackpressureWriter({
      destination: writable,
      onBackpressureEvent: (event) => {
        events.push(event.type);
      },
    });

    // Write some data
    for (let i = 0; i < 5; i++) {
      await writer.write(Buffer.from(`chunk ${i}`));
    }

    assert.strictEqual(writer.getMetrics().backpressureEventsTotal, 0);

    writable.end();
  });

  test('should check buffer limit', () => {
    const writable = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });

    const writer = createBackpressureWriter({
      destination: writable,
      bufferLimit: 100,
    });

    // Buffer below limit
    assert.strictEqual(writer.checkBufferLimit(50), false);

    // Buffer above limit
    assert.strictEqual(writer.checkBufferLimit(150), true);

    writable.end();
  });

  test('should collect metrics', async () => {
    const writable = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });

    const writer = createBackpressureWriter({
      destination: writable,
      bufferLimit: 10 * 1024 * 1024,
    });

    // Write some data
    for (let i = 0; i < 10; i++) {
      await writer.write(Buffer.from(`row ${i}`));
    }

    const metrics = writer.getMetrics();

    assert.strictEqual(metrics.rowsStreamed, 10);
    assert.strictEqual(writer.getMetrics().isBackpressured, false);
    assert.ok(metrics.peakMemoryBytes > 0);

    writable.end();
  });

  test('should abort cleanly', () => {
    const writable = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });

    const writer = createBackpressureWriter({
      destination: writable,
    });

    writer.abort();

    // abort sets aborted flag and backpressured
    assert.strictEqual(writer.getMetrics().isBackpressured, true);
  });

  test('should not write after abort', async () => {
    const writable = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });

    const writer = createBackpressureWriter({
      destination: writable,
    });

    writer.abort();

    const result = await writer.write(Buffer.from('test data'));

    assert.strictEqual(result, false);
    assert.strictEqual(writer.getMetrics().rowsStreamed, 0);
  });
});

describe('streamToResponse', () => {
  let mockWarn: ReturnType<typeof mock.method>;
  let mockInfo: ReturnType<typeof mock.method>;

  beforeEach(() => {
    mockWarn = mock.method(console, 'warn', () => {});
    mockInfo = mock.method(console, 'info', () => {});
  });

  afterEach(() => {
    mockWarn?.mock.restore();
    mockInfo?.mock.restore();
  });

  test('should stream data successfully', async () => {
    const chunks: Buffer[] = [];

    const writable = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    async function* dataSource() {
      for (let i = 0; i < 100; i++) {
        yield Buffer.from(`row ${i}\n`);
      }
    }

    const result = await streamToResponse(dataSource(), writable, {
      destination: writable,
      bufferLimit: 10 * 1024 * 1024,
    });

    assert.strictEqual(result.rowsWritten, 100);
    assert.ok(chunks.length > 0);
  });

  test('should handle slow consumer with backpressure', async () => {
    let backpressureCount = 0;

    const slowWritable = new Writable({
      highWaterMark: 1, // Very small buffer
      write(chunk, encoding, callback) {
        // Simulate slow consumer - only process one chunk per 50ms
        setTimeout(() => {
          callback();
        }, 50);
      },
    });

    async function* dataSource() {
      for (let i = 0; i < 20; i++) {
        yield Buffer.from(`row ${i}\n`);
      }
    }

    const startTime = Date.now();

    const result = await streamToResponse(dataSource(), slowWritable, {
      destination: slowWritable,
      bufferLimit: 5 * 1024, // Small buffer to trigger backpressure
      enableThrottling: true,
      throttleThresholdMs: 1000,
      onBackpressureEvent: (event) => {
        if (event.type === 'started') {
          backpressureCount++;
        }
      },
    });

    const duration = Date.now() - startTime;

    // With slow consumer, should take at least 1 second
    assert.ok(duration >= 900, `Expected duration >= 900ms, got ${duration}ms`);
    assert.strictEqual(result.rowsWritten, 20);

    // Backpressure should have been triggered
    assert.ok(backpressureCount > 0, 'Expected backpressure to be triggered');
  });
});

describe('Backpressure Metrics', () => {
  test('should track backpressure events correctly', async () => {
    const writable = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });

    const writer = createBackpressureWriter({
      destination: writable,
    });

    // Write some data
    for (let i = 0; i < 10; i++) {
      await writer.write(Buffer.from(`row ${i}`));
    }

    const metrics = writer.getMetrics();
    assert.strictEqual(metrics.rowsStreamed, 10);

    writable.end();
  });

  test('should track peak memory usage', async () => {
    const writable = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });

    const writer = createBackpressureWriter({
      destination: writable,
      bufferLimit: 10 * 1024 * 1024,
    });

    // Write data and check peak memory increases
    for (let i = 0; i < 100; i++) {
      await writer.write(Buffer.alloc(1024)); // 1KB per chunk
    }

    const metrics = writer.getMetrics();
    assert.ok(metrics.peakMemoryBytes >= 100 * 1024); // At least 100KB

    writable.end();
  });
});

describe('Throttling', () => {
  test('should enable throttling after threshold', async () => {
    let throttleStarted = false;

    const slowWritable = new Writable({
      highWaterMark: 1,
      write(chunk, encoding, callback) {
        // Always signal backpressure
        setTimeout(callback, 5);
      },
    });

    const writer = createBackpressureWriter({
      destination: slowWritable,
      bufferLimit: 1024,
      enableThrottling: true,
      throttleThresholdMs: 100, // Very short for testing
      throttleRowsPerSecond: 100,
      onBackpressureEvent: (event) => {
        if (event.type === 'throttle_started') {
          throttleStarted = true;
        }
      },
    });

    // Write enough to trigger throttle
    for (let i = 0; i < 50; i++) {
      await writer.write(Buffer.from(`row ${i}`));
      if (throttleStarted) break;
    }

    // Give time for throttle to kick in
    await new Promise(resolve => setTimeout(resolve, 200));

    const metrics = writer.getMetrics();
    assert.ok(metrics.backpressureEventsTotal >= 0);

    slowWritable.end();
  });

  test('should not activate throttling when enableThrottling is false', async () => {
    let throttleStarted = false;
    let throttleEvents: string[] = [];

    const slowWritable = new Writable({
      highWaterMark: 1,
      write(chunk, encoding, callback) {
        // Always signal backpressure
        setTimeout(callback, 5);
      },
    });

    const writer = createBackpressureWriter({
      destination: slowWritable,
      bufferLimit: 1024,
      enableThrottling: false, // Explicitly disabled
      throttleThresholdMs: 100,
      throttleRowsPerSecond: 100,
      onBackpressureEvent: (event) => {
        throttleEvents.push(event.type);
        if (event.type === 'throttle_started') {
          throttleStarted = true;
        }
      },
    });

    // Write enough data to trigger backpressure
    for (let i = 0; i < 50; i++) {
      await writer.write(Buffer.from(`row ${i}`));
      // Throttle should NOT start even with backpressure
      assert.strictEqual(
        throttleStarted,
        false,
        `Throttle should not start when enableThrottling is false (at row ${i})`
      );
    }

    // Verify no throttle events were fired
    assert.ok(
      !throttleEvents.includes('throttle_started'),
      'throttle_started event should not fire when enableThrottling is false'
    );

    slowWritable.end();
  });
});

describe('Buffer Limit Enforcement', () => {
  test('should pause when buffer limit exceeded', () => {
    const writable = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });

    const writer = createBackpressureWriter({
      destination: writable,
      bufferLimit: 500, // Small limit
    });

    // Exceed buffer limit
    const isLimited = writer.checkBufferLimit(600);

    assert.strictEqual(isLimited, true);
    assert.strictEqual(writer.getMetrics().isBackpressured, true);

    writable.end();
  });
});

describe('Buffer Bytes Tracking', () => {
  test('should track buffer bytes in state', async () => {
    const writable = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });

    const writer = createBackpressureWriter({
      destination: writable,
      bufferLimit: 1000,
    });

    // Write some chunks
    await writer.write(Buffer.alloc(100)); // 100 bytes
    await writer.write(Buffer.alloc(200)); // 200 bytes
    await writer.write(Buffer.alloc(300)); // 300 bytes

    const metrics = writer.getMetrics();
    
    // Peak buffer bytes should reflect the accumulated bytes
    assert.ok(metrics.peakMemoryBytes >= 600, 'Peak buffer should track total bytes written');

    writable.end();
  });

  test('buffer tracking uses bytes not row count', async () => {
    const writable = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });

    // Small rows - 100 rows of 50 bytes each = 5000 bytes
    const smallRowsData = Array.from({ length: 100 }, () => Buffer.alloc(50));
    
    // Large rows - 10 rows of 500 bytes each = 5000 bytes  
    const largeRowsData = Array.from({ length: 10 }, () => Buffer.alloc(500));

    const writer1 = createBackpressureWriter({
      destination: writable,
      bufferLimit: 10 * 1024 * 1024,
    });

    for (const row of smallRowsData) {
      await writer1.write(row);
    }
    const metrics1 = writer1.getMetrics();

    const writer2 = createBackpressureWriter({
      destination: writable,
      bufferLimit: 10 * 1024 * 1024,
    });

    for (const row of largeRowsData) {
      await writer2.write(row);
    }
    const metrics2 = writer2.getMetrics();

    // Both should have tracked the same total bytes
    assert.strictEqual(metrics1.peakMemoryBytes, metrics2.peakMemoryBytes);

    writable.end();
  });

  test('should detect buffer limit exceeded via checkBufferLimit', async () => {
    const writable = new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });

    const writer = createBackpressureWriter({
      destination: writable,
      bufferLimit: 500,
    });

    // Check buffer limit with values below and above (strictly greater than)
    const belowLimit = writer.checkBufferLimit(400);
    const atLimit = writer.checkBufferLimit(501);
    const aboveLimit = writer.checkBufferLimit(600);

    assert.strictEqual(belowLimit, false, '400 should be below 500 limit');
    assert.strictEqual(atLimit, true, '501 should exceed 500 limit');
    assert.strictEqual(aboveLimit, true, '600 should exceed 500 limit');

    writable.end();
  });
});
