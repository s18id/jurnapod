// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import type { SessionUser } from "../lib/session";
import { useOnlineStatus } from "../lib/connection";
import { OfflinePage } from "../components/offline-page";
import { useAccounts } from "../hooks/use-accounts";
import {
  useOutletAccountMappings,
  type OutletAccountMappingKey,
  type OutletAccountMapping
} from "../hooks/use-outlet-account-mappings";
import {
  useOutletPaymentMethodMappings,
  type PaymentMethodConfig,
  type PaymentMethodMapping
} from "../hooks/use-outlet-payment-method-mappings";
import { ApiError } from "../lib/api-client";

type AccountMappingsPageProps = {
  user: SessionUser;
  accessToken: string;
};

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
  padding: "6px 8px",
  width: "100%"
} as const;

const buttonStyle = {
  border: "1px solid #cabfae",
  borderRadius: "6px",
  padding: "8px 12px",
  backgroundColor: "#fff",
  cursor: "pointer"
} as const;

const primaryButtonStyle = {
  ...buttonStyle,
  backgroundColor: "#2f5f4a",
  color: "#fff",
  border: "1px solid #2f5f4a"
} as const;

const mappingGroups: Array<{
  title: string;
  description: string;
  keys: Array<{ key: OutletAccountMappingKey; label: string }>;
}> = [
  {
    title: "Sales Defaults",
    description: "Used for sales invoice posting.",
    keys: [
      { key: "AR", label: "Accounts Receivable" },
      { key: "SALES_REVENUE", label: "Sales Revenue" },
      { key: "SALES_TAX", label: "Sales Tax" }
    ]
  }
];

const allMappingKeys = mappingGroups.flatMap((group) => group.keys.map((entry) => entry.key));

function buildDefaultMappings(): Record<OutletAccountMappingKey, number | ""> {
  return allMappingKeys.reduce(
    (acc, key) => {
      acc[key] = "";
      return acc;
    },
    {} as Record<OutletAccountMappingKey, number | "">
  );
}

