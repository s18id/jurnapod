import { useEffect, useMemo, useState } from "react";
import type { SessionUser } from "../lib/session";
import { apiRequest, ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import { OfflinePage } from "../components/offline-page";

type FixedAsset = {
  id: number;
  company_id: number;
  outlet_id: number | null;
  category_id: number | null;
  asset_tag: string | null;
  name: string;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  is_active: boolean;
  updated_at: string;
};

type FixedAssetCategory = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  depreciation_method: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS";
  useful_life_months: number;
  residual_value_pct: number;
  expense_account_id: number | null;
  accum_depr_account_id: number | null;
  is_active: boolean;
  updated_at: string;
};

type DepreciationPlan = {
  id: number;
  company_id: number;
  asset_id: number;
  outlet_id: number | null;
  method: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS";
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

const drawerOverlayStyle = {
  position: "fixed" as const,
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.3)",
  zIndex: 50
};

const drawerStyle = {
  position: "fixed" as const,
  top: 0,
  right: 0,
  height: "100vh",
  width: "520px",
  maxWidth: "95vw",
  backgroundColor: "#fff",
  borderLeft: "1px solid #e2ddd2",
  boxShadow: "-12px 0 24px rgba(0, 0, 0, 0.12)",
  zIndex: 60,
  display: "flex",
  flexDirection: "column"
} as const;

const drawerHeaderStyle = {
  padding: "16px",
  borderBottom: "1px solid #ece7dc",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between"
} as const;

const drawerBodyStyle = {
  padding: "16px",
  overflowY: "auto" as const,
  display: "grid",
  gap: "12px"
};

const formFieldStyle = {
  display: "grid",
  gap: "6px",
  fontSize: "14px",
  color: "#3d3023"
} as const;

const drawerFooterStyle = {
  padding: "16px",
  borderTop: "1px solid #ece7dc",
  display: "flex",
  gap: "8px",
  justifyContent: "flex-end"
} as const;

type FixedAssetFormState = {
  outlet_id: number | null;
  category_id: number | null;
  asset_tag: string;
  name: string;
  serial_number: string;
  purchase_date: string;
  purchase_cost: string;
  is_active: boolean;
};

type FixedAssetEditState = FixedAssetFormState & {
  id: number;
};

const emptyForm: FixedAssetFormState = {
  outlet_id: null,
  category_id: null,
  asset_tag: "",
  name: "",
  serial_number: "",
  purchase_date: "",
  purchase_cost: "",
  is_active: true
};

type FixedAssetCategoryFormState = {
  code: string;
  name: string;
  depreciation_method: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS";
  useful_life_months: string;
  residual_value_pct: string;
  expense_account_id: string;
  accum_depr_account_id: string;
  is_active: boolean;
};

const emptyCategoryForm: FixedAssetCategoryFormState = {
  code: "",
  name: "",
  depreciation_method: "STRAIGHT_LINE",
  useful_life_months: "60",
  residual_value_pct: "0",
  expense_account_id: "",
  accum_depr_account_id: "",
  is_active: true
};

type OutletFilter = "ALL" | "UNASSIGNED" | number;

