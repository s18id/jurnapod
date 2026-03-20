// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
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
import type { ColumnDef } from "@tanstack/react-table";
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
import { DataTable } from "../components/DataTable";
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
  IconBan,
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

  // Clear all filters function
  const clearAllFilters = () => {
    setSearchTerm("");
    setSearchQuery("");
    setStatusFilter("active");
    setRoleFilter("all");
    setOutletFilter("all");
  };

  // Check if any filters are active (for showing Clear All button)
  const hasActiveFilters = searchTerm !== "" || statusFilter !== "active" || roleFilter !== "all" || outletFilter !== "all";
  
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

  const usersQuery = useUsers(activeCompanyId, accessToken, {
    is_active: statusFilter === "all" ? undefined : statusFilter === "active",
    search: searchQuery || undefined
  });

  const rolesQuery = useRoles(accessToken, activeCompanyId);
  const companiesQuery = useCompanies(accessToken, { enabled: isSuperAdmin });
  const outletCompanyId =
    isSuperAdmin && dialogMode === "account-create"
      ? (formData.company_id ?? activeCompanyId)
      : activeCompanyId;
  const outletsQuery = useOutlets(outletCompanyId, accessToken);

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
  
  // Handlers
  const openCreateDialog = () => {
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
  };
  
  const openAccountDialog = (targetUser: UserResponse) => {
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
  };
  
  const openAccessDialog = (targetUser: UserResponse) => {
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
  };
  
  const openPasswordDialog = (targetUser: UserResponse) => {
    setFormData({ ...emptyForm, password: "" });
    setFormErrors({});
    setEditingUser(targetUser);
    setDialogMode("password");
    setError(null);
    setSuccessMessage(null);
    setHasUnsavedChanges(false);
  };
  
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

        setSuccessMessage("User access updated successfully");
        await usersQuery.refetch({ force: true });
        closeDialog();
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
    }, 300);

    return () => {
      window.clearTimeout(handle);
    };
  }, [searchTerm]);

  useEffect(() => {
    if (isSuperAdmin && companiesQuery.data && companiesQuery.data.length > 0) {
      if (!companiesQuery.data.some((company) => company.id === selectedCompanyId)) {
        setSelectedCompanyId(companiesQuery.data[0].id);
      }
    }
  }, [companiesQuery.data, isSuperAdmin, selectedCompanyId]);

  useEffect(() => {
    setOutletFilter("all");
  }, [selectedCompanyId]);

  const columns = useMemo<ColumnDef<UserResponse>[]>(() => {
    return [
      {
        id: "email",
        header: "Email",
        cell: (info) => <Text>{info.row.original.email}</Text>
      },
      {
        id: "roles",
        header: "Roles",
        cell: (info) => {
          const globalRoles = info.row.original.global_roles;
          const outletRoleSet = new Set<string>();
          info.row.original.outlet_role_assignments.forEach((assignment) => {
            assignment.role_codes.forEach((code) => outletRoleSet.add(code));
          });
          const outletRoles = [...outletRoleSet].filter(
            (code) => !globalRoles.includes(code as Role)
          );
          if (globalRoles.length === 0 && outletRoles.length === 0) {
            return (
              <Text size="sm" c="dimmed">
                No roles
              </Text>
            );
          }
          return (
            <Group gap="xs" wrap="wrap">
              {globalRoles.map((role) => (
                <Badge key={`global-${role}`} variant="light" color="blue">
                  {role}
                </Badge>
              ))}
              {outletRoles.map((role) => (
                <Badge key={`outlet-${role}`} variant="light" color="teal">
                  {role}
                </Badge>
              ))}
            </Group>
          );
        }
      },
      {
        id: "outlets",
        header: "Outlets",
        cell: (info) => {
          const outlets = info.row.original.outlet_role_assignments;
          if (outlets.length === 0) {
            return (
              <Text size="sm" c="dimmed">
                No outlets
              </Text>
            );
          }
          if (outlets.length > 3) {
            const displayOutlets = outlets.slice(0, 2);
            const remaining = outlets.length - 2;
            const allOutletNames = outlets.map(o => o.outlet_name).join(', ');
            return (
              <Group gap="xs" wrap="nowrap">
                {displayOutlets.map((outlet) => (
                  <Badge key={outlet.outlet_id} variant="light" color="yellow" size="sm">
                    {outlet.outlet_name}
                  </Badge>
                ))}
                <Badge variant="light" color="gray" size="sm" title={allOutletNames}>
                  +{remaining} more
                </Badge>
              </Group>
            );
          }
          return (
            <Group gap="xs" wrap="wrap">
              {outlets.map((outlet) => (
                <Badge key={outlet.outlet_id} variant="light" color="yellow">
                  {outlet.outlet_name}
                </Badge>
              ))}
            </Group>
          );
        }
      },
      {
        id: "status",
        header: "Status",
        cell: (info) => (
          <Badge variant="light" color={info.row.original.is_active ? "green" : "red"}>
            {info.row.original.is_active ? "Active" : "Inactive"}
          </Badge>
        )
      },
      {
        id: "actions",
        header: "Actions",
        cell: (info) => {
          const targetUser = info.row.original;
          const isSelf = targetUser.id === user.id;
          const isSuperAdminUser = targetUser.global_roles.includes("SUPER_ADMIN");
          const disableRoleAction = isSelf || isSuperAdminUser;
          const disableDeactivateAction = isSelf || isSuperAdminUser;
          const selfTooltip = isSelf ? "You cannot modify your own access." : undefined;
          const superAdminTooltip = isSuperAdminUser ? "Cannot modify SUPER_ADMIN user." : undefined;
          const roleTooltip = isSuperAdminUser ? superAdminTooltip : selfTooltip;
          const deactivateTooltip = isSuperAdminUser ? superAdminTooltip : selfTooltip;

          const actorRole = user.global_roles[0] ?? "UNKNOWN";

          return (
            <Menu>
              <Menu.Target>
                <ActionIcon variant="subtle" onClick={() => trackActionMenuOpen("users", actorRole)}>
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
                >
                  Change Password
                </Menu.Item>
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
          description="Manage users, roles, and permissions for your organization."
          actions={
            <Button
              onClick={openCreateDialog}
              disabled={isSuperAdmin && companyOptions.length === 0}
            >
              Create User
            </Button>
          }
        >
          <Stack gap="sm">
            {usersQuery.loading ? (
              <Text size="sm" c="dimmed">
                Loading users...
              </Text>
            ) : null}
            {usersQuery.error ? (
              <Alert color="red" title="Unable to load users">
                {usersQuery.error}
              </Alert>
            ) : null}
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
                style={{ minWidth: 240 }}
              />
            ) : null}

            <TextInput
              label="Search"
              placeholder="Search by email"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.currentTarget.value)}
              style={{ minWidth: 220 }}
            />

            <Select
              label="Status"
              data={[
                { value: "all", label: "All Status" },
                { value: "active", label: "Active Only" },
                { value: "inactive", label: "Inactive Only" }
              ]}
              value={statusFilter}
              onChange={(value) => setStatusFilter((value as "all" | "active" | "inactive") || "active")}
              style={{ minWidth: 170 }}
            />

            <Select
              label="Role"
              data={roleOptions}
              value={roleFilter}
              onChange={(value) => setRoleFilter(value || "all")}
              style={{ minWidth: 170 }}
            />

            <Select
              label="Outlet"
              data={outletOptions}
              value={outletFilter}
              onChange={(value) => setOutletFilter(value || "all")}
              style={{ minWidth: 170 }}
            />
          </FilterBar>
        </PageCard>

        <PageCard title={`Users (${filteredUsers.length})`}>
          <DataTable
            columns={columns}
            data={filteredUsers}
            minWidth={900}
            emptyState={
              searchTerm.trim().length > 0
                ? "No users match your search."
                : "No users found."
            }
          />
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
