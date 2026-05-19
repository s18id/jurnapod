import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const REVIEW_PANEL_DRAFT_SCHEMA_VERSION = "review-panel-draft-v1";
export const REVIEW_PANEL_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const REVIEW_PANEL_AUTOSAVE_DEBOUNCE_MS = 30 * 1000;

export type AutosaveWarningCode = "disabled" | "expired" | "malformed" | "mismatch" | "quota" | "serialization";

export interface AutosaveWarning {
  code: AutosaveWarningCode;
  message: string;
}

export interface DraftScope {
  companyId: string | number;
  userId: string | number;
  outletId?: string | number;
  formType: string;
  entityId?: string | number;
  draftId?: string;
}

export interface DraftMetadata extends DraftScope {
  schemaVersion: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredDraft<TPayload> {
  metadata: DraftMetadata;
  payload: TPayload;
}

export interface StorageLike {
  length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface UseFormAutosaveOptions<TPayload> {
  enabled?: boolean;
  scope: DraftScope;
  value: TPayload;
  schemaVersion?: string;
  ttlMs?: number;
  debounceMs?: number;
  storage?: StorageLike;
  nowMs?: () => number;
  onRestore?: (draft: StoredDraft<TPayload>) => void;
  onWarning?: (warning: AutosaveWarning) => void;
}

export interface UseFormAutosaveResult<TPayload> {
  draftKey: string;
  warning?: AutosaveWarning;
  lastSavedAt?: number;
  restoredDraft?: StoredDraft<TPayload>;
  saveNow: () => boolean;
  discardDraft: () => void;
  clearDraftsForContext: (scope?: Partial<DraftScope>) => void;
  restoreDraft: () => StoredDraft<TPayload> | undefined;
}

const DRAFT_KEY_PREFIX = "jp:draft:v1";
const FORBIDDEN_KEY_PATTERN = /(password|secret|token|credential|attachment|attachments|file|files)/i;

export function getClientDraftEpochMs(): number {
  const clock = globalThis.performance;
  if (clock && Number.isFinite(clock.timeOrigin)) {
    return Math.trunc(clock.timeOrigin + clock.now());
  }
  throw new Error("Client draft timestamp clock is unavailable.");
}

function encodeDraftKeySegment(value: string | number): string {
  return encodeURIComponent(String(value));
}

function scopeValue(value: string | number | undefined, fallback = "global"): string {
  return value === undefined || value === "" ? fallback : String(value);
}

export function makeDraftStorageKey(scope: DraftScope): string {
  const entityOrDraft = scope.entityId !== undefined ? String(scope.entityId) : scope.draftId;
  if (!entityOrDraft) {
    throw new Error("Draft scope requires entityId or draftId.");
  }
  return [
    DRAFT_KEY_PREFIX,
    ...[
      scope.companyId,
      scope.userId,
      scopeValue(scope.outletId),
      scope.formType,
      entityOrDraft,
    ].map((segment) => encodeDraftKeySegment(segment)),
  ].join(":");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeDraftPayload<TPayload>(payload: TPayload, seen = new WeakSet<object>()): TPayload {
  if (payload === null || payload === undefined) return payload;
  if (["string", "number", "boolean"].includes(typeof payload)) return payload;
  if (typeof payload === "function" || typeof payload === "symbol" || typeof payload === "bigint") {
    return undefined as TPayload;
  }
  if (typeof payload !== "object") return payload;
  if (seen.has(payload as object)) {
    throw new Error("Draft payload cannot contain circular references.");
  }
  seen.add(payload as object);
  if (Array.isArray(payload)) {
    const result = payload.map((item) => sanitizeDraftPayload(item, seen)).filter((item) => item !== undefined);
    seen.delete(payload as object);
    return result as TPayload;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) continue;
    const sanitized = sanitizeDraftPayload(value, seen);
    if (sanitized !== undefined) result[key] = sanitized;
  }
  seen.delete(payload as object);
  return result as TPayload;
}

export function createStoredDraft<TPayload>(params: {
  scope: DraftScope;
  payload: TPayload;
  schemaVersion?: string;
  nowMs: number;
  previous?: StoredDraft<TPayload>;
}): StoredDraft<TPayload> {
  const createdAt = params.previous?.metadata.createdAt ?? params.nowMs;
  return {
    metadata: {
      ...params.scope,
      schemaVersion: params.schemaVersion ?? REVIEW_PANEL_DRAFT_SCHEMA_VERSION,
      createdAt,
      updatedAt: params.nowMs,
    },
    payload: sanitizeDraftPayload(params.payload),
  };
}

function scopesMatch(stored: DraftMetadata, expected: DraftScope, schemaVersion: string): boolean {
  return String(stored.companyId) === String(expected.companyId)
    && String(stored.userId) === String(expected.userId)
    && scopeValue(stored.outletId) === scopeValue(expected.outletId)
    && stored.formType === expected.formType
    && String(stored.entityId ?? "") === String(expected.entityId ?? "")
    && String(stored.draftId ?? "") === String(expected.draftId ?? "")
    && stored.schemaVersion === schemaVersion;
}

export function parseStoredDraft<TPayload>(raw: string, params: {
  scope: DraftScope;
  schemaVersion?: string;
  nowMs: number;
  ttlMs?: number;
}): { draft?: StoredDraft<TPayload>; warning?: AutosaveWarning } {
  try {
    const parsed = JSON.parse(raw) as StoredDraft<TPayload>;
    if (!isObject(parsed) || !isObject(parsed.metadata) || !("payload" in parsed)) {
      return { warning: { code: "malformed", message: "Draft data is malformed and was ignored." } };
    }
    const schemaVersion = params.schemaVersion ?? REVIEW_PANEL_DRAFT_SCHEMA_VERSION;
    if (!scopesMatch(parsed.metadata, params.scope, schemaVersion)) {
      return { warning: { code: "mismatch", message: "Draft belongs to a different user, company, outlet, form, or schema." } };
    }
    const ttlMs = params.ttlMs ?? REVIEW_PANEL_DRAFT_TTL_MS;
    if (params.nowMs - Number(parsed.metadata.updatedAt) > ttlMs) {
      return { warning: { code: "expired", message: "Draft expired and was ignored." } };
    }
    return { draft: parsed };
  } catch {
    return { warning: { code: "malformed", message: "Draft data is malformed and was ignored." } };
  }
}

function getStorage(storage?: StorageLike): StorageLike | undefined {
  if (storage) return storage;
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

function isQuotaError(error: unknown): boolean {
  return isObject(error)
    && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
}

export function cleanupExpiredDrafts(storage: StorageLike, nowMs: number, ttlMs = REVIEW_PANEL_DRAFT_TTL_MS): number {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(DRAFT_KEY_PREFIX)) keys.push(key);
  }
  let removed = 0;
  for (const key of keys) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as StoredDraft<unknown>;
      if (!parsed.metadata?.updatedAt || nowMs - Number(parsed.metadata.updatedAt) > ttlMs) {
        storage.removeItem(key);
        removed += 1;
      }
    } catch {
      storage.removeItem(key);
      removed += 1;
    }
  }
  return removed;
}

