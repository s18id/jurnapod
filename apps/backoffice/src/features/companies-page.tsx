// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { CompanyCreateRequest, CompanyUpdateRequest } from "@jurnapod/shared";
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMemo, useState } from "react";

import { FilterBar } from "@/components/FilterBar";
import { PageCard } from "@/components/PageCard";
import { DetailDrawer, EntityTable, ScopeDisplay, StatusBadge } from "@/components/data-grid";
import type { DataTableColumnDef, PaginationState, RowSelectionState, SortState } from "@/components/ui/DataTable";
import { TIMEZONE_OPTIONS } from "@/constants/timezones";
import { useShell } from "@/app/shell";
import type { SessionUser } from "@/lib/session";
import { resolveEffectivePermissions } from "@/lib/auth/permissions";

import {
  type CompanyAdminRecord,
  useCompanyAdminList,
  useCreateCompanyAdmin,
  useUpdateCompanyAdmin,
} from "./companies-outlets/api";
import {
  buildScopeSummary,
  companyStatusLabel,
  DEFAULT_ADMIN_TIMEZONE,
  getCompanyActionGates,
  isCompanyInactive,
  normalizeAdminTimezone,
} from "./companies-outlets/admin-helpers";

type CompaniesPageProps = {
  user: SessionUser;
};

type CompanyDialogMode = "create" | "edit" | null;
type CompanyStatusFilter = "all" | "active" | "inactive";

type CompanyFormData = CompanyCreateRequest;

const emptyCompanyForm: CompanyFormData = {
  code: "",
  name: "",
  timezone: DEFAULT_ADMIN_TIMEZONE,
};

function normalizeOptional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}

function companyPatchFromForm(company: CompanyAdminRecord, form: CompanyFormData): CompanyUpdateRequest {
  const patch: CompanyUpdateRequest = {};
  const fields: Array<keyof CompanyUpdateRequest> = [
    "name",
    "legal_name",
    "tax_id",
    "email",
    "phone",
    "timezone",
    "currency_code",
    "address_line1",
    "address_line2",
    "city",
    "postal_code",
  ];
  for (const field of fields) {
    const next = field === "name" || field === "timezone"
      ? normalizeOptional(form[field])
      : normalizeOptional(form[field] ?? null) ?? null;
    const current = company[field] ?? (field === "name" || field === "timezone" ? undefined : null);
    if (next !== current && next !== undefined) {
      patch[field] = next as never;
    }
  }
  return patch;
}

function CompanyForm(props: {
  mode: CompanyDialogMode;
  form: CompanyFormData;
  onChange: (form: CompanyFormData) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const { mode, form, onChange, onSubmit, onCancel, submitting, error } = props;
  return (
    <Stack gap="md">
      {mode === "create" ? (
        <TextInput
          label="Company code"
          value={form.code}
          onChange={(event) => onChange({ ...form, code: event.currentTarget.value.toUpperCase() })}
          maxLength={32}
          withAsterisk
        />
      ) : null}
      <TextInput
        label="Company name"
        value={form.name}
        onChange={(event) => onChange({ ...form, name: event.currentTarget.value })}
        maxLength={191}
        withAsterisk
      />
      <TextInput
        label="Legal name"
        value={form.legal_name ?? ""}
        onChange={(event) => onChange({ ...form, legal_name: event.currentTarget.value })}
        maxLength={191}
      />
      <Group grow>
        <TextInput
          label="Email"
          value={form.email ?? ""}
          onChange={(event) => onChange({ ...form, email: event.currentTarget.value })}
          maxLength={191}
        />
        <TextInput
          label="Phone"
          value={form.phone ?? ""}
          onChange={(event) => onChange({ ...form, phone: event.currentTarget.value })}
          maxLength={50}
        />
      </Group>
      <Group grow>
        <TextInput
          label="Tax ID"
          value={form.tax_id ?? ""}
          onChange={(event) => onChange({ ...form, tax_id: event.currentTarget.value })}
          maxLength={64}
        />
        <TextInput
          label="Currency"
          value={form.currency_code ?? ""}
          onChange={(event) => onChange({ ...form, currency_code: event.currentTarget.value.toUpperCase() })}
          maxLength={3}
        />
      </Group>
      <Select
        label="Timezone"
        data={TIMEZONE_OPTIONS}
        value={normalizeAdminTimezone(form.timezone)}
        onChange={(value) => onChange({ ...form, timezone: normalizeAdminTimezone(value) })}
        searchable
        allowDeselect={false}
        withAsterisk
      />
      <TextInput
        label="Address line 1"
        value={form.address_line1 ?? ""}
        onChange={(event) => onChange({ ...form, address_line1: event.currentTarget.value })}
      />
      <TextInput
        label="Address line 2"
        value={form.address_line2 ?? ""}
        onChange={(event) => onChange({ ...form, address_line2: event.currentTarget.value })}
      />
      <Group grow>
        <TextInput
          label="City"
          value={form.city ?? ""}
          onChange={(event) => onChange({ ...form, city: event.currentTarget.value })}
        />
        <TextInput
          label="Postal code"
          value={form.postal_code ?? ""}
          onChange={(event) => onChange({ ...form, postal_code: event.currentTarget.value })}
        />
      </Group>
      {error ? <Alert color="red" title="Unable to save">{error}</Alert> : null}
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel} disabled={submitting}>Cancel</Button>
        <Button onClick={onSubmit} loading={submitting} disabled={!form.name.trim() || (mode === "create" && !form.code.trim())}>
          Save
        </Button>
      </Group>
    </Stack>
  );
}

