import { useEffect, useMemo, useState } from "react";
import type { SessionUser } from "../lib/session";
import { apiRequest, ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import { OfflinePage } from "../components/offline-page";

type Equipment = {
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

type EquipmentPageProps = {
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

type EquipmentFormState = {
  outlet_id: number | null;
  asset_tag: string;
  name: string;
  serial_number: string;
  purchase_date: string;
  purchase_cost: string;
  is_active: boolean;
};

const emptyForm: EquipmentFormState = {
  outlet_id: null,
  asset_tag: "",
  name: "",
  serial_number: "",
  purchase_date: "",
  purchase_cost: "",
  is_active: true
};

type OutletFilter = "ALL" | "UNASSIGNED" | number;

export function EquipmentPage(props: EquipmentPageProps) {
  const isOnline = useOnlineStatus();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<EquipmentFormState>(emptyForm);
  const [showInactive, setShowInactive] = useState(false);
  const [outletFilter, setOutletFilter] = useState<OutletFilter>("ALL");

  const outletOptions = useMemo(() => props.user.outlets ?? [], [props.user.outlets]);

  async function refreshEquipment(filter: OutletFilter) {
    setLoading(true);
    setError(null);

    try {
      const query =
        typeof filter === "number" ? `?outlet_id=${filter}` : "";
      const response = await apiRequest<{ ok: true; equipment: Equipment[] }>(
        `/equipment${query}`,
        {},
        props.accessToken
      );
      setEquipment(response.equipment);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load equipment");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOnline) {
      refreshEquipment(outletFilter).catch(() => undefined);
    }
  }, [isOnline, outletFilter]);

  async function handleCreateEquipment() {
    if (!formState.name.trim()) {
      setError("Equipment name is required");
      return;
    }

    try {
      setError(null);
      await apiRequest(
        "/equipment",
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
      await refreshEquipment(outletFilter);
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      } else {
        setError("Failed to create equipment");
      }
    }
  }

  async function handleSaveEquipment(item: Equipment) {
    try {
      setError(null);
      await apiRequest(
        `/equipment/${item.id}`,
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
      await refreshEquipment(outletFilter);
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      } else {
        setError("Failed to update equipment");
      }
    }
  }

  async function handleDeleteEquipment(equipmentId: number) {
    if (!globalThis.confirm("Delete this equipment record?")) {
      return;
    }

    try {
      setError(null);
      await apiRequest(`/equipment/${equipmentId}`, { method: "DELETE" }, props.accessToken);
      await refreshEquipment(outletFilter);
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("Failed to delete equipment");
      }
    }
  }

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Master Data"
        message="Equipment changes require a connection."
      />
    );
  }

  const visibleEquipment = equipment.filter((item) => {
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
        <h2 style={{ marginTop: 0 }}>Equipment</h2>
        <p>Manage durable assets and outlet assignments.</p>
        {loading ? <p>Loading equipment...</p> : null}
        {error ? <p style={{ color: "#8d2626" }}>{error}</p> : null}
      </section>

      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Create Equipment</h3>
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
          <button type="button" onClick={handleCreateEquipment} style={primaryButtonStyle}>
            Add equipment
          </button>
        </div>
      </section>

      <section style={boxStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ marginTop: 0, marginBottom: 0 }}>Equipment List</h3>
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
            {visibleEquipment.map((item) => (
              <tr key={item.id}>
                <td style={cellStyle}>{item.id}</td>
                <td style={cellStyle}>
                  <input
                    value={item.name}
                    onChange={(event) =>
                      setEquipment((prev) =>
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
                      setEquipment((prev) =>
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
                      setEquipment((prev) =>
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
                      setEquipment((prev) =>
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
                      setEquipment((prev) =>
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
                      setEquipment((prev) =>
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
                      setEquipment((prev) =>
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
                  <button type="button" onClick={() => handleSaveEquipment(item)} style={buttonStyle}>
                    Save
                  </button>
                  <button type="button" onClick={() => handleDeleteEquipment(item.id)} style={buttonStyle}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleEquipment.length === 0 ? <p>No equipment available.</p> : null}
      </section>

      <section style={boxStyle}>
        <strong>Quick checks</strong>
        <p style={{ marginBottom: 0 }}>Loaded {equipment.length} equipment records.</p>
      </section>
    </div>
  );
}
