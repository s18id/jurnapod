// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Drawer,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from "@mantine/core";
import { useDebouncedValue, useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconAlertCircle, IconEye, IconPencil, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";
import { useCallback, useMemo, useState, type MouseEvent } from "react";

import { ReviewPanel, type ReviewPanelSection } from "@/components/ReviewPanel";
import { EntityTable } from "@/components/data-grid";
import type { DataTableColumnDef, PaginationState } from "@/components/ui/DataTable";
import { useFormAutosave } from "@/hooks/useFormAutosave";
import { ApiError } from "@/lib/api-client";
import { actionGates, resolveEffectivePermissions } from "@/lib/auth/permissions";
import type { SessionUser } from "@/lib/session";

import {
  SUPPLIERS_DEFAULT_LIMIT,
  pageToSupplierOffset,
  type ContactFormInput,
  type Supplier,
  type SupplierContact,
  type SupplierFormInput,
  type SupplierStatusFilter,
  type SupplierUpdateInput,
  useCreateSupplierContactMutation,
  useCreateSupplierMutation,
  useDeactivateSupplierMutation,
  useDeleteSupplierContactMutation,
  useSupplierContactsQuery,
  useSupplierQuery,
  useSuppliersQuery,
  useUpdateSupplierContactMutation,
  useUpdateSupplierMutation,
} from "./api";

interface PurchasingSuppliersPageProps {
  user: SessionUser;
}

type SupplierModalMode = "create" | "edit";
type ContactModalMode = "create" | "edit";

export interface SupplierFormData {
  code: string;
  name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  postal_code: string;
  country: string;
  currency: string;
  credit_limit: string;
  payment_terms_days: string;
  notes: string;
}

export interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  role: string;
  is_primary: boolean;
  notes: string;
}

type FormErrors = Record<string, string>;

export const defaultSupplierFormData: SupplierFormData = {
  code: "",
  name: "",
  email: "",
  phone: "",
  address_line1: "",
  address_line2: "",
  city: "",
  postal_code: "",
  country: "",
  currency: "IDR",
  credit_limit: "0",
  payment_terms_days: "",
  notes: "",
};

export const defaultContactFormData: ContactFormData = {
  name: "",
  email: "",
  phone: "",
  role: "",
  is_primary: false,
  notes: "",
};

function optionalString(value: string): string | null | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function requiredTrimmed(value: string): string {
  return value.trim();
}

function isValidEmail(value: string): boolean {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isCurrency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value.trim().toUpperCase());
}

function isDecimal(value: string): boolean {
  return /^\d+(\.\d{1,4})?$/.test(value.trim());
}

