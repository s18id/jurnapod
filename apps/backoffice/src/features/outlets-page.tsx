// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import type { ColumnDef } from "@tanstack/react-table";
import type { SessionUser } from "../lib/session";
import {
  useOutletsFull,
  createOutlet,
  updateOutlet,
  deleteOutlet,
  type OutletCreateInput,
  type OutletUpdateInput
} from "../hooks/use-outlets";
import { useCompanies } from "../hooks/use-companies";
import { ApiError } from "../lib/api-client";
import { DataTable } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { PageCard } from "../components/PageCard";
import type { OutletFullResponse } from "@jurnapod/shared";

type OutletsPageProps = {
  user: SessionUser;
  accessToken: string;
};

type DialogMode = "create" | "edit" | null;

type OutletFormData = {
  company_id: number;
  code: string;
  name: string;
  city: string;
  address_line1: string;
  address_line2: string;
  postal_code: string;
  phone: string;
  email: string;
  timezone: string;
  is_active: boolean;
};

const emptyForm: OutletFormData = {
  company_id: 0,
  code: "",
  name: "",
  city: "",
  address_line1: "",
  address_line2: "",
  postal_code: "",
  phone: "",
  email: "",
  timezone: "",
  is_active: true
};

const TIMEZONE_OPTIONS = [
  { value: "Asia/Jakarta", label: "Asia/Jakarta (WIB)" },
  { value: "Asia/Makassar", label: "Asia/Makassar (WITA)" },
  { value: "Asia/Jayapura", label: "Asia/Jayapura (WIT)" },
  { value: "Asia/Shanghai", label: "Asia/Shanghai (CST)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (SGT)" },
  { value: "Asia/Bangkok", label: "Asia/Bangkok (ICT)" },
  { value: "Asia/Kuala_Lumpur", label: "Asia/Kuala Lumpur (MYT)" },
  { value: "UTC", label: "UTC" }
];

