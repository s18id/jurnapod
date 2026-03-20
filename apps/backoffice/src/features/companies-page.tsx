// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconEye } from "@tabler/icons-react";
import type { ColumnDef } from "@tanstack/react-table";
import { storeCompanyTimezone, type SessionUser } from "../lib/session";
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
import { TIMEZONE_OPTIONS } from "../constants/timezones";
import type { CompanyResponse } from "@jurnapod/shared";

type CompaniesPageProps = {
  user: SessionUser;
  accessToken: string;
};

type DialogMode = "create" | "edit" | "view" | null;
type CompanyStatusFilter = "active" | "archived" | "all";

type CompanyFormData = {
  code: string;
  name: string;
  legal_name: string;
  tax_id: string;
  email: string;
  phone: string;
  timezone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postal_code: string;
};

const emptyForm: CompanyFormData = {
  code: "",
  name: "",
  legal_name: "",
  tax_id: "",
  email: "",
  phone: "",
  timezone: "",
  address_line1: "",
  address_line2: "",
  city: "",
  postal_code: ""
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

  const isMobile = useMediaQuery("(max-width: 48em)");

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
  
  const openDetailDrawer = (company: CompanyResponse) => {
    setFormData({
      code: company.code,
      name: company.name,
      legal_name: company.legal_name ?? "",
      tax_id: company.tax_id ?? "",
      email: company.email ?? "",
      phone: company.phone ?? "",
      timezone: company.timezone ?? "",
      address_line1: company.address_line1 ?? "",
      address_line2: company.address_line2 ?? "",
      city: company.city ?? "",
      postal_code: company.postal_code ?? ""
    });
    setEditingCompany(company);
    setDialogMode("view");
    setError(null);
    setSuccessMessage(null);
  };

  const openEditDialog = (company: CompanyResponse) => {
    setFormData({
      code: company.code,
      name: company.name,
      legal_name: company.legal_name ?? "",
      tax_id: company.tax_id ?? "",
      email: company.email ?? "",
      phone: company.phone ?? "",
      timezone: company.timezone ?? "",
      address_line1: company.address_line1 ?? "",
      address_line2: company.address_line2 ?? "",
      city: company.city ?? "",
      postal_code: company.postal_code ?? ""
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

  const closeDrawer = () => {
    setDialogMode(null);
    setEditingCompany(null);
    setFormData(emptyForm);
    setError(null);
    setSuccessMessage(null);
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

    if (!formData.timezone.trim()) {
      errors.timezone = "Timezone is required";
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
            name: formData.name.trim(),
            legal_name: formData.legal_name.trim() || undefined,
            tax_id: formData.tax_id.trim() || undefined,
            email: formData.email.trim() || undefined,
            phone: formData.phone.trim() || undefined,
            timezone: formData.timezone.trim(),
            address_line1: formData.address_line1.trim() || undefined,
            address_line2: formData.address_line2.trim() || undefined,
            city: formData.city.trim() || undefined,
            postal_code: formData.postal_code.trim() || undefined
          },
          accessToken
        );
        setSuccessMessage("Company created successfully");
        await companiesQuery.refetch();
        closeDialog();
      } else if (dialogMode === "edit" && editingCompany) {
        const updates: Parameters<typeof updateCompany>[1] = {};
        
        if (formData.name.trim() !== editingCompany.name) {
          updates.name = formData.name.trim();
        }
        if (formData.legal_name.trim() !== (editingCompany.legal_name ?? "")) {
          updates.legal_name = formData.legal_name.trim() || null;
        }
        if (formData.tax_id.trim() !== (editingCompany.tax_id ?? "")) {
          updates.tax_id = formData.tax_id.trim() || null;
        }
        if (formData.email.trim() !== (editingCompany.email ?? "")) {
          updates.email = formData.email.trim() || null;
        }
        if (formData.phone.trim() !== (editingCompany.phone ?? "")) {
          updates.phone = formData.phone.trim() || null;
        }
        if (formData.timezone.trim() !== (editingCompany.timezone ?? "")) {
          updates.timezone = formData.timezone.trim();
        }
        if (formData.address_line1.trim() !== (editingCompany.address_line1 ?? "")) {
          updates.address_line1 = formData.address_line1.trim() || null;
        }
        if (formData.address_line2.trim() !== (editingCompany.address_line2 ?? "")) {
          updates.address_line2 = formData.address_line2.trim() || null;
        }
        if (formData.city.trim() !== (editingCompany.city ?? "")) {
          updates.city = formData.city.trim() || null;
        }
        if (formData.postal_code.trim() !== (editingCompany.postal_code ?? "")) {
          updates.postal_code = formData.postal_code.trim() || null;
        }

        if (Object.keys(updates).length > 0) {
          await updateCompany(editingCompany.id, updates, accessToken);
          if (editingCompany.id === user.company_id && updates.timezone !== undefined) {
            storeCompanyTimezone(updates.timezone);
          }
          setSuccessMessage("Company updated successfully");
          await companiesQuery.refetch();
        }
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
              <Tooltip label="View details">
                <ActionIcon variant="light" onClick={() => openDetailDrawer(company)}>
                  <IconEye size={16} />
                </ActionIcon>
              </Tooltip>
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
    [isSuperAdmin, openDetailDrawer, openEditDialog]
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
        opened={dialogMode === "create" || dialogMode === "edit"}
        onClose={closeDialog}
        title={
          <Title order={4}>
            {dialogMode === "create" ? "Create New Company" : "Edit Company"}
          </Title>
        }
        centered
      >
        <Stack gap="md">
          <Divider label="Company Identity" my="sm" />

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

          <Divider label="Legal & Tax Information" my="sm" />

          <TextInput
            label="Legal Name"
            placeholder="e.g., PT ACME Indonesia"
            value={formData.legal_name}
            onChange={(event) => setFormData({ ...formData, legal_name: event.currentTarget.value })}
            maxLength={191}
          />

          <TextInput
            label="Tax ID / NPWP"
            placeholder="e.g., 01.234.567.8-901.000"
            value={formData.tax_id}
            onChange={(event) => setFormData({ ...formData, tax_id: event.currentTarget.value })}
            maxLength={64}
          />

          <Divider label="Contact Information" my="sm" />

          <TextInput
            label="Email"
            placeholder="e.g., contact@acme.com"
            value={formData.email}
            onChange={(event) => setFormData({ ...formData, email: event.currentTarget.value })}
            maxLength={191}
          />

          <TextInput
            label="Phone"
            placeholder="e.g., +62 21 1234 5678"
            value={formData.phone}
            onChange={(event) => setFormData({ ...formData, phone: event.currentTarget.value })}
            maxLength={32}
          />

          <Select
            label="Timezone"
            placeholder="Select timezone"
            data={TIMEZONE_OPTIONS}
            value={formData.timezone || null}
            onChange={(value) => setFormData({ ...formData, timezone: value ?? "" })}
            error={formErrors.timezone}
            searchable
            allowDeselect={false}
          />

          <Divider label="Address" my="sm" />

          <TextInput
            label="Address Line 1"
            placeholder="Street address"
            value={formData.address_line1}
            onChange={(event) => setFormData({ ...formData, address_line1: event.currentTarget.value })}
            maxLength={191}
          />

          <TextInput
            label="Address Line 2"
            placeholder="Additional address info"
            value={formData.address_line2}
            onChange={(event) => setFormData({ ...formData, address_line2: event.currentTarget.value })}
            maxLength={191}
          />

          <Group grow>
            <TextInput
              label="City"
              placeholder="e.g., Jakarta"
              value={formData.city}
              onChange={(event) => setFormData({ ...formData, city: event.currentTarget.value })}
              maxLength={96}
            />

            <TextInput
              label="Postal Code"
              placeholder="e.g., 12345"
              value={formData.postal_code}
              onChange={(event) => setFormData({ ...formData, postal_code: event.currentTarget.value })}
              maxLength={20}
            />
          </Group>

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

      <Drawer
        opened={dialogMode === "view"}
        onClose={closeDrawer}
        position="right"
        size={isMobile ? "100%" : "lg"}
        withCloseButton
        title={<Title order={4}>Company Details</Title>}
      >
        {editingCompany ? (
          <Stack gap="md">
            <Divider label="Company Identity" my="sm" />

            <TextInput label="Company Code" value={editingCompany.code} disabled />
            <TextInput label="Company Name" value={editingCompany.name} disabled />
            <TextInput label="Legal Name" value={editingCompany.legal_name ?? "—"} disabled />
            <TextInput label="Tax ID / NPWP" value={editingCompany.tax_id ?? "—"} disabled />

            <Divider label="Status" my="sm" />

            <Badge
              color={editingCompany.deleted_at ? "red" : "green"}
              variant="light"
              size="lg"
            >
              {editingCompany.deleted_at ? "Archived" : "Active"}
            </Badge>

            <Text size="xs" c="dimmed">
              Created: {new Date(editingCompany.created_at).toLocaleString("id-ID")}
            </Text>
            <Text size="xs" c="dimmed">
              Updated: {new Date(editingCompany.updated_at).toLocaleString("id-ID")}
            </Text>

            <Divider label="Contact Information" my="sm" />

            <TextInput label="Email" value={editingCompany.email ?? "—"} disabled />
            <TextInput label="Phone" value={editingCompany.phone ?? "—"} disabled />
            <TextInput label="Timezone" value={editingCompany.timezone ?? "—"} disabled />

            <Divider label="Address" my="sm" />

            <TextInput label="Address Line 1" value={editingCompany.address_line1 ?? "—"} disabled />
            <TextInput label="Address Line 2" value={editingCompany.address_line2 ?? "—"} disabled />
            <TextInput label="City" value={editingCompany.city ?? "—"} disabled />
            <TextInput label="Postal Code" value={editingCompany.postal_code ?? "—"} disabled />

            <Group justify="flex-end" mt="md">
              <Button onClick={() => openEditDialog(editingCompany)}>Edit Company</Button>
            </Group>
          </Stack>
        ) : null}
      </Drawer>
    </>
  );
}
