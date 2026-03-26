// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Stack,
  Card,
  Title,
  Text,
  Group,
  Button,
  Select,
  TextInput,
  Table,
  ScrollArea,
  Badge,
  Alert,
  Loader,
  Modal,
  ActionIcon,
  Checkbox,
  Menu,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconTrash,
  IconSearch,
  IconEdit,
  IconPlus,
  IconDownload,
  IconTag,
  IconDots,
  IconBan,
  IconCheck,
  IconUpload,
  IconTools,
  IconPackage,
  IconBarcode,
} from "@tabler/icons-react";
import { useState, useMemo, useCallback } from "react";

import { ImportWizard, type ImportWizardConfig, type ImportPlanRow, type ImportResult } from "../components/import-wizard";
import { useAccounts } from "../hooks/use-accounts";
import { useItemGroups } from "../hooks/use-item-groups";
import { useItemVariantStats } from "../hooks/use-item-variant-stats";
import { useItems, type Item, type ItemType } from "../hooks/use-items";
import { apiRequest } from "../lib/api-client";
import { downloadCsv, rowsToCsv } from "../lib/import/csv";
import type { SessionUser } from "../lib/session";

import { ImageUpload } from "./image-upload";
import { ItemBarcodeManager } from "./item-barcode-manager";
import { ItemImageGallery } from "./item-image-gallery";
import { RecipeCompositionEditor } from "./recipe-composition-editor";
import { VariantManager } from "./variant-manager";

interface ItemsPageProps {
  user: SessionUser;
  accessToken: string;
}

type ItemFormData = {
  sku: string | null;
  name: string;
  type: ItemType;
  item_group_id: number | null;
  cogs_account_id: number | null;
  inventory_asset_account_id: number | null;
  is_active: boolean;
};

const itemTypeOptions = [
  { value: "SERVICE", label: "Service" },
  { value: "PRODUCT", label: "Product" },
  { value: "INGREDIENT", label: "Ingredient" },
  { value: "RECIPE", label: "Recipe" },
];

