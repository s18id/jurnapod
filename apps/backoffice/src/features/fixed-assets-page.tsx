import { useEffect, useMemo, useState } from "react";
import type { SessionUser } from "../lib/session";
import { apiRequest, ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import { OfflinePage } from "../components/offline-page";

type FixedAsset = {
  id: number;
  company_id: number;
  outlet_id: number | null;
  asset_tag: string | null;
  name: string;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  is_active: boolean;
  updated_at: string;
};

type DepreciationPlan = {
  id: number;
  company_id: number;
  asset_id: number;
  outlet_id: number | null;
  method: "STRAIGHT_LINE";
  start_date: string;
  useful_life_months: number;
  salvage_value: number;
  purchase_cost_snapshot: number;
  expense_account_id: number;
  accum_depr_account_id: number;
  status: "DRAFT" | "ACTIVE" | "VOID";
  created_at: string;
  updated_at: string;
} | null;

type DepreciationRun = {
  id: number;
  company_id: number;
  plan_id: number;
  period_year: number;
  period_month: number;
  run_date: string;
  amount: number;
  journal_batch_id: number | null;
  status: "POSTED" | "VOID";
  created_at: string;
  updated_at: string;
};

type FixedAssetPageProps = {
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

type FixedAssetFormState = {
  outlet_id: number | null;
  asset_tag: string;
  name: string;
  serial_number: string;
  purchase_date: string;
  purchase_cost: string;
  is_active: boolean;
};

const emptyForm: FixedAssetFormState = {
  outlet_id: null,
  asset_tag: "",
  name: "",
  serial_number: "",
  purchase_date: "",
  purchase_cost: "",
  is_active: true
};

type OutletFilter = "ALL" | "UNASSIGNED" | number;

export function FixedAssetPage(props: FixedAssetPageProps) {
  const isOnline = useOnlineStatus();
  const [asset, setFixedAsset] = useState<FixedAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FixedAssetFormState>(emptyForm);
  const [showInactive, setShowInactive] = useState(false);
  const [outletFilter, setOutletFilter] = useState<OutletFilter>("ALL");
  const [selectedFixedAssetId, setSelectedFixedAssetId] = useState<number | null>(null);
  const [depreciationPlan, setDepreciationPlan] = useState<DepreciationPlan>(null);
  const [planFormVisible, setPlanFormVisible] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [runPeriodYear, setRunPeriodYear] = useState("");
  const [runPeriodMonth, setRunPeriodMonth] = useState("");
  const [runLoading, setRunLoading] = useState(false);

  const outletOptions = useMemo(() => props.user.outlets ?? [], [props.user.outlets]);

  async function refreshFixedAsset(filter: OutletFilter) {
    setLoading(true);
    setError(null);

    try {
      const query =
        typeof filter === "number" ? `?outlet_id=${filter}` : "";
      const response = await apiRequest<{ ok: true; asset: FixedAsset[] }>(
        `/asset${query}`,
        {},
        props.accessToken
      );
      setFixedAsset(response.asset);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load asset");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOnline) {
      refreshFixedAsset(outletFilter).catch(() => undefined);
    }
  }, [isOnline, outletFilter]);

  async function handleCreateFixedAsset() {
    if (!formState.name.trim()) {
      setError("FixedAsset name is required");
      return;
    }

    try {
      setError(null);
      await apiRequest(
        "/asset",
        {
          method: "POST",
          body: JSON.stringify({
            outlet_id: formState.outlet_id,
            asset_tag: formState.asset_tag.trim() || null,
            name: formState.name.trim(),
            serial_number: formState.serial_number.trim() || null,
            purchase_date: formState.purchase_date.trim() || null,
            purchase_cost: formState.purchase_cost.trim()
              ? Number(formState.purchase_cost)
              : null,
            is_active: formState.is_active
          })
        },
        props.accessToken
      );
      setFormState(emptyForm);
      await refreshFixedAsset(outletFilter);
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      } else {
        setError("Failed to create asset");
      }
    }
  }

  async function handleSaveFixedAsset(item: FixedAsset) {
    try {
      setError(null);
      await apiRequest(
        `/asset/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            outlet_id: item.outlet_id,
            asset_tag: item.asset_tag,
            name: item.name,
            serial_number: item.serial_number,
            purchase_date: item.purchase_date,
            purchase_cost: item.purchase_cost,
            is_active: item.is_active
          })
        },
        props.accessToken
      );
      await refreshFixedAsset(outletFilter);
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      } else {
        setError("Failed to update asset");
      }
    }
  }

  async function handleDeleteFixedAsset(assetId: number) {
    if (!globalThis.confirm("Delete this asset record?")) {
      return;
    }

    try {
      setError(null);
      await apiRequest(`/asset/${assetId}`, { method: "DELETE" }, props.accessToken);
      await refreshFixedAsset(outletFilter);
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("Failed to delete asset");
      }
    }
  }

  async function loadDepreciationPlan(assetId: number) {
    try {
      setError(null);
      const response = await apiRequest<{ ok: true; plan: DepreciationPlan }>(
        `/asset/${assetId}/depreciation-plan`,
        {},
        props.accessToken
      );
      setDepreciationPlan(response.plan);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load depreciation plan");
      }
    }
  }

  async function loadAccounts() {
    try {
      const response = await apiRequest<{ ok: true; accounts: Array<{ id: number; code: string; name: string }> }>(
        `/accounts?company_id=${props.user.company_id}`,
        {},
        props.accessToken
      );
      setAccounts(response.accounts);
    } catch (err) {
      console.error("Failed to load accounts", err);
    }
  }

  async function handleShowDepreciationPlan(assetId: number) {
    setSelectedFixedAssetId(assetId);
    setPlanFormVisible(true);
    await loadDepreciationPlan(assetId);
    await loadAccounts();
  }

  async function handleSaveDepreciationPlan(assetId: number) {
    if (!depreciationPlan) {
      setError("No depreciation plan to save");
      return;
    }

    try {
      setError(null);
      if (depreciationPlan.id) {
        await apiRequest(
          `/asset/${assetId}/depreciation-plan`,
          {
            method: "PATCH",
            body: JSON.stringify({
              useful_life_months: depreciationPlan.useful_life_months,
              salvage_value: depreciationPlan.salvage_value,
              expense_account_id: depreciationPlan.expense_account_id,
              accum_depr_account_id: depreciationPlan.accum_depr_account_id,
              status: depreciationPlan.status
            })
          },
          props.accessToken
        );
      } else {
        await apiRequest(
          `/asset/${assetId}/depreciation-plan`,
          {
            method: "POST",
            body: JSON.stringify({
              asset_id: assetId,
              method: "STRAIGHT_LINE",
              useful_life_months: depreciationPlan.useful_life_months,
              salvage_value: depreciationPlan.salvage_value,
              expense_account_id: depreciationPlan.expense_account_id,
              accum_depr_account_id: depreciationPlan.accum_depr_account_id,
              status: depreciationPlan.status
            })
          },
          props.accessToken
        );
      }
      await loadDepreciationPlan(assetId);
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      } else {
        setError("Failed to save depreciation plan");
      }
    }
  }

  async function handleRunDepreciation() {
    if (!selectedFixedAssetId || !depreciationPlan) {
      setError("No asset or plan selected");
      return;
    }

    const year = Number(runPeriodYear);
    const month = Number(runPeriodMonth);
    if (!year || !month || month < 1 || month > 12) {
      setError("Invalid period year or month");
      return;
    }

    try {
      setError(null);
      setRunLoading(true);
      const response = await apiRequest<{ ok: true; duplicate: boolean; run: DepreciationRun }>(
        `/depreciation/run`,
        {
          method: "POST",
          body: JSON.stringify({
            plan_id: depreciationPlan.id,
            period_year: year,
            period_month: month
          })
        },
        props.accessToken
      );
      if (response.duplicate) {
        setError("Run already exists for this period");
      } else {
        setError(null);
        alert(`Depreciation run posted. Journal batch ID: ${response.run.journal_batch_id}`);
      }
    } catch (runError) {
      if (runError instanceof ApiError) {
        setError(runError.message);
      } else {
        setError("Failed to run depreciation");
      }
    } finally {
      setRunLoading(false);
    }
  }

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Master Data"
        message="FixedAsset changes require a connection."
      />
    );
  }

  const visibleFixedAsset = asset.filter((item) => {
    if (!showInactive && !item.is_active) {
      return false;
    }
    if (outletFilter === "UNASSIGNED") {
      return item.outlet_id == null;
    }
    return true;
  });

  return (
    <div>
      <section style={boxStyle}>
        <h2 style={{ marginTop: 0 }}>FixedAsset</h2>
        <p>Manage durable assets and outlet assignments.</p>
        {loading ? <p>Loading asset...</p> : null}
        {error ? <p style={{ color: "#8d2626" }}>{error}</p> : null}
      </section>

      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Create FixedAsset</h3>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-start" }}>
          <input
            placeholder="Name"
            value={formState.name}
            onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
            style={inputStyle}
          />
          <input
            placeholder="Asset tag"
            value={formState.asset_tag}
            onChange={(event) => setFormState((prev) => ({ ...prev, asset_tag: event.target.value }))}
            style={inputStyle}
          />
          <input
            placeholder="Serial number"
            value={formState.serial_number}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, serial_number: event.target.value }))
            }
            style={inputStyle}
          />
          <select
            value={formState.outlet_id ?? ""}
            onChange={(event) =>
              setFormState((prev) => ({
                ...prev,
                outlet_id: event.target.value ? Number(event.target.value) : null
              }))
            }
            style={inputStyle}
          >
            <option value="">Unassigned</option>
            {outletOptions.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.code} - {outlet.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Purchase date (YYYY-MM-DD)"
            value={formState.purchase_date}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, purchase_date: event.target.value }))
            }
            style={inputStyle}
          />
          <input
            placeholder="Purchase cost"
            value={formState.purchase_cost}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, purchase_cost: event.target.value }))
            }
            style={inputStyle}
          />
          <label>
            <input
              type="checkbox"
              checked={formState.is_active}
              onChange={(event) =>
                setFormState((prev) => ({
                  ...prev,
                  is_active: event.target.checked
                }))
              }
            />
            Active
          </label>
          <button type="button" onClick={handleCreateFixedAsset} style={primaryButtonStyle}>
            Add asset
          </button>
        </div>
      </section>

      <section style={boxStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>FixedAsset List</h3>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <select
              value={outletFilter === "ALL" || outletFilter === "UNASSIGNED" ? outletFilter : String(outletFilter)}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "ALL" || value === "UNASSIGNED") {
                  setOutletFilter(value);
                } else {
                  setOutletFilter(Number(value));
                }
              }}
              style={inputStyle}
            >
              <option value="ALL">All outlets</option>
              <option value="UNASSIGNED">Unassigned only</option>
              {outletOptions.map((outlet) => (
                <option key={outlet.id} value={String(outlet.id)}>
                  {outlet.code} - {outlet.name}
                </option>
              ))}
            </select>
            <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
              />
              Show Inactive
            </label>
          </div>
        </div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>ID</th>
              <th style={cellStyle}>Name</th>
              <th style={cellStyle}>Asset Tag</th>
              <th style={cellStyle}>Serial</th>
              <th style={cellStyle}>Outlet</th>
              <th style={cellStyle}>Purchase Date</th>
              <th style={cellStyle}>Cost</th>
              <th style={cellStyle}>Active</th>
              <th style={cellStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleFixedAsset.map((item) => (
              <tr key={item.id}>
                <td style={cellStyle}>{item.id}</td>
                <td style={cellStyle}>
                  <input
                    value={item.name}
                    onChange={(event) =>
                      setFixedAsset((prev) =>
                        prev.map((entry) =>
                          entry.id === item.id ? { ...entry, name: event.target.value } : entry
                        )
                      )
                    }
                    style={inputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    value={item.asset_tag ?? ""}
                    onChange={(event) =>
                      setFixedAsset((prev) =>
                        prev.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, asset_tag: event.target.value || null }
                            : entry
                        )
                      )
                    }
                    style={inputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    value={item.serial_number ?? ""}
                    onChange={(event) =>
                      setFixedAsset((prev) =>
                        prev.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, serial_number: event.target.value || null }
                            : entry
                        )
                      )
                    }
                    style={inputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <select
                    value={item.outlet_id ?? ""}
                    onChange={(event) =>
                      setFixedAsset((prev) =>
                        prev.map((entry) =>
                          entry.id === item.id
                            ? {
                                ...entry,
                                outlet_id: event.target.value ? Number(event.target.value) : null
                              }
                            : entry
                        )
                      )
                    }
                    style={inputStyle}
                  >
                    <option value="">Unassigned</option>
                    {outletOptions.map((outlet) => (
                      <option key={outlet.id} value={outlet.id}>
                        {outlet.code} - {outlet.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={cellStyle}>
                  <input
                    value={item.purchase_date ?? ""}
                    onChange={(event) =>
                      setFixedAsset((prev) =>
                        prev.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, purchase_date: event.target.value || null }
                            : entry
                        )
                      )
                    }
                    style={inputStyle}
                    placeholder="YYYY-MM-DD"
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    value={item.purchase_cost ?? ""}
                    onChange={(event) =>
                      setFixedAsset((prev) =>
                        prev.map((entry) =>
                          entry.id === item.id
                            ? {
                                ...entry,
                                purchase_cost: event.target.value
                                  ? Number(event.target.value)
                                  : null
                              }
                            : entry
                        )
                      )
                    }
                    style={inputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    type="checkbox"
                    checked={item.is_active}
                    onChange={(event) =>
                      setFixedAsset((prev) =>
                        prev.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, is_active: event.target.checked }
                            : entry
                        )
                      )
                    }
                  />
                </td>
                <td style={cellStyle}>
                  <button type="button" onClick={() => handleSaveFixedAsset(item)} style={buttonStyle}>
                    Save
                  </button>
                  <button type="button" onClick={() => handleDeleteFixedAsset(item.id)} style={buttonStyle}>
                    Delete
                  </button>
                  <button type="button" onClick={() => handleShowDepreciationPlan(item.id)} style={buttonStyle}>
                    Depreciation
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleFixedAsset.length === 0 ? <p>No asset available.</p> : null}
      </section>

      <section style={boxStyle}>
        <strong>Quick checks</strong>
        <p style={{ marginBottom: 0 }}>Loaded {asset.length} asset records.</p>
      </section>

      {planFormVisible && selectedFixedAssetId && (
        <section style={boxStyle}>
          <h3 style={{ marginTop: 0 }}>Depreciation Plan</h3>
          <p>FixedAsset ID: {selectedFixedAssetId}</p>
          {depreciationPlan ? (
            <div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", marginBottom: "4px" }}>Useful Life (Months)</label>
                <input
                  type="number"
                  value={depreciationPlan.useful_life_months}
                  onChange={(e) =>
                    setDepreciationPlan({ ...depreciationPlan, useful_life_months: Number(e.target.value) })
                  }
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", marginBottom: "4px" }}>Salvage Value</label>
                <input
                  type="number"
                  value={depreciationPlan.salvage_value}
                  onChange={(e) =>
                    setDepreciationPlan({ ...depreciationPlan, salvage_value: Number(e.target.value) })
                  }
                  style={inputStyle}
                />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", marginBottom: "4px" }}>Expense Account</label>
                <select
                  value={depreciationPlan.expense_account_id}
                  onChange={(e) =>
                    setDepreciationPlan({ ...depreciationPlan, expense_account_id: Number(e.target.value) })
                  }
                  style={inputStyle}
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", marginBottom: "4px" }}>Accumulated Depreciation Account</label>
                <select
                  value={depreciationPlan.accum_depr_account_id}
                  onChange={(e) =>
                    setDepreciationPlan({ ...depreciationPlan, accum_depr_account_id: Number(e.target.value) })
                  }
                  style={inputStyle}
                >
                  <option value="">Select account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", marginBottom: "4px" }}>Status</label>
                <select
                  value={depreciationPlan.status}
                  onChange={(e) =>
                    setDepreciationPlan({
                      ...depreciationPlan,
                      status: e.target.value as "DRAFT" | "ACTIVE" | "VOID"
                    })
                  }
                  style={inputStyle}
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="VOID">VOID</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => handleSaveDepreciationPlan(selectedFixedAssetId)}
                style={primaryButtonStyle}
              >
                Save Plan
              </button>
              <button type="button" onClick={() => setPlanFormVisible(false)} style={buttonStyle}>
                Close
              </button>
              {depreciationPlan.status === "ACTIVE" && (
                <div style={{ marginTop: "16px", borderTop: "1px solid #e2ddd2", paddingTop: "16px" }}>
                  <h4 style={{ marginTop: 0 }}>Run Depreciation</h4>
                  <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                    <div>
                      <label style={{ display: "block", marginBottom: "4px" }}>Year</label>
                      <input
                        type="number"
                        value={runPeriodYear}
                        onChange={(e) => setRunPeriodYear(e.target.value)}
                        placeholder="2026"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", marginBottom: "4px" }}>Month</label>
                      <input
                        type="number"
                        value={runPeriodMonth}
                        onChange={(e) => setRunPeriodMonth(e.target.value)}
                        placeholder="1"
                        min="1"
                        max="12"
                        style={inputStyle}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleRunDepreciation}
                      disabled={runLoading}
                      style={primaryButtonStyle}
                    >
                      {runLoading ? "Running..." : "Run Period"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p>No depreciation plan exists. Create one:</p>
              <button
                type="button"
                onClick={() => {
                  const selectedFixedAsset = asset.find((e) => e.id === selectedFixedAssetId);
                  setDepreciationPlan({
                    id: 0,
                    company_id: props.user.company_id,
                    asset_id: selectedFixedAssetId,
                    outlet_id: selectedFixedAsset?.outlet_id ?? null,
                    method: "STRAIGHT_LINE",
                    start_date: selectedFixedAsset?.purchase_date ?? "",
                    useful_life_months: 60,
                    salvage_value: 0,
                    purchase_cost_snapshot: selectedFixedAsset?.purchase_cost ?? 0,
                    expense_account_id: 0,
                    accum_depr_account_id: 0,
                    status: "DRAFT",
                    created_at: "",
                    updated_at: ""
                  });
                }}
                style={primaryButtonStyle}
              >
                Create Plan
              </button>
              <button type="button" onClick={() => setPlanFormVisible(false)} style={buttonStyle}>
                Close
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
