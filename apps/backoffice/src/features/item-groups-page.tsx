// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "../lib/api-client";
import { CacheService, buildCacheKey } from "../lib/cache-service";
import { useOnlineStatus } from "../lib/connection";
import { StaleDataWarning } from "../components/stale-data-warning";
import { OfflinePage } from "../components/offline-page";
import type { SessionUser } from "../lib/session";

type ItemGroup = {
  id: number;
  company_id: number;
  parent_id: number | null;
  code: string | null;
  name: string;
  is_active: boolean;
  updated_at: string;
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

type ItemGroupsPageProps = {
  user: SessionUser;
  accessToken: string;
};

export function ItemGroupsPage(props: ItemGroupsPageProps) {
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newGroup, setNewGroup] = useState({
    code: "",
    name: "",
    parent_id: null as number | null,
    is_active: true
  });
  const isOnline = useOnlineStatus();

  const groupMap = useMemo(() => new Map(itemGroups.map((group) => [group.id, group])), [itemGroups]);

  const sortedGroups = useMemo(
    () => [...itemGroups].sort((a, b) => a.name.localeCompare(b.name)),
    [itemGroups]
  );

  const childrenMap = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const group of itemGroups) {
      if (group.parent_id == null) {
        continue;
      }
      const siblings = map.get(group.parent_id) ?? [];
      siblings.push(group.id);
      map.set(group.parent_id, siblings);
    }
    return map;
  }, [itemGroups]);

  function collectDescendants(groupId: number): Set<number> {
    const visited = new Set<number>();
    const stack = [...(childrenMap.get(groupId) ?? [])];

    while (stack.length > 0) {
      const current = stack.pop();
      if (current == null || visited.has(current)) {
        continue;
      }
      visited.add(current);
      const children = childrenMap.get(current);
      if (children) {
        stack.push(...children);
      }
    }

    return visited;
  }

  function getGroupPath(groupId: number | null): string {
    if (groupId == null) {
      return "Ungrouped";
    }

    const parts: string[] = [];
    let currentId: number | null = groupId;
    const visited = new Set<number>();

    while (typeof currentId === "number") {
      if (visited.has(currentId)) {
        break;
      }
      visited.add(currentId);
      const group = groupMap.get(currentId);
      if (!group) {
        break;
      }
      parts.unshift(group.name);
      currentId = group.parent_id ?? null;
    }

    return parts.length > 0 ? parts.join(" > ") : "Ungrouped";
  }

  function getGroupDepth(groupId: number): number {
    let depth = 0;
    let currentId: number | null = groupId;
    const visited = new Set<number>();

    while (typeof currentId === "number") {
      if (visited.has(currentId)) {
        break;
      }
      visited.add(currentId);
      const group = groupMap.get(currentId);
      if (!group || group.parent_id == null) {
        break;
      }
      depth += 1;
      currentId = group.parent_id;
    }

    return depth;
  }

  function formatGroupOption(group: ItemGroup): string {
    const depth = getGroupDepth(group.id);
    const prefix = depth > 0 ? `${"  ".repeat(depth)}- ` : "";
    const label = group.code ? `${group.code} - ${group.name}` : group.name;
    return `${prefix}${label}`;
  }

  function getParentOptions(currentGroupId?: number): ItemGroup[] {
    if (!currentGroupId) {
      return sortedGroups;
    }

    const descendants = collectDescendants(currentGroupId);
    return sortedGroups.filter(
      (group) => group.id !== currentGroupId && !descendants.has(group.id)
    );
  }

  async function refreshData() {
    setLoading(true);
    setError(null);
    try {
      const groups = isOnline
        ? await CacheService.refreshItemGroups(props.user.company_id, props.accessToken)
        : await CacheService.getCachedItemGroups(props.user.company_id, props.accessToken, { allowStale: true });
      setItemGroups(groups as ItemGroup[]);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError(isOnline ? "Failed to load item groups" : "No cached item groups available offline");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshData().catch(() => undefined);
  }, [isOnline]);

  async function createGroup() {
    if (!newGroup.name.trim()) {
      setError("Group name is required");
      return;
    }

    try {
      await apiRequest(
        "/inventory/item-groups",
        {
          method: "POST",
          body: JSON.stringify({
            code: newGroup.code.trim() || null,
            name: newGroup.name.trim(),
            parent_id: newGroup.parent_id,
            is_active: newGroup.is_active
          })
        },
        props.accessToken
      );
      setNewGroup({ code: "", name: "", parent_id: null, is_active: true });
      await refreshData();
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      }
    }
  }

  async function saveGroup(group: ItemGroup) {
    if (!group.name.trim()) {
      setError("Group name is required");
      return;
    }

    try {
      await apiRequest(
        `/inventory/item-groups/${group.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            code: group.code?.trim() || null,
            name: group.name.trim(),
            parent_id: group.parent_id,
            is_active: group.is_active
          })
        },
        props.accessToken
      );
      await refreshData();
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      }
    }
  }

  async function deleteGroup(groupId: number) {
    try {
      await apiRequest(`/inventory/item-groups/${groupId}`, { method: "DELETE" }, props.accessToken);
      await refreshData();
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      }
    }
  }

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Item Groups"
        message="Item group changes require a connection."
      />
    );
  }

  return (
    <div>
      <section style={boxStyle}>
        <h2 style={{ marginTop: 0 }}>Item Groups</h2>
        <p style={{ marginTop: 0, color: "#6b5d48" }}>
          Organize items by optional groups for reporting and POS catalogs.
        </p>
        <StaleDataWarning
          cacheKey={buildCacheKey("item_groups", { companyId: props.user.company_id })}
          label="item groups"
        />
        {loading ? <p>Loading data...</p> : null}
        {error ? <p style={{ color: "#8d2626" }}>{error}</p> : null}
      </section>

      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Create Group</h3>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "flex-start" }}>
          <input
            placeholder="Code"
            value={newGroup.code}
            onChange={(event) => setNewGroup((prev) => ({ ...prev, code: event.target.value }))}
            style={inputStyle}
          />
          <input
            placeholder="Group name"
            value={newGroup.name}
            onChange={(event) => setNewGroup((prev) => ({ ...prev, name: event.target.value }))}
            style={inputStyle}
          />
          <select
            value={newGroup.parent_id ?? ""}
            onChange={(event) =>
              setNewGroup((prev) => ({
                ...prev,
                parent_id: event.target.value ? Number(event.target.value) : null
              }))
            }
            style={inputStyle}
          >
            <option value="">No parent</option>
            {sortedGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {formatGroupOption(group)}
              </option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              checked={newGroup.is_active}
              onChange={(event) =>
                setNewGroup((prev) => ({
                  ...prev,
                  is_active: event.target.checked
                }))
              }
            />
            Active
          </label>
          <button type="button" onClick={() => createGroup()}>
            Add group
          </button>
        </div>
      </section>

      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Groups</h3>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>ID</th>
              <th style={cellStyle}>Code</th>
              <th style={cellStyle}>Name</th>
              <th style={cellStyle}>Parent</th>
              <th style={cellStyle}>Hierarchy</th>
              <th style={cellStyle}>Active</th>
              <th style={cellStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {itemGroups.map((group) => (
              <tr key={group.id}>
                <td style={cellStyle}>{group.id}</td>
                <td style={cellStyle}>
                  <input
                    value={group.code ?? ""}
                    onChange={(event) =>
                      setItemGroups((prev) =>
                        prev.map((entry) =>
                          entry.id === group.id ? { ...entry, code: event.target.value || null } : entry
                        )
                      )
                    }
                    style={inputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    value={group.name}
                    onChange={(event) =>
                      setItemGroups((prev) =>
                        prev.map((entry) =>
                          entry.id === group.id ? { ...entry, name: event.target.value } : entry
                        )
                      )
                    }
                    style={inputStyle}
                  />
                </td>
                <td style={cellStyle}>
                  <select
                    value={group.parent_id ?? ""}
                    onChange={(event) =>
                      setItemGroups((prev) =>
                        prev.map((entry) =>
                          entry.id === group.id
                            ? {
                              ...entry,
                              parent_id: event.target.value ? Number(event.target.value) : null
                            }
                            : entry
                        )
                      )
                    }
                    style={inputStyle}
                  >
                    <option value="">No parent</option>
                    {getParentOptions(group.id).map((option) => (
                      <option key={option.id} value={option.id}>
                        {formatGroupOption(option)}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={cellStyle}>
                  <span style={{ color: "#6b5d48", fontSize: "12px" }}>
                    {getGroupPath(group.id)}
                  </span>
                </td>
                <td style={cellStyle}>
                  <input
                    type="checkbox"
                    checked={group.is_active}
                    onChange={(event) =>
                      setItemGroups((prev) =>
                        prev.map((entry) =>
                          entry.id === group.id
                            ? { ...entry, is_active: event.target.checked }
                            : entry
                        )
                      )
                    }
                  />
                </td>
                <td style={cellStyle}>
                  <button type="button" onClick={() => saveGroup(group)}>
                    Save
                  </button>
                  <button type="button" onClick={() => deleteGroup(group.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {itemGroups.length === 0 ? <p>No item groups yet.</p> : null}
      </section>
    </div>
  );
}
