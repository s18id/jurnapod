// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  NumberInput,
  Badge
} from "@mantine/core";
import { DataTable } from "../components/DataTable";
import { PageCard } from "../components/PageCard";
import { FilterBar } from "../components/FilterBar";
import type { SessionUser } from "../lib/session";
import { useOutletsFull } from "../hooks/use-outlets";
import {
  useOutletTables,
  createOutletTable,
  createOutletTablesBulk,
  updateOutletTable,
  deleteOutletTable
} from "../hooks/use-outlet-tables";
import type { ColumnDef } from "@tanstack/react-table";
import type { OutletTableResponse, OutletTableStatus } from "@jurnapod/shared";

type OutletTablesPageProps = {
  user: SessionUser;
  accessToken: string;
};

type DialogMode = "create" | "edit" | "bulk" | null;

interface FormData {
  code: string;
  name: string;
  zone: string | null;
  capacity: number | null;
  status: OutletTableStatus;
}

interface BulkFormData {
  code_template: string;
  name_template: string;
  start_seq: number;
  count: number;
  zone: string | null;
  capacity: number | null;
  status: "AVAILABLE" | "UNAVAILABLE";
}

const emptyForm: FormData = {
  code: "",
  name: "",
  zone: null,
  capacity: null,
  status: "AVAILABLE"
};

const emptyBulkForm: BulkFormData = {
  code_template: "A{seq}",
  name_template: "Table {seq}",
  start_seq: 1,
  count: 10,
  zone: null,
  capacity: null,
  status: "AVAILABLE"
};

const STATUS_OPTIONS: Array<{ value: OutletTableStatus; label: string; color: string }> = [
  { value: "AVAILABLE", label: "Available", color: "green" },
  { value: "RESERVED", label: "Reserved", color: "blue" },
  { value: "OCCUPIED", label: "Occupied", color: "orange" },
  { value: "UNAVAILABLE", label: "Unavailable", color: "gray" }
];

const OPERATIONAL_STATUS_OPTIONS: Array<{ value: OutletTableStatus; label: string }> = [
  { value: "AVAILABLE", label: "Available" },
  { value: "UNAVAILABLE", label: "Unavailable" }
];

function isDerivedStatus(status: OutletTableStatus): boolean {
  return status === "RESERVED" || status === "OCCUPIED";
}