export function OutletsPage(props: OutletsPageProps) {
  const { user, accessToken } = props;
  const isOwner = user.roles.includes("OWNER");
  const isSuperAdmin = user.roles.includes("SUPER_ADMIN");
  const canManageCompanies = isOwner || isSuperAdmin;

  const [selectedCompanyId, setSelectedCompanyId] = useState<number>(user.company_id);
  const [searchTerm, setSearchTerm] = useState("");

  const outletsQuery = useOutletsFull(
    canManageCompanies ? selectedCompanyId : user.company_id,
    accessToken
  );
  const companiesQuery = useCompanies(accessToken, { enabled: canManageCompanies });

  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingOutlet, setEditingOutlet] = useState<OutletFullResponse | null>(null);
  const [formData, setFormData] = useState<OutletFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof OutletFormData, string>>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [confirmState, setConfirmState] = useState<OutletFullResponse | null>(null);

  const outlets = outletsQuery.data || [];
  const companies = companiesQuery.data || [];

  useEffect(() => {
    if (!canManageCompanies || companies.length === 0) {
      return;
    }
    if (!companies.some((company) => company.id === selectedCompanyId)) {
      setSelectedCompanyId(companies[0].id);
    }
  }, [canManageCompanies, companies, selectedCompanyId]);

  const companyOptions = useMemo(
    () =>
      companies.map((company) => ({
        value: String(company.id),
        label: `${company.code} - ${company.name}`
      })),
    [companies]
  );

  const companyLookup = useMemo(() => {
    const map = new Map<number, string>();
    companies.forEach((company) => {
      map.set(company.id, `${company.code} - ${company.name}`);
    });
    return map;
  }, [companies]);

  const getCompanyLabel = (companyId: number) => {
    return companyLookup.get(companyId) ?? `Company #${companyId}`;
  };

  const openCreateDialog = () => {
    setFormData({
      company_id: canManageCompanies ? selectedCompanyId : user.company_id,
      code: "",
      name: "",
      city: "",
      address_line1: "",
      address_line2: "",
      postal_code: "",
      phone: "",
      email: "",
      timezone: "",
      is_active: true
    });
    setFormErrors({});
    setEditingOutlet(null);
    setDialogMode("create");
    setError(null);
    setSuccessMessage(null);
  };

  const openEditDialog = (outlet: OutletFullResponse) => {
    setFormData({
      company_id: outlet.company_id,
      code: outlet.code,
      name: outlet.name,
      city: outlet.city ?? "",
      address_line1: outlet.address_line1 ?? "",
      address_line2: outlet.address_line2 ?? "",
      postal_code: outlet.postal_code ?? "",
      phone: outlet.phone ?? "",
      email: outlet.email ?? "",
      timezone: outlet.timezone ?? "",
      is_active: outlet.is_active
    });
    setFormErrors({});
    setEditingOutlet(outlet);
    setDialogMode("edit");
    setError(null);
    setSuccessMessage(null);
  };

  const closeDialog = () => {
    setDialogMode(null);
    setEditingOutlet(null);
    setFormData(emptyForm);
    setFormErrors({});
  };

  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof OutletFormData, string>> = {};

    if (dialogMode === "create") {
      if (!formData.company_id) {
        errors.company_id = "Company is required";
      }
      if (!formData.code.trim()) {
        errors.code = "Branch code is required";
      }
    }

    if (!formData.name.trim()) {
      errors.name = "Branch name is required";
    }

    // Validate email if provided
    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        errors.email = "Invalid email format";
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
        const createData: OutletCreateInput = {
          company_id: formData.company_id,
          code: formData.code.trim().toUpperCase(),
          name: formData.name.trim()
        };

        // Add optional fields if provided
        if (formData.city.trim()) createData.city = formData.city.trim();
        if (formData.address_line1.trim()) createData.address_line1 = formData.address_line1.trim();
        if (formData.address_line2.trim()) createData.address_line2 = formData.address_line2.trim();
        if (formData.postal_code.trim()) createData.postal_code = formData.postal_code.trim();
        if (formData.phone.trim()) createData.phone = formData.phone.trim();
        if (formData.email.trim()) createData.email = formData.email.trim();
        if (formData.timezone) createData.timezone = formData.timezone;

        await createOutlet(createData, accessToken);
        setSuccessMessage("Branch created successfully");
        await outletsQuery.refetch();
        closeDialog();
      } else if (dialogMode === "edit" && editingOutlet) {
        const updateData: OutletUpdateInput = {};

        if (formData.name.trim() !== editingOutlet.name) {
          updateData.name = formData.name.trim();
        }

        // Profile fields - use null to clear
        if (formData.city.trim() !== (editingOutlet.city ?? "")) {
          updateData.city = formData.city.trim() || null;
        }
        if (formData.address_line1.trim() !== (editingOutlet.address_line1 ?? "")) {
          updateData.address_line1 = formData.address_line1.trim() || null;
        }
        if (formData.address_line2.trim() !== (editingOutlet.address_line2 ?? "")) {
          updateData.address_line2 = formData.address_line2.trim() || null;
        }
        if (formData.postal_code.trim() !== (editingOutlet.postal_code ?? "")) {
          updateData.postal_code = formData.postal_code.trim() || null;
        }
        if (formData.phone.trim() !== (editingOutlet.phone ?? "")) {
          updateData.phone = formData.phone.trim() || null;
        }
        if (formData.email.trim() !== (editingOutlet.email ?? "")) {
          updateData.email = formData.email.trim() || null;
        }
        if (formData.timezone !== (editingOutlet.timezone ?? "")) {
          updateData.timezone = formData.timezone || null;
        }
        if (formData.is_active !== editingOutlet.is_active) {
          updateData.is_active = formData.is_active;
        }

        await updateOutlet(editingOutlet.id, updateData, accessToken);
        setSuccessMessage("Branch updated successfully");
        await outletsQuery.refetch();
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

  const filteredOutlets = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return outlets.filter((outlet) => {
      if (!normalizedSearch) {
        return true;
      }
      return (
        outlet.code.toLowerCase().includes(normalizedSearch) ||
        outlet.name.toLowerCase().includes(normalizedSearch) ||
        (outlet.city?.toLowerCase().includes(normalizedSearch) ?? false)
      );
    });
  }, [outlets, searchTerm]);

  const columns = useMemo<ColumnDef<OutletFullResponse>[]>(() => {
    const baseColumns: ColumnDef<OutletFullResponse>[] = [
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
        id: "city",
        header: "City",
        cell: (info) => <Text c="dimmed">{info.row.original.city ?? "—"}</Text>
      },
      {
        id: "is_active",
        header: "Active",
        cell: (info) => (
          <Text c={info.row.original.is_active ? "green" : "red"}>
            {info.row.original.is_active ? "Yes" : "No"}
          </Text>
        )
      }
    ];

    if (canManageCompanies) {
      baseColumns.push({
        id: "company",
        header: "Company",
        cell: (info) => <Text>{getCompanyLabel(info.row.original.company_id)}</Text>
      });
    }

    baseColumns.push({
      id: "actions",
      header: "Actions",
      cell: (info) => (
        <Group gap="xs" justify="flex-end" wrap="wrap">
          <Button size="xs" variant="light" onClick={() => openEditDialog(info.row.original)}>
            Edit
          </Button>
          <Button
            size="xs"
            color="red"
            variant="light"
            onClick={() => setConfirmState(info.row.original)}
          >
            Delete
          </Button>
        </Group>
      )
    });

    return baseColumns;
  }, [canManageCompanies, getCompanyLabel]);

  async function handleConfirmDelete() {
    if (!confirmState) {
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      await deleteOutlet(confirmState.id, accessToken);
      setSuccessMessage(`Branch "${confirmState.name}" deleted successfully`);
      await outletsQuery.refetch();
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("Failed to delete branch");
      }
    } finally {
      setConfirmState(null);
    }
  }

  return (
    <>
      <Stack gap="md">
        <PageCard
          title="Branch Management"
          description="Manage branches (outlets) for your company. Each branch is a physical location with its own POS, inventory, and journal."
          actions={
            <Button
              onClick={openCreateDialog}
              disabled={canManageCompanies && companies.length === 0}
            >
              Create Branch
            </Button>
          }
        >
          <Stack gap="sm">
            <FilterBar>
              {canManageCompanies ? (
                <Select
                  label="Company"
                  placeholder={companies.length === 0 ? "No companies available" : "Select company"}
                  data={companyOptions}
                  value={companies.length === 0 ? "" : String(selectedCompanyId)}
                  onChange={(value) => setSelectedCompanyId(Number(value ?? 0))}
                  disabled={companies.length === 0}
                  style={{ minWidth: 260 }}
                />
              ) : (
                <TextInput
                  label="Company"
                  value={getCompanyLabel(user.company_id)}
                  disabled
                  style={{ minWidth: 260 }}
                />
              )}

              <TextInput
                label="Search"
                placeholder="Search by code, name, or city"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.currentTarget.value)}
                style={{ minWidth: 220 }}
              />
            </FilterBar>

            {canManageCompanies && companiesQuery.loading ? (
              <Text size="sm" c="dimmed">
                Loading companies...
              </Text>
            ) : null}
            {canManageCompanies && companiesQuery.error ? (
              <Alert color="red" title="Unable to load companies">
                {companiesQuery.error}
              </Alert>
            ) : null}
            {outletsQuery.loading ? (
              <Text size="sm" c="dimmed">
                Loading outlets...
              </Text>
            ) : null}
            {outletsQuery.error ? (
              <Alert color="red" title="Unable to load outlets">
                {outletsQuery.error}
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

        <PageCard title={`Outlets (Branches) (${filteredOutlets.length})`}>
          <DataTable
            columns={columns}
            data={filteredOutlets}
            emptyState={
              searchTerm.trim().length > 0
                ? "No branches match your search."
                : "No branches found for this company."
            }
          />
        </PageCard>
      </Stack>

      <Modal
        opened={dialogMode !== null}
        onClose={closeDialog}
        title={
          <Title order={4}>
            {dialogMode === "create" ? "Create New Branch" : "Edit Branch"}
          </Title>
        }
        centered
        size="lg"
      >
        <Stack gap="md">
          {dialogMode === "create" && canManageCompanies ? (
            <Select
              label="Company"
              data={companyOptions}
              value={String(formData.company_id || "")}
              onChange={(value) =>
                setFormData({
                  ...formData,
                  company_id: Number(value)
                })
              }
              placeholder="Select company"
              disabled={companies.length === 0}
              error={formErrors.company_id}
              withAsterisk
            />
          ) : (
            <TextInput
              label="Company"
              value={
                editingOutlet
                  ? getCompanyLabel(editingOutlet.company_id)
                  : getCompanyLabel(formData.company_id || user.company_id)
              }
              disabled
              description="Company cannot be changed"
            />
          )}

          {dialogMode === "create" ? (
            <TextInput
              label="Branch Code"
              placeholder="e.g., JKT-MAIN, SBY-01"
              value={formData.code}
              onChange={(event) => setFormData({ ...formData, code: event.currentTarget.value.toUpperCase() })}
              maxLength={32}
              error={formErrors.code}
              description="Code must be unique within the company. Format: CITY-SITE"
              withAsterisk
            />
          ) : (
            <TextInput
              label="Branch Code"
              value={editingOutlet?.code ?? ""}
              disabled
              description="Code cannot be changed"
            />
          )}

          <TextInput
            label="Branch Name"
            placeholder="e.g., Jakarta Main Office"
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.currentTarget.value })}
            maxLength={191}
            error={formErrors.name}
            withAsterisk
          />

          <TextInput
            label="City"
            placeholder="e.g., Jakarta, Surabaya"
            value={formData.city}
            onChange={(event) => setFormData({ ...formData, city: event.currentTarget.value })}
            maxLength={96}
          />

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
              label="Postal Code"
              placeholder="e.g., 10110"
              value={formData.postal_code}
              onChange={(event) => setFormData({ ...formData, postal_code: event.currentTarget.value })}
              maxLength={20}
            />

            <TextInput
              label="Phone"
              placeholder="e.g., +62 21 1234 5678"
              value={formData.phone}
              onChange={(event) => setFormData({ ...formData, phone: event.currentTarget.value })}
              maxLength={32}
            />
          </Group>

          <Group grow>
            <TextInput
              label="Email"
              placeholder="branch@company.com"
              value={formData.email}
              onChange={(event) => setFormData({ ...formData, email: event.currentTarget.value })}
              maxLength={191}
              error={formErrors.email}
            />

            <Select
              label="Timezone"
              placeholder="Select timezone"
              data={TIMEZONE_OPTIONS}
              value={formData.timezone || null}
              onChange={(value) => setFormData({ ...formData, timezone: value ?? "" })}
              clearable
              searchable
            />
          </Group>

          {dialogMode === "edit" && (
            <Switch
              label="Active"
              description="Inactive branches cannot process transactions"
              checked={formData.is_active}
              onChange={(event) => setFormData({ ...formData, is_active: event.currentTarget.checked })}
            />
          )}

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
        title={<Title order={4}>Delete Branch</Title>}
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Delete branch "{confirmState?.name}"? This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmState(null)}>
              Cancel
            </Button>
            <Button color="red" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
