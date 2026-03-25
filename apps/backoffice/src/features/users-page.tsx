// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  ActionIcon
} from "@mantine/core";
import type { SessionUser } from "../lib/session";
import {
  useUsers,
  useRoles,
  useOutlets,
  createUser,
  updateUser,
  updateUserRoles,
  updateUserPassword,
  deactivateUser,
  reactivateUser
} from "../hooks/use-users";
import { useCompanies } from "../hooks/use-companies";
import { ApiError } from "../lib/api-client";
import {
  DataTable,
  type DataTableColumnDef,
  type LoadingState,
  type PaginationState,
  type SortState,
  type RowSelectionState,
  type TableError,
} from "../components/ui/DataTable";
import { DirtyConfirmDialog } from "../components/dirty-confirm-dialog";
import { FilterBar } from "../components/FilterBar";
import { OutletRoleMatrix } from "../components/OutletRoleMatrix";
import { PageCard } from "../components/PageCard";
import { trackActionMenuOpen, trackActionSelect, trackActionError } from "../lib/telemetry";
import type { OutletResponse, Role, RoleResponse, UserResponse } from "@jurnapod/shared";
import {
  IconDots,
  IconEdit,
  IconShield,
  IconBuildingStore,
  IconLock,
  IconUserMinus,
  IconUserCheck,
  IconUserPlus,
  IconRefresh,
  IconSearch,
  IconFilter,
  IconBan,
  IconX,
  IconCheck
} from "@tabler/icons-react";

type UsersPageProps = {
  user: SessionUser;
  accessToken: string;
};

// Dialog modes split into Account-focused and Access-focused flows
type AccountDialogMode = "account-create" | "account-edit" | null;
type AccessDialogMode = "access-create" | "access-edit" | null;
type LegacyDialogMode = "password" | null; // Keep password as legacy for now

type DialogMode = AccountDialogMode | AccessDialogMode | LegacyDialogMode;

// Account form - profile-only fields
type AccountFormData = {
  company_id?: number | null;
  email: string;
  password: string;
  is_active: boolean;
};

// Access form - roles and outlet assignments
type AccessFormData = {
  global_role_codes: string[];
  outlet_role_assignments: Array<{ outlet_id: number; role_codes: string[] }>;
};

type UserFormData = {
  company_id?: number | null;
  email: string;
  password: string;
  global_role_codes: string[];
  outlet_role_assignments: Array<{ outlet_id: number; role_codes: string[] }>;
  is_active: boolean;
};

const emptyForm: UserFormData = {
  company_id: null,
  email: "",
  password: "",
  global_role_codes: [],
  outlet_role_assignments: [],
  is_active: true
};

const ROLE_HELP_TEXT: Record<string, string> = {
  OWNER: "Full operational access for this outlet.",
  COMPANY_ADMIN: "Manages outlet configuration and staff access.",
  ADMIN: "Handles daily operations and oversight.",
  CASHIER: "Runs checkout and sales transactions.",
  ACCOUNTANT: "Reviews journals and financial records."
};

