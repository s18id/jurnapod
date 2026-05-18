// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";

import { ApiError, apiRequest, getApiBaseUrl, getStoredAccessToken } from "@/lib/api-client";

export const OPERATION_POLL_INTERVAL_MS = 5_000;
export const SSE_FALLBACK_DELAY_MS = 5_000;

export const OPERATION_STATUSES = ["running", "completed", "failed", "cancelled"] as const;
export const TERMINAL_OPERATION_STATUSES = ["completed", "failed", "cancelled"] as const;

export type OperationStatus = (typeof OPERATION_STATUSES)[number];
export type TerminalOperationStatus = (typeof TERMINAL_OPERATION_STATUSES)[number];
export type OperationTransport = "idle" | "polling" | "sse";

export type OperationProgressDetails = Record<string, unknown>;

export interface OperationProgress {
  operationId: string;
  total: number;
  completed: number;
  percentage: number;
  status: OperationStatus;
  etaSeconds: number | null;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  details?: OperationProgressDetails;
}

type OperationProgressEnvelope = {
  success: true;
  data: OperationProgress;
};

export interface OperationProgressError {
  status?: number;
  code: string;
  message: string;
}

export interface OperationProgressState {
  operationId: string | null;
  progress: OperationProgress | null;
  loading: boolean;
  error: OperationProgressError | null;
  transport: OperationTransport;
}

const IDLE_OPERATION_PROGRESS_STATE: OperationProgressState = {
  operationId: null,
  progress: null,
  loading: false,
  error: null,
  transport: "idle",
};

function loadingOperationProgressState(operationId: string): OperationProgressState {
  return {
    operationId,
    progress: null,
    loading: true,
    error: null,
    transport: "polling",
  };
}

export function selectOperationProgressStateForOperation(
  operationId: string | null,
  disabled: boolean,
  state: OperationProgressState,
): OperationProgressState {
  if (disabled || !operationId) {
    return IDLE_OPERATION_PROGRESS_STATE;
  }

  if (state.operationId !== operationId) {
    return loadingOperationProgressState(operationId);
  }

  if (state.progress && state.progress.operationId !== operationId) {
    return loadingOperationProgressState(operationId);
  }

  return state;
}

export type FetchOperationProgress = (operationId: string) => Promise<OperationProgress>;

export type StreamOperationProgress = (
  operationId: string,
  onProgress: (progress: OperationProgress) => void,
  signal: AbortSignal,
) => Promise<void>;

export interface OperationProgressControllerOptions {
  operationId: string;
  fetchProgress: FetchOperationProgress;
  onState: (state: OperationProgressState) => void;
  pollingIntervalMs?: number;
  enableSse?: boolean;
  streamProgress?: StreamOperationProgress;
  sseFallbackDelayMs?: number;
}

export interface UseOperationProgressOptions {
  enabled?: boolean;
  pollingIntervalMs?: number;
  enableSse?: boolean;
  sseFallbackDelayMs?: number;
  fetchProgress?: FetchOperationProgress;
  streamProgress?: StreamOperationProgress;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOperationStatus(value: unknown): value is OperationStatus {
  return typeof value === "string" && (OPERATION_STATUSES as readonly string[]).includes(value);
}

export function isTerminalOperationStatus(status: OperationStatus): status is TerminalOperationStatus {
  return (TERMINAL_OPERATION_STATUSES as readonly string[]).includes(status);
}

export function buildOperationProgressPath(operationId: string): string {
  return `/operations/${encodeURIComponent(operationId)}/progress`;
}

export function parseOperationProgress(value: unknown): OperationProgress | null {
  if (!isRecord(value) || !isOperationStatus(value.status) || typeof value.operationId !== "string") {
    return null;
  }

  if (
    typeof value.total !== "number" ||
    typeof value.completed !== "number" ||
    typeof value.percentage !== "number" ||
    (value.etaSeconds !== null && typeof value.etaSeconds !== "number") ||
    typeof value.startedAt !== "string" ||
    typeof value.updatedAt !== "string" ||
    (value.completedAt !== null && typeof value.completedAt !== "string")
  ) {
    return null;
  }

  return {
    operationId: value.operationId,
    total: value.total,
    completed: value.completed,
    percentage: value.percentage,
    status: value.status,
    etaSeconds: value.etaSeconds,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    completedAt: value.completedAt,
    details: isRecord(value.details) ? value.details : undefined,
  };
}

export function toOperationProgressError(error: unknown): OperationProgressError {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      code: "PROGRESS_ERROR",
      message: error.message,
    };
  }

  return {
    code: "PROGRESS_ERROR",
    message: "Unable to update progress",
  };
}

