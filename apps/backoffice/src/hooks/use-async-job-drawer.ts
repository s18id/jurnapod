// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface OpenAsyncJobDrawerInput {
  operationId: string;
  operationType?: string;
}

export interface AsyncJobDrawerState {
  opened: boolean;
  operationId: string | null;
  operationType: string | null;
}

export interface AsyncJobDrawerContextValue extends AsyncJobDrawerState {
  open: (input: OpenAsyncJobDrawerInput | string) => void;
  close: () => void;
}

const AsyncJobDrawerContext = createContext<AsyncJobDrawerContextValue | null>(null);

export function AsyncJobDrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AsyncJobDrawerState>({
    opened: false,
    operationId: null,
    operationType: null,
  });

  const open = useCallback((input: OpenAsyncJobDrawerInput | string) => {
    const operationId = typeof input === "string" ? input : input.operationId;
    const operationType = typeof input === "string" ? null : input.operationType ?? null;
    setState({ opened: true, operationId, operationType });
  }, []);

  const close = useCallback(() => {
    setState((current) => ({ ...current, opened: false }));
  }, []);

  const value = useMemo<AsyncJobDrawerContextValue>(() => ({
    ...state,
    open,
    close,
  }), [state, open, close]);

  return createElement(AsyncJobDrawerContext.Provider, { value }, children);
}

export function useAsyncJobDrawer(): AsyncJobDrawerContextValue {
  const context = useContext(AsyncJobDrawerContext);
  if (!context) {
    throw new Error("useAsyncJobDrawer must be used within AsyncJobDrawerProvider");
  }
  return context;
}
