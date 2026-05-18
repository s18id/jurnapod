// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useCallback, useEffect, useRef } from "react";
import { apiRequest, apiStreamingRequest, uploadWithProgress, applyWithProgress } from "../lib/api-client";

// ============================================================================
// Types
// ============================================================================

export type ImportEntityType = "items" | "prices";

export interface UploadResponse {
  uploadId: string;
  filename: string;
  rowCount: number;
  columns: string[];
  sampleData: string[][];
  fileHash?: string;
  parseErrors?: Array<{ row?: number; message: string }>;
}

export interface ColumnMapping {
  sourceColumn: string;
  targetField: string;
  sampleValues: string[];
}

export interface ValidationError {
  row: number;
  column: string;
  message: string;
  value: string;
}

export interface ValidationResult {
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: ValidationError[];
  validRowIndices: number[];
  errorRowIndices: number[];
}

export interface ApplyProgress {
  current: number;
  total: number;
  currentRow: number;
  percentage: number;
  mode?: "bytes" | "rows";
}

export interface ApplyResult {
  success: number;
  failed: number;
  created: number;
  updated: number;
  skipped: number;
  batchesCompleted?: number;
  batchesFailed?: number;
  rowsProcessed?: number;
  failedAtBatch?: number;
  rowsCommitted?: number;
  canResume?: boolean;
  resumed?: boolean;
  skippedBatches?: number;
  skippedRows?: number;
  errors: Array<{ row: number; error?: string; message?: string; values?: Record<string, unknown> }>;
}

export interface TemplateInfo {
  filename: string;
  headers: string[];
  description: string;
}

type ApiEnvelope<T> = { success: true; data: T } | T;

function unwrapApiData<T>(payload: ApiEnvelope<T>): T {
  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    (payload as { success?: unknown }).success === true &&
    "data" in payload
  ) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

function isSessionExpiryError(error: unknown): boolean {
  const maybeStatus = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
  if (maybeStatus === 404 || maybeStatus === 410) return true;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("session") && (message.includes("expired") || message.includes("not found"));
}

export function getImportSessionStorageKeys(entityType: ImportEntityType) {
  const prefix = `jurnapod.import.${entityType}`;
  return {
    uploadId: `${prefix}.uploadId`,
    fileHash: `${prefix}.fileHash`,
    step: `${prefix}.step`,
    columns: `${prefix}.columns`,
    sampleData: `${prefix}.sampleData`,
    mappings: `${prefix}.mappings`,
  } as const;
}

export function clearImportSessionStorage(entityType: ImportEntityType): void {
  if (typeof window === "undefined") return;
  const keys = getImportSessionStorageKeys(entityType);
  for (const key of Object.values(keys)) {
    window.sessionStorage.removeItem(key);
  }
}