export function CompaniesPage(props: CompaniesPageProps) {
  const { user } = props;
  const shell = useShell();
  const permissions = useMemo(() => resolveEffectivePermissions(user) ?? [], [user]);
  const actor = useMemo(() => ({
    companyId: user.company_id,
    isSuperAdmin: user.roles.includes("SUPER_ADMIN") || user.global_roles.includes("SUPER_ADMIN"),
  }), [user.company_id, user.global_roles, user.roles]);

  const companiesQuery = useCompanyAdminList();
  const createMutation = useCreateCompanyAdmin();
  const updateMutation = useUpdateCompanyAdmin();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<CompanyStatusFilter>("all");
  const [selectedCompany, setSelectedCompany] = useState<CompanyAdminRecord | null>(null);
  const [dialogMode, setDialogMode] = useState<CompanyDialogMode>(null);
  const [form, setForm] = useState<CompanyFormData>(emptyCompanyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 25 });
  const [sort, setSort] = useState<SortState | null>(null);
  const [selection, setSelection] = useState<RowSelectionState>({});

  const currentCompany = useMemo(
    () => companiesQuery.data?.find((company) => company.id === user.company_id) ?? selectedCompany,
    [companiesQuery.data, selectedCompany, user.company_id],
  );
  const pageScope = buildScopeSummary({
    company: currentCompany,
    fallbackCompanyId: user.company_id,
    currentOutlet: shell.outlet.currentOutlet,
  });
  const pageGates = getCompanyActionGates(permissions, actor, user.company_id);

  const filteredCompanies = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return (companiesQuery.data ?? [])
      .filter((company) => {
        if (statusFilter === "active") return !isCompanyInactive(company);
        if (statusFilter === "inactive") return isCompanyInactive(company);
        return true;
      })
      .filter((company) => {
        if (!search) return true;
        return company.name.toLowerCase().includes(search) || company.code.toLowerCase().includes(search);
      });
  }, [companiesQuery.data, searchTerm, statusFilter]);

  const columns = useMemo<DataTableColumnDef<CompanyAdminRecord>[]>(() => [
    { id: "code", header: "Code", sortable: true, cell: (info) => <Text fw={600}>{info.row.original.code}</Text> },
    { id: "name", header: "Name", sortable: true, cell: (info) => <Text>{info.row.original.name}</Text> },
    { id: "status", header: "Status", cell: (info) => <StatusBadge status={companyStatusLabel(info.row.original)} /> },
    { id: "created_at", header: "Created", sortable: true, cell: (info) => <Text size="sm">{info.row.original.created_at}</Text> },
    {
      id: "actions",
      header: "Actions",
      cell: (info) => {
        const company = info.row.original;
        const gates = getCompanyActionGates(permissions, actor, company.id);
        return (
          <Group gap="xs" justify="flex-end">
            <Button size="xs" variant="light" onClick={() => setSelectedCompany(company)}>View</Button>
            {gates.edit && !isCompanyInactive(company) ? (
              <Button
                size="xs"
                variant="light"
                onClick={() => {
                  setSelectedCompany(company);
                  setForm({
                    code: company.code,
                    name: company.name,
                    legal_name: company.legal_name ?? undefined,
                    tax_id: company.tax_id ?? undefined,
                    email: company.email ?? undefined,
                    phone: company.phone ?? undefined,
                    timezone: normalizeAdminTimezone(company.timezone),
                    currency_code: company.currency_code ?? undefined,
                    address_line1: company.address_line1 ?? undefined,
                    address_line2: company.address_line2 ?? undefined,
                    city: company.city ?? undefined,
                    postal_code: company.postal_code ?? undefined,
                  });
                  setDialogMode("edit");
                  setSaveError(null);
                }}
              >
                Edit
              </Button>
            ) : null}
          </Group>
        );
      },
    },
  ], [actor, permissions]);

  async function handleSave() {
    setSaveError(null);
    try {
      if (dialogMode === "create") {
        await createMutation.mutateAsync({
          ...form,
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          timezone: normalizeAdminTimezone(form.timezone),
        });
      } else if (dialogMode === "edit" && selectedCompany) {
        const patch = companyPatchFromForm(selectedCompany, form);
        if (Object.keys(patch).length > 0) {
          await updateMutation.mutateAsync({ id: selectedCompany.id, patch });
        }
      }
      setDialogMode(null);
      setForm(emptyCompanyForm);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save company");
    }
  }

  return (
    <Stack gap="md">
      <PageCard
        title="Company Management"
        description="Company administration with explicit tenant scope. Backend ACL remains authoritative."
        actions={pageGates.create ? (
          <Button onClick={() => { setForm(emptyCompanyForm); setDialogMode("create"); setSaveError(null); }}>
            Create Company
          </Button>
        ) : null}
      >
        <Stack gap="sm">
          <ScopeDisplay {...pageScope} data-testid="company-page-scope" />
          {!pageGates.create ? (
            <Alert color="blue" title="Company creation gated" data-testid="company-create-blocked">
              Company creation is exposed only when platform.companies.MANAGE is present and backend SUPER_ADMIN semantics allow it.
            </Alert>
          ) : null}
          <FilterBar>
            <TextInput label="Search" value={searchTerm} onChange={(event) => setSearchTerm(event.currentTarget.value)} />
            <Select
              label="Status"
              data={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]}
              value={statusFilter}
              onChange={(value) => setStatusFilter((value as CompanyStatusFilter) ?? "all")}
            />
          </FilterBar>
          {companiesQuery.error ? <Alert color="red" title="Unable to load companies">{companiesQuery.error.message}</Alert> : null}
        </Stack>
      </PageCard>

      <PageCard title={`Companies (${filteredCompanies.length})`}>
        <EntityTable
          entityName="companies"
          columns={columns}
          data={filteredCompanies}
          getRowId={(company) => String(company.id)}
          loading={companiesQuery.isLoading ? "loading" : "idle"}
          pagination={pagination}
          sort={sort}
          selection={selection}
          totalCount={filteredCompanies.length}
          onPaginationChange={setPagination}
          onSortChange={setSort}
          onSelectionChange={setSelection}
          emptyState="No companies match the current filters."
        />
      </PageCard>

      <DetailDrawer
        opened={selectedCompany !== null && dialogMode === null}
        onClose={() => setSelectedCompany(null)}
        title="Company Detail"
        size="lg"
        data-testid="company-detail-drawer"
      >
        {selectedCompany ? (
          <Stack gap="md">
            <ScopeDisplay {...buildScopeSummary({ company: selectedCompany, fallbackCompanyId: user.company_id, currentOutlet: shell.outlet.currentOutlet })} />
            {isCompanyInactive(selectedCompany) ? (
              <Alert color="yellow" title="Inactive company context" data-testid="inactive-company-context">
                Associated outlets MUST be treated as inactive context in this UI. No backend cascade is implied.
              </Alert>
            ) : null}
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <Text><strong>Code:</strong> {selectedCompany.code}</Text>
              <Text><strong>Name:</strong> {selectedCompany.name}</Text>
              <Text><strong>Email:</strong> {selectedCompany.email ?? "—"}</Text>
              <Text><strong>Phone:</strong> {selectedCompany.phone ?? "—"}</Text>
              <Text><strong>Created:</strong> {selectedCompany.created_at}</Text>
              <Text><strong>Updated:</strong> {selectedCompany.updated_at}</Text>
            </SimpleGrid>
          </Stack>
        ) : null}
      </DetailDrawer>

      <Modal opened={dialogMode !== null} onClose={() => setDialogMode(null)} title={<Title order={4}>{dialogMode === "create" ? "Create Company" : "Edit Company"}</Title>} centered>
        <CompanyForm
          mode={dialogMode}
          form={form}
          onChange={setForm}
          onSubmit={handleSave}
          onCancel={() => setDialogMode(null)}
          submitting={createMutation.isPending || updateMutation.isPending}
          error={saveError}
        />
      </Modal>
    </Stack>
  );
}
