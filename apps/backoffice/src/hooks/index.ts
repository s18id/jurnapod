// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

// Custom React hooks for backoffice

export { useItems, type Item, type ItemType, type UseItemsProps, type UseItemsReturn } from "./use-items";
export { useItemGroups, type ItemGroup, type UseItemGroupsProps, type UseItemGroupsReturn } from "./use-item-groups";
export { useBreadcrumbs, type UseBreadcrumbsOptions, type UseBreadcrumbsReturn } from "./use-breadcrumbs";
export { AsyncJobDrawerProvider, useAsyncJobDrawer, type OpenAsyncJobDrawerInput } from "./use-async-job-drawer";
export { useOperationProgress, type OperationProgress, type OperationStatus } from "./use-operation-progress";
export {
  useFormAutosave,
  type AutosaveWarning,
  type AutosaveWarningCode,
  type DraftMetadata,
  type DraftScope,
  type StorageLike,
  type StoredDraft,
  type UseFormAutosaveOptions,
  type UseFormAutosaveResult,
} from "./useFormAutosave";
export {
  useUnsavedChangesGuard,
  type GuardNavigationEvent,
  type UnsavedNavigationAdapter,
  type UseUnsavedChangesGuardOptions,
  type UseUnsavedChangesGuardResult,
  type WindowLike,
} from "./useUnsavedChangesGuard";
export {
  moneyFieldValidator,
  useFormValidation,
  type CrossFieldValidator,
  type FieldValidator,
  type FormValidationState,
  type UseFormValidationResult,
  type ValidationIssue,
  type ValidationRules,
  type ValidationSeverity,
} from "./useFormValidation";
