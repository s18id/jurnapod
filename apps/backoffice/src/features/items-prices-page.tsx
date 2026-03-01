// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "../lib/api-client";
import { CacheService } from "../lib/cache-service";
import { useOnlineStatus } from "../lib/connection";
import { StaleDataWarning } from "../components/stale-data-warning";
import { OfflinePage } from "../components/offline-page";
import type { SessionUser } from "../lib/session";

type ItemType = "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";

type Item = {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  type: ItemType;
  is_active: boolean;
  updated_at: string;
};

type ItemPrice = {
  id: number;
  company_id: number;
  outlet_id: number;
  item_id: number;
  price: number;
  is_active: boolean;
  updated_at: string;
};

const itemTypeOptions: readonly ItemType[] = ["SERVICE", "PRODUCT", "INGREDIENT", "RECIPE"];

const itemTypeDescriptions: Record<ItemType, string> = {
  SERVICE: "Non-tangible offerings (e.g., delivery, labor)",
  PRODUCT: "Finished goods sold to customers (default)",
  INGREDIENT: "Raw materials used in production",
  RECIPE: "Bill of Materials / formulas (inventory level 2+)"
};

const itemTypeExamples: Record<ItemType, string> = {
  SERVICE: "Examples: Delivery fee, consulting, event catering",
  PRODUCT: "Examples: Coffee drinks, pastries, retail items",
  INGREDIENT: "Examples: Coffee beans, milk, sugar, cups",
  RECIPE: "Examples: Latte recipe, cookie recipe"
};

function getItemTypeWarning(type: ItemType, hasPrice: boolean): string | null {
  if (type === "RECIPE" && hasPrice) {
    return "⚠️ RECIPE items typically don't need prices. Consider pricing the PRODUCT instead.";
  }
  if (type === "INGREDIENT" && hasPrice) {
    return "💡 Selling ingredients directly? You may want to create a PRODUCT item for retail sales.";
  }
  return null;
}

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

type ItemsPricesPageProps = {
  user: SessionUser;
  accessToken: string;
};