export function OutletTablesPage(props: OutletTablesPageProps) {
  const { user, accessToken } = props;
  const isSuperAdminOrOwner = user.global_roles.includes("SUPER_ADMIN") || user.global_roles.includes("OWNER");
  const canEditTableCode =
    user.global_roles.includes("SUPER_ADMIN") ||
    user.global_roles.includes("OWNER") ||
    user.global_roles.includes("COMPANY_ADMIN");
  const userCompanyId = user.company_id;

  // Selected outlet filter
  const [selectedOutletId, setSelectedOutletId] = useState<number | null>(null);

  // Dialog state
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [editingTable, setEditingTable] = useState<OutletTableResponse | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [bulkFormData, setBulkFormData] = useState<BulkFormData>(emptyBulkForm);
  const [bulkFormErrors, setBulkFormErrors] = useState<Partial<Record<keyof BulkFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<OutletTableResponse | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Feedback
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Data hooks
  const outlets = useOutletsFull(userCompanyId, accessToken);
  const tables = useOutletTables(selectedOutletId, accessToken);

  // Auto-select first outlet (handle empty list and stale IDs)
  useEffect(() => {
    if (outlets.loading) {
      return;
    }

    if (outlets.data.length === 0) {
      if (selectedOutletId !== null) {
        setSelectedOutletId(null);
      }
      return;
    }

    const exists =
      selectedOutletId !== null && outlets.data.some((outlet) => outlet.id === selectedOutletId);

    if (!exists) {
      setSelectedOutletId(outlets.data[0]!.id);
    }
  }, [outlets.loading, outlets.data, selectedOutletId]);

  // Search/filter
  const [searchTerm, setSearchTerm] = useState("");

  // Filter tables by search
  const filteredTables = useMemo(() => {
    if (!searchTerm.trim()) return tables.data;
    const term = searchTerm.toLowerCase();
    return tables.data.filter(
      (t) =>
        t.code.toLowerCase().includes(term) ||
        t.name.toLowerCase().includes(term) ||
        (t.zone && t.zone.toLowerCase().includes(term))
    );
  }, [tables.data, searchTerm]);

  const bulkPreview = useMemo(() => {
    const rows: Array<{ code: string; name: string }> = [];
    if (!bulkFormData.code_template.includes("{seq}") || !bulkFormData.name_template.includes("{seq}")) {
      return rows;
    }

    const previewCount = Math.min(3, Math.max(0, bulkFormData.count));
    for (let i = 0; i < previewCount; i += 1) {
      const seq = bulkFormData.start_seq + i;
      rows.push({
        code: bulkFormData.code_template.replaceAll("{seq}", String(seq)).trim().toUpperCase(),
        name: bulkFormData.name_template.replaceAll("{seq}", String(seq)).trim()
      });
    }

    if (bulkFormData.count > previewCount) {
      const lastSeq = bulkFormData.start_seq + bulkFormData.count - 1;
      rows.push({
        code: bulkFormData.code_template.replaceAll("{seq}", String(lastSeq)).trim().toUpperCase(),
        name: bulkFormData.name_template.replaceAll("{seq}", String(lastSeq)).trim()
      });
    }

    return rows;
  }, [bulkFormData]);

  // Close dialog helper
  const closeDialog = useCallback(() => {
    setDialogMode(null);
    setEditingTable(null);
    setFormData(emptyForm);
    setFormErrors({});
    setBulkFormData(emptyBulkForm);
    setBulkFormErrors({});
  }, []);

  // Open create dialog
  const openCreateDialog = useCallback(() => {
    if (!selectedOutletId) {
      setError("Please select an outlet first");
      return;
    }
    setFormData(emptyForm);
    setFormErrors({});
    setDialogMode("create");
  }, [selectedOutletId]);

  const openBulkDialog = useCallback(() => {
    if (!selectedOutletId) {
      setError("Please select an outlet first");
      return;
    }
    setBulkFormData(emptyBulkForm);
    setBulkFormErrors({});
    setDialogMode("bulk");
  }, [selectedOutletId]);

  // Open edit dialog
  const openEditDialog = useCallback((table: OutletTableResponse) => {
    setEditingTable(table);
    setFormData({
      code: table.code,
      name: table.name,
      zone: table.zone,
      capacity: table.capacity,
      status: table.status
    });
    setFormErrors({});
    setDialogMode("edit");
  }, []);

  // Validate form
  const validateForm = useCallback((): boolean => {
    const errors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.code.trim()) {
      errors.code = "Table code is required";
    }
    if (!formData.name.trim()) {
      errors.name = "Table name is required";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  const validateBulkForm = useCallback((): boolean => {
    const errors: Partial<Record<keyof BulkFormData, string>> = {};

    if (!bulkFormData.code_template.trim()) {
      errors.code_template = "Code template is required";
    } else if (!bulkFormData.code_template.includes("{seq}")) {
      errors.code_template = "Code template must include {seq}";
    }

    if (!bulkFormData.name_template.trim()) {
      errors.name_template = "Name template is required";
    } else if (!bulkFormData.name_template.includes("{seq}")) {
      errors.name_template = "Name template must include {seq}";
    }

    if (!Number.isInteger(bulkFormData.start_seq) || bulkFormData.start_seq < 1) {
      errors.start_seq = "Start sequence must be a positive integer";
    }

    if (!Number.isInteger(bulkFormData.count) || bulkFormData.count < 1 || bulkFormData.count > 200) {
      errors.count = "Count must be between 1 and 200";
    }

    setBulkFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [bulkFormData]);

  // Handle submit
  const handleSubmit = useCallback(async () => {
    if (!selectedOutletId) {
      setError("No outlet selected");
      return;
    }

    if (dialogMode === "bulk") {
      if (!validateBulkForm()) return;
    } else {
      if (!validateForm()) return;
    }

    setSubmitting(true);
    setError(null);

    try {
      if (dialogMode === "create") {
        await createOutletTable(
          selectedOutletId,
          {
            outlet_id: selectedOutletId,
            code: formData.code.trim().toUpperCase(),
            name: formData.name.trim(),
            zone: formData.zone?.trim() || null,
            capacity: formData.capacity,
            status: formData.status
          },
          accessToken
        );
        setSuccessMessage("Table created successfully");
      } else if (dialogMode === "edit" && editingTable) {
        const isCurrentlyDerived = isDerivedStatus(editingTable.status);
        await updateOutletTable(
          selectedOutletId,
          editingTable.id,
          {
            code: canEditTableCode ? formData.code.trim().toUpperCase() : undefined,
            name: formData.name.trim(),
            zone: formData.zone?.trim() || null,
            capacity: formData.capacity,
            ...(isCurrentlyDerived ? {} : { status: formData.status })
          },
          accessToken
        );
        setSuccessMessage("Table updated successfully");
      } else if (dialogMode === "bulk") {
        const result = await createOutletTablesBulk(
          selectedOutletId,
          {
            outlet_id: selectedOutletId,
            code_template: bulkFormData.code_template.trim(),
            name_template: bulkFormData.name_template.trim(),
            start_seq: bulkFormData.start_seq,
            count: bulkFormData.count,
            zone: bulkFormData.zone?.trim() || null,
            capacity: bulkFormData.capacity,
            status: bulkFormData.status
          },
          accessToken
        );
        setSuccessMessage(`${result.created_count} tables created successfully`);
      }

      await tables.refetch();
      closeDialog();
    } catch (e: any) {
      setError(e.message || "Failed to save table");
    } finally {
      setSubmitting(false);
    }
  }, [
    dialogMode,
    formData,
    editingTable,
    canEditTableCode,
    bulkFormData,
    selectedOutletId,
    accessToken,
    validateForm,
    validateBulkForm,
    tables,
    closeDialog
  ]);

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!deleteConfirm || !selectedOutletId) return;

    setDeleting(true);
    setError(null);

    try {
      await deleteOutletTable(selectedOutletId, deleteConfirm.id, accessToken);
      setSuccessMessage("Table deactivated successfully");
      await tables.refetch();
      setDeleteConfirm(null);
    } catch (e: any) {
      setError(e.message || "Failed to deactivate table");
    } finally {
      setDeleting(false);
    }
  }, [deleteConfirm, selectedOutletId, accessToken, tables]);

  // Clear success message on timeout
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Columns definition
  const columns = useMemo<ColumnDef<OutletTableResponse>[]>(
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
        id: "zone",
        header: "Zone",
        cell: (info) => <Text c="dimmed">{info.row.original.zone || "—"}</Text>
      },
      {
        id: "capacity",
        header: "Capacity",
        cell: (info) => <Text>{info.row.original.capacity || "—"}</Text>
      },
      {
        id: "status",
        header: "Status",
        cell: (info) => {
          const statusConfig = STATUS_OPTIONS.find((s) => s.value === info.row.original.status);
          return (
            <Badge color={statusConfig?.color || "gray"} variant="light">
              {statusConfig?.label || info.row.original.status}
            </Badge>
          );
        }
      },
      {
        id: "actions",
        header: "Actions",
        cell: (info) => (
          <Group gap="xs" justify="flex-end">
            <Button size="xs" onClick={() => openEditDialog(info.row.original)}>
              Edit
            </Button>
            <Button
              size="xs"
              color="red"
              variant="light"
              disabled={info.row.original.status === "UNAVAILABLE"}
              onClick={() => setDeleteConfirm(info.row.original)}
            >
              Deactivate
            </Button>
          </Group>
        )
      }
    ],
    [openEditDialog]
  );

  return (
    <Stack gap="md">
      <PageCard
        title="Outlet Tables"
        description="Manage table configurations for dine-in service"
        actions={
          <Group gap="xs">
            {canEditTableCode && (
              <Button variant="light" onClick={openBulkDialog} disabled={!selectedOutletId}>
                Bulk Create
              </Button>
            )}
            <Button onClick={openCreateDialog} disabled={!selectedOutletId}>
              Create Table
            </Button>
          </Group>
        }
      >
        <Stack gap="sm">
          <FilterBar>
            {outlets.data.length > 0 && (
              <Select
                label="Outlet"
                placeholder="Select outlet"
                data={outlets.data.map((o: any) => ({
                  value: o.id.toString(),
                  label: `${o.code} - ${o.name}`
                }))}
                value={selectedOutletId?.toString() || null}
                onChange={(value) => setSelectedOutletId(value ? Number(value) : null)}
              />
            )}

            <TextInput
              label="Search"
              placeholder="Search by code, name, or zone"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.currentTarget.value)}
            />
          </FilterBar>

          {error && (
            <Alert color="red" title="Error">
              {error}
            </Alert>
          )}
          {successMessage && (
            <Alert color="green" title="Success">
              {successMessage}
            </Alert>
          )}

          {!selectedOutletId && (
            <Alert color="blue" title="Select Outlet">
              Please select an outlet to view its tables
            </Alert>
          )}
        </Stack>
      </PageCard>

      {selectedOutletId && (
        <PageCard title={`Tables (${filteredTables.length})`}>
          {tables.loading && <Text c="dimmed">Loading tables...</Text>}
          {!tables.loading && filteredTables.length === 0 && (
            <Text c="dimmed">No tables found. Create a new table to get started.</Text>
          )}
          {!tables.loading && filteredTables.length > 0 && (
            <DataTable
              columns={columns}
              data={filteredTables}
              emptyState="No tables found matching your search"
            />
          )}
        </PageCard>
      )}

      {/* Create/Edit Dialog */}
      <Modal
        opened={dialogMode === "create" || dialogMode === "edit"}
        onClose={closeDialog}
        title={<Title order={4}>{dialogMode === "create" ? "Create Table" : "Edit Table"}</Title>}
        centered
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Table Code"
            placeholder="e.g., A1, B2, T10"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.currentTarget.value })}
            error={formErrors.code}
            disabled={dialogMode === "edit" && !canEditTableCode}
            required
          />

          <TextInput
            label="Table Name"
            placeholder="e.g., Window Table 1"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
            error={formErrors.name}
            required
          />

          <TextInput
            label="Zone"
            placeholder="e.g., Main Hall, Patio, VIP"
            value={formData.zone || ""}
            onChange={(e) =>
              setFormData({ ...formData, zone: e.currentTarget.value || null })
            }
          />

          <NumberInput
            label="Capacity"
            placeholder="Number of seats"
            value={formData.capacity || ""}
            onChange={(value) =>
              setFormData({ ...formData, capacity: typeof value === "number" ? value : null })
            }
            min={1}
            max={100}
          />

          {dialogMode === "edit" && editingTable && isDerivedStatus(editingTable.status) ? (
            <Alert color="blue" title="Status Managed">
              Status is currently managed by active reservation or order. Editing disabled.
            </Alert>
          ) : (
            <Select
              label="Status"
              data={OPERATIONAL_STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
              value={formData.status}
              onChange={(value) =>
                setFormData({ ...formData, status: (value as OutletTableStatus) || "AVAILABLE" })
              }
              required
            />
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={submitting}>
              {dialogMode === "create" ? "Create" : "Save"}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={dialogMode === "bulk"}
        onClose={closeDialog}
        title={<Title order={4}>Bulk Create Tables</Title>}
        centered
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Code Template"
            placeholder="e.g., A{seq}, T-{seq}"
            value={bulkFormData.code_template}
            onChange={(e) =>
              setBulkFormData({ ...bulkFormData, code_template: e.currentTarget.value })
            }
            error={bulkFormErrors.code_template}
            required
          />

          <TextInput
            label="Name Template"
            placeholder="e.g., Table {seq}, VIP {seq}"
            value={bulkFormData.name_template}
            onChange={(e) =>
              setBulkFormData({ ...bulkFormData, name_template: e.currentTarget.value })
            }
            error={bulkFormErrors.name_template}
            required
          />

          <Group grow>
            <NumberInput
              label="Start Seq"
              value={bulkFormData.start_seq}
              onChange={(value) =>
                setBulkFormData({
                  ...bulkFormData,
                  start_seq: typeof value === "number" ? value : 1
                })
              }
              error={bulkFormErrors.start_seq}
              min={1}
              max={999999}
              required
            />

            <NumberInput
              label="Count"
              value={bulkFormData.count}
              onChange={(value) =>
                setBulkFormData({ ...bulkFormData, count: typeof value === "number" ? value : 1 })
              }
              error={bulkFormErrors.count}
              min={1}
              max={200}
              required
            />
          </Group>

          <Group grow>
            <TextInput
              label="Zone"
              placeholder="e.g., Main Hall"
              value={bulkFormData.zone || ""}
              onChange={(e) =>
                setBulkFormData({ ...bulkFormData, zone: e.currentTarget.value || null })
              }
            />

            <NumberInput
              label="Capacity"
              placeholder="Number of seats"
              value={bulkFormData.capacity || ""}
              onChange={(value) =>
                setBulkFormData({
                  ...bulkFormData,
                  capacity: typeof value === "number" ? value : null
                })
              }
              min={1}
              max={100}
            />
          </Group>

          <Select
            label="Status"
            data={OPERATIONAL_STATUS_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
            value={bulkFormData.status}
            onChange={(value) =>
              setBulkFormData({ ...bulkFormData, status: (value as "AVAILABLE" | "UNAVAILABLE") || "AVAILABLE" })
            }
            required
          />

          {bulkPreview.length > 0 && (
            <Alert color="blue" title="Preview">
              {bulkPreview.map((row, index) => (
                <Text key={`${row.code}-${index}`} size="sm">
                  {index === 3 ? "... " : ""}
                  <strong>{row.code}</strong> - {row.name}
                </Text>
              ))}
            </Alert>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={submitting}>
              Create Tables
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        opened={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        title={<Title order={4}>Confirm Deactivate</Title>}
        centered
      >
        <Stack gap="md">
          <Text>
            Deactivate table <strong>{deleteConfirm?.code}</strong> ({deleteConfirm?.name})? The
            table will be marked as unavailable.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete} loading={deleting}>
              Deactivate
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
