// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import type { ColumnDef } from "@tanstack/react-table";
import type { SessionUser } from "../lib/session";
import {
  useCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
  reactivateCompany
} from "../hooks/use-companies";
import { ApiError } from "../lib/api-client";
import { DataTable } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { PageCard } from "../components/PageCard";
import type { CompanyResponse } from "@jurnapod/shared";

type CompaniesPageProps = {
  user: SessionUser;
  accessToken: string;
};

type DialogMode = "create" | "edit" | null;
type CompanyStatusFilter = "active" | "archived" | "all";

type CompanyFormData = {
  code: string;
  name: string;
};

const emptyForm: CompanyFormData = {
  code: "",
  name: ""
};

const statusOptions: Array<{ value: CompanyStatusFilter; label: string }> = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" }
];

export function CompaniesPage(props: CompaniesPageProps) {
  const { accessToken, user } = props;
  const isSuperAdmin = user.roles.includes("SUPER_ADMIN");
  
  // Dialog state
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingCompany, setEditingCompany] = useState<CompanyResponse | null>(null);
  const [formData, setFormData] = useState<CompanyFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof CompanyFormData, string>>>({});
  
  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<CompanyStatusFilter>("active");
  const [searchTerm, setSearchTerm] = useState("");

  const [confirmState, setConfirmState] = useState<
    { action: "deactivate" | "reactivate"; company: CompanyResponse } | null
  >(null);

  // API hooks
  const companiesQuery = useCompanies(accessToken, {
    includeDeleted: isSuperAdmin && statusFilter !== "active"
  });

  const filteredCompanies = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return (companiesQuery.data || [])
      .filter((company) => {
        if (!isSuperAdmin || statusFilter === "active") {
          return !company.deleted_at;
        }
        if (statusFilter === "archived") {
          return !!company.deleted_at;
        }
        return true;
      })
      .filter((company) => {
        if (!normalizedSearch) {
          return true;
        }
        return (
          company.code.toLowerCase().includes(normalizedSearch) ||
          company.name.toLowerCase().includes(normalizedSearch)
        );
      });
  }, [companiesQuery.data, isSuperAdmin, searchTerm, statusFilter]);
  
  // Handlers
  const openCreateDialog = () => {
    setFormData(emptyForm);
    setFormErrors({});
    setEditingCompany(null);
    setDialogMode("create");
    setError(null);
    setSuccessMessage(null);
  };
  
  const openEditDialog = (company: CompanyResponse) => {
    setFormData({
      code: company.code,
      name: company.name
    });
    setFormErrors({});
    setEditingCompany(company);
    setDialogMode("edit");
    setError(null);
    setSuccessMessage(null);
  };
  
  const closeDialog = () => {
    setDialogMode(null);
    setEditingCompany(null);
    setFormData(emptyForm);
    setFormErrors({});
  };
  
  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof CompanyFormData, string>> = {};
    
    if (dialogMode === "create") {
      if (!formData.code.trim()) {
        errors.code = "Company code is required";
      } else if (!/^[A-Z0-9_-]+$/.test(formData.code)) {
        errors.code = "Company code must be uppercase letters, numbers, hyphens, and underscores only";
      }
    }
    
    if (!formData.name.trim()) {
      errors.name = "Company name is required";
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
        await createCompany(
          {
            code: formData.code.trim().toUpperCase(),
            name: formData.name.trim()
          },
          accessToken
        );
        setSuccessMessage("Company created successfully");
        await companiesQuery.refetch();
        closeDialog();
      } else if (dialogMode === "edit" && editingCompany) {
        await updateCompany(
          editingCompany.id,
          {
            name: formData.name.trim()
          },
          accessToken
        );
        setSuccessMessage("Company updated successfully");
        await companiesQuery.refetch();
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

  const columns = useMemo<ColumnDef<CompanyResponse>[]>(
    () => [
      {
        id: "code",
        header: "Code",
        cell: (info) => <Text fw={600}>{info.row.original.code}</Text>
      },
      {
        id: "name",
        header: "Name",
        cell: (info) => <Text>{info.row.original.name}</Text>
      },
      {
        id: "status",
        header: "Status",
        cell: (info) => {
          const isArchived = !!info.row.original.deleted_at;
          return (
            <Badge color={isArchived ? "red" : "green"} variant="light">
              {isArchived ? "Archived" : "Active"}
            </Badge>
          );
        }
      },
      {
        id: "actions",
        header: "Actions",
        cell: (info) => {
          const company = info.row.original;
          return (
            <Group gap="xs" justify="flex-end" wrap="wrap">
              {!company.deleted_at ? (
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => openEditDialog(company)}
                >
                  Edit
                </Button>
              ) : null}
              {isSuperAdmin && !company.deleted_at ? (
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  onClick={() => setConfirmState({ action: "deactivate", company })}
                >
                  Deactivate
                </Button>
              ) : null}
              {isSuperAdmin && company.deleted_at ? (
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => setConfirmState({ action: "reactivate", company })}
                >
                  Reactivate
                </Button>
              ) : null}
            </Group>
          );
        }
      }
    ],
    [isSuperAdmin, openEditDialog]
  );

  async function handleConfirmAction() {
    if (!confirmState) {
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      if (confirmState.action === "deactivate") {
        await deleteCompany(confirmState.company.id, accessToken);
        setSuccessMessage(`Company "${confirmState.company.name}" deactivated successfully`);
      } else {
        await reactivateCompany(confirmState.company.id, accessToken);
        setSuccessMessage(`Company "${confirmState.company.name}" reactivated successfully`);
      }
      await companiesQuery.refetch();
    } catch (actionError) {
      if (actionError instanceof ApiError) {
        setError(actionError.message);
      } else {
        setError(
          confirmState.action === "deactivate"
            ? "Failed to deactivate company"
            : "Failed to reactivate company"
        );
      }
    } finally {
      setConfirmState(null);
    }
  }
  
  return (
    <>
      <Stack gap="md">
        <PageCard
          title="Company Management"
          description="Manage companies in the system. Each company can have multiple users and outlets."
          actions={
            isSuperAdmin ? (
              <Button onClick={openCreateDialog}>Create Company</Button>
            ) : null
          }
        >
          <Stack gap="sm">
            <FilterBar>
              <TextInput
                label="Search"
                placeholder="Search by code or name"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.currentTarget.value)}
                style={{ minWidth: 220 }}
              />
              {isSuperAdmin ? (
                <Select
                  label="Status"
                  data={statusOptions}
                  value={statusFilter}
                  onChange={(value) => setStatusFilter((value as CompanyStatusFilter) || "active")}
                  style={{ minWidth: 160 }}
                />
              ) : null}
            </FilterBar>

            {companiesQuery.loading ? (
              <Text size="sm" c="dimmed">
                Loading companies...
              </Text>
            ) : null}

            {companiesQuery.error ? (
              <Alert color="red" title="Unable to load">
                {companiesQuery.error}
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

        <PageCard title={`Companies (${filteredCompanies.length})`}>
          <DataTable
            columns={columns}
            data={filteredCompanies}
            emptyState={
              searchTerm.trim().length > 0
                ? "No companies match your search."
                : "No companies available."
            }
          />
        </PageCard>
      </Stack>

      <Modal
        opened={dialogMode !== null}
        onClose={closeDialog}
        title={
          <Title order={4}>
            {dialogMode === "create" ? "Create New Company" : "Edit Company"}
          </Title>
        }
        centered
      >
        <Stack gap="md">
          {dialogMode === "create" ? (
            <TextInput
              label="Company Code"
              placeholder="e.g., ACME, COMPANY1"
              value={formData.code}
              onChange={(event) =>
                setFormData({ ...formData, code: event.currentTarget.value.toUpperCase() })
              }
              maxLength={32}
              error={formErrors.code}
              description="Uppercase letters, numbers, hyphens, and underscores only"
              withAsterisk
            />
          ) : (
            <TextInput
              label="Company Code"
              value={editingCompany?.code ?? ""}
              disabled
              description="Code cannot be changed"
            />
          )}

          <TextInput
            label="Company Name"
            placeholder="e.g., ACME Corporation"
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.currentTarget.value })}
            maxLength={191}
            error={formErrors.name}
            withAsterisk
          />

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
              ? `Deactivate company "${confirmState.company.name}"? Users will lose access, but SUPER_ADMIN can still view archived data.`
              : `Reactivate company "${confirmState?.company.name}"? This will restore access for its users.`}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmState(null)}>
              Cancel
            </Button>
            <Button
              color={confirmState?.action === "deactivate" ? "red" : "blue"}
              onClick={handleConfirmAction}
            >
              {confirmState?.action === "deactivate" ? "Deactivate" : "Reactivate"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