export function ItemsPage({ user, accessToken }: ItemsPageProps) {
  const isMobile = useMediaQuery("(max-width: 48em)");

  // Data hooks
  const {
    items,
    loading: itemsLoading,
    error: itemsError,
    refresh: refreshItems,
  } = useItems({ user, accessToken });

  const {
    itemGroups,
    loading: groupsLoading,
    error: groupsError,
    groupMap,
  } = useItemGroups({ user, accessToken });

  // Variant stats hook for stock rollup visibility
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const {
    stats: variantStats,
    // loading: _variantStatsLoading, // Reserved for future loading state UI
  } = useItemVariantStats({ user, accessToken, itemIds });

  // Account hooks for COGS and Inventory Asset accounts
  const { data: expenseAccounts, loading: expenseAccountsLoading } = useAccounts(
    user.company_id,
    accessToken,
    { is_active: true }
  );
  const { data: assetAccounts, loading: assetAccountsLoading } = useAccounts(
    user.company_id,
    accessToken,
    { is_active: true }
  );

  // Filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<boolean | null>(true); // Default to Active

  // Modal states
  const [createModalOpen, { open: openCreateModal, close: closeCreateModal }] =
    useDisclosure(false);
  const [editModalOpen, { open: openEditModal, close: closeEditModal }] =
    useDisclosure(false);
  const [deleteModalOpen, { open: openDeleteModal, close: closeDeleteModal }] =
    useDisclosure(false);
  const [importModalOpen, { open: openImportModal, close: closeImportModal }] =
    useDisclosure(false);
  const [recipeEditorOpen, { open: openRecipeEditor, close: closeRecipeEditor }] =
    useDisclosure(false);

  // Recipe editor state
  const [editingRecipeItem, setEditingRecipeItem] = useState<Item | null>(null);

  // Variant manager state
  const [variantManagerOpen, { open: openVariantManager, close: closeVariantManager }] =
    useDisclosure(false);
  const [editingVariantItem, setEditingVariantItem] = useState<Item | null>(null);

  // Barcode and image manager state
  const [barcodeImageManagerOpen, { open: openBarcodeImageManager, close: closeBarcodeImageManager }] =
    useDisclosure(false);
  const [editingBarcodeImageItem, setEditingBarcodeImageItem] = useState<Item | null>(null);

  // Form states
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ItemFormData>({
    sku: null,
    name: "",
    type: "PRODUCT",
    item_group_id: null,
    cogs_account_id: null,
    inventory_asset_account_id: null,
    is_active: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Derived data
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const nameMatch = item.name.toLowerCase().includes(search);
        const skuMatch = item.sku?.toLowerCase().includes(search) ?? false;
        if (!nameMatch && !skuMatch) return false;
      }

      // Type filter
      if (typeFilter && item.type !== typeFilter) return false;

      // Group filter
      if (groupFilter && String(item.item_group_id) !== groupFilter) return false;

      // Status filter
      if (statusFilter !== null && item.is_active !== statusFilter) return false;

      return true;
    });
  }, [items, searchTerm, typeFilter, groupFilter, statusFilter]);

  const hasActiveFilters =
    searchTerm || typeFilter || groupFilter || statusFilter !== null;

  const groupSelectOptions = useMemo(() => {
    return itemGroups.map((group) => ({
      value: String(group.id),
      label: group.name,
    }));
  }, [itemGroups]);

  // Account options for COGS (EXPENSE type) and Inventory Asset (ASSET type)
  const cogsAccountOptions = useMemo(() => {
    const options = expenseAccounts
      .filter((acc) => acc.type_name?.toUpperCase() === "EXPENSE" && !acc.is_group)
      .map((acc) => ({
        value: String(acc.id),
        label: `${acc.code} - ${acc.name}`,
      }));
    return [{ value: "", label: "Use Company Default" }, ...options];
  }, [expenseAccounts]);

  const inventoryAccountOptions = useMemo(() => {
    const options = assetAccounts
      .filter((acc) => acc.type_name?.toUpperCase() === "ASSET" && !acc.is_group)
      .map((acc) => ({
        value: String(acc.id),
        label: `${acc.code} - ${acc.name}`,
      }));
    return [{ value: "", label: "Use Company Default" }, ...options];
  }, [assetAccounts]);

  // Helper functions
  const getGroupName = useCallback(
    (groupId: number | null) => {
      if (!groupId) return "-";
      const group = groupMap.get(groupId);
      return group?.name ?? "-";
    },
    [groupMap]
  );

  const resetFilters = () => {
    setSearchTerm("");
    setTypeFilter(null);
    setGroupFilter(null);
    setStatusFilter(true);
  };

  // Form handlers
  const resetForm = () => {
    setFormData({
      sku: null,
      name: "",
      type: "PRODUCT",
      item_group_id: null,
      cogs_account_id: null,
      inventory_asset_account_id: null,
      is_active: true,
    });
    setFormErrors({});
    setActionError(null);
  };

  const openCreate = () => {
    resetForm();
    openCreateModal();
  };

  const openEdit = (item: Item) => {
    setEditingItem(item);
    setFormData({
      sku: item.sku,
      name: item.name,
      type: item.type,
      item_group_id: item.item_group_id,
      cogs_account_id: item.cogs_account_id,
      inventory_asset_account_id: item.inventory_asset_account_id,
      is_active: item.is_active,
    });
    setFormErrors({});
    setActionError(null);
    openEditModal();
  };

  const openDelete = (itemId: number) => {
    setDeletingItemId(itemId);
    setActionError(null);
    openDeleteModal();
  };

  const openRecipeEditorForItem = (item: Item) => {
    setEditingRecipeItem(item);
    openRecipeEditor();
  };

  const openVariantManagerForItem = (item: Item) => {
    setEditingVariantItem(item);
    openVariantManager();
  };

  const openBarcodeImageManagerForItem = (item: Item) => {
    setEditingBarcodeImageItem(item);
    openBarcodeImageManager();
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Name is required";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    setActionError(null);

    try {
      await apiRequest(
        "/inventory/items",
        {
          method: "POST",
          body: JSON.stringify(formData),
        },
        accessToken
      );

      closeCreateModal();
      resetForm();
      await refreshItems();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to create item"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingItem || !validateForm()) return;

    setSubmitting(true);
    setActionError(null);

    try {
      await apiRequest(
        `/inventory/items/${editingItem.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(formData),
        },
        accessToken
      );

      closeEditModal();
      setEditingItem(null);
      resetForm();
      await refreshItems();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update item"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItemId) return;

    setSubmitting(true);
    setActionError(null);

    try {
      await apiRequest(
        `/inventory/items/${deletingItemId}`,
        {
          method: "DELETE",
        },
        accessToken
      );

      closeDeleteModal();
      setDeletingItemId(null);
      await refreshItems();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to delete item"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (item: Item) => {
    setSubmitting(true);
    setActionError(null);

    try {
      await apiRequest(
        `/inventory/items/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_active: !item.is_active }),
        },
        accessToken
      );

      await refreshItems();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update item"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    const headers = ["ID", "SKU", "Name", "Type", "Group", "Status"];
    const rows = filteredItems.map((item) => [
      item.id,
      item.sku ?? "",
      item.name,
      item.type,
      getGroupName(item.item_group_id),
      item.is_active ? "Active" : "Inactive",
    ]);
    const csv = rowsToCsv(headers, rows);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    downloadCsv(csv, `items-${date}.csv`);
  };

  // Import configuration for ImportWizard
  const importConfig: ImportWizardConfig<ItemFormData> = useMemo(() => ({
    title: "Import Items",
    entityName: "items",
    entityType: "items",
    csvTemplate: "sku,name,type,item_group_code,is_active\nSKU001,Product Name,PRODUCT,GROUP1,true",
    csvDescription: "CSV format: sku (optional), name (required), type (SERVICE/PRODUCT/INGREDIENT/RECIPE), item_group_code (optional), is_active (true/false)",
    columns: [
      { key: "sku", header: "SKU", required: false },
      { key: "name", header: "Name", required: true },
      { key: "type", header: "Type", required: true },
      { key: "item_group_code", header: "Group Code", required: false },
      { key: "is_active", header: "Active", required: false },
    ],
    parseRow: (row: Record<string, string>, _columnMap: Record<string, string>) => {
      const type = (row.type?.toUpperCase() as ItemType) || "PRODUCT";
      if (!["SERVICE", "PRODUCT", "INGREDIENT", "RECIPE"].includes(type)) {
        return null;
      }
      return {
        sku: row.sku?.trim() || null,
        name: row.name?.trim() || "",
        type,
        item_group_id: null, // Will be resolved from group code
        is_active: row.is_active?.toLowerCase() !== "false",
      };
    },
    validateRow: (parsed: Partial<ItemFormData>) => {
      if (!parsed.name?.trim()) return "Name is required";
      if (!parsed.type) return "Type is required";
      return null;
    },
    importFn: async (rows: ImportPlanRow<ItemFormData>[]) => {
      const results: ImportResult = { success: 0, failed: 0, created: 0, updated: 0, skipped: 0, errors: [] };
      
      for (const row of rows) {
        try {
          await apiRequest(
            "/inventory/items",
            {
              method: "POST",
              body: JSON.stringify(row.parsed),
            },
            accessToken
          );
          results.success++;
          results.created++;
        } catch (err) {
          results.failed++;
          results.errors.push({
            row: row.rowIndex + 1,
            error: err instanceof Error ? err.message : "Failed to create item",
          });
        }
      }
      
      await refreshItems();
      return results;
    },
    accessToken,
  }), [accessToken, refreshItems]);

  const handleImportComplete = () => {
    closeImportModal();
    refreshItems();
  };

  // Loading state
  if (itemsLoading || groupsLoading) {
    return (
      <Stack gap="md" p="md">
        <Title order={2}>Items</Title>
        <Group justify="center" py="xl">
          <Loader />
          <Text>Loading items...</Text>
        </Group>
      </Stack>
    );
  }

  // Error state
  if (itemsError || groupsError) {
    return (
      <Stack gap="md" p="md">
        <Title order={2}>Items</Title>
        <Alert color="red" title="Error loading data">
          {itemsError || groupsError}
        </Alert>
        <Button onClick={refreshItems}>Retry</Button>
      </Stack>
    );
  }

  return (
    <Stack gap="md" p="md">
      {/* Action Error Alert */}
      {actionError && (
        <Alert color="red" icon={<IconAlertCircle size={16} />} onClose={() => setActionError(null)} withCloseButton>
          {actionError}
        </Alert>
      )}

      {/* Header */}
      <Group justify="space-between" align="center" data-testid="items-page-header">
        <div>
          <Title order={2} data-testid="items-page-title">Items</Title>
          <Text size="sm" c="dimmed" data-testid="items-page-description">
            Manage your product catalog
          </Text>
        </div>
        <Group>
          <Button
            variant="light"
            leftSection={<IconTag size={16} />}
            component="a"
            href="#/prices"
          >
            Manage Prices
          </Button>
          <Button
            variant="light"
            leftSection={<IconUpload size={16} />}
            onClick={openImportModal}
          >
            Import
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={openCreate}
          >
            Create Item
          </Button>
          <Button
            variant="default"
            leftSection={<IconDownload size={16} />}
            onClick={handleExport}
          >
            Export
          </Button>
        </Group>
      </Group>

      {/* Filters */}
      <Card>
        <Stack gap="xs">
          <Group gap="sm" wrap="wrap">
            <TextInput
              placeholder="Search name or SKU..."
              leftSection={<IconSearch size={16} />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ minWidth: 200 }}
            />
            <Select
              placeholder="Type"
              value={typeFilter}
              onChange={setTypeFilter}
              data={itemTypeOptions}
              clearable
              style={{ minWidth: 140 }}
            />
            <Select
              placeholder="Group"
              value={groupFilter}
              onChange={setGroupFilter}
              data={groupSelectOptions}
              clearable
              style={{ minWidth: 160 }}
            />
            <Select
              placeholder="Status"
              value={statusFilter === null ? null : String(statusFilter)}
              onChange={(v) =>
                setStatusFilter(v === null ? null : v === "true")
              }
              data={[
                { value: "true", label: "Active" },
                { value: "false", label: "Inactive" },
              ]}
              clearable
              style={{ minWidth: 120 }}
            />
            {hasActiveFilters && (
              <Button variant="subtle" size="sm" onClick={resetFilters}>
                Clear All
              </Button>
            )}
          </Group>
          {hasActiveFilters && (
            <Group gap="xs">
              <Text size="xs" c="dimmed">
                Active filters:
              </Text>
              {searchTerm && (
                <Badge variant="light">Search: {searchTerm}</Badge>
              )}
              {typeFilter && <Badge variant="light">Type: {typeFilter}</Badge>}
              {groupFilter && (
                <Badge variant="light">
                  Group: {getGroupName(Number(groupFilter))}
                </Badge>
              )}
              {statusFilter !== null && (
                <Badge variant="light">
                  Status: {statusFilter ? "Active" : "Inactive"}
                </Badge>
              )}
            </Group>
          )}
        </Stack>
      </Card>

      {/* Items Table */}
      <Card>
        {filteredItems.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {hasActiveFilters
              ? "No items match your filters."
              : "No items found."}
          </Text>
        ) : isMobile ? (
          // Mobile card view
          <Stack gap="xs">
            {filteredItems.map((item) => (
              <Card key={item.id} withBorder>
                <Stack gap="xs">
                  <Group justify="space-between" align="flex-start">
                    <div>
                      <Text size="sm" fw={600}>
                        {item.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        #{item.id} · {item.sku ?? "No SKU"}
                      </Text>
                    </div>
                    <Badge
                      color={item.is_active ? "green" : "red"}
                      variant="light"
                    >
                      {item.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </Group>
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <Badge variant="light">{item.type}</Badge>
                      <Text size="xs" c="dimmed">
                        {getGroupName(item.item_group_id)}
                      </Text>
                      {(() => {
                        const stats = variantStats.get(item.id);
                        if (!stats || !stats.has_variants) return null;
                        return (
                          <Text size="xs" c="blue">
                            Stock: {stats.total_stock} ({stats.variant_count} variants)
                          </Text>
                        );
                      })()}
                    </Group>
                    <Menu>
                      <Menu.Target>
                        <ActionIcon variant="subtle">
                          <IconDots size={16} />
                        </ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item
                          leftSection={<IconEdit size={14} />}
                          onClick={() => openEdit(item)}
                        >
                          Edit
                        </Menu.Item>
                        {item.type === "RECIPE" && (
                          <Menu.Item
                            leftSection={<IconTools size={14} />}
                            onClick={() => openRecipeEditorForItem(item)}
                          >
                            Manage Recipe
                          </Menu.Item>
                        )}
                        <Menu.Item
                          leftSection={<IconPackage size={14} />}
                          onClick={() => openVariantManagerForItem(item)}
                        >
                          Manage Variants
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconBarcode size={14} />}
                          onClick={() => openBarcodeImageManagerForItem(item)}
                        >
                          Manage Barcode & Images
                        </Menu.Item>
                        <Menu.Item
                          leftSection={item.is_active ? <IconBan size={14} /> : <IconCheck size={14} />}
                          color={item.is_active ? "orange" : "green"}
                          onClick={() => handleToggleActive(item)}
                          disabled={submitting}
                        >
                          {item.is_active ? "Disable" : "Enable"}
                        </Menu.Item>
                        <Menu.Item
                          leftSection={<IconTrash size={14} />}
                          color="red"
                          onClick={() => openDelete(item.id)}
                        >
                          Delete
                        </Menu.Item>
                      </Menu.Dropdown>
                    </Menu>
                  </Group>
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : (
          // Desktop table view
          <ScrollArea>
            <Table highlightOnHover striped stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>SKU</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Group</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Stock</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredItems.map((item) => (
                  <Table.Tr key={item.id}>
                    <Table.Td>{item.id}</Table.Td>
                    <Table.Td>
                      <Text size="sm">{item.sku ?? "-"}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {item.name}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">
                        {getGroupName(item.item_group_id)}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light">{item.type}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge
                        color={item.is_active ? "green" : "red"}
                        variant="light"
                      >
                        {item.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      {(() => {
                        const stats = variantStats.get(item.id);
                        if (!stats || !stats.has_variants) {
                          return <Text size="sm" c="dimmed">-</Text>;
                        }
                        return (
                          <Group gap="xs">
                            <Text size="sm" fw={500}>{stats.total_stock}</Text>
                            <Text size="xs" c="dimmed">({stats.variant_count} variants)</Text>
                          </Group>
                        );
                      })()}
                    </Table.Td>
                    <Table.Td>
                      <Menu>
                        <Menu.Target>
                          <Button variant="light" size="xs">
                            Actions
                          </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconEdit size={14} />}
                            onClick={() => openEdit(item)}
                          >
                            Edit
                          </Menu.Item>
                          {item.type === "RECIPE" && (
                            <Menu.Item
                              leftSection={<IconTools size={14} />}
                              onClick={() => openRecipeEditorForItem(item)}
                            >
                              Manage Recipe
                            </Menu.Item>
                          )}
                          <Menu.Item
                            leftSection={<IconPackage size={14} />}
                            onClick={() => openVariantManagerForItem(item)}
                          >
                            Manage Variants
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconBarcode size={14} />}
                            onClick={() => openBarcodeImageManagerForItem(item)}
                          >
                            Manage Barcode & Images
                          </Menu.Item>
                          <Menu.Item
                            leftSection={item.is_active ? <IconBan size={14} /> : <IconCheck size={14} />}
                            color={item.is_active ? "orange" : "green"}
                            onClick={() => handleToggleActive(item)}
                            disabled={submitting}
                          >
                            {item.is_active ? "Disable" : "Enable"}
                          </Menu.Item>
                          <Menu.Item
                            leftSection={<IconTrash size={14} />}
                            color="red"
                            onClick={() => openDelete(item.id)}
                          >
                            Delete
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Card>

      {/* Create Item Modal */}
      <Modal
        opened={createModalOpen}
        onClose={closeCreateModal}
        title="Create New Item"
        size="md"
      >
        <Stack gap="md">
          {actionError && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {actionError}
            </Alert>
          )}

          <TextInput
            label="SKU"
            placeholder="Optional SKU code"
            value={formData.sku ?? ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                sku: e.target.value || null,
              }))
            }
          />

          <TextInput
            label="Name"
            placeholder="Item name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            error={formErrors.name}
            required
          />

          <Select
            label="Type"
            value={formData.type}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                type: (value as ItemType) || "PRODUCT",
              }))
            }
            data={itemTypeOptions}
            required
          />

          <Select
            label="Group"
            placeholder="Optional group"
            value={formData.item_group_id ? String(formData.item_group_id) : ""}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                item_group_id: value ? Number(value) : null,
              }))
            }
            data={groupSelectOptions}
            clearable
          />

          <Select
            label="COGS Account"
            placeholder="Select expense account for COGS"
            value={formData.cogs_account_id ? String(formData.cogs_account_id) : ""}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                cogs_account_id: value ? Number(value) : null,
              }))
            }
            data={cogsAccountOptions}
            disabled={expenseAccountsLoading}
            description="Expense account for Cost of Goods Sold. Uses company default if not selected."
          />

          <Select
            label="Inventory Asset Account"
            placeholder="Select asset account for inventory"
            value={formData.inventory_asset_account_id ? String(formData.inventory_asset_account_id) : ""}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                inventory_asset_account_id: value ? Number(value) : null,
              }))
            }
            data={inventoryAccountOptions}
            disabled={assetAccountsLoading}
            description="Asset account for inventory tracking. Uses company default if not selected."
          />

          <Checkbox
            label="Active"
            checked={formData.is_active}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                is_active: e.currentTarget.checked,
              }))
            }
          />

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeCreateModal}>
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={submitting}>
              Create Item
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Edit Item Modal */}
      <Modal
        opened={editModalOpen}
        onClose={closeEditModal}
        title="Edit Item"
        size="md"
      >
        <Stack gap="md">
          {actionError && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {actionError}
            </Alert>
          )}

          <TextInput
            label="SKU"
            placeholder="Optional SKU code"
            value={formData.sku ?? ""}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                sku: e.target.value || null,
              }))
            }
          />

          <TextInput
            label="Name"
            placeholder="Item name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            error={formErrors.name}
            required
          />

          <Select
            label="Type"
            value={formData.type}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                type: (value as ItemType) || "PRODUCT",
              }))
            }
            data={itemTypeOptions}
            required
          />

          <Select
            label="Group"
            placeholder="Optional group"
            value={formData.item_group_id ? String(formData.item_group_id) : ""}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                item_group_id: value ? Number(value) : null,
              }))
            }
            data={groupSelectOptions}
            clearable
          />

          <Select
            label="COGS Account"
            placeholder="Select expense account for COGS"
            value={formData.cogs_account_id ? String(formData.cogs_account_id) : ""}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                cogs_account_id: value ? Number(value) : null,
              }))
            }
            data={cogsAccountOptions}
            disabled={expenseAccountsLoading}
            description="Expense account for Cost of Goods Sold. Uses company default if not selected."
          />

          <Select
            label="Inventory Asset Account"
            placeholder="Select asset account for inventory"
            value={formData.inventory_asset_account_id ? String(formData.inventory_asset_account_id) : ""}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                inventory_asset_account_id: value ? Number(value) : null,
              }))
            }
            data={inventoryAccountOptions}
            disabled={assetAccountsLoading}
            description="Asset account for inventory tracking. Uses company default if not selected."
          />

          <Checkbox
            label="Active"
            checked={formData.is_active}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                is_active: e.currentTarget.checked,
              }))
            }
          />

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeEditModal}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} loading={submitting}>
              Save Changes
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={deleteModalOpen}
        onClose={closeDeleteModal}
        title="Confirm Delete"
        size="sm"
      >
        <Stack gap="md">
          {actionError && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {actionError}
            </Alert>
          )}

          <Text>Are you sure you want to delete this item?</Text>
          <Text size="sm" c="dimmed">
            This action cannot be undone. The item will be removed from the
            catalog.
          </Text>

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button color="red" onClick={handleDelete} loading={submitting}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Import Wizard Modal */}
      <Modal
        opened={importModalOpen}
        onClose={closeImportModal}
        title="Import Items"
        size="xl"
      >
        <ImportWizard
          config={importConfig}
          onComplete={handleImportComplete}
          onCancel={closeImportModal}
        />
      </Modal>

      {/* Recipe Composition Editor Modal */}
      {recipeEditorOpen && editingRecipeItem && (
        <RecipeCompositionEditor
          recipeId={editingRecipeItem.id}
          recipeName={editingRecipeItem.name}
          recipeSku={editingRecipeItem.sku}
          user={user}
          accessToken={accessToken}
          onClose={() => {
            closeRecipeEditor();
            setEditingRecipeItem(null);
          }}
        />
      )}

      {/* Variant Manager Modal */}
      <Modal
        opened={variantManagerOpen}
        onClose={() => {
          closeVariantManager();
          setEditingVariantItem(null);
        }}
        title={editingVariantItem ? `Manage Variants: ${editingVariantItem.name}` : "Manage Variants"}
        size="xl"
      >
        {editingVariantItem && (
          <VariantManager
            user={user}
            accessToken={accessToken}
            itemId={editingVariantItem.id}
            itemName={editingVariantItem.name}
            itemSku={editingVariantItem.sku}
            onClose={() => {
              closeVariantManager();
              setEditingVariantItem(null);
            }}
          />
        )}
      </Modal>

      {/* Barcode & Image Manager Modal */}
      <Modal
        opened={barcodeImageManagerOpen}
        onClose={() => {
          closeBarcodeImageManager();
          setEditingBarcodeImageItem(null);
        }}
        title={editingBarcodeImageItem ? `Manage Barcode & Images: ${editingBarcodeImageItem.name}` : "Manage Barcode & Images"}
        size="xl"
      >
        {editingBarcodeImageItem && (
          <Stack gap="xl">
            <ItemBarcodeManager
              user={user}
              accessToken={accessToken}
              itemId={editingBarcodeImageItem.id}
              itemName={editingBarcodeImageItem.name}
              currentBarcode={editingBarcodeImageItem.barcode}
              currentBarcodeType={editingBarcodeImageItem.barcode_type}
              onBarcodeUpdate={() => {
                refreshItems();
              }}
            />

            <ImageUpload
              user={user}
              accessToken={accessToken}
              itemId={editingBarcodeImageItem.id}
              itemName={editingBarcodeImageItem.name}
              onUploadSuccess={() => {
                // Refresh images in the gallery
              }}
            />

            <ItemImageGallery
              user={user}
              accessToken={accessToken}
              itemId={editingBarcodeImageItem.id}
              itemName={editingBarcodeImageItem.name}
              onImagesChange={() => {
                refreshItems();
              }}
            />
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
