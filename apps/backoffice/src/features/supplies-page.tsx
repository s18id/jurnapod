import { useEffect, useState } from "react";
import type { SessionUser } from "../lib/session";
import { apiRequest, ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import { OfflinePage } from "../components/offline-page";

type Supply = {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  unit: string;
  is_active: boolean;
  updated_at: string;
};

type SuppliesPageProps = {
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

type SupplyFormState = {
  sku: string;
  name: string;
  unit: string;
  is_active: boolean;
};

const emptyForm: SupplyFormState = {
  sku: "",
  name: "",
  unit: "unit",
  is_active: true
};

export function SuppliesPage(props: SuppliesPageProps) {
  const isOnline = useOnlineStatus();
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<SupplyFormState>(emptyForm);
  const [showInactive, setShowInactive] = useState(false);

  async function refreshSupplies() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{ ok: true; supplies: Supply[] }>(
        "/supplies",
        {},
        props.accessToken
      );
      setSupplies(response.supplies);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load supplies");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOnline) {
      refreshSupplies().catch(() => undefined);
    }
  }, [isOnline]);

  async function handleCreateSupply() {
    if (!formState.name.trim()) {
      setError("Supply name is required");
      return;
    }

    try {
      setError(null);
      await apiRequest(
        "/supplies",
        {
          method: "POST",
          body: JSON.stringify({
            sku: formState.sku.trim() || null,
            name: formState.name.trim(),
            unit: formState.unit.trim() || "unit",
            is_active: formState.is_active
          })
        },
        props.accessToken
      );
      setFormState(emptyForm);
      await refreshSupplies();
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      } else {
        setError("Failed to create supply");
      }
    }
  }

  async function handleSaveSupply(supply: Supply) {
    try {
      setError(null);
      await apiRequest(
        `/supplies/${supply.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            sku: supply.sku,
            name: supply.name,
            unit: supply.unit,
            is_active: supply.is_active
          })
        },
        props.accessToken
      );
      await refreshSupplies();
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      } else {
        setError("Failed to update supply");
      }
    }
  }

  async function handleDeleteSupply(supplyId: number) {
    if (!globalThis.confirm("Delete this supply?")) {
      return;
    }

    try {
      setError(null);
      await apiRequest(`/supplies/${supplyId}`, { method: "DELETE" }, props.accessToken);
      await refreshSupplies();
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("Failed to delete supply");
      }
    }
  }

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Master Data"
        message="Supply changes require a connection."
      />
    );
  }

  const visibleSupplies = showInactive ? supplies : supplies.filter((supply) => supply.is_active);

  return (
    <div>
      <section style={boxStyle}>
        <h2 style={{ marginTop: 0 }}>Supplies</h2>
        <p>Track consumables for daily operations.</p>
        {loading ? <p>Loading supplies...</p> : null}
        {error ? <p style={{ color: "#8d2626" }}>{error}</p> : null}
      </section>

      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Create Supply</h3>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-start" }}>
          <input
            placeholder="SKU"
            value={formState.sku}
            onChange={(event) => setFormState((prev) => ({ ...prev, sku: event.target.value }))}
            style={inputStyle}
          />
          <input
            placeholder="Name"
            value={formState.name}
            onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
            style={inputStyle}
          />
          <input
            placeholder="Unit (e.g., box, pack)"
            value={formState.unit}
            onChange={(event) => setFormState((prev) => ({ ...prev, unit: event.target.value }))}
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
          <button type="button" onClick={handleCreateSupply} style={primaryButtonStyle}>
            Add supply
          </button>
        </div>
      </section>

      <section style={boxStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Supplies List</h3>
          <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Show Inactive
          </label>
        </div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>ID</th>
              <th style={cellStyle}>SKU</th>
              <th style={cellStyle}>Name</th>
              <th style={cellStyle}>Unit</th>
              <th style={cellStyle}>Active</th>
              <th style={cellStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleSupplies.map((supply) => (
              <tr key={supply.id}>
                <td style={cellStyle}>{supply.id}</td>
                <td style={cellStyle}>
                  <input
                    value={supply.sku ?? ""}
                    onChange={(event) =>
                      setSupplies((prev) =>
                        prev.map((entry) =>
                          entry.id === supply.id
                            ? { ...entry, sku: event.target.value || null }
                            : entry
                        )
                      )
                    }
                    style={inputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    value={supply.name}
                    onChange={(event) =>
                      setSupplies((prev) =>
                        prev.map((entry) =>
                          entry.id === supply.id ? { ...entry, name: event.target.value } : entry
                        )
                      )
                    }
                    style={inputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    value={supply.unit}
                    onChange={(event) =>
                      setSupplies((prev) =>
                        prev.map((entry) =>
                          entry.id === supply.id ? { ...entry, unit: event.target.value } : entry
                        )
                      )
                    }
                    style={inputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    type="checkbox"
                    checked={supply.is_active}
                    onChange={(event) =>
                      setSupplies((prev) =>
                        prev.map((entry) =>
                          entry.id === supply.id
                            ? { ...entry, is_active: event.target.checked }
                            : entry
                        )
                      )
                    }
                  />
                </td>
                <td style={cellStyle}>
                  <button type="button" onClick={() => handleSaveSupply(supply)} style={buttonStyle}>
                    Save
                  </button>
                  <button type="button" onClick={() => handleDeleteSupply(supply.id)} style={buttonStyle}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleSupplies.length === 0 ? <p>No supplies available.</p> : null}
      </section>

      <section style={boxStyle}>
        <strong>Quick checks</strong>
        <p style={{ marginBottom: 0 }}>Loaded {supplies.length} supplies.</p>
      </section>
    </div>
  );
}
