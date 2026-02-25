import { useState } from "react";
import type { SessionUser } from "../lib/session";
import { useAccountTypes } from "../hooks/use-accounts";
import {
  createAccountType,
  updateAccountType,
  deactivateAccountType
} from "../hooks/use-accounts";
import { ApiError } from "../lib/api-client";
import type { AccountTypeResponse } from "@jurnapod/shared";
import { StaleDataWarning } from "../components/stale-data-warning";

type AccountTypesPageProps = {
  user: SessionUser;
  accessToken: string;
};

type FormMode = "create" | "edit" | null;

type AccountTypeFormData = {
  name: string;
  category: string;
  normal_balance: string;
  report_group: string;
};

const emptyForm: AccountTypeFormData = {
  name: "",
  category: "ASSET",
  normal_balance: "DEBIT",
  report_group: "NRC"
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

const selectStyle = {
  ...inputStyle,
  width: "100%"
} as const;

const buttonStyle = {
  border: "1px solid #cabfae",
  borderRadius: "6px",
  padding: "6px 12px",
  backgroundColor: "#fff",
  cursor: "pointer",
  marginRight: "8px"
} as const;

const primaryButtonStyle = {
  ...buttonStyle,
  backgroundColor: "#2f5f4a",
  color: "#fff",
  border: "1px solid #2f5f4a"
} as const;

const dangerButtonStyle = {
  ...buttonStyle,
  backgroundColor: "#d32f2f",
  color: "#fff",
  border: "1px solid #d32f2f"
} as const;

const badgeStyle = {
  display: "inline-block",
  padding: "2px 6px",
  borderRadius: "4px",
  fontSize: "11px",
  fontWeight: "bold" as const,
  marginRight: "4px"
} as const;

const activeBadgeStyle = {
  ...badgeStyle,
  backgroundColor: "#d4edda",
  color: "#155724"
} as const;

const inactiveBadgeStyle = {
  ...badgeStyle,
  backgroundColor: "#f8d7da",
  color: "#721c24"
} as const;

const categoryBadgeStyle = {
  ...badgeStyle,
  backgroundColor: "#d1ecf1",
  color: "#0c5460"
} as const;

const CATEGORIES = [
  { value: "ASSET", label: "Asset" },
  { value: "LIABILITY", label: "Liability" },
  { value: "EQUITY", label: "Equity" },
  { value: "REVENUE", label: "Revenue" },
  { value: "EXPENSE", label: "Expense" }
];

const NORMAL_BALANCES = [
  { value: "DEBIT", label: "Debit" },
  { value: "CREDIT", label: "Credit" }
];

const REPORT_GROUPS = [
  { value: "NRC", label: "Neraca (Balance Sheet)" },
  { value: "LR", label: "Laba Rugi (P&L)" }
];

export function AccountTypesPage({ user, accessToken }: AccountTypesPageProps) {
  const companyId = user.company_id;
  const { data: accountTypes, loading, error, refetch } = useAccountTypes(companyId, accessToken);

  const [formMode, setFormMode] = useState<FormMode>(null);
  const [formData, setFormData] = useState<AccountTypeFormData>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Filter account types
  const filteredAccountTypes = accountTypes.filter((type) => {
    if (!showInactive && !type.is_active) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        type.name.toLowerCase().includes(query) ||
        type.category?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  // Group by category
  const groupedByCategory = filteredAccountTypes.reduce((acc, type) => {
    const category = type.category || "OTHER";
    if (!acc[category]) acc[category] = [];
    acc[category].push(type);
    return acc;
  }, {} as Record<string, AccountTypeResponse[]>);

  function openCreateForm() {
    setFormMode("create");
    setFormData(emptyForm);
    setEditingId(null);
    setSubmitError(null);
  }

  function openEditForm(accountType: AccountTypeResponse) {
    setFormMode("edit");
    setFormData({
      name: accountType.name,
      category: accountType.category || "ASSET",
      normal_balance: accountType.normal_balance || "DEBIT",
      report_group: accountType.report_group || "NRC"
    });
    setEditingId(accountType.id);
    setSubmitError(null);
  }

  function closeForm() {
    setFormMode(null);
    setFormData(emptyForm);
    setEditingId(null);
    setSubmitError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      if (formMode === "create") {
        await createAccountType(
          {
            company_id: companyId,
            name: formData.name,
            category: formData.category,
            normal_balance: formData.normal_balance,
            report_group: formData.report_group
          },
          accessToken
        );
      } else if (formMode === "edit" && editingId) {
        await updateAccountType(
          editingId,
          {
            name: formData.name,
            category: formData.category,
            normal_balance: formData.normal_balance,
            report_group: formData.report_group
          },
          accessToken
        );
      }
      closeForm();
      refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError("An unexpected error occurred");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(accountTypeId: number) {
    if (!confirm("Are you sure you want to deactivate this account type?")) {
      return;
    }

    try {
      await deactivateAccountType(accountTypeId, accessToken);
      refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(`Failed to deactivate: ${err.message}`);
      } else {
        alert("An unexpected error occurred");
      }
    }
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ marginBottom: "8px" }}>Account Types</h1>
        <p style={{ color: "#666", margin: 0 }}>
          Manage account type categories for your chart of accounts
        </p>
        <StaleDataWarning cacheKey="account_types" label="account types" />
      </div>

      {/* Filters and Actions */}
      <div style={boxStyle}>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search by name or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ ...inputStyle, flexGrow: 1, minWidth: "200px" }}
          />
          
          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show Inactive
          </label>

          <button onClick={openCreateForm} style={primaryButtonStyle}>
            + Create Account Type
          </button>
        </div>
      </div>

      {/* Loading/Error States */}
      {loading && <div style={boxStyle}>Loading account types...</div>}
      {error && (
        <div style={{ ...boxStyle, backgroundColor: "#f8d7da", color: "#721c24" }}>
          Error: {error}
        </div>
      )}

      {/* Form Modal */}
      {formMode && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={closeForm}
        >
          <div
            style={{
              backgroundColor: "#fff",
              borderRadius: "10px",
              padding: "24px",
              width: "90%",
              maxWidth: "500px",
              maxHeight: "90vh",
              overflow: "auto"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>
              {formMode === "create" ? "Create Account Type" : "Edit Account Type"}
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  style={inputStyle}
                  placeholder="e.g., Current Assets, Fixed Assets"
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  required
                  style={selectStyle}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Normal Balance
                </label>
                <select
                  value={formData.normal_balance}
                  onChange={(e) => setFormData({ ...formData, normal_balance: e.target.value })}
                  style={selectStyle}
                >
                  {NORMAL_BALANCES.map((bal) => (
                    <option key={bal.value} value={bal.value}>
                      {bal.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                  Report Group
                </label>
                <select
                  value={formData.report_group}
                  onChange={(e) => setFormData({ ...formData, report_group: e.target.value })}
                  style={selectStyle}
                >
                  {REPORT_GROUPS.map((group) => (
                    <option key={group.value} value={group.value}>
                      {group.label}
                    </option>
                  ))}
                </select>
              </div>

              {submitError && (
                <div
                  style={{
                    padding: "8px",
                    marginBottom: "16px",
                    backgroundColor: "#f8d7da",
                    color: "#721c24",
                    borderRadius: "6px",
                    fontSize: "14px"
                  }}
                >
                  {submitError}
                </div>
              )}

              <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                <button type="button" onClick={closeForm} style={buttonStyle} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" style={primaryButtonStyle} disabled={submitting}>
                  {submitting ? "Saving..." : formMode === "create" ? "Create" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account Types List */}
      {!loading && !error && (
        <>
          {Object.keys(groupedByCategory).length === 0 ? (
            <div style={boxStyle}>
              <p style={{ margin: 0, textAlign: "center", color: "#666" }}>
                No account types found. Create one to get started.
              </p>
            </div>
          ) : (
            Object.entries(groupedByCategory)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([category, types]) => (
                <div key={category} style={boxStyle}>
                  <h3 style={{ marginTop: 0, marginBottom: "12px" }}>
                    <span style={categoryBadgeStyle}>{category}</span>
                  </h3>
                  <table style={tableStyle}>
                    <thead>
                      <tr style={{ backgroundColor: "#f5f1ea" }}>
                        <th style={{ ...cellStyle, textAlign: "left", fontWeight: "bold" }}>Name</th>
                        <th style={{ ...cellStyle, textAlign: "left", fontWeight: "bold" }}>
                          Normal Balance
                        </th>
                        <th style={{ ...cellStyle, textAlign: "left", fontWeight: "bold" }}>
                          Report Group
                        </th>
                        <th style={{ ...cellStyle, textAlign: "left", fontWeight: "bold" }}>Status</th>
                        <th style={{ ...cellStyle, textAlign: "right", fontWeight: "bold" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {types.map((type) => (
                        <tr key={type.id}>
                          <td style={cellStyle}>{type.name}</td>
                          <td style={cellStyle}>{type.normal_balance || "-"}</td>
                          <td style={cellStyle}>{type.report_group || "-"}</td>
                          <td style={cellStyle}>
                            <span style={type.is_active ? activeBadgeStyle : inactiveBadgeStyle}>
                              {type.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td style={{ ...cellStyle, textAlign: "right" }}>
                            <button
                              onClick={() => openEditForm(type)}
                              style={buttonStyle}
                              disabled={!type.is_active}
                            >
                              Edit
                            </button>
                            {type.is_active && (
                              <button
                                onClick={() => handleDeactivate(type.id)}
                                style={dangerButtonStyle}
                              >
                                Deactivate
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
          )}
        </>
      )}

      {/* Summary */}
      <div style={{ ...boxStyle, backgroundColor: "#e8f5e9" }}>
        <div style={{ display: "flex", gap: "20px", justifyContent: "space-around" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: "bold" }}>{accountTypes.length}</div>
            <div style={{ fontSize: "12px", color: "#666" }}>Total Types</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: "bold" }}>
              {accountTypes.filter((t) => t.is_active).length}
            </div>
            <div style={{ fontSize: "12px", color: "#666" }}>Active</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: "bold" }}>
              {Object.keys(groupedByCategory).length}
            </div>
            <div style={{ fontSize: "12px", color: "#666" }}>Categories</div>
          </div>
        </div>
      </div>
    </div>
  );
}
