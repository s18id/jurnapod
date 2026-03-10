// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
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

type ItemGroupsPageProps = {
  user: SessionUser;
  accessToken: string;
};

export function ItemGroupsPage(props: ItemGroupsPageProps) {
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<ItemGroup | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newGroup, setNewGroup] = useState({
    code: "",
    name: "",
    parent_id: null as number | null,
    is_active: true
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  const groupMap = useMemo(() => new Map(itemGroups.map((group) => [group.id, group])), [itemGroups]);

  const sortedGroups = useMemo(
    () => [...itemGroups].sort((a, b) => a.name.localeCompare(b.name)),
    [itemGroups]
  );

  const filteredGroups = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return sortedGroups;
    return sortedGroups.filter((group) => {
      const path = getGroupPath(group.id).toLowerCase();
      return (
        group.name.toLowerCase().includes(query) ||
        (group.code?.toLowerCase().includes(query) ?? false) ||
        path.includes(query)
      );
    });
  }, [sortedGroups, searchQuery]);

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
    setCreateError(null);
    if (!newGroup.name.trim()) {
      setCreateError("Group name is required");
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
        setCreateError(createError.message);
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

  async function handleConfirmDelete() {
    if (!confirmDeleteGroup) return;

    setDeleting(true);
    try {
      await apiRequest(`/inventory/item-groups/${confirmDeleteGroup.id}`, { method: "DELETE" }, props.accessToken);
      setConfirmDeleteGroup(null);
      await refreshData();
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      }
    } finally {
      setDeleting(false);
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

  const parentSelectData = [
    { value: "", label: "No parent" },
    ...sortedGroups.map((group) => ({
      value: String(group.id),
      label: formatGroupOption(group)
    }))
  ];

  const createNameMissing = !newGroup.name.trim();
  const canCreate = !loading && !createNameMissing;

  return (
    <Container size="lg" py="md">
      <Stack gap="md">
        {/* Header Card */}
        <Card>
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start" wrap="wrap">
              <div>
                <Title order={2}>Item Groups</Title>
                <Text c="dimmed" size="sm">
                  Organize items by optional groups for reporting and POS catalogs.
                </Text>
              </div>
            </Group>
            <StaleDataWarning
              cacheKey={buildCacheKey("item_groups", { companyId: props.user.company_id })}
              label="item groups"
            />
            {loading && (
              <Group gap="xs">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">Loading data...</Text>
              </Group>
            )}
            {error && (
              <Alert color="red" title="Error">
                {error}
              </Alert>
            )}
          </Stack>
        </Card>

        {/* Create Group Card */}
        <Card>
          <Stack gap="sm">
            <Title order={4}>Create Group</Title>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
              <TextInput
                label="Code"
                placeholder="Optional code"
                value={newGroup.code}
                onChange={(event) => setNewGroup((prev) => ({ ...prev, code: event.currentTarget.value }))}
              />
              <TextInput
                label="Name"
                placeholder="Group name"
                value={newGroup.name}
                onChange={(event) => {
                  setCreateError(null);
                  setNewGroup((prev) => ({ ...prev, name: event.currentTarget.value }));
                }}
                error={!newGroup.name.trim() && createError ? "Group name is required" : null}
                withAsterisk
              />
              <Select
                label="Parent"
                placeholder="Select parent"
                data={parentSelectData}
                value={newGroup.parent_id != null ? String(newGroup.parent_id) : ""}
                onChange={(value) =>
                  setNewGroup((prev) => ({
                    ...prev,
                    parent_id: value ? Number(value) : null
                  }))
                }
                clearable
              />
              <Group gap="sm" align="flex-end" style={{ height: 36 }}>
                <Switch
                  label="Active"
                  checked={newGroup.is_active}
                  onChange={(event) =>
                    setNewGroup((prev) => ({
                      ...prev,
                      is_active: event.currentTarget.checked
                    }))
                  }
                />
                <Button onClick={() => createGroup()} disabled={canCreate === false}>
                  Add group
                </Button>
              </Group>
            </SimpleGrid>
            {createError && newGroup.name.trim() && (
              <Alert color="red" withCloseButton onClose={() => setCreateError(null)} role="alert">
                {createError}
              </Alert>
            )}
          </Stack>
        </Card>

        {/* Groups Table Card */}
        <Card>
          <Stack gap="sm">
            <Group justify="space-between" wrap="wrap">
              <Title order={4}>Groups ({filteredGroups.length})</Title>
              <TextInput
                placeholder="Search by name, code, or path"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.currentTarget.value)}
                style={{ width: 280 }}
                aria-label="Search item groups"
              />
            </Group>

            {filteredGroups.length === 0 ? (
              <Text c="dimmed" ta="center" py="xl">
                {searchQuery ? "No groups match your search." : "No item groups yet."}
              </Text>
            ) : (
              <ScrollArea type="auto" scrollbarSize={8}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 60 }}>ID</Table.Th>
                      <Table.Th style={{ width: 100 }}>Code</Table.Th>
                      <Table.Th>Name</Table.Th>
                      <Table.Th style={{ width: 180 }}>Parent</Table.Th>
                      <Table.Th>Hierarchy</Table.Th>
                      <Table.Th style={{ width: 80 }}>Status</Table.Th>
                      <Table.Th style={{ width: 140 }}>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredGroups.map((group) => (
                      <Table.Tr key={group.id}>
                        <Table.Td>{group.id}</Table.Td>
                        <Table.Td>
                          <TextInput
                            size="xs"
                            value={group.code ?? ""}
                            onChange={(event) =>
                              setItemGroups((prev) =>
                                prev.map((entry) =>
                                  entry.id === group.id ? { ...entry, code: event.currentTarget.value || null } : entry
                                )
                              )
                            }
                            aria-label={`Code for ${group.name}`}
                          />
                        </Table.Td>
                        <Table.Td>
                          <TextInput
                            size="xs"
                            value={group.name}
                            onChange={(event) =>
                              setItemGroups((prev) =>
                                prev.map((entry) =>
                                  entry.id === group.id ? { ...entry, name: event.currentTarget.value } : entry
                                )
                              )
                            }
                            aria-label={`Name for ${group.name}`}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Select
                            size="xs"
                            data={[
                              { value: "", label: "No parent" },
                              ...getParentOptions(group.id).map((opt) => ({
                                value: String(opt.id),
                                label: formatGroupOption(opt)
                              }))
                            ]}
                            value={group.parent_id != null ? String(group.parent_id) : ""}
                            onChange={(value) =>
                              setItemGroups((prev) =>
                                prev.map((entry) =>
                                  entry.id === group.id
                                    ? {
                                        ...entry,
                                        parent_id: value ? Number(value) : null
                                      }
                                    : entry
                                )
                              )
                            }
                            aria-label={`Parent for ${group.name}`}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed">
                            {getGroupPath(group.id)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Switch
                              size="sm"
                              checked={group.is_active}
                              onChange={(event) =>
                                setItemGroups((prev) =>
                                  prev.map((entry) =>
                                    entry.id === group.id
                                      ? { ...entry, is_active: event.currentTarget.checked }
                                      : entry
                                  )
                                )
                              }
                              aria-label={`Active status for ${group.name}`}
                            />
                            <Badge
                              size="sm"
                              color={group.is_active ? "green" : "gray"}
                              variant="light"
                            >
                              {group.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Button
                              size="xs"
                              onClick={() => saveGroup(group)}
                              aria-label={`Save ${group.name}`}
                            >
                              Save
                            </Button>
                            <Button
                              size="xs"
                              color="red"
                              variant="light"
                              onClick={() => setConfirmDeleteGroup(group)}
                              aria-label={`Delete ${group.name}`}
                            >
                              Delete
                            </Button>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            )}
          </Stack>
        </Card>

        {/* Delete Confirmation Modal */}
        <Modal
          opened={confirmDeleteGroup !== null}
          onClose={() => setConfirmDeleteGroup(null)}
          title={<Title order={4}>Delete Item Group</Title>}
          centered
        >
          <Stack>
            <Text size="sm">
              Are you sure you want to delete group{" "}
              <Text span fw={600}>"{confirmDeleteGroup?.name}"</Text>? 
              This action cannot be undone.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setConfirmDeleteGroup(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button color="red" onClick={handleConfirmDelete} loading={deleting}>
                Delete
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}