export function cleanupDraftsForScope(storage: StorageLike, scope: Partial<DraftScope>): number {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(DRAFT_KEY_PREFIX)) keys.push(key);
  }
  let removed = 0;
  for (const key of keys) {
    const parts = key.split(":");
    const matches = (scope.companyId === undefined || parts[3] === encodeDraftKeySegment(scope.companyId))
      && (scope.userId === undefined || parts[4] === encodeDraftKeySegment(scope.userId))
      && (scope.outletId === undefined || parts[5] === encodeDraftKeySegment(scopeValue(scope.outletId)))
      && (scope.formType === undefined || parts[6] === encodeDraftKeySegment(scope.formType))
      && (scope.entityId === undefined || parts[7] === encodeDraftKeySegment(scope.entityId))
      && (scope.draftId === undefined || parts[7] === encodeDraftKeySegment(scope.draftId));
    if (matches) {
      storage.removeItem(key);
      removed += 1;
    }
  }
  return removed;
}

export function saveDraft<TPayload>(storage: StorageLike, key: string, draft: StoredDraft<TPayload>, nowMs: number, ttlMs?: number): AutosaveWarning | undefined {
  try {
    storage.setItem(key, JSON.stringify(draft));
    return undefined;
  } catch (error) {
    if (isQuotaError(error)) {
      cleanupExpiredDrafts(storage, nowMs, ttlMs);
      try {
        storage.setItem(key, JSON.stringify(draft));
        return undefined;
      } catch {
        return { code: "quota", message: "Draft autosave storage is full. Submit remains available." };
      }
    }
    return { code: "disabled", message: "Draft autosave is unavailable. Submit remains available." };
  }
}

export function resolveStorageConflict<TPayload>(current: StoredDraft<TPayload> | undefined, incoming: StoredDraft<TPayload>): "accept-incoming" | "keep-current" {
  if (!current) return "accept-incoming";
  return incoming.metadata.updatedAt > current.metadata.updatedAt ? "accept-incoming" : "keep-current";
}