export function ItemsPricesPage(props: ItemsPricesPageProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [prices, setPrices] = useState<ItemPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOutletId, setSelectedOutletId] = useState<number>(props.user.outlets[0]?.id ?? 0);
  const isOnline = useOnlineStatus();

  const [newItem, setNewItem] = useState({
    sku: "",
    name: "",
    type: "PRODUCT" as ItemType,
    is_active: true
  });
  const [newPrice, setNewPrice] = useState({
    item_id: 0,
    price: "",
    is_active: true
  });

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  async function refreshData(outletId: number) {
    setLoading(true);
    setError(null);
    try {
      let itemsData: Item[] = [];
      let pricesData: ItemPrice[] = [];

      if (isOnline) {
        const [itemsResponse, pricesResponse] = await Promise.all([
          CacheService.refreshItems(props.accessToken),
          CacheService.refreshItemPrices(outletId, props.accessToken)
        ]);
        itemsData = itemsResponse as Item[];
        pricesData = pricesResponse as ItemPrice[];
      } else {
        const [itemsResponse, pricesResponse] = await Promise.all([
          CacheService.getCachedItems(props.accessToken, { allowStale: true }),
          CacheService.getCachedItemPrices(outletId, props.accessToken, { allowStale: true })
        ]);
        itemsData = itemsResponse as Item[];
        pricesData = pricesResponse as ItemPrice[];
      }

      setItems(itemsData);
      setPrices(pricesData);
      setNewPrice((prev) => ({
        ...prev,
        item_id: prev.item_id > 0 ? prev.item_id : itemsData[0]?.id ?? 0
      }));
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError(isOnline ? "Failed to load items and prices" : "No cached items/prices available offline");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedOutletId > 0) {
      refreshData(selectedOutletId).catch(() => undefined);
    }
  }, [selectedOutletId, isOnline]);

  async function createItem() {
    try {
      await apiRequest("/inventory/items", {
        method: "POST",
        body: JSON.stringify({
          sku: newItem.sku.trim() || null,
          name: newItem.name.trim(),
          type: newItem.type,
          is_active: newItem.is_active
        })
      }, props.accessToken);
      setNewItem({ sku: "", name: "", type: "PRODUCT", is_active: true });
      await refreshData(selectedOutletId);
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      }
    }
  }

  async function saveItem(item: Item) {
    try {
      await apiRequest(`/inventory/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          sku: item.sku,
          name: item.name,
          type: item.type,
          is_active: item.is_active
        })
      }, props.accessToken);
      await refreshData(selectedOutletId);
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      }
    }
  }

  async function deleteItem(itemId: number) {
    try {
      await apiRequest(`/inventory/items/${itemId}`, { method: "DELETE" }, props.accessToken);
      await refreshData(selectedOutletId);
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      }
    }
  }

  async function createPrice() {
    if (newPrice.item_id <= 0 || !newPrice.price.trim()) {
      return;
    }

    try {
      await apiRequest("/inventory/item-prices", {
        method: "POST",
        body: JSON.stringify({
          item_id: newPrice.item_id,
          outlet_id: selectedOutletId,
          price: Number(newPrice.price),
          is_active: newPrice.is_active
        })
      }, props.accessToken);
      setNewPrice((prev) => ({ ...prev, price: "", is_active: true }));
      await refreshData(selectedOutletId);
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      }
    }
  }

  async function savePrice(price: ItemPrice) {
    try {
      await apiRequest(`/inventory/item-prices/${price.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          item_id: price.item_id,
          outlet_id: price.outlet_id,
          price: price.price,
          is_active: price.is_active
        })
      }, props.accessToken);
      await refreshData(selectedOutletId);
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      }
    }
  }

  async function deletePrice(priceId: number) {
    try {
      await apiRequest(`/inventory/item-prices/${priceId}`, { method: "DELETE" }, props.accessToken);
      await refreshData(selectedOutletId);
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      }
    }
  }

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Master Data"
        message="Items and pricing changes require a connection."
      />
    );
  }

  return (
    <div>
      <section style={boxStyle}>
        <h2 style={{ marginTop: 0 }}>Items + Prices Management</h2>
        
        <details style={{ marginBottom: "16px", padding: "12px", backgroundColor: "#f8f6f3", borderRadius: "6px" }}>
          <summary style={{ cursor: "pointer", fontWeight: "bold", color: "#2f5f4a" }}>
            📖 Item Types Guide
          </summary>
          <div style={{ marginTop: "12px", fontSize: "13px", lineHeight: "1.6" }}>
            <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
              <li><strong>SERVICE:</strong> Non-tangible offerings like delivery fees, labor, consulting</li>
              <li><strong>PRODUCT:</strong> Finished goods sold to customers (coffee, pastries, retail items) - Default type</li>
              <li><strong>INGREDIENT:</strong> Raw materials used in production (beans, milk, sugar, cups)</li>
              <li><strong>RECIPE:</strong> Bill of Materials / formulas for making products (requires inventory level 2+)</li>
            </ul>
            <p style={{ margin: "8px 0", fontSize: "12px", color: "#6b5d48" }}>
              ℹ️ All types can be sold via POS. INGREDIENT and RECIPE types will have special behavior when inventory module is enabled.
            </p>
          </div>
        </details>

        <p style={{ marginTop: 0 }}>Outlet scope for prices:</p>
        <select
          value={selectedOutletId}
          onChange={(event) => setSelectedOutletId(Number(event.target.value))}
          style={inputStyle}
        >
          {props.user.outlets.map((outlet) => (
            <option key={outlet.id} value={outlet.id}>
              {outlet.code} - {outlet.name}
            </option>
          ))}
        </select>
        <StaleDataWarning cacheKey="items" label="items" />
        <StaleDataWarning
          cacheKey={`item_prices:${selectedOutletId}`}
          label={`prices for outlet #${selectedOutletId}`}
        />
        {loading ? <p>Loading data...</p> : null}
        {error ? <p style={{ color: "#8d2626" }}>{error}</p> : null}
      </section>

      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Create Item</h3>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-start" }}>
          <input
            placeholder="SKU"
            value={newItem.sku}
            onChange={(event) => setNewItem((prev) => ({ ...prev, sku: event.target.value }))}
            style={inputStyle}
          />
          <input
            placeholder="Name"
            value={newItem.name}
            onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
            style={inputStyle}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <select
              value={newItem.type}
              onChange={(event) =>
                setNewItem((prev) => ({
                  ...prev,
                  type: event.target.value as ItemType
                }))
              }
              style={inputStyle}
              title={itemTypeDescriptions[newItem.type]}
            >
              {itemTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <small style={{ color: "#6b5d48", fontSize: "11px", maxWidth: "200px" }}>
              {itemTypeDescriptions[newItem.type]}
            </small>
          </div>
          <label>
            <input
              type="checkbox"
              checked={newItem.is_active}
              onChange={(event) =>
                setNewItem((prev) => ({
                  ...prev,
                  is_active: event.target.checked
                }))
              }
            />
            Active
          </label>
          <button type="button" onClick={() => createItem()}>
            Add item
          </button>
        </div>
        <p style={{ fontSize: "12px", color: "#6b5d48", marginBottom: 0, marginTop: "8px" }}>
          💡 {itemTypeExamples[newItem.type]}
        </p>
      </section>

      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Items</h3>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>ID</th>
              <th style={cellStyle}>SKU</th>
              <th style={cellStyle}>Name</th>
              <th style={cellStyle}>Type</th>
              <th style={cellStyle}>Active</th>
              <th style={cellStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={cellStyle}>{item.id}</td>
                <td style={cellStyle}>
                  <input
                    value={item.sku ?? ""}
                    onChange={(event) =>
                      setItems((prev) =>
                        prev.map((entry) =>
                          entry.id === item.id ? { ...entry, sku: event.target.value || null } : entry
                        )
                      )
                    }
                    style={inputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    value={item.name}
                    onChange={(event) =>
                      setItems((prev) =>
                        prev.map((entry) =>
                          entry.id === item.id ? { ...entry, name: event.target.value } : entry
                        )
                      )
                    }
                    style={inputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <select
                    value={item.type}
                    onChange={(event) =>
                      setItems((prev) =>
                        prev.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, type: event.target.value as ItemType }
                            : entry
                        )
                      )
                    }
                    style={inputStyle}
                  >
                    {itemTypeOptions.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={cellStyle}>
                  <input
                    type="checkbox"
                    checked={item.is_active}
                    onChange={(event) =>
                      setItems((prev) =>
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
                  <button type="button" onClick={() => saveItem(item)}>
                    Save
                  </button>
                  <button type="button" onClick={() => deleteItem(item.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Create Price</h3>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <select
            value={newPrice.item_id}
            onChange={(event) =>
              setNewPrice((prev) => ({
                ...prev,
                item_id: Number(event.target.value)
              }))
            }
            style={inputStyle}
          >
            <option value={0}>Select item</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.type})
              </option>
            ))}
          </select>
          <input
            placeholder="Price"
            value={newPrice.price}
            onChange={(event) => setNewPrice((prev) => ({ ...prev, price: event.target.value }))}
            style={inputStyle}
          />
          <label>
            <input
              type="checkbox"
              checked={newPrice.is_active}
              onChange={(event) =>
                setNewPrice((prev) => ({
                  ...prev,
                  is_active: event.target.checked
                }))
              }
            />
            Active
          </label>
          <button type="button" onClick={() => createPrice()}>
            Add price
          </button>
        </div>
        {newPrice.item_id > 0 && (() => {
          const selectedItem = itemMap.get(newPrice.item_id);
          if (!selectedItem) return null;
          const warning = getItemTypeWarning(selectedItem.type, newPrice.price.trim().length > 0);
          if (!warning) return null;
          return (
            <p style={{ fontSize: "12px", color: "#a67c00", marginBottom: 0, marginTop: "8px", backgroundColor: "#fff9e6", padding: "8px", borderRadius: "4px" }}>
              {warning}
            </p>
          );
        })()}
      </section>

      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Outlet Prices</h3>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>ID</th>
              <th style={cellStyle}>Item</th>
              <th style={cellStyle}>Price</th>
              <th style={cellStyle}>Active</th>
              <th style={cellStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((price) => (
              <tr key={price.id}>
                <td style={cellStyle}>{price.id}</td>
                <td style={cellStyle}>
                  <select
                    value={price.item_id}
                    onChange={(event) =>
                      setPrices((prev) =>
                        prev.map((entry) =>
                          entry.id === price.id
                            ? { ...entry, item_id: Number(event.target.value) }
                            : entry
                        )
                      )
                    }
                    style={inputStyle}
                  >
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={cellStyle}>
                  <input
                    value={price.price}
                    onChange={(event) =>
                      setPrices((prev) =>
                        prev.map((entry) =>
                          entry.id === price.id
                            ? { ...entry, price: Number(event.target.value || "0") }
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
                    checked={price.is_active}
                    onChange={(event) =>
                      setPrices((prev) =>
                        prev.map((entry) =>
                          entry.id === price.id
                            ? { ...entry, is_active: event.target.checked }
                            : entry
                        )
                      )
                    }
                  />
                </td>
                <td style={cellStyle}>
                  <button type="button" onClick={() => savePrice(price)}>
                    Save
                  </button>
                  <button type="button" onClick={() => deletePrice(price.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {prices.length === 0 ? <p>No prices for selected outlet.</p> : null}
      </section>

      <section style={boxStyle}>
        <strong>Quick checks</strong>
        <p style={{ marginBottom: 0 }}>
          Loaded {items.length} items and {prices.length} prices for outlet #{selectedOutletId}. First
          visible item: {itemMap.get(items[0]?.id ?? -1)?.name ?? "-"}
        </p>
      </section>
    </div>
  );
}
