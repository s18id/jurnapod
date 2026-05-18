// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { OutletCreateRequest, OutletUpdateRequest } from "@jurnapod/shared";
import {
  Alert,
  Button,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMemo, useState } from "react";

import { useShell } from "@/app/shell";
import { FilterBar } from "@/components/FilterBar";
import { PageCard } from "@/components/PageCard";
import { DetailDrawer, EntityTable, ScopeDisplay, StatusBadge } from "@/components/data-grid";
import type { DataTableColumnDef, PaginationState, RowSelectionState, SortState } from "@/components/ui/DataTable";
import { TIMEZONE_OPTIONS } from "@/constants/timezones";
import { resolveEffectivePermissions } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/session";

import {
  type CompanyAdminRecord,
  type OutletAdminRecord,
  useCompanyAdminList,
  useCreateOutletAdmin,
  useOutletAdminList,
  useUpdateOutletAdmin,
} from "./companies-outlets/api";
import {
  buildScopeSummary,
  DEFAULT_ADMIN_TIMEZONE,
  getOutletActionGates,
  isCompanyInactive,
  normalizeAdminTimezone,
  outletStatusLabel,
} from "./companies-outlets/admin-helpers";

type OutletsPageProps = {
  user: SessionUser;
};

type OutletDialogMode = "create" | "edit" | null;
type OutletStatusFilter = "all" | "active" | "inactive";

type OutletFormData = Required<Pick<OutletCreateRequest, "code" | "name">> &
  Omit<OutletCreateRequest, "code" | "name"> & { is_active: boolean };

const emptyOutletForm: OutletFormData = {
  code: "",
  name: "",
  timezone: DEFAULT_ADMIN_TIMEZONE,
  is_active: true,
};

function optionalString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}

function outletPatchFromForm(outlet: OutletAdminRecord, form: OutletFormData): OutletUpdateRequest {
  const patch: OutletUpdateRequest = {};
  if (form.name.trim() !== outlet.name) patch.name = form.name.trim();
  if ((form.city ?? "").trim() !== (outlet.city ?? "")) patch.city = optionalString(form.city) ?? null;
  if ((form.address_line1 ?? "").trim() !== (outlet.address_line1 ?? "")) patch.address_line1 = optionalString(form.address_line1) ?? null;
  if ((form.address_line2 ?? "").trim() !== (outlet.address_line2 ?? "")) patch.address_line2 = optionalString(form.address_line2) ?? null;
  if ((form.postal_code ?? "").trim() !== (outlet.postal_code ?? "")) patch.postal_code = optionalString(form.postal_code) ?? null;
  if ((form.phone ?? "").trim() !== (outlet.phone ?? "")) patch.phone = optionalString(form.phone) ?? null;
  if ((form.email ?? "").trim() !== (outlet.email ?? "")) patch.email = optionalString(form.email) ?? null;
  if (normalizeAdminTimezone(form.timezone) !== normalizeAdminTimezone(outlet.timezone)) patch.timezone = normalizeAdminTimezone(form.timezone);
  if (form.is_active !== outlet.is_active) patch.is_active = form.is_active;
  return patch;
}

function OutletForm(props: {
  mode: OutletDialogMode;
  form: OutletFormData;
  onChange: (form: OutletFormData) => void;
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
          label="Outlet code"
          value={form.code}
          onChange={(event) => onChange({ ...form, code: event.currentTarget.value.toUpperCase() })}
          maxLength={32}
          withAsterisk
        />
      ) : null}
      <TextInput
        label="Outlet name"
        value={form.name}
        onChange={(event) => onChange({ ...form, name: event.currentTarget.value })}
        maxLength={191}
        withAsterisk
      />
      {mode === "edit" ? (
        <Switch label="Active" checked={form.is_active} onChange={(event) => onChange({ ...form, is_active: event.currentTarget.checked })} />
      ) : null}
      <Group grow>
        <TextInput label="City" value={form.city ?? ""} onChange={(event) => onChange({ ...form, city: event.currentTarget.value })} />
        <TextInput label="Phone" value={form.phone ?? ""} onChange={(event) => onChange({ ...form, phone: event.currentTarget.value })} />
      </Group>
      <TextInput label="Address line 1" value={form.address_line1 ?? ""} onChange={(event) => onChange({ ...form, address_line1: event.currentTarget.value })} />
      <TextInput label="Address line 2" value={form.address_line2 ?? ""} onChange={(event) => onChange({ ...form, address_line2: event.currentTarget.value })} />
      <Group grow>
        <TextInput label="Postal code" value={form.postal_code ?? ""} onChange={(event) => onChange({ ...form, postal_code: event.currentTarget.value })} />
        <Select
          label="Timezone"
          data={TIMEZONE_OPTIONS}
          value={normalizeAdminTimezone(form.timezone)}
          onChange={(value) => onChange({ ...form, timezone: normalizeAdminTimezone(value) })}
          searchable
          allowDeselect={false}
          withAsterisk
        />
      </Group>
      <TextInput label="Email" value={form.email ?? ""} onChange={(event) => onChange({ ...form, email: event.currentTarget.value })} />
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

