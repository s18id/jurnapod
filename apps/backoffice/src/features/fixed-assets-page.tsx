// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)


import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  LoadingOverlay,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useState } from "react";

import { OfflinePage } from "../components/offline-page";
import { apiRequest, ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import type { SessionUser } from "../lib/session";

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

type FixedAssetPageProps = {
  user: SessionUser;
  accessToken: string;
};

export function FixedAssetPage(props: FixedAssetPageProps) {
  const isOnline = useOnlineStatus();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [categories, setCategories] = useState<FixedAssetCategory[]>([]);
  const [accounts, setAccounts] = useState<Array<{ id: number; code: string; name: string }>>([]);
  const [, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [outletFilter, setOutletFilter] = useState<string | number>("ALL");

  const [selectedAsset, setSelectedAsset] = useState<FixedAsset | null>(null);
  const [assetBook, setAssetBook] = useState<FixedAssetBook | null>(null);
  const [assetLedger, setAssetLedger] = useState<LedgerResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("overview");

  const [acquisitionModalOpen, setAcquisitionModalOpen] = useState(false);
  const [acquisitionForm, setAcquisitionForm] = useState({
    event_date: "",
    cost: 0,
    useful_life_months: 60,
    salvage_value: 0,
    asset_account_id: "",
    offset_account_id: "",
    expense_account_id: "",
    notes: ""
  });

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    to_outlet_id: "",
    transfer_date: "",
    notes: ""
  });

  const [impairmentModalOpen, setImpairmentModalOpen] = useState(false);
  const [impairmentForm, setImpairmentForm] = useState({
    impairment_date: "",
    impairment_amount: 0,
    reason: "",
    expense_account_id: "",
    accum_impairment_account_id: ""
  });

  const [disposalModalOpen, setDisposalModalOpen] = useState(false);
  const [disposalForm, setDisposalForm] = useState({
    disposal_date: "",
    disposal_type: "SALE" as "SALE" | "SCRAP",
    proceeds: 0,
    disposal_cost: 0,
    cash_account_id: "",
    asset_account_id: "",
    accum_depr_account_id: "",
    accum_impairment_account_id: "",
    gain_account_id: "",
    loss_account_id: "",
    disposal_expense_account_id: "",
    notes: ""
  });

  const [categoryForm, setCategoryForm] = useState({
    code: "",
    name: "",
    depreciation_method: "STRAIGHT_LINE" as const,
    useful_life_months: "60",
    residual_value_pct: "0",
    expense_account_id: "",
    accum_depr_account_id: "",
    is_active: true
  });

  const [createAssetForm, setCreateAssetForm] = useState({
    name: "",
    asset_tag: "",
    category_id: "",
    serial_number: "",
    outlet_id: "",
    purchase_date: "",
    purchase_cost: "",
    is_active: true
  });

  const outletOptions = useMemo(() => props.user.outlets ?? [], [props.user.outlets]);

  const categoryOptions = useMemo(() => {
    return [...categories].sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

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

  async function refreshAssets(filter: string | number) {
    setLoading(true);
    setError(null);

    try {
      const query = typeof filter === "number" ? `?outlet_id=${filter}` : "";
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
      refreshAssets(outletFilter);
      refreshCategories();
      loadAccounts();
    }
  }, [isOnline, outletFilter]);

  async function handleCreateCategory() {
    if (!categoryForm.code.trim() || !categoryForm.name.trim()) {
      setError("Category code and name are required");
      return;
    }

    try {
      setError(null);
      await apiRequest(
        "/accounts/fixed-asset-categories",
        {
          method: "POST",
          body: JSON.stringify({
            code: categoryForm.code.trim(),
            name: categoryForm.name.trim(),
            depreciation_method: categoryForm.depreciation_method,
            useful_life_months: Number(categoryForm.useful_life_months),
            residual_value_pct: Number(categoryForm.residual_value_pct || 0),
            expense_account_id: categoryForm.expense_account_id ? Number(categoryForm.expense_account_id) : null,
            accum_depr_account_id: categoryForm.accum_depr_account_id ? Number(categoryForm.accum_depr_account_id) : null,
            is_active: categoryForm.is_active
          })
        },
        props.accessToken
      );
      setCategoryForm({
        code: "",
        name: "",
        depreciation_method: "STRAIGHT_LINE",
        useful_life_months: "60",
        residual_value_pct: "0",
        expense_account_id: "",
        accum_depr_account_id: "",
        is_active: true
      });
      await refreshCategories();
      notifications.show({ title: "Success", message: "Category created", color: "green" });
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      } else {
        setError("Failed to create category");
      }
    }
  }

  async function handleCreateAsset() {
    if (!createAssetForm.name.trim()) {
      setError("Asset name is required");
      return;
    }

    try {
      setError(null);
      await apiRequest(
        "/accounts/fixed-assets",
        {
          method: "POST",
          body: JSON.stringify({
            name: createAssetForm.name.trim(),
            asset_tag: createAssetForm.asset_tag.trim() || null,
            category_id: createAssetForm.category_id ? Number(createAssetForm.category_id) : null,
            serial_number: createAssetForm.serial_number.trim() || null,
            outlet_id: createAssetForm.outlet_id ? Number(createAssetForm.outlet_id) : null,
            purchase_date: createAssetForm.purchase_date.trim() || null,
            purchase_cost: createAssetForm.purchase_cost.trim() ? Number(createAssetForm.purchase_cost) : null,
            is_active: createAssetForm.is_active
          })
        },
        props.accessToken
      );
      setCreateAssetForm({
        name: "",
        asset_tag: "",
        category_id: "",
        serial_number: "",
        outlet_id: "",
        purchase_date: "",
        purchase_cost: "",
        is_active: true
      });
      await refreshAssets(outletFilter);
      notifications.show({ title: "Success", message: "Asset created", color: "green" });
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      } else {
        setError("Failed to create asset");
      }
    }
  }

  async function handleDeleteAsset(assetId: number) {
    if (!globalThis.confirm("Delete this asset record?")) {
      return;
    }

    try {
      setError(null);
      await apiRequest(`/accounts/fixed-assets/${assetId}`, { method: "DELETE" }, props.accessToken);
      await refreshAssets(outletFilter);
      notifications.show({ title: "Success", message: "Asset deleted", color: "green" });
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("Failed to delete asset");
      }
    }
  }

  function openAssetDetail(asset: FixedAsset) {
    setSelectedAsset(asset);
    setDetailModalOpen(true);
    setActiveTab("overview");
    loadAssetDetails(asset.id);
  }

  function openAcquisitionModal() {
    const selectedCategory = categories.find((c) => c.id === selectedAsset?.category_id);
    const purchaseCost = selectedAsset?.purchase_cost ?? 0;
    const residualPct = selectedCategory?.residual_value_pct ?? 0;
    setAcquisitionForm({
      event_date: selectedAsset?.purchase_date?.slice(0, 10) ?? "",
      cost: purchaseCost,
      useful_life_months: selectedCategory?.useful_life_months ?? 60,
      salvage_value: purchaseCost * (residualPct / 100),
      asset_account_id: "",
      offset_account_id: "",
      expense_account_id: String(selectedCategory?.expense_account_id ?? ""),
      notes: ""
    });
    setAcquisitionModalOpen(true);
  }

  async function handleAcquisition() {
    if (!selectedAsset) return;

    if (!acquisitionForm.asset_account_id || !acquisitionForm.offset_account_id) {
      setError("Please select both asset account and offset account");
      return;
    }

    try {
      setError(null);
      await apiRequest(
        `/accounts/fixed-assets/${selectedAsset.id}/acquisition`,
        {
          method: "POST",
          body: JSON.stringify({
            event_date: acquisitionForm.event_date,
            cost: acquisitionForm.cost,
            useful_life_months: acquisitionForm.useful_life_months,
            salvage_value: acquisitionForm.salvage_value,
            asset_account_id: Number(acquisitionForm.asset_account_id),
            offset_account_id: Number(acquisitionForm.offset_account_id),
            expense_account_id: acquisitionForm.expense_account_id ? Number(acquisitionForm.expense_account_id) : undefined,
            notes: acquisitionForm.notes
          })
        },
        props.accessToken
      );
      setAcquisitionModalOpen(false);
      await loadAssetDetails(selectedAsset.id);
      notifications.show({ title: "Success", message: "Acquisition recorded", color: "green" });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to record acquisition");
      }
    }
  }

  function openTransferModal() {
    setTransferForm({
      to_outlet_id: String(selectedAsset?.outlet_id ?? ""),
      transfer_date: new Date().toISOString().slice(0, 10),
      notes: ""
    });
    setTransferModalOpen(true);
  }

  async function handleTransfer() {
    if (!selectedAsset) return;

    try {
      setError(null);
      await apiRequest(
        `/accounts/fixed-assets/${selectedAsset.id}/transfer`,
        {
          method: "POST",
          body: JSON.stringify({
            to_outlet_id: Number(transferForm.to_outlet_id),
            transfer_date: transferForm.transfer_date,
            notes: transferForm.notes
          })
        },
        props.accessToken
      );
      setTransferModalOpen(false);
      await loadAssetDetails(selectedAsset.id);
      await refreshAssets(outletFilter);
      notifications.show({ title: "Success", message: "Transfer recorded", color: "green" });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to record transfer");
      }
    }
  }

  function openImpairmentModal() {
    setImpairmentForm({
      impairment_date: new Date().toISOString().slice(0, 10),
      impairment_amount: 0,
      reason: "",
      expense_account_id: "",
      accum_impairment_account_id: ""
    });
    setImpairmentModalOpen(true);
  }

  async function handleImpairment() {
    if (!selectedAsset) return;

    if (!impairmentForm.expense_account_id || !impairmentForm.accum_impairment_account_id) {
      setError("Please select both expense and accumulated impairment accounts");
      return;
    }

    try {
      setError(null);
      await apiRequest(
        `/accounts/fixed-assets/${selectedAsset.id}/impairment`,
        {
          method: "POST",
          body: JSON.stringify({
            impairment_date: impairmentForm.impairment_date,
            impairment_amount: impairmentForm.impairment_amount,
            reason: impairmentForm.reason,
            expense_account_id: Number(impairmentForm.expense_account_id),
            accum_impairment_account_id: Number(impairmentForm.accum_impairment_account_id)
          })
        },
        props.accessToken
      );
      setImpairmentModalOpen(false);
      await loadAssetDetails(selectedAsset.id);
      notifications.show({ title: "Success", message: "Impairment recorded", color: "green" });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to record impairment");
      }
    }
  }

  function openDisposalModal() {
    setDisposalForm({
      disposal_date: new Date().toISOString().slice(0, 10),
      disposal_type: "SALE",
      proceeds: 0,
      disposal_cost: 0,
      cash_account_id: "",
      asset_account_id: "",
      accum_depr_account_id: "",
      accum_impairment_account_id: "",
      gain_account_id: "",
      loss_account_id: "",
      disposal_expense_account_id: "",
      notes: ""
    });
    setDisposalModalOpen(true);
  }

  async function handleDisposal() {
    if (!selectedAsset) return;

    if (!disposalForm.cash_account_id || !disposalForm.asset_account_id || !disposalForm.accum_depr_account_id) {
      setError("Please select cash, asset, and accumulated depreciation accounts");
      return;
    }

    try {
      setError(null);
      await apiRequest(
        `/accounts/fixed-assets/${selectedAsset.id}/disposal`,
        {
          method: "POST",
          body: JSON.stringify({
            disposal_date: disposalForm.disposal_date,
            disposal_type: disposalForm.disposal_type,
            proceeds: disposalForm.disposal_type === "SALE" ? disposalForm.proceeds : undefined,
            disposal_cost: disposalForm.disposal_cost,
            cash_account_id: Number(disposalForm.cash_account_id),
            asset_account_id: Number(disposalForm.asset_account_id),
            accum_depr_account_id: Number(disposalForm.accum_depr_account_id),
            accum_impairment_account_id: disposalForm.accum_impairment_account_id ? Number(disposalForm.accum_impairment_account_id) : undefined,
            gain_account_id: disposalForm.gain_account_id ? Number(disposalForm.gain_account_id) : undefined,
            loss_account_id: disposalForm.loss_account_id ? Number(disposalForm.loss_account_id) : undefined,
            disposal_expense_account_id: disposalForm.disposal_expense_account_id ? Number(disposalForm.disposal_expense_account_id) : undefined,
            notes: disposalForm.notes
          })
        },
        props.accessToken
      );
      setDisposalModalOpen(false);
      await loadAssetDetails(selectedAsset.id);
      await refreshAssets(outletFilter);
      notifications.show({ title: "Success", message: "Disposal recorded", color: "green" });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to record disposal");
      }
    }
  }

  const visibleAssets = assets.filter((item) => {
    if (!showInactive && !item.is_active) return false;
    if (outletFilter === "UNASSIGNED") return item.outlet_id == null;
    if (typeof outletFilter === "number") return item.outlet_id === outletFilter;
    return true;
  });

  const visibleCategories = showInactive
    ? categoryOptions
    : categoryOptions.filter((c) => c.is_active);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Fixed Assets"
        message="Fixed asset changes require a connection."
      />
    );
  }

  return (
    <Box>
      {error && (
        <Card mb="md" bg="red.1">
          <Text c="red.8">{error}</Text>
        </Card>
      )}

      <Card mb="md">
        <Stack gap="md">
          <Title order={3}>Fixed Assets</Title>
          <Text c="dimmed">Manage durable assets, depreciation, and lifecycle events.</Text>
        </Stack>
      </Card>

      <Card mb="md">
        <Title order={5} mb="md">Create Category</Title>
        <Group align="flex-end" gap="sm">
          <TextInput
            label="Code"
            placeholder="Code"
            value={categoryForm.code}
            onChange={(e) => setCategoryForm((p) => ({ ...p, code: e.target.value }))}
            style={{ flex: 1 }}
          />
          <TextInput
            label="Name"
            placeholder="Name"
            value={categoryForm.name}
            onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
            style={{ flex: 1 }}
          />
          <Select
            label="Method"
            value={categoryForm.depreciation_method}
            onChange={(v) => setCategoryForm((p) => ({ ...p, depreciation_method: v as "STRAIGHT_LINE" }))}
            data={[
              { value: "STRAIGHT_LINE", label: "Straight Line" },
              { value: "DECLINING_BALANCE", label: "Declining Balance" },
              { value: "SUM_OF_YEARS", label: "Sum of Years" }
            ]}
            style={{ flex: 1 }}
          />
          <NumberInput
            label="Useful Life (months)"
            value={categoryForm.useful_life_months}
            onChange={(v) => setCategoryForm((p) => ({ ...p, useful_life_months: String(v ?? 60) }))}
            style={{ flex: 1 }}
          />
          <NumberInput
            label="Residual %"
            value={categoryForm.residual_value_pct}
            onChange={(v) => setCategoryForm((p) => ({ ...p, residual_value_pct: String(v ?? 0) }))}
            style={{ flex: 1 }}
          />
          <Select
            label="Expense Account"
            placeholder="Select account"
            value={categoryForm.expense_account_id}
            onChange={(v) => setCategoryForm((p) => ({ ...p, expense_account_id: v ?? "" }))}
            data={accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            style={{ flex: 1 }}
            clearable
          />
          <Select
            label="Accum. Depr. Account"
            placeholder="Select account"
            value={categoryForm.accum_depr_account_id}
            onChange={(v) => setCategoryForm((p) => ({ ...p, accum_depr_account_id: v ?? "" }))}
            data={accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            style={{ flex: 1 }}
            clearable
          />
          <Button onClick={handleCreateCategory}>Add Category</Button>
        </Group>
      </Card>

      <Card mb="md">
        <Title order={5} mb="md">Category List</Title>
        <Group justify="space-between" mb="md">
          <Text size="sm">{visibleCategories.length} categories</Text>
          <Button
            variant="subtle"
            size="xs"
            onClick={() => setShowInactive(!showInactive)}
          >
            {showInactive ? "Hide Inactive" : "Show Inactive"}
          </Button>
        </Group>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Code</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Method</Table.Th>
              <Table.Th>Life (Mo)</Table.Th>
              <Table.Th>Residual %</Table.Th>
              <Table.Th>Active</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleCategories.map((category) => (
              <Table.Tr key={category.id}>
                <Table.Td>{category.code}</Table.Td>
                <Table.Td>{category.name}</Table.Td>
                <Table.Td>{category.depreciation_method}</Table.Td>
                <Table.Td>{category.useful_life_months}</Table.Td>
                <Table.Td>{category.residual_value_pct}%</Table.Td>
                <Table.Td>
                  <Badge color={category.is_active ? "green" : "gray"}>
                    {category.is_active ? "Active" : "Inactive"}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      <Card mb="md">
        <Title order={5} mb="md">Create Asset</Title>
        <Group align="flex-end" gap="sm">
          <TextInput
            label="Name"
            placeholder="Asset name"
            value={createAssetForm.name}
            onChange={(e) => setCreateAssetForm((p) => ({ ...p, name: e.target.value }))}
            style={{ flex: 1 }}
          />
          <TextInput
            label="Asset Tag"
            placeholder="Tag"
            value={createAssetForm.asset_tag}
            onChange={(e) => setCreateAssetForm((p) => ({ ...p, asset_tag: e.target.value }))}
            style={{ flex: 1 }}
          />
          <Select
            label="Category"
            placeholder="Select category"
            value={createAssetForm.category_id}
            onChange={(v) => setCreateAssetForm((p) => ({ ...p, category_id: v ?? "" }))}
            data={categoryOptions.map((c) => ({ value: String(c.id), label: `${c.code} - ${c.name}` }))}
            style={{ flex: 1 }}
            clearable
          />
          <TextInput
            label="Serial Number"
            placeholder="Serial"
            value={createAssetForm.serial_number}
            onChange={(e) => setCreateAssetForm((p) => ({ ...p, serial_number: e.target.value }))}
            style={{ flex: 1 }}
          />
          <Select
            label="Outlet"
            placeholder="Select outlet"
            value={createAssetForm.outlet_id}
            onChange={(v) => setCreateAssetForm((p) => ({ ...p, outlet_id: v ?? "" }))}
            data={[
              { value: "", label: "Unassigned" },
              ...outletOptions.map((o) => ({ value: String(o.id), label: `${o.code} - ${o.name}` }))
            ]}
            style={{ flex: 1 }}
          />
          <TextInput
            label="Purchase Date"
            placeholder="YYYY-MM-DD"
            value={createAssetForm.purchase_date}
            onChange={(e) => setCreateAssetForm((p) => ({ ...p, purchase_date: e.target.value }))}
            style={{ flex: 1 }}
          />
          <NumberInput
            label="Purchase Cost"
            placeholder="0"
            value={createAssetForm.purchase_cost}
            onChange={(v) => setCreateAssetForm((p) => ({ ...p, purchase_cost: String(v ?? "") }))}
            style={{ flex: 1 }}
          />
          <Button onClick={handleCreateAsset}>Add Asset</Button>
        </Group>
      </Card>

      <Card>
        <Group justify="space-between" mb="md">
          <Title order={5}>Asset List</Title>
          <Group gap="sm">
            <Select
              size="sm"
              value={String(outletFilter)}
              onChange={(v) => setOutletFilter(v === "ALL" ? "ALL" : v === "UNASSIGNED" ? "UNASSIGNED" : Number(v))}
              data={[
                { value: "ALL", label: "All outlets" },
                { value: "UNASSIGNED", label: "Unassigned" },
                ...outletOptions.map((o) => ({ value: String(o.id), label: `${o.code} - ${o.name}` }))
              ]}
            />
            <Button variant="subtle" size="xs" onClick={() => setShowInactive(!showInactive)}>
              {showInactive ? "Hide Inactive" : "Show Inactive"}
            </Button>
          </Group>
        </Group>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Tag</Table.Th>
              <Table.Th>Category</Table.Th>
              <Table.Th>Outlet</Table.Th>
              <Table.Th>Cost</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleAssets.map((asset) => (
              <Table.Tr key={asset.id}>
                <Table.Td>{asset.id}</Table.Td>
                <Table.Td>{asset.name}</Table.Td>
                <Table.Td>{asset.asset_tag ?? "-"}</Table.Td>
                <Table.Td>
                  {asset.category_id
                    ? categoryLabelById.get(asset.category_id) ?? `#${asset.category_id}`
                    : "-"}
                </Table.Td>
                <Table.Td>
                  {asset.outlet_id
                    ? outletLabelById.get(asset.outlet_id) ?? `#${asset.outlet_id}`
                    : "-"}
                </Table.Td>
                <Table.Td>{asset.purchase_cost ? `Rp${asset.purchase_cost.toLocaleString()}` : "-"}</Table.Td>
                <Table.Td>
                  <Badge color={asset.disposed_at ? "red" : asset.is_active ? "green" : "gray"}>
                    {asset.disposed_at ? "Disposed" : asset.is_active ? "Active" : "Inactive"}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" variant="light" onClick={() => openAssetDetail(asset)}>
                      View
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="red"
                      onClick={() => handleDeleteAsset(asset.id)}
                    >
                      Delete
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {visibleAssets.length === 0 && (
          <Text c="dimmed" ta="center" py="xl">
            No assets found.
          </Text>
        )}
      </Card>

      <Modal
        opened={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={`Asset: ${selectedAsset?.name}`}
        size="lg"
      >
        <LoadingOverlay visible={detailLoading} />
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="overview">Overview</Tabs.Tab>
            <Tabs.Tab value="lifecycle">Lifecycle</Tabs.Tab>
            <Tabs.Tab value="actions">Actions</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="overview" pt="md">
            <Stack gap="md">
              <Group grow>
                <div>
                  <Text size="sm" c="dimmed">Asset Tag</Text>
                  <Text>{selectedAsset?.asset_tag ?? "-"}</Text>
                </div>
                <div>
                  <Text size="sm" c="dimmed">Serial Number</Text>
                  <Text>{selectedAsset?.serial_number ?? "-"}</Text>
                </div>
                <div>
                  <Text size="sm" c="dimmed">Category</Text>
                  <Text>
                    {selectedAsset?.category_id
                      ? categoryLabelById.get(selectedAsset.category_id) ?? `#${selectedAsset.category_id}`
                      : "-"}
                  </Text>
                </div>
              </Group>
              <Group grow>
                <div>
                  <Text size="sm" c="dimmed">Outlet</Text>
                  <Text>
                    {selectedAsset?.outlet_id
                      ? outletLabelById.get(selectedAsset.outlet_id) ?? `#${selectedAsset.outlet_id}`
                      : "Unassigned"}
                  </Text>
                </div>
                <div>
                  <Text size="sm" c="dimmed">Purchase Date</Text>
                  <Text>{selectedAsset?.purchase_date?.slice(0, 10) ?? "-"}</Text>
                </div>
                <div>
                  <Text size="sm" c="dimmed">Status</Text>
                  <Badge color={selectedAsset?.disposed_at ? "red" : selectedAsset?.is_active ? "green" : "gray"}>
                    {selectedAsset?.disposed_at ? "Disposed" : selectedAsset?.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </Group>
              {assetBook && (
                <>
                  <Title order={6} mt="md">Book Value</Title>
                  <Group grow>
                    <div>
                      <Text size="sm" c="dimmed">Cost Basis</Text>
                      <Text fw={500}>Rp{assetBook.cost_basis.toLocaleString()}</Text>
                    </div>
                    <div>
                      <Text size="sm" c="dimmed">Accum. Depreciation</Text>
                      <Text fw={500}>Rp{assetBook.accum_depreciation.toLocaleString()}</Text>
                    </div>
                    <div>
                      <Text size="sm" c="dimmed">Accum. Impairment</Text>
                      <Text fw={500}>Rp{assetBook.accum_impairment.toLocaleString()}</Text>
                    </div>
                    <div>
                      <Text size="sm" c="dimmed">Carrying Amount</Text>
                      <Text fw={500} c="blue">
                        Rp{assetBook.carrying_amount.toLocaleString()}
                      </Text>
                    </div>
                  </Group>
                </>
              )}
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="lifecycle" pt="md">
            {assetLedger && assetLedger.events.length > 0 ? (
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Journal</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {assetLedger.events.map((event) => (
                    <Table.Tr key={event.id}>
                      <Table.Td>{event.event_date}</Table.Td>
                      <Table.Td>
                        <Badge
                          color={
                            event.event_type === "ACQUISITION"
                              ? "green"
                              : event.event_type === "DEPRECIATION"
                              ? "blue"
                              : event.event_type === "DISPOSAL"
                              ? "red"
                              : event.event_type === "IMPAIRMENT"
                              ? "orange"
                              : "gray"
                          }
                        >
                          {event.event_type}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {event.journal_batch_id ? (
                          <Text size="xs" c="blue" style={{ cursor: "pointer" }}>
                            #{event.journal_batch_id}
                          </Text>
                        ) : (
                          "-"
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Badge color={event.status === "POSTED" ? "green" : "red"}>
                          {event.status}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : (
              <Text c="dimmed" ta="center" py="xl">
                No lifecycle events. Record an acquisition to start.
              </Text>
            )}
          </Tabs.Panel>

          <Tabs.Panel value="actions" pt="md">
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Perform lifecycle actions on this asset.
              </Text>
              <Group>
                <Button
                  variant="light"
                  onClick={openAcquisitionModal}
                  disabled={!!selectedAsset?.disposed_at}
                >
                  Record Acquisition
                </Button>
                <Button
                  variant="light"
                  onClick={openTransferModal}
                  disabled={!!selectedAsset?.disposed_at}
                >
                  Transfer
                </Button>
                <Button
                  variant="light"
                  color="orange"
                  onClick={openImpairmentModal}
                  disabled={!!selectedAsset?.disposed_at}
                >
                  Impairment
                </Button>
                <Button
                  variant="light"
                  color="red"
                  onClick={openDisposalModal}
                  disabled={!!selectedAsset?.disposed_at}
                >
                  Dispose
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Modal>

      <Modal
        opened={acquisitionModalOpen}
        onClose={() => setAcquisitionModalOpen(false)}
        title="Record Acquisition"
      >
        <Stack gap="md">
          <DatePickerInput
            label="Acquisition Date"
            value={acquisitionForm.event_date ? new Date(acquisitionForm.event_date) : null}
            onChange={(v: Date | null) => setAcquisitionForm((p) => ({ ...p, event_date: v?.toISOString().slice(0, 10) ?? "" }))}
          />
          <NumberInput
            label="Cost"
            value={acquisitionForm.cost}
            onChange={(v: string | number | undefined) => setAcquisitionForm((p) => ({ ...p, cost: Number(v) ?? 0 }))}
          />
          <NumberInput
            label="Useful Life (months)"
            value={acquisitionForm.useful_life_months}
            onChange={(v: string | number | undefined) => setAcquisitionForm((p) => ({ ...p, useful_life_months: Number(v) ?? 60 }))}
          />
          <NumberInput
            label="Salvage Value"
            value={acquisitionForm.salvage_value}
            onChange={(v: string | number | undefined) => setAcquisitionForm((p) => ({ ...p, salvage_value: Number(v) ?? 0 }))}
          />
          <Select
            label="Asset Account (Debit)"
            placeholder="Select fixed asset account"
            value={acquisitionForm.asset_account_id}
            onChange={(v) => setAcquisitionForm((p) => ({ ...p, asset_account_id: v ?? "" }))}
            data={accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            required
          />
          <Select
            label="Offset Account (Credit)"
            placeholder="Select offset account (AP/Cash)"
            value={acquisitionForm.offset_account_id}
            onChange={(v) => setAcquisitionForm((p) => ({ ...p, offset_account_id: v ?? "" }))}
            data={accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            required
          />
          <TextInput
            label="Notes"
            value={acquisitionForm.notes}
            onChange={(e) => setAcquisitionForm((p) => ({ ...p, notes: e.target.value }))}
          />
          <Button onClick={handleAcquisition}>Record Acquisition</Button>
        </Stack>
      </Modal>

      <Modal
        opened={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        title="Transfer Asset"
      >
        <Stack gap="md">
          <Select
            label="To Outlet"
            value={transferForm.to_outlet_id}
            onChange={(v) => setTransferForm((p) => ({ ...p, to_outlet_id: v ?? "" }))}
            data={outletOptions.map((o) => ({ value: String(o.id), label: `${o.code} - ${o.name}` }))}
            required
          />
          <DatePickerInput
            label="Transfer Date"
            value={transferForm.transfer_date ? new Date(transferForm.transfer_date) : null}
            onChange={(v) => setTransferForm((p) => ({ ...p, transfer_date: v?.toISOString().slice(0, 10) ?? "" }))}
          />
          <TextInput
            label="Notes"
            value={transferForm.notes}
            onChange={(e) => setTransferForm((p) => ({ ...p, notes: e.target.value }))}
          />
          <Button onClick={handleTransfer}>Record Transfer</Button>
        </Stack>
      </Modal>

      <Modal
        opened={impairmentModalOpen}
        onClose={() => setImpairmentModalOpen(false)}
        title="Record Impairment"
      >
        <Stack gap="md">
          <DatePickerInput
            label="Impairment Date"
            value={impairmentForm.impairment_date ? new Date(impairmentForm.impairment_date) : null}
            onChange={(v) => setImpairmentForm((p) => ({ ...p, impairment_date: v?.toISOString().slice(0, 10) ?? "" }))}
          />
          <NumberInput
            label="Impairment Amount"
            value={impairmentForm.impairment_amount}
            onChange={(v) => setImpairmentForm((p) => ({ ...p, impairment_amount: Number(v) ?? 0 }))}
          />
          <TextInput
            label="Reason"
            value={impairmentForm.reason}
            onChange={(e) => setImpairmentForm((p) => ({ ...p, reason: e.target.value }))}
            required
          />
          <Select
            label="Expense Account"
            value={impairmentForm.expense_account_id}
            onChange={(v) => setImpairmentForm((p) => ({ ...p, expense_account_id: v ?? "" }))}
            data={accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            required
          />
          <Select
            label="Accumulated Impairment Account"
            value={impairmentForm.accum_impairment_account_id}
            onChange={(v) => setImpairmentForm((p) => ({ ...p, accum_impairment_account_id: v ?? "" }))}
            data={accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            required
          />
          <Button color="orange" onClick={handleImpairment}>
            Record Impairment
          </Button>
        </Stack>
      </Modal>

      <Modal
        opened={disposalModalOpen}
        onClose={() => setDisposalModalOpen(false)}
        title="Dispose Asset"
      >
        <Stack gap="md">
          <DatePickerInput
            label="Disposal Date"
            value={disposalForm.disposal_date ? new Date(disposalForm.disposal_date) : null}
            onChange={(v) => setDisposalForm((p) => ({ ...p, disposal_date: v?.toISOString().slice(0, 10) ?? "" }))}
          />
          <Select
            label="Disposal Type"
            value={disposalForm.disposal_type}
            onChange={(v) => setDisposalForm((p) => ({ ...p, disposal_type: v as "SALE" | "SCRAP" }))}
            data={[
              { value: "SALE", label: "Sale" },
              { value: "SCRAP", label: "Scrap" }
            ]}
          />
          {disposalForm.disposal_type === "SALE" && (
            <NumberInput
              label="Proceeds"
              value={disposalForm.proceeds}
              onChange={(v) => setDisposalForm((p) => ({ ...p, proceeds: Number(v) ?? 0 }))}
            />
          )}
          <NumberInput
            label="Disposal Cost"
            value={disposalForm.disposal_cost}
            onChange={(v) => setDisposalForm((p) => ({ ...p, disposal_cost: Number(v) ?? 0 }))}
          />
          <Select
            label="Cash Account"
            value={disposalForm.cash_account_id}
            onChange={(v) => setDisposalForm((p) => ({ ...p, cash_account_id: v ?? "" }))}
            data={accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            required
          />
          <Select
            label="Asset Account"
            value={disposalForm.asset_account_id}
            onChange={(v) => setDisposalForm((p) => ({ ...p, asset_account_id: v ?? "" }))}
            data={accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            required
          />
          <Select
            label="Accumulated Depreciation Account"
            value={disposalForm.accum_depr_account_id}
            onChange={(v) => setDisposalForm((p) => ({ ...p, accum_depr_account_id: v ?? "" }))}
            data={accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
            required
          />
          <Select
            label="Accumulated Impairment Account"
            value={disposalForm.accum_impairment_account_id}
            onChange={(v) => setDisposalForm((p) => ({ ...p, accum_impairment_account_id: v ?? "" }))}
            data={accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          />
          <Select
            label="Gain Account"
            value={disposalForm.gain_account_id}
            onChange={(v) => setDisposalForm((p) => ({ ...p, gain_account_id: v ?? "" }))}
            data={accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          />
          <Select
            label="Loss Account"
            value={disposalForm.loss_account_id}
            onChange={(v) => setDisposalForm((p) => ({ ...p, loss_account_id: v ?? "" }))}
            data={accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          />
          <Select
            label="Disposal Expense Account"
            value={disposalForm.disposal_expense_account_id}
            onChange={(v) => setDisposalForm((p) => ({ ...p, disposal_expense_account_id: v ?? "" }))}
            data={accounts.map((a) => ({ value: String(a.id), label: `${a.code} - ${a.name}` }))}
          />
          <TextInput
            label="Notes"
            value={disposalForm.notes}
            onChange={(e) => setDisposalForm((p) => ({ ...p, notes: e.target.value }))}
          />
          <Button color="red" onClick={handleDisposal}>
            Dispose Asset
          </Button>
        </Stack>
      </Modal>
    </Box>
  );
}
