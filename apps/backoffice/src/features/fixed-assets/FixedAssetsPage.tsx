// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import type { SessionUser } from "../../lib/session";
import { apiRequest, ApiError } from "../../lib/api-client";
import { useOnlineStatus } from "../../lib/connection";
import { OfflinePage } from "../../components/offline-page";

import { Stack, Box } from "@mantine/core";
import { notifications } from "@mantine/notifications";

import { FixedAssetsToolbar } from "./components/FixedAssetsToolbar";
import { AssetWorkbenchTable } from "./components/AssetWorkbenchTable";
import { AssetDetailDrawer } from "./components/AssetDetailDrawer";
import { AssetCreateModal } from "./components/AssetCreateModal";
import { CategoryCreateModal } from "./components/CategoryCreateModal";
import { AcquisitionModal } from "./components/forms/AcquisitionModal";
import { TransferModal } from "./components/forms/TransferModal";
import { ImpairmentModal } from "./components/forms/ImpairmentModal";
import { DisposalModal } from "./components/forms/DisposalModal";

type FixedAsset = {
  id: number;
  company_id: number;
  outlet_id: number | null;
  category_id: number | null;
  asset_tag: string | null;
  name: string;
  serial_number: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  is_active: boolean;
  disposed_at: string | null;
  updated_at: string;
};

type FixedAssetCategory = {
  id: number;
  company_id: number;
  code: string;
  name: string;
  depreciation_method: "STRAIGHT_LINE" | "DECLINING_BALANCE" | "SUM_OF_YEARS";
  useful_life_months: number;
  residual_value_pct: number;
  expense_account_id: number | null;
  accum_depr_account_id: number | null;
  is_active: boolean;
  updated_at: string;
};

type FixedAssetBook = {
  asset_id: number;
  cost_basis: number;
  accum_depreciation: number;
  accum_impairment: number;
  carrying_amount: number;
  as_of_date: string;
  last_event_id: number;
};

type FixedAssetEvent = {
  id: number;
  event_type: string;
  event_date: string;
  journal_batch_id: number | null;
  status: string;
  event_data: Record<string, unknown>;
};

type LedgerResponse = {
  asset_id: number;
  events: FixedAssetEvent[];
};

type FixedAssetsPageProps = {
  user: SessionUser;
  accessToken: string;
};

