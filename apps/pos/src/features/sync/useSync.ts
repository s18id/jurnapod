// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useCallback, useState } from "react";
import { POLL_INTERVAL_MS } from "../../shared/utils/constants.js";
import type { RuntimeOutletScope } from "../../services/runtime-service.js";

export interface UseSyncOptions {
  scope: RuntimeOutletScope;
  orchestrator: {
    executePull: (scope: RuntimeOutletScope) => Promise<{
      success: boolean;
      data_version: number;
      upserted_product_count: number;
      message?: string;
    }>;
    requestPush: (trigger: "AUTO_REFRESH" | "MANUAL_PUSH") => Promise<void>;
    isPushInFlight: () => boolean;
    updateConfig: (config: { apiOrigin: string; accessToken?: string }) => void;
    initialize: () => void;
    dispose: () => void;
  };
}

export interface UseSyncReturn {
  pullInFlight: boolean;
  pushInFlight: boolean;
  pullMessage: string | null;
  pushMessage: string | null;
  lastDataVersion: number;
  runPullSync: () => Promise<void>;
  runPushSync: () => Promise<void>;
}

export function useSync({ scope, orchestrator }: UseSyncOptions): UseSyncReturn {
  const [pullInFlight, setPullInFlight] = useState(false);
  const [pushInFlight, setPushInFlight] = useState(false);
  const [pullMessage, setPullMessage] = useState<string | null>(null);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [lastDataVersion, setLastDataVersion] = useState(0);

  const runPullSync = useCallback(async () => {
    if (pullInFlight) {
      return;
    }

    setPullInFlight(true);
    setPullMessage(null);

    try {
      const result = await orchestrator.executePull(scope);
      if (result.success) {
        setPullMessage(
          `Sync pull applied (version ${result.data_version}, ${result.upserted_product_count} cached rows).`
        );
        setLastDataVersion(result.data_version);
      } else {
        setPullMessage(result.message ?? null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setPullMessage(`Sync pull failed: ${message}`);
    } finally {
      setPullInFlight(false);
    }
  }, [orchestrator, pullInFlight, scope]);

  const runPushSync = useCallback(async () => {
    if (pushInFlight) {
      return;
    }
    setPushMessage("Sync push requested...");
    try {
      await orchestrator.requestPush("MANUAL_PUSH");
      setPushMessage("Sync push completed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setPushMessage(`Sync push failed: ${message}`);
    } finally {
      setPushInFlight(false);
    }
  }, [orchestrator, pushInFlight]);

  return {
    pullInFlight,
    pushInFlight,
    pullMessage,
    pushMessage,
    lastDataVersion,
    runPullSync,
    runPushSync
  };
}