export function UsersPage(props: UsersPageProps) {
  const { user, accessToken } = props;
  const isSuperAdmin = user.roles.includes("SUPER_ADMIN");
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [outletFilter, setOutletFilter] = useState<string>("all");
  const [selectedCompanyId, setSelectedCompanyId] = useState<number>(user.company_id);

  // Table state
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 25 });
  const [sort, setSort] = useState<SortState | null>(null);
  const [selection, setSelection] = useState<RowSelectionState>({});

  // Reset pagination helper - Memoized for stability
  const resetPagination = useCallback(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  // Filter change handlers that reset pagination - Memoized for stability
  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.currentTarget.value);
    resetPagination();
  }, [resetPagination]);

  const handleStatusFilterChange = useCallback((value: string | null) => {
    setStatusFilter((value as "all" | "active" | "inactive") || "active");
    resetPagination();
  }, [resetPagination]);

  const handleRoleFilterChange = useCallback((value: string | null) => {
    setRoleFilter(value || "all");
    resetPagination();
  }, [resetPagination]);

  const handleOutletFilterChange = useCallback((value: string | null) => {
    setOutletFilter(value || "all");
    resetPagination();
  }, [resetPagination]);

  // Clear all filters function - Memoized for stability
  const clearAllFilters = useCallback(() => {
    setSearchTerm("");
    setSearchQuery("");
    setStatusFilter("active");
    setRoleFilter("all");
    setOutletFilter("all");
    resetPagination();
  }, [resetPagination]);

  // Check if any filters are active (for showing Clear All button)
  const hasActiveFilters = useMemo(() => 
    searchTerm !== "" || statusFilter !== "active" || roleFilter !== "all" || outletFilter !== "all",
    [searchTerm, statusFilter, roleFilter, outletFilter]
  );

  // Stable status filter options
  const statusFilterOptions = useMemo(() => [
    { value: "all", label: "All Status" },
    { value: "active", label: "Active Only" },
    { value: "inactive", label: "Inactive Only" }
  ], []);

  // Stable style objects
  const filterStyles = useMemo(() => ({
    company: { minWidth: 200, flex: 1 },
    search: { minWidth: 240, flex: 2 },
    status: { minWidth: 140, flex: 1 },
    role: { minWidth: 140, flex: 1 },
    outlet: { minWidth: 140, flex: 1 }
  }), []);
  
  // Dialog state
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingUser, setEditingUser] = useState<UserResponse | null>(null);
  const [formData, setFormData] = useState<UserFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof UserFormData, string>>>({});
  const [confirmState, setConfirmState] = useState<
    { action: "deactivate" | "reactivate"; user: UserResponse } | null
  >(null);
  
  // Separate form state for account and access dialogs
  const [accountFormData, setAccountFormData] = useState<AccountFormData>({
    email: "",
    password: "",
    is_active: true
  });
  const [accessFormData, setAccessFormData] = useState<AccessFormData>({
    global_role_codes: [],
    outlet_role_assignments: []
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showDirtyConfirm, setShowDirtyConfirm] = useState(false);
  const [pendingCloseAction, setPendingCloseAction] = useState<(() => void) | null>(null);
  
  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // API hooks
  const activeCompanyId = isSuperAdmin ? selectedCompanyId : user.company_id;

  // Memoize filters object to prevent infinite re-renders
  const usersFilters = useMemo(() => ({
    is_active: statusFilter === "all" ? undefined : statusFilter === "active",
    search: searchQuery || undefined
  }), [statusFilter, searchQuery]);

  // Memoize sort object to prevent infinite re-renders
  const usersSort = useMemo(() => 
    sort ? { id: sort.id, direction: sort.direction } : undefined,
    [sort]
  );

  const usersQuery = useUsers(activeCompanyId, accessToken, {
    filters: usersFilters,
    pagination,
    sort: usersSort
  });

  const rolesQuery = useRoles(accessToken, activeCompanyId);
  
  // Memoize companies query options to prevent infinite re-renders
  const companiesOptions = useMemo(() => ({ enabled: isSuperAdmin }), [isSuperAdmin]);
  const companiesQuery = useCompanies(accessToken, companiesOptions);
  const outletCompanyId =
    isSuperAdmin && dialogMode === "account-create"
      ? (formData.company_id ?? activeCompanyId)
      : activeCompanyId;
   const outletsQuery = useOutlets(outletCompanyId, accessToken);

  // Convert loading state for DataTable
  const tableLoadingState = useMemo((): LoadingState => {
    if (usersQuery.loading) return "loading";
    if (usersQuery.error) return "error";
    return "idle";
  }, [usersQuery.loading, usersQuery.error]);

  // Convert error state for DataTable
  const tableError = useMemo((): TableError | null => {
    if (usersQuery.error) {
      return {
        message: usersQuery.error,
        retryable: true
      };
    }
    return null;
  }, [usersQuery.error]);

  const availableRoles = useMemo(() => {
    const roles = rolesQuery.data || [];
    const dedupedByCode = new Map<string, (typeof roles)[0]>();
    for (const role of roles) {
      if (role.code === "SUPER_ADMIN") continue;
      const existing = dedupedByCode.get(role.code);
      if (!existing) {
        dedupedByCode.set(role.code, role);
      } else if (role.company_id !== null && role.company_id === activeCompanyId) {
        dedupedByCode.set(role.code, role);
      }
    }
    return Array.from(dedupedByCode.values());
  }, [rolesQuery.data, activeCompanyId]);

  const globalRoleOptions = useMemo(
    () => availableRoles.filter((role) => role.is_global),
    [availableRoles]
  );
  const outletRoleOptions = useMemo(
    () => availableRoles.filter((role) => !role.is_global),
    [availableRoles]
  );

  const actorMaxRoleLevel = useMemo(() => {
    const roleLevels = new Map(availableRoles.map((role) => [role.code, role.role_level]));
    const levels = user.roles.map((code) => roleLevels.get(code) ?? 0);
    return Math.max(0, ...levels);
  }, [availableRoles, user.roles]);

  const companyOptions = useMemo(
    () =>
      (companiesQuery.data || []).map((company) => ({
        value: String(company.id),
        label: `${company.name} (${company.code})`
      })),
    [companiesQuery.data]
  );

  const roleOptions = useMemo(
    () => [
      { value: "all", label: "All Roles" },
      ...availableRoles.map((role) => ({ value: role.code, label: role.name }))
    ],
    [availableRoles]
  );

  const outletOptions = useMemo(
    () => [
      { value: "all", label: "All Outlets" },
      ...(outletsQuery.data || []).map((outlet) => ({
        value: String(outlet.id),
        label: outlet.name
      }))
    ],
    [outletsQuery.data]
  );
  
  // Filtered users
  const filteredUsers = useMemo(() => {
    let result = usersQuery.data || [];

    if (roleFilter !== "all") {
      result = result.filter((item) => {
        const roleSet = new Set(item.global_roles);
        item.outlet_role_assignments.forEach((assignment) => {
          assignment.role_codes.forEach((code) => roleSet.add(code));
        });
        return roleSet.has(roleFilter as Role);
      });
    }

    if (outletFilter !== "all") {
      result = result.filter((item) =>
        item.outlet_role_assignments.some(
          (assignment) => String(assignment.outlet_id) === outletFilter
        )
      );
    }

    return result;
  }, [usersQuery.data, roleFilter, outletFilter]);
  
  // Handlers - Memoized for stability
  const openCreateDialog = useCallback(() => {
    setFormData({
      ...emptyForm,
      company_id: isSuperAdmin ? activeCompanyId : null
    });
    setAccountFormData({
      email: "",
      password: "",
      is_active: true
    });
    setAccessFormData({
      global_role_codes: [],
      outlet_role_assignments: []
    });
    setFormErrors({});
    setEditingUser(null);
    setDialogMode("account-create");
    setError(null);
    setSuccessMessage(null);
    setHasUnsavedChanges(false);
  }, [isSuperAdmin, activeCompanyId]);
  
  const openAccountDialog = useCallback((targetUser: UserResponse) => {
    // Prevent editing super-admin users
    if (targetUser.global_roles.includes("SUPER_ADMIN")) {
      setError("Cannot modify SUPER_ADMIN user.");
      return;
    }
    
    setAccountFormData({
      email: targetUser.email,
      password: "",
      is_active: targetUser.is_active
    });
    setFormErrors({});
    setEditingUser(targetUser);
    setDialogMode("account-edit");
    setError(null);
    setSuccessMessage(null);
    setHasUnsavedChanges(false);
  }, []);
  
  const openAccessDialog = useCallback((targetUser: UserResponse) => {
    setAccessFormData({
      global_role_codes: targetUser.global_roles,
      outlet_role_assignments: targetUser.outlet_role_assignments.map((assignment) => ({
        outlet_id: assignment.outlet_id,
        role_codes: assignment.role_codes
      }))
    });
    setFormErrors({});
    setEditingUser(targetUser);
    setDialogMode("access-edit");
    setError(null);
    setSuccessMessage(null);
    setHasUnsavedChanges(false);
  }, []);
  
  const openPasswordDialog = useCallback((targetUser: UserResponse) => {
    // Prevent changing password for super-admin users
    if (targetUser.global_roles.includes("SUPER_ADMIN")) {
      setError("Cannot modify SUPER_ADMIN user.");
      return;
    }
    
    setFormData({ ...emptyForm, password: "" });
    setFormErrors({});
    setEditingUser(targetUser);
    setDialogMode("password");
    setError(null);
    setSuccessMessage(null);
    setHasUnsavedChanges(false);
  }, []);
  
  const closeDialog = () => {
    if (hasUnsavedChanges) {
      // Show confirmation dialog instead of closing immediately
      setShowDirtyConfirm(true);
      setPendingCloseAction(() => () => {
        setDialogMode(null);
        setEditingUser(null);
        setFormData(emptyForm);
        setFormErrors({});
        setHasUnsavedChanges(false);
      });
    } else {
      setDialogMode(null);
      setEditingUser(null);
      setFormData(emptyForm);
      setFormErrors({});
      setHasUnsavedChanges(false);
    }
  };

  const handleDirtyConfirm = () => {
    setShowDirtyConfirm(false);
    if (pendingCloseAction) {
      pendingCloseAction();
    }
    setPendingCloseAction(null);
  };

  const handleDirtyCancel = () => {
    setShowDirtyConfirm(false);
    setPendingCloseAction(null);
  };
  
  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof UserFormData, string>> = {};
    
    if (dialogMode === "account-create") {
      if (isSuperAdmin && !formData.company_id) {
        errors.company_id = "Company is required";
      }
      if (!accountFormData.email.trim()) {
        errors.email = "Email is required";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountFormData.email)) {
        errors.email = "Invalid email format";
      }
      
      if (!accountFormData.password) {
        errors.password = "Password is required";
      } else if (accountFormData.password.length < 8) {
        errors.password = "Password must be at least 8 characters";
      }
    }
    
    if (dialogMode === "account-edit") {
      if (!accountFormData.email.trim()) {
        errors.email = "Email is required";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountFormData.email)) {
        errors.email = "Invalid email format";
      }
    }
    
    if (dialogMode === "password") {
      if (!formData.password) {
        errors.password = "Password is required";
      } else if (formData.password.length < 8) {
        errors.password = "Password must be at least 8 characters";
      }
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  const validateAccessForm = (): boolean => {
    return true;
  };
  
  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      if (dialogMode === "account-create") {
        const targetCompanyId = isSuperAdmin
          ? (formData.company_id ?? activeCompanyId)
          : activeCompanyId;
        await createUser({
          company_id: targetCompanyId,
          email: accountFormData.email,
          password: accountFormData.password,
          role_codes:
            accessFormData.global_role_codes.length > 0
              ? (accessFormData.global_role_codes as Role[])
              : undefined,
          outlet_role_assignments:
            accessFormData.outlet_role_assignments.length > 0
              ? accessFormData.outlet_role_assignments.map((assignment) => ({
                  outlet_id: assignment.outlet_id,
                  role_codes: assignment.role_codes as Role[]
                }))
              : undefined,
          is_active: accountFormData.is_active
        }, accessToken);
        setSuccessMessage("User created successfully");
        await usersQuery.refetch({ force: true });
        closeDialog();
      } else if (dialogMode === "account-edit" && editingUser) {
        await updateUser(editingUser.id, {
          email: accountFormData.email !== editingUser.email ? accountFormData.email : undefined
        }, accessToken);
        if (accountFormData.is_active !== editingUser.is_active) {
          if (accountFormData.is_active) {
            await reactivateUser(editingUser.id, accessToken);
          } else {
            await deactivateUser(editingUser.id, accessToken);
          }
        }
        setSuccessMessage("User account updated successfully");
        await usersQuery.refetch({ force: true });
        closeDialog();
      } else if (dialogMode === "access-edit" && editingUser) {
        if (editingUser.id === user.id) {
          setError("You cannot update your own access.");
          return;
        }
        
        const accessStartTime = Date.now();
        const actorRole = user.global_roles[0] ?? "UNKNOWN";
        
        // Calculate delta for audit
        const existingRoles = new Set<string>(editingUser.global_roles);
        const desiredRoles = new Set<string>(accessFormData.global_role_codes);
        const globalRoleAdditions = [...desiredRoles].filter(r => !existingRoles.has(r)).length;
        const globalRoleRemovals = [...existingRoles].filter(r => !desiredRoles.has(r)).length;
        
        const existingOutletAssignments = new Map(
          editingUser.outlet_role_assignments.map(a => [a.outlet_id, new Set(a.role_codes)])
        );
        const desiredOutletAssignments = new Map(
          accessFormData.outlet_role_assignments.map(a => [a.outlet_id, new Set(a.role_codes)])
        );
        
        let outletRoleAdditions = 0;
        let outletRoleRemovals = 0;
        
        // Count additions and modifications
        for (const [outletId, roles] of desiredOutletAssignments) {
          const existing = existingOutletAssignments.get(outletId) ?? new Set<string>();
          for (const role of roles) {
            if (!existing.has(role)) outletRoleAdditions++;
          }
        }
        
        // Count removals
        for (const [outletId, roles] of existingOutletAssignments) {
          const desired = desiredOutletAssignments.get(outletId) ?? new Set<string>();
          for (const role of roles) {
            if (!desired.has(role)) outletRoleRemovals++;
          }
        }
        
        // Count outlet assignment removals (outlets removed entirely)
        for (const outletId of existingOutletAssignments.keys()) {
          if (!desiredOutletAssignments.has(outletId)) {
            outletRoleRemovals += existingOutletAssignments.get(outletId)!.size;
          }
        }
        
        const deltaSize = globalRoleAdditions + globalRoleRemovals + outletRoleAdditions + outletRoleRemovals;
        
        try {
          // Update global roles
          if (accessFormData.global_role_codes) {
            await updateUserRoles(editingUser.id, {
              role_codes: accessFormData.global_role_codes as Role[]
            }, accessToken);
          }
          
          // Update outlet roles in parallel
          const existingOutletIds = new Set(
            editingUser.outlet_role_assignments.map((assignment) => assignment.outlet_id)
          );
          const desiredOutletIds = new Set(
            accessFormData.outlet_role_assignments.map((assignment) => assignment.outlet_id)
          );

          const updatePromises = accessFormData.outlet_role_assignments.map((assignment) =>
            updateUserRoles(editingUser.id, {
              outlet_id: assignment.outlet_id,
              role_codes: assignment.role_codes as Role[]
            }, accessToken)
          );

          const deletePromises = [...existingOutletIds]
            .filter(outletId => !desiredOutletIds.has(outletId))
            .map(outletId =>
              updateUserRoles(editingUser.id, {
                outlet_id: outletId,
                role_codes: []
              }, accessToken)
            );

          await Promise.all([...updatePromises, ...deletePromises]);

          const latencyMs = Date.now() - accessStartTime;
          trackActionSelect("users", actorRole, "update-access", "success");
          
          // Audit log with delta and latency  
          console.log(JSON.stringify({
            event: "access-update",
            page: "users",
            actorRole,
            targetUserId: editingUser.id,
            targetUserEmail: editingUser.email,
            deltaSize,
            latencyMs,
            globalRoleAdditions,
            globalRoleRemovals,
            outletRoleAdditions,
            outletRoleRemovals,
            outcome: "success",
            timestamp: Date.now()
          }));

          setSuccessMessage("User access updated successfully");
          await usersQuery.refetch({ force: true });
          closeDialog();
        } catch (accessError) {
          const errorMsg = accessError instanceof ApiError ? accessError.message : "Failed to update access";
          setError(errorMsg);
          trackActionError("users", actorRole, "update-access", errorMsg);
        }
      } else if (dialogMode === "password" && editingUser) {
        await updateUserPassword(editingUser.id, {
          password: formData.password
        }, accessToken);
        setSuccessMessage("Password changed successfully");
        closeDialog();
      }
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError("An error occurred");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const outletRoleCodesFor = (outletId: number) =>
    formData.outlet_role_assignments.find((assignment) => assignment.outlet_id === outletId)
      ?.role_codes ?? [];

  const mutateOutletRoleAssignments = (
    mutate: (roleMap: Map<number, Set<string>>) => void
  ) => {
    setFormData((prev) => {
      const roleMap = new Map<number, Set<string>>(
        prev.outlet_role_assignments.map((assignment) => [assignment.outlet_id, new Set(assignment.role_codes)])
      );
      mutate(roleMap);
      const nextAssignments = [...roleMap.entries()]
        .filter(([, roleCodes]) => roleCodes.size > 0)
        .map(([outlet_id, roleCodes]) => ({ outlet_id, role_codes: [...roleCodes] }));
      return { ...prev, outlet_role_assignments: nextAssignments };
    });
  };

  const updateOutletRoleCode = (outletId: number, roleCode: string, checked: boolean) => {
    mutateOutletRoleAssignments((roleMap) => {
      const roleSet = roleMap.get(outletId) ?? new Set<string>();
      if (checked) {
        roleSet.add(roleCode);
      } else {
        roleSet.delete(roleCode);
      }
      if (roleSet.size === 0) {
        roleMap.delete(outletId);
      } else {
        roleMap.set(outletId, roleSet);
      }
    });
  };

  const setOutletRoleCodeForOutlets = (outletIds: number[], roleCode: string, checked: boolean) => {
    if (outletIds.length === 0) {
      return;
    }
    mutateOutletRoleAssignments((roleMap) => {
      outletIds.forEach((outletId) => {
        const roleSet = roleMap.get(outletId) ?? new Set<string>();
        if (checked) {
          roleSet.add(roleCode);
        } else {
          roleSet.delete(roleCode);
        }
        if (roleSet.size === 0) {
          roleMap.delete(outletId);
        } else {
          roleMap.set(outletId, roleSet);
        }
      });
    });
  };

  const setAllAssignableRoleCodesForOutlets = (outletIds: number[]) => {
    if (outletIds.length === 0) {
      return;
    }
    const assignableRoleCodes = outletRoleOptions
      .filter((role) => role.role_level < actorMaxRoleLevel)
      .map((role) => role.code);
    mutateOutletRoleAssignments((roleMap) => {
      outletIds.forEach((outletId) => {
        roleMap.set(outletId, new Set(assignableRoleCodes));
      });
    });
  };

  const clearOutletRolesForOutlets = (outletIds: number[]) => {
    if (outletIds.length === 0) {
      return;
    }
    mutateOutletRoleAssignments((roleMap) => {
      outletIds.forEach((outletId) => {
        roleMap.delete(outletId);
      });
    });
  };
  
  // Access form outlet role functions
  const accessOutletRoleCodesFor = (outletId: number) =>
    accessFormData.outlet_role_assignments.find((assignment) => assignment.outlet_id === outletId)
      ?.role_codes ?? [];

  const mutateAccessOutletRoleAssignments = (
    mutate: (roleMap: Map<number, Set<string>>) => void
  ) => {
    setAccessFormData((prev) => {
      const roleMap = new Map<number, Set<string>>(
        prev.outlet_role_assignments.map((assignment) => [assignment.outlet_id, new Set(assignment.role_codes)])
      );
      mutate(roleMap);
      const nextAssignments = [...roleMap.entries()]
        .filter(([, roleCodes]) => roleCodes.size > 0)
        .map(([outlet_id, roleCodes]) => ({ outlet_id, role_codes: [...roleCodes] }));
      return { ...prev, outlet_role_assignments: nextAssignments };
    });
    setHasUnsavedChanges(true);
  };

  const updateAccessOutletRoleCode = (outletId: number, roleCode: string, checked: boolean) => {
    mutateAccessOutletRoleAssignments((roleMap) => {
      const roleSet = roleMap.get(outletId) ?? new Set<string>();
      if (checked) {
        roleSet.add(roleCode);
      } else {
        roleSet.delete(roleCode);
      }
      if (roleSet.size === 0) {
        roleMap.delete(outletId);
      } else {
        roleMap.set(outletId, roleSet);
      }
    });
  };

  const setAccessOutletRoleCodeForOutlets = (outletIds: number[], roleCode: string, checked: boolean) => {
    if (outletIds.length === 0) {
      return;
    }
    mutateAccessOutletRoleAssignments((roleMap) => {
      outletIds.forEach((outletId) => {
        const roleSet = roleMap.get(outletId) ?? new Set<string>();
        if (checked) {
          roleSet.add(roleCode);
        } else {
          roleSet.delete(roleCode);
        }
        if (roleSet.size === 0) {
          roleMap.delete(outletId);
        } else {
          roleMap.set(outletId, roleSet);
        }
      });
    });
  };

  const setAllAssignableAccessRoleCodesForOutlets = (outletIds: number[]) => {
    if (outletIds.length === 0) {
      return;
    }
    const assignableRoleCodes = outletRoleOptions
      .filter((role) => role.role_level < actorMaxRoleLevel)
      .map((role) => role.code);
    mutateAccessOutletRoleAssignments((roleMap) => {
      outletIds.forEach((outletId) => {
        roleMap.set(outletId, new Set(assignableRoleCodes));
      });
    });
  };

  const clearAccessOutletRolesForOutlets = (outletIds: number[]) => {
    if (outletIds.length === 0) {
      return;
    }
    mutateAccessOutletRoleAssignments((roleMap) => {
      outletIds.forEach((outletId) => {
        roleMap.delete(outletId);
      });
    });
  };
  
  const handleDeactivate = async (targetUser: UserResponse) => {
    if (targetUser.id === user.id) {
      setError("You cannot deactivate your own account.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    
    try {
      await deactivateUser(targetUser.id, accessToken);
      setSuccessMessage("User deactivated successfully");
      await usersQuery.refetch({ force: true });
    } catch (deactivateError) {
      const errorMsg = deactivateError instanceof ApiError 
        ? deactivateError.message 
        : "Failed to deactivate user";
      setError(errorMsg);
      trackActionError("users", user.global_roles[0] ?? "UNKNOWN", "deactivate", errorMsg);
    }
  };
  
  const handleReactivate = async (targetUser: UserResponse) => {
    if (targetUser.id === user.id) {
      setError("You cannot reactivate your own account.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    
    try {
      await reactivateUser(targetUser.id, accessToken);
      setSuccessMessage("User reactivated successfully");
      await usersQuery.refetch({ force: true });
    } catch (reactivateError) {
      const errorMsg = reactivateError instanceof ApiError 
        ? reactivateError.message 
        : "Failed to reactivate user";
      setError(errorMsg);
      trackActionError("users", user.global_roles[0] ?? "UNKNOWN", "reactivate", errorMsg);
    }
  };

  async function handleConfirmUserStatus() {
    if (!confirmState) {
      return;
    }

    try {
      if (confirmState.action === "deactivate") {
        await handleDeactivate(confirmState.user);
      } else {
        await handleReactivate(confirmState.user);
      }
    } finally {
      setConfirmState(null);
    }
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearchQuery(searchTerm.trim());
      resetPagination();
    }, 300);

    return () => {
      window.clearTimeout(handle);
    };
  }, [searchTerm, resetPagination]);

  useEffect(() => {
    if (isSuperAdmin && companiesQuery.data && companiesQuery.data.length > 0) {
      if (!companiesQuery.data.some((company) => company.id === selectedCompanyId)) {
        setSelectedCompanyId(companiesQuery.data[0].id);
      }
    }
  }, [companiesQuery.data, isSuperAdmin]); // Remove selectedCompanyId from dependencies to prevent infinite loop

  useEffect(() => {
    setOutletFilter("all");
  }, [selectedCompanyId]);

  const columns = useMemo<DataTableColumnDef<UserResponse>[]>(() => {
    return [
      {
        id: "user",
        header: "User",
        sortable: true,
        cell: (info) => {
          const user = info.row.original;
          return (
            <Stack gap="xs">
              <Text fw={500} size="sm">{user.email}</Text>
              <Group gap="xs" align="center">
                <Text size="xs" c="dimmed">
                  ID: {user.id}
                </Text>
                <Text size="xs" c="dimmed">
                  •
                </Text>
                <Text size="xs" c="dimmed">
                  {new Date(user.created_at).toLocaleDateString()}
                </Text>
              </Group>
            </Stack>
          );
        }
      },
      {
        id: "access",
        header: "Roles & Access",
        sortable: true,
        cell: (info) => {
          const globalRoles = info.row.original.global_roles;
          const outletAssignments = info.row.original.outlet_role_assignments;
          
          if (globalRoles.length === 0 && outletAssignments.length === 0) {
            return (
              <Text size="sm" c="dimmed">
                No access assigned
              </Text>
            );
          }
          
          return (
            <Stack gap="xs">
              {/* Global Roles */}
              {globalRoles.length > 0 && (
                <Group gap="xs" wrap="wrap" align="center">
                  <Badge 
                    variant="dot" 
                    color="blue" 
                    size="xs"
                    style={{ textTransform: 'uppercase', fontSize: '10px', fontWeight: 600 }}
                  >
                    Global
                  </Badge>
                  {globalRoles.map((role, index) => (
                    <Badge 
                      key={`global-${role}-${index}`} 
                      variant="filled" 
                      color="blue"
                      size="sm"
                      radius="md"
                    >
                      {role}
                    </Badge>
                  ))}
                </Group>
              )}
              
              {/* Outlet-Specific Roles */}
              {outletAssignments.length > 0 && (
                <Stack gap="xs">
                  {outletAssignments.slice(0, 2).map((assignment) => (
                    <Group key={assignment.outlet_id} gap="xs" wrap="wrap" align="center">
                      <Badge 
                        variant="light" 
                        color="gray" 
                        size="xs"
                        style={{ 
                          minWidth: 'fit-content',
                          textTransform: 'none',
                          fontWeight: 500
                        }}
                      >
                        {assignment.outlet_name}
                      </Badge>
                      {assignment.role_codes.map((role, roleIndex) => (
                        <Badge 
                          key={`outlet-${assignment.outlet_id}-${role}-${roleIndex}`}
                          variant="light" 
                          color="teal"
                          size="sm"
                          radius="md"
                        >
                          {role}
                        </Badge>
                      ))}
                    </Group>
                  ))}
                  
                  {/* Show remaining outlets if more than 2 */}
                  {outletAssignments.length > 2 && (
                    <Group gap="xs" align="center">
                      <Badge 
                        variant="light" 
                        color="gray" 
                        size="xs"
                        title={outletAssignments.slice(2).map(a => `${a.outlet_name}: ${a.role_codes.join(', ')}`).join('\n')}
                        style={{ cursor: 'help' }}
                      >
                        +{outletAssignments.length - 2} more outlet{outletAssignments.length > 3 ? 's' : ''}
                      </Badge>
                    </Group>
                  )}
                </Stack>
              )}
            </Stack>
          );
        }
      },
      {
        id: "status",
        header: "Status",
        sortable: true,
        cell: (info) => {
          const isActive = info.row.original.is_active;
          return (
            <Group gap="xs" align="center">
              <Badge 
                variant="dot" 
                color={isActive ? "green" : "red"}
                size="sm"
              >
                {isActive ? "Active" : "Inactive"}
              </Badge>
              {!isActive && (
                <Text size="xs" c="dimmed">
                  Suspended
                </Text>
              )}
            </Group>
          );
        }
      },
      {
        id: "actions",
        header: "Actions",
        cell: (info) => {
          const targetUser = info.row.original;
          const isSelf = targetUser.id === user.id;
          const isSuperAdminUser = targetUser.global_roles.includes("SUPER_ADMIN");
          const disableEditAction = isSuperAdminUser; // Super-admin users cannot be edited
          const disablePasswordAction = isSuperAdminUser; // Super-admin passwords cannot be changed by others
          const disableRoleAction = isSelf || isSuperAdminUser;
          const disableDeactivateAction = isSelf || isSuperAdminUser;
          const selfTooltip = isSelf ? "You cannot modify your own access." : undefined;
          const superAdminTooltip = isSuperAdminUser ? "Cannot modify SUPER_ADMIN user." : undefined;
          const editTooltip = isSuperAdminUser ? superAdminTooltip : undefined;
          const passwordTooltip = isSuperAdminUser ? superAdminTooltip : undefined;
          const roleTooltip = isSuperAdminUser ? superAdminTooltip : selfTooltip;
          const deactivateTooltip = isSuperAdminUser ? superAdminTooltip : selfTooltip;

          const actorRole = user.global_roles[0] ?? "UNKNOWN";

          return (
            <Menu>
              <Menu.Target>
                <ActionIcon 
                  variant="subtle" 
                  size="sm"
                  onClick={() => trackActionMenuOpen("users", actorRole)}
                >
                  <IconDots size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconEdit size={14} />}
                  onClick={() => {
                    trackActionSelect("users", actorRole, "edit-user", "success");
                    openAccountDialog(targetUser);
                  }}
                  disabled={disableEditAction}
                  title={editTooltip}
                >
                  Edit User
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconShield size={14} />}
                  onClick={() => {
                    trackActionSelect("users", actorRole, "manage-roles", "success");
                    openAccessDialog(targetUser);
                  }}
                  disabled={disableRoleAction}
                  title={roleTooltip}
                >
                  Manage Roles
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconBuildingStore size={14} />}
                  onClick={() => {
                    trackActionSelect("users", actorRole, "assign-outlets", "success");
                    openAccessDialog(targetUser);
                  }}
                  disabled={disableRoleAction}
                  title={roleTooltip}
                >
                  Assign Outlets
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconLock size={14} />}
                  onClick={() => {
                    trackActionSelect("users", actorRole, "change-password", "success");
                    openPasswordDialog(targetUser);
                  }}
                  disabled={disablePasswordAction}
                  title={passwordTooltip}
                >
                  Change Password
                </Menu.Item>
                
                <Menu.Divider />
                
                {targetUser.is_active ? (
                  <Menu.Item
                    leftSection={<IconBan size={14} />}
                    color="red"
                    onClick={() => {
                      trackActionSelect("users", actorRole, "deactivate", "success");
                      setConfirmState({ action: "deactivate", user: targetUser });}}
                    disabled={disableDeactivateAction}
                    title={deactivateTooltip}
                  >
                    Deactivate
                  </Menu.Item>
                ) : (
                  <Menu.Item
                    leftSection={<IconCheck size={14} />}
                    color="green"
                    onClick={() => {
                      trackActionSelect("users", actorRole, "reactivate", "success");
                      setConfirmState({ action: "reactivate", user: targetUser });
                    }}
                    disabled={isSelf}
                    title={selfTooltip}
                  >
                    Reactivate
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          );
        }
      }
    ];
  }, [openAccountDialog, openAccessDialog, openPasswordDialog, user.id]);
  
  return (
    <>
      <Stack gap="md">
        <PageCard
          title="User Management"
          description="Manage user accounts, assign roles, and control access permissions across your organization."
          actions={
            <Group gap="sm">
              <Button
                variant="light"
                onClick={() => usersQuery.refetch({ force: true })}
                loading={usersQuery.loading}
                leftSection={<IconRefresh size={16} />}
                size="sm"
              >
                Refresh
              </Button>
              <Button
                onClick={openCreateDialog}
                disabled={isSuperAdmin && companyOptions.length === 0}
                leftSection={<IconUserPlus size={16} />}
                size="sm"
              >
                Add User
              </Button>
            </Group>
          }
        >
          <Stack gap="sm">
            {error ? (
              <Alert color="red" title="Action failed">
                {error}
              </Alert>
            ) : null}
            {successMessage ? (
              <Alert color="green" title="Success">
                {successMessage}
              </Alert>
            ) : null}
          </Stack>
        </PageCard>

        <PageCard title="Filters">
          <FilterBar onClearAll={clearAllFilters} showClearAll={hasActiveFilters}>
            {isSuperAdmin ? (
              <Select
                label="Company"
                placeholder={companyOptions.length === 0 ? "No companies available" : "Select company"}
                data={companyOptions}
                value={companyOptions.length === 0 ? "" : String(selectedCompanyId)}
                onChange={(value) => setSelectedCompanyId(Number(value ?? 0))}
                disabled={companyOptions.length === 0}
                style={filterStyles.company}
              />
            ) : null}

            <TextInput
              label="Search Users"
              placeholder="Search by email or name..."
              value={searchTerm}
              onChange={handleSearchChange}
              style={filterStyles.search}
              leftSection={<IconSearch size={16} />}
              rightSection={
                searchTerm && (
                  <ActionIcon
                    size="sm"
                    variant="transparent"
                    onClick={() => setSearchTerm("")}
                  >
                    <IconX size={12} />
                  </ActionIcon>
                )
              }
            />

            <Select
              label="Status"
              placeholder="All statuses"
              data={statusFilterOptions}
              value={statusFilter}
              onChange={handleStatusFilterChange}
              style={filterStyles.status}
              leftSection={<IconUserCheck size={16} />}
            />

            <Select
              label="Role"
              placeholder="All roles"
              data={roleOptions}
              value={roleFilter}
              onChange={handleRoleFilterChange}
              style={filterStyles.role}
              leftSection={<IconShield size={16} />}
            />

            <Select
              label="Outlet"
              placeholder="All outlets"
              data={outletOptions}
              value={outletFilter}
              onChange={handleOutletFilterChange}
              style={filterStyles.outlet}
              leftSection={<IconBuildingStore size={16} />}
            />
          </FilterBar>
        </PageCard>

        <PageCard>
          <Stack gap="md">
            <Group gap="sm" align="center" justify="space-between">
              <Group gap="sm" align="center">
                <Text fw={600} size="lg">Users</Text>
                <Badge variant="light" color="blue" size="lg">
                  {filteredUsers.length}
                </Badge>
                {hasActiveFilters && (
                  <Badge variant="light" color="orange" size="sm">
                    Filtered
                  </Badge>
                )}
                {usersQuery.totalCount > filteredUsers.length && (
                  <Text size="sm" c="dimmed">
                    of {usersQuery.totalCount} total
                  </Text>
                )}
              </Group>
            </Group>
          <DataTable
            columns={columns}
            data={filteredUsers}
            getRowId={(row) => String(row.id)}
            loading={tableLoadingState}
            error={tableError}
            pagination={pagination}
            sort={sort}
            selection={selection}
            totalCount={usersQuery.totalCount}
            onPaginationChange={setPagination}
            onSortChange={setSort}
            onSelectionChange={setSelection}
            onRetry={() => usersQuery.refetch({ force: true })}
            minWidth={900}
            emptyState={
              searchTerm.trim().length > 0
                ? "No users match your search."
                : "No users found."
            }
            />
          </Stack>
        </PageCard>
      </Stack>

      <Modal
        opened={dialogMode !== null}
        onClose={closeDialog}
        title={
          <Title order={4}>
            {dialogMode === "account-create" && "Create New User"}
            {dialogMode === "account-edit" && "Edit Account"}
            {dialogMode === "access-create" && "Grant Access"}
            {dialogMode === "access-edit" && "Manage Access"}
            {dialogMode === "password" && "Change Password"}
          </Title>
        }
        centered
        size="lg"
        closeOnClickOutside={!hasUnsavedChanges}
        closeOnEscape={!hasUnsavedChanges}
      >
        <Stack gap="md">
          {(dialogMode === "account-create" || dialogMode === "account-edit") && (
            <>
              <TextInput
                label="Email"
                placeholder="user@example.com"
                value={accountFormData.email}
                onChange={(event) => {
                  setAccountFormData({ ...accountFormData, email: event.currentTarget.value });
                  setHasUnsavedChanges(true);
                }}
                error={formErrors.email}
                withAsterisk
                aria-label="Email address"
              />

              {dialogMode === "account-create" && isSuperAdmin ? (
                <Select
                  label="Company"
                  placeholder="Select company"
                  data={companyOptions}
                  value={formData.company_id ? String(formData.company_id) : ""}
                  onChange={(value) => {
                    const nextValue = value ? Number(value) : null;
                    setFormData({
                      ...formData,
                      company_id: nextValue,
                      outlet_role_assignments: []
                    });
                    setHasUnsavedChanges(true);
                  }}
                  error={formErrors.company_id}
                  disabled={companyOptions.length === 0}
                  withAsterisk
                  aria-label="Company selection"
                />
              ) : null}

              {dialogMode === "account-create" ? (
                <TextInput
                  label="Password"
                  placeholder="Minimum 8 characters"
                  type="password"
                  value={accountFormData.password}
                  onChange={(event) => {
                    setAccountFormData({ ...accountFormData, password: event.currentTarget.value });
                    setHasUnsavedChanges(true);
                  }}
                  error={formErrors.password}
                  withAsterisk
                  aria-label="Password"
                />
              ) : null}

              <Checkbox
                label="Active"
                checked={accountFormData.is_active}
                onChange={(event) => {
                  setAccountFormData({ ...accountFormData, is_active: event.currentTarget.checked });
                  setHasUnsavedChanges(true);
                }}
                aria-label="User active status"
              />
            </>
          )}

          {(dialogMode === "access-create" || dialogMode === "access-edit") && (
            <>
              <Select
                label="Global Role"
                description="A user can have only one global role"
                placeholder="Select a global role (optional)"
                value={accessFormData.global_role_codes[0] ?? ""}
                onChange={(value) => {
                  setAccessFormData({ ...accessFormData, global_role_codes: value ? [value] : [] });
                  setHasUnsavedChanges(true);
                }}
                data={globalRoleOptions
                  .filter((role) => role.role_level < actorMaxRoleLevel)
                  .map((role) => ({ value: role.code, label: role.name }))}
                allowDeselect
                aria-label="Global role selection"
              />

              <OutletRoleMatrix
                title="Outlet Roles"
                outlets={outletsQuery.data || []}
                roles={outletRoleOptions}
                actorMaxRoleLevel={actorMaxRoleLevel}
                maxHeight={300}
                outletRoleCodesFor={accessOutletRoleCodesFor}
                onUpdateRoleCode={updateAccessOutletRoleCode}
                onSetRoleForOutlets={setAccessOutletRoleCodeForOutlets}
                onSetAllAssignableRolesForOutlets={setAllAssignableAccessRoleCodesForOutlets}
                onClearRolesForOutlets={clearAccessOutletRolesForOutlets}
              />
            </>
          )}

          {dialogMode === "password" ? (
            <TextInput
              label="New Password"
              placeholder="Minimum 8 characters"
              type="password"
              value={formData.password}
              onChange={(event) => setFormData({ ...formData, password: event.currentTarget.value })}
              error={formErrors.password}
              withAsterisk
              aria-label="New password"
            />
          ) : null}

          {error ? (
            <Alert color="red" title="Unable to save" role="alert" aria-live="polite">
              {error}
            </Alert>
          ) : null}

          <Group justify="flex-end">
            <Button variant="default" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={submitting}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={confirmState !== null}
        onClose={() => setConfirmState(null)}
        title={<Title order={4}>Confirm Action</Title>}
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            {confirmState?.action === "deactivate"
              ? `Deactivate user ${confirmState?.user.email ?? ""}?`
              : `Reactivate user ${confirmState?.user.email ?? ""}?`}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmState(null)}>
              Cancel
            </Button>
            <Button
              color={confirmState?.action === "deactivate" ? "red" : "blue"}
              onClick={handleConfirmUserStatus}
            >
              {confirmState?.action === "deactivate" ? "Deactivate" : "Reactivate"}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Dirty confirmation dialog for unsaved changes */}
      <DirtyConfirmDialog
        opened={showDirtyConfirm}
        onConfirm={handleDirtyConfirm}
        onCancel={handleDirtyCancel}
        title="Unsaved Changes"
        message="You have unsaved changes. Are you sure you want to discard them?"
        confirmText="Discard"
        cancelText="Keep Editing"
      />

      {/* Accessibility: aria-live region for status announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: "0",
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: "0"
        }}
      >
        {successMessage}
      </div>
    </>
  );
}