export function FixedAssetsPage(props: FixedAssetsPageProps) {
  const isOnline = useOnlineStatus();

  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [categories, setCategories] = useState<FixedAssetCategory[]>([]);
  const [accounts, setAccounts] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [outletFilter, setOutletFilter] = useState<string | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "active" | "inactive" | "disposed">("active");
  const [categoryFilter, setCategoryFilter] = useState<string | "ALL">("ALL");

  // Selection state
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [assetBook, setAssetBook] = useState<FixedAssetBook | null>(null);
  const [assetLedger, setAssetLedger] = useState<LedgerResponse | null>(null);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Modal triggers
  const [createAssetModalOpen, setCreateAssetModalOpen] = useState(false);
  const [createCategoryModalOpen, setCreateCategoryModalOpen] = useState(false);

  // Lifecycle action modals
  const [acquisitionModalOpen, setAcquisitionModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [impairmentModalOpen, setImpairmentModalOpen] = useState(false);
  const [disposalModalOpen, setDisposalModalOpen] = useState(false);

  const outletOptions = useMemo(() => props.user.outlets ?? [], [props.user.outlets]);

  const categoryOptions = useMemo(() => {
    const filtered = showInactive
      ? categories
      : categories.filter((c) => c.is_active);
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [categories, showInactive]);

  const categoryLabelById = useMemo(() => {
    const map = new Map<number, string>();
    categories.forEach((category) => {
      map.set(category.id, `${category.code} - ${category.name}`);
    });
    return map;
  }, [categories]);

  const outletLabelById = useMemo(() => {
    const map = new Map<number, string>();
    outletOptions.forEach((outlet) => {
      map.set(outlet.id, `${outlet.code} - ${outlet.name}`);
    });
    return map;
  }, [outletOptions]);

  async function refreshAssets() {
    setLoading(true);
    setError(null);

    try {
      let query = "";
      if (outletFilter !== "ALL" && outletFilter !== "UNASSIGNED") {
        const outletId = Number(outletFilter);
        if (Number.isInteger(outletId) && outletId > 0) {
          query = `?outlet_id=${outletId}`;
        }
      }
      const response = await apiRequest<{ success: true; data: FixedAsset[] }>(
        `/accounts/fixed-assets${query}`,
        {},
        props.accessToken
      );
      setAssets(response.data);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load assets");
      }
    } finally {
      setLoading(false);
    }
  }

  async function refreshCategories() {
    try {
      const response = await apiRequest<{ success: true; data: FixedAssetCategory[] }>(
        "/accounts/fixed-asset-categories",
        {},
        props.accessToken
      );
      setCategories(response.data);
    } catch (fetchError) {
      console.error("Failed to load categories", fetchError);
    }
  }

  async function loadAccounts() {
    try {
      const response = await apiRequest<{ success: true; data: Array<{ id: number; code: string; name: string }> }>(
        `/accounts?company_id=${props.user.company_id}`,
        {},
        props.accessToken
      );
      setAccounts(response.data);
    } catch (err) {
      console.error("Failed to load accounts", err);
      setAccounts([]);
    }
  }

  async function loadAssetDetails(assetId: number) {
    setDetailLoading(true);
    try {
      const [bookRes, ledgerRes] = await Promise.all([
        apiRequest<{ success: true; data: FixedAssetBook }>(
          `/accounts/fixed-assets/${assetId}/book`,
          {},
          props.accessToken
        ),
        apiRequest<{ success: true; data: LedgerResponse }>(
          `/accounts/fixed-assets/${assetId}/ledger`,
          {},
          props.accessToken
        )
      ]);
      setAssetBook(bookRes.data);
      setAssetLedger(ledgerRes.data);
    } catch (err) {
      console.error("Failed to load asset details", err);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (isOnline) {
      refreshAssets();
      refreshCategories();
      loadAccounts();
    }
  }, [isOnline, outletFilter]);

  // Filter assets based on search, status, and category
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesName = asset.name.toLowerCase().includes(searchLower);
        const matchesTag = asset.asset_tag?.toLowerCase().includes(searchLower);
        const matchesSerial = asset.serial_number?.toLowerCase().includes(searchLower);
        if (!matchesName && !matchesTag && !matchesSerial) return false;
      }

      // Status filter
      if (statusFilter === "active" && (!asset.is_active || asset.disposed_at)) return false;
      if (statusFilter === "inactive" && (asset.is_active || asset.disposed_at)) return false;
      if (statusFilter === "disposed" && !asset.disposed_at) return false;

      // Category filter
      if (categoryFilter !== "ALL" && asset.category_id !== Number(categoryFilter)) return false;

      // Outlet filter
      if (outletFilter === "UNASSIGNED" && asset.outlet_id != null) return false;
      if (outletFilter !== "ALL" && outletFilter !== "UNASSIGNED" && asset.outlet_id !== Number(outletFilter)) return false;

      // Show inactive toggle
      if (!showInactive && !asset.is_active && !asset.disposed_at) return false;

      return true;
    });
  }, [assets, search, statusFilter, showInactive, outletFilter, categoryFilter]);

  function handleSelectAsset(asset: FixedAsset) {
    setSelectedAssetId(asset.id);
    setDrawerOpen(true);
    loadAssetDetails(asset.id);
  }

  function handleCloseDrawer() {
    setDrawerOpen(false);
    setSelectedAssetId(null);
    setAssetBook(null);
    setAssetLedger(null);
  }

  async function handleDeleteAsset(assetId: number) {
    if (!globalThis.confirm("Delete this asset record?")) {
      return;
    }

    try {
      setError(null);
      await apiRequest(`/accounts/fixed-assets/${assetId}`, { method: "DELETE" }, props.accessToken);
      await refreshAssets();
      notifications.show({ title: "Success", message: "Asset deleted", color: "green" });
      if (selectedAssetId === assetId) {
        handleCloseDrawer();
      }
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("Failed to delete asset");
      }
    }
  }

  async function handleAcquisitionSubmit(data: Record<string, unknown>) {
    if (!selectedAssetId) return;
    try {
      await apiRequest(`/accounts/fixed-assets/${selectedAssetId}/acquisition`, {
        method: "POST",
        body: JSON.stringify(data)
      }, props.accessToken);
      setAcquisitionModalOpen(false);
      await loadAssetDetails(selectedAssetId);
      await refreshAssets();
      notifications.show({ title: "Success", message: "Acquisition recorded", color: "green" });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to record acquisition");
      }
    }
  }

  async function handleTransferSubmit(data: Record<string, unknown>) {
    if (!selectedAssetId) return;
    try {
      await apiRequest(`/accounts/fixed-assets/${selectedAssetId}/transfer`, {
        method: "POST",
        body: JSON.stringify(data)
      }, props.accessToken);
      setTransferModalOpen(false);
      await loadAssetDetails(selectedAssetId);
      await refreshAssets();
      notifications.show({ title: "Success", message: "Transfer recorded", color: "green" });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to record transfer");
      }
    }
  }

  async function handleImpairmentSubmit(data: Record<string, unknown>) {
    if (!selectedAssetId) return;
    try {
      await apiRequest(`/accounts/fixed-assets/${selectedAssetId}/impairment`, {
        method: "POST",
        body: JSON.stringify(data)
      }, props.accessToken);
      setImpairmentModalOpen(false);
      await loadAssetDetails(selectedAssetId);
      notifications.show({ title: "Success", message: "Impairment recorded", color: "green" });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to record impairment");
      }
    }
  }

  async function handleDisposalSubmit(data: Record<string, unknown>) {
    if (!selectedAssetId) return;
    try {
      await apiRequest(`/accounts/fixed-assets/${selectedAssetId}/disposal`, {
        method: "POST",
        body: JSON.stringify(data)
      }, props.accessToken);
      setDisposalModalOpen(false);
      await loadAssetDetails(selectedAssetId);
      await refreshAssets();
      notifications.show({ title: "Success", message: "Disposal recorded", color: "green" });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to record disposal");
      }
    }
  }

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Fixed Assets"
        message="Fixed asset changes require a connection."
      />
    );
  }

  return (
    <Stack gap="md" style={{ minHeight: "100vh" }}>
      {error && (
        <Box bg="red.1" p="md" style={{ borderRadius: 8 }}>
          {error}
        </Box>
      )}

      <FixedAssetsToolbar
        search={search}
        onSearchChange={setSearch}
        outletFilter={outletFilter}
        onOutletFilterChange={setOutletFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        showInactive={showInactive}
        onShowInactiveChange={setShowInactive}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        categoryOptions={categoryOptions}
        outletOptions={outletOptions}
        onCreateAsset={() => setCreateAssetModalOpen(true)}
        onCreateCategory={() => setCreateCategoryModalOpen(true)}
        assetsCount={filteredAssets.length}
      />

      <AssetWorkbenchTable
        assets={filteredAssets}
        loading={loading}
        categoryLabelById={categoryLabelById}
        outletLabelById={outletLabelById}
        onSelectAsset={handleSelectAsset}
        onDeleteAsset={handleDeleteAsset}
        selectedAssetId={selectedAssetId}
      />

      <AssetDetailDrawer
        opened={drawerOpen}
        onClose={handleCloseDrawer}
        selectedAssetId={selectedAssetId}
        assets={assets}
        categoryLabelById={categoryLabelById}
        outletLabelById={outletLabelById}
        assetBook={assetBook}
        assetLedger={assetLedger}
        detailLoading={detailLoading}
        onRecordAcquisition={() => setAcquisitionModalOpen(true)}
        onRecordTransfer={() => setTransferModalOpen(true)}
        onRecordImpairment={() => setImpairmentModalOpen(true)}
        onRecordDisposal={() => setDisposalModalOpen(true)}
      />

      <AssetCreateModal
        opened={createAssetModalOpen}
        onClose={() => setCreateAssetModalOpen(false)}
        accessToken={props.accessToken}
        categories={categories}
        outlets={outletOptions}
        onSuccess={() => refreshAssets()}
      />

      <CategoryCreateModal
        opened={createCategoryModalOpen}
        onClose={() => setCreateCategoryModalOpen(false)}
        accessToken={props.accessToken}
        accounts={accounts}
        onSuccess={() => refreshCategories()}
      />

      {selectedAssetId && (
        <>
          {(() => {
            const selectedAsset = assets.find(a => a.id === selectedAssetId) ?? null;
            const selectedCategory = selectedAsset?.category_id != null
              ? categories.find(c => c.id === selectedAsset.category_id) ?? null
              : null;
            return (
              <>
                <AcquisitionModal
                  opened={acquisitionModalOpen}
                  onClose={() => setAcquisitionModalOpen(false)}
                  asset={selectedAsset ?? undefined}
                  category={selectedCategory ?? undefined}
                  accounts={accounts}
                  onSubmit={handleAcquisitionSubmit}
                />
                <TransferModal
                  opened={transferModalOpen}
                  onClose={() => setTransferModalOpen(false)}
                  asset={selectedAsset ?? undefined}
                  outlets={outletOptions}
                  onSubmit={handleTransferSubmit}
                />
                <ImpairmentModal
                  opened={impairmentModalOpen}
                  onClose={() => setImpairmentModalOpen(false)}
                  accounts={accounts}
                  onSubmit={handleImpairmentSubmit}
                />
                <DisposalModal
                  opened={disposalModalOpen}
                  onClose={() => setDisposalModalOpen(false)}
                  accounts={accounts}
                  onSubmit={handleDisposalSubmit}
                />
              </>
            );
          })()}
        </>
      )}
    </Stack>
  );
}