export function FixedAssetPage(props: FixedAssetPageProps) {
  const isOnline = useOnlineStatus();
  const [asset, setFixedAsset] = useState<FixedAsset[]>([]);
  const [categories, setCategories] = useState<FixedAssetCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FixedAssetFormState>(emptyForm);
  const [categoryFormState, setCategoryFormState] = useState<FixedAssetCategoryFormState>(emptyCategoryForm);
  const [showInactive, setShowInactive] = useState(false);
  const [showInactiveCategories, setShowInactiveCategories] = useState(false);
  const [outletFilter, setOutletFilter] = useState<OutletFilter>("ALL");
  const [selectedFixedAssetId, setSelectedFixedAssetId] = useState<number | null>(null);
  const [depreciationPlan, setDepreciationPlan] = useState<DepreciationPlan>(null);
  const [planFormVisible, setPlanFormVisible] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [editingAsset, setEditingAsset] = useState<FixedAssetEditState | null>(null);
  const [editingAssetBase, setEditingAssetBase] = useState<FixedAsset | null>(null);
  const [runPeriodYear, setRunPeriodYear] = useState("");
  const [runPeriodMonth, setRunPeriodMonth] = useState("");
  const [runLoading, setRunLoading] = useState(false);

  const outletOptions = useMemo(() => props.user.outlets ?? [], [props.user.outlets]);
  const categoryOptions = useMemo(() => {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  const categoryLabelById = useMemo(() => {
    const map = new Map<number, string>();
    categories.forEach((category) => {
      map.set(category.id, `${category.code} - ${category.name}`);
    });
    return map;
  }, [categories]);

  const outletLabelById = useMemo(() => {
    const map = new Map<number, string>();
    outletOptions.forEach((outlet) => {
      map.set(outlet.id, `${outlet.code} - ${outlet.name}`);
    });
    return map;
  }, [outletOptions]);

  async function refreshFixedAsset(filter: OutletFilter) {
    setLoading(true);
    setError(null);

    try {
      const query =
        typeof filter === "number" ? `?outlet_id=${filter}` : "";
      const response = await apiRequest<{ ok: true; assets: FixedAsset[] }>(
        `/accounts/fixed-assets${query}`,
        {},
        props.accessToken
      );
      setFixedAsset(response.assets);
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

  async function refreshCategories() {
    try {
      const response = await apiRequest<{ ok: true; categories: FixedAssetCategory[] }>(
        "/accounts/fixed-asset-categories",
        {},
        props.accessToken
      );
      setCategories(response.categories);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load categories");
      }
    }
  }

  useEffect(() => {
    if (isOnline) {
      refreshFixedAsset(outletFilter).catch(() => undefined);
      refreshCategories().catch(() => undefined);
      loadAccounts().catch(() => undefined);
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
        "/accounts/fixed-assets",
        {
          method: "POST",
          body: JSON.stringify({
            outlet_id: formState.outlet_id,
            category_id: formState.category_id,
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
        `/accounts/fixed-assets/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            outlet_id: item.outlet_id,
            category_id: item.category_id,
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
      await apiRequest(`/accounts/fixed-assets/${assetId}`, { method: "DELETE" }, props.accessToken);
      await refreshFixedAsset(outletFilter);
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("Failed to delete asset");
      }
    }
  }

  async function handleCreateCategory() {
    if (!categoryFormState.code.trim() || !categoryFormState.name.trim()) {
      setError("Category code and name are required");
      return;
    }

    if (!categoryFormState.useful_life_months.trim()) {
      setError("Useful life is required");
      return;
    }

    try {
      setError(null);
      await apiRequest(
        "/accounts/fixed-asset-categories",
        {
          method: "POST",
          body: JSON.stringify({
            code: categoryFormState.code.trim(),
            name: categoryFormState.name.trim(),
            depreciation_method: categoryFormState.depreciation_method,
            useful_life_months: Number(categoryFormState.useful_life_months),
            residual_value_pct: Number(categoryFormState.residual_value_pct || 0),
            expense_account_id: categoryFormState.expense_account_id
              ? Number(categoryFormState.expense_account_id)
              : null,
            accum_depr_account_id: categoryFormState.accum_depr_account_id
              ? Number(categoryFormState.accum_depr_account_id)
              : null,
            is_active: categoryFormState.is_active
          })
        },
        props.accessToken
      );
      setCategoryFormState(emptyCategoryForm);
      await refreshCategories();
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      } else {
        setError("Failed to create category");
      }
    }
  }

  async function handleSaveCategory(category: FixedAssetCategory) {
    try {
      setError(null);
      await apiRequest(
        `/accounts/fixed-asset-categories/${category.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            code: category.code,
            name: category.name,
            depreciation_method: category.depreciation_method,
            useful_life_months: category.useful_life_months,
            residual_value_pct: category.residual_value_pct,
            expense_account_id: category.expense_account_id,
            accum_depr_account_id: category.accum_depr_account_id,
            is_active: category.is_active
          })
        },
        props.accessToken
      );
      await refreshCategories();
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      } else {
        setError("Failed to update category");
      }
    }
  }

  async function handleDeleteCategory(categoryId: number) {
    if (!globalThis.confirm("Delete this category?")) {
      return;
    }

    try {
      setError(null);
      await apiRequest(
        `/accounts/fixed-asset-categories/${categoryId}`,
        { method: "DELETE" },
        props.accessToken
      );
      await refreshCategories();
      await refreshFixedAsset(outletFilter);
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("Failed to delete category");
      }
    }
  }

  async function loadDepreciationPlan(assetId: number) {
    try {
      setError(null);
      const response = await apiRequest<{ ok: true; plan: DepreciationPlan }>(
        `/accounts/fixed-assets/${assetId}/depreciation-plan`,
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
      const response = await apiRequest<
        | { ok: true; accounts: Array<{ id: number; code: string; name: string }> }
        | { success: true; data: Array<{ id: number; code: string; name: string }> }
      >(
        `/accounts?company_id=${props.user.company_id}`,
        {},
        props.accessToken
      );
      if ("accounts" in response && Array.isArray(response.accounts)) {
        setAccounts(response.accounts);
        return;
      }
      if ("data" in response && Array.isArray(response.data)) {
        setAccounts(response.data);
        return;
      }
      setAccounts([]);
    } catch (err) {
      console.error("Failed to load accounts", err);
      setAccounts([]);
    }
  }

  async function handleShowDepreciationPlan(assetId: number) {
    setSelectedFixedAssetId(assetId);
    setPlanFormVisible(true);
    await loadDepreciationPlan(assetId);
    await loadAccounts();
  }

  function openEditAsset(item: FixedAsset) {
    setEditingAssetBase(item);
    setEditingAsset({
      id: item.id,
      outlet_id: item.outlet_id,
      category_id: item.category_id,
      asset_tag: item.asset_tag ?? "",
      name: item.name,
      serial_number: item.serial_number ?? "",
      purchase_date: item.purchase_date ? item.purchase_date.slice(0, 10) : "",
      purchase_cost: item.purchase_cost == null ? "" : String(item.purchase_cost),
      is_active: item.is_active
    });
  }

  function closeEditAsset() {
    setEditingAsset(null);
    setEditingAssetBase(null);
  }

  async function handleSaveEditingAsset() {
    if (!editingAsset || !editingAssetBase) {
      return;
    }

    const payload: FixedAsset = {
      ...editingAssetBase,
      outlet_id: editingAsset.outlet_id,
      category_id: editingAsset.category_id,
      asset_tag: editingAsset.asset_tag.trim() || null,
      name: editingAsset.name.trim(),
      serial_number: editingAsset.serial_number.trim() || null,
      purchase_date: editingAsset.purchase_date.trim() || null,
      purchase_cost: editingAsset.purchase_cost.trim()
        ? Number(editingAsset.purchase_cost)
        : null,
      is_active: editingAsset.is_active
    };

    await handleSaveFixedAsset(payload);
    closeEditAsset();
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
          `/accounts/fixed-assets/${assetId}/depreciation-plan`,
          {
            method: "PATCH",
            body: JSON.stringify({
              method: depreciationPlan.method,
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
          `/accounts/fixed-assets/${assetId}/depreciation-plan`,
          {
            method: "POST",
            body: JSON.stringify({
              asset_id: assetId,
              method: depreciationPlan.method,
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
        `/accounts/depreciation/run`,
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

  const visibleCategories = showInactiveCategories
    ? categoryOptions
    : categoryOptions.filter((category) => category.is_active);

  return (
    <div>
      <section style={boxStyle}>
        <h2 style={{ marginTop: 0 }}>FixedAsset</h2>
        <p>Manage durable assets and outlet assignments.</p>
        {loading ? <p>Loading asset...</p> : null}
        {error ? <p style={{ color: "#8d2626" }}>{error}</p> : null}
      </section>

      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Create Category</h3>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-start" }}>
          <input
            placeholder="Code"
            value={categoryFormState.code}
            onChange={(event) =>
              setCategoryFormState((prev) => ({ ...prev, code: event.target.value }))
            }
            style={inputStyle}
          />
          <input
            placeholder="Name"
            value={categoryFormState.name}
            onChange={(event) =>
              setCategoryFormState((prev) => ({ ...prev, name: event.target.value }))
            }
            style={inputStyle}
          />
          <select
            value={categoryFormState.depreciation_method}
            onChange={(event) =>
              setCategoryFormState((prev) => ({
                ...prev,
                depreciation_method: event.target.value as
                  | "STRAIGHT_LINE"
                  | "DECLINING_BALANCE"
                  | "SUM_OF_YEARS"
              }))
            }
            style={inputStyle}
          >
            <option value="STRAIGHT_LINE">Straight Line</option>
            <option value="DECLINING_BALANCE">Declining Balance</option>
            <option value="SUM_OF_YEARS">Sum of Years</option>
          </select>
          <input
            type="number"
            placeholder="Useful life (months)"
            value={categoryFormState.useful_life_months}
            onChange={(event) =>
              setCategoryFormState((prev) => ({ ...prev, useful_life_months: event.target.value }))
            }
            style={inputStyle}
          />
          <input
            type="number"
            placeholder="Residual %"
            value={categoryFormState.residual_value_pct}
            onChange={(event) =>
              setCategoryFormState((prev) => ({ ...prev, residual_value_pct: event.target.value }))
            }
            style={inputStyle}
          />
          <select
            value={categoryFormState.expense_account_id}
            onChange={(event) =>
              setCategoryFormState((prev) => ({ ...prev, expense_account_id: event.target.value }))
            }
            style={inputStyle}
          >
            <option value="">Depreciation expense account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </select>
          <select
            value={categoryFormState.accum_depr_account_id}
            onChange={(event) =>
              setCategoryFormState((prev) => ({ ...prev, accum_depr_account_id: event.target.value }))
            }
            style={inputStyle}
          >
            <option value="">Accumulated depreciation account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name}
              </option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              checked={categoryFormState.is_active}
              onChange={(event) =>
                setCategoryFormState((prev) => ({
                  ...prev,
                  is_active: event.target.checked
                }))
              }
            />
            Active
          </label>
          <button type="button" onClick={handleCreateCategory} style={primaryButtonStyle}>
            Add category
          </button>
        </div>
      </section>

      <section style={boxStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Category List</h3>
          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <input
              type="checkbox"
              checked={showInactiveCategories}
              onChange={(event) => setShowInactiveCategories(event.target.checked)}
            />
            Show Inactive
          </label>
        </div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>ID</th>
              <th style={cellStyle}>Code</th>
              <th style={cellStyle}>Name</th>
              <th style={cellStyle}>Method</th>
              <th style={cellStyle}>Life (Months)</th>
              <th style={cellStyle}>Residual %</th>
              <th style={cellStyle}>Expense Account</th>
              <th style={cellStyle}>Accum. Depr</th>
              <th style={cellStyle}>Active</th>
              <th style={cellStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleCategories.map((category) => (
              <tr key={category.id}>
                <td style={cellStyle}>{category.id}</td>
                <td style={cellStyle}>
                  <input
                    value={category.code}
                    onChange={(event) =>
                      setCategories((prev) =>
                        prev.map((entry) =>
                          entry.id === category.id
                            ? { ...entry, code: event.target.value }
                            : entry
                        )
                      )
                    }
                    style={inputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    value={category.name}
                    onChange={(event) =>
                      setCategories((prev) =>
                        prev.map((entry) =>
                          entry.id === category.id
                            ? { ...entry, name: event.target.value }
                            : entry
                        )
                      )
                    }
                    style={inputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <select
                    value={category.depreciation_method}
                    onChange={(event) =>
                      setCategories((prev) =>
                        prev.map((entry) =>
                          entry.id === category.id
                            ? {
                                ...entry,
                                depreciation_method: event.target.value as
                                  | "STRAIGHT_LINE"
                                  | "DECLINING_BALANCE"
                                  | "SUM_OF_YEARS"
                              }
                            : entry
                        )
                      )
                    }
                    style={inputStyle}
                  >
                    <option value="STRAIGHT_LINE">Straight Line</option>
                    <option value="DECLINING_BALANCE">Declining Balance</option>
                    <option value="SUM_OF_YEARS">Sum of Years</option>
                  </select>
                </td>
                <td style={cellStyle}>
                  <input
                    type="number"
                    value={category.useful_life_months}
                    onChange={(event) =>
                      setCategories((prev) =>
                        prev.map((entry) =>
                          entry.id === category.id
                            ? {
                                ...entry,
                                useful_life_months: Number(event.target.value)
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
                    type="number"
                    value={category.residual_value_pct}
                    onChange={(event) =>
                      setCategories((prev) =>
                        prev.map((entry) =>
                          entry.id === category.id
                            ? {
                                ...entry,
                                residual_value_pct: Number(event.target.value)
                              }
                            : entry
                        )
                      )
                    }
                    style={inputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <select
                    value={category.expense_account_id ?? ""}
                    onChange={(event) =>
                      setCategories((prev) =>
                        prev.map((entry) =>
                          entry.id === category.id
                            ? {
                                ...entry,
                                expense_account_id: event.target.value
                                  ? Number(event.target.value)
                                  : null
                              }
                            : entry
                        )
                      )
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
                </td>
                <td style={cellStyle}>
                  <select
                    value={category.accum_depr_account_id ?? ""}
                    onChange={(event) =>
                      setCategories((prev) =>
                        prev.map((entry) =>
                          entry.id === category.id
                            ? {
                                ...entry,
                                accum_depr_account_id: event.target.value
                                  ? Number(event.target.value)
                                  : null
                              }
                            : entry
                        )
                      )
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
                </td>
                <td style={cellStyle}>
                  <input
                    type="checkbox"
                    checked={category.is_active}
                    onChange={(event) =>
                      setCategories((prev) =>
                        prev.map((entry) =>
                          entry.id === category.id
                            ? { ...entry, is_active: event.target.checked }
                            : entry
                        )
                      )
                    }
                  />
                </td>
                <td style={cellStyle}>
                  <button
                    type="button"
                    onClick={() => handleSaveCategory(category)}
                    style={buttonStyle}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(category.id)}
                    style={buttonStyle}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleCategories.length === 0 ? <p>No categories available.</p> : null}
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
          <select
            value={formState.category_id ?? ""}
            onChange={(event) =>
              setFormState((prev) => ({
                ...prev,
                category_id: event.target.value ? Number(event.target.value) : null
              }))
            }
            style={inputStyle}
          >
            <option value="">Uncategorized</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.code} - {category.name}
              </option>
            ))}
          </select>
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
              <th style={cellStyle}>Category</th>
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
                <td style={cellStyle}>{item.name}</td>
                <td style={cellStyle}>{item.asset_tag ?? "-"}</td>
                <td style={cellStyle}>
                  {item.category_id
                    ? categoryLabelById.get(item.category_id) ?? `#${item.category_id}`
                    : "Uncategorized"}
                </td>
                <td style={cellStyle}>{item.serial_number ?? "-"}</td>
                <td style={cellStyle}>
                  {item.outlet_id
                    ? outletLabelById.get(item.outlet_id) ?? `#${item.outlet_id}`
                    : "Unassigned"}
                </td>
                <td style={cellStyle}>{item.purchase_date ? item.purchase_date.slice(0, 10) : "-"}</td>
                <td style={cellStyle}>{item.purchase_cost ?? "-"}</td>
                <td style={cellStyle}>{item.is_active ? "Yes" : "No"}</td>
                <td style={cellStyle}>
                  <button type="button" onClick={() => openEditAsset(item)} style={buttonStyle}>
                    Edit
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
        <p style={{ marginBottom: 0 }}>
          Loaded {asset.length} asset records and {categories.length} categories.
        </p>
      </section>

      {planFormVisible && selectedFixedAssetId ? (
        <>
          <div style={drawerOverlayStyle} onClick={() => setPlanFormVisible(false)} />
          <aside style={drawerStyle}>
            <div style={drawerHeaderStyle}>
              <div>
                <strong>Depreciation Plan</strong>
                <div style={{ fontSize: "12px", color: "#6a5d4b" }}>Asset ID #{selectedFixedAssetId}</div>
              </div>
              <button type="button" onClick={() => setPlanFormVisible(false)} style={buttonStyle}>
                Close
              </button>
            </div>
            <div style={drawerBodyStyle}>
              {depreciationPlan ? (
                <>
                  <label style={formFieldStyle}>
                    Method
                    <select
                      value={depreciationPlan.method}
                      onChange={(e) =>
                        setDepreciationPlan({
                          ...depreciationPlan,
                          method: e.target.value as
                            | "STRAIGHT_LINE"
                            | "DECLINING_BALANCE"
                            | "SUM_OF_YEARS"
                        })
                      }
                      style={inputStyle}
                    >
                      <option value="STRAIGHT_LINE">Straight Line</option>
                      <option value="DECLINING_BALANCE">Declining Balance</option>
                      <option value="SUM_OF_YEARS">Sum of Years</option>
                    </select>
                  </label>
                  <label style={formFieldStyle}>
                    Useful Life (Months)
                    <input
                      type="number"
                      value={depreciationPlan.useful_life_months}
                      onChange={(e) =>
                        setDepreciationPlan({
                          ...depreciationPlan,
                          useful_life_months: Number(e.target.value)
                        })
                      }
                      style={inputStyle}
                    />
                  </label>
                  <label style={formFieldStyle}>
                    Salvage Value
                    <input
                      type="number"
                      value={depreciationPlan.salvage_value}
                      onChange={(e) =>
                        setDepreciationPlan({ ...depreciationPlan, salvage_value: Number(e.target.value) })
                      }
                      style={inputStyle}
                    />
                  </label>
                  <label style={formFieldStyle}>
                    Expense Account
                    <select
                      value={depreciationPlan.expense_account_id}
                      onChange={(e) =>
                        setDepreciationPlan({
                          ...depreciationPlan,
                          expense_account_id: Number(e.target.value)
                        })
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
                  </label>
                  <label style={formFieldStyle}>
                    Accumulated Depreciation Account
                    <select
                      value={depreciationPlan.accum_depr_account_id}
                      onChange={(e) =>
                        setDepreciationPlan({
                          ...depreciationPlan,
                          accum_depr_account_id: Number(e.target.value)
                        })
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
                  </label>
                  <label style={formFieldStyle}>
                    Status
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
                  </label>
                  {depreciationPlan.status === "ACTIVE" ? (
                    <div style={{ borderTop: "1px solid #ece7dc", paddingTop: "12px" }}>
                      <strong style={{ display: "block", marginBottom: "8px" }}>Run Depreciation</strong>
                      <div style={{ display: "grid", gap: "8px" }}>
                        <label style={formFieldStyle}>
                          Year
                          <input
                            type="number"
                            value={runPeriodYear}
                            onChange={(e) => setRunPeriodYear(e.target.value)}
                            placeholder="2026"
                            style={inputStyle}
                          />
                        </label>
                        <label style={formFieldStyle}>
                          Month
                          <input
                            type="number"
                            value={runPeriodMonth}
                            onChange={(e) => setRunPeriodMonth(e.target.value)}
                            placeholder="1"
                            min="1"
                            max="12"
                            style={inputStyle}
                          />
                        </label>
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
                  ) : null}
                </>
              ) : (
                <div>
                  <p>No depreciation plan exists. Create one:</p>
                  <button
                    type="button"
                    onClick={() => {
                      const selectedFixedAsset = asset.find((e) => e.id === selectedFixedAssetId);
                      const selectedCategory = categories.find(
                        (category) => category.id === selectedFixedAsset?.category_id
                      );
                      const purchaseCost = selectedFixedAsset?.purchase_cost ?? 0;
                      const residualPct = selectedCategory?.residual_value_pct ?? 0;
                      setDepreciationPlan({
                        id: 0,
                        company_id: props.user.company_id,
                        asset_id: selectedFixedAssetId,
                        outlet_id: selectedFixedAsset?.outlet_id ?? null,
                        method: selectedCategory?.depreciation_method ?? "STRAIGHT_LINE",
                        start_date: selectedFixedAsset?.purchase_date ?? "",
                        useful_life_months: selectedCategory?.useful_life_months ?? 60,
                        salvage_value: purchaseCost * (residualPct / 100),
                        purchase_cost_snapshot: selectedFixedAsset?.purchase_cost ?? 0,
                        expense_account_id: selectedCategory?.expense_account_id ?? 0,
                        accum_depr_account_id: selectedCategory?.accum_depr_account_id ?? 0,
                        status: "DRAFT",
                        created_at: "",
                        updated_at: ""
                      });
                    }}
                    style={primaryButtonStyle}
                  >
                    Create Plan
                  </button>
                </div>
              )}
            </div>
            {depreciationPlan ? (
              <div style={drawerFooterStyle}>
                <button type="button" onClick={() => setPlanFormVisible(false)} style={buttonStyle}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveDepreciationPlan(selectedFixedAssetId)}
                  style={primaryButtonStyle}
                >
                  Save Plan
                </button>
              </div>
            ) : (
              <div style={drawerFooterStyle}>
                <button type="button" onClick={() => setPlanFormVisible(false)} style={buttonStyle}>
                  Close
                </button>
              </div>
            )}
          </aside>
        </>
      ) : null}
      {editingAsset ? (
        <>
          <div style={drawerOverlayStyle} onClick={closeEditAsset} />
          <aside style={drawerStyle}>
            <div style={drawerHeaderStyle}>
              <div>
                <strong>Edit Fixed Asset</strong>
                <div style={{ fontSize: "12px", color: "#6a5d4b" }}>ID #{editingAsset.id}</div>
              </div>
              <button type="button" onClick={closeEditAsset} style={buttonStyle}>
                Close
              </button>
            </div>
            <div style={drawerBodyStyle}>
              <label style={formFieldStyle}>
                Name
                <input
                  value={editingAsset.name}
                  onChange={(event) =>
                    setEditingAsset((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                  }
                  style={inputStyle}
                />
              </label>
              <label style={formFieldStyle}>
                Asset Tag
                <input
                  value={editingAsset.asset_tag}
                  onChange={(event) =>
                    setEditingAsset((prev) => (prev ? { ...prev, asset_tag: event.target.value } : prev))
                  }
                  style={inputStyle}
                />
              </label>
              <label style={formFieldStyle}>
                Category
                <select
                  value={editingAsset.category_id ?? ""}
                  onChange={(event) =>
                    setEditingAsset((prev) =>
                      prev
                        ? {
                            ...prev,
                            category_id: event.target.value ? Number(event.target.value) : null
                          }
                        : prev
                    )
                  }
                  style={inputStyle}
                >
                  <option value="">Uncategorized</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.code} - {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={formFieldStyle}>
                Serial Number
                <input
                  value={editingAsset.serial_number}
                  onChange={(event) =>
                    setEditingAsset((prev) => (prev ? { ...prev, serial_number: event.target.value } : prev))
                  }
                  style={inputStyle}
                />
              </label>
              <label style={formFieldStyle}>
                Outlet
                <select
                  value={editingAsset.outlet_id ?? ""}
                  onChange={(event) =>
                    setEditingAsset((prev) =>
                      prev
                        ? {
                            ...prev,
                            outlet_id: event.target.value ? Number(event.target.value) : null
                          }
                        : prev
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
              </label>
              <label style={formFieldStyle}>
                Purchase Date
                <input
                  type="date"
                  value={editingAsset.purchase_date}
                  onChange={(event) =>
                    setEditingAsset((prev) => (prev ? { ...prev, purchase_date: event.target.value } : prev))
                  }
                  style={inputStyle}
                />
              </label>
              <label style={formFieldStyle}>
                Purchase Cost
                <input
                  type="number"
                  value={editingAsset.purchase_cost}
                  onChange={(event) =>
                    setEditingAsset((prev) => (prev ? { ...prev, purchase_cost: event.target.value } : prev))
                  }
                  style={inputStyle}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input
                  type="checkbox"
                  checked={editingAsset.is_active}
                  onChange={(event) =>
                    setEditingAsset((prev) => (prev ? { ...prev, is_active: event.target.checked } : prev))
                  }
                />
                Active
              </label>
            </div>
            <div style={drawerFooterStyle}>
              <button type="button" onClick={closeEditAsset} style={buttonStyle}>
                Cancel
              </button>
              <button type="button" onClick={handleSaveEditingAsset} style={primaryButtonStyle}>
                Save Changes
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
