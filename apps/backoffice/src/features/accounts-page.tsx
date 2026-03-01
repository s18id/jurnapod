// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useMemo } from "react";
import type { SessionUser } from "../lib/session";
import { useAccountTree, useAccountTypes } from "../hooks/use-accounts";
import {
  createAccount,
  updateAccount,
  deactivateAccount,
  reactivateAccount
} from "../hooks/use-accounts";
import { ApiError } from "../lib/api-client";
import { StaleDataWarning } from "../components/stale-data-warning";
import { useOnlineStatus } from "../lib/connection";
import { OfflinePage } from "../components/offline-page";
import type {
  AccountResponse,
  AccountTreeNode,
  AccountTypeResponse,
  NormalBalance,
  ReportGroup
} from "@jurnapod/shared";

type AccountsPageProps = {
  user: SessionUser;
  accessToken: string;
};

type FormMode = "create" | "edit" | null;

type AccountFormData = {
  code: string;
  name: string;
  parent_account_id: number | null;
  is_group: boolean;
  account_type_id: number | null;
  type_name: string | null; // Legacy field, kept for backward compatibility
  normal_balance: NormalBalance | null; // Legacy field
  report_group: ReportGroup | null; // Legacy field
  is_payable: boolean;
  is_active: boolean;
};

const emptyForm: AccountFormData = {
  code: "",
  name: "",
  parent_account_id: null,
  is_group: false,
  account_type_id: null,
  type_name: null,
  normal_balance: null,
  report_group: null,
  is_payable: false,
  is_active: true
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
  padding: "6px 8px"
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

const groupBadgeStyle = {
  ...badgeStyle,
  backgroundColor: "#d1ecf1",
  color: "#0c5460"
} as const;

const payableBadgeStyle = {
  ...badgeStyle,
  backgroundColor: "#efe3c2",
  color: "#5b4b2f"
} as const;

export function AccountsPage(props: AccountsPageProps) {
  const isOnline = useOnlineStatus();
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [reportGroupFilter, setReportGroupFilter] = useState<ReportGroup | "ALL">("ALL");
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<AccountFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data: tree, loading, error: treeError, refetch } = useAccountTree(
    props.user.company_id,
    props.accessToken,
    showInactive
  );

  const { data: accountTypes, loading: accountTypesLoading } = useAccountTypes(
    props.user.company_id,
    props.accessToken
  );

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Master Data"
        message="Chart of accounts changes require a connection."
      />
    );
  }

  // Flatten tree for parent dropdown and search
  const flatAccounts = useMemo(() => {
    if (!tree) return [];
    const result: AccountResponse[] = [];
    function traverse(nodes: AccountTreeNode[]) {
      for (const node of nodes) {
        result.push(node);
        if (node.children && node.children.length > 0) {
          traverse(node.children);
        }
      }
    }
    traverse(tree);
    return result;
  }, [tree]);

  // Filter tree based on search and report group
  const filteredTree = useMemo(() => {
    if (!tree) return [];
    if (!searchTerm && reportGroupFilter === "ALL") {
      return tree;
    }

    function matchesFilters(node: AccountTreeNode): boolean {
      const matchesSearch = !searchTerm || 
        node.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        node.name.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesReportGroup = reportGroupFilter === "ALL" || 
        node.report_group === reportGroupFilter;
      
      return matchesSearch && matchesReportGroup;
    }

    function filterTree(nodes: AccountTreeNode[]): AccountTreeNode[] {
      return nodes
        .map((node) => {
          const filteredChildren = node.children ? filterTree(node.children) : [];
          const nodeMatches = matchesFilters(node);
          const hasMatchingChildren = filteredChildren.length > 0;

          if (nodeMatches || hasMatchingChildren) {
            return {
              ...node,
              children: filteredChildren
            };
          }
          return null;
        })
        .filter((node): node is AccountTreeNode => node !== null);
    }

    return filterTree(tree);
  }, [tree, searchTerm, reportGroupFilter]);

  function toggleNode(nodeId: number) {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }

  function openCreateForm() {
    setFormMode("create");
    setEditingId(null);
    setFormData(emptyForm);
    setFormErrors({});
    setError(null);
    setSuccessMessage(null);
  }

  function openEditForm(account: AccountTreeNode) {
    setFormMode("edit");
    setEditingId(account.id);
    setFormData({
      code: account.code,
      name: account.name,
      parent_account_id: account.parent_account_id,
      is_group: account.is_group,
      account_type_id: account.account_type_id,
      type_name: account.type_name,
      normal_balance: account.normal_balance,
      report_group: account.report_group,
      is_payable: account.is_payable ?? false,
      is_active: account.is_active
    });
    setFormErrors({});
    setError(null);
    setSuccessMessage(null);
  }

  function closeForm() {
    setFormMode(null);
    setEditingId(null);
    setFormData(emptyForm);
    setFormErrors({});
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    
    if (!formData.code.trim()) {
      errors.code = "Account code is required";
    }
    if (!formData.name.trim()) {
      errors.name = "Account name is required";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validateForm()) {
      return;
    }

    setSubmitLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (formMode === "create") {
        await createAccount(
          {
            company_id: props.user.company_id,
            code: formData.code.trim(),
            name: formData.name.trim(),
            parent_account_id: formData.parent_account_id,
            is_group: formData.is_group,
            account_type_id: formData.account_type_id,
            type_name: formData.type_name, // Legacy field for backward compatibility
            normal_balance: formData.normal_balance, // Legacy field
            report_group: formData.report_group, // Legacy field
            is_payable: formData.is_payable,
            is_active: formData.is_active
          },
          props.accessToken
        );
        setSuccessMessage("Account created successfully");
      } else if (formMode === "edit" && editingId) {
        await updateAccount(
          editingId,
          {
            code: formData.code.trim(),
            name: formData.name.trim(),
            parent_account_id: formData.parent_account_id,
            is_group: formData.is_group,
            account_type_id: formData.account_type_id,
            type_name: formData.type_name, // Legacy field for backward compatibility
            normal_balance: formData.normal_balance, // Legacy field
            report_group: formData.report_group, // Legacy field
            is_payable: formData.is_payable,
            is_active: formData.is_active
          },
          props.accessToken
        );
        setSuccessMessage("Account updated successfully");
      }

      await refetch();
      closeForm();
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError("Failed to save account");
      }
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleDeactivate(account: AccountTreeNode) {
    if (!window.confirm(`Are you sure you want to deactivate account "${account.code} - ${account.name}"?`)) {
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      await deactivateAccount(account.id, props.accessToken);
      setSuccessMessage("Account deactivated successfully");
      await refetch();
    } catch (deactivateError) {
      if (deactivateError instanceof ApiError) {
        if (deactivateError.code === "ACCOUNT_IN_USE") {
          setError("Cannot deactivate: Account is in use (has journal entries or child accounts)");
        } else {
          setError(deactivateError.message);
        }
      } else {
        setError("Failed to deactivate account");
      }
    }
  }

  async function handleReactivate(account: AccountTreeNode) {
    setError(null);
    setSuccessMessage(null);

    try {
      await reactivateAccount(account.id, props.accessToken);
      setSuccessMessage("Account reactivated successfully");
      await refetch();
    } catch (reactivateError) {
      if (reactivateError instanceof ApiError) {
        setError(reactivateError.message);
      } else {
        setError("Failed to reactivate account");
      }
    }
  }

  function renderTreeNode(node: AccountTreeNode, level: number) {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const indentPx = level * 20;

    return (
      <div key={node.id}>
        <div
          style={{
            ...cellStyle,
            paddingLeft: `${8 + indentPx}px`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: level % 2 === 0 ? "#fcfbf8" : "#f8f6f3"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleNode(node.id)}
                style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  padding: "0 8px 0 0",
                  fontSize: "14px"
                }}
              >
                {isExpanded ? "▼" : "▶"}
              </button>
            ) : (
              <span style={{ paddingRight: "18px" }} />
            )}
            
            <span style={{ marginRight: "8px", fontSize: "16px" }}>
              {node.is_group ? "📁" : "📄"}
            </span>

            <div style={{ flex: 1 }}>
              <strong>{node.code}</strong> - {node.name}
              <div style={{ marginTop: "4px" }}>
                {node.is_active ? (
                  <span style={activeBadgeStyle}>Active</span>
                ) : (
                  <span style={inactiveBadgeStyle}>Inactive</span>
                )}
                {node.is_group && <span style={groupBadgeStyle}>Group</span>}
                {node.is_payable && <span style={payableBadgeStyle}>Payable</span>}
                {node.report_group && (
                  <span style={{ ...badgeStyle, backgroundColor: "#e7e7e7", color: "#333" }}>
                    {node.report_group}
                  </span>
                )}
                {/* Show account type name if account_type_id is set, fallback to legacy type_name */}
                {node.account_type_id && accountTypes.length > 0 && (
                  <span style={{ fontSize: "11px", color: "#6b5d48", marginLeft: "4px" }}>
                    {accountTypes.find(t => t.id === node.account_type_id)?.name}
                  </span>
                )}
                {!node.account_type_id && node.type_name && (
                  <span style={{ fontSize: "11px", color: "#6b5d48", marginLeft: "4px" }}>
                    {node.type_name}
                  </span>
                )}
                {node.normal_balance && (
                  <span style={{ fontSize: "11px", color: "#6b5d48", marginLeft: "4px" }}>
                    [{node.normal_balance}]
                  </span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "4px" }}>
            <button
              type="button"
              onClick={() => openEditForm(node)}
              style={{ ...buttonStyle, fontSize: "12px", padding: "4px 8px" }}
            >
              Edit
            </button>
            {node.is_active ? (
              <button
                type="button"
                onClick={() => handleDeactivate(node)}
                style={{ ...buttonStyle, fontSize: "12px", padding: "4px 8px" }}
              >
                Deactivate
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleReactivate(node)}
                style={{ ...buttonStyle, fontSize: "12px", padding: "4px 8px" }}
              >
                Reactivate
              </button>
            )}
          </div>
        </div>

        {isExpanded && hasChildren && (
          <div>
            {node.children.map((child) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <section style={boxStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Chart of Accounts</h2>
          <button type="button" onClick={openCreateForm} style={primaryButtonStyle}>
            Create Account
          </button>
        </div>

        <StaleDataWarning cacheKey="accounts" label="accounts" />

        {loading && <p>Loading accounts...</p>}
        {treeError && <p style={{ color: "#8d2626" }}>{treeError}</p>}
        {error && <p style={{ color: "#8d2626" }}>{error}</p>}
        {successMessage && (
          <p style={{ color: "#155724", backgroundColor: "#d4edda", padding: "8px", borderRadius: "4px" }}>
            {successMessage}
          </p>
        )}
      </section>

      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Filters</h3>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search by code or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, minWidth: "250px" }}
          />

          <label style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Show Inactive
          </label>

          <select
            value={reportGroupFilter}
            onChange={(e) => setReportGroupFilter(e.target.value as ReportGroup | "ALL")}
            style={inputStyle}
          >
            <option value="ALL">All Report Groups</option>
            <option value="NRC">Neraca (NRC)</option>
            <option value="LR">Laba Rugi (LR)</option>
          </select>
        </div>
      </section>

      {formMode && (
        <section style={{ ...boxStyle, backgroundColor: "#fff9e6", border: "2px solid #2f5f4a" }}>
          <h3 style={{ marginTop: 0 }}>
            {formMode === "create" ? "Create New Account" : "Edit Account"}
          </h3>

          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "1fr 1fr", marginBottom: "16px" }}>
            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                Code <span style={{ color: "#8d2626" }}>*</span>
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                style={{ ...inputStyle, width: "100%" }}
                placeholder="e.g., 1000, CASH-01"
              />
              {formErrors.code && (
                <small style={{ color: "#8d2626", fontSize: "11px" }}>{formErrors.code}</small>
              )}
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                Name <span style={{ color: "#8d2626" }}>*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ ...inputStyle, width: "100%" }}
                placeholder="e.g., Cash in Bank"
              />
              {formErrors.name && (
                <small style={{ color: "#8d2626", fontSize: "11px" }}>{formErrors.name}</small>
              )}
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                Parent Account
              </label>
              <select
                value={formData.parent_account_id ?? ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    parent_account_id: e.target.value ? Number(e.target.value) : null
                  })
                }
                style={{ ...inputStyle, width: "100%" }}
              >
                <option value="">None (Top Level)</option>
                {flatAccounts
                  .filter((acc) => formMode === "edit" ? acc.id !== editingId : true)
                  .map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.code} - {acc.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                Account Type (Optional)
              </label>
              <select
                value={formData.account_type_id ?? ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    account_type_id: e.target.value ? Number(e.target.value) : null
                  })
                }
                style={{ ...inputStyle, width: "100%" }}
                disabled={accountTypesLoading}
              >
                <option value="">None (No Type)</option>
                {accountTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.category ? `[${type.category}] ` : ""}{type.name}
                    {type.normal_balance && ` [${type.normal_balance}]`}
                    {type.report_group && ` - ${type.report_group}`}
                  </option>
                ))}
              </select>
              <small style={{ color: "#6b5d48", fontSize: "11px", display: "block", marginTop: "2px" }}>
                {accountTypesLoading ? "Loading account types..." : "Select a predefined account type"}
              </small>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                Normal Balance
              </label>
              <select
                value={formData.normal_balance ?? ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    normal_balance: e.target.value ? (e.target.value as NormalBalance) : null
                  })
                }
                style={{ ...inputStyle, width: "100%" }}
              >
                <option value="">None</option>
                <option value="D">D (Debit)</option>
                <option value="K">K (Kredit/Credit)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                Report Group
              </label>
              <select
                value={formData.report_group ?? ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    report_group: e.target.value ? (e.target.value as ReportGroup) : null
                  })
                }
                style={{ ...inputStyle, width: "100%" }}
              >
                <option value="">None</option>
                <option value="NRC">NRC (Neraca/Balance Sheet)</option>
                <option value="LR">LR (Laba Rugi/P&L)</option>
              </select>
            </div>

            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold" }}>
                <input
                  type="checkbox"
                  checked={formData.is_group}
                  onChange={(e) => setFormData({ ...formData, is_group: e.target.checked })}
                />
                Is Group Account
              </label>
              <small style={{ color: "#6b5d48", fontSize: "11px", display: "block", marginTop: "4px" }}>
                Group accounts can have child accounts
              </small>
            </div>

            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold" }}>
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                />
                Active
              </label>
            </div>

            <div>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: "bold" }}>
                <input
                  type="checkbox"
                  checked={formData.is_payable}
                  onChange={(e) => setFormData({ ...formData, is_payable: e.target.checked })}
                />
                Payment Destination
              </label>
              <small style={{ color: "#6b5d48", fontSize: "11px", display: "block", marginTop: "4px" }}>
                Allow this account to receive POS and sales payments
              </small>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitLoading}
              style={primaryButtonStyle}
            >
              {submitLoading ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={closeForm} style={buttonStyle} disabled={submitLoading}>
              Cancel
            </button>
          </div>
        </section>
      )}

      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Accounts Tree</h3>
        
        {filteredTree.length === 0 ? (
          <p style={{ color: "#6b5d48", textAlign: "center", padding: "20px" }}>
            No accounts found. {searchTerm || reportGroupFilter !== "ALL" ? "Try adjusting your filters." : "Create your first account to get started."}
          </p>
        ) : (
          <div style={{ border: "1px solid #e2ddd2", borderRadius: "6px", overflow: "hidden" }}>
            {filteredTree.map((node) => renderTreeNode(node, 0))}
          </div>
        )}
      </section>

      <section style={boxStyle}>
        <strong>Summary</strong>
        <p style={{ marginBottom: 0 }}>
          Loaded {flatAccounts.length} accounts total.
          {searchTerm || reportGroupFilter !== "ALL"
            ? ` Showing ${filteredTree.length} after filters.`
            : ""}
        </p>
      </section>
    </div>
  );
}
