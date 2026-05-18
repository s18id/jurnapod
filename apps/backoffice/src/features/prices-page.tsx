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
  Alert,
  Loader,
  Modal,
  SegmentedControl,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconPlus,
  IconDownload,
  IconPackage,
  IconUpload,
} from "@tabler/icons-react";
import { useState, useMemo, useCallback, useEffect } from "react";

import { ScopeBadge } from "@/components/data-grid";
import { FilterBar } from "@/components/ui/FilterBar/FilterBar";
import type { FilterValue } from "@/components/ui/FilterBar/types";
import { createCatalogPriceFilterSchema } from "@/features/inventory/catalog-filter-config";
import {
  filterPriceRows,
  derivePriceBuckets,
  mapDefaultPrices,
  resolveAllOutletPriceRows,
  resolveOutletPriceRows,
  type ItemPrice,
  type OutletSummary,
  type PriceWithItem,
  type PricingViewMode,
} from "@/features/prices/price-resolution";

import { ExportDialog } from "../components/export-dialog";
import { useItemGroups } from "../hooks/use-item-groups";
import { useItems } from "../hooks/use-items";
import { apiRequest } from "../lib/api-client";
import { actionGates, resolveEffectivePermissions } from "../lib/auth/permissions";
import { canShowInventoryExport } from "../lib/export-permissions";
import type { SessionUser } from "../lib/session";

import { StagedImportWorkflow } from "./import/staged-import-workflow";
import {
  CreatePriceModal,
  EditPriceModal,
  OverridePriceModal,
  DeletePriceModal,
  PricesMobileCard,
  PricesTable,
  type PriceFormData,
} from "./prices-page/index";

interface PricesPageProps {
  user: SessionUser;
}

