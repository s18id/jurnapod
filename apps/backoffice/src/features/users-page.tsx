// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import {
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
  updateUserOutlets,
  updateUserPassword,
  deactivateUser,
  reactivateUser
} from "../hooks/use-users";
import { useCompanies } from "../hooks/use-companies";
import { ApiError } from "../lib/api-client";
import { DataTable } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { PageCard } from "../components/PageCard";
import type { UserResponse } from "@jurnapod/shared";

type UsersPageProps = {
  user: SessionUser;
  accessToken: string;
};

type DialogMode = "create" | "edit" | "roles" | "outlets" | "password" | null;

type UserFormData = {
  company_id?: number | null;
  email: string;
  password: string;
  role_codes: string[];
  outlet_ids: number[];
  is_active: boolean;
};

const emptyForm: UserFormData = {
  company_id: null,
  email: "",
  password: "",
  role_codes: [],
  outlet_ids: [],
  is_active: true
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
      result = result.filter((item) => item.roles.includes(roleFilter as any));
    }

    if (outletFilter !== "all") {
      result = result.filter((item) =>
        item.outlets.some((outlet) => String(outlet.id) === outletFilter)
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
      role_codes: targetUser.roles,
      outlet_ids: targetUser.outlets.map(o => o.id),
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
      role_codes: targetUser.roles
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
      outlet_ids: targetUser.outlets.map(o => o.id)
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
          role_codes: formData.role_codes.length > 0 ? formData.role_codes as any : undefined,
          outlet_ids: formData.outlet_ids.length > 0 ? formData.outlet_ids : undefined,
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
          role_codes: formData.role_codes as any
        }, accessToken);
        setSuccessMessage("User roles updated successfully");
        await usersQuery.refetch({ force: true });
        closeDialog();
      } else if (dialogMode === "outlets" && editingUser) {
        if (editingUser.id === user.id) {
          setError("You cannot update your own outlets.");
          return;
        }
        await updateUserOutlets(editingUser.id, {
          outlet_ids: formData.outlet_ids
        }, accessToken);
        setSuccessMessage("User outlets updated successfully");
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
          const roles = info.row.original.roles;
          if (roles.length === 0) {
            return (
              <Text size="sm" c="dimmed">
                No roles
              </Text>
            );
          }
          return (
            <Group gap="xs" wrap="wrap">
              {roles.map((role) => (
                <Badge key={role} variant="light" color="blue">
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
          const outlets = info.row.original.outlets;
          if (outlets.length === 0) {
            return (
              <Text size="sm" c="dimmed">
                No outlets
              </Text>
            );
          }
          return (
            <Group gap="xs" wrap="wrap">
              {outlets.map((outlet) => (
                <Badge key={outlet.id} variant="light" color="yellow">
                  {outlet.name}
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
          const disableSelfAction = isSelf;
          const selfTooltip = isSelf ? "You cannot modify your own access." : undefined;
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
                disabled={disableSelfAction}
                title={selfTooltip}
              >
                Roles
              </Button>
              <Button
                size="xs"
                variant="light"
                onClick={() => openOutletsDialog(targetUser)}
                disabled={disableSelfAction}
                title={selfTooltip}
              >
                Outlets
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
                  disabled={disableSelfAction}
                  title={selfTooltip}
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
              onChange={(value) => setStatusFilter((value as any) || "active")}
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
            {dialogMode === "outlets" && "Manage User Outlets"}
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
                  outlet_ids: []
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
              <div>
                <Text fw={600} size="sm">
                  Roles
                </Text>
                <ScrollArea h={160} type="auto">
                  <Stack gap="xs">
                    {availableRoles.length === 0 ? (
                      <Text size="sm" c="dimmed">
                        No roles available.
                      </Text>
                    ) : (
                      availableRoles.map((role) => (
                        <Checkbox
                          key={role.code}
                          label={role.name}
                          checked={formData.role_codes.includes(role.code)}
                          onChange={(event) => {
                            if (event.currentTarget.checked) {
                              setFormData({
                                ...formData,
                                role_codes: [...formData.role_codes, role.code]
                              });
                            } else {
                              setFormData({
                                ...formData,
                                role_codes: formData.role_codes.filter((code) => code !== role.code)
                              });
                            }
                          }}
                        />
                      ))
                    )}
                  </Stack>
                </ScrollArea>
              </div>

              <div>
                <Text fw={600} size="sm">
                  Outlets
                </Text>
                <ScrollArea h={160} type="auto">
                  <Stack gap="xs">
                    {(outletsQuery.data || []).length === 0 ? (
                      <Text size="sm" c="dimmed">
                        No outlets available.
                      </Text>
                    ) : (
                      (outletsQuery.data || []).map((outlet) => (
                        <Checkbox
                          key={outlet.id}
                          label={outlet.name}
                          checked={formData.outlet_ids.includes(outlet.id)}
                          onChange={(event) => {
                            if (event.currentTarget.checked) {
                              setFormData({
                                ...formData,
                                outlet_ids: [...formData.outlet_ids, outlet.id]
                              });
                            } else {
                              setFormData({
                                ...formData,
                                outlet_ids: formData.outlet_ids.filter((id) => id !== outlet.id)
                              });
                            }
                          }}
                        />
                      ))
                    )}
                  </Stack>
                </ScrollArea>
              </div>

              <Checkbox
                label="Active"
                checked={formData.is_active}
                onChange={(event) => setFormData({ ...formData, is_active: event.currentTarget.checked })}
              />
            </Stack>
          ) : null}

          {dialogMode === "roles" ? (
            <div>
              <Text fw={600} size="sm" mb={6}>
                Select Roles
              </Text>
              <ScrollArea h={260} type="auto">
                <Stack gap="xs">
                  {availableRoles.map((role) => (
                    <Checkbox
                      key={role.code}
                      label={role.name}
                      checked={formData.role_codes.includes(role.code)}
                      onChange={(event) => {
                        if (event.currentTarget.checked) {
                          setFormData({
                            ...formData,
                            role_codes: [...formData.role_codes, role.code]
                          });
                        } else {
                          setFormData({
                            ...formData,
                            role_codes: formData.role_codes.filter((code) => code !== role.code)
                          });
                        }
                      }}
                    />
                  ))}
                </Stack>
              </ScrollArea>
            </div>
          ) : null}

          {dialogMode === "outlets" ? (
            <div>
              <Text fw={600} size="sm" mb={6}>
                Select Outlets
              </Text>
              <ScrollArea h={260} type="auto">
                <Stack gap="xs">
                  {(outletsQuery.data || []).map((outlet) => (
                    <Checkbox
                      key={outlet.id}
                      label={outlet.name}
                      checked={formData.outlet_ids.includes(outlet.id)}
                      onChange={(event) => {
                        if (event.currentTarget.checked) {
                          setFormData({
                            ...formData,
                            outlet_ids: [...formData.outlet_ids, outlet.id]
                          });
                        } else {
                          setFormData({
                            ...formData,
                            outlet_ids: formData.outlet_ids.filter((id) => id !== outlet.id)
                          });
                        }
                      }}
                    />
                  ))}
                </Stack>
              </ScrollArea>
            </div>
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
