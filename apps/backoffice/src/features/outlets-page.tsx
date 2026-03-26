// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { OutletFullResponse } from "@jurnapod/shared";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Drawer,
  FileInput,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconDownload, IconEye, IconPlus, IconTrash, IconUpload } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";


import { FilterBar } from "../components/FilterBar";
import { PageCard } from "../components/PageCard";
import { ImportStepBadges } from "../components/import-step-badges";
import {
  DataTable,
  type DataTableColumnDef,
  type PaginationState,
  type SortState,
  type RowSelectionState
} from "../components/ui/DataTable";
import { TIMEZONE_OPTIONS } from "../constants/timezones";
import { useCompanies } from "../hooks/use-companies";
import {
  useOutletsFull,
  createOutlet,
  updateOutlet,
  deleteOutlet,
  type OutletCreateInput,
  type OutletUpdateInput
} from "../hooks/use-outlets";
import { ApiError } from "../lib/api-client";
import { readImportFile } from "../lib/import/delimited";
import type { SessionUser } from "../lib/session";

import {
  buildImportPlan,
  computeImportSummary,
  downloadOutletsCsv,
  normalizeImportRow,
  parseDelimited,
  type ImportPlanRow,
  type ImportSummary
} from "./outlets-import-export-utils";


type OutletsPageProps = {
  user: SessionUser;
  accessToken: string;
};

type DialogMode = "create" | "view" | "edit" | null;

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