export async function fetchOperationProgress(operationId: string): Promise<OperationProgress> {
  const response = await apiRequest<OperationProgressEnvelope>(buildOperationProgressPath(operationId));
  const progress = parseOperationProgress(response.data);
  if (!progress || progress.operationId !== operationId) {
    throw new ApiError(502, "INVALID_PROGRESS_RESPONSE", "Invalid operation progress response");
  }
  return progress;
}

function readSseFrames(buffer: string): { frames: string[]; remainder: string } {
  const frames: string[] = [];
  let remainder = buffer;
  let frameEnd = remainder.indexOf("\n\n");

  while (frameEnd !== -1) {
    frames.push(remainder.slice(0, frameEnd));
    remainder = remainder.slice(frameEnd + 2);
    frameEnd = remainder.indexOf("\n\n");
  }

  return { frames, remainder };
}

function parseSseDataFrame(frame: string): unknown | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");

  if (!data) {
    return null;
  }

  return JSON.parse(data) as unknown;
}

export async function streamOperationProgress(
  operationId: string,
  onProgress: (progress: OperationProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  const headers = new Headers({ accept: "text/event-stream" });
  const token = getStoredAccessToken();
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${getApiBaseUrl()}${buildOperationProgressPath(operationId)}`, {
    headers,
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    throw new ApiError(response.status, "SSE_HTTP_ERROR", `SSE request failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error("SSE response body is unavailable");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (!signal.aborted) {
    const { done, value } = await reader.read();
    if (done) {
      return;
    }

    buffer += decoder.decode(value, { stream: true });
    const parsed = readSseFrames(buffer);
    buffer = parsed.remainder;

    for (const frame of parsed.frames) {
      const eventPayload = parseSseDataFrame(frame);
      if (!eventPayload) continue;

      if (isRecord(eventPayload) && eventPayload.type === "operation_deleted") {
        throw new ApiError(404, "NOT_FOUND", "Operation not found");
      }

      const progress = parseOperationProgress(eventPayload);
      if (progress) {
        onProgress(progress);
        if (isTerminalOperationStatus(progress.status)) {
          return;
        }
      }
    }
  }
}

export class OperationProgressController {
  private readonly operationId: string;
  private readonly fetchProgress: FetchOperationProgress;
  private readonly onState: (state: OperationProgressState) => void;
  private readonly pollingIntervalMs: number;
  private readonly enableSse: boolean;
  private readonly streamProgress?: StreamOperationProgress;
  private readonly sseFallbackDelayMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private streamAbortController: AbortController | null = null;
  private stopped = true;
  private state: OperationProgressState = {
    operationId: null,
    progress: null,
    loading: false,
    error: null,
    transport: "idle",
  };

  constructor(options: OperationProgressControllerOptions) {
    this.operationId = options.operationId;
    this.fetchProgress = options.fetchProgress;
    this.onState = options.onState;
    this.pollingIntervalMs = options.pollingIntervalMs ?? OPERATION_POLL_INTERVAL_MS;
    this.enableSse = options.enableSse ?? false;
    this.streamProgress = options.streamProgress;
    this.sseFallbackDelayMs = options.sseFallbackDelayMs ?? SSE_FALLBACK_DELAY_MS;
  }

  start(): void {
    this.stopped = false;
    this.updateState(loadingOperationProgressState(this.operationId));
    void this.pollOnce({ startSseAfterSuccess: this.enableSse });
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.streamAbortController) {
      this.streamAbortController.abort();
      this.streamAbortController = null;
    }
  }

  private updateState(patch: Partial<OperationProgressState>): void {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }

  private async pollOnce(options: { startSseAfterSuccess?: boolean } = {}): Promise<void> {
    if (this.stopped) return;
    this.updateState({ loading: true, transport: "polling" });

    try {
      const progress = await this.fetchProgress(this.operationId);
      if (this.stopped) return;

      this.updateState({ progress, loading: false, error: null, transport: "polling" });
      if (isTerminalOperationStatus(progress.status)) {
        this.stop();
        return;
      }

      if (options.startSseAfterSuccess && this.streamProgress) {
        this.startStream();
        return;
      }

      this.schedulePolling(this.pollingIntervalMs);
    } catch (error) {
      if (this.stopped) return;
      this.updateState({ loading: false, error: toOperationProgressError(error), transport: "polling" });
      this.schedulePolling(this.pollingIntervalMs);
    }
  }

  private startStream(): void {
    if (!this.streamProgress || this.stopped) {
      this.schedulePolling(this.pollingIntervalMs);
      return;
    }

    const abortController = new AbortController();
    this.streamAbortController = abortController;
    this.updateState({ loading: false, error: null, transport: "sse" });

    void this.streamProgress(
      this.operationId,
      (progress) => {
        if (this.stopped) return;
        this.updateState({ progress, loading: false, error: null, transport: "sse" });
        if (isTerminalOperationStatus(progress.status)) {
          this.stop();
        }
      },
      abortController.signal,
    ).then(() => {
      if (this.stopped) return;
      this.streamAbortController = null;
      if (this.state.progress && isTerminalOperationStatus(this.state.progress.status)) {
        this.stop();
        return;
      }
      this.schedulePolling(this.pollingIntervalMs);
    }).catch((error: unknown) => {
      if (this.stopped || abortController.signal.aborted) return;
      this.streamAbortController = null;
      this.updateState({ loading: false, error: toOperationProgressError(error), transport: "polling" });
      this.schedulePolling(this.sseFallbackDelayMs);
    });
  }

  private schedulePolling(delayMs: number): void {
    if (this.stopped) return;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pollOnce();
    }, delayMs);
  }
}

