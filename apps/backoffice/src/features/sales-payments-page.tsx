// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "../lib/api-client";
import type { SessionUser } from "../lib/session";
import { useAccounts } from "../hooks/use-accounts";
import { useOutletPaymentMethodMappings } from "../hooks/use-outlet-payment-method-mappings";

type PaymentStatus = "DRAFT" | "POSTED" | "VOID";

type Payment = {
  id: number;
  company_id: number;
  outlet_id: number;
  invoice_id: number;
  payment_no: string;
  payment_at: string;
  account_id: number;
  account_name?: string;
  status: PaymentStatus;
  amount: number;
  created_at: string;
  updated_at: string;
};

type PaymentsResponse = { ok: true; total: number; payments: Payment[] };

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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function formatDateTime(dateTimeString: string): string {
  return new Date(dateTimeString).toLocaleString("id-ID");
}

function getStatusBadgeColor(status: PaymentStatus): string {
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



type SalesPaymentsPageProps = {
  user: SessionUser;
  accessToken: string;
};

type PaymentDraft = {
  payment_no: string;
  invoice_id: string;
  payment_at: string;
  account_id: string;
  amount: string;
};

type PaymentEditDraft = PaymentDraft & {
  id: number;
};

function toLocalDateTimeInput(value: Date): string {
  const offsetMs = value.getTimezoneOffset() * 60 * 1000;
  const local = new Date(value.getTime() - offsetMs);
  return local.toISOString().slice(0, 16);
}

export function SalesPaymentsPage(props: SalesPaymentsPageProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedOutletId, setSelectedOutletId] = useState<number>(
    props.user.outlets[0]?.id ?? 0
  );
  const [newPayment, setNewPayment] = useState<PaymentDraft>(() => ({
    payment_no: "",
    invoice_id: "",
    payment_at: toLocalDateTimeInput(new Date()),
    account_id: "",
    amount: "0"
  }));
  const [editingPayment, setEditingPayment] = useState<PaymentEditDraft | null>(null);

  // Fetch payable accounts for payment destination dropdown
  const accountFilter = useMemo(() => ({ is_payable: true }), []);
  const { data: payableAccounts, loading: accountsLoading } = useAccounts(
    props.user.company_id,
    props.accessToken,
    accountFilter
  );

  // Fetch payment method mappings to get the invoice default
  const { mappings: paymentMappings, loading: mappingsLoading } = useOutletPaymentMethodMappings(
    selectedOutletId,
    props.accessToken
  );

  async function refreshData(outletId: number) {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<PaymentsResponse>(
        `/sales/payments?outlet_id=${outletId}&limit=100`,
        {},
        props.accessToken
      );
      setPayments(response.payments);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load payments");
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

  // Set default account_id from invoice default payment method mapping
  useEffect(() => {
    if (!mappingsLoading && paymentMappings.length > 0) {
      const invoiceDefault = paymentMappings.find((m) => m.is_invoice_default === true);
      if (invoiceDefault && newPayment.account_id === "") {
        setNewPayment((prev) => ({
          ...prev,
          account_id: String(invoiceDefault.account_id)
        }));
      }
    }
  }, [mappingsLoading, paymentMappings, newPayment.account_id]);

  function handleOutletChange(event: React.ChangeEvent<HTMLSelectElement>) {
    setSelectedOutletId(Number(event.target.value));
  }

  function resetNewPayment() {
    setNewPayment({
      payment_no: "",
      invoice_id: "",
      payment_at: toLocalDateTimeInput(new Date()),
      account_id: "",
      amount: "0"
    });
  }

  function toIsoString(localValue: string): string {
    const date = new Date(localValue);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toISOString();
  }

  async function createPayment() {
    if (!newPayment.payment_no.trim()) {
      setError("Payment number is required");
      return;
    }

    if (!newPayment.invoice_id.trim()) {
      setError("Invoice ID is required");
      return;
    }

    if (!newPayment.account_id.trim()) {
      setError("Payment account is required");
      return;
    }

    const paymentAtIso = toIsoString(newPayment.payment_at);
    if (!paymentAtIso) {
      setError("Payment date is invalid");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(
        "/sales/payments",
        {
          method: "POST",
          body: JSON.stringify({
            outlet_id: selectedOutletId,
            invoice_id: Number(newPayment.invoice_id),
            payment_no: newPayment.payment_no.trim(),
            payment_at: paymentAtIso,
            account_id: Number(newPayment.account_id),
            amount: Number(newPayment.amount)
          })
        },
        props.accessToken
      );
      resetNewPayment();
      await refreshData(selectedOutletId);
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      } else {
        setError("Failed to create payment");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function loadPaymentForEdit(payment: Payment) {
    setEditingPayment({
      id: payment.id,
      payment_no: payment.payment_no,
      invoice_id: String(payment.invoice_id),
      payment_at: toLocalDateTimeInput(new Date(payment.payment_at)),
      account_id: String(payment.account_id),
      amount: String(payment.amount)
    });
  }

  async function savePaymentEdit() {
    if (!editingPayment) {
      return;
    }

    if (!editingPayment.payment_no.trim()) {
      setError("Payment number is required");
      return;
    }

    if (!editingPayment.invoice_id.trim()) {
      setError("Invoice ID is required");
      return;
    }

    if (!editingPayment.account_id.trim()) {
      setError("Payment account is required");
      return;
    }

    const paymentAtIso = toIsoString(editingPayment.payment_at);
    if (!paymentAtIso) {
      setError("Payment date is invalid");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(
        `/sales/payments/${editingPayment.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            invoice_id: Number(editingPayment.invoice_id),
            payment_no: editingPayment.payment_no.trim(),
            payment_at: paymentAtIso,
            account_id: Number(editingPayment.account_id),
            amount: Number(editingPayment.amount)
          })
        },
        props.accessToken
      );
      setEditingPayment(null);
      await refreshData(selectedOutletId);
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      } else {
        setError("Failed to update payment");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function postPaymentById(paymentId: number) {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/sales/payments/${paymentId}/post`, { method: "POST" }, props.accessToken);
      await refreshData(selectedOutletId);
    } catch (postError) {
      if (postError instanceof ApiError) {
        setError(postError.message);
      } else {
        setError("Failed to post payment");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: "16px" }}>Sales Payments</h2>

      <div style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Create Payment</h3>
        {!mappingsLoading && paymentMappings.length > 0 && !paymentMappings.some((m) => m.is_invoice_default) && (
          <div
            style={{
              backgroundColor: "#fff9e6",
              border: "1px solid #ffcc00",
              borderRadius: "6px",
              padding: "10px",
              marginBottom: "12px",
              fontSize: "13px",
              color: "#664d00"
            }}
            data-testid="invoice-default-warning"
          >
            ℹ️ No invoice default payment method configured. Please set a default in Settings → Payment Methods.
          </div>
        )}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
          <input
            placeholder="Payment No"
            value={newPayment.payment_no}
            onChange={(event) =>
              setNewPayment((prev) => ({
                ...prev,
                payment_no: event.target.value
              }))
            }
            style={inputStyle}
          />
          <input
            placeholder="Invoice ID"
            value={newPayment.invoice_id}
            onChange={(event) =>
              setNewPayment((prev) => ({
                ...prev,
                invoice_id: event.target.value
              }))
            }
            style={inputStyle}
          />
          <input
            type="datetime-local"
            value={newPayment.payment_at}
            onChange={(event) =>
              setNewPayment((prev) => ({
                ...prev,
                payment_at: event.target.value
              }))
            }
            style={inputStyle}
          />
          <select
            value={newPayment.account_id}
            onChange={(event) =>
              setNewPayment((prev) => ({
                ...prev,
                account_id: event.target.value
              }))
            }
            style={inputStyle}
            disabled={accountsLoading}
          >
            <option value="">-- Select Account --</option>
            {payableAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Amount"
            value={newPayment.amount}
            onChange={(event) =>
              setNewPayment((prev) => ({
                ...prev,
                amount: event.target.value
              }))
            }
            style={inputStyle}
          />
        </div>
        <button type="button" onClick={() => createPayment()} disabled={submitting}>
          Create payment
        </button>
      </div>

      {editingPayment ? (
        <div style={boxStyle}>
          <h3 style={{ marginTop: 0 }}>Edit Draft Payment #{editingPayment.id}</h3>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
            <input
              placeholder="Payment No"
              value={editingPayment.payment_no}
              onChange={(event) =>
                setEditingPayment((prev) =>
                  prev
                    ? {
                        ...prev,
                        payment_no: event.target.value
                      }
                    : prev
                )
              }
              style={inputStyle}
            />
            <input
              placeholder="Invoice ID"
              value={editingPayment.invoice_id}
              onChange={(event) =>
                setEditingPayment((prev) =>
                  prev
                    ? {
                        ...prev,
                        invoice_id: event.target.value
                      }
                    : prev
                )
              }
              style={inputStyle}
            />
            <input
              type="datetime-local"
              value={editingPayment.payment_at}
              onChange={(event) =>
                setEditingPayment((prev) =>
                  prev
                    ? {
                        ...prev,
                        payment_at: event.target.value
                      }
                    : prev
                )
              }
              style={inputStyle}
            />
            <select
              value={editingPayment.account_id}
              onChange={(event) =>
                setEditingPayment((prev) =>
                  prev
                    ? {
                        ...prev,
                        account_id: event.target.value
                      }
                    : prev
                )
              }
              style={inputStyle}
              disabled={accountsLoading}
            >
              <option value="">-- Select Account --</option>
              {payableAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} - {account.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Amount"
              value={editingPayment.amount}
              onChange={(event) =>
                setEditingPayment((prev) =>
                  prev
                    ? {
                        ...prev,
                        amount: event.target.value
                      }
                    : prev
                )
              }
              style={inputStyle}
            />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" onClick={() => savePaymentEdit()} disabled={submitting}>
              Save draft
            </button>
            <button type="button" onClick={() => setEditingPayment(null)}>
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
          <p>Loading payments...</p>
        ) : payments.length === 0 ? (
          <p style={{ color: "#666" }}>No payments found for this outlet.</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ backgroundColor: "#f5f0e8" }}>
                <th style={{ ...cellStyle, textAlign: "left" }}>Payment No</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Date & Time</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Account</th>
                <th style={{ ...cellStyle, textAlign: "center" }}>Status</th>
                <th style={{ ...cellStyle, textAlign: "right" }}>Amount</th>
                <th style={{ ...cellStyle, textAlign: "center" }}>Invoice ID</th>
                <th style={{ ...cellStyle, textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id}>
                  <td style={cellStyle}>{payment.payment_no}</td>
                  <td style={cellStyle}>{formatDateTime(payment.payment_at)}</td>
                  <td style={cellStyle}>
                    {payment.account_name ?? `Account #${payment.account_id}`}
                  </td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 500,
                        backgroundColor: getStatusBadgeColor(payment.status),
                        color: "white"
                      }}
                    >
                      {payment.status}
                    </span>
                  </td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>
                    {formatCurrency(payment.amount)}
                  </td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    #{payment.invoice_id}
                  </td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
                      {payment.status === "DRAFT" ? (
                        <button type="button" onClick={() => loadPaymentForEdit(payment)}>
                          Edit
                        </button>
                      ) : null}
                      {payment.status === "DRAFT" ? (
                        <button type="button" onClick={() => postPaymentById(payment.id)}>
                          Post
                        </button>
                      ) : null}
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
