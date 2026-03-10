// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useState } from "react";
import {
  Paper,
  Title,
  Stack,
  Group,
  Table,
  Badge,
  Button,
  TextInput,
  Select,
  NumberInput,
  Alert,
  ActionIcon,
  Menu,
  Text,
  Grid,
  Box,
  Flex,
  Divider,
  Loader
} from "@mantine/core";
import {
  IconPlus,
  IconTrash,
  IconPrinter,
  IconFileTypePdf,
  IconCheck,
  IconX,
  IconEdit,
  IconDotsVertical,
  IconAlertCircle,
  IconFileInvoice
} from "@tabler/icons-react";
import { apiRequest, ApiError, getApiBaseUrl } from "../lib/api-client";
import type { SessionUser } from "../lib/session";
import { useOnlineStatus } from "../lib/connection";
import { OutboxService } from "../lib/outbox-service";

type InvoiceStatus = "DRAFT" | "APPROVED" | "POSTED" | "VOID";
type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

type Invoice = {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  status: InvoiceStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  paid_total: number;
  approved_by_user_id: number | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

type InvoiceLine = {
  id: number;
  invoice_id: number;
  line_no: number;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
};

type InvoiceDetail = Invoice & { lines: InvoiceLine[]; due_term?: string };

type InvoicesResponse = { success: true; data: { total: number; invoices: Invoice[] } };
type InvoiceDetailResponse = { success: true; data: InvoiceDetail };

const DUE_TERM_OPTIONS = [
  { value: "NET_0", label: "Due on receipt" },
  { value: "NET_7", label: "Net 7 days" },
  { value: "NET_14", label: "Net 14 days" },
  { value: "NET_15", label: "Net 15 days" },
  { value: "NET_20", label: "Net 20 days" },
  { value: "NET_30", label: "Net 30 days" },
  { value: "NET_45", label: "Net 45 days" },
  { value: "NET_60", label: "Net 60 days" },
  { value: "NET_90", label: "Net 90 days" }
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("id-ID");
}

function getStatusBadgeColor(status: InvoiceStatus): string {
  switch (status) {
    case "POSTED":
      return "green";
    case "DRAFT":
      return "yellow";
    case "APPROVED":
      return "blue";
    case "VOID":
      return "gray";
    default:
      return "gray";
  }
}

function getDaysOverdue(dueDate: string | null, invoiceDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate ?? invoiceDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function isOverdue(dueDate: string | null, invoiceDate: string, status: InvoiceStatus): boolean {
  if (status === "VOID" || status === "POSTED") return false;
  return getDaysOverdue(dueDate, invoiceDate) > 0;
}

function getPaymentStatusBadgeColor(status: PaymentStatus): string {
  switch (status) {
    case "PAID":
      return "blue";
    case "PARTIAL":
      return "yellow";
    case "UNPAID":
      return "red";
    default:
      return "gray";
  }
}

function getTermDays(term: string): number {
  const daysMap: Record<string, number> = {
    NET_0: 0,
    NET_7: 7,
    NET_14: 14,
    NET_15: 15,
    NET_20: 20,
    NET_30: 30,
    NET_45: 45,
    NET_60: 60,
    NET_90: 90
  };
  return daysMap[term] ?? 30;
}

type SalesInvoicesPageProps = {
  user: SessionUser;
  accessToken: string;
};

type InvoiceLineDraft = {
  description: string;
  qty: string;
  unit_price: string;
};

type InvoiceDraft = {
  invoice_no: string;
  invoice_date: string;
  due_date: string;
  due_term: string;
  tax_amount: string;
  lines: InvoiceLineDraft[];
};

type InvoiceEditDraft = InvoiceDraft & {
  id: number;
};

const emptyLineDraft: InvoiceLineDraft = {
  description: "",
  qty: "1",
  unit_price: "0"
};

export function SalesInvoicesPage(props: SalesInvoicesPageProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedOutletId, setSelectedOutletId] = useState<number>(
    props.user.outlets[0]?.id ?? 0
  );

  function getDefaultDueDate(date: string): string {
    const d = new Date(date);
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  }

  const [newInvoice, setNewInvoice] = useState<InvoiceDraft>(() => ({
    invoice_no: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    due_date: getDefaultDueDate(new Date().toISOString().slice(0, 10)),
    due_term: "NET_30",
    tax_amount: "0",
    lines: [{ ...emptyLineDraft }]
  }));
  const [editingInvoice, setEditingInvoice] = useState<InvoiceEditDraft | null>(null);
  const isOnline = useOnlineStatus();

  async function refreshData(outletId: number) {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<InvoicesResponse>(
        `/sales/invoices?outlet_id=${outletId}&limit=100`,
        {},
        props.accessToken
      );
      setInvoices(response.data.invoices);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load invoices");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedOutletId > 0) {
      refreshData(selectedOutletId).catch(console.error);
    }
  }, [selectedOutletId]);

  function handleOutletChange(value: string | null) {
    if (value) {
      setSelectedOutletId(Number(value));
    }
  }

  function resetNewInvoice() {
    const invoiceDate = new Date().toISOString().slice(0, 10);
    setNewInvoice({
      invoice_no: "",
      invoice_date: invoiceDate,
      due_date: getDefaultDueDate(invoiceDate),
      due_term: "NET_30",
      tax_amount: "0",
      lines: [{ ...emptyLineDraft }]
    });
  }

  function buildLinePayload(line: InvoiceLineDraft) {
    return {
      description: line.description.trim(),
      qty: Number(line.qty),
      unit_price: Number(line.unit_price)
    };
  }

  async function createInvoice() {
    if (!newInvoice.invoice_no.trim()) {
      setError("Invoice number is required");
      return;
    }

    if (!newInvoice.invoice_date.trim()) {
      setError("Invoice date is required");
      return;
    }

    const lines = newInvoice.lines.map(buildLinePayload);
    if (lines.length === 0 || lines.some((line) => !line.description || line.qty <= 0)) {
      setError("Invoice lines must include description and qty");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        outlet_id: selectedOutletId,
        invoice_no: newInvoice.invoice_no.trim(),
        invoice_date: newInvoice.invoice_date,
        due_date: newInvoice.due_date || newInvoice.invoice_date,
        due_term: newInvoice.due_term,
        tax_amount: Number(newInvoice.tax_amount || "0"),
        lines
      };

      if (isOnline) {
        await apiRequest(
          "/sales/invoices",
          {
            method: "POST",
            body: JSON.stringify(payload)
          },
          props.accessToken
        );
        resetNewInvoice();
        await refreshData(selectedOutletId);
      } else {
        await OutboxService.queueTransaction("invoice", payload, props.user.id);
        resetNewInvoice();
        setError("Invoice queued for sync (offline)");
      }
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      } else {
        setError("Failed to create invoice");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function loadInvoiceForEdit(invoiceId: number) {
    setSubmitting(true);
    setError(null);
    try {
      const response = await apiRequest<InvoiceDetailResponse>(
        `/sales/invoices/${invoiceId}`,
        {},
        props.accessToken
      );
      setEditingInvoice({
        id: response.data.id,
        invoice_no: response.data.invoice_no,
        invoice_date: response.data.invoice_date,
        due_date: response.data.due_date ?? response.data.invoice_date,
        due_term: response.data.due_term ?? "NET_30",
        tax_amount: String(response.data.tax_amount ?? 0),
        lines: response.data.lines.map((line) => ({
          description: line.description,
          qty: String(line.qty),
          unit_price: String(line.unit_price)
        }))
      });
    } catch (loadError) {
      if (loadError instanceof ApiError) {
        setError(loadError.message);
      } else {
        setError("Failed to load invoice detail");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function saveInvoiceEdit() {
    if (!editingInvoice) {
      return;
    }

    if (!editingInvoice.invoice_no.trim()) {
      setError("Invoice number is required");
      return;
    }

    if (!editingInvoice.invoice_date.trim()) {
      setError("Invoice date is required");
      return;
    }

    const lines = editingInvoice.lines.map(buildLinePayload);
    if (lines.length === 0 || lines.some((line) => !line.description || line.qty <= 0)) {
      setError("Invoice lines must include description and qty");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(
        `/sales/invoices/${editingInvoice.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            invoice_no: editingInvoice.invoice_no.trim(),
            invoice_date: editingInvoice.invoice_date,
            due_date: editingInvoice.due_date || editingInvoice.invoice_date,
            due_term: editingInvoice.due_term,
            tax_amount: Number(editingInvoice.tax_amount || "0"),
            lines
          })
        },
        props.accessToken
      );
      setEditingInvoice(null);
      await refreshData(selectedOutletId);
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      } else {
        setError("Failed to update invoice");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function postInvoiceById(invoiceId: number) {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/sales/invoices/${invoiceId}/post`, { method: "POST" }, props.accessToken);
      await refreshData(selectedOutletId);
    } catch (postError) {
      if (postError instanceof ApiError) {
        setError(postError.message);
      } else {
        setError("Failed to post invoice");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function approveInvoiceById(invoiceId: number) {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/sales/invoices/${invoiceId}/approve`, { method: "POST" }, props.accessToken);
      await refreshData(selectedOutletId);
    } catch (approveError) {
      if (approveError instanceof ApiError) {
        setError(approveError.message);
      } else {
        setError("Failed to approve invoice");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function voidInvoiceById(invoiceId: number) {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/sales/invoices/${invoiceId}/void`, { method: "POST" }, props.accessToken);
      await refreshData(selectedOutletId);
    } catch (voidError) {
      if (voidError instanceof ApiError) {
        setError(voidError.message);
      } else {
        setError("Failed to void invoice");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleViewPrint(invoiceId: number) {
    setError(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/sales/invoices/${invoiceId}/print`, {
        headers: {
          Authorization: `Bearer ${props.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error("Failed to load invoice print view");
      }

      const html = await response.text();
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        throw new Error("Popup blocked");
      }
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
    } catch (viewError) {
      setError(viewError instanceof Error ? viewError.message : "Failed to open print view");
    }
  }

  async function handleViewPdf(invoiceId: number) {
    setError(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/sales/invoices/${invoiceId}/pdf`, {
        headers: {
          Authorization: `Bearer ${props.accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error("Failed to load invoice PDF");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (viewError) {
      setError(viewError instanceof Error ? viewError.message : "Failed to open invoice PDF");
    }
  }

  const outletOptions = props.user.outlets.map((outlet) => ({
    value: String(outlet.id),
    label: outlet.name
  }));

  const renderInvoiceForm = (
    invoice: InvoiceDraft,
    setInvoice: React.Dispatch<React.SetStateAction<InvoiceDraft>>,
    onSubmit: () => void,
    onCancel?: () => void,
    isEdit = false
  ) => (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Title order={4}>{isEdit ? `Edit Draft Invoice #${(invoice as InvoiceEditDraft).id}` : "Create New Invoice"}</Title>
          {isEdit && (
            <Button variant="subtle" color="gray" onClick={onCancel} size="sm">
              Cancel
            </Button>
          )}
        </Group>

        <Divider />

        <Grid>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <TextInput
              label="Invoice Number"
              placeholder="INV-001"
              value={invoice.invoice_no}
              onChange={(e) =>
                setInvoice((prev) => ({ ...prev, invoice_no: e.target.value }))
              }
              required
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <TextInput
              label="Invoice Date"
              type="date"
              value={invoice.invoice_date}
              onChange={(e) => {
                const newDate = e.target.value;
                const dueDate = new Date(newDate);
                dueDate.setDate(dueDate.getDate() + getTermDays(invoice.due_term));
                setInvoice((prev) => ({
                  ...prev,
                  invoice_date: newDate,
                  due_date: dueDate.toISOString().slice(0, 10)
                }));
              }}
              required
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <Select
              label="Payment Terms"
              data={DUE_TERM_OPTIONS}
              value={invoice.due_term}
              onChange={(value) => {
                if (value) {
                  const dueDate = new Date(invoice.invoice_date);
                  dueDate.setDate(dueDate.getDate() + getTermDays(value));
                  setInvoice((prev) => ({
                    ...prev,
                    due_term: value,
                    due_date: dueDate.toISOString().slice(0, 10)
                  }));
                }
              }}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
            <TextInput
              label="Due Date"
              type="date"
              value={invoice.due_date}
              onChange={(e) =>
                setInvoice((prev) => ({ ...prev, due_date: e.target.value }))
              }
            />
          </Grid.Col>
        </Grid>

        <NumberInput
          label="Tax Amount"
          placeholder="0"
          value={Number(invoice.tax_amount) || 0}
          onChange={(value) =>
            setInvoice((prev) => ({ ...prev, tax_amount: String(value ?? 0) }))
          }
          min={0}
          prefix="Rp "
          thousandSeparator="."
          decimalSeparator=","
          hideControls
        />

        <Divider label="Line Items" labelPosition="left" />

        <Stack gap="xs">
          {invoice.lines.map((line, index) => (
            <Group key={`line-${index}`} gap="xs" align="flex-start">
              <TextInput
                placeholder="Description"
                value={line.description}
                onChange={(e) =>
                  setInvoice((prev) => ({
                    ...prev,
                    lines: prev.lines.map((entry, lineIndex) =>
                      lineIndex === index ? { ...entry, description: e.target.value } : entry
                    )
                  }))
                }
                style={{ flex: 2 }}
              />
              <TextInput
                placeholder="Qty"
                type="number"
                value={line.qty}
                onChange={(e) =>
                  setInvoice((prev) => ({
                    ...prev,
                    lines: prev.lines.map((entry, lineIndex) =>
                      lineIndex === index ? { ...entry, qty: e.target.value } : entry
                    )
                  }))
                }
                style={{ flex: 1 }}
              />
              <TextInput
                placeholder="Unit Price"
                type="number"
                value={line.unit_price}
                onChange={(e) =>
                  setInvoice((prev) => ({
                    ...prev,
                    lines: prev.lines.map((entry, lineIndex) =>
                      lineIndex === index ? { ...entry, unit_price: e.target.value } : entry
                    )
                  }))
                }
                style={{ flex: 1 }}
              />
              {invoice.lines.length > 1 && (
                <ActionIcon
                  color="red"
                  variant="light"
                  onClick={() =>
                    setInvoice((prev) => ({
                      ...prev,
                      lines: prev.lines.filter((_, lineIndex) => lineIndex !== index)
                    }))
                  }
                >
                  <IconTrash size={16} />
                </ActionIcon>
              )}
            </Group>
          ))}
        </Stack>

        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          onClick={() =>
            setInvoice((prev) => ({
              ...prev,
              lines: [...prev.lines, { ...emptyLineDraft }]
            }))
          }
          size="sm"
          style={{ alignSelf: "flex-start" }}
        >
          Add Line
        </Button>

        <Group justify="flex-end" gap="sm">
          {isEdit && (
            <Button variant="default" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button
            onClick={onSubmit}
            loading={submitting}
            leftSection={isEdit ? <IconCheck size={16} /> : <IconPlus size={16} />}
          >
            {isEdit ? "Save Changes" : "Create Invoice"}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );

  return (
    <Stack gap="lg" p="md">
      <Group justify="space-between" align="center">
        <Title order={2}>
          <Group gap="xs">
            <IconFileInvoice size={32} />
            Sales Invoices
          </Group>
        </Title>
      </Group>

      {!isOnline && (
        <Alert color="yellow" icon={<IconAlertCircle size={16} />}>
          You are offline. Invoices will be queued for sync when connection is restored.
        </Alert>
      )}

      {error && (
        <Alert color="red" icon={<IconAlertCircle size={16} />} onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      {!editingInvoice && renderInvoiceForm(newInvoice, setNewInvoice, createInvoice)}

      {editingInvoice && renderInvoiceForm(
        editingInvoice,
        setEditingInvoice as React.Dispatch<React.SetStateAction<InvoiceDraft>>,
        saveInvoiceEdit,
        () => setEditingInvoice(null),
        true
      )}

      <Paper p="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Select
              label="Outlet"
              data={outletOptions}
              value={String(selectedOutletId)}
              onChange={handleOutletChange}
              style={{ minWidth: 200 }}
            />
            <Text size="sm" c="dimmed">
              {invoices.length} invoice{invoices.length !== 1 ? "s" : ""}
            </Text>
          </Group>

          {loading ? (
            <Flex justify="center" p="xl">
              <Loader />
            </Flex>
          ) : invoices.length === 0 ? (
            <Alert color="blue" variant="light">
              No invoices found for this outlet.
            </Alert>
          ) : (
            <Box style={{ overflowX: "auto" }}>
              <Table striped highlightOnHover withTableBorder>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Invoice No</Table.Th>
                    <Table.Th>Date</Table.Th>
                    <Table.Th style={{ textAlign: "center" }}>Status</Table.Th>
                    <Table.Th style={{ textAlign: "center" }}>Payment</Table.Th>
                    <Table.Th>Due Date</Table.Th>
                    <Table.Th style={{ textAlign: "center" }}>Overdue</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Grand Total</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Paid</Table.Th>
                    <Table.Th style={{ textAlign: "right" }}>Outstanding</Table.Th>
                    <Table.Th style={{ textAlign: "center" }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {invoices.map((invoice) => (
                    <Table.Tr key={invoice.id}>
                      <Table.Td>{invoice.invoice_no}</Table.Td>
                      <Table.Td>{formatDate(invoice.invoice_date)}</Table.Td>
                      <Table.Td style={{ textAlign: "center" }}>
                        <Badge color={getStatusBadgeColor(invoice.status)} size="sm">
                          {invoice.status}
                        </Badge>
                      </Table.Td>
                      <Table.Td style={{ textAlign: "center" }}>
                        <Badge color={getPaymentStatusBadgeColor(invoice.payment_status)} size="sm">
                          {invoice.payment_status}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {invoice.due_date ? formatDate(invoice.due_date) : "—"}
                      </Table.Td>
                      <Table.Td style={{ textAlign: "center" }}>
                        {isOverdue(invoice.due_date, invoice.invoice_date, invoice.status) ? (
                          <Badge color="red" size="sm">
                            {getDaysOverdue(invoice.due_date, invoice.invoice_date)}d
                          </Badge>
                        ) : invoice.due_date ? (
                          <Badge color="green" size="sm">
                            Current
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>
                        <Text fw={500}>{formatCurrency(invoice.grand_total)}</Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>
                        {formatCurrency(invoice.paid_total)}
                      </Table.Td>
                      <Table.Td style={{ textAlign: "right" }}>
                        <Text c={invoice.grand_total - invoice.paid_total > 0 ? "red" : "green"}>
                          {formatCurrency(invoice.grand_total - invoice.paid_total)}
                        </Text>
                      </Table.Td>
                      <Table.Td style={{ textAlign: "center" }}>
                        <Menu position="bottom-end" withArrow>
                          <Menu.Target>
                            <ActionIcon variant="subtle">
                              <IconDotsVertical size={16} />
                            </ActionIcon>
                          </Menu.Target>
                          <Menu.Dropdown>
                            {invoice.status === "DRAFT" && (
                              <Menu.Item
                                leftSection={<IconEdit size={14} />}
                                onClick={() => loadInvoiceForEdit(invoice.id)}
                              >
                                Edit
                              </Menu.Item>
                            )}
                            {(invoice.status === "DRAFT" || invoice.status === "APPROVED") && (
                              <Menu.Item
                                leftSection={<IconCheck size={14} />}
                                onClick={() => postInvoiceById(invoice.id)}
                              >
                                Post
                              </Menu.Item>
                            )}
                            {invoice.status === "DRAFT" && (
                              <Menu.Item
                                leftSection={<IconCheck size={14} />}
                                onClick={() => approveInvoiceById(invoice.id)}
                              >
                                Approve
                              </Menu.Item>
                            )}
                            {invoice.status !== "VOID" && (
                              <Menu.Item
                                leftSection={<IconX size={14} />}
                                color="red"
                                onClick={() => voidInvoiceById(invoice.id)}
                              >
                                Void
                              </Menu.Item>
                            )}
                            <Menu.Divider />
                            <Menu.Item
                              leftSection={<IconPrinter size={14} />}
                              onClick={() => handleViewPrint(invoice.id)}
                            >
                              Print
                            </Menu.Item>
                            <Menu.Item
                              leftSection={<IconFileTypePdf size={14} />}
                              onClick={() => handleViewPdf(invoice.id)}
                            >
                              Download PDF
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
