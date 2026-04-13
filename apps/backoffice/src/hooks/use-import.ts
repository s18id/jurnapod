// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useCallback, useRef } from "react";
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
}

export interface ApplyResult {
  success: number;
  failed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

export interface TemplateInfo {
  filename: string;
  headers: string[];
  description: string;
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

        const result = await uploadWithProgress<UploadResponse>(
          `/import/${entityType}/upload`,
          formData,
          (percentage) => setProgress(percentage)
        );

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
        const result = await apiRequest<ValidationResult>(
          `/import/${entityType}/validate`,
          {
            method: "POST",
            body: JSON.stringify({ uploadId, mappings }),
          }
        );
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
  apply: (uploadId: string) => Promise<ApplyResult>;
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
    async (uploadId: string): Promise<ApplyResult> => {
      reset();
      setLoading(true);
      setError(null);

      abortControllerRef.current = new AbortController();

      try {
        const result = await applyWithProgress<ApplyResult>(
          `/import/${entityType}/apply`,
          { uploadId },
          (prog) => {
            setProgress(prog);
            onProgress?.(prog);
          }
        );

        setProgress({
          current: result.success + result.failed,
          total: result.success + result.failed,
          currentRow: result.success + result.failed,
          percentage: 100,
        });
        onProgress?.(progress ?? { current: 0, total: 0, currentRow: 0, percentage: 100 });

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
  file: File | null;
  columns: string[];
  sampleData: string[][];
  mappings: ColumnMapping[];
  validationResult: ValidationResult | null;
  applyResult: ApplyResult | null;
  progress: ApplyProgress | null;
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
  reset: () => void;
}

const STEP_ORDER: ImportWizardStep[] = ["upload", "mapping", "validation", "apply", "results"];

export function useImportWizard({ entityType }: UseImportWizardProps): UseImportWizardReturn {
  // Individual hooks
  const uploadHook = useUpload({ entityType });
  const validateHook = useValidate({ entityType });
  const applyHook = useApply({ entityType, onProgress: () => {} });
  const templateHook = useGetTemplate({ entityType });

  // Combined state
  const [state, setState] = useState<ImportWizardState>({
    step: "upload",
    uploadId: null,
    file: null,
    columns: [],
    sampleData: [],
    mappings: [],
    validationResult: null,
    applyResult: null,
    progress: null,
  });

  // Upload file
  const uploadFile = useCallback(
    async (file: File): Promise<void> => {
      const response = await uploadHook.upload(file);
      
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
          targetField = "type";
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
        } else if (normalizedCol.includes("scope")) {
          targetField = "scope";
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
        file,
        columns: response.columns,
        sampleData: response.sampleData,
        mappings: autoMappings,
      }));
    },
    [uploadHook]
  );

  // Validate mappings
  const validateMappings = useCallback(async (): Promise<void> => {
    const result = await validateHook.validate(state.uploadId!, state.mappings);
    setState((prev) => ({
      ...prev,
      step: result.errorRows > 0 ? "validation" : "apply",
      validationResult: result,
    }));
  }, [state.uploadId, state.mappings, validateHook]);

  // Execute import
  const executeImport = useCallback(async (): Promise<void> => {
    const result = await applyHook.apply(state.uploadId!);
    setState((prev) => ({
      ...prev,
      step: "results",
      applyResult: result,
    }));
  }, [state.uploadId, applyHook]);

  // Navigation
  const goToStep = useCallback((step: ImportWizardStep) => {
    setState((prev) => ({ ...prev, step }));
  }, []);

  const goBack = useCallback(() => {
    const currentIndex = STEP_ORDER.indexOf(state.step);
    if (currentIndex > 0) {
      setState((prev) => ({ ...prev, step: STEP_ORDER[currentIndex - 1] }));
    }
  }, [state.step]);

  const reset = useCallback(() => {
    uploadHook.reset();
    validateHook.reset();
    applyHook.cancel();
    setState({
      step: "upload",
      uploadId: null,
      file: null,
      columns: [],
      sampleData: [],
      mappings: [],
      validationResult: null,
      applyResult: null,
      progress: null,
    });
  }, [uploadHook, validateHook, applyHook]);

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
    reset,
  };
}