export async function computeImportFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  let hash = 0;
  for (const byte of new Uint8Array(buffer)) {
    hash = (hash * 31 + byte) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

// ============================================================================
// useUpload Hook
// ============================================================================

interface UseUploadProps {
  entityType: ImportEntityType;
}

interface UseUploadReturn {
  upload: (file: File) => Promise<UploadResponse>;
  loading: boolean;
  error: string | null;
  progress: number;
  reset: () => void;
}

export function useUpload({ entityType }: UseUploadProps): UseUploadReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    setError(null);
    setProgress(0);
  }, []);

  const upload = useCallback(
    async (file: File): Promise<UploadResponse> => {
      reset();
      setLoading(true);
      setError(null);

      abortControllerRef.current = new AbortController();

      try {
        const formData = new FormData();
        formData.append("file", file);

        const payload = await uploadWithProgress<ApiEnvelope<UploadResponse>>(
          `/import/${entityType}/upload`,
          formData,
          (percentage) => setProgress(percentage)
        );

        const result = unwrapApiData<UploadResponse>(payload);
        setProgress(100);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [entityType, reset]
  );

  return { upload, loading, error, progress, reset };
}

// ============================================================================
// useValidate Hook
// ============================================================================

interface UseValidateProps {
  entityType: ImportEntityType;
}

interface UseValidateReturn {
  validate: (uploadId: string, mappings: ColumnMapping[]) => Promise<ValidationResult>;
  loading: boolean;
  error: string | null;
  reset: () => void;
}

export function useValidate({ entityType }: UseValidateProps): UseValidateReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
  }, []);

  const validate = useCallback(
    async (uploadId: string, mappings: ColumnMapping[]): Promise<ValidationResult> => {
      reset();
      setLoading(true);
      setError(null);

      try {
        const payload = await apiRequest<ApiEnvelope<ValidationResult>>(
          `/import/${entityType}/validate`,
          {
            method: "POST",
            body: JSON.stringify({ uploadId, mappings }),
          }
        );
        const result = unwrapApiData<ValidationResult>(payload);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Validation failed";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [entityType, reset]
  );

  return { validate, loading, error, reset };
}

// ============================================================================
// useApply Hook
// ============================================================================

interface UseApplyProps {
  entityType: ImportEntityType;
  onProgress?: (progress: ApplyProgress) => void;
}

interface UseApplyReturn {
  apply: (uploadId: string, mappings: ColumnMapping[], fileHash?: string) => Promise<ApplyResult>;
  loading: boolean;
  error: string | null;
  progress: ApplyProgress | null;
  cancel: () => void;
}

export function useApply({ entityType, onProgress }: UseApplyProps): UseApplyReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ApplyProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cancel();
    setLoading(false);
    setError(null);
    setProgress(null);
  }, [cancel]);

  const apply = useCallback(
    async (uploadId: string, mappings: ColumnMapping[], fileHash?: string): Promise<ApplyResult> => {
      reset();
      setLoading(true);
      setError(null);

      abortControllerRef.current = new AbortController();

      try {
        const payload = await applyWithProgress<ApiEnvelope<ApplyResult>>(
          `/import/${entityType}/apply`,
          { uploadId, mappings, fileHash },
          (prog) => {
            setProgress(prog);
            onProgress?.(prog);
          }
        );

        const rawResult = unwrapApiData<ApplyResult>(payload);
        const result: ApplyResult = {
          ...rawResult,
          skipped: rawResult.skipped ?? rawResult.skippedRows ?? 0,
          errors: rawResult.errors ?? [],
        };

        const finalProgress = {
          current: result.success + result.failed,
          total: result.success + result.failed,
          currentRow: result.success + result.failed,
          percentage: 100,
          mode: "rows" as const,
        };
        setProgress(finalProgress);
        onProgress?.(finalProgress);

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Import failed";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [entityType, reset, onProgress]
  );

  return { apply, loading, error, progress, cancel };
}

// ============================================================================
// useGetTemplate Hook
// ============================================================================

interface UseGetTemplateProps {
  entityType: ImportEntityType;
}

interface UseGetTemplateReturn {
  getTemplate: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useGetTemplate({ entityType }: UseGetTemplateProps): UseGetTemplateReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getTemplate = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiStreamingRequest(`/import/${entityType}/template`, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`Failed to download template: ${response.status}`);
      }

      // Get filename from content-disposition header
      const contentDisposition = response.headers.get("content-disposition");
      let filename = `${entityType}-import-template.csv`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match) {
          filename = match[1]?.replace(/['"]/g, "") ?? filename;
        }
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to download template";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [entityType]);

  return { getTemplate, loading, error };
}

// ============================================================================
// useImportWizard Hook (Combined State Management)
// ============================================================================

export type ImportWizardStep = "upload" | "mapping" | "validation" | "apply" | "results";

export interface ImportWizardState {
  step: ImportWizardStep;
  uploadId: string | null;
  fileHash: string | null;
  file: File | null;
  columns: string[];
  sampleData: string[][];
  mappings: ColumnMapping[];
  validationResult: ValidationResult | null;
  applyResult: ApplyResult | null;
  progress: ApplyProgress | null;
  recoveredFromSession: boolean;
  sessionError: string | null;
}

interface UseImportWizardProps {
  entityType: ImportEntityType;
}

interface UseImportWizardReturn {
  // State
  state: ImportWizardState;
  
  // Upload
  uploadFile: (file: File) => Promise<void>;
  uploadLoading: boolean;
  uploadError: string | null;
  uploadProgress: number;
  
  // Validate
  validateMappings: () => Promise<void>;
  validateLoading: boolean;
  validateError: string | null;
  
  // Apply
  executeImport: () => Promise<void>;
  applyLoading: boolean;
  applyError: string | null;
  applyProgress: ApplyProgress | null;
  cancelImport: () => void;
  
  // Template
  downloadTemplate: () => Promise<void>;
  templateLoading: boolean;
  
  // Navigation
  goToStep: (step: ImportWizardStep) => void;
  goBack: () => void;
  updateMapping: (index: number, targetField: string) => void;
  setMappings: (mappings: ColumnMapping[]) => void;
  reset: () => void;
}

const STEP_ORDER: ImportWizardStep[] = ["upload", "mapping", "validation", "apply", "results"];

function parseStoredJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function isImportWizardStep(value: string | null): value is ImportWizardStep {
  return value === "upload" || value === "mapping" || value === "validation" || value === "apply" || value === "results";
}

export function normalizeRecoveredImportStep(input: {
  storedStep: string | null;
  hasUploadId: boolean;
  hasMappingState: boolean;
  hasValidationResult: boolean;
  hasApplyResult: boolean;
}): ImportWizardStep {
  if (!input.hasUploadId) return "upload";
  if (!input.hasMappingState) return "upload";
  if (!isImportWizardStep(input.storedStep)) return "mapping";
  if (input.storedStep === "validation" && input.hasValidationResult) return "validation";
  if ((input.storedStep === "apply" || input.storedStep === "results") && input.hasApplyResult) return input.storedStep;
  return "mapping";
}

function createInitialImportWizardState(entityType: ImportEntityType): ImportWizardState {
  if (typeof window === "undefined") {
    return {
      step: "upload",
      uploadId: null,
      fileHash: null,
      file: null,
      columns: [],
      sampleData: [],
      mappings: [],
      validationResult: null,
      applyResult: null,
      progress: null,
      recoveredFromSession: false,
      sessionError: null,
    };
  }

  const keys = getImportSessionStorageKeys(entityType);
  const uploadId = window.sessionStorage.getItem(keys.uploadId);
  const storedStep = window.sessionStorage.getItem(keys.step);
  const columns = parseStoredJson<string[]>(window.sessionStorage.getItem(keys.columns), []);
  const sampleData = parseStoredJson<string[][]>(window.sessionStorage.getItem(keys.sampleData), []);
  const mappings = parseStoredJson<ColumnMapping[]>(window.sessionStorage.getItem(keys.mappings), []);
  const hasMappingState = columns.length > 0 && mappings.length > 0;
  const step = normalizeRecoveredImportStep({
    storedStep,
    hasUploadId: Boolean(uploadId),
    hasMappingState,
    hasValidationResult: false,
    hasApplyResult: false,
  });

  return {
    step,
    uploadId,
    fileHash: window.sessionStorage.getItem(keys.fileHash),
    file: null,
    columns,
    sampleData,
    mappings,
    validationResult: null,
    applyResult: null,
    progress: null,
    recoveredFromSession: Boolean(uploadId),
    sessionError: uploadId
      ? hasMappingState
        ? "Import session recovered. Review mappings and validate again."
        : "Recovered import session is missing local mapping data. Restart import."
      : null,
  };
}

export function useImportWizard({ entityType }: UseImportWizardProps): UseImportWizardReturn {
  // Individual hooks
  const uploadHook = useUpload({ entityType });
  const validateHook = useValidate({ entityType });
  const applyHook = useApply({ entityType, onProgress: () => {} });
  const templateHook = useGetTemplate({ entityType });

  // Combined state
  const [state, setState] = useState<ImportWizardState>(() => createInitialImportWizardState(entityType));

  useEffect(() => {
    setState(createInitialImportWizardState(entityType));
  }, [entityType]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const keys = getImportSessionStorageKeys(entityType);
    if (!state.uploadId) return;

    window.sessionStorage.setItem(keys.uploadId, state.uploadId);
    window.sessionStorage.setItem(keys.step, state.step);
    if (state.fileHash) window.sessionStorage.setItem(keys.fileHash, state.fileHash);
    if (state.columns.length > 0) window.sessionStorage.setItem(keys.columns, JSON.stringify(state.columns));
    if (state.sampleData.length > 0) window.sessionStorage.setItem(keys.sampleData, JSON.stringify(state.sampleData));
    if (state.mappings.length > 0) window.sessionStorage.setItem(keys.mappings, JSON.stringify(state.mappings));
  }, [entityType, state.columns, state.fileHash, state.mappings, state.sampleData, state.step, state.uploadId]);

  // Upload file
  const uploadFile = useCallback(
    async (file: File): Promise<void> => {
      const response = await uploadHook.upload(file);
      const fileHash = response.fileHash ?? await computeImportFileHash(file);
      
      // Auto-detect mappings based on column names
      const autoMappings: ColumnMapping[] = response.columns.map((col, idx) => {
        const normalizedCol = col.toLowerCase().replace(/[_\s-]/g, "");
        const sampleValues = response.sampleData.slice(0, 5).map((row) => row[idx] ?? "");
        
        // Auto-detect common patterns
        let targetField = "";
        
        if (normalizedCol.includes("sku")) {
          targetField = "sku";
        } else if (normalizedCol.includes("name") || normalizedCol.includes("itemname")) {
          targetField = "name";
        } else if (normalizedCol.includes("price") || normalizedCol.includes("amount")) {
          targetField = "price";
        } else if (normalizedCol.includes("type")) {
          targetField = entityType === "items" ? "item_type" : "";
        } else if (normalizedCol.includes("group") || normalizedCol.includes("category")) {
          targetField = "item_group_id";
        } else if (normalizedCol.includes("active") || normalizedCol.includes("status") || normalizedCol.includes("isenable")) {
          targetField = "is_active";
        } else if (normalizedCol.includes("barcode")) {
          targetField = "barcode";
        } else if (normalizedCol.includes("cogs") || normalizedCol.includes("cost")) {
          targetField = "cogs_account_id";
        } else if (normalizedCol.includes("inventory") || normalizedCol.includes("asset")) {
          targetField = "inventory_asset_account_id";
        } else if (normalizedCol.includes("outlet")) {
          targetField = "outlet_id";
        } else if (normalizedCol.includes("item")) {
          targetField = "item_sku";
        }
        
        return {
          sourceColumn: col,
          targetField,
          sampleValues,
        };
      });

      setState((prev) => ({
        ...prev,
        step: "mapping",
        uploadId: response.uploadId,
        fileHash,
        file,
        columns: response.columns,
        sampleData: response.sampleData,
        mappings: autoMappings,
        recoveredFromSession: false,
        sessionError: null,
      }));
    },
    [entityType, uploadHook]
  );

  // Validate mappings
  const validateMappings = useCallback(async (): Promise<void> => {
    try {
      const mappedFields = state.mappings.filter((mapping) => mapping.targetField);
      const result = await validateHook.validate(state.uploadId!, mappedFields);
      setState((prev) => ({
        ...prev,
        step: "validation",
        validationResult: result,
        sessionError: null,
      }));
    } catch (error) {
      if (isSessionExpiryError(error)) {
        clearImportSessionStorage(entityType);
        setState((prev) => ({
          ...prev,
          step: "upload",
          uploadId: null,
          fileHash: null,
          recoveredFromSession: false,
          sessionError: "Session expired — restart required",
        }));
      }
      throw error;
    }
  }, [entityType, state.uploadId, state.mappings, validateHook]);

  // Execute import
  const executeImport = useCallback(async (): Promise<void> => {
    try {
      const mappedFields = state.mappings.filter((mapping) => mapping.targetField);
      const result = await applyHook.apply(state.uploadId!, mappedFields, state.fileHash ?? undefined);
      if (!result.canResume) {
        clearImportSessionStorage(entityType);
      }
      setState((prev) => ({
        ...prev,
        step: "results",
        applyResult: result,
        sessionError: null,
      }));
    } catch (error) {
      if (isSessionExpiryError(error)) {
        clearImportSessionStorage(entityType);
        setState((prev) => ({
          ...prev,
          step: "upload",
          uploadId: null,
          fileHash: null,
          recoveredFromSession: false,
          sessionError: "Session expired — restart required",
        }));
      }
      throw error;
    }
  }, [applyHook, entityType, state.fileHash, state.mappings, state.uploadId]);

  // Navigation
  const goToStep = useCallback((step: ImportWizardStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const updateMapping = useCallback((index: number, targetField: string) => {
    setState((prev) => ({
      ...prev,
      mappings: prev.mappings.map((mapping, mappingIndex) =>
        mappingIndex === index ? { ...mapping, targetField } : mapping
      ),
    }));
  }, []);

  const setMappings = useCallback((mappings: ColumnMapping[]) => {
    setState((prev) => ({ ...prev, mappings }));
  }, []);

  const goBack = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(state.step);
    if (currentIndex > 0) {
      setState((prev) => ({ ...prev, step: STEP_ORDER[currentIndex - 1] }));
    }
  }, [state.step]);

  const reset = useCallback(() => {
    clearImportSessionStorage(entityType);
    uploadHook.reset();
    validateHook.reset();
    applyHook.cancel();
    setState({
      step: "upload",
      uploadId: null,
      fileHash: null,
      file: null,
      columns: [],
      sampleData: [],
      mappings: [],
      validationResult: null,
      applyResult: null,
      progress: null,
      recoveredFromSession: false,
      sessionError: null,
    });
  }, [entityType, uploadHook, validateHook, applyHook]);

  return {
    state,
    uploadFile,
    uploadLoading: uploadHook.loading,
    uploadError: uploadHook.error,
    uploadProgress: uploadHook.progress,
    validateMappings,
    validateLoading: validateHook.loading,
    validateError: validateHook.error,
    executeImport,
    applyLoading: applyHook.loading,
    applyError: applyHook.error,
    applyProgress: applyHook.progress,
    cancelImport: applyHook.cancel,
    downloadTemplate: templateHook.getTemplate,
    templateLoading: templateHook.loading,
    goToStep,
    goBack,
    updateMapping,
    setMappings,
    reset,
  };
}
