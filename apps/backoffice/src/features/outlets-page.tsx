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
  deleteOutlet
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
};

const emptyForm: OutletFormData = {
  company_id: 0,
  code: "",
  name: ""
};

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
      name: ""
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
      name: outlet.name
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
        errors.code = "Outlet code is required";
      }
    }

    if (!formData.name.trim()) {
      errors.name = "Outlet name is required";
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
        await createOutlet(
          {
            company_id: formData.company_id,
            code: formData.code.trim(),
            name: formData.name.trim()
          },
          accessToken
        );
        setSuccessMessage("Outlet created successfully");
        await outletsQuery.refetch();
        closeDialog();
      } else if (dialogMode === "edit" && editingOutlet) {
        await updateOutlet(
          editingOutlet.id,
          {
            name: formData.name.trim()
          },
          accessToken
        );
        setSuccessMessage("Outlet updated successfully");
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
        outlet.name.toLowerCase().includes(normalizedSearch)
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
  }, [canManageCompanies, getCompanyLabel, openEditDialog]);

  async function handleConfirmDelete() {
    if (!confirmState) {
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      await deleteOutlet(confirmState.id, accessToken);
      setSuccessMessage(`Outlet "${confirmState.name}" deleted successfully`);
      await outletsQuery.refetch();
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("Failed to delete outlet");
      }
    } finally {
      setConfirmState(null);
    }
  }

  return (
    <>
      <Stack gap="md">
        <PageCard
          title="Outlet Management"
          description="Manage outlets for your company. Outlets represent physical locations or branches."
          actions={
            <Button
              onClick={openCreateDialog}
              disabled={canManageCompanies && companies.length === 0}
            >
              Create Outlet
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
                placeholder="Search by code or name"
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

        <PageCard title={`Outlets (${filteredOutlets.length})`}>
          <DataTable
            columns={columns}
            data={filteredOutlets}
            emptyState={
              searchTerm.trim().length > 0
                ? "No outlets match your search."
                : "No outlets found for this company."
            }
          />
        </PageCard>
      </Stack>

      <Modal
        opened={dialogMode !== null}
        onClose={closeDialog}
        title={
          <Title order={4}>
            {dialogMode === "create" ? "Create New Outlet" : "Edit Outlet"}
          </Title>
        }
        centered
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
              label="Outlet Code"
              placeholder="e.g., MAIN, BRANCH1"
              value={formData.code}
              onChange={(event) => setFormData({ ...formData, code: event.currentTarget.value })}
              maxLength={32}
              error={formErrors.code}
              description="Code must be unique within the company"
              withAsterisk
            />
          ) : (
            <TextInput
              label="Outlet Code"
              value={editingOutlet?.code ?? ""}
              disabled
              description="Code cannot be changed"
            />
          )}

          <TextInput
            label="Outlet Name"
            placeholder="e.g., Main Branch"
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
        title={<Title order={4}>Delete Outlet</Title>}
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Delete outlet "{confirmState?.name}"? This cannot be undone.
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
