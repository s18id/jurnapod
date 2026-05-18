import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiClientMock = vi.hoisted(() => {
  class ApiError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string, message: string) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
    }
  }

  return {
    ApiError,
    apiRequest: vi.fn(),
    getApiBaseUrl: vi.fn(() => "/api"),
    getStoredAccessToken: vi.fn(() => null),
  };
});

vi.mock("@/lib/api-client", () => apiClientMock);

import {
  OperationProgressController,
  buildOperationProgressPath,
  fetchOperationProgress,
  isTerminalOperationStatus,
  parseOperationProgress,
  selectOperationProgressStateForOperation,
  type OperationProgress,
  type OperationProgressState,
} from "@/hooks/use-operation-progress";

function makeProgress(overrides: Partial<OperationProgress> = {}): OperationProgress {
  return {
    operationId: "op-68-1",
    total: 10,
    completed: 1,
    percentage: 10,
    status: "running",
    etaSeconds: 5,
    startedAt: "2026-05-19T00:00:00.000Z",
    updatedAt: "2026-05-19T00:00:01.000Z",
    completedAt: null,
    details: {},
    ...overrides,
  };
}

beforeEach(() => {
  apiClientMock.apiRequest.mockReset();
  apiClientMock.getApiBaseUrl.mockReturnValue("/api");
  apiClientMock.getStoredAccessToken.mockReturnValue(null);
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("operation progress contract helpers", () => {
  it("uses the canonical progress endpoint without a double /api prefix", () => {
    expect(buildOperationProgressPath("op-68-1")).toBe("/operations/op-68-1/progress");
  });

  it("parses actual Story 68-0 fields and rejects unsupported statuses", () => {
    expect(parseOperationProgress(makeProgress({ status: "completed", completedAt: "2026-05-19T00:00:02.000Z" }))?.status).toBe("completed");
    expect(parseOperationProgress({ ...makeProgress(), status: "queued" })).toBeNull();
  });

  it("rejects malformed API payloads before they enter drawer state", async () => {
    apiClientMock.apiRequest.mockResolvedValueOnce({
      success: true,
      data: { ...makeProgress(), status: "queued" },
    });

    await expect(fetchOperationProgress("op-68-1")).rejects.toMatchObject({
      code: "INVALID_PROGRESS_RESPONSE",
    });
  });

  it("rejects API payloads for a different operation id", async () => {
    apiClientMock.apiRequest.mockResolvedValueOnce({
      success: true,
      data: makeProgress({ operationId: "other-op" }),
    });

    await expect(fetchOperationProgress("op-68-1")).rejects.toMatchObject({
      code: "INVALID_PROGRESS_RESPONSE",
    });
  });

  it("does not expose stale progress when the selected operation changes", () => {
    const staleState: OperationProgressState = {
      operationId: "old-op",
      progress: makeProgress({ operationId: "old-op" }),
      loading: false,
      error: null,
      transport: "polling",
    };

    expect(selectOperationProgressStateForOperation("new-op", false, staleState)).toMatchObject({
      operationId: "new-op",
      progress: null,
      loading: true,
      error: null,
      transport: "polling",
    });
  });

  it("preserves same-operation error state when no progress is available", () => {
    const errorState: OperationProgressState = {
      operationId: "op-68-1",
      progress: null,
      loading: false,
      error: { status: 404, code: "NOT_FOUND", message: "Operation not found" },
      transport: "polling",
    };

    expect(selectOperationProgressStateForOperation("op-68-1", false, errorState)).toBe(errorState);
  });

  it("recognizes only completed, failed, and cancelled as terminal statuses", () => {
    expect(isTerminalOperationStatus("running")).toBe(false);
    expect(isTerminalOperationStatus("completed")).toBe(true);
    expect(isTerminalOperationStatus("failed")).toBe(true);
    expect(isTerminalOperationStatus("cancelled")).toBe(true);
  });
});

describe("OperationProgressController polling", () => {
  it("polls immediately, schedules running jobs, and cleans up timers on stop", async () => {
    vi.useFakeTimers();
    const states: OperationProgressState[] = [];
    const fetchProgress = vi.fn<() => Promise<OperationProgress>>().mockResolvedValue(makeProgress());
    const controller = new OperationProgressController({
      operationId: "op-68-1",
      fetchProgress,
      pollingIntervalMs: 100,
      onState: (state) => states.push(state),
    });

    controller.start();
    await flushPromises();
    expect(fetchProgress).toHaveBeenCalledTimes(1);
    expect(states.at(-1)?.progress?.status).toBe("running");

    controller.stop();
    await vi.advanceTimersByTimeAsync(100);
    expect(fetchProgress).toHaveBeenCalledTimes(1);
  });

  it("clears stale progress immediately when a new controller starts", async () => {
    vi.useFakeTimers();
    const states: OperationProgressState[] = [];
    const fetchProgress = vi.fn<() => Promise<OperationProgress>>().mockResolvedValue(makeProgress({ operationId: "new-op" }));
    const controller = new OperationProgressController({
      operationId: "new-op",
      fetchProgress,
      pollingIntervalMs: 100,
      onState: (state) => states.push(state),
    });

    controller.start();

    expect(states[0]).toMatchObject({
      progress: null,
      loading: true,
      transport: "polling",
    });

    await flushPromises();
    controller.stop();
  });

  it("stops polling when a terminal status is fetched", async () => {
    vi.useFakeTimers();
    const fetchProgress = vi.fn<() => Promise<OperationProgress>>()
      .mockResolvedValueOnce(makeProgress())
      .mockResolvedValueOnce(makeProgress({
        completed: 10,
        percentage: 100,
        status: "completed",
        etaSeconds: 0,
        completedAt: "2026-05-19T00:00:02.000Z",
      }));
    const states: OperationProgressState[] = [];
    const controller = new OperationProgressController({
      operationId: "op-68-1",
      fetchProgress,
      pollingIntervalMs: 100,
      onState: (state) => states.push(state),
    });

    controller.start();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(100);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(500);

    expect(fetchProgress).toHaveBeenCalledTimes(2);
    expect(states.at(-1)?.progress?.status).toBe("completed");
  });

  it("reopening creates a fresh controller and fetches latest state", async () => {
    vi.useFakeTimers();
    const fetchProgress = vi.fn<() => Promise<OperationProgress>>().mockResolvedValue(makeProgress());

    const first = new OperationProgressController({
      operationId: "op-68-1",
      fetchProgress,
      pollingIntervalMs: 100,
      onState: () => undefined,
    });
    first.start();
    await flushPromises();
    first.stop();

    const second = new OperationProgressController({
      operationId: "op-68-1",
      fetchProgress,
      pollingIntervalMs: 100,
      onState: () => undefined,
    });
    second.start();
    await flushPromises();
    second.stop();

    expect(fetchProgress).toHaveBeenCalledTimes(2);
  });
});

describe("OperationProgressController SSE fallback", () => {
  it("starts with polling and falls back to polling when fetch-stream SSE fails", async () => {
    vi.useFakeTimers();
    const fetchProgress = vi.fn<() => Promise<OperationProgress>>().mockResolvedValue(makeProgress());
    const streamProgress = vi.fn().mockRejectedValue(new Error("SSE failed"));
    const states: OperationProgressState[] = [];
    const controller = new OperationProgressController({
      operationId: "op-68-1",
      fetchProgress,
      streamProgress,
      enableSse: true,
      pollingIntervalMs: 100,
      sseFallbackDelayMs: 50,
      onState: (state) => states.push(state),
    });

    controller.start();
    await flushPromises();

    expect(fetchProgress).toHaveBeenCalledTimes(1);
    expect(streamProgress).toHaveBeenCalledTimes(1);
    expect(states.some((state) => state.transport === "sse")).toBe(true);

    await flushPromises();
    expect(states.at(-1)?.transport).toBe("polling");
    await vi.advanceTimersByTimeAsync(50);
    await flushPromises();

    expect(fetchProgress).toHaveBeenCalledTimes(2);
    controller.stop();
  });
});
