// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import type { SessionUser } from "../lib/session";
import { useAccounts } from "../hooks/use-accounts";
import type { AccountResponse } from "@jurnapod/shared";

type TransactionTemplatesPageProps = {
  user: SessionUser;
  accessToken: string;
};

type TemplateLine = {
  id: string;
  account_id: number | null;
  debit: number;
  credit: number;
  description: string;
};

type TransactionTemplate = {
  id: string;
  name: string;
  description: string;
  lines: TemplateLine[];
  createdAt: string;
  updatedAt: string;
};

const emptyLine: TemplateLine = {
  id: "",
  account_id: null,
  debit: 0,
  credit: 0,
  description: ""
};

const boxStyle = {
  border: "1px solid #e2ddd2",
  borderRadius: "10px",
  padding: "16px",
  backgroundColor: "#fcfbf8",
  marginBottom: "14px"
} as const;

const inputStyle = {
  border: "1px solid #cabfae",
  borderRadius: "6px",
  padding: "6px 8px",
  width: "100%"
} as const;

const selectStyle = {
  ...inputStyle
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

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const
};

const cellStyle = {
  borderBottom: "1px solid #ece7dc",
  padding: "8px"
} as const;

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function getStorageKey(companyId: number) {
  return `transaction-templates:${companyId}`;
}

function formatAccountLabel(account: AccountResponse) {
  return `${account.code} - ${account.name}`;
}