export function OutletsPage(props: OutletsPageProps) {
  const { user } = props;
  const shell = useShell();
  const permissions = useMemo(() => resolveEffectivePermissions(user) ?? [], [user]);
  const actor = useMemo(() => ({
    companyId: user.company_id,
    isSuperAdmin: user.roles.includes("SUPER_ADMIN") || user.global_roles.includes("SUPER_ADMIN"),
  }), [user.company_id, user.global_roles, user.roles]);

  const companiesQuery = useCompanyAdminList();
  const [selectedCompanyId, setSelectedCompanyId] = useState(user.company_id);
  const selectedCompany = useMemo<CompanyAdminRecord | null>(
    () => companiesQuery.data?.find((company) => company.id === selectedCompanyId) ?? null,
    [companiesQuery.data, selectedCompanyId],
  );
  const selectedCompanyIsRuntimeSupported = selectedCompanyId === user.company_id;
  const outletsQuery = useOutletAdminList(user.company_id);
  const createMutation = useCreateOutletAdmin(user.company_id);
  const updateMutation = useUpdateOutletAdmin(user.company_id);

  const gates = getOutletActionGates(permissions, actor, selectedCompanyId);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<OutletStatusFilter>("all");
  const [selectedOutlet, setSelectedOutlet] = useState<OutletAdminRecord | null>(null);
  const [dialogMode, setDialogMode] = useState<OutletDialogMode>(null);
  const [form, setForm] = useState<OutletFormData>(emptyOutletForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: 25 });
  const [sort, setSort] = useState<SortState | null>(null);
  const [selection, setSelection] = useState<RowSelectionState>({});

  const pageScope = buildScopeSummary({
    company: selectedCompany,
    fallbackCompanyId: selectedCompanyId,
    currentOutlet: shell.outlet.currentOutlet,
  });

  const visibleOutlets = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return (selectedCompanyIsRuntimeSupported ? outletsQuery.data ?? [] : [])
      .filter((outlet) => {
        if (statusFilter === "active") return outlet.is_active;
        if (statusFilter === "inactive") return !outlet.is_active;
        return true;
      })
      .filter((outlet) => {
        if (!search) return true;
        return outlet.code.toLowerCase().includes(search) || outlet.name.toLowerCase().includes(search) || (outlet.address_line1?.toLowerCase().includes(search) ?? false);
      });
  }, [outletsQuery.data, searchTerm, selectedCompanyIsRuntimeSupported, statusFilter]);

  const columns = useMemo<DataTableColumnDef<OutletAdminRecord>[]>(() => [
    { id: "code", header: "Code", sortable: true, cell: (info) => <Text fw={600}>{info.row.original.code}</Text> },
    { id: "name", header: "Name", sortable: true, cell: (info) => <Text>{info.row.original.name}</Text> },
    { id: "address", header: "Address", cell: (info) => <Text size="sm">{info.row.original.address_line1 ?? info.row.original.city ?? "—"}</Text> },
    { id: "status", header: "Status", cell: (info) => <StatusBadge status={outletStatusLabel(info.row.original)} /> },
    {
      id: "actions",
      header: "Actions",
      cell: (info) => (
        <Group gap="xs" justify="flex-end">
          <Button size="xs" variant="light" onClick={() => setSelectedOutlet(info.row.original)}>View</Button>
          {gates.edit ? (
            <Button
              size="xs"
              variant="light"
              onClick={() => {
                const outlet = info.row.original;
                setSelectedOutlet(outlet);
                setForm({
                  code: outlet.code,
                  name: outlet.name,
                  city: outlet.city ?? undefined,
                  address_line1: outlet.address_line1 ?? undefined,
                  address_line2: outlet.address_line2 ?? undefined,
                  postal_code: outlet.postal_code ?? undefined,
                  phone: outlet.phone ?? undefined,
                  email: outlet.email ?? undefined,
                  timezone: normalizeAdminTimezone(outlet.timezone),
                  is_active: outlet.is_active,
                });
                setDialogMode("edit");
                setSaveError(null);
              }}
            >
              Edit
            </Button>
          ) : null}
        </Group>
      ),
    },
  ], [gates.edit]);

  async function handleSave() {
    setSaveError(null);
    try {
      if (dialogMode === "create") {
        await createMutation.mutateAsync({
          ...form,
          company_id: user.company_id,
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
        });
      } else if (dialogMode === "edit" && selectedOutlet) {
        const patch = outletPatchFromForm(selectedOutlet, form);
        if (Object.keys(patch).length > 0) {
          await updateMutation.mutateAsync({ id: selectedOutlet.id, patch });
        }
      }
      setDialogMode(null);
      setForm(emptyOutletForm);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Unable to save outlet");
    }
  }

  return (
    <Stack gap="md">
      <PageCard
        title="Outlet Management"
        description="Outlet administration under explicit company and outlet scope. Backend ACL remains authoritative."
        actions={gates.create && selectedCompanyIsRuntimeSupported ? (
          <Button onClick={() => { setForm(emptyOutletForm); setDialogMode("create"); setSaveError(null); }}>
            Create Outlet
          </Button>
        ) : null}
      >
        <Stack gap="sm">
          <ScopeDisplay {...pageScope} data-testid="outlet-page-scope" />
          {selectedCompany && isCompanyInactive(selectedCompany) ? (
            <Alert color="yellow" title="Inactive company context" data-testid="outlet-inactive-company-context">
              Outlets are displayed under inactive company context without implying backend deactivation cascade.
            </Alert>
          ) : null}
          {!selectedCompanyIsRuntimeSupported ? (
            <Alert color="yellow" title="Cross-company outlet contract unavailable" data-testid="outlet-cross-company-gap">
              Generated GET /outlets contract does not expose company_id filtering. Cross-company outlet lists remain blocked in the UI.
            </Alert>
          ) : null}
          {!gates.create ? (
            <Alert color="blue" title="Outlet create/edit gated" data-testid="outlet-manage-blocked">
              You need platform.outlets.MANAGE before outlet create/edit controls are exposed.
            </Alert>
          ) : null}
          <FilterBar>
            {actor.isSuperAdmin ? (
              <Select
                label="Company"
                data={(companiesQuery.data ?? []).map((company) => ({ value: String(company.id), label: `${company.code} — ${company.name}` }))}
                value={String(selectedCompanyId)}
                onChange={(value) => setSelectedCompanyId(Number(value ?? user.company_id))}
              />
            ) : null}
            <TextInput label="Search" value={searchTerm} onChange={(event) => setSearchTerm(event.currentTarget.value)} />
            <Select
              label="Status"
              data={[{ value: "all", label: "All" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]}
              value={statusFilter}
              onChange={(value) => setStatusFilter((value as OutletStatusFilter) ?? "all")}
            />
          </FilterBar>
          {outletsQuery.error ? <Alert color="red" title="Unable to load outlets">{outletsQuery.error.message}</Alert> : null}
        </Stack>
      </PageCard>

      <PageCard title={`Outlets (${visibleOutlets.length})`}>
        <EntityTable
          entityName="outlets"
          columns={columns}
          data={visibleOutlets}
          getRowId={(outlet) => String(outlet.id)}
          loading={outletsQuery.isLoading ? "loading" : "idle"}
          pagination={pagination}
          sort={sort}
          selection={selection}
          totalCount={visibleOutlets.length}
          onPaginationChange={setPagination}
          onSortChange={setSort}
          onSelectionChange={setSelection}
          emptyState="No outlets match the current filters."
        />
      </PageCard>

      <DetailDrawer opened={selectedOutlet !== null && dialogMode === null} onClose={() => setSelectedOutlet(null)} title="Outlet Detail" size="lg" data-testid="outlet-detail-drawer">
        {selectedOutlet ? (
          <Stack gap="md">
            <ScopeDisplay {...buildScopeSummary({ company: selectedCompany, fallbackCompanyId: selectedOutlet.company_id, currentOutlet: shell.outlet.currentOutlet })} status={outletStatusLabel(selectedOutlet)} />
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <Text><strong>Code:</strong> {selectedOutlet.code}</Text>
              <Text><strong>Name:</strong> {selectedOutlet.name}</Text>
              <Text><strong>Address:</strong> {selectedOutlet.address_line1 ?? "—"}</Text>
              <Text><strong>City:</strong> {selectedOutlet.city ?? "—"}</Text>
              <Text><strong>Email:</strong> {selectedOutlet.email ?? "—"}</Text>
              <Text><strong>Phone:</strong> {selectedOutlet.phone ?? "—"}</Text>
            </SimpleGrid>
          </Stack>
        ) : null}
      </DetailDrawer>

      <Modal opened={dialogMode !== null} onClose={() => setDialogMode(null)} title={<Title order={4}>{dialogMode === "create" ? "Create Outlet" : "Edit Outlet"}</Title>} centered>
        <OutletForm
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
