export type {
  EffectivePermissionSet,
  ModuleCode,
  PermissionName,
  ResourcePermission,
  ShellNavigationItem,
  ShellStatus,
  ShellStatusInput,
  ShellUserContext,
  SyncHealthState,
} from "./model";

export {
  buildShellStatus,
  canAccessNavigationItem,
  filterNavigationItems,
  formatLastSyncLabel,
  hasAllowedRole,
  hasResourcePermission,
  toResourcePermission,
} from "./model";

export type {
  NavFilterResult,
  NavItem,
  NavPermissionRequirement,
  UserPermissionEntry,
} from "./use-nav-filtering";

export {
  PERMISSION_BITS,
  filterNavigation,
  hasMinimumPermission,
  userSatisfiesPermission,
} from "./use-nav-filtering";

export {
  permissionsFromRoleCodes,
} from "@/lib/auth/permissions";

export {
  getStoredOutletId,
  setStoredOutletId,
  useOutletSwitcher,
} from "./use-outlet-switcher";
export type { OutletSwitcherResult } from "./use-outlet-switcher";

export { usePendingJobs } from "./use-pending-jobs";
export { formatTimeAgo, useSyncHealth } from "./use-sync-health";

export {
  ShellProvider,
  useShell,
} from "./shell-context";
export type {
  OutletContext,
  OperationsJobsInfo,
  ShellProviderProps,
  ShellState,
} from "./shell-context";
