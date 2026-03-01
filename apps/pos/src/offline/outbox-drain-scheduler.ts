// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

export interface OutboxDrainRunContext {
  reasons: string[];
  run_count: number;
}

export interface OutboxDrainSchedulerInput {
  drain: (context: OutboxDrainRunContext) => Promise<void> | void;
  on_error?: (error: unknown, context: OutboxDrainRunContext) => void;
}

export interface OutboxDrainSchedulerSnapshot {
  in_flight: boolean;
  pending_reason_count: number;
  run_count: number;
}

export interface OutboxDrainScheduler {
  requestDrain: (reason: string) => Promise<void>;
  snapshot: () => OutboxDrainSchedulerSnapshot;
  dispose: () => void;
}

export function createOutboxDrainScheduler(input: OutboxDrainSchedulerInput): OutboxDrainScheduler {
  const pendingReasons = new Set<string>();
  let activePromise: Promise<void> | null = null;
  let disposed = false;
  let runCount = 0;

  const execute = async () => {
    while (!disposed && pendingReasons.size > 0) {
      const reasons = Array.from(pendingReasons);
      pendingReasons.clear();
      runCount += 1;
      const context: OutboxDrainRunContext = {
        reasons,
        run_count: runCount
      };

      try {
        await input.drain(context);
      } catch (error) {
        if (typeof input.on_error === "function") {
          input.on_error(error, context);
          continue;
        }

        throw error;
      }
    }
  };

  const ensureRunLoop = () => {
    if (activePromise) {
      return activePromise;
    }

    activePromise = execute().finally(() => {
      activePromise = null;
      if (!disposed && pendingReasons.size > 0) {
        void ensureRunLoop();
      }
    });

    return activePromise;
  };

  return {
    requestDrain(reason: string): Promise<void> {
      if (disposed) {
        return Promise.resolve();
      }

      pendingReasons.add(reason.trim().length > 0 ? reason.trim() : "UNKNOWN");
      return ensureRunLoop();
    },
    snapshot(): OutboxDrainSchedulerSnapshot {
      return {
        in_flight: activePromise !== null,
        pending_reason_count: pendingReasons.size,
        run_count: runCount
      };
    },
    dispose(): void {
      disposed = true;
      pendingReasons.clear();
    }
  };
}
