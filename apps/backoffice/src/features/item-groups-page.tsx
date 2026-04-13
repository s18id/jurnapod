// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  FileInput,
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
  Textarea,
  Title
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconUpload, IconPlus, IconDownload } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";

import { ImportStepBadges } from "../components/import-step-badges";
import { OfflinePage } from "../components/offline-page";
import { StaleDataWarning } from "../components/stale-data-warning";
import { apiRequest, ApiError } from "../lib/api-client";
import { CacheService, buildCacheKey } from "../lib/cache-service";
import { useOnlineStatus } from "../lib/connection";
import { readImportFile } from "../lib/import/delimited";
import type { SessionUser } from "../lib/session";

import {
  parseDelimited,
  normalizeImportRow,
  buildImportPlan,
  computeImportSummary,
  buildItemGroupsCsv,
  downloadCsv,
  type ItemGroupExportRow,
  type ImportPlanRow,
  type ImportSummary,
  type ApplyResult
} from "./item-groups-import-utils";

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
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [groupDraft, setGroupDraft] = useState<{
    code: string;
    name: string;
    parent_id: number | null;
    is_active: boolean;
  } | null>(null);
  const [savingGroupId, setSavingGroupId] = useState<number | null>(null);

  const [importOpened, importHandlers] = useDisclosure(false);
  const [importStep, setImportStep] = useState<"source" | "preview" | "apply">("source");
  const [importText, setImportText] = useState("");
  const [importPlan, setImportPlan] = useState<ImportPlanRow[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary>({
    create: 0,
    error: 0,
    total: 0
  });
  const [isApplying, setIsApplying] = useState(false);
  const [applyResults, setApplyResults] = useState<ApplyResult[]>([]);

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
      const groups = (isOnline
        ? await CacheService.refreshItemGroups(props.user.company_id)
        : await CacheService.getCachedItemGroups(props.user.company_id, { allowStale: true })) as ItemGroup[];
      setItemGroups(groups);
      if (editingGroupId !== null) {
        const editedGroupStillExists = groups.some((g) => g.id === editingGroupId);
        if (!editedGroupStillExists) {
          cancelEditGroup();
        }
      }
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
        }
      );
      setNewGroup({ code: "", name: "", parent_id: null, is_active: true });
      await refreshData();
    } catch (createError) {
      if (createError instanceof ApiError) {
        setCreateError(createError.message);
      }
    }
  }

  function startEditGroup(group: ItemGroup) {
    setError(null);
    setEditingGroupId(group.id);
    setGroupDraft({
      code: group.code ?? "",
      name: group.name,
      parent_id: group.parent_id,
      is_active: group.is_active
    });
  }

  function cancelEditGroup() {
    setEditingGroupId(null);
    setGroupDraft(null);
  }

  async function saveDraftGroup(group: ItemGroup) {
    if (!groupDraft) return;
    if (!groupDraft.name.trim()) {
      setError("Group name is required");
      return;
    }

    setSavingGroupId(group.id);
    try {
      await apiRequest(
        `/inventory/item-groups/${group.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            code: groupDraft.code.trim() || null,
            name: groupDraft.name.trim(),
            parent_id: groupDraft.parent_id,
            is_active: groupDraft.is_active
          })
        }
      );
      await refreshData();
      cancelEditGroup();
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      }
    } finally {
      setSavingGroupId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDeleteGroup) return;

    setDeleting(true);
    try {
      await apiRequest(`/inventory/item-groups/${confirmDeleteGroup.id}`, { method: "DELETE" });
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

  function handleFileSelect(file: File | null) {
    readImportFile(file).then((text) => {
      if (text) setImportText(text);
    });
  }

  function processImportText() {
    const parsed = parseDelimited(importText);
    if (parsed.length < 2) {
      setError("Import file must have a header row and at least one data row");
      return;
    }

    const header = parsed[0];
    const body = parsed.slice(1);
    const rows = body.map((cells) => normalizeImportRow(cells, header));

    const plan = buildImportPlan(rows, itemGroups);
    setImportPlan(plan);

    const summary = computeImportSummary(plan);
    setImportSummary(summary);

    setImportStep("preview");
  }

  async function runImport() {
    setIsApplying(true);
    setImportStep("apply");
    setApplyResults([]);

    const results: ApplyResult[] = [];

    const actionable = importPlan.filter((p) => p.action === "CREATE");

    try {
      const res = await apiRequest<{ success: true; data: { created_count: number; groups: ItemGroup[] } }>(
        "/inventory/item-groups/bulk",
        {
          method: "POST",
          body: JSON.stringify({
            rows: actionable.map((p) => ({
              code: p.original.code,
              name: p.original.name,
              parent_code: p.original.parent_code,
              is_active: p.original.is_active
            }))
          })
        }
      );

      for (let i = 0; i < actionable.length; i++) {
        results.push({
          rowIndex: actionable[i].rowIndex,
          action: "CREATE",
          success: true,
          groupId: res.data.groups[i]?.id
        });
      }

      setApplyResults(results);
      await refreshData();
    } catch (err) {
      for (let i = 0; i < actionable.length; i++) {
        results.push({
          rowIndex: actionable[i].rowIndex,
          action: "CREATE",
          success: false,
          error: err instanceof ApiError ? err.message : "Unknown error"
        });
      }
      setApplyResults(results);
    } finally {
      setIsApplying(false);
    }
  }

  function resetImportState() {
    setImportStep("source");
    setImportText("");
    setImportPlan([]);
    setImportSummary({ create: 0, error: 0, total: 0 });
    setApplyResults([]);
  }

  function handleExportCsv() {
    if (filteredGroups.length === 0) {
      setError("No item groups to export");
      return;
    }

    try {
      const exportRows: ItemGroupExportRow[] = filteredGroups.map((group) => {
        const parent = group.parent_id != null ? groupMap.get(group.parent_id) : null;
        return {
          id: group.id,
          code: group.code,
          name: group.name,
          parent_id: group.parent_id,
          parent_code: parent?.code ?? null,
          parent_name: parent?.name ?? null,
          hierarchy_path: getGroupPath(group.id),
          is_active: group.is_active,
          updated_at: group.updated_at
        };
      });

      const csv = buildItemGroupsCsv(exportRows);
      const now = new Date();
      const timestamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
      const filename = `item-groups-${timestamp}.csv`;
      downloadCsv(csv, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export CSV");
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
              <Group gap="sm">
                <Button variant="light" leftSection={<IconDownload size={16} />} onClick={handleExportCsv} disabled={filteredGroups.length === 0}>
                  Export CSV
                </Button>
                <Button variant="light" leftSection={<IconUpload size={16} />} onClick={() => importHandlers.open()}>
                  Import groups
                </Button>
                <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => document.getElementById("create-group-card")?.scrollIntoView({ behavior: "smooth" })}>
                  Add one group
                </Button>
              </Group>
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
        <Card id="create-group-card">
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
                    {filteredGroups.map((group) => {
                      const isEditing = editingGroupId === group.id;
                      const anotherRowEditing = editingGroupId !== null && !isEditing;
                      const draft = isEditing ? groupDraft : null;

                      return (
                        <Table.Tr key={group.id}>
                          <Table.Td>{group.id}</Table.Td>
                          <Table.Td>
                            {isEditing && draft ? (
                              <TextInput
                                size="xs"
                                value={draft.code}
                                onChange={(event) =>
                                  setGroupDraft((prev) => (prev ? { ...prev, code: event.currentTarget.value } : prev))
                                }
                                aria-label={`Code for ${group.name}`}
                              />
                            ) : (
                              <Text size="sm">{group.code ?? "-"}</Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            {isEditing && draft ? (
                              <TextInput
                                size="xs"
                                value={draft.name}
                                onChange={(event) =>
                                  setGroupDraft((prev) => (prev ? { ...prev, name: event.currentTarget.value } : prev))
                                }
                                error={!draft.name.trim() && error ? "Name required" : null}
                                aria-label={`Name for ${group.name}`}
                              />
                            ) : (
                              <Text size="sm">{group.name}</Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            {isEditing && draft ? (
                              <Select
                                size="xs"
                                data={[
                                  { value: "", label: "No parent" },
                                  ...getParentOptions(group.id).map((opt) => ({
                                    value: String(opt.id),
                                    label: formatGroupOption(opt)
                                  }))
                                ]}
                                value={draft.parent_id != null ? String(draft.parent_id) : ""}
                                onChange={(value) =>
                                  setGroupDraft((prev) =>
                                    prev ? { ...prev, parent_id: value ? Number(value) : null } : prev
                                  )
                                }
                                aria-label={`Parent for ${group.name}`}
                              />
                            ) : (
                              <Text size="sm" c="dimmed">
                                {group.parent_id != null ? getGroupPath(group.parent_id) : "-"}
                              </Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs" c="dimmed">
                              {getGroupPath(group.id)}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            {isEditing && draft ? (
                              <Group gap="xs">
                                <Switch
                                  size="sm"
                                  checked={draft.is_active}
                                  onChange={(event) =>
                                    setGroupDraft((prev) =>
                                      prev ? { ...prev, is_active: event.currentTarget.checked } : prev
                                    )
                                  }
                                  aria-label={`Active status for ${group.name}`}
                                />
                                <Badge
                                  size="sm"
                                  color={draft.is_active ? "green" : "gray"}
                                  variant="light"
                                >
                                  {draft.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </Group>
                            ) : (
                              <Badge
                                size="sm"
                                color={group.is_active ? "green" : "gray"}
                                variant="light"
                              >
                                {group.is_active ? "Active" : "Inactive"}
                              </Badge>
                            )}
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs">
                              {isEditing && draft ? (
                                <>
                                  <Button
                                    size="xs"
                                    color="green"
                                    onClick={() => saveDraftGroup(group)}
                                    loading={savingGroupId === group.id}
                                    disabled={!draft.name.trim()}
                                    aria-label={`Save ${group.name}`}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="light"
                                    onClick={() => cancelEditGroup()}
                                    disabled={savingGroupId === group.id}
                                    aria-label={`Cancel ${group.name}`}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    size="xs"
                                    variant="light"
                                    onClick={() => startEditGroup(group)}
                                    disabled={anotherRowEditing}
                                    aria-label={`Edit ${group.name}`}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    size="xs"
                                    color="red"
                                    variant="light"
                                    onClick={() => setConfirmDeleteGroup(group)}
                                    disabled={anotherRowEditing}
                                    aria-label={`Delete ${group.name}`}
                                  >
                                    Delete
                                  </Button>
                                </>
                              )}
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
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
              Are you sure you want to delete group{' '}
              <Text span fw={600}>&quot;{confirmDeleteGroup?.name}&quot;</Text>?
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

        {/* Import Modal */}
        <Modal
          opened={importOpened}
          onClose={() => {
            importHandlers.close();
            resetImportState();
          }}
          title={<Title order={4}>Import Item Groups</Title>}
          size="lg"
          centered
        >
          <Stack>
            <ImportStepBadges step={importStep} />

            {importStep === "source" && (
              <Stack>
                <Textarea
                  label="Paste CSV data"
                  description="Format: code, name, parent_code, is_active"
                  placeholder="code,name,parent_code,is_active&#10;GRP001,Main Group,true&#10;GRP002,Sub Group,GRP001,true"
                  value={importText}
                  onChange={(event) => setImportText(event.currentTarget.value)}
                  minRows={6}
                />
                <Text size="sm" c="dimmed">
                  Or upload a file
                </Text>
                <FileInput
                  placeholder="Select CSV or TXT file"
                  accept=".csv,.txt"
                  onChange={handleFileSelect}
                />
                <Button onClick={processImportText} disabled={!importText.trim()}>
                  Preview
                </Button>
              </Stack>
            )}

            {importStep === "preview" && (
              <Stack>
                <Group gap="sm">
                  <Badge color="green">Create: {importSummary.create}</Badge>
                  <Badge color="red">Error: {importSummary.error}</Badge>
                  <Badge color="gray">Total: {importSummary.total}</Badge>
                </Group>

                {importSummary.error > 0 && (
                  <Alert color="red" title="Validation Errors">
                    Fix errors in your data before importing.
                  </Alert>
                )}

                <ScrollArea type="auto" h={300}>
                  <Table striped>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Row</Table.Th>
                        <Table.Th>Code</Table.Th>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Parent</Table.Th>
                        <Table.Th>Status</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {importPlan.slice(0, 50).map((row) => (
                        <Table.Tr key={row.rowIndex}>
                          <Table.Td>{row.rowIndex + 1}</Table.Td>
                          <Table.Td>{row.original.code ?? "-"}</Table.Td>
                          <Table.Td>{row.original.name}</Table.Td>
                          <Table.Td>{row.original.parent_code ?? "-"}</Table.Td>
                          <Table.Td>
                            {row.action === "CREATE" ? (
                              <Badge color="green" size="sm">Create</Badge>
                            ) : (
                              <Badge color="red" size="sm">{row.error}</Badge>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>

                {importSummary.create > 0 && (
                  <Button onClick={runImport} disabled={isApplying}>
                    Import ({importSummary.create} groups)
                  </Button>
                )}
                <Button variant="default" onClick={() => setImportStep("source")}>
                  Back
                </Button>
              </Stack>
            )}

            {importStep === "apply" && (
              <Stack>
                {isApplying ? (
                  <Stack align="center" gap="md">
                    <Loader size="lg" />
                    <Text>Importing...</Text>
                  </Stack>
                ) : (
                  <Stack>
                    <Alert color={applyResults.every((r) => r.success) ? "green" : "yellow"}>
                      {applyResults.filter((r) => r.success).length} of {applyResults.length} groups imported
                    </Alert>
                    <Button
                      onClick={() => {
                        importHandlers.close();
                        resetImportState();
                      }}
                    >
                      Done
                    </Button>
                  </Stack>
                )}
              </Stack>
            )}
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}