export function useFormAutosave<TPayload>(options: UseFormAutosaveOptions<TPayload>): UseFormAutosaveResult<TPayload> {
  const enabled = options.enabled ?? true;
  const storage = getStorage(options.storage);
  const now = options.nowMs ?? getClientDraftEpochMs;
  const schemaVersion = options.schemaVersion ?? REVIEW_PANEL_DRAFT_SCHEMA_VERSION;
  const ttlMs = options.ttlMs ?? REVIEW_PANEL_DRAFT_TTL_MS;
  const debounceMs = options.debounceMs ?? REVIEW_PANEL_AUTOSAVE_DEBOUNCE_MS;
  const draftKey = useMemo(() => makeDraftStorageKey(options.scope), [options.scope]);
  const valueRef = useRef(options.value);
  const restoredRef = useRef<StoredDraft<TPayload> | undefined>(undefined);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [warning, setWarning] = useState<AutosaveWarning | undefined>(undefined);
  const [lastSavedAt, setLastSavedAt] = useState<number | undefined>(undefined);
  const [restoredDraft, setRestoredDraft] = useState<StoredDraft<TPayload> | undefined>(undefined);

  useEffect(() => {
    valueRef.current = options.value;
  }, [options.value]);

  const publishWarning = useCallback((nextWarning: AutosaveWarning | undefined) => {
    setWarning(nextWarning);
    if (nextWarning) options.onWarning?.(nextWarning);
  }, [options]);

  const restoreDraft = useCallback(() => {
    if (!enabled || !storage) {
      publishWarning({ code: "disabled", message: "Draft autosave is unavailable. Submit remains available." });
      return undefined;
    }
    const raw = storage.getItem(draftKey);
    if (!raw) return undefined;
    const result = parseStoredDraft<TPayload>(raw, { scope: options.scope, schemaVersion, nowMs: now(), ttlMs });
    if (result.warning) {
      publishWarning(result.warning);
      if (result.warning.code === "expired" || result.warning.code === "malformed") storage.removeItem(draftKey);
      return undefined;
    }
    restoredRef.current = result.draft;
    setRestoredDraft(result.draft);
    if (result.draft) options.onRestore?.(result.draft);
    return result.draft;
  }, [draftKey, enabled, now, options, publishWarning, schemaVersion, storage, ttlMs]);

  const saveNow = useCallback(() => {
    if (!enabled) return true;
    if (!storage) {
      publishWarning({ code: "disabled", message: "Draft autosave is unavailable. Submit remains available." });
      return false;
    }
    try {
      const nowMs = now();
      const draft = createStoredDraft({ scope: options.scope, payload: valueRef.current, schemaVersion, nowMs, previous: restoredRef.current });
      const nextWarning = saveDraft(storage, draftKey, draft, nowMs, ttlMs);
      publishWarning(nextWarning);
      if (!nextWarning) {
        restoredRef.current = draft;
        setRestoredDraft(draft);
        setLastSavedAt(nowMs);
      }
      return !nextWarning;
    } catch {
      publishWarning({ code: "serialization", message: "Draft could not be serialized. Submit remains available." });
      return false;
    }
  }, [draftKey, enabled, now, options.scope, publishWarning, schemaVersion, storage, ttlMs]);

  const discardDraft = useCallback(() => {
    storage?.removeItem(draftKey);
    restoredRef.current = undefined;
    setRestoredDraft(undefined);
  }, [draftKey, storage]);

  const clearDraftsForContext = useCallback((scope?: Partial<DraftScope>) => {
    if (storage) cleanupDraftsForScope(storage, scope ?? options.scope);
  }, [options.scope, storage]);

  useEffect(() => {
    const timer = setTimeout(() => { restoreDraft(); }, 0);
    return () => { clearTimeout(timer); };
  }, [restoreDraft]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = undefined;
      saveNow();
    }, debounceMs);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [debounceMs, enabled, options.value, saveNow]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    const handleBeforeUnload = () => { saveNow(); };
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== draftKey || !event.newValue) return;
      const result = parseStoredDraft<TPayload>(event.newValue, { scope: options.scope, schemaVersion, nowMs: now(), ttlMs });
      if (result.draft && resolveStorageConflict(restoredRef.current, result.draft) === "accept-incoming") {
        restoredRef.current = result.draft;
        setRestoredDraft(result.draft);
        options.onRestore?.(result.draft);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("storage", handleStorage);
    };
  }, [draftKey, enabled, now, options, saveNow, schemaVersion, ttlMs]);

  return {
    draftKey,
    warning,
    lastSavedAt,
    restoredDraft,
    saveNow,
    discardDraft,
    clearDraftsForContext,
    restoreDraft,
  };
}
