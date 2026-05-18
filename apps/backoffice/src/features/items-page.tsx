// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Stack,
  Title,
  Text,
  Group,
  Button,
  Alert,
  Loader,
  Modal,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconPlus,
  IconDownload,
  IconTag,
  IconBan,
  IconUpload,
} from "@tabler/icons-react";
import { useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { ExportDialog } from "../components/export-dialog";
import { useAccounts } from "../hooks/use-accounts";
import { useItemGroups } from "../hooks/use-item-groups";
import { useCreateItem } from "../hooks/use-create-item";
import { useUpdateItem } from "../hooks/use-update-item";
import { itemsQueryKeys } from "../hooks/use-items-query";
import type { Item } from "../hooks/use-items";
import { actionGates, resolveEffectivePermissions } from "../lib/auth/permissions";
import { canShowInventoryExport } from "../lib/export-permissions";
import type { SessionUser } from "../lib/session";

import { ImageUpload } from "./image-upload";
import { ItemForm, defaultItemFormData, mapItemFormApiError, validateItemFormData, type ItemFormData } from "./items/item-form";
import { ItemList, type ItemListState } from "./items/item-list";
import { ItemBarcodeManager } from "./item-barcode-manager";
import { ItemImageGallery } from "./item-image-gallery";
import { StagedImportWorkflow } from "./import/staged-import-workflow";
import { RecipeCompositionEditor } from "./recipe-composition-editor";
import { VariantManager } from "./variant-manager";

interface ItemsPageProps {
  user: SessionUser;
}

export function ItemsPage({ user }: ItemsPageProps) {
  const isMobile = useMediaQuery("(max-width: 48em)");
  const queryClient = useQueryClient();
  const createItemMutation = useCreateItem();
  const updateItemMutation = useUpdateItem();

  const {
    itemGroups,
    loading: groupsLoading,
    error: groupsError,
    groupMap,
  } = useItemGroups({ user });

  // Account hooks for COGS and Inventory Asset accounts
  const { data: expenseAccounts, loading: expenseAccountsLoading } = useAccounts(
    user.company_id,
    
    { is_active: true }
  );
  const { data: assetAccounts, loading: assetAccountsLoading } = useAccounts(
    user.company_id,
    
    { is_active: true }
  );

  const [listRefreshToken, setListRefreshToken] = useState(0);
  const [listState, setListState] = useState<ItemListState>({
    filters: { groupId: null, status: true },
    totalCount: 0,
  });

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

  // Export dialog state
  const [exportDialogOpen, { open: openExportDialog, close: closeExportDialog }] =
    useDisclosure(false);

  // Form states
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [deletingItem, setDeletingItem] = useState<Item | null>(null);
  const [formData, setFormData] = useState<ItemFormData>(defaultItemFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const permissionGates = useMemo(() => {
    const effectivePermissions = resolveEffectivePermissions(user) ?? [];
    return actionGates(effectivePermissions, "inventory", "items", ["READ", "CREATE", "UPDATE", "DELETE"]);
  }, [user]);
  const canExport = useMemo(() => canShowInventoryExport(user), [user]);

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

  // Form handlers
  const resetForm = () => {
    setFormData(defaultItemFormData);
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

  const openDelete = (item: Item) => {
    setDeletingItem(item);
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
    const errors = validateItemFormData(formData);
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const refreshItems = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: itemsQueryKeys.all });
    setListRefreshToken((current) => current + 1);
  }, [queryClient]);

  const handleCreate = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    setActionError(null);

    try {
      await createItemMutation.mutateAsync(formData);

      closeCreateModal();
      resetForm();
      await refreshItems();
    } catch (err) {
      const errors = mapItemFormApiError(err);
      setFormErrors(errors);
      setActionError(errors.form ?? errors.sku ?? "Failed to create item");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingItem || !validateForm()) return;

    setSubmitting(true);
    setActionError(null);

    try {
      await updateItemMutation.mutateAsync({ id: editingItem.id, patch: formData });

      closeEditModal();
      setEditingItem(null);
      resetForm();
      await refreshItems();
    } catch (err) {
      const errors = mapItemFormApiError(err);
      setFormErrors(errors);
      setActionError(errors.form ?? errors.sku ?? "Failed to update item");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;

    setSubmitting(true);
    setActionError(null);

    try {
      await updateItemMutation.mutateAsync({ id: deletingItem.id, patch: { is_active: false } });

      closeDeleteModal();
      setDeletingItem(null);
      await refreshItems();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to deactivate item"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    // Open export dialog with current filters
    openExportDialog();
  };

  // Build export filters from current filter state
  const getExportFilters = useCallback(() => {
    return {
      search: listState.filters.search,
      type: listState.filters.type,
      groupId: listState.filters.groupId,
      status: listState.filters.status,
    };
  }, [listState.filters.groupId, listState.filters.search, listState.filters.status, listState.filters.type]);

  const handleImportComplete = () => {
    closeImportModal();
    refreshItems();
  };

  // Loading state
  if (groupsLoading) {
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
  if (groupsError) {
    return (
      <Stack gap="md" p="md">
        <Title order={2}>Items</Title>
        <Alert color="red" title="Error loading data">
          {groupsError}
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
          {permissionGates.CREATE && (
            <Button
              variant="light"
              leftSection={<IconUpload size={16} />}
              onClick={openImportModal}
            >
              Import
            </Button>
          )}
          {permissionGates.CREATE && !isMobile && (
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={openCreate}
            >
              Create Item
            </Button>
          )}
          {canExport && (
            <Button
              variant="default"
              leftSection={<IconDownload size={16} />}
              onClick={handleExport}
            >
              Export
            </Button>
          )}
        </Group>
      </Group>

      <ItemList
        user={user}
        itemGroups={itemGroups}
        groupMap={groupMap}
        permissions={{ canUpdate: permissionGates.UPDATE, canDelete: permissionGates.DELETE }}
        refreshToken={listRefreshToken}
        onListStateChange={setListState}
        onEdit={openEdit}
        onDeactivate={openDelete}
        onManageRecipe={openRecipeEditorForItem}
        onManageVariants={openVariantManagerForItem}
        onManageBarcodeImages={openBarcodeImageManagerForItem}
      />

      {permissionGates.CREATE && isMobile && (
        <Button
          aria-label="Create Item"
          data-testid="items-create-fab"
          onClick={openCreate}
          radius="xl"
          leftSection={<IconPlus size={18} />}
          style={{ position: "fixed", right: 24, bottom: 24, zIndex: 100 }}
        >
          Create
        </Button>
      )}

      {/* Create Item Modal */}
      <Modal
        opened={createModalOpen}
        onClose={closeCreateModal}
        title="Create New Item"
        size="md"
      >
        <ItemForm
          value={formData}
          errors={formErrors}
          groupOptions={groupSelectOptions}
          cogsAccountOptions={cogsAccountOptions}
          inventoryAccountOptions={inventoryAccountOptions}
          cogsAccountsLoading={expenseAccountsLoading}
          inventoryAccountsLoading={assetAccountsLoading}
          submitting={submitting}
          submitLabel="Create Item"
          onChange={setFormData}
          onSubmit={handleCreate}
          onCancel={closeCreateModal}
        />
      </Modal>

      {/* Edit Item Modal */}
      <Modal
        opened={editModalOpen}
        onClose={closeEditModal}
        title="Edit Item"
        size="md"
      >
        <ItemForm
          value={formData}
          errors={formErrors}
          groupOptions={groupSelectOptions}
          cogsAccountOptions={cogsAccountOptions}
          inventoryAccountOptions={inventoryAccountOptions}
          cogsAccountsLoading={expenseAccountsLoading}
          inventoryAccountsLoading={assetAccountsLoading}
          submitting={submitting}
          submitLabel="Save Changes"
          onChange={setFormData}
          onSubmit={handleUpdate}
          onCancel={closeEditModal}
        />
      </Modal>

      {/* Deactivate Confirmation Modal */}
      <Modal
        opened={deleteModalOpen}
        onClose={closeDeleteModal}
        title="Confirm Deactivation"
        size="sm"
      >
        <Stack gap="md">
          {actionError && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {actionError}
            </Alert>
          )}

          <Text>Are you sure you want to deactivate {deletingItem?.name ?? "this item"}?</Text>
          <Text size="sm" c="dimmed">
            The item record will be preserved and marked Inactive. It will be excluded from active catalog views by default.
          </Text>

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button color="orange" leftSection={<IconBan size={16} />} onClick={handleDelete} loading={submitting}>
              Deactivate
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Import Modal */}
      <Modal
        opened={importModalOpen}
        onClose={closeImportModal}
        title="Import Items"
        size="xl"
        fullScreen={isMobile}
      >
        <StagedImportWorkflow
          entityType="items"
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
              itemId={editingBarcodeImageItem.id}
              itemName={editingBarcodeImageItem.name}
              onUploadSuccess={() => {
                // Refresh images in the gallery
              }}
            />

            <ItemImageGallery
              user={user}
              itemId={editingBarcodeImageItem.id}
              itemName={editingBarcodeImageItem.name}
              onImagesChange={() => {
                refreshItems();
              }}
            />
          </Stack>
        )}
      </Modal>

      {/* Export Dialog */}
      <ExportDialog
        opened={exportDialogOpen}
        onClose={closeExportDialog}
        entityType="items"
        initialFilters={getExportFilters()}
        estimatedRowCount={listState.totalCount}
      />
    </Stack>
  );
}