export function formatSupplierApiError(error: unknown): string {
  if (error instanceof ApiError) return `${error.code}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "UNKNOWN_ERROR: Supplier request failed";
}

export function validateSupplierForm(data: SupplierFormData, mode: SupplierModalMode): FormErrors {
  const errors: FormErrors = {};
  if (mode === "create" && !data.code.trim()) errors.code = "Supplier code is required.";
  if (mode === "create" && data.code.trim().length > 32) errors.code = "Supplier code must be 32 characters or fewer.";
  if (!data.name.trim()) errors.name = "Supplier name is required.";
  if (data.name.trim().length > 191) errors.name = "Supplier name must be 191 characters or fewer.";
  if (!isValidEmail(data.email)) errors.email = "Enter a valid email address.";
  if (!isCurrency(data.currency)) errors.currency = "Currency must be a 3-letter ISO code.";
  if (!isDecimal(data.credit_limit)) errors.credit_limit = "Credit limit must be a positive decimal with up to 4 decimals.";
  if (data.payment_terms_days.trim()) {
    const terms = Number(data.payment_terms_days);
    if (!Number.isInteger(terms) || terms < 0 || terms > 365) {
      errors.payment_terms_days = "Payment terms must be an integer from 0 to 365.";
    }
  }
  return errors;
}

export function validateContactForm(data: ContactFormData): FormErrors {
  const errors: FormErrors = {};
  if (!data.name.trim()) errors.name = "Contact name is required.";
  if (data.name.trim().length > 191) errors.name = "Contact name must be 191 characters or fewer.";
  if (!isValidEmail(data.email)) errors.email = "Enter a valid email address.";
  return errors;
}

export function supplierFormToCreateInput(data: SupplierFormData, companyId: number): SupplierFormInput {
  return {
    company_id: companyId,
    code: requiredTrimmed(data.code),
    name: requiredTrimmed(data.name),
    email: optionalString(data.email),
    phone: optionalString(data.phone),
    address_line1: optionalString(data.address_line1),
    address_line2: optionalString(data.address_line2),
    city: optionalString(data.city),
    postal_code: optionalString(data.postal_code),
    country: optionalString(data.country),
    currency: requiredTrimmed(data.currency).toUpperCase(),
    credit_limit: requiredTrimmed(data.credit_limit),
    payment_terms_days: data.payment_terms_days.trim() ? Number(data.payment_terms_days) : null,
    notes: optionalString(data.notes),
  };
}

export function supplierFormToUpdateInput(data: SupplierFormData): SupplierUpdateInput {
  return {
    name: requiredTrimmed(data.name),
    email: optionalString(data.email),
    phone: optionalString(data.phone),
    address_line1: optionalString(data.address_line1),
    address_line2: optionalString(data.address_line2),
    city: optionalString(data.city),
    postal_code: optionalString(data.postal_code),
    country: optionalString(data.country),
    currency: requiredTrimmed(data.currency).toUpperCase(),
    credit_limit: requiredTrimmed(data.credit_limit),
    payment_terms_days: data.payment_terms_days.trim() ? Number(data.payment_terms_days) : null,
    notes: optionalString(data.notes),
  };
}

export function contactFormToInput(data: ContactFormData): ContactFormInput {
  return {
    name: requiredTrimmed(data.name),
    email: optionalString(data.email),
    phone: optionalString(data.phone),
    role: optionalString(data.role),
    is_primary: data.is_primary,
    notes: optionalString(data.notes),
  };
}

export function supplierToFormData(supplier: Supplier): SupplierFormData {
  return {
    code: supplier.code,
    name: supplier.name,
    email: supplier.email ?? "",
    phone: supplier.phone ?? "",
    address_line1: supplier.address_line1 ?? "",
    address_line2: supplier.address_line2 ?? "",
    city: supplier.city ?? "",
    postal_code: supplier.postal_code ?? "",
    country: supplier.country ?? "",
    currency: supplier.currency,
    credit_limit: supplier.credit_limit,
    payment_terms_days: supplier.payment_terms_days == null ? "" : String(supplier.payment_terms_days),
    notes: supplier.notes ?? "",
  };
}

export function contactToFormData(contact: SupplierContact): ContactFormData {
  return {
    name: contact.name,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    role: contact.role ?? "",
    is_primary: contact.is_primary,
    notes: contact.notes ?? "",
  };
}

function statusLabel(isActive: boolean): string {
  return isActive ? "Active" : "Inactive";
}

function DetailField(props: { label: string; value: string | number | null | undefined }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed" tt="uppercase">{props.label}</Text>
      <Text size="sm">{props.value == null || props.value === "" ? "—" : props.value}</Text>
    </Stack>
  );
}

function SupplierFields(props: {
  data: SupplierFormData;
  errors: FormErrors;
  mode: SupplierModalMode;
  onChange: (patch: Partial<SupplierFormData>) => void;
}) {
  const { data, errors, mode, onChange } = props;
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput
          label="Supplier code"
          value={data.code}
          onChange={(event) => onChange({ code: event.currentTarget.value })}
          error={errors.code}
          disabled={mode === "edit"}
          required={mode === "create"}
        />
        <TextInput
          label="Supplier name"
          value={data.name}
          onChange={(event) => onChange({ name: event.currentTarget.value })}
          error={errors.name}
          required
        />
        <TextInput
          label="Email"
          value={data.email}
          onChange={(event) => onChange({ email: event.currentTarget.value })}
          error={errors.email}
        />
        <TextInput label="Phone" value={data.phone} onChange={(event) => onChange({ phone: event.currentTarget.value })} />
        <TextInput
          label="Currency"
          value={data.currency}
          onChange={(event) => onChange({ currency: event.currentTarget.value.toUpperCase() })}
          error={errors.currency}
          required
        />
        <TextInput
          label="Credit limit"
          value={data.credit_limit}
          onChange={(event) => onChange({ credit_limit: event.currentTarget.value })}
          error={errors.credit_limit}
        />
        <NumberInput
          label="Payment terms days"
          value={data.payment_terms_days === "" ? undefined : Number(data.payment_terms_days)}
          onChange={(value) => onChange({ payment_terms_days: value === "" || value == null ? "" : String(value) })}
          error={errors.payment_terms_days}
          min={0}
          max={365}
        />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <TextInput label="Address line 1" value={data.address_line1} onChange={(event) => onChange({ address_line1: event.currentTarget.value })} />
        <TextInput label="Address line 2" value={data.address_line2} onChange={(event) => onChange({ address_line2: event.currentTarget.value })} />
        <TextInput label="City" value={data.city} onChange={(event) => onChange({ city: event.currentTarget.value })} />
        <TextInput label="Postal code" value={data.postal_code} onChange={(event) => onChange({ postal_code: event.currentTarget.value })} />
        <TextInput label="Country" value={data.country} onChange={(event) => onChange({ country: event.currentTarget.value })} />
      </SimpleGrid>
      <Textarea label="Notes" minRows={3} value={data.notes} onChange={(event) => onChange({ notes: event.currentTarget.value })} />
    </Stack>
  );
}

function SupplierReviewForm(props: {
  companyId: number;
  userId: number;
  mode: SupplierModalMode;
  supplier: Supplier | null;
  data: SupplierFormData;
  errors: FormErrors;
  submitting: boolean;
  onChange: (patch: Partial<SupplierFormData>) => void;
  onRestore: (data: SupplierFormData) => void;
  onDiscard: () => void;
  onSubmit: () => Promise<boolean>;
}) {
  const scope = useMemo(() => ({
    companyId: props.companyId,
    userId: props.userId,
    formType: `purchasing-supplier-${props.mode}`,
    entityId: props.supplier?.id,
    draftId: props.supplier ? undefined : "new-supplier",
  }), [props.companyId, props.mode, props.supplier, props.userId]);
  const autosave = useFormAutosave<SupplierFormData>({
    scope,
    value: props.data,
    onRestore: (draft) => props.onRestore(draft.payload),
  });

  const sections: ReviewPanelSection[] = [
    {
      id: "supplier-core",
      title: "Supplier profile",
      description: "Review supplier identity, commercial settings, and contact channels.",
      errors: [props.errors.code, props.errors.name, props.errors.email, props.errors.currency, props.errors.credit_limit, props.errors.payment_terms_days].filter(Boolean) as string[],
      content: <SupplierFields data={props.data} errors={props.errors} mode={props.mode} onChange={props.onChange} />,
    },
  ];

  return (
    <ReviewPanel
      title={props.mode === "create" ? "Create supplier" : "Edit supplier"}
      description="Supplier changes use purchasing.suppliers permissions and are saved only after final review."
      sections={sections}
      summaryItems={[
        { label: "Supplier", value: props.data.name || props.data.code || "New supplier" },
        { label: "Currency", value: props.data.currency || "—" },
      ]}
      scopeBadges={[{ label: "Company", value: String(props.companyId) }]}
      autosaveWarning={autosave.warning?.message}
      saveLabel={props.mode === "create" ? "Create supplier" : "Save supplier"}
      submitting={props.submitting}
      onDiscardDraft={() => {
        autosave.discardDraft();
        props.onDiscard();
      }}
      onSubmit={() => {
        void props.onSubmit().then((saved) => {
          if (saved) autosave.discardDraft();
        });
      }}
    />
  );
}

function ContactFields(props: {
  data: ContactFormData;
  errors: FormErrors;
  onChange: (patch: Partial<ContactFormData>) => void;
}) {
  return (
    <Stack gap="md">
      <TextInput label="Name" required value={props.data.name} error={props.errors.name} onChange={(event) => props.onChange({ name: event.currentTarget.value })} />
      <TextInput label="Email" value={props.data.email} error={props.errors.email} onChange={(event) => props.onChange({ email: event.currentTarget.value })} />
      <TextInput label="Phone" value={props.data.phone} onChange={(event) => props.onChange({ phone: event.currentTarget.value })} />
      <TextInput label="Role" value={props.data.role} onChange={(event) => props.onChange({ role: event.currentTarget.value })} />
      <Checkbox label="Primary contact" checked={props.data.is_primary} onChange={(event) => props.onChange({ is_primary: event.currentTarget.checked })} />
      <Textarea label="Notes" minRows={3} value={props.data.notes} onChange={(event) => props.onChange({ notes: event.currentTarget.value })} />
    </Stack>
  );
}

export function SupplierContactsPanel(props: {
  contacts: SupplierContact[];
  loading: boolean;
  error: unknown;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onCreate: () => void;
  onEdit: (contact: SupplierContact) => void;
  onDelete: (contact: SupplierContact) => void;
}) {
  return (
    <Card withBorder radius="md" p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={4}>Contacts</Title>
          {props.canCreate ? <Button size="xs" leftSection={<IconPlus size={14} />} onClick={props.onCreate}>Add contact</Button> : null}
        </Group>
        {props.error ? <Alert color="red">{formatSupplierApiError(props.error)}</Alert> : null}
        {props.loading ? <Text c="dimmed">Loading contacts…</Text> : null}
        {!props.loading && props.contacts.length === 0 ? <Text c="dimmed">No supplier contacts yet.</Text> : null}
        {props.contacts.length > 0 ? (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Phone</Table.Th>
                <Table.Th>Role</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {props.contacts.map((contact) => (
                <Table.Tr key={contact.id}>
                  <Table.Td>{contact.name}</Table.Td>
                  <Table.Td>{contact.email ?? "—"}</Table.Td>
                  <Table.Td>{contact.phone ?? "—"}</Table.Td>
                  <Table.Td>{contact.role ?? "—"}</Table.Td>
                  <Table.Td>{contact.is_primary ? <Badge>Primary</Badge> : <Text size="sm" c="dimmed">Secondary</Text>}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      {props.canUpdate ? <Button size="xs" variant="light" onClick={() => props.onEdit(contact)}>Edit</Button> : null}
                      {props.canDelete ? <Button size="xs" variant="light" color="red" onClick={() => props.onDelete(contact)}>Delete</Button> : null}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : null}
      </Stack>
    </Card>
  );
}

function SupplierDetailDrawer(props: {
  opened: boolean;
  supplierId: number | null;
  permissions: Record<"READ" | "CREATE" | "UPDATE" | "DELETE" | "ANALYZE" | "MANAGE", boolean>;
  onClose: () => void;
  onCreateContact: () => void;
  onEditContact: (contact: SupplierContact) => void;
  onDeleteContact: (contact: SupplierContact) => void;
}) {
  const supplierQuery = useSupplierQuery(props.supplierId);
  const contactsQuery = useSupplierContactsQuery(props.supplierId);
  const supplier = supplierQuery.data;
  const contacts = contactsQuery.data ?? supplier?.contacts ?? [];

  return (
    <Drawer opened={props.opened} onClose={props.onClose} title="Supplier detail" position="right" size="xl" withinPortal={false}>
      <Stack gap="md">
        {supplierQuery.error ? <Alert color="red">{formatSupplierApiError(supplierQuery.error)}</Alert> : null}
        {supplierQuery.isLoading ? <Text c="dimmed">Loading supplier…</Text> : null}
        {supplier ? (
          <>
            <Card withBorder radius="md" p="md">
              <Stack gap="md">
                <Group justify="space-between">
                  <div>
                    <Title order={3}>{supplier.name}</Title>
                    <Text c="dimmed">{supplier.code}</Text>
                  </div>
                  <Badge color={supplier.is_active ? "green" : "gray"}>{statusLabel(supplier.is_active)}</Badge>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <DetailField label="Email" value={supplier.email} />
                  <DetailField label="Phone" value={supplier.phone} />
                  <DetailField label="Currency" value={supplier.currency} />
                  <DetailField label="Credit Limit" value={supplier.credit_limit} />
                  <DetailField label="Payment Terms" value={supplier.payment_terms_days == null ? null : `${supplier.payment_terms_days} days`} />
                  <DetailField label="City" value={supplier.city} />
                  <DetailField label="Country" value={supplier.country} />
                  <DetailField label="Updated At" value={supplier.updated_at} />
                </SimpleGrid>
                <DetailField label="Address" value={[supplier.address_line1, supplier.address_line2, supplier.postal_code].filter(Boolean).join(", ")} />
                <DetailField label="Notes" value={supplier.notes} />
              </Stack>
            </Card>
            <SupplierContactsPanel
              contacts={contacts}
              loading={contactsQuery.isLoading}
              error={contactsQuery.error}
              canCreate={props.permissions.CREATE}
              canUpdate={props.permissions.UPDATE}
              canDelete={props.permissions.DELETE}
              onCreate={props.onCreateContact}
              onEdit={props.onEditContact}
              onDelete={props.onDeleteContact}
            />
          </>
        ) : null}
      </Stack>
    </Drawer>
  );
}

export function PurchasingSuppliersPage({ user }: PurchasingSuppliersPageProps) {
  const isMobile = useMediaQuery("(max-width: 48em)");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch] = useDebouncedValue(searchInput, 300);
  const [status, setStatus] = useState<SupplierStatusFilter>("active");
  const [pagination, setPagination] = useState<PaginationState>({ page: 1, pageSize: SUPPLIERS_DEFAULT_LIMIT });
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [supplierModalMode, setSupplierModalMode] = useState<SupplierModalMode>("create");
  const [supplierModalOpen, { open: openSupplierModal, close: closeSupplierModal }] = useDisclosure(false);
  const [detailOpen, { open: openDetail, close: closeDetail }] = useDisclosure(false);
  const [confirmDeactivateOpen, { open: openConfirmDeactivate, close: closeConfirmDeactivate }] = useDisclosure(false);
  const [contactModalMode, setContactModalMode] = useState<ContactModalMode>("create");
  const [contactModalOpen, { open: openContactModal, close: closeContactModal }] = useDisclosure(false);
  const [confirmContactDeleteOpen, { open: openConfirmContactDelete, close: closeConfirmContactDelete }] = useDisclosure(false);
  const [supplierForm, setSupplierForm] = useState<SupplierFormData>(defaultSupplierFormData);
  const [supplierErrors, setSupplierErrors] = useState<FormErrors>({});
  const [contactForm, setContactForm] = useState<ContactFormData>(defaultContactFormData);
  const [contactErrors, setContactErrors] = useState<FormErrors>({});
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [deactivatingSupplier, setDeactivatingSupplier] = useState<Supplier | null>(null);
  const [editingContact, setEditingContact] = useState<SupplierContact | null>(null);
  const [deletingContact, setDeletingContact] = useState<SupplierContact | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const permissions = useMemo(() => {
    const effective = resolveEffectivePermissions(user) ?? [];
    return actionGates(effective, "purchasing", "suppliers", ["READ", "CREATE", "UPDATE", "DELETE"]);
  }, [user]);

  const listParams = useMemo(() => ({
    search: debouncedSearch,
    status,
    limit: pagination.pageSize,
    offset: pageToSupplierOffset(pagination.page, pagination.pageSize),
  }), [debouncedSearch, pagination.page, pagination.pageSize, status]);

  const suppliersQuery = useSuppliersQuery(listParams, { enabled: permissions.READ });
  const createSupplierMutation = useCreateSupplierMutation();
  const updateSupplierMutation = useUpdateSupplierMutation();
  const deactivateSupplierMutation = useDeactivateSupplierMutation();
  const createContactMutation = useCreateSupplierContactMutation();
  const updateContactMutation = useUpdateSupplierContactMutation();
  const deleteContactMutation = useDeleteSupplierContactMutation();
  const suppliers = suppliersQuery.data?.suppliers ?? [];
  const total = suppliersQuery.data?.total ?? 0;

  const resetSupplierForm = useCallback(() => {
    setSupplierForm(defaultSupplierFormData);
    setSupplierErrors({});
    setEditingSupplier(null);
  }, []);

  const openCreateSupplier = () => {
    setSupplierModalMode("create");
    setSupplierForm(defaultSupplierFormData);
    setSupplierErrors({});
    setActionError(null);
    openSupplierModal();
  };

  const openEditSupplier = (supplier: Supplier) => {
    setSupplierModalMode("edit");
    setEditingSupplier(supplier);
    setSupplierForm(supplierToFormData(supplier));
    setSupplierErrors({});
    setActionError(null);
    openSupplierModal();
  };

  const openSupplierDetail = (supplier: Supplier) => {
    setSelectedSupplierId(supplier.id);
    openDetail();
  };

  const openDeactivate = (supplier: Supplier) => {
    setDeactivatingSupplier(supplier);
    setActionError(null);
    openConfirmDeactivate();
  };

  const handleSupplierSubmit = async (): Promise<boolean> => {
    const errors = validateSupplierForm(supplierForm, supplierModalMode);
    setSupplierErrors(errors);
    if (Object.keys(errors).length > 0) return false;
    setActionError(null);
    try {
      if (supplierModalMode === "create") {
        await createSupplierMutation.mutateAsync(supplierFormToCreateInput(supplierForm, user.company_id));
      } else if (editingSupplier) {
        await updateSupplierMutation.mutateAsync({ supplierId: editingSupplier.id, patch: supplierFormToUpdateInput(supplierForm) });
      }
      closeSupplierModal();
      resetSupplierForm();
      return true;
    } catch (error) {
      setActionError(formatSupplierApiError(error));
      return false;
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingSupplier) return;
    setActionError(null);
    try {
      await deactivateSupplierMutation.mutateAsync(deactivatingSupplier.id);
      closeConfirmDeactivate();
      setDeactivatingSupplier(null);
    } catch (error) {
      setActionError(formatSupplierApiError(error));
    }
  };

  const handleReactivate = async (supplier: Supplier) => {
    setActionError(null);
    try {
      await updateSupplierMutation.mutateAsync({ supplierId: supplier.id, patch: { is_active: true } });
    } catch (error) {
      setActionError(formatSupplierApiError(error));
    }
  };

  const openCreateContact = () => {
    setContactModalMode("create");
    setEditingContact(null);
    setContactForm(defaultContactFormData);
    setContactErrors({});
    setActionError(null);
    openContactModal();
  };

  const openEditContact = (contact: SupplierContact) => {
    setContactModalMode("edit");
    setEditingContact(contact);
    setContactForm(contactToFormData(contact));
    setContactErrors({});
    setActionError(null);
    openContactModal();
  };

  const openDeleteContact = (contact: SupplierContact) => {
    setDeletingContact(contact);
    setActionError(null);
    openConfirmContactDelete();
  };

  const handleContactSubmit = async () => {
    if (selectedSupplierId == null) return;
    const errors = validateContactForm(contactForm);
    setContactErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setActionError(null);
    try {
      if (contactModalMode === "create") {
        await createContactMutation.mutateAsync({ supplierId: selectedSupplierId, payload: contactFormToInput(contactForm) });
      } else if (editingContact) {
        await updateContactMutation.mutateAsync({ supplierId: selectedSupplierId, contactId: editingContact.id, patch: contactFormToInput(contactForm) });
      }
      closeContactModal();
      setContactForm(defaultContactFormData);
      setEditingContact(null);
    } catch (error) {
      setActionError(formatSupplierApiError(error));
    }
  };

  const handleContactDelete = async () => {
    if (selectedSupplierId == null || !deletingContact) return;
    setActionError(null);
    try {
      await deleteContactMutation.mutateAsync({ supplierId: selectedSupplierId, contactId: deletingContact.id });
      closeConfirmContactDelete();
      setDeletingContact(null);
    } catch (error) {
      setActionError(formatSupplierApiError(error));
    }
  };

  const stopRowAction = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const columns: DataTableColumnDef<Supplier>[] = [
    { id: "code", accessorKey: "code", header: "Code", cell: ({ row }) => row.original.code },
    { id: "name", accessorKey: "name", header: "Name", cell: ({ row }) => row.original.name },
    { id: "currency", accessorKey: "currency", header: "Currency", cell: ({ row }) => row.original.currency },
    { id: "credit_limit", accessorKey: "credit_limit", header: "Credit Limit", cell: ({ row }) => row.original.credit_limit },
    { id: "terms", header: "Terms", cell: ({ row }) => row.original.payment_terms_days == null ? "—" : `${row.original.payment_terms_days} days` },
    { id: "status", header: "Status", cell: ({ row }) => <Badge color={row.original.is_active ? "green" : "gray"}>{statusLabel(row.original.is_active)}</Badge> },
    {
      id: "actions",
      header: "Actions",
      isRowAction: true,
      cell: ({ row }) => (
        <Group gap="xs" wrap="nowrap" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <Button size="xs" variant="subtle" leftSection={<IconEye size={14} />} onClick={(event) => { stopRowAction(event); openSupplierDetail(row.original); }}>View</Button>
          {permissions.UPDATE ? <Button size="xs" variant="subtle" leftSection={<IconPencil size={14} />} onClick={(event) => { stopRowAction(event); openEditSupplier(row.original); }}>Edit</Button> : null}
          {permissions.DELETE && row.original.is_active ? <Button size="xs" variant="subtle" color="red" leftSection={<IconTrash size={14} />} onClick={(event) => { stopRowAction(event); openDeactivate(row.original); }}>Deactivate</Button> : null}
          {permissions.UPDATE && !row.original.is_active ? <Button size="xs" variant="subtle" leftSection={<IconRefresh size={14} />} onClick={(event) => { stopRowAction(event); void handleReactivate(row.original); }}>Reactivate</Button> : null}
        </Group>
      ),
    },
  ];

  if (!permissions.READ) {
    return (
      <Stack gap="md" p="md">
        <Title order={2}>Suppliers</Title>
        <Alert color="red" icon={<IconAlertCircle size={16} />}>Access denied: purchasing.suppliers.READ is required.</Alert>
      </Stack>
    );
  }

  return (
    <Stack gap="md" p="md">
      {actionError ? <Alert color="red" icon={<IconAlertCircle size={16} />} onClose={() => setActionError(null)} withCloseButton>{actionError}</Alert> : null}
      <Group justify="space-between" align="center">
        <div>
          <Title order={2}>Suppliers</Title>
          <Text size="sm" c="dimmed">Manage purchasing suppliers and supplier contacts.</Text>
        </div>
        {permissions.CREATE ? <Button leftSection={<IconPlus size={16} />} onClick={openCreateSupplier}>New supplier</Button> : null}
      </Group>

      <Card withBorder radius="md" p="md">
        <Group align="flex-end">
          <TextInput
            label="Search suppliers"
            placeholder="Code, name, email, phone"
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.currentTarget.value);
              setPagination((current) => ({ ...current, page: 1 }));
            }}
            style={{ minWidth: isMobile ? "100%" : 280 }}
          />
          <Select
            label="Status"
            value={status}
            data={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
            allowDeselect={false}
            onChange={(value) => {
              setStatus(value === "inactive" ? "inactive" : "active");
              setPagination((current) => ({ ...current, page: 1 }));
            }}
          />
        </Group>
      </Card>

      <EntityTable
        entityName="Suppliers"
        columns={columns}
        data={suppliers}
        getRowId={(supplier) => String(supplier.id)}
        loading={suppliersQuery.isLoading ? "loading" : suppliersQuery.isFetching ? "refreshing" : "idle"}
        error={suppliersQuery.error ? { message: formatSupplierApiError(suppliersQuery.error), retryable: true, onRetry: () => void suppliersQuery.refetch() } : null}
        totalCount={total}
        pagination={pagination}
        onPaginationChange={setPagination}
        onRowClick={openSupplierDetail}
        rowAriaLabel={(supplier) => `Open ${supplier.name}`}
        emptyState="No suppliers found for this supported status filter."
        data-testid="purchasing-suppliers-table"
        columnVisibility={{
          storageKey: "purchasing.suppliers.columns.v1",
          version: 1,
          defaultVisibleColumnIds: ["code", "name", "currency", "credit_limit", "terms", "status"],
          essentialColumnIds: ["code", "name", "status"],
        }}
      />

      <SupplierDetailDrawer
        opened={detailOpen}
        supplierId={selectedSupplierId}
        permissions={permissions}
        onClose={closeDetail}
        onCreateContact={openCreateContact}
        onEditContact={openEditContact}
        onDeleteContact={openDeleteContact}
      />

      <Modal opened={supplierModalOpen} onClose={closeSupplierModal} size="xl" title={supplierModalMode === "create" ? "New supplier" : "Edit supplier"} withinPortal={false}>
        <SupplierReviewForm
          companyId={user.company_id}
          userId={user.id}
          mode={supplierModalMode}
          supplier={editingSupplier}
          data={supplierForm}
          errors={supplierErrors}
          submitting={createSupplierMutation.isPending || updateSupplierMutation.isPending}
          onChange={(patch) => setSupplierForm((current) => ({ ...current, ...patch }))}
          onRestore={setSupplierForm}
          onDiscard={() => {
            resetSupplierForm();
            closeSupplierModal();
          }}
          onSubmit={handleSupplierSubmit}
        />
      </Modal>

      <Modal opened={confirmDeactivateOpen} onClose={closeConfirmDeactivate} title="Deactivate supplier" withinPortal={false}>
        <Stack gap="md">
          <Text>Deactivate {deactivatingSupplier?.name}? This sends only the DELETE request supported by the backend. No reason is stored.</Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={closeConfirmDeactivate}>Cancel</Button>
            <Button color="red" loading={deactivateSupplierMutation.isPending} onClick={() => void handleDeactivate()}>Deactivate</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={contactModalOpen} onClose={closeContactModal} title={contactModalMode === "create" ? "Add supplier contact" : "Edit supplier contact"} withinPortal={false}>
        <Stack gap="md">
          <ContactFields data={contactForm} errors={contactErrors} onChange={(patch) => setContactForm((current) => ({ ...current, ...patch }))} />
          <Group justify="flex-end">
            <Button variant="light" onClick={closeContactModal}>Cancel</Button>
            <Button loading={createContactMutation.isPending || updateContactMutation.isPending} onClick={() => void handleContactSubmit()}>
              {contactModalMode === "create" ? "Create contact" : "Save contact"}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={confirmContactDeleteOpen} onClose={closeConfirmContactDelete} title="Delete supplier contact" withinPortal={false}>
        <Stack gap="md">
          <Text>Delete contact {deletingContact?.name}? This removes only the selected supplier contact.</Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={closeConfirmContactDelete}>Cancel</Button>
            <Button color="red" loading={deleteContactMutation.isPending} onClick={() => void handleContactDelete()}>Delete contact</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
