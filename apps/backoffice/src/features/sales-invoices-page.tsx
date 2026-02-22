import { useEffect, useState } from "react";
import { apiRequest, ApiError, getApiBaseUrl } from "../lib/api-client";
import type { SessionUser } from "../lib/session";

type InvoiceStatus = "DRAFT" | "POSTED" | "VOID";
type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

type Invoice = {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_no: string;
  invoice_date: string;
  status: InvoiceStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  tax_amount: number;
  grand_total: number;
  paid_total: number;
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

type InvoiceDetail = Invoice & { lines: InvoiceLine[] };

type InvoicesResponse = { ok: true; total: number; invoices: Invoice[] };
type InvoiceDetailResponse = { ok: true; invoice: InvoiceDetail };

const boxStyle = {
  border: "1px solid #e2ddd2",
  borderRadius: "10px",
  padding: "16px",
  backgroundColor: "#fcfbf8",
  marginBottom: "14px"
} as const;

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const
};

const cellStyle = {
  borderBottom: "1px solid #ece7dc",
  padding: "8px"
} as const;

const inputStyle = {
  border: "1px solid #cabfae",
  borderRadius: "6px",
  padding: "6px 8px"
} as const;

const linkStyle = {
  color: "#2563eb",
  textDecoration: "none",
  cursor: "pointer"
} as const;

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
      return "#4caf50";
    case "DRAFT":
      return "#ff9800";
    case "VOID":
      return "#9e9e9e";
    default:
      return "#666";
  }
}