export function OutletsPage(props: OutletsPageProps) {
  const { user, accessToken } = props;
  const isOwner = user.roles.includes("OWNER");
  const isSuperAdmin = user.roles.includes("SUPER_ADMIN");
  const canManageCompanies = isOwner || isSuperAdmin;

  const [selectedCompanyId, setSelectedCompanyId] = useState<number>(user.company_id);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [cityFilter, setCityFilter] = useState<string | null>(null);

  const isMobile = useMediaQuery("(max-width: 48em)");

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
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [confirmState, setConfirmState] = useState<OutletFullResponse | null>(null);

  const [importOpened, setImportOpened] = useState(false);
  const [importStep, setImportStep] = useState<"source" | "preview" | "apply">("source");
  const [importText, setImportText] = useState("");
  const [importPlan, setImportPlan] = useState<ImportPlanRow[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary>({ create: 0, error: 0, total: 0 });
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState({ success: 0, failed: 0 });
  const [hasAppliedImport, setHasAppliedImport] = useState(false);
  const [importApplyResults, setImportApplyResults] = useState<
    Array<{ rowIndex: number; code: string | null; name: string; status: "SUCCESS" | "FAILED"; error?: string }>
  >([]);

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

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const originalFormData = useMemo(() => {
    if (dialogMode === "edit" && editingOutlet) {
      return {
        company_id: editingOutlet.company_id,
        code: editingOutlet.code,
        name: editingOutlet.name,
        city: editingOutlet.city ?? "",
        address_line1: editingOutlet.address_line1 ?? "",
        address_line2: editingOutlet.address_line2 ?? "",
        postal_code: editingOutlet.postal_code ?? "",
        phone: editingOutlet.phone ?? "",
        email: editingOutlet.email ?? "",
        timezone: editingOutlet.timezone ?? "",
        is_active: editingOutlet.is_active
      };
    }
    if (dialogMode === "create") {
      return {
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
      };
    }
    return emptyForm;
  }, [dialogMode, editingOutlet, canManageCompanies, selectedCompanyId, user.company_id]);

  const isEditableDialog = dialogMode === "create" || dialogMode === "edit";
  const hasUnsavedChanges = isEditableDialog && JSON.stringify(formData) !== JSON.stringify(originalFormData);

  useEffect(() => {
    if (hasUnsavedChanges) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = "";
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }
  }, [hasUnsavedChanges]);

  const companyOptions = useMemo(
    () =>
      companies.map((company) => ({
        value: String(company.id),
        label: `${company.code} - ${company.name}`
      })),
    [companies]
  );

  const cityOptions = useMemo(() => {
    const cities = new Set<string>();
    outlets.forEach((outlet) => {
      if (outlet.city) {
        cities.add(outlet.city);
      }
    });
    return Array.from(cities).sort();
  }, [outlets]);

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

  const openDetailDrawer = (outlet: OutletFullResponse) => {
    setEditingOutlet(outlet);
    setDialogMode("view");
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

  const handleCloseDialog = () => {
    if (isEditableDialog && hasUnsavedChanges && !submitting) {
      const confirmed = window.confirm("You have unsaved changes. Are you sure you want to close?");
      if (!confirmed) return;
    }
    closeDialog();
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

  const validateField = (field: keyof OutletFormData) => {
    let error: string | undefined;
    if (field === "company_id" && dialogMode === "create" && !formData.company_id) {
      error = "Company is required";
    }
    if (field === "code" && dialogMode === "create" && !formData.code.trim()) {
      error = "Branch code is required";
    }
    if (field === "name" && !formData.name.trim()) {
      error = "Branch name is required";
    }
    if (field === "email" && formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email.trim())) {
        error = "Invalid email format";
      }
    }
    setFormErrors((prev) => ({ ...prev, [field]: error }));
  };

  const isFormSubmittable = useMemo(() => {
    if (!formData.name.trim()) return false;
    if (dialogMode === "create") {
      if (!formData.company_id || !formData.code.trim()) return false;
    }
    return true;
  }, [formData, dialogMode]);

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

        const hasChanges = Object.keys(updateData).length > 0;
        if (!hasChanges) {
          setSuccessMessage("No changes to save");
          closeDialog();
          return;
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
      if (statusFilter === "ACTIVE" && !outlet.is_active) return false;
      if (statusFilter === "INACTIVE" && outlet.is_active) return false;
      if (cityFilter && outlet.city !== cityFilter) return false;
      if (normalizedSearch) {
        return (
          outlet.code.toLowerCase().includes(normalizedSearch) ||
          outlet.name.toLowerCase().includes(normalizedSearch) ||
          (outlet.city?.toLowerCase().includes(normalizedSearch) ?? false)
        );
      }
      return true;
    });
  }, [outlets, searchTerm, statusFilter, cityFilter]);

  const totalCount = outlets.length;
  const activeCount = outlets.filter((o) => o.is_active).length;
  const inactiveCount = outlets.filter((o) => !o.is_active).length;
  const filteredCount = filteredOutlets.length;

  // Pagination, sort, and selection state for DataTable
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 25 });
  const [sort, setSort] = useState<SortState | null>(null);
  const [selection, setSelection] = useState<RowSelectionState>({});

  const columns = useMemo<DataTableColumnDef<OutletFullResponse>[]>(() => {
    const baseColumns: DataTableColumnDef<OutletFullResponse>[] = [
      {
        id: "code",
        header: "Code",
        accessorKey: "code",
        sortable: true,
        cell: (info) => <Text fw={600}>{info.row.original.code}</Text>
      },
      {
        id: "name",
        header: "Name",
        accessorKey: "name",
        sortable: true,
        cell: (info) => <Text>{info.row.original.name}</Text>
      },
      {
        id: "city",
        header: "City",
        accessorKey: "city",
        sortable: true,
        cell: (info) => <Text c="dimmed">{info.row.original.city ?? "—"}</Text>
      },
      {
        id: "is_active",
        header: "Status",
        accessorKey: "is_active",
        sortable: true,
        cell: (info) => (
          <Badge color={info.row.original.is_active ? "green" : "gray"} variant="light">
            {info.row.original.is_active ? "Active" : "Inactive"}
          </Badge>
        )
      },
      {
        id: "contact",
        header: "Contact",
        cell: (info) => {
          const phone = info.row.original.phone;
          const email = info.row.original.email;
          return (
            <Text size="sm" c="dimmed">
              {phone ?? "—"} / {email ?? "—"}
            </Text>
          );
        }
      },
      {
        id: "timezone",
        header: "Timezone",
        accessorKey: "timezone",
        sortable: true,
        cell: (info) => <Text size="xs" c="dimmed">{info.row.original.timezone ?? "—"}</Text>
      }
    ];

    baseColumns.push({
      id: "actions",
      header: "Actions",
      cell: (info) => (
        <Group gap="xs" justify="flex-end" wrap="wrap">
          <Tooltip label="View details">
            <ActionIcon
              variant="light"
              onClick={() => openDetailDrawer(info.row.original)}
              disabled={submitting || deleting}
              aria-label="View outlet details"
            >
              <IconEye size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete branch">
            <ActionIcon
              variant="light"
              color="red"
              onClick={() => setConfirmState(info.row.original)}
              disabled={submitting || deleting}
              aria-label="Delete outlet"
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      )
    });

    return baseColumns;
  }, [canManageCompanies, getCompanyLabel, submitting, deleting]);

  async function handleConfirmDelete() {
    if (!confirmState || deleting) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setDeleting(true);

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
      setDeleting(false);
    }
  }

  function handleImportFileSelect(file: File | null) {
    readImportFile(file).then((text) => {
      if (text) setImportText(text);
    });
  }

  function processImportText() {
    const parsed = parseDelimited(importText.trim());
    if (parsed.length < 2) {
      setError("Import file must have a header row and at least one data row");
      return;
    }

    const header = parsed[0];
    const body = parsed.slice(1).filter((row) => row.some((cell) => cell.trim() !== ""));

    const rows = body.map((cells) => normalizeImportRow(cells, header));
    setHasAppliedImport(false);
    setImportApplyResults([]);

    const plan = buildImportPlan(rows, outlets);
    setImportPlan(plan);

    const summary = computeImportSummary(plan);
    setImportSummary(summary);

    setImportStep("preview");
    setError(null);
  }

  async function runImport() {
    if (importing || hasAppliedImport) {
      return;
    }

    const actionable = importPlan.filter((p) => p.action === "CREATE");
    setImporting(true);
    setImportStep("apply");
    setImportProgress(0);
    let success = 0;
    let failed = 0;
    const results: Array<{ rowIndex: number; code: string | null; name: string; status: "SUCCESS" | "FAILED"; error?: string }> = [];

    const currentCompanyId = canManageCompanies ? selectedCompanyId : user.company_id;

    for (let i = 0; i < actionable.length; i++) {
      const row = actionable[i];
      setImportProgress(((i + 1) / actionable.length) * 100);

      const createData: OutletCreateInput = {
        company_id: currentCompanyId,
        code: row.original.code!.toUpperCase(),
        name: row.original.name.trim()
      };

      if (row.original.city) createData.city = row.original.city.trim();
      if (row.original.address_line1) createData.address_line1 = row.original.address_line1.trim();
      if (row.original.address_line2) createData.address_line2 = row.original.address_line2.trim();
      if (row.original.postal_code) createData.postal_code = row.original.postal_code.trim();
      if (row.original.phone) createData.phone = row.original.phone.trim();
      if (row.original.email) createData.email = row.original.email.trim();
      if (row.original.timezone) createData.timezone = row.original.timezone.trim();

      try {
        await createOutlet(createData, accessToken);
        success++;
        results.push({ rowIndex: row.rowIndex, code: row.original.code, name: row.original.name, status: "SUCCESS" });
      } catch (err) {
        failed++;
        const errorMessage = err instanceof Error ? err.message : "Unknown error";
        results.push({ rowIndex: row.rowIndex, code: row.original.code, name: row.original.name, status: "FAILED", error: errorMessage });
      }
    }

    setImporting(false);
    setImportResults({ success, failed });
    setImportApplyResults(results);
    setHasAppliedImport(true);
    await outletsQuery.refetch();
  }

  function resetImportState() {
    setImporting(false);
    setImportStep("source");
    setImportText("");
    setImportPlan([]);
    setImportSummary({ create: 0, error: 0, total: 0 });
    setImportProgress(0);
    setImportResults({ success: 0, failed: 0 });
    setImportApplyResults([]);
    setHasAppliedImport(false);
  }

  function handleExport() {
    downloadOutletsCsv(filteredOutlets, canManageCompanies ? selectedCompanyId : undefined);
  }

  return (
    <>
      <Stack gap="md">
        <PageCard
          title="Branch Management"
          description="Manage branches (outlets) for your company. Each branch is a physical location with its own POS, inventory, and journal."
          actions={
            <Group gap="sm">
              <Button
                variant="light"
                leftSection={<IconDownload size={16} />}
                onClick={handleExport}
                disabled={filteredOutlets.length === 0}
              >
                Export CSV
              </Button>
              <Button
                variant="light"
                leftSection={<IconUpload size={16} />}
                onClick={() => setImportOpened(true)}
              >
                Import
              </Button>
              <Button
                onClick={openCreateDialog}
                disabled={canManageCompanies && companies.length === 0}
              >
                Create Branch
              </Button>
            </Group>
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

              <SegmentedControl
                data={[
                  { value: "ALL", label: "All" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "INACTIVE", label: "Inactive" }
                ]}
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as "ALL" | "ACTIVE" | "INACTIVE")}
              />

              <Select
                label="City"
                placeholder="All cities"
                data={cityOptions}
                value={cityFilter}
                onChange={setCityFilter}
                clearable
                searchable
                style={{ minWidth: 160 }}
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
              <Alert color="red" withCloseButton onClose={() => setError(null)}>
                {error}
              </Alert>
            ) : null}
            {successMessage ? (
              <Alert color="green" withCloseButton onClose={() => setSuccessMessage(null)}>
                {successMessage}
              </Alert>
            ) : null}
          </Stack>
        </PageCard>

        <PageCard>
          {totalCount > 0 && (
            <Group gap="xs" mb="sm">
              <Badge size="lg" variant="light">Total: {totalCount}</Badge>
              <Badge size="lg" color="green" variant="light">Active: {activeCount}</Badge>
              <Badge size="lg" color="gray" variant="light">Inactive: {inactiveCount}</Badge>
              {filteredCount !== totalCount && (
                <Badge size="lg" color="blue" variant="light">Filtered: {filteredCount}</Badge>
              )}
            </Group>
          )}
          {totalCount === 0 && !outletsQuery.loading && (
            <Stack align="center" gap="xs" py="xl">
              <Text size="lg" fw={500}>No branches yet</Text>
              <Text size="sm" c="dimmed" ta="center">
                Create your first branch to start processing transactions.
              </Text>
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={openCreateDialog}
                mt="sm"
              >
                Create Branch
              </Button>
            </Stack>
          )}
          {totalCount > 0 && (
            <DataTable
              columns={columns}
              data={filteredOutlets}
              getRowId={(row) => String(row.id)}
              pagination={pagination}
              sort={sort}
              selection={selection}
              onPaginationChange={setPagination}
              onSortChange={setSort}
              onSelectionChange={setSelection}
              totalCount={filteredCount}
              loading={outletsQuery.loading ? "loading" : "idle"}
              emptyState={
                searchTerm.trim().length > 0 || statusFilter !== "ALL" || cityFilter
                  ? "No branches match your filters."
                  : "No branches match your search."
              }
            />
          )}
        </PageCard>
      </Stack>

      <Drawer
        opened={dialogMode !== null}
        onClose={handleCloseDialog}
        position="right"
        size={isMobile ? "100%" : "lg"}
        withCloseButton
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
        title={
          <Title order={4}>
            {dialogMode === "create" ? "Create New Branch" : dialogMode === "view" ? "Branch Details" : "Edit Branch"}
          </Title>
        }
      >
        {dialogMode === "view" && editingOutlet ? (
          <Stack gap="md">
            <Divider label="Branch Identity" my="sm" />
            
            <TextInput label="Branch Code" value={editingOutlet.code} disabled />
            <TextInput label="Branch Name" value={editingOutlet.name} disabled />
            
            <Badge color={editingOutlet.is_active ? "green" : "gray"} variant="light" size="lg">
              {editingOutlet.is_active ? "Active" : "Inactive"}
            </Badge>

            <Divider label="Contact & Address" my="sm" />

            <TextInput label="City" value={editingOutlet.city ?? "—"} disabled />
            <TextInput label="Phone" value={editingOutlet.phone ?? "—"} disabled />
            <TextInput label="Email" value={editingOutlet.email ?? "—"} disabled />
            <TextInput label="Address Line 1" value={editingOutlet.address_line1 ?? "—"} disabled />
            <TextInput label="Address Line 2" value={editingOutlet.address_line2 ?? "—"} disabled />
            <TextInput label="Postal Code" value={editingOutlet.postal_code ?? "—"} disabled />
            <TextInput label="Timezone" value={editingOutlet.timezone ?? "—"} disabled />

            <Group justify="flex-end" mt="md">
              <Button onClick={() => openEditDialog(editingOutlet)}>
                Edit Branch
              </Button>
            </Group>
          </Stack>
        ) : (
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

            <Divider label="Branch Identity" my="sm" />

            {dialogMode === "create" ? (
              <TextInput
                label="Branch Code"
                placeholder="e.g., JKT-MAIN, SBY-01"
                value={formData.code}
                onChange={(event) => setFormData({ ...formData, code: event.currentTarget.value.toUpperCase() })}
                onBlur={() => validateField("code")}
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
            onBlur={() => validateField("name")}
            maxLength={191}
            error={formErrors.name}
            withAsterisk
          />

          {dialogMode === "edit" && (
            <Switch
              label="Active"
              description="Inactive branches cannot process transactions"
              checked={formData.is_active}
              onChange={(event) => setFormData({ ...formData, is_active: event.currentTarget.checked })}
            />
          )}

          <Divider label="Contact & Address" my="sm" />

          <Group grow>
            <TextInput
              label="City"
              placeholder="e.g., Jakarta, Surabaya"
              value={formData.city}
              onChange={(event) => setFormData({ ...formData, city: event.currentTarget.value })}
              maxLength={96}
            />

            <TextInput
              label="Phone"
              placeholder="e.g., +62 21 1234 5678"
              value={formData.phone}
              onChange={(event) => setFormData({ ...formData, phone: event.currentTarget.value })}
              maxLength={32}
            />
          </Group>

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

          <TextInput
            label="Email"
            placeholder="branch@company.com"
            value={formData.email}
            onChange={(event) => setFormData({ ...formData, email: event.currentTarget.value })}
            onBlur={() => validateField("email")}
            maxLength={191}
            error={formErrors.email}
          />

          {error ? (
            <Alert color="red" title="Unable to save">
              {error}
            </Alert>
          ) : null}

          <Group justify="flex-end">
            <Button variant="default" onClick={handleCloseDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={submitting} disabled={!isFormSubmittable}>
              Save
            </Button>
          </Group>
          </Stack>
        )}
      </Drawer>

      <Modal
        opened={confirmState !== null}
        onClose={() => setConfirmState(null)}
        title={<Title order={4}>Delete Branch</Title>}
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Delete branch &quot;{confirmState?.name}&quot;? This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirmState(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button color="red" onClick={handleConfirmDelete} loading={deleting} disabled={deleting}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={importOpened}
        onClose={() => {
          if (importing) return;
          setImportOpened(false);
          resetImportState();
        }}
        title="Import Branches"
        size="lg"
        closeOnClickOutside={!importing}
        closeOnEscape={!importing}
        withCloseButton={!importing}
      >
        <Stack>
          <ImportStepBadges step={importStep} />

          <Divider />

          {importStep === "source" && (
            <Stack>
              <Textarea
                label="Paste data"
                placeholder="code,name,city,phone,email&#10;JKT-MAIN,Jakarta Main,Jakarta,+62 21 1234 5678,jkt@company.com&#10;SBY-01,Surabaya Branch,Surabaya,+62 31 5678 1234,sby@company.com"
                minRows={5}
                value={importText}
                onChange={(e) => setImportText(e.currentTarget.value)}
              />
              <FileInput
                label="Or upload file"
                placeholder="Choose CSV or TXT file"
                accept=".csv,.txt"
                onChange={handleImportFileSelect}
              />
              <Text size="xs" c="dimmed">
                Template: code,name,city,address_line1,address_line2,postal_code,phone,email,timezone
              </Text>
              <Button onClick={processImportText} disabled={!importText.trim()}>
                Continue to preview
              </Button>
            </Stack>
          )}

          {importStep === "preview" && (
            <Stack>
              <Group justify="space-between">
                <Text fw={500}>Import plan</Text>
                <Group gap="xs">
                  <Badge color="green">Create: {importSummary.create}</Badge>
                  <Badge color="red">Error: {importSummary.error}</Badge>
                </Group>
              </Group>

              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>#</Table.Th>
                    <Table.Th>Code</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>City</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {importPlan.slice(0, 20).map((row) => (
                    <Table.Tr key={row.rowIndex}>
                      <Table.Td>{row.rowIndex + 1}</Table.Td>
                      <Table.Td>{row.original.code ?? "—"}</Table.Td>
                      <Table.Td>{row.original.name ?? "—"}</Table.Td>
                      <Table.Td>{row.original.city ?? "—"}</Table.Td>
                      <Table.Td>
                        {row.action === "ERROR" ? (
                          <Badge color="red" size="sm">{row.error}</Badge>
                        ) : (
                          <Badge color="green" size="sm">Will create</Badge>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>

              {importPlan.length > 20 && (
                <Text size="sm" c="dimmed">Showing first 20 of {importPlan.length} rows</Text>
              )}

              <Group justify="space-between">
                <Button variant="default" onClick={() => setImportStep("source")}>
                  Back
                </Button>
                <Button
                  onClick={runImport}
                  loading={importing}
                  disabled={importing || importSummary.create === 0 || hasAppliedImport}
                >
                  {importing ? "Applying..." : hasAppliedImport ? "Import already applied" : `Start import (${importSummary.create})`}
                </Button>
              </Group>
            </Stack>
          )}

          {importStep === "apply" && (
            <Stack>
              {importing && (
                <>
                  <Text size="sm" c="dimmed">
                    Importing... {Math.round(importProgress)}%
                  </Text>
                  <Text size="xs" c="dimmed" fs="italic">
                    Import in progress. Please wait until completion before closing.
                  </Text>
                </>
              )}

              {!importing && (
                <>
                  <Alert color="green" title="Import complete">
                    Successfully created: {importResults.success} | Failed: {importResults.failed}
                  </Alert>

                  {importApplyResults.length > 0 && (
                    <Stack gap="xs">
                      <Text fw={500}>Results</Text>
                      <Table striped>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>#</Table.Th>
                            <Table.Th>Code</Table.Th>
                            <Table.Th>Name</Table.Th>
                            <Table.Th>Result</Table.Th>
                            <Table.Th>Message</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {importApplyResults.slice(0, 50).map((row) => (
                            <Table.Tr key={row.rowIndex}>
                              <Table.Td>{row.rowIndex + 1}</Table.Td>
                              <Table.Td>{row.code ?? "—"}</Table.Td>
                              <Table.Td>{row.name ?? "—"}</Table.Td>
                              <Table.Td>
                                <Badge color={row.status === "SUCCESS" ? "green" : "red"} size="sm">
                                  {row.status}
                                </Badge>
                              </Table.Td>
                              <Table.Td>{row.error ?? "—"}</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                      {importApplyResults.length > 50 && (
                        <Text size="sm" c="dimmed">Showing first 50 of {importApplyResults.length} rows</Text>
                      )}
                    </Stack>
                  )}

                  <Button
                    onClick={() => {
                      setImportOpened(false);
                      resetImportState();
                    }}
                  >
                    Done
                  </Button>
                </>
              )}
            </Stack>
          )}
        </Stack>
      </Modal>
    </>
  );
}
