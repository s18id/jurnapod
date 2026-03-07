// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  Title
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
import { FilterBar } from "../components/FilterBar";
import { PageCard } from "../components/PageCard";
import type { OutletResponse, Role, RoleResponse, UserResponse } from "@jurnapod/shared";

type UsersPageProps = {
  user: SessionUser;
  accessToken: string;
};

type DialogMode = "create" | "edit" | "roles" | "outlets" | "password" | null;

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

type OutletRoleAssignmentsFieldProps = {
  title: string;
  outlets: OutletResponse[];
  roles: RoleResponse[];
  actorMaxRoleLevel: number;
  maxHeight: number;
  outletRoleCodesFor: (outletId: number) => string[];
  onUpdateRoleCode: (outletId: number, roleCode: string, checked: boolean) => void;
  onSetRoleForOutlets: (outletIds: number[], roleCode: string, checked: boolean) => void;
  onSetAllAssignableRolesForOutlets: (outletIds: number[]) => void;
  onClearRolesForOutlets: (outletIds: number[]) => void;
};

function OutletRoleAssignmentsField(props: OutletRoleAssignmentsFieldProps) {
  const {
    title,
    outlets,
    roles,
    actorMaxRoleLevel,
    maxHeight,
    outletRoleCodesFor,
    onUpdateRoleCode,
    onSetRoleForOutlets,
    onSetAllAssignableRolesForOutlets,
    onClearRolesForOutlets
  } = props;
  const [searchValue, setSearchValue] = useState("");

  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredOutlets = useMemo(
    () =>
      outlets.filter((outlet) => {
        if (!normalizedSearch) {
          return true;
        }
        const haystack = `${outlet.name} ${outlet.code}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      }),
    [normalizedSearch, outlets]
  );

  const assignableRoles = useMemo(
    () => roles.filter((role) => role.role_level < actorMaxRoleLevel),
    [roles, actorMaxRoleLevel]
  );

  const filteredOutletIds = useMemo(() => filteredOutlets.map((outlet) => outlet.id), [filteredOutlets]);
  const totalSelectedRoleCount = useMemo(
    () =>
      outlets.reduce((count, outlet) => {
        const selected = outletRoleCodesFor(outlet.id);
        return count + selected.length;
      }, 0),
    [outletRoleCodesFor, outlets]
  );
  const selectedOutletCount = useMemo(
    () => outlets.filter((outlet) => outletRoleCodesFor(outlet.id).length > 0).length,
    [outletRoleCodesFor, outlets]
  );
  const hasSelectionInFilteredOutlets = useMemo(
    () => filteredOutlets.some((outlet) => outletRoleCodesFor(outlet.id).length > 0),
    [filteredOutlets, outletRoleCodesFor]
  );

  return (
    <div>
      <Text fw={600} size="sm" mb={4}>
        {title}
      </Text>
      <Text size="xs" c="dimmed" mb="xs" role="status" aria-live="polite">
        {selectedOutletCount} outlets assigned, {totalSelectedRoleCount} role selections total.
      </Text>

      <Stack gap="xs" mb="sm">
        <TextInput
          label="Search outlets"
          placeholder="Search by outlet name or code"
          value={searchValue}
          onChange={(event) => setSearchValue(event.currentTarget.value)}
        />
        <Group gap="xs" wrap="wrap">
          <Button
            size="xs"
            variant="default"
            onClick={() => onClearRolesForOutlets(filteredOutletIds)}
            disabled={filteredOutletIds.length === 0 || !hasSelectionInFilteredOutlets}
          >
            Clear filtered outlets
          </Button>
          {assignableRoles.map((role) => (
            <Button
              key={`bulk-add-${role.code}`}
              size="xs"
              variant="light"
              onClick={() => onSetRoleForOutlets(filteredOutletIds, role.code, true)}
              disabled={filteredOutletIds.length === 0}
            >
              Add {role.name} to filtered
            </Button>
          ))}
        </Group>
      </Stack>

      <ScrollArea h={maxHeight} type="auto">
        <Stack gap="sm">
          {outlets.length === 0 ? (
            <Text size="sm" c="dimmed">
              No outlets available.
            </Text>
          ) : roles.length === 0 ? (
            <Text size="sm" c="dimmed">
              No outlet-scoped roles available.
            </Text>
          ) : filteredOutlets.length === 0 ? (
            <Text size="sm" c="dimmed">
              No outlets match your search.
            </Text>
          ) : (
            <Accordion variant="separated" multiple>
              {filteredOutlets.map((outlet) => {
                const selectedRoleCodes = outletRoleCodesFor(outlet.id);
                return (
                  <Accordion.Item key={outlet.id} value={String(outlet.id)}>
                    <Accordion.Control>
                      <Group justify="space-between" wrap="nowrap">
                        <div>
                          <Text size="sm" fw={600}>
                            {outlet.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {outlet.code}
                          </Text>
                        </div>
                        <Badge variant="light" color={selectedRoleCodes.length > 0 ? "teal" : "gray"}>
                          {selectedRoleCodes.length} selected
                        </Badge>
                      </Group>
                    </Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="xs">
                        <Group gap="xs" wrap="wrap">
                          <Button
                            size="xs"
                            variant="subtle"
                            onClick={() => onSetAllAssignableRolesForOutlets([outlet.id])}
                            disabled={assignableRoles.length === 0}
                          >
                            Select all assignable
                          </Button>
                          <Button
                            size="xs"
                            variant="subtle"
                            color="red"
                            onClick={() => onClearRolesForOutlets([outlet.id])}
                            disabled={selectedRoleCodes.length === 0}
                          >
                            Clear outlet
                          </Button>
                        </Group>

                        {roles.map((role) => {
                          const checked = selectedRoleCodes.includes(role.code);
                          const disabled = role.role_level >= actorMaxRoleLevel;
                          return (
                            <Checkbox
                              key={`${outlet.id}-${role.code}`}
                              label={role.name}
                              description={
                                disabled
                                  ? `Requires higher privilege. ${ROLE_HELP_TEXT[role.code] ?? ""}`.trim()
                                  : ROLE_HELP_TEXT[role.code] ?? "Outlet-scoped operational role."
                              }
                              checked={checked}
                              disabled={disabled}
                              onChange={(event) =>
                                onUpdateRoleCode(outlet.id, role.code, event.currentTarget.checked)
                              }
                            />
                          );
                        })}
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                );
              })}
            </Accordion>
          )}
        </Stack>
      </ScrollArea>
    </div>
  );
}

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
  
  // Dialog state
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingUser, setEditingUser] = useState<UserResponse | null>(null);
  const [formData, setFormData] = useState<UserFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof UserFormData, string>>>({});
  const [confirmState, setConfirmState] = useState<
    { action: "deactivate" | "reactivate"; user: UserResponse } | null
  >(null);
  
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

  const rolesQuery = useRoles(accessToken);
  const companiesQuery = useCompanies(accessToken, { enabled: isSuperAdmin });
  const outletCompanyId =
    isSuperAdmin && dialogMode === "create"
      ? (formData.company_id ?? activeCompanyId)
      : activeCompanyId;
  const outletsQuery = useOutlets(outletCompanyId, accessToken);
  const availableRoles = useMemo(
    () => (rolesQuery.data || []).filter((role) => role.code !== "SUPER_ADMIN"),
    [rolesQuery.data]
  );
  const globalRoleOptions = useMemo(
    () => availableRoles.filter((role) => role.is_global),
    [availableRoles]
  );
  const outletRoleOptions = useMemo(
    () => availableRoles.filter((role) => !role.is_global),
    [availableRoles]
  );

  const actorMaxRoleLevel = useMemo(() => {
    const roleLevels = new Map((rolesQuery.data || []).map((role) => [role.code, role.role_level]));
    const levels = user.roles.map((code) => roleLevels.get(code) ?? 0);
    return Math.max(0, ...levels);
  }, [rolesQuery.data, user.roles]);

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
    setFormErrors({});
    setEditingUser(null);
    setDialogMode("create");
    setError(null);
    setSuccessMessage(null);
  };
  
  const openEditDialog = (targetUser: UserResponse) => {
    setFormData({
      email: targetUser.email,
      password: "",
      global_role_codes: targetUser.global_roles,
      outlet_role_assignments: targetUser.outlet_role_assignments.map((assignment) => ({
        outlet_id: assignment.outlet_id,
        role_codes: assignment.role_codes
      })),
      is_active: targetUser.is_active
    });
    setFormErrors({});
    setEditingUser(targetUser);
    setDialogMode("edit");
    setError(null);
    setSuccessMessage(null);
  };
  
  const openRolesDialog = (targetUser: UserResponse) => {
    setFormData({
      ...emptyForm,
      global_role_codes: targetUser.global_roles
    });
    setFormErrors({});
    setEditingUser(targetUser);
    setDialogMode("roles");
    setError(null);
    setSuccessMessage(null);
  };
  
  const openOutletsDialog = (targetUser: UserResponse) => {
    setFormData({
      ...emptyForm,
      outlet_role_assignments: targetUser.outlet_role_assignments.map((assignment) => ({
        outlet_id: assignment.outlet_id,
        role_codes: assignment.role_codes
      }))
    });
    setFormErrors({});
    setEditingUser(targetUser);
    setDialogMode("outlets");
    setError(null);
    setSuccessMessage(null);
  };
  
  const openPasswordDialog = (targetUser: UserResponse) => {
    setFormData({ ...emptyForm, password: "" });
    setFormErrors({});
    setEditingUser(targetUser);
    setDialogMode("password");
    setError(null);
    setSuccessMessage(null);
  };
  
  const closeDialog = () => {
    setDialogMode(null);
    setEditingUser(null);
    setFormData(emptyForm);
    setFormErrors({});
  };
  
  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof UserFormData, string>> = {};
    
    if (dialogMode === "create" || dialogMode === "edit") {
      if (dialogMode === "create" && isSuperAdmin && !formData.company_id) {
        errors.company_id = "Company is required";
      }
      if (!formData.email.trim()) {
        errors.email = "Email is required";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        errors.email = "Invalid email format";
      }
      
      if (dialogMode === "create" && !formData.password) {
        errors.password = "Password is required";
      }
      
      if (formData.password && formData.password.length < 8) {
        errors.password = "Password must be at least 8 characters";
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
  
  const handleSubmit = async () => {
    if (!validateForm()) return;
    
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    
    try {
      if (dialogMode === "create") {
        const targetCompanyId = isSuperAdmin
          ? (formData.company_id ?? activeCompanyId)
          : activeCompanyId;
        await createUser({
          company_id: targetCompanyId,
          email: formData.email,
          password: formData.password,
          role_codes:
            formData.global_role_codes.length > 0
              ? (formData.global_role_codes as Role[])
              : undefined,
          outlet_role_assignments:
            formData.outlet_role_assignments.length > 0
              ? formData.outlet_role_assignments.map((assignment) => ({
                  outlet_id: assignment.outlet_id,
                  role_codes: assignment.role_codes as Role[]
                }))
              : undefined,
          is_active: formData.is_active
        }, accessToken);
        setSuccessMessage("User created successfully");
        await usersQuery.refetch({ force: true });
        closeDialog();
      } else if (dialogMode === "edit" && editingUser) {
        await updateUser(editingUser.id, {
          email: formData.email !== editingUser.email ? formData.email : undefined
        }, accessToken);
        setSuccessMessage("User updated successfully");
        await usersQuery.refetch({ force: true });
        closeDialog();
      } else if (dialogMode === "roles" && editingUser) {
        if (editingUser.id === user.id) {
          setError("You cannot update your own roles.");
          return;
        }
        await updateUserRoles(editingUser.id, {
          role_codes: formData.global_role_codes as Role[]
        }, accessToken);
        setSuccessMessage("User roles updated successfully");
        await usersQuery.refetch({ force: true });
        closeDialog();
      } else if (dialogMode === "outlets" && editingUser) {
        if (editingUser.id === user.id) {
          setError("You cannot update your own outlet roles.");
          return;
        }
        const existingOutletIds = new Set(
          editingUser.outlet_role_assignments.map((assignment) => assignment.outlet_id)
        );
        const desiredOutletIds = new Set(
          formData.outlet_role_assignments.map((assignment) => assignment.outlet_id)
        );

        // Update outlet roles in parallel (much faster for users with many outlets)
        const updatePromises = formData.outlet_role_assignments.map((assignment) =>
          updateUserRoles(editingUser.id, {
            outlet_id: assignment.outlet_id,
            role_codes: assignment.role_codes as Role[]
          }, accessToken)
        );

        // Remove roles from outlets that are no longer assigned (also in parallel)
        const deletePromises = [...existingOutletIds]
          .filter(outletId => !desiredOutletIds.has(outletId))
          .map(outletId =>
            updateUserRoles(editingUser.id, {
              outlet_id: outletId,
              role_codes: []
            }, accessToken)
          );

        // Wait for all updates and deletes to complete
        await Promise.all([...updatePromises, ...deletePromises]);

        setSuccessMessage("User outlet roles updated successfully");
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
      if (deactivateError instanceof ApiError) {
        setError(deactivateError.message);
      } else {
        setError("Failed to deactivate user");
      }
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
      if (reactivateError instanceof ApiError) {
        setError(reactivateError.message);
      } else {
        setError("Failed to reactivate user");
      }
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
          const disableSelfAction = isSelf;
          const disableRoleAction = isSelf || isSuperAdminUser;
          const disableDeactivateAction = isSelf || isSuperAdminUser;
          const selfTooltip = isSelf ? "You cannot modify your own access." : undefined;
          const superAdminTooltip = isSuperAdminUser ? "Cannot modify SUPER_ADMIN user." : undefined;
          const roleTooltip = isSuperAdminUser ? superAdminTooltip : selfTooltip;
          const deactivateTooltip = isSuperAdminUser ? superAdminTooltip : selfTooltip;
          return (
            <Group gap="xs" justify="flex-end" wrap="wrap">
              <Button
                size="xs"
                variant="light"
                onClick={() => openEditDialog(targetUser)}
              >
                Edit
              </Button>
              <Button
                size="xs"
                variant="light"
                onClick={() => openRolesDialog(targetUser)}
                disabled={disableRoleAction}
                title={roleTooltip}
              >
                Roles
              </Button>
              <Button
                size="xs"
                variant="light"
                onClick={() => openOutletsDialog(targetUser)}
                disabled={disableRoleAction}
                title={roleTooltip}
              >
                Outlet Roles
              </Button>
              <Button
                size="xs"
                variant="light"
                onClick={() => openPasswordDialog(targetUser)}
              >
                Password
              </Button>
              {targetUser.is_active ? (
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  onClick={() => setConfirmState({ action: "deactivate", user: targetUser })}
                  disabled={disableDeactivateAction}
                  title={deactivateTooltip}
                >
                  Deactivate
                </Button>
              ) : (
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => setConfirmState({ action: "reactivate", user: targetUser })}
                  disabled={disableSelfAction}
                  title={selfTooltip}
                >
                  Reactivate
                </Button>
              )}
            </Group>
          );
        }
      }
    ];
  }, [openEditDialog, openOutletsDialog, openPasswordDialog, openRolesDialog, user.id]);
  
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
          <FilterBar>
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
            {dialogMode === "create" && "Create New User"}
            {dialogMode === "edit" && "Edit User"}
            {dialogMode === "roles" && "Manage User Roles"}
            {dialogMode === "outlets" && "Manage Outlet Roles"}
            {dialogMode === "password" && "Change Password"}
          </Title>
        }
        centered
        size="lg"
      >
        <Stack gap="md">
          {(dialogMode === "create" || dialogMode === "edit") && (
            <TextInput
              label="Email"
              placeholder="user@example.com"
              value={formData.email}
              onChange={(event) => setFormData({ ...formData, email: event.currentTarget.value })}
              error={formErrors.email}
              withAsterisk
            />
          )}

          {dialogMode === "create" && isSuperAdmin ? (
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
              }}
              error={formErrors.company_id}
              disabled={companyOptions.length === 0}
              withAsterisk
            />
          ) : null}

          {dialogMode === "create" ? (
            <TextInput
              label="Password"
              placeholder="Minimum 8 characters"
              type="password"
              value={formData.password}
              onChange={(event) => setFormData({ ...formData, password: event.currentTarget.value })}
              error={formErrors.password}
              withAsterisk
            />
          ) : null}

          {dialogMode === "create" ? (
            <Stack gap="sm">
              <Select
                label="Global Role"
                description="A user can have only one global role"
                placeholder="Select a global role (optional)"
                value={formData.global_role_codes[0] ?? ""}
                onChange={(value) => setFormData({ ...formData, global_role_codes: value ? [value] : [] })}
                data={globalRoleOptions
                  .filter((role) => role.role_level < actorMaxRoleLevel)
                  .map((role) => ({ value: role.code, label: role.name }))}
                allowDeselect
              />

              <OutletRoleAssignmentsField
                title="Outlet Roles"
                outlets={outletsQuery.data || []}
                roles={outletRoleOptions}
                actorMaxRoleLevel={actorMaxRoleLevel}
                maxHeight={300}
                outletRoleCodesFor={outletRoleCodesFor}
                onUpdateRoleCode={updateOutletRoleCode}
                onSetRoleForOutlets={setOutletRoleCodeForOutlets}
                onSetAllAssignableRolesForOutlets={setAllAssignableRoleCodesForOutlets}
                onClearRolesForOutlets={clearOutletRolesForOutlets}
              />

              <Checkbox
                label="Active"
                checked={formData.is_active}
                onChange={(event) => setFormData({ ...formData, is_active: event.currentTarget.checked })}
              />
            </Stack>
          ) : null}

          {dialogMode === "roles" ? (
            <Select
              label="Global Role"
              description="A user can have only one global role"
              placeholder="Select a global role (optional)"
              value={formData.global_role_codes[0] ?? ""}
              onChange={(value) => setFormData({ ...formData, global_role_codes: value ? [value] : [] })}
              data={globalRoleOptions
                .filter((role) => role.role_level < actorMaxRoleLevel)
                .map((role) => ({ value: role.code, label: role.name }))}
              allowDeselect
            />
          ) : null}

          {dialogMode === "outlets" ? (
            <OutletRoleAssignmentsField
              title="Select Outlet Roles"
              outlets={outletsQuery.data || []}
              roles={outletRoleOptions}
              actorMaxRoleLevel={actorMaxRoleLevel}
              maxHeight={320}
              outletRoleCodesFor={outletRoleCodesFor}
              onUpdateRoleCode={updateOutletRoleCode}
              onSetRoleForOutlets={setOutletRoleCodeForOutlets}
              onSetAllAssignableRolesForOutlets={setAllAssignableRoleCodesForOutlets}
              onClearRolesForOutlets={clearOutletRolesForOutlets}
            />
          ) : null}

          {dialogMode === "password" ? (
            <TextInput
              label="New Password"
              placeholder="Minimum 8 characters"
              type="password"
              value={formData.password}
              onChange={(event) => setFormData({ ...formData, password: event.currentTarget.value })}
              error={formErrors.password}
              withAsterisk
            />
          ) : null}

          {error ? (
            <Alert color="red" title="Unable to save">
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
    </>
  );
}