export function PricesPage({ user }: PricesPageProps) {
  const isMobile = useMediaQuery("(max-width: 48em)");

  // Data hooks
  const {
    items,
    loading: itemsLoading,
    error: itemsError,
    itemMap,
  } = useItems({ user });

  const {
    loading: groupsLoading,
    error: groupsError,
    groupMap,
  } = useItemGroups({ user });

  // Pricing data state
  const [prices, setPrices] = useState<ItemPrice[]>([]);
  const [companyDefaults, setCompanyDefaults] = useState<ItemPrice[]>([]);
  const [pricesLoading, setPricesLoading] = useState(true);
  const [pricesError, setPricesError] = useState<string | null>(null);

  // Deep linking: Parse outlet from URL query params
  const getOutletIdFromUrl = useCallback((): number | null => {
    if (typeof window === "undefined") return null;
    const hash = window.location.hash;
    const queryIndex = hash.indexOf("?");
    if (queryIndex === -1) return null;
    const queryString = hash.slice(queryIndex + 1);
    const params = new URLSearchParams(queryString);
    const outletParam = params.get("outlet");
    if (!outletParam) return null;
    const outletId = parseInt(outletParam, 10);
    return isNaN(outletId) ? null : outletId;
  }, []);

  // Deep linking: Update URL with outlet query param
  const updateUrlWithOutlet = useCallback((outletId: number | null) => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const queryIndex = hash.indexOf("?");
    const baseHash = queryIndex === -1 ? hash : hash.slice(0, queryIndex);
    
    if (outletId !== null) {
      window.location.hash = `${baseHash}?outlet=${outletId}`;
    } else {
      window.location.hash = baseHash;
    }
  }, []);

  // View and filter states
  const [viewMode, setViewMode] = useState<PricingViewMode>("outlet");
  const urlOutletId = getOutletIdFromUrl();
  const initialOutletId = urlOutletId ?? user.outlets[0]?.id ?? 0;
  const [selectedOutletId, setSelectedOutletId] = useState<number>(initialOutletId);
  const [filters, setFilters] = useState<Record<string, FilterValue>>({
    search: "",
    outlet_id: String(initialOutletId),
  });

  // Modal states
  const [createModalOpen, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);
  const [overrideModalOpen, { open: openOverrideModal, close: closeOverrideModal }] = useDisclosure(false);
  const [editModalOpen, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [deleteModalOpen, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [importModalOpen, { open: openImportModal, close: closeImportModal }] = useDisclosure(false);
  const [exportDialogOpen, { open: openExportDialog, close: closeExportDialog }] = useDisclosure(false);

  // Action states
  const [editingPrice, setEditingPrice] = useState<PriceWithItem | null>(null);
  const [deletingPriceId, setDeletingPriceId] = useState<number | null>(null);
  const [deletingIsDefault, setDeletingIsDefault] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<{ itemId: number; defaultPrice: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showAllOutletColumns, setShowAllOutletColumns] = useState(false);

  const permissionGates = useMemo(() => {
    const effectivePermissions = resolveEffectivePermissions(user) ?? [];
    return actionGates(effectivePermissions, "inventory", "items", ["READ", "UPDATE"]);
  }, [user]);
  const canExport = useMemo(() => canShowInventoryExport(user), [user]);

  // Handle outlet selection change with URL update
  const handleOutletChange = useCallback((value: string | null) => {
    const outletId = value ? Number(value) : null;
    if (outletId !== null) {
      setSelectedOutletId(outletId);
      updateUrlWithOutlet(outletId);
    }
  }, [updateUrlWithOutlet]);

  const handleFilterChange = useCallback((nextFilters: Record<string, FilterValue>) => {
    setFilters(nextFilters);
    const nextOutletId = typeof nextFilters.outlet_id === "string" && nextFilters.outlet_id.length > 0
      ? Number(nextFilters.outlet_id)
      : null;
    if (viewMode === "outlet" && nextOutletId !== null && !Number.isNaN(nextOutletId) && nextOutletId !== selectedOutletId) {
      setSelectedOutletId(nextOutletId);
      updateUrlWithOutlet(nextOutletId);
    }
  }, [selectedOutletId, updateUrlWithOutlet, viewMode]);

  // Listen for hash changes to sync outlet selection (for deep linking)
  useEffect(() => {
    const handleHashChange = () => {
      const outletId = getOutletIdFromUrl();
      if (outletId !== null && outletId !== selectedOutletId) {
        // Validate outletId belongs to user's outlets
        const validOutlet = user.outlets.find(o => o.id === outletId);
        if (validOutlet) {
          setSelectedOutletId(outletId);
        }
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [getOutletIdFromUrl, selectedOutletId, user.outlets]);

  // Fetch prices
  const fetchPrices = useCallback(async () => {
    setPricesLoading(true);
    setPricesError(null);

    try {
      const pricesResponse = await apiRequest<{ data: ItemPrice[] }>("/inventory/item-prices", {});
      const buckets = derivePriceBuckets(pricesResponse.data);
      setCompanyDefaults(buckets.defaults);
      setPrices(viewMode === "outlet"
        ? buckets.outletOverrides.filter((price) => price.outlet_id === selectedOutletId)
        : buckets.outletOverrides);
    } catch (err) {
      setPricesError(err instanceof Error ? err.message : "Failed to fetch prices");
    } finally {
      setPricesLoading(false);
    }
  }, [selectedOutletId, viewMode]);

  useEffect(() => {
    fetchPrices();
  }, [fetchPrices]);

  // Outlet options
  const outletOptions = useMemo(() => {
    return user.outlets.map((outlet) => ({
      value: String(outlet.id),
      label: outlet.name,
    }));
  }, [user.outlets]);

  const selectedOutletName = useMemo(() => {
    return user.outlets.find((outlet) => outlet.id === selectedOutletId)?.name;
  }, [selectedOutletId, user.outlets]);

  const filterSchema = useMemo(() => {
    const schema = createCatalogPriceFilterSchema(viewMode === "all_outlets" ? "outlet" : viewMode, viewMode === "outlet" ? outletOptions : []);
    return {
      ...schema,
      defaultValues: {
        ...schema.defaultValues,
        outlet_id: viewMode === "outlet" ? String(selectedOutletId) : undefined,
      },
    };
  }, [outletOptions, selectedOutletId, viewMode]);

  const outletColumns = useMemo<OutletSummary[]>(() => {
    const latestOverrideByOutlet = new Map<number, ItemPrice>();
    for (const price of prices) {
      if (price.outlet_id === null) continue;
      const existing = latestOverrideByOutlet.get(price.outlet_id);
      if (!existing) {
        latestOverrideByOutlet.set(price.outlet_id, price);
        continue;
      }
      if (existing.is_active !== price.is_active) {
        if (price.is_active) latestOverrideByOutlet.set(price.outlet_id, price);
        continue;
      }
      if (price.updated_at.localeCompare(existing.updated_at) > 0) {
        latestOverrideByOutlet.set(price.outlet_id, price);
      }
    }

    const sortedOutlets = [...user.outlets].sort((left, right) => {
      const leftLatest = latestOverrideByOutlet.get(left.id);
      const rightLatest = latestOverrideByOutlet.get(right.id);
      if (leftLatest && !rightLatest) return -1;
      if (!leftLatest && rightLatest) return 1;
      if (leftLatest && rightLatest) {
        if (leftLatest.is_active !== rightLatest.is_active) return leftLatest.is_active ? -1 : 1;
        const updatedComparison = rightLatest.updated_at.localeCompare(leftLatest.updated_at);
        if (updatedComparison !== 0) return updatedComparison;
      }
      const nameComparison = left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      if (nameComparison !== 0) return nameComparison;
      return left.id - right.id;
    });

    return showAllOutletColumns ? sortedOutlets : sortedOutlets.slice(0, 5);
  }, [prices, showAllOutletColumns, user.outlets]);

  const hiddenOutletCount = viewMode === "all_outlets" && !showAllOutletColumns
    ? Math.max(0, user.outlets.length - outletColumns.length)
    : 0;

  const handleViewModeChange = useCallback((value: string) => {
    const nextMode = value as PricingViewMode;
    setViewMode(nextMode);
    setShowAllOutletColumns(false);
    setFilters({
      search: "",
      outlet_id: nextMode === "outlet" ? String(selectedOutletId) : undefined,
    });
  }, [selectedOutletId]);

  // Merge prices with hierarchy info
  const pricesWithHierarchy = useMemo((): PriceWithItem[] => {
    if (viewMode === "defaults") {
      return mapDefaultPrices(companyDefaults, itemMap);
    }

    if (viewMode === "all_outlets") {
      return resolveAllOutletPriceRows({ companyDefaults, outletPrices: prices, itemMap, outlets: user.outlets });
    }

    return resolveOutletPriceRows({ companyDefaults, outletPrices: prices, itemMap, selectedOutletName });
  }, [companyDefaults, itemMap, prices, selectedOutletName, user.outlets, viewMode]);

  // Filter prices
  const filteredPrices = useMemo(() => {
    const nextSearch = typeof filters.search === "string" ? filters.search : undefined;
    const nextScope = typeof filters.scope === "string" ? filters.scope as "override" | "default" : null;
    const nextStatus = typeof filters.status === "string" ? filters.status === "true" : null;
    return filterPriceRows(pricesWithHierarchy, {
      search: nextSearch,
      scope: nextScope,
      status: nextStatus,
      viewMode,
    });
  }, [filters.scope, filters.search, filters.status, pricesWithHierarchy, viewMode]);

  const hasActiveFilters = Boolean(
    (typeof filters.search === "string" && filters.search.trim()) ||
    filters.scope ||
    filters.status
  );

  const getGroupName = useCallback(
    (groupId: number | null) => {
      if (!groupId) return "-";
      const group = groupMap.get(groupId);
      return group?.name ?? "-";
    },
    [groupMap]
  );

  const resetFilters = () => {
    setFilters({
      search: "",
      outlet_id: viewMode === "outlet" ? String(selectedOutletId) : undefined,
    });
  };

  // Action handlers
  const openEdit = (price: PriceWithItem) => {
    setEditingPrice(price);
    openEditModal();
  };

  const openSetOverride = (itemId: number, defaultPrice: number) => {
    setOverrideTarget({ itemId, defaultPrice });
    openOverrideModal();
  };

  const openDelete = (price: PriceWithItem) => {
    setDeletingPriceId(price.id);
    setDeletingIsDefault(price.outlet_id === null);
    openDeleteModal();
  };

  const handleCreate = async (formData: PriceFormData) => {
    setSubmitting(true);

    try {
      const payload = {
        ...formData,
        outlet_id: formData.is_company_default ? null : selectedOutletId,
      };

      await apiRequest(
        "/inventory/item-prices",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      closeCreateModal();
      await fetchPrices();
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to create price");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (price: number, isActive: boolean) => {
    if (!editingPrice) return;
    setSubmitting(true);

    try {
      await apiRequest(
        `/inventory/item-prices/${editingPrice.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ price, is_active: isActive }),
        }
      );

      closeEditModal();
      setEditingPrice(null);
      await fetchPrices();
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to update price");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateOverride = async (priceValue: number) => {
    if (!overrideTarget) return;
    setSubmitting(true);

    try {
      await apiRequest(
        "/inventory/item-prices",
        {
          method: "POST",
          body: JSON.stringify({
            item_id: overrideTarget.itemId,
            price: priceValue,
            is_active: true,
            outlet_id: selectedOutletId,
          }),
        }
      );

      closeOverrideModal();
      setOverrideTarget(null);
      await fetchPrices();
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to create override");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingPriceId) return;
    setSubmitting(true);

    try {
      await apiRequest(
        `/inventory/item-prices/${deletingPriceId}`,
        { method: "DELETE" }
      );

      closeDeleteModal();
      setDeletingPriceId(null);
      await fetchPrices();
    } catch (err) {
      throw err instanceof Error ? err : new Error("Failed to delete price");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    openExportDialog();
  };

  // Build export filters from current filter state
  const getExportFilters = useCallback(() => {
    return {
      search: typeof filters.search === "string" && filters.search.trim() ? filters.search.trim() : undefined,
      status: typeof filters.status === "string" ? filters.status === "true" : null,
      outletId: viewMode === "outlet" ? selectedOutletId : undefined,
      viewMode: viewMode,
      scopeFilter: typeof filters.scope === "string" ? filters.scope as "override" | "default" : null,
    };
  }, [filters.scope, filters.search, filters.status, viewMode, selectedOutletId]);

  const handleImportComplete = () => {
    closeImportModal();
    fetchPrices();
  };

  // Loading state
  if (itemsLoading || groupsLoading || pricesLoading) {
    return (
      <Stack gap="md" p="md">
        <Title order={2}>Prices</Title>
        <Group justify="center" py="xl">
          <Loader />
          <Text>Loading prices...</Text>
        </Group>
      </Stack>
    );
  }

  // Error state
  if (itemsError || groupsError || pricesError) {
    return (
      <Stack gap="md" p="md">
        <Title order={2}>Prices</Title>
        <Alert color="red" title="Error loading data">
          {itemsError || groupsError || pricesError}
        </Alert>
        <Button onClick={fetchPrices}>Retry</Button>
      </Stack>
    );
  }

  return (
    <Stack gap="md" p="md">
      {/* Header */}
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>Prices</Title>
          <Text size="sm" c="dimmed">
            Manage pricing across outlets
          </Text>
        </div>
        <Group>
          <Button
            variant="light"
            leftSection={<IconPackage size={16} />}
            component="a"
            href="#/items"
          >
            View Items
          </Button>
          {permissionGates.UPDATE && viewMode !== "all_outlets" && (
            <Button
              variant="light"
              leftSection={<IconUpload size={16} />}
              onClick={openImportModal}
            >
              Import
            </Button>
          )}
          {permissionGates.UPDATE && viewMode !== "all_outlets" && (
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={openCreateModal}
            >
              Create Price
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

      {/* View Mode & Outlet Selector */}
      <Card>
        <Stack gap="sm">
          <Group justify="space-between" wrap="wrap">
            <SegmentedControl
              value={viewMode}
              onChange={handleViewModeChange}
              data={[
                { label: "Company Defaults", value: "defaults" },
                { label: "Outlet Prices", value: "outlet" },
                { label: "All Outlets", value: "all_outlets" },
              ]}
            />
            {viewMode === "outlet" && (
              <Select
                label="Outlet"
                value={String(selectedOutletId)}
                onChange={handleOutletChange}
                data={outletOptions}
                style={{ minWidth: 200 }}
              />
            )}
          </Group>

          <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light">
            <Group justify="space-between" gap="sm">
              <Text size="sm">
                <strong>Pricing Hierarchy:</strong> Company Default prices apply to all outlets.
                Outlet-specific overrides take precedence.
              </Text>
              <ScopeBadge
                label={viewMode === "defaults" ? "Default Prices" : viewMode === "all_outlets" ? "All Outlets" : `Outlet: ${selectedOutletName ?? selectedOutletId}`}
                color={viewMode === "defaults" ? "green" : "blue"}
              />
            </Group>
          </Alert>
        </Stack>
      </Card>

      {/* Filters */}
      <Card>
        <FilterBar
          key={`${viewMode}-${selectedOutletId}`}
          schema={filterSchema}
          onFilterChange={handleFilterChange}
          resultCount={filteredPrices.length}
          isLoading={pricesLoading}
          manageUrlState={false}
          data-testid="prices-filter-bar"
        />
        {hasActiveFilters && (
          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" size="sm" onClick={resetFilters}>Clear All</Button>
          </Group>
        )}
      </Card>

      {/* Prices Table */}
      <Card>
        {filteredPrices.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {hasActiveFilters
              ? "No prices match your filters."
              : viewMode === "defaults"
              ? "No company default prices."
              : viewMode === "all_outlets"
              ? "No prices found for any outlet."
              : "No prices for this outlet."}
          </Text>
        ) : isMobile ? (
          <PricesMobileCard
            prices={filteredPrices}
            viewMode={viewMode}
            getGroupName={getGroupName}
            canUpdate={permissionGates.UPDATE}
            onEdit={openEdit}
            onSetOverride={openSetOverride}
            onDelete={openDelete}
          />
        ) : (
          <PricesTable
            prices={filteredPrices}
            viewMode={viewMode}
            outletColumns={outletColumns}
            hiddenOutletCount={hiddenOutletCount}
            onShowMoreOutlets={() => setShowAllOutletColumns(true)}
            getGroupName={getGroupName}
            canUpdate={permissionGates.UPDATE}
            onEdit={openEdit}
            onSetOverride={openSetOverride}
            onDelete={openDelete}
          />
        )}
      </Card>

      {/* Modals */}
      <CreatePriceModal
        opened={createModalOpen}
        onClose={closeCreateModal}
        onCreate={handleCreate}
        items={items}
        isCompanyDefault={viewMode === "defaults"}
        submitting={submitting}
        fullScreen={isMobile}
      />

      <OverridePriceModal
        opened={overrideModalOpen}
        onClose={() => {
          closeOverrideModal();
          setOverrideTarget(null);
        }}
        onCreate={handleCreateOverride}
        defaultPrice={overrideTarget?.defaultPrice ?? 0}
        submitting={submitting}
        fullScreen={isMobile}
      />

      <EditPriceModal
        opened={editModalOpen}
        onClose={() => {
          closeEditModal();
          setEditingPrice(null);
        }}
        onUpdate={handleUpdate}
        itemName={editingPrice?.item?.name ?? "Unknown Item"}
        currentPrice={editingPrice?.price ?? 0}
        currentIsActive={editingPrice?.is_active ?? true}
        submitting={submitting}
        fullScreen={isMobile}
      />

      <DeletePriceModal
        opened={deleteModalOpen}
        onClose={() => {
          closeDeleteModal();
          setDeletingPriceId(null);
        }}
        onDelete={handleDelete}
        isDefault={deletingIsDefault}
        submitting={submitting}
      />

      {/* Import Modal */}
      <Modal
        opened={importModalOpen}
        onClose={closeImportModal}
        title="Import Prices"
        size="xl"
        fullScreen={isMobile}
      >
        <StagedImportWorkflow
          entityType="prices"
          onComplete={handleImportComplete}
          onCancel={closeImportModal}
        />
      </Modal>

      {/* Export Dialog */}
      <ExportDialog
        opened={exportDialogOpen}
        onClose={closeExportDialog}
        entityType="prices"
        initialFilters={getExportFilters()}
        estimatedRowCount={filteredPrices.length}
      />
    </Stack>
  );
}