export function TransactionTemplatesPage({ user, accessToken }: TransactionTemplatesPageProps) {
  const companyId = user.company_id;
  const accountsFilter = useMemo(() => ({ is_active: true }), []);
  const { data: accounts } = useAccounts(companyId, accessToken, accountsFilter);

  const [templates, setTemplates] = useState<TransactionTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [lines, setLines] = useState<TemplateLine[]>([
    { ...emptyLine, id: "1" },
    { ...emptyLine, id: "2" }
  ]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const totalDebit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const difference = totalDebit - totalCredit;

  useEffect(() => {
    const stored = globalThis.localStorage.getItem(getStorageKey(companyId));
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored) as TransactionTemplate[];
      if (Array.isArray(parsed)) {
        setTemplates(parsed);
      }
    } catch {
      setTemplates([]);
    }
  }, [companyId]);

  useEffect(() => {
    globalThis.localStorage.setItem(getStorageKey(companyId), JSON.stringify(templates));
  }, [companyId, templates]);

  function updateLine(id: string, field: keyof TemplateLine, value: any) {
    setLines(lines.map((line) => (line.id === id ? { ...line, [field]: value } : line)));
  }

  function addLine() {
    const newId = createId();
    setLines([...lines, { ...emptyLine, id: newId }]);
  }

  function removeLine(id: string) {
    if (lines.length > 2) {
      setLines(lines.filter((line) => line.id !== id));
    }
  }

  function resetForm() {
    setTemplateName("");
    setTemplateDescription("");
    setLines([
      { ...emptyLine, id: "1" },
      { ...emptyLine, id: "2" }
    ]);
    setEditingId(null);
    setFormError(null);
  }

  function validateTemplate() {
    if (!templateName.trim()) {
      setFormError("Template name is required");
      return false;
    }
    if (lines.length < 2) {
      setFormError("At least 2 lines required");
      return false;
    }
    const missingAccounts = lines.some((line) => !line.account_id);
    if (missingAccounts) {
      setFormError("All lines must have an account selected");
      return false;
    }
    const hasInvalidLine = lines.some((line) => line.debit > 0 && line.credit > 0);
    if (hasInvalidLine) {
      setFormError("Lines cannot have both debit and credit amounts");
      return false;
    }
    setFormError(null);
    return true;
  }

  function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!validateTemplate()) {
      return;
    }

    const timestamp = new Date().toISOString();
    if (editingId) {
      setTemplates((prev) =>
        prev.map((template) =>
          template.id === editingId
            ? {
                ...template,
                name: templateName.trim(),
                description: templateDescription.trim(),
                lines,
                updatedAt: timestamp
              }
            : template
        )
      );
    } else {
      const newTemplate: TransactionTemplate = {
        id: createId(),
        name: templateName.trim(),
        description: templateDescription.trim(),
        lines,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      setTemplates((prev) => [newTemplate, ...prev]);
    }

    resetForm();
  }

  function handleEditTemplate(template: TransactionTemplate) {
    setTemplateName(template.name);
    setTemplateDescription(template.description);
    setLines(template.lines.map((line) => ({ ...line, id: createId() })));
    setEditingId(template.id);
    setFormError(null);
  }

  function handleDuplicateTemplate(template: TransactionTemplate) {
    const timestamp = new Date().toISOString();
    const duplicated: TransactionTemplate = {
      ...template,
      id: createId(),
      name: `${template.name} (Copy)`,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    setTemplates((prev) => [duplicated, ...prev]);
  }

  function handleDeleteTemplate(templateId: string) {
    setTemplates((prev) => prev.filter((template) => template.id !== templateId));
    if (editingId === templateId) {
      resetForm();
    }
  }

  function getAccountLabel(accountId: number | null) {
    const match = accounts.find((account) => account.id === accountId);
    return match ? formatAccountLabel(match) : "Unknown account";
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ marginBottom: "8px" }}>Transaction Templates</h1>
        <p style={{ color: "#666", margin: 0 }}>
          Create reusable templates for manual journal entries. Templates are stored locally in this browser.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "16px" }}>
        <form onSubmit={handleSaveTemplate} style={boxStyle}>
          <h3 style={{ marginTop: 0, marginBottom: "16px" }}>
            {editingId ? "Edit Template" : "Create Template"}
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "16px", marginBottom: "16px" }}>
            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                Template Name *
              </label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Monthly Rent"
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                Description
              </label>
              <input
                type="text"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Short note for this template"
                style={inputStyle}
              />
            </div>
          </div>

          <h4 style={{ marginBottom: "8px" }}>Template Lines</h4>
          <table style={tableStyle}>
            <thead>
              <tr style={{ backgroundColor: "#f5f1ea" }}>
                <th style={{ ...cellStyle, textAlign: "left", width: "35%" }}>Account</th>
                <th style={{ ...cellStyle, textAlign: "right", width: "15%" }}>Debit</th>
                <th style={{ ...cellStyle, textAlign: "right", width: "15%" }}>Credit</th>
                <th style={{ ...cellStyle, textAlign: "left", width: "30%" }}>Description</th>
                <th style={{ ...cellStyle, textAlign: "center", width: "5%" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id}>
                  <td style={cellStyle}>
                    <select
                      value={line.account_id || ""}
                      onChange={(e) => updateLine(line.id, "account_id", parseInt(e.target.value) || null)}
                      style={selectStyle}
                      required
                    >
                      <option value="">- Select Account -</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {formatAccountLabel(account)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={cellStyle}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.debit === 0 ? "" : line.debit}
                      onChange={(e) => {
                        const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          updateLine(line.id, "debit", val);
                          if (val > 0) updateLine(line.id, "credit", 0);
                        }
                      }}
                      style={{ ...inputStyle, textAlign: "right" }}
                      placeholder="0.00"
                    />
                  </td>
                  <td style={cellStyle}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.credit === 0 ? "" : line.credit}
                      onChange={(e) => {
                        const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          updateLine(line.id, "credit", val);
                          if (val > 0) updateLine(line.id, "debit", 0);
                        }
                      }}
                      style={{ ...inputStyle, textAlign: "right" }}
                      placeholder="0.00"
                    />
                  </td>
                  <td style={cellStyle}>
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLine(line.id, "description", e.target.value)}
                      placeholder="Line description (optional)"
                      style={inputStyle}
                    />
                  </td>
                  <td style={{ ...cellStyle, textAlign: "center" }}>
                    {lines.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        style={{ ...dangerButtonStyle, padding: "4px 8px", fontSize: "12px" }}
                      >
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: "#f5f1ea", fontWeight: "bold" }}>
                <td style={cellStyle}>TOTAL</td>
                <td style={{ ...cellStyle, textAlign: "right" }}>{totalDebit.toFixed(2)}</td>
                <td style={{ ...cellStyle, textAlign: "right" }}>{totalCredit.toFixed(2)}</td>
                <td style={cellStyle}>
                  {isBalanced ? (
                    <span style={{ color: "#155724" }}>✓ Balanced</span>
                  ) : (
                    <span style={{ color: "#721c24" }}>✗ Difference: {difference.toFixed(2)}</span>
                  )}
                </td>
                <td style={cellStyle}></td>
              </tr>
            </tfoot>
          </table>

          <div style={{ marginTop: "12px" }}>
            <button type="button" onClick={addLine} style={buttonStyle}>
              + Add Line
            </button>
          </div>

          {formError && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                backgroundColor: "#f8d7da",
                color: "#721c24",
                borderRadius: "6px"
              }}
            >
              {formError}
            </div>
          )}

          <div style={{ marginTop: "16px", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" onClick={resetForm} style={buttonStyle}>
              Clear
            </button>
            <button type="submit" style={primaryButtonStyle}>
              {editingId ? "Update Template" : "Save Template"}
            </button>
          </div>
        </form>

        <div style={boxStyle}>
          <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Saved Templates</h3>
          {templates.length === 0 ? (
            <p style={{ margin: 0, color: "#666", textAlign: "center" }}>No templates yet</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {templates.map((template) => (
                <section key={template.id} style={{ border: "1px solid #ece7dc", borderRadius: "8px", padding: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <h4 style={{ margin: 0 }}>{template.name}</h4>
                      {template.description ? (
                        <p style={{ margin: "4px 0", color: "#666" }}>{template.description}</p>
                      ) : null}
                      <p style={{ margin: "4px 0", color: "#888", fontSize: "12px" }}>
                        {template.lines.length} lines • Updated {new Date(template.updatedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div style={{ marginTop: "8px" }}>
                    <ul style={{ margin: 0, paddingLeft: "18px", color: "#555" }}>
                      {template.lines.map((line) => (
                        <li key={line.id}>
                          {getAccountLabel(line.account_id)}
                          {line.debit > 0 ? ` • Dr ${line.debit.toFixed(2)}` : ""}
                          {line.credit > 0 ? ` • Cr ${line.credit.toFixed(2)}` : ""}
                          {line.description ? ` • ${line.description}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    <button type="button" onClick={() => handleEditTemplate(template)} style={buttonStyle}>
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDuplicateTemplate(template)} style={buttonStyle}>
                      Duplicate
                    </button>
                    <button type="button" onClick={() => handleDeleteTemplate(template.id)} style={dangerButtonStyle}>
                      Delete
                    </button>
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