export function useOperationProgress(
  operationId: string | null,
  options: UseOperationProgressOptions = {},
): OperationProgressState {
  const disabled = !operationId || options.enabled === false;
  const [state, setState] = useState<OperationProgressState>(IDLE_OPERATION_PROGRESS_STATE);

  const controllerOptions = useMemo(() => ({
    pollingIntervalMs: options.pollingIntervalMs,
    enableSse: options.enableSse,
    sseFallbackDelayMs: options.sseFallbackDelayMs,
    fetchProgress: options.fetchProgress ?? fetchOperationProgress,
    streamProgress: options.streamProgress ?? streamOperationProgress,
  }), [
    options.pollingIntervalMs,
    options.enableSse,
    options.sseFallbackDelayMs,
    options.fetchProgress,
    options.streamProgress,
  ]);

  useEffect(() => {
    if (disabled) {
      const resetTimer = setTimeout(() => setState(IDLE_OPERATION_PROGRESS_STATE), 0);
      return () => clearTimeout(resetTimer);
    }

    const controller = new OperationProgressController({
      operationId,
      onState: setState,
      ...controllerOptions,
    });
    controller.start();

    return () => {
      controller.stop();
    };
  }, [operationId, disabled, controllerOptions]);

  if (disabled) {
    return IDLE_OPERATION_PROGRESS_STATE;
  }

  return selectOperationProgressStateForOperation(operationId, disabled, state);
}
