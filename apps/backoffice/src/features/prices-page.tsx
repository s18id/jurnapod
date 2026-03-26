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
  Badge,
  Alert,
  Loader,
  Modal,
  SegmentedControl,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconSearch,
  IconPlus,
  IconDownload,
  IconPackage,
  IconUpload,
} from "@tabler/icons-react";
import { useState, useMemo, useCallback, useEffect } from "react";

import { ImportWizard, type ImportWizardConfig, type ImportResult } from "../components/import-wizard";
import { useItemGroups } from "../hooks/use-item-groups";
import { useItems, type Item } from "../hooks/use-items";
import { apiRequest } from "../lib/api-client";
import type { SessionUser } from "../lib/session";

import {
  type NormalizedPriceImportRow,
} from "./item-prices-import-utils";
import { downloadPricesCsv } from "./items-prices-export-utils";
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
  accessToken: string;
}

type PricingViewMode = "defaults" | "outlet";

interface ItemPrice {
  id: number;
  company_id: number;
  outlet_id: number | null;
  item_id: number;
  price: number;
  is_active: boolean;
  updated_at: string;
}

interface PriceWithItem extends ItemPrice {
  item?: Item;
  hasOverride?: boolean;
  effectivePrice?: number;
  defaultPrice?: number;
}

export function PricesPage({ user, accessToken }: PricesPageProps) {
  const isMobile = useMediaQuery("(max-width: 48em)");

  // Data hooks
  const {
    items,
    loading: itemsLoading,
    error: itemsError,
    itemMap,
  } = useItems({ user, accessToken });

  const {
    loading: groupsLoading,
    error: groupsError,
    groupMap,
  } = useItemGroups({ user, accessToken });

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
  const [searchTerm, setSearchTerm] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<boolean | null>(null);

  // Modal states
  const [createModalOpen, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);
  const [overrideModalOpen, { open: openOverrideModal, close: closeOverrideModal }] = useDisclosure(false);
  const [editModalOpen, { open: openEditModal, close: closeEditModal }] = useDisclosure(false);
  const [deleteModalOpen, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [importModalOpen, { open: openImportModal, close: closeImportModal }] = useDisclosure(false);

  // Action states
  const [editingPrice, setEditingPrice] = useState<PriceWithItem | null>(null);
  const [deletingPriceId, setDeletingPriceId] = useState<number | null>(null);
  const [deletingIsDefault, setDeletingIsDefault] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState<{ itemId: number; defaultPrice: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Handle outlet selection change with URL update
  const handleOutletChange = useCallback((value: string | null) => {
    const outletId = value ? Number(value) : null;
    if (outletId !== null) {
      setSelectedOutletId(outletId);
      updateUrlWithOutlet(outletId);
    }
  }, [updateUrlWithOutlet]);

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
      const [pricesResponse, defaultsResponse] = await Promise.all([
        apiRequest<{ data: ItemPrice[] }>(`/inventory/item-prices?outlet_id=${selectedOutletId}`, {}, accessToken),
        apiRequest<{ data: ItemPrice[] }>("/inventory/item-prices?scope=default", {}, accessToken),
      ]);

      setPrices(pricesResponse.data);
      setCompanyDefaults(defaultsResponse.data);
    } catch (err) {
      setPricesError(err instanceof Error ? err.message : "Failed to fetch prices");
    } finally {
      setPricesLoading(false);
    }
  }, [selectedOutletId, accessToken]);

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

  // Merge prices with hierarchy info
  const pricesWithHierarchy = useMemo((): PriceWithItem[] => {
    if (viewMode === "defaults") {
      return companyDefaults.map((price) => ({
        ...price,
        item: itemMap.get(price.item_id),
      }));
    }

    const merged = new Map<number, PriceWithItem>();

    companyDefaults.forEach((defaultPrice) => {
      merged.set(defaultPrice.item_id, {
        ...defaultPrice,
        item: itemMap.get(defaultPrice.item_id),
        hasOverride: false,
        effectivePrice: defaultPrice.price,
        defaultPrice: defaultPrice.price,
      });
    });

    prices.forEach((price) => {
      const existing = merged.get(price.item_id);
      if (existing) {
        merged.set(price.item_id, {
          ...price,
          item: existing.item,
          hasOverride: true,
          effectivePrice: price.price,
          defaultPrice: existing.defaultPrice,
        });
      }
    });

    return Array.from(merged.values());
  }, [companyDefaults, prices, itemMap, viewMode]);

  // Filter prices
  const filteredPrices = useMemo(() => {
    return pricesWithHierarchy.filter((price) => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const nameMatch = price.item?.name.toLowerCase().includes(search) ?? false;
        const skuMatch = price.item?.sku?.toLowerCase().includes(search) ?? false;
        if (!nameMatch && !skuMatch) return false;
      }

      if (viewMode === "outlet" && scopeFilter) {
        if (scopeFilter === "override" && !price.hasOverride) return false;
        if (scopeFilter === "default" && price.hasOverride) return false;
      }

      if (statusFilter !== null && price.is_active !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [pricesWithHierarchy, searchTerm, scopeFilter, statusFilter, viewMode]);

  const hasActiveFilters = searchTerm || scopeFilter || statusFilter !== null;

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
    setScopeFilter(null);
    setStatusFilter(null);
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
        },
        accessToken
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
        },
        accessToken
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
        },
        accessToken
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
        { method: "DELETE" },
        accessToken
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
    const pricesForExport = viewMode === "defaults" ? companyDefaults : prices;
    downloadPricesCsv(pricesForExport, items, viewMode, selectedOutletId);
  };

  // Import wizard config
  const importConfig: ImportWizardConfig<NormalizedPriceImportRow> = useMemo(() => {
    return {
      title: "Import Prices",
      entityName: "prices",
      entityType: "prices",
      csvTemplate: "item_sku,price,is_active,scope,outlet_id\nSKU001,25000,true,outlet,1\nSKU002,30000,true,default,",
      csvDescription: "Format: item_sku, price, is_active, scope (default/outlet), outlet_id",
      columns: [
        { key: "item_sku", header: "Item SKU", required: true },
        { key: "price", header: "Price", required: true },
        { key: "is_active", header: "Active", required: false },
        { key: "scope", header: "Scope", required: true },
        { key: "outlet_id", header: "Outlet ID", required: false },
      ],
      parseRow: (row: Record<string, string>, _columnMap: Record<string, string>) => {
        return {
          item_sku: row.item_sku || "",
          price: Number(row.price) || 0,
          is_active: row.is_active?.toLowerCase() === "true",
          scope: (row.scope?.toLowerCase() === "default" ? "default" : "outlet") as "default" | "outlet",
          outlet_id: row.outlet_id ? Number(row.outlet_id) : null,
        };
      },
      validateRow: (parsed: Partial<NormalizedPriceImportRow>) => {
        if (!parsed.item_sku) return "Item SKU is required";
        if (!parsed.price || parsed.price <= 0) return "Valid price is required";
        if (!parsed.scope) return "Scope (default/outlet) is required";
        if (parsed.scope === "outlet" && !parsed.outlet_id) {
          return "Outlet ID is required for outlet scope";
        }
        return null;
      },
      importFn: async (rows) => {
        const results: ImportResult = { success: 0, failed: 0, created: 0, updated: 0, skipped: 0, errors: [] };
        
        for (const row of rows) {
          try {
            await apiRequest(
              "/inventory/item-prices",
              {
                method: "POST",
                body: JSON.stringify({
                  item_id: items.find(i => i.sku?.toLowerCase() === row.parsed.item_sku?.toLowerCase())?.id,
                  price: row.parsed.price,
                  is_active: row.parsed.is_active ?? true,
                  outlet_id: row.parsed.scope === "default" ? null : row.parsed.outlet_id,
                }),
              },
              accessToken
            );
            results.success++;
            results.created++;
          } catch (err) {
            results.failed++;
            results.errors.push({
              row: row.rowIndex,
              error: err instanceof Error ? err.message : "Import failed",
            });
          }
        }
        
        return results;
      },
      accessToken,
    };
  }, [items, accessToken]);

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
          <Button
            variant="light"
            leftSection={<IconUpload size={16} />}
            onClick={openImportModal}
          >
            Import
          </Button>
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={openCreateModal}
          >
            Create Price
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

      {/* View Mode & Outlet Selector */}
      <Card>
        <Stack gap="sm">
          <Group justify="space-between" wrap="wrap">
            <SegmentedControl
              value={viewMode}
              onChange={(value) => setViewMode(value as PricingViewMode)}
              data={[
                { label: "Company Defaults", value: "defaults" },
                { label: "Outlet Prices", value: "outlet" },
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
            <Text size="sm">
              <strong>Pricing Hierarchy:</strong> Company Default prices apply to all outlets. 
              Outlet-specific overrides take precedence.
            </Text>
          </Alert>
        </Stack>
      </Card>

      {/* Filters */}
      <Card>
        <Stack gap="xs">
          <Group gap="sm" wrap="wrap">
            <TextInput
              placeholder="Search item..."
              leftSection={<IconSearch size={16} />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ minWidth: 200 }}
            />
            {viewMode === "outlet" && (
              <Select
                placeholder="Scope"
                value={scopeFilter}
                onChange={setScopeFilter}
                data={[
                  { value: "override", label: "Override" },
                  { value: "default", label: "Default" },
                ]}
                clearable
                style={{ minWidth: 120 }}
              />
            )}
            <Select
              placeholder="Status"
              value={statusFilter === null ? null : String(statusFilter)}
              onChange={(v) => setStatusFilter(v === null ? null : v === "true")}
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
              <Text size="xs" c="dimmed">Active filters:</Text>
              {searchTerm && <Badge variant="light">Search: {searchTerm}</Badge>}
              {scopeFilter && <Badge variant="light">Scope: {scopeFilter}</Badge>}
              {statusFilter !== null && (
                <Badge variant="light">Status: {statusFilter ? "Active" : "Inactive"}</Badge>
              )}
            </Group>
          )}
        </Stack>
      </Card>

      {/* Prices Table */}
      <Card>
        {filteredPrices.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            {hasActiveFilters
              ? "No prices match your filters."
              : viewMode === "defaults"
              ? "No company default prices."
              : "No prices for this outlet."}
          </Text>
        ) : isMobile ? (
          <PricesMobileCard
            prices={filteredPrices}
            viewMode={viewMode}
            getGroupName={getGroupName}
            onEdit={openEdit}
            onSetOverride={openSetOverride}
            onDelete={openDelete}
          />
        ) : (
          <PricesTable
            prices={filteredPrices}
            viewMode={viewMode}
            getGroupName={getGroupName}
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

      {/* Import Wizard Modal */}
      <Modal
        opened={importModalOpen}
        onClose={closeImportModal}
        title="Import Prices"
        size="lg"
      >
        <ImportWizard
          config={importConfig}
          onComplete={handleImportComplete}
          onCancel={closeImportModal}
        />
      </Modal>
    </Stack>
  );
}