export function AccountMappingsPage({ user, accessToken }: AccountMappingsPageProps) {
  const isOnline = useOnlineStatus();
  const [outletId, setOutletId] = useState<number>(user.outlets[0]?.id ?? 0);
  const [formState, setFormState] = useState<Record<OutletAccountMappingKey, number | "">>(
    buildDefaultMappings()
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentSubmitError, setPaymentSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [draftMethodCode, setDraftMethodCode] = useState("");
  const [draftMethodLabel, setDraftMethodLabel] = useState("");
  const [draftMethods, setDraftMethods] = useState<PaymentMethodConfig[]>([]);
  const [paymentLabelState, setPaymentLabelState] = useState<Record<string, string>>({});

  const { data: mappings, loading, error, refetch, save } = useOutletAccountMappings(outletId, accessToken);
  const {
    paymentMethods,
    mappings: paymentMappings,
    loading: paymentLoading,
    error: paymentError,
    refetch: refetchPayment,
    save: savePayment
  } = useOutletPaymentMethodMappings(outletId, accessToken);
  const accountFilters = useMemo(() => ({ is_active: true }), []);
  const { data: accounts } = useAccounts(user.company_id, accessToken, accountFilters);

  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        label: `${account.code} - ${account.name}`,
        is_payable: account.is_payable
      })),
    [accounts]
  );
  const paymentAccountOptions = useMemo(
    () => accountOptions.filter((account) => account.is_payable),
    [accountOptions]
  );
  const [paymentFormState, setPaymentFormState] = useState<Record<string, number | "">>({});
  const [invoiceDefaultMethod, setInvoiceDefaultMethod] = useState<string | null>(null);

  useEffect(() => {
    const nextState = buildDefaultMappings();
    mappings.forEach((mapping) => {
      nextState[mapping.mapping_key] = mapping.account_id;
    });
    setFormState(nextState);
  }, [mappings]);

  useEffect(() => {
    const nextState: Record<string, number | ""> = {};
    const nextLabels: Record<string, string> = {};
    let invoiceDefault: string | null = null;
    
    paymentMethods.forEach((method) => {
      nextState[method.code] = "";
      nextLabels[method.code] = method.label;
    });
    paymentMappings.forEach((mapping) => {
      if (mapping.method_code) {
        nextState[mapping.method_code] = mapping.account_id;
        if (mapping.label) {
          nextLabels[mapping.method_code] = mapping.label;
        }
        if (mapping.is_invoice_default) {
          invoiceDefault = mapping.method_code;
        }
      }
    });
    setPaymentFormState(nextState);
    setPaymentLabelState(nextLabels);
    setInvoiceDefaultMethod(invoiceDefault);
  }, [paymentMethods, paymentMappings]);

  useEffect(() => {
    setDraftMethods([]);
    setDraftMethodCode("");
    setDraftMethodLabel("");
    setPaymentSubmitError(null);
    setPaymentLabelState({});
    setInvoiceDefaultMethod(null);
  }, [outletId]);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Settings"
        message="Account mapping changes require a connection."
      />
    );
  }

  const missingKeys = allMappingKeys.filter((key) => !formState[key]);
  const effectivePaymentMethods = useMemo(() => {
    const methodMap = new Map(paymentMethods.map((method) => [method.code, method]));
    draftMethods.forEach((method) => {
      if (!methodMap.has(method.code)) {
        methodMap.set(method.code, method);
      }
    });
    return Array.from(methodMap.values());
  }, [paymentMethods, draftMethods]);

  const missingPaymentMethods = effectivePaymentMethods.filter((method) => !paymentFormState[method.code]);

  async function handleSave() {
    setSubmitError(null);
    if (missingKeys.length > 0) {
      setSubmitError("Please select an account for every sales mapping.");
      return;
    }

    setSaving(true);
    try {
      const payload: OutletAccountMapping[] = allMappingKeys.map((key) => ({
        mapping_key: key,
        account_id: Number(formState[key])
      }));
      await save(payload);
      await refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Failed to save sales mappings");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handlePaymentSave() {
    setPaymentSubmitError(null);
    if (missingPaymentMethods.length > 0) {
      setPaymentSubmitError("Please select an account for every payment method.");
      return;
    }

    setPaymentSaving(true);
    try {
      const payload: PaymentMethodMapping[] = effectivePaymentMethods.map((method) => ({
        method_code: method.code,
        account_id: Number(paymentFormState[method.code]),
        label: paymentLabelState[method.code]?.trim() || undefined,
        is_invoice_default: invoiceDefaultMethod === method.code
      }));
      await savePayment(payload);
      await refetchPayment();
      setDraftMethods([]);
      setDraftMethodCode("");
      setDraftMethodLabel("");
      setPaymentLabelState({});
    } catch (err) {
      if (err instanceof ApiError) {
        setPaymentSubmitError(err.message);
      } else {
        setPaymentSubmitError("Failed to save payment method mappings");
      }
    } finally {
      setPaymentSaving(false);
    }
  }

  function handleAddPaymentMethod() {
    const normalizedCode = draftMethodCode.trim().toUpperCase();
    const normalizedLabel = draftMethodLabel.trim() || normalizedCode;
    if (!normalizedCode) {
      setPaymentSubmitError("Payment method code is required.");
      return;
    }
    const exists = effectivePaymentMethods.some((method) => method.code === normalizedCode);
    if (exists) {
      setPaymentSubmitError("Payment method code already exists.");
      return;
    }
    setDraftMethods((prev) => [...prev, { code: normalizedCode, label: normalizedLabel }]);
    setPaymentFormState((prev) => ({ ...prev, [normalizedCode]: "" }));
    setPaymentLabelState((prev) => ({ ...prev, [normalizedCode]: normalizedLabel }));
    setDraftMethodCode("");
    setDraftMethodLabel("");
    setPaymentSubmitError(null);
  }

  function renderMappingRow(entry: { key: OutletAccountMappingKey; label: string }) {
    return (
      <tr key={entry.key}>
        <td style={cellStyle}>{entry.label}</td>
        <td style={cellStyle}>
          <select
            value={formState[entry.key]}
            onChange={(event) =>
              setFormState((prev) => ({
                ...prev,
                [entry.key]: event.target.value ? Number(event.target.value) : ""
              }))
            }
            style={inputStyle}
          >
            <option value="">Select account</option>
            {accountOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label}
              </option>
            ))}
          </select>
        </td>
      </tr>
    );
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1100px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ marginBottom: "8px" }}>Account Mapping Settings</h1>
        <p style={{ color: "#666", margin: 0 }}>
          Configure default accounts for Sales and POS posting by outlet.
        </p>
      </div>

      <section style={boxStyle}>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <select value={outletId} onChange={(event) => setOutletId(Number(event.target.value))} style={inputStyle}>
            {user.outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.code} - {outlet.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={refetch} style={buttonStyle} disabled={loading || paymentLoading}>
            {loading || paymentLoading ? "Loading..." : "Reload"}
          </button>
        </div>
        {error ? <p style={{ color: "#8d2626" }}>{error}</p> : null}
        {paymentError ? <p style={{ color: "#8d2626" }}>{paymentError}</p> : null}
      </section>

      {mappingGroups.map((group) => (
        <section key={group.title} style={boxStyle}>
          <h2 style={{ marginTop: 0 }}>{group.title}</h2>
          <p style={{ color: "#5b6664", marginTop: 0 }}>{group.description}</p>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={cellStyle}>Mapping</th>
                <th style={cellStyle}>Account</th>
              </tr>
            </thead>
            <tbody>{group.keys.map((entry) => renderMappingRow(entry))}</tbody>
          </table>
        </section>
      ))}

      {submitError ? <p style={{ color: "#8d2626" }}>{submitError}</p> : null}
      {missingKeys.length > 0 ? (
        <p style={{ color: "#8d2626" }}>
          Missing sales mappings: {missingKeys.join(", ")}
        </p>
      ) : null}
      <button type="button" style={primaryButtonStyle} onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Sales Mappings"}
      </button>

      <section style={boxStyle} data-testid="payment-methods-section">
        <h2 style={{ marginTop: 0 }}>POS Payment Methods</h2>
        <p style={{ color: "#5b6664", marginTop: 0 }}>
          Map each POS payment method to a cash/bank account. Set the default payment method for invoice payments.
        </p>
        <p style={{ color: "#5b6664", fontSize: "13px", marginTop: "8px", marginBottom: "12px" }}>
          <strong>Invoice Default:</strong> Pre-selected payment account when creating sales payments in backoffice. Cashiers will manually select payment methods in POS.
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
          <input
            type="text"
            placeholder="Method code (e.g., CARD_BCA)"
            value={draftMethodCode}
            onChange={(event) => setDraftMethodCode(event.target.value)}
            style={{ ...inputStyle, flex: "1 1 220px" }}
          />
          <input
            type="text"
            placeholder="Label (optional)"
            value={draftMethodLabel}
            onChange={(event) => setDraftMethodLabel(event.target.value)}
            style={{ ...inputStyle, flex: "1 1 220px" }}
          />
          <button type="button" onClick={handleAddPaymentMethod} style={buttonStyle}>
            Add Method
          </button>
        </div>
        {effectivePaymentMethods.length === 0 ? (
          <p style={{ color: "#5b6664" }}>No payment methods configured.</p>
        ) : (
          <table style={tableStyle} data-testid="payment-methods-table">
            <thead>
              <tr>
                <th style={cellStyle}>Method Code</th>
                <th style={cellStyle}>Label</th>
                <th style={cellStyle}>Account</th>
                <th style={cellStyle} data-testid="invoice-default-header">Invoice Default</th>
              </tr>
            </thead>
            <tbody>
              {effectivePaymentMethods.map((method) => (
                <tr key={method.code} data-testid={`payment-method-${method.code}`}>
                  <td style={cellStyle}>{method.code}</td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={paymentLabelState[method.code] ?? method.label}
                      onChange={(event) =>
                        setPaymentLabelState((prev) => ({
                          ...prev,
                          [method.code]: event.target.value
                        }))
                      }
                      style={inputStyle}
                    />
                  </td>
                  <td style={cellStyle}>
                    <select
                      value={paymentFormState[method.code] ?? ""}
                      onChange={(event) =>
                        setPaymentFormState((prev) => ({
                          ...prev,
                          [method.code]: event.target.value ? Number(event.target.value) : ""
                        }))
                      }
                      style={inputStyle}
                    >
                      <option value="">Select account</option>
                      {paymentAccountOptions.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      data-testid={`payment-method-${method.code}-invoice-default`}
                      checked={invoiceDefaultMethod === method.code}
                      onChange={(event) => {
                        setInvoiceDefaultMethod(event.target.checked ? method.code : null);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {paymentSubmitError ? (
          <p style={{ color: "#8d2626" }} data-testid="payment-mappings-error">
            {paymentSubmitError}
          </p>
        ) : null}
        {missingPaymentMethods.length > 0 ? (
          <p style={{ color: "#8d2626" }}>
            Missing payment mappings: {missingPaymentMethods.map((method) => method.label).join(", ")}
          </p>
        ) : null}
        <button
          type="button"
          style={primaryButtonStyle}
          onClick={handlePaymentSave}
          disabled={paymentSaving}
          data-testid="save-payment-mappings"
        >
          {paymentSaving ? "Saving..." : "Save Payment Mappings"}
        </button>
      </section>
    </div>
  );
}
