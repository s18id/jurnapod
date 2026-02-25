import { useEffect, useMemo, useState } from "react";
import type { SessionUser } from "../lib/session";
import { useAccounts } from "../hooks/use-accounts";
import { useJournalBatches, createManualJournalEntry } from "../hooks/use-journals";
import { ApiError } from "../lib/api-client";
import { OutboxService } from "../lib/outbox-service";
import { useOnlineStatus } from "../lib/connection";
import { QueueStatusBadge } from "../components/queue-status-badge";
import { db } from "../lib/offline-db";
import { ERROR_MESSAGES } from "../lib/error-messages";
import type { JournalBatchResponse } from "@jurnapod/shared";

type TransactionsPageProps = {
  user: SessionUser;
  accessToken: string;
};

type JournalLine = {
  id: string; // Temporary ID for UI
  account_id: number | null;
  entry_type?: "debit" | "credit";
  debit: number;
  credit: number;
  description: string;
};

type TransactionTemplate = {
  id: string;
  name: string;
  description: string;
  lines: JournalLine[];
  createdAt: string;
  updatedAt: string;
};

const emptyLine: JournalLine = {
  id: "",
  account_id: null,
  entry_type: "debit",
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

function getLineType(line: JournalLine) {
  return line.entry_type ?? (line.credit > 0 ? "credit" : "debit");
}

function getLineAmount(line: JournalLine) {
  return getLineType(line) === "credit" ? line.credit : line.debit;
}

function getTemplatesKey(companyId: number) {
  return `transaction-templates:${companyId}`;
}

function normalizeLines(lines: JournalLine[]) {
  return lines.map((line) => {
    const inferredType = line.credit > 0 ? "credit" : "debit";
    return {
      ...line,
      entry_type: line.entry_type ?? inferredType,
      debit: line.debit ?? 0,
      credit: line.credit ?? 0
    };
  });
}

export function TransactionsPage({ user, accessToken }: TransactionsPageProps) {
  const companyId = user.company_id;
  const accountsFilter = useMemo(() => ({ is_active: true }), []);
  const journalFilter = useMemo(() => ({ limit: 10 }), []);
  const isOnline = useOnlineStatus();
  
  const { data: accounts } = useAccounts(companyId, accessToken, accountsFilter);
  const { data: recentEntries, refetch: refetchEntries } = useJournalBatches(companyId, accessToken, journalFilter);

  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<JournalLine[]>([
    { ...emptyLine, id: "1" },
    { ...emptyLine, id: "2" }
  ]);
  const [templates, setTemplates] = useState<TransactionTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitStatus, setSubmitStatus] = useState<"success" | "queued" | null>(null);
  const draftKey = `journal-draft:${user.id}`;

  // Calculate totals
  const totalDebit = lines.reduce((sum, line) => sum + (line.debit || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (line.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const difference = totalDebit - totalCredit;

  function updateLine(id: string, field: keyof JournalLine, value: any) {
    setLines(lines.map(line => line.id === id ? { ...line, [field]: value } : line));
  }

  function addLine() {
    const newId = String(Date.now());
    setLines([...lines, { ...emptyLine, id: newId }]);
  }

  function removeLine(id: string) {
    if (lines.length > 2) {
      setLines(lines.filter(line => line.id !== id));
    }
  }

  function clearForm() {
    setEntryDate(new Date().toISOString().split("T")[0]);
    setDescription("");
    setLines([
      { ...emptyLine, id: "1" },
      { ...emptyLine, id: "2" }
    ]);
    setSelectedTemplateId("");
    setTemplateNotice(null);
    setSubmitError(null);
    setSubmitStatus(null);
  }

  function applyTemplate(template: TransactionTemplate) {
    setLines(template.lines.map((line) => ({ ...line, id: createId() })));
    if (template.description) {
      setDescription(template.description);
    }
    setTemplateNotice(null);
    setSubmitError(null);
    setSubmitStatus(null);
  }

  function handleSaveAsTemplate() {
    const name = globalThis.prompt("Template name", description || "");
    if (!name || !name.trim()) {
      setSubmitError("Template name is required");
      return;
    }
    if (lines.length < 2) {
      setSubmitError("At least 2 lines required to save a template");
      return;
    }
    const missingAccounts = lines.some((line) => !line.account_id);
    if (missingAccounts) {
      setSubmitError("All lines must have an account selected before saving a template");
      return;
    }
    const invalidLine = lines.some((line) => line.debit > 0 && line.credit > 0);
    if (invalidLine) {
      setSubmitError("Lines cannot have both debit and credit amounts");
      return;
    }
    if (!isBalanced) {
      setSubmitError("Template lines must be balanced before saving");
      return;
    }

    const timestamp = new Date().toISOString();
    const newTemplate: TransactionTemplate = {
      id: createId(),
      name: name.trim(),
      description: description.trim(),
      lines,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    setTemplates((prev) => [newTemplate, ...prev]);
    setSelectedTemplateId(newTemplate.id);
    setTemplateNotice("Template saved");
    setSubmitError(null);
    setSubmitStatus(null);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadDraft() {
      const draft = await db.formDrafts.get(draftKey);
      if (!draft || !isMounted) {
        return;
      }
      const data = draft.data as {
        entryDate: string;
        description: string;
        lines: JournalLine[];
      };
      if (data.entryDate) {
        setEntryDate(data.entryDate);
      }
      if (data.description) {
        setDescription(data.description);
      }
      if (data.lines && data.lines.length > 0) {
        setLines(normalizeLines(data.lines));
      }
    }

    loadDraft().catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [draftKey]);

  useEffect(() => {
    const stored = globalThis.localStorage.getItem(getTemplatesKey(companyId));
    if (!stored) {
      setTemplates([]);
      return;
    }
    try {
      const parsed = JSON.parse(stored) as TransactionTemplate[];
      if (Array.isArray(parsed)) {
        setTemplates(parsed.map((template) => ({
          ...template,
          lines: normalizeLines(template.lines || [])
        })));
      } else {
        setTemplates([]);
      }
    } catch {
      setTemplates([]);
    }
  }, [companyId]);

  useEffect(() => {
    globalThis.localStorage.setItem(getTemplatesKey(companyId), JSON.stringify(templates));
  }, [companyId, templates]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (!description.trim()) {
        return;
      }
      db.formDrafts.put({
        id: draftKey,
        formType: "journal",
        data: {
          entryDate,
          description,
          lines
        },
        savedAt: new Date(),
        userId: user.id
      }).catch(() => undefined);
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [draftKey, entryDate, description, lines, user.id]);


  // Quick templates
  function loadExpenseTemplate() {
    const expenseAccounts = accounts.filter(acc => 
      acc.type_name?.toLowerCase().includes("beban") || 
      acc.name.toLowerCase().includes("expense")
    );
    const cashAccounts = accounts.filter(acc => 
      acc.type_name?.toLowerCase().includes("kas") || 
      acc.name.toLowerCase().includes("cash")
    );

    setLines([
      { ...emptyLine, id: "1", account_id: expenseAccounts[0]?.id || null, entry_type: "debit", debit: 0, description: "Expense" },
      { ...emptyLine, id: "2", account_id: cashAccounts[0]?.id || null, entry_type: "credit", credit: 0, description: "Payment" }
    ]);
    setDescription("Expense payment");
  }

  function loadBankTransferTemplate() {
    const cashAccounts = accounts.filter(acc => 
      acc.type_name?.toLowerCase().includes("kas") || 
      acc.name.toLowerCase().includes("cash")
    );
    const bankAccounts = accounts.filter(acc => 
      acc.type_name?.toLowerCase().includes("bank") || 
      acc.name.toLowerCase().includes("bank")
    );

    setLines([
      { ...emptyLine, id: "1", account_id: bankAccounts[0]?.id || null, entry_type: "debit", debit: 0, description: "Deposit to bank" },
      { ...emptyLine, id: "2", account_id: cashAccounts[0]?.id || null, entry_type: "credit", credit: 0, description: "From cash" }
    ]);
    setDescription("Cash to bank transfer");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Validation
    if (!description.trim()) {
      setSubmitError("Description is required");
      return;
    }

    if (lines.length < 2) {
      setSubmitError("At least 2 lines required");
      return;
    }

    if (!isBalanced) {
      setSubmitError("Entry is not balanced. Debits must equal credits");
      return;
    }

    // Check all lines have account selected
    const invalidLines = lines.filter(line => !line.account_id);
    if (invalidLines.length > 0) {
      setSubmitError("All lines must have an account selected");
      return;
    }

    // Check all lines have either debit or credit
    const emptyLines = lines.filter(line => line.debit === 0 && line.credit === 0);
    if (emptyLines.length > 0) {
      setSubmitError("All lines must have either debit or credit amount");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitStatus(null);

    try {
      const payload = {
        company_id: companyId,
        entry_date: entryDate,
        description,
        lines: lines.map(line => ({
          account_id: line.account_id!,
          debit: line.debit || 0,
          credit: line.credit || 0,
          description: line.description || description
        }))
      };

      if (isOnline) {
        await createManualJournalEntry(payload, accessToken);
        setSubmitStatus("success");
        setTimeout(() => {
          clearForm();
          refetchEntries();
        }, 1500);
      } else {
        await OutboxService.queueTransaction("journal", payload, user.id);
        setSubmitStatus("queued");
        setTimeout(() => {
          clearForm();
        }, 1500);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError(isOnline ? ERROR_MESSAGES.SERVER_ERROR : ERROR_MESSAGES.NETWORK_ERROR);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: "20px", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ marginBottom: "8px" }}>
          Transaction Input
          <QueueStatusBadge accessToken={accessToken} />
        </h1>
        <p style={{ color: "#666", margin: 0 }}>
          Create manual journal entries for expenses, transfers, and adjustments
        </p>
      </div>

      {/* Quick Templates */}
      <div style={boxStyle}>
        <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Quick Templates</h3>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "8px" }}>
          <select
            value={selectedTemplateId}
            onChange={(e) => {
              const nextId = e.target.value;
              setSelectedTemplateId(nextId);
              const selected = templates.find((template) => template.id === nextId);
              if (selected) {
                applyTemplate(selected);
              }
            }}
            style={{ ...selectStyle, width: "240px" }}
          >
            <option value="">Apply saved template...</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <a
            href="#/transaction-templates"
            title="Manage templates"
            aria-label="Manage templates"
            style={{ ...buttonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center" }}
          >
            ⚙️
          </a>
          <button type="button" onClick={handleSaveAsTemplate} style={buttonStyle}>
            ⭐ Save Template
          </button>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={loadExpenseTemplate} style={buttonStyle}>
            💰 Expense Payment
          </button>
          <button onClick={loadBankTransferTemplate} style={buttonStyle}>
            🏦 Bank Transfer
          </button>
          <button onClick={clearForm} style={buttonStyle}>
            🔄 Clear Form
          </button>
        </div>
        {templateNotice ? (
          <p style={{ margin: "10px 0 0", color: "#155724" }}>{templateNotice}</p>
        ) : null}
      </div>

      {/* Entry Form */}
      <form onSubmit={handleSubmit}>
        <div style={boxStyle}>
          <h3 style={{ marginTop: 0, marginBottom: "16px" }}>Journal Entry Details</h3>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "16px", marginBottom: "16px" }}>
            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                Date *
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
                style={inputStyle}
              />
            </div>
            
            <div>
              <label style={{ display: "block", marginBottom: "4px", fontWeight: "bold" }}>
                Description *
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Office supplies purchase"
                required
                style={inputStyle}
              />
            </div>
          </div>

          {/* Journal Lines */}
          <h4 style={{ marginBottom: "8px" }}>Journal Lines</h4>
          <table style={tableStyle}>
            <thead>
              <tr style={{ backgroundColor: "#f5f1ea" }}>
                <th style={{ ...cellStyle, textAlign: "left", width: "35%" }}>Account</th>
                <th style={{ ...cellStyle, textAlign: "left", width: "12%" }}>Type</th>
                <th style={{ ...cellStyle, textAlign: "right", width: "18%" }}>Amount</th>
                <th style={{ ...cellStyle, textAlign: "left", width: "30%" }}>Description</th>
                <th style={{ ...cellStyle, textAlign: "center", width: "5%" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                
                <tr key={line.id}>
                  <td style={cellStyle}>
                    <select
                      value={line.account_id || ""}
                      onChange={(e) => updateLine(line.id, "account_id", parseInt(e.target.value) || null)}
                      style={selectStyle}
                      required
                    >
                      <option value="">- Select Account -</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={cellStyle}>
                    <select
                      value={getLineType(line)}
                      onChange={(e) => {
                        const nextType = e.target.value as "debit" | "credit";
                        const amount = getLineAmount(line);
                        updateLine(line.id, "entry_type", nextType);
                        if (nextType === "debit") {
                          updateLine(line.id, "debit", amount);
                          updateLine(line.id, "credit", 0);
                        } else {
                          updateLine(line.id, "credit", amount);
                          updateLine(line.id, "debit", 0);
                        }
                      }}
                      style={selectStyle}
                      aria-label={`Line ${index + 1} type`}
                    >
                      <option value="debit">Debit</option>
                      <option value="credit">Credit</option>
                    </select>
                  </td>
                  <td style={cellStyle}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={getLineAmount(line) === 0 ? "" : getLineAmount(line)}
                      onChange={(e) => {
                        const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          const nextType = getLineType(line);
                          updateLine(line.id, "entry_type", nextType);
                          if (nextType === "debit") {
                            updateLine(line.id, "debit", val);
                            updateLine(line.id, "credit", 0);
                          } else {
                            updateLine(line.id, "credit", val);
                            updateLine(line.id, "debit", 0);
                          }
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
                    <span style={{ color: "#721c24" }}>
                      ✗ Difference: {difference.toFixed(2)}
                    </span>
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

          {submitError && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                backgroundColor: "#f8d7da",
                color: "#721c24",
                borderRadius: "6px"
              }}
            >
              {submitError}
            </div>
          )}

          {submitStatus && (
            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                backgroundColor: submitStatus === "success" ? "#d4edda" : "#fff3cd",
                color: submitStatus === "success" ? "#155724" : "#856404",
                borderRadius: "6px"
              }}
            >
              {submitStatus === "success"
                ? "✓ Journal entry created successfully!"
                : "⏳ Journal entry saved to queue. Will sync when online."}
            </div>
          )}

          <div style={{ marginTop: "16px", display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" onClick={clearForm} style={buttonStyle} disabled={submitting}>
              Clear
            </button>
            <button type="submit" style={primaryButtonStyle} disabled={submitting || !isBalanced}>
              {submitting ? "Saving..." : "Create Journal Entry"}
            </button>
          </div>
        </div>
      </form>

      {/* Recent Entries */}
      <div style={boxStyle}>
        <h3 style={{ marginTop: 0, marginBottom: "12px" }}>Recent Entries (Last 10)</h3>
        {recentEntries.length === 0 ? (
          <p style={{ margin: 0, color: "#666", textAlign: "center" }}>No entries yet</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={{ backgroundColor: "#f5f1ea" }}>
                <th style={{ ...cellStyle, textAlign: "left" }}>Date</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>Type</th>
                <th style={{ ...cellStyle, textAlign: "left" }}>ID</th>
                <th style={{ ...cellStyle, textAlign: "right" }}>Lines</th>
              </tr>
            </thead>
            <tbody>
              {recentEntries.map((entry: JournalBatchResponse) => (
                <tr key={entry.id}>
                  <td style={cellStyle}>{new Date(entry.posted_at).toLocaleDateString()}</td>
                  <td style={cellStyle}>{entry.doc_type}</td>
                  <td style={cellStyle}>#{entry.id}</td>
                  <td style={{ ...cellStyle, textAlign: "right" }}>{entry.lines?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