function getPaymentStatusBadgeColor(status: PaymentStatus): string {
  switch (status) {
    case "PAID":
      return "#2196f3";
    case "PARTIAL":
      return "#ff9800";
    case "UNPAID":
      return "#f44336";
    default:
      return "#666";
  }
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
  const [newInvoice, setNewInvoice] = useState<InvoiceDraft>(() => ({
    invoice_no: "",
    invoice_date: new Date().toISOString().slice(0, 10),
    tax_amount: "0",
    lines: [{ ...emptyLineDraft }]
  }));
  const [editingInvoice, setEditingInvoice] = useState<InvoiceEditDraft | null>(null);

  async function refreshData(outletId: number) {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<InvoicesResponse>(
        `/sales/invoices?outlet_id=${outletId}&limit=100`,
        {},
        props.accessToken
      );
      setInvoices(response.invoices);
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

  function handleOutletChange(event: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedOutletId(Number(event.target.value));
  }

  function resetNewInvoice() {
    setNewInvoice({
      invoice_no: "",
      invoice_date: new Date().toISOString().slice(0, 10),
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
      await apiRequest(
        "/sales/invoices",
        {
          method: "POST",
          body: JSON.stringify({
            outlet_id: selectedOutletId,
            invoice_no: newInvoice.invoice_no.trim(),
            invoice_date: newInvoice.invoice_date,
            tax_amount: Number(newInvoice.tax_amount || "0"),
            lines
          })
        },
        props.accessToken
      );
      resetNewInvoice();
      await refreshData(selectedOutletId);
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
        id: response.invoice.id,
        invoice_no: response.invoice.invoice_no,
        invoice_date: response.invoice.invoice_date,
        tax_amount: String(response.invoice.tax_amount ?? 0),
        lines: response.invoice.lines.map((line) => ({
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

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: "16px" }}>Sales Invoices</h2>

      <div style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Create Invoice</h3>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
          <input
            placeholder="Invoice No"
            value={newInvoice.invoice_no}
            onChange={(event) =>
              setNewInvoice((prev) => ({
                ...prev,
                invoice_no: event.target.value
              }))
            }
            style={inputStyle}
          />
          <input
            type="date"
            value={newInvoice.invoice_date}
            onChange={(event) =>
              setNewInvoice((prev) => ({
                ...prev,
                invoice_date: event.target.value
              }))
            }
            style={inputStyle}
          />
          <input
            placeholder="Tax amount"
            value={newInvoice.tax_amount}
            onChange={(event) =>
              setNewInvoice((prev) => ({
                ...prev,
                tax_amount: event.target.value
              }))
            }
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: "12px" }}>
          <strong>Lines</strong>
          {newInvoice.lines.map((line, index) => (
            <div key={`new-line-${index}`} style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
              <input
                placeholder="Description"
                value={line.description}
                onChange={(event) =>
                  setNewInvoice((prev) => ({
                    ...prev,
                    lines: prev.lines.map((entry, lineIndex) =>
                      lineIndex === index ? { ...entry, description: event.target.value } : entry
                    )
                  }))
                }
                style={{ ...inputStyle, minWidth: "200px" }}
              />
              <input
                placeholder="Qty"
                value={line.qty}
                onChange={(event) =>
                  setNewInvoice((prev) => ({
                    ...prev,
                    lines: prev.lines.map((entry, lineIndex) =>
                      lineIndex === index ? { ...entry, qty: event.target.value } : entry
                    )
                  }))
                }
                style={inputStyle}
              />
              <input
                placeholder="Unit price"
                value={line.unit_price}
                onChange={(event) =>
                  setNewInvoice((prev) => ({
                    ...prev,
                    lines: prev.lines.map((entry, lineIndex) =>
                      lineIndex === index ? { ...entry, unit_price: event.target.value } : entry
                    )
                  }))
                }
                style={inputStyle}
              />
              {newInvoice.lines.length > 1 ? (
                <button
                  type="button"
                  onClick={() =>
                    setNewInvoice((prev) => ({
                      ...prev,
                      lines: prev.lines.filter((_, lineIndex) => lineIndex !== index)
                    }))
                  }
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
          <div style={{ marginTop: "8px" }}>
            <button
              type="button"
              onClick={() =>
                setNewInvoice((prev) => ({
                  ...prev,
                  lines: [...prev.lines, { ...emptyLineDraft }]
                }))
              }
            >
              Add line
            </button>
          </div>
        </div>
        <button type="button" onClick={() => createInvoice()} disabled={submitting}>
          Create invoice
        </button>
      </div>

      {editingInvoice ? (
        <div style={boxStyle}>
          <h3 style={{ marginTop: 0 }}>Edit Draft Invoice #{editingInvoice.id}</h3>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            <input
              placeholder="Invoice No"
              value={editingInvoice.invoice_no}
              onChange={(event) =>
                setEditingInvoice((prev) =>
                  prev
                    ? {
                        ...prev,
                        invoice_no: event.target.value
                      }
                    : prev
                )
              }
              style={inputStyle}
            />
            <input
              type="date"
              value={editingInvoice.invoice_date}
              onChange={(event) =>
                setEditingInvoice((prev) =>
                  prev
                    ? {
                        ...prev,
                        invoice_date: event.target.value
                      }
                    : prev
                )
              }
              style={inputStyle}
            />
            <input
              placeholder="Tax amount"
              value={editingInvoice.tax_amount}
              onChange={(event) =>
                setEditingInvoice((prev) =>
                  prev
                    ? {
                        ...prev,
                        tax_amount: event.target.value
                      }
                    : prev
                )
              }
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: "12px" }}>
            <strong>Lines</strong>
            {editingInvoice.lines.map((line, index) => (
              <div key={`edit-line-${index}`} style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                <input
                  placeholder="Description"
                  value={line.description}
                  onChange={(event) =>
                    setEditingInvoice((prev) =>
                      prev
                        ? {
                            ...prev,
                            lines: prev.lines.map((entry, lineIndex) =>
                              lineIndex === index ? { ...entry, description: event.target.value } : entry
                            )
                          }
                        : prev
                    )
                  }
                  style={{ ...inputStyle, minWidth: "200px" }}
                />
                <input
                  placeholder="Qty"
                  value={line.qty}
                  onChange={(event) =>
                    setEditingInvoice((prev) =>
                      prev
                        ? {
                            ...prev,
                            lines: prev.lines.map((entry, lineIndex) =>
                              lineIndex === index ? { ...entry, qty: event.target.value } : entry
                            )
                          }
                        : prev
                    )
                  }
                  style={inputStyle}
                />
                <input
                  placeholder="Unit price"
                  value={line.unit_price}
                  onChange={(event) =>
                    setEditingInvoice((prev) =>
                      prev
                        ? {
                            ...prev,
                            lines: prev.lines.map((entry, lineIndex) =>
                              lineIndex === index ? { ...entry, unit_price: event.target.value } : entry
                            )
                          }
                        : prev
                    )
                  }
                  style={inputStyle}
                />
                {editingInvoice.lines.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setEditingInvoice((prev) =>
                        prev
                          ? {
                              ...prev,
                              lines: prev.lines.filter((_, lineIndex) => lineIndex !== index)
                            }
                          : prev
                      )
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
            <div style={{ marginTop: "8px" }}>
              <button
                type="button"
                onClick={() =>
                  setEditingInvoice((prev) =>
                    prev
                      ? {
                          ...prev,
                          lines: [...prev.lines, { ...emptyLineDraft }]
                        }
                      : prev
                  )
                }
              >
                Add line
              </button>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" onClick={() => saveInvoiceEdit()} disabled={submitting}>
              Save draft
            </button>
            <button type="button" onClick={() => setEditingInvoice(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div style={boxStyle}>
        <div style={{ marginBottom: "12px" }}>
          <label htmlFor="outlet-select" style={{ marginRight: "8px", fontWeight: 500 }}>
            Outlet:
          </label>
          <select
            id="outlet-select"
            value={selectedOutletId}
            onChange={handleOutletChange}
            style={{
              border: "1px solid #cabfae",
              borderRadius: "6px",
              padding: "6px 8px"
            }}
          >
            {props.user.outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: "#fee",
              border: "1px solid #fcc",
              borderRadius: "6px",
              padding: "12px",
              marginBottom: "12px",
              color: "#c00"
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <p>Loading invoices...</p>
        ) : invoices.length === 0 ? (
          <p style={{ color: "#666" }}>No invoices found for this outlet.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ backgroundColor: "#f5f0e8" }}>
                <th style={{ ...cellStyle, textAlign: "left" }}>Invoice No</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Date</th>
                <th style={{ ...cellStyle, textAlign: "center" }}>Status</th>
                <th style={{ ...cellStyle, textAlign: "center" }}>Payment</th>
                <th style={{ ...cellStyle, textAlign: "right" }}>Grand Total</th>
                <th style={{ ...cellStyle, textAlign: "right" }}>Paid</th>
                <th style={{ ...cellStyle, textAlign: "right" }}>Outstanding</th>
                <th style={{ ...cellStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td style={cellStyle}>{invoice.invoice_no}</td>
                  <td style={cellStyle}>{formatDate(invoice.invoice_date)}</td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 500,
                        backgroundColor: getStatusBadgeColor(invoice.status),
                        color: "white"
                      }}
                    >
                      {invoice.status}
                    </span>
                  </td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 500,
                        backgroundColor: getPaymentStatusBadgeColor(invoice.payment_status),
                        color: "white"
                      }}
                    >
                      {invoice.payment_status}
                    </span>
                  </td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>
                    {formatCurrency(invoice.grand_total)}
                  </td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>
                    {formatCurrency(invoice.paid_total)}
                  </td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>
                    {formatCurrency(invoice.grand_total - invoice.paid_total)}
                  </td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
                      {invoice.status === "DRAFT" ? (
                        <a style={linkStyle} onClick={() => loadInvoiceForEdit(invoice.id)}>
                          Edit
                        </a>
                      ) : null}
                      {invoice.status === "DRAFT" ? (
                        <a style={linkStyle} onClick={() => postInvoiceById(invoice.id)}>
                          Post
                        </a>
                      ) : null}
                      <a style={linkStyle} onClick={() => handleViewPrint(invoice.id)}>
                        Print
                      </a>
                      <a style={linkStyle} onClick={() => handleViewPdf(invoice.id)}>
                        PDF
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
