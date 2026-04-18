// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { beforeEach, describe, expect, it, vi } from 'vitest';

const registryModules = new Map<string, any>();

const registryRegisterMock = vi.fn((module: any) => {
  if (registryModules.has(module.moduleId)) {
    throw new Error(`Module '${module.moduleId}' is already registered`);
  }
  registryModules.set(module.moduleId, module);
});

const registryInitializeMock = vi.fn(async (context: any) => {
  for (const module of registryModules.values()) {
    await module.initialize(context);
  }
});

const registryCleanupMock = vi.fn(async () => {
  for (const module of registryModules.values()) {
    await module.cleanup();
  }
  registryModules.clear();
});

const registryGetModuleMock = vi.fn((moduleId: string) => registryModules.get(moduleId));
const registryHealthCheckMock = vi.fn(async () => {
  return {};
});

const posInitializeMock = vi.fn(async () => {
  await Promise.resolve();
});
const posCleanupMock = vi.fn(async () => {});
const posConfigs: Array<Record<string, unknown>> = [];

class MockPosSyncModule {
  moduleId = 'pos';
  clientType = 'POS';
  endpoints: any[] = [];

  constructor(public readonly config: Record<string, unknown>) {
    posConfigs.push(config);
  }

  initialize = posInitializeMock;
  cleanup = posCleanupMock;
  healthCheck = vi.fn(async () => ({ healthy: true }));
}

const backofficeStartBatchMock = vi.fn(async () => {});
const backofficeStartExportMock = vi.fn(async () => {});
const backofficeStopBatchMock = vi.fn(async () => {});
const backofficeStopExportMock = vi.fn(async () => {});
const backofficeCleanupMock = vi.fn(async () => {});

class MockBackofficeSyncModule {
  moduleId = 'backoffice';
  clientType = 'BACKOFFICE';
  endpoints: any[] = [];

  constructor(public readonly _config: Record<string, unknown>) {}

  initialize = vi.fn(async () => {});
  cleanup = backofficeCleanupMock;
  healthCheck = vi.fn(async () => ({ healthy: true }));
  startBatchProcessor = backofficeStartBatchMock;
  startExportScheduler = backofficeStartExportMock;
  stopBatchProcessor = backofficeStopBatchMock;
  stopExportScheduler = backofficeStopExportMock;
  getBatchProcessorStatus = vi.fn(() => ({ available: true }));
  getExportScheduler = vi.fn(() => null);
}

vi.mock('@jurnapod/sync-core', () => ({
  syncModuleRegistry: {
    register: registryRegisterMock,
    initialize: registryInitializeMock,
    cleanup: registryCleanupMock,
    getModule: registryGetModuleMock,
    healthCheck: registryHealthCheckMock,
  },
}));

vi.mock('@jurnapod/pos-sync', () => ({
  PosSyncModule: MockPosSyncModule,
}));

vi.mock('@jurnapod/backoffice-sync', () => ({
  BackofficeSyncModule: MockBackofficeSyncModule,
}));

vi.mock('../../../src/lib/db', () => ({
  getDbPool: vi.fn(() => ({ mocked: true })),
}));

describe('sync-modules.lifecycle', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    registryModules.clear();
    posConfigs.length = 0;

    const { cleanupSyncModules } = await import('../../../src/lib/sync-modules');
    await cleanupSyncModules();
  });

  it('uses single-flight lazy init for concurrent getPosSyncModuleAsync calls', async () => {
    const { getPosSyncModuleAsync } = await import('../../../src/lib/sync-modules');

    const [a, b, c] = await Promise.all([
      getPosSyncModuleAsync(),
      getPosSyncModuleAsync(),
      getPosSyncModuleAsync(),
    ]);

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(posInitializeMock).toHaveBeenCalledTimes(1);
    expect(registryRegisterMock).toHaveBeenCalledTimes(1);
    expect(posConfigs[0]?.poll_interval_ms).toBe(30_000);
    expect(registryGetModuleMock('pos')).toBe(a);
  });

  it('re-initializes successfully after cleanup (no stale lazy promise)', async () => {
    const { getPosSyncModuleAsync, cleanupSyncModules } = await import('../../../src/lib/sync-modules');

    const first = await getPosSyncModuleAsync();
    await cleanupSyncModules();
    const second = await getPosSyncModuleAsync();

    expect(first).not.toBe(second);
    expect(posInitializeMock).toHaveBeenCalledTimes(2);
    expect(registryCleanupMock).toHaveBeenCalled();
    expect(registryGetModuleMock('pos')).toBe(second);
  });
});
