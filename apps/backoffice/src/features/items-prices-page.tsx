// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import {
  Stack,
  Card,
  Title,
  Text,
  Group,
  SimpleGrid,
  Select,
  TextInput,
  Textarea,
  NumberInput,
  Checkbox,
  Button,
  Accordion,
  Table,
  ScrollArea,
  Badge,
  Alert,
  Loader,
  Modal,
  ActionIcon,
  SegmentedControl,
  Box,
  Tabs,
  CloseButton,
  FileInput,
  Progress
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconAlertCircle, IconTrash, IconInfoCircle, IconEdit, IconSearch, IconUpload, IconDownload } from "@tabler/icons-react";
import { apiRequest, ApiError } from "../lib/api-client";
import { CacheService, buildCacheKey } from "../lib/cache-service";
import { useOnlineStatus } from "../lib/connection";
import { StaleDataWarning } from "../components/stale-data-warning";
import { OfflinePage } from "../components/offline-page";
import { ImportStepBadges } from "../components/import-step-badges";
import { readImportFile } from "../lib/import/delimited";
import { parseItemImportRows, buildItemImportPlan, computeItemImportSummary, type ItemImportPlanRow, type ItemImportSummary } from "./items-import-utils";
import { parsePriceImportRows, buildPriceImportPlan, computePriceImportSummary, type PriceImportPlanRow, type PriceImportSummary } from "./item-prices-import-utils";
import { downloadItemsCsv, downloadPricesCsv } from "./items-prices-export-utils";
import type { SessionUser } from "../lib/session";

type ItemType = "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";

type ItemGroup = {
  id: number;
  company_id: number;
  parent_id: number | null;
  code: string | null;
  name: string;
  is_active: boolean;
  updated_at: string;
};

type Item = {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  type: ItemType;
  item_group_id: number | null;
  is_active: boolean;
  updated_at: string;
};

type ItemPrice = {
  id: number;
  company_id: number;
  outlet_id: number | null;
  item_id: number;
  price: number;
  is_active: boolean;
  item_group_id: number | null;
  item_group_name: string | null;
  updated_at: string;
  is_override?: boolean;
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
    return "RECIPE items typically don't need prices. Consider pricing the PRODUCT instead.";
  }
  if (type === "INGREDIENT" && hasPrice) {
    return "Selling ingredients directly? You may want to create a PRODUCT item for retail sales.";
  }
  return null;
}

function canManageCompanyDefaults(user: SessionUser): boolean {
  return user.roles.includes("OWNER") || user.roles.includes("COMPANY_ADMIN");
}

function isCompanyDefault(price: ItemPrice): boolean {
  return price.outlet_id === null;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

type PricingViewMode = "defaults" | "outlet";

type ItemsPricesPageProps = {
  user: SessionUser;
  accessToken: string;
};

export function ItemsPricesPage(props: ItemsPricesPageProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [prices, setPrices] = useState<ItemPrice[]>([]);
  const [companyDefaults, setCompanyDefaults] = useState<ItemPrice[]>([]);
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedOutletId, setSelectedOutletId] = useState<number>(props.user.outlets[0]?.id ?? 0);
  const [activeTab, setActiveTab] = useState<"items" | "prices">("items");
  const [pricingViewMode, setPricingViewMode] = useState<PricingViewMode>("outlet");
  const [savingItem, setSavingItem] = useState<number | null>(null);
  const [deletingItem, setDeletingItem] = useState<number | null>(null);
  const [savingPrice, setSavingPrice] = useState<number | null>(null);
  const [deletingPrice, setDeletingPrice] = useState<number | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);
  const [creatingPrice, setCreatingPrice] = useState(false);
  const canManageDefaults = canManageCompanyDefaults(props.user);
  const isOnline = useOnlineStatus();
  const isMobile = useMediaQuery("(max-width: 48em)");

  // Filter state
  const [itemSearch, setItemSearch] = useState("");
  const [itemTypeFilter, setItemTypeFilter] = useState<string | null>(null);
  const [itemGroupFilter, setItemGroupFilter] = useState<string | null>(null);
  const [itemActiveFilter, setItemActiveFilter] = useState<boolean | null>(null);
  const [priceSearch, setPriceSearch] = useState("");
  const [priceScopeFilter, setPriceScopeFilter] = useState<string | null>(null);
  const [priceActiveFilter, setPriceActiveFilter] = useState<boolean | null>(null);

  // Create form modal state
  const [createItemOpened, { open: openCreateItem, close: closeCreateItem }] = useDisclosure(false);
  const [createPriceOpened, { open: openCreatePrice, close: closeCreatePrice }] = useDisclosure(false);

  // Modal states for override creation
  const [overrideModalOpened, { open: openOverrideModal, close: closeOverrideModal }] = useDisclosure(false);
  const [overrideTarget, setOverrideTarget] = useState<{ itemId: number; defaultPrice: number } | null>(null);
  const [overridePriceValue, setOverridePriceValue] = useState<string>("");
  const [creatingOverride, setCreatingOverride] = useState(false);

  // Modal states for delete confirmation
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "item" | "price"; id: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Import state - Items
  const [importItemsOpened, importItemsHandlers] = useDisclosure(false);
  const [importItemsStep, setImportItemsStep] = useState<"source" | "preview" | "apply">("source");
  const [importItemsText, setImportItemsText] = useState("");
  const [importItemsPlan, setImportItemsPlan] = useState<ItemImportPlanRow[]>([]);
  const [importItemsSummary, setImportItemsSummary] = useState<ItemImportSummary>({ create: 0, error: 0, total: 0 });
  const [importingItems, setImportingItems] = useState(false);
  const [importItemsProgress, setImportItemsProgress] = useState(0);
  const [importItemsResults, setImportItemsResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });

  // Import state - Prices
  const [importPricesOpened, importPricesHandlers] = useDisclosure(false);
  const [importPricesStep, setImportPricesStep] = useState<"source" | "preview" | "apply">("source");
  const [importPricesText, setImportPricesText] = useState("");
  const [importPricesPlan, setImportPricesPlan] = useState<PriceImportPlanRow[]>([]);
  const [importPricesSummary, setImportPricesSummary] = useState<PriceImportSummary>({ create: 0, error: 0, total: 0 });
  const [importingPrices, setImportingPrices] = useState(false);
  const [importPricesProgress, setImportPricesProgress] = useState(0);
  const [importPricesResults, setImportPricesResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });

  const [newItem, setNewItem] = useState({
    sku: "",
    name: "",
    type: "PRODUCT" as ItemType,
    item_group_id: null as number | null,
    is_active: true
  });
  const [newPrice, setNewPrice] = useState({
    item_id: 0,
    price: "",
    is_active: true,
    is_company_default: false
  });

  // Row editing state for tables
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingDefaultPriceId, setEditingDefaultPriceId] = useState<number | null>(null);
  const [editingOutletPriceId, setEditingOutletPriceId] = useState<number | null>(null);

  // Draft state for editing
  const [itemDraft, setItemDraft] = useState<Partial<Item>>({});
  const [defaultPriceDraft, setDefaultPriceDraft] = useState<Partial<ItemPrice>>({});
  const [outletPriceDraft, setOutletPriceDraft] = useState<Partial<ItemPrice>>({});

  // Row edit helpers
  function startEditItem(item: Item) {
    setItemDraft({ ...item });
    setEditingItemId(item.id);
  }

  function cancelEditItem() {
    setItemDraft({});
    setEditingItemId(null);
  }

  function startEditDefaultPrice(price: ItemPrice) {
    setDefaultPriceDraft({ ...price });
    setEditingDefaultPriceId(price.id);
  }

  function cancelEditDefaultPrice() {
    setDefaultPriceDraft({});
    setEditingDefaultPriceId(null);
  }

  function startEditOutletPrice(price: ItemPrice) {
    setOutletPriceDraft({ ...price });
    setEditingOutletPriceId(price.id);
  }

  function cancelEditOutletPrice() {
    setOutletPriceDraft({});
    setEditingOutletPriceId(null);
  }

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const groupMap = useMemo(() => new Map(itemGroups.map((group) => [group.id, group])), [itemGroups]);

  const outletOptions = useMemo(() =>
    props.user.outlets.map((outlet) => ({
      value: String(outlet.id),
      label: `${outlet.code} - ${outlet.name}`
    })),
    [props.user.outlets]
  );

  const itemTypeSelectOptions = useMemo(() =>
    itemTypeOptions.map((type) => ({
      value: type,
      label: type
    })),
    []
  );

  const itemGroupSelectOptions = useMemo(() =>
    [
      { value: "", label: "No group" },
      ...itemGroups.map((group) => ({
        value: String(group.id),
        label: formatGroupOption(group)
      }))
    ],
    [itemGroups]
  );

  const itemSelectOptions = useMemo(() =>
    [
      { value: "0", label: "Select item" },
      ...items.map((item) => {
        const groupName = getGroupPath(item.item_group_id);
        return {
          value: String(item.id),
          label: `${groupName} - ${item.name} (${item.type})`
        };
      })
    ],
    [items]
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (itemSearch) {
        const search = itemSearch.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(search);
        const matchesSku = item.sku?.toLowerCase().includes(search);
        if (!matchesName && !matchesSku) return false;
      }
      if (itemTypeFilter && item.type !== itemTypeFilter) return false;
      if (itemGroupFilter && item.item_group_id !== Number(itemGroupFilter)) return false;
      if (itemActiveFilter !== null && item.is_active !== itemActiveFilter) return false;
      return true;
    });
  }, [items, itemSearch, itemTypeFilter, itemGroupFilter, itemActiveFilter]);

  const filteredPrices = useMemo(() => {
    return prices.filter((price) => {
      if (priceSearch) {
        const item = itemMap.get(price.item_id);
        const itemName = item?.name.toLowerCase().includes(priceSearch.toLowerCase()) ?? false;
        if (!itemName) return false;
      }
      if (priceScopeFilter) {
        const isOverride = price.outlet_id !== null;
        if (priceScopeFilter === "override" && !isOverride) return false;
        if (priceScopeFilter === "default" && isOverride) return false;
      }
      if (priceActiveFilter !== null) {
        const isOverride = price.outlet_id !== null;
        if (isOverride && price.is_active !== priceActiveFilter) return false;
      }
      return true;
    });
  }, [prices, priceSearch, priceScopeFilter, priceActiveFilter]);

  const filteredDefaults = useMemo(() => {
    return companyDefaults.filter((price) => {
      if (priceSearch) {
        const item = itemMap.get(price.item_id);
        const itemName = item?.name.toLowerCase().includes(priceSearch.toLowerCase()) ?? false;
        if (!itemName) return false;
      }
      if (priceActiveFilter !== null && price.is_active !== priceActiveFilter) return false;
      return true;
    });
  }, [companyDefaults, priceSearch, priceActiveFilter, itemMap]);

  function getGroupPath(groupId: number | null | undefined): string {
    if (!groupId) {
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

  function formatGroupOption(group: ItemGroup): string {
    const base = getGroupPath(group.id);
    const label = group.code ? `${base} (${group.code})` : base;
    return group.is_active ? label : `${label} (inactive)`;
  }

  async function refreshData(outletId: number) {
    setLoading(true);
    setError(null);
    try {
      let itemsData: Item[] = [];
      let pricesData: ItemPrice[] = [];
      let defaultsData: ItemPrice[] = [];
      let groupsData: ItemGroup[] = [];

      if (isOnline) {
        const [itemsResponse, pricesResponse, groupsResponse, defaultsResponse] = await Promise.all([
          CacheService.refreshItems(props.user.company_id, props.accessToken),
          CacheService.refreshItemPrices(props.user.company_id, outletId, props.accessToken),
          CacheService.refreshItemGroups(props.user.company_id, props.accessToken),
          canManageDefaults
            ? apiRequest<{ success: boolean; data: ItemPrice[] }>("/inventory/item-prices", {}, props.accessToken)
            : Promise.resolve({ success: true, data: [] } as any)
        ]);
        itemsData = itemsResponse as Item[];
        pricesData = pricesResponse as ItemPrice[];
        groupsData = groupsResponse as ItemGroup[];
        defaultsData = defaultsResponse.success ? defaultsResponse.data.filter((p: ItemPrice) => isCompanyDefault(p)) : [];
      } else {
        const [itemsResponse, pricesResponse, groupsResponse] = await Promise.all([
          CacheService.getCachedItems(props.user.company_id, props.accessToken, { allowStale: true }),
          CacheService.getCachedItemPrices(
            props.user.company_id,
            outletId,
            props.accessToken,
            { allowStale: true }
          ),
          CacheService.getCachedItemGroups(props.user.company_id, props.accessToken, { allowStale: true })
        ]);
        itemsData = itemsResponse as Item[];
        pricesData = pricesResponse as ItemPrice[];
        groupsData = groupsResponse as ItemGroup[];
        defaultsData = [];
      }

      setItems(itemsData);
      setPrices(pricesData);
      setCompanyDefaults(defaultsData);
      setItemGroups(groupsData);
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
    setCreatingItem(true);
    try {
      await apiRequest("/inventory/items", {
        method: "POST",
        body: JSON.stringify({
          sku: newItem.sku.trim() || null,
          name: newItem.name.trim(),
          type: newItem.type,
          item_group_id: newItem.item_group_id ?? null,
          is_active: newItem.is_active
        })
      }, props.accessToken);
      setNewItem({ sku: "", name: "", type: "PRODUCT", item_group_id: null, is_active: true });
      closeCreateItem();
      await refreshData(selectedOutletId);
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      }
    } finally {
      setCreatingItem(false);
    }
  }

  async function saveItem(item: Item) {
    setSavingItem(item.id);
    try {
      await apiRequest(`/inventory/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          sku: item.sku,
          name: item.name,
          type: item.type,
          item_group_id: item.item_group_id,
          is_active: item.is_active
        })
      }, props.accessToken);
      await refreshData(selectedOutletId);
    } catch (saveError) {
      if (saveError instanceof ApiError) {
        setError(saveError.message);
      }
    } finally {
      setSavingItem(null);
    }
  }

  async function deleteItem(itemId: number): Promise<boolean> {
    setDeletingItem(itemId);
    try {
      await apiRequest(`/inventory/items/${itemId}`, { method: "DELETE" }, props.accessToken);
      await refreshData(selectedOutletId);
      return true;
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      }
      return false;
    } finally {
      setDeletingItem(null);
    }
  }

  async function createPrice() {
    const parsedPrice = Number(newPrice.price);
    if (newPrice.item_id <= 0 || !newPrice.price.trim() || Number.isNaN(parsedPrice) || parsedPrice < 0) {
      return;
    }

    setCreatingPrice(true);
    try {
      const outletId = newPrice.is_company_default ? null : selectedOutletId;
      await apiRequest("/inventory/item-prices", {
        method: "POST",
        body: JSON.stringify({
          item_id: newPrice.item_id,
          outlet_id: outletId,
          price: parsedPrice,
          is_active: newPrice.is_active
        })
      }, props.accessToken);
      setNewPrice((prev) => ({ ...prev, price: "", is_active: true, is_company_default: false }));
      closeCreatePrice();
      await refreshData(selectedOutletId);
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      }
    } finally {
      setCreatingPrice(false);
    }
  }

  async function savePrice(price: ItemPrice) {
    setSavingPrice(price.id);
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
    } finally {
      setSavingPrice(null);
    }
  }

  async function deletePrice(priceId: number): Promise<boolean> {
    setDeletingPrice(priceId);
    try {
      await apiRequest(`/inventory/item-prices/${priceId}`, { method: "DELETE" }, props.accessToken);
      await refreshData(selectedOutletId);
      return true;
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      }
      return false;
    } finally {
      setDeletingPrice(null);
    }
  }

  async function createOutletOverride(itemId: number, price: number, isActive = true) {
    setCreatingOverride(true);
    try {
      await apiRequest("/inventory/item-prices", {
        method: "POST",
        body: JSON.stringify({
          item_id: itemId,
          outlet_id: selectedOutletId,
          price: price,
          is_active: isActive
        })
      }, props.accessToken);
      await refreshData(selectedOutletId);
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      }
    } finally {
      setCreatingOverride(false);
    }
  }

  async function setOutletAvailabilityFromDefault(price: ItemPrice, isActive: boolean) {
    const existing = prices.find(
      (p) => p.item_id === price.item_id && p.outlet_id === selectedOutletId
    );
    if (existing) {
      setSavingPrice(existing.id);
      try {
        await apiRequest(`/inventory/item-prices/${existing.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            item_id: existing.item_id,
            outlet_id: existing.outlet_id,
            price: existing.price,
            is_active: isActive
          })
        }, props.accessToken);
        await refreshData(selectedOutletId);
      } catch (saveError) {
        if (saveError instanceof ApiError) {
          setError(saveError.message);
        }
      } finally {
        setSavingPrice(null);
      }
    } else {
      await createOutletOverride(price.item_id, price.price, isActive);
    }
  }

  function handleDeleteClick(type: "item" | "price", id: number) {
    setDeleteTarget({ type, id });
    openDeleteModal();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;

    setDeleting(true);
    const ok = deleteTarget.type === "item"
      ? await deleteItem(deleteTarget.id)
      : await deletePrice(deleteTarget.id);

    setDeleting(false);

    if (!ok) return; // keep modal open on failure
    closeDeleteModal();
    setDeleteTarget(null);
  }

  function handleSetOverrideClick(price: ItemPrice) {
    setOverrideTarget({ itemId: price.item_id, defaultPrice: price.price });
    setOverridePriceValue(String(price.price));
    openOverrideModal();
  }

  async function confirmOverride() {
    if (!overrideTarget) return;

    const priceValue = Number(overridePriceValue);
    if (isNaN(priceValue) || priceValue < 0) return;

    await createOutletOverride(overrideTarget.itemId, priceValue);
    closeOverrideModal();
    setOverrideTarget(null);
    setOverridePriceValue("");
  }

  // Items Import Handlers
  function handleItemsFileSelect(file: File | null) {
    readImportFile(file).then((text) => {
      if (text) setImportItemsText(text);
    });
  }

  function processItemsImport() {
    const rows = parseItemImportRows(importItemsText);
    if (rows.length === 0) {
      setError("Import file must have a header row and at least one data row");
      return;
    }
    const existingItems = items.map((i) => ({ sku: i.sku }));
    const existingGroups = itemGroups.map((g) => ({ code: g.code }));
    const plan = buildItemImportPlan(rows, existingItems, existingGroups);
    setImportItemsPlan(plan);
    setImportItemsSummary(computeItemImportSummary(plan));
    setImportItemsStep("preview");
  }

  async function runItemsImport() {
    const actionable = importItemsPlan.filter((p) => p.action === "CREATE");
    setImportingItems(true);
    setImportItemsStep("apply");
    setImportItemsProgress(0);
    let success = 0;
    let failed = 0;

    for (let i = 0; i < actionable.length; i++) {
      const row = actionable[i];
      setImportItemsProgress(((i + 1) / actionable.length) * 100);
      try {
        await apiRequest("/inventory/items", {
          method: "POST",
          body: JSON.stringify({
            sku: row.original.sku,
            name: row.original.name,
            type: row.original.type,
            item_group_id: row.original.item_group_code
              ? itemGroups.find((g) => g.code?.toLowerCase() === row.original.item_group_code?.toLowerCase())?.id ?? null
              : null,
            is_active: row.original.is_active
          })
        }, props.accessToken);
        success++;
      } catch {
        failed++;
      }
    }

    setImportingItems(false);
    setImportItemsResults({ success, failed });
    await refreshData(selectedOutletId);
  }

  function resetItemsImport() {
    setImportItemsStep("source");
    setImportItemsText("");
    setImportItemsPlan([]);
    setImportItemsSummary({ create: 0, error: 0, total: 0 });
    setImportItemsProgress(0);
    setImportItemsResults({ success: 0, failed: 0 });
  }

  // Prices Import Handlers
  function handlePricesFileSelect(file: File | null) {
    readImportFile(file).then((text) => {
      if (text) setImportPricesText(text);
    });
  }

  function processPricesImport() {
    const rows = parsePriceImportRows(importPricesText, selectedOutletId);
    if (rows.length === 0) {
      setError("Import file must have a header row and at least one data row");
      return;
    }
    const itemRefs = items.map((i) => ({ id: i.id, sku: i.sku }));
    const priceRefs = prices.map((p) => ({ item_id: p.item_id, outlet_id: p.outlet_id }));
    const plan = buildPriceImportPlan(rows, itemRefs, priceRefs, canManageDefaults);
    setImportPricesPlan(plan);
    setImportPricesSummary(computePriceImportSummary(plan));
    setImportPricesStep("preview");
  }

  async function runPricesImport() {
    const actionable = importPricesPlan.filter((p) => p.action === "CREATE");
    setImportingPrices(true);
    setImportPricesStep("apply");
    setImportPricesProgress(0);
    let success = 0;
    let failed = 0;

    for (let i = 0; i < actionable.length; i++) {
      const row = actionable[i];
      setImportPricesProgress(((i + 1) / actionable.length) * 100);
      const item = items.find((it) => it.sku?.toLowerCase() === row.original.item_sku.toLowerCase());
      if (!item) {
        failed++;
        continue;
      }
      try {
        await apiRequest("/inventory/item-prices", {
          method: "POST",
          body: JSON.stringify({
            item_id: item.id,
            outlet_id: row.original.scope === "default" ? null : selectedOutletId,
            price: row.original.price,
            is_active: row.original.is_active
          })
        }, props.accessToken);
        success++;
      } catch {
        failed++;
      }
    }

    setImportingPrices(false);
    setImportPricesResults({ success, failed });
    await refreshData(selectedOutletId);
  }

  function resetPricesImport() {
    setImportPricesStep("source");
    setImportPricesText("");
    setImportPricesPlan([]);
    setImportPricesSummary({ create: 0, error: 0, total: 0 });
    setImportPricesProgress(0);
    setImportPricesResults({ success: 0, failed: 0 });
  }

  function handleExport() {
    if (activeTab === "items") {
      downloadItemsCsv(filteredItems, itemGroups);
    } else {
      const prices = pricingViewMode === "defaults" ? filteredDefaults : filteredPrices;
      downloadPricesCsv(prices, items, pricingViewMode, selectedOutletId);
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

  const hasActiveFilters = itemSearch || itemTypeFilter || itemGroupFilter || itemActiveFilter !== null;
  const hasPriceFilters = priceSearch || priceScopeFilter || priceActiveFilter !== null;
  const visiblePriceCount = pricingViewMode === "defaults" ? filteredDefaults.length : filteredPrices.length;
  const totalPriceCount = pricingViewMode === "defaults" ? companyDefaults.length : prices.length;

  function resetItemFilters() {
    setItemSearch("");
    setItemTypeFilter(null);
    setItemGroupFilter(null);
    setItemActiveFilter(null);
  }

  function resetPriceFilters() {
    setPriceSearch("");
    setPriceScopeFilter(null);
    setPriceActiveFilter(null);
  }

  return (
    <Stack gap="md">
      <Card>
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Title order={2}>Items & Prices</Title>
          {loading && (
            <Group gap="xs">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">Refreshing data...</Text>
            </Group>
          )}
        </Group>
      </Card>

      <Card style={{ position: "sticky", top: 0, zIndex: 20 }}>
        <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
          <Group gap="sm" align="flex-end" wrap="wrap">
            <Select
              label="Outlet"
              value={String(selectedOutletId)}
              onChange={(value) => {
                if (!value) return;
                setSelectedOutletId(Number(value));
              }}
              data={outletOptions}
              disabled={loading}
              style={{ minWidth: 220 }}
            />
            {canManageDefaults && (
              <Box>
                <Text size="sm" fw={500} mb={4}>Pricing mode</Text>
                <SegmentedControl
                  value={pricingViewMode}
                  onChange={(value) => setPricingViewMode(value as PricingViewMode)}
                  data={[
                    { value: "outlet", label: "Outlet" },
                    { value: "defaults", label: "Defaults" }
                  ]}
                  size="sm"
                />
              </Box>
            )}
          </Group>
          <Group gap="xs">
            <Badge variant="light" color="gray">
              {activeTab === "items"
                ? `${filteredItems.length}/${items.length} items`
                : `${visiblePriceCount}/${totalPriceCount} prices`}
            </Badge>
            <Button
              variant="light"
              leftSection={<IconUpload size={16} />}
              onClick={activeTab === "items" ? importItemsHandlers.open : importPricesHandlers.open}
            >
              Import
            </Button>
            <Button
              variant="light"
              leftSection={<IconDownload size={16} />}
              onClick={handleExport}
              disabled={activeTab === "items" ? filteredItems.length === 0 : (pricingViewMode === "defaults" ? filteredDefaults.length === 0 : filteredPrices.length === 0)}
            >
              Export
            </Button>
            <Button leftSection={<IconEdit size={16} />} onClick={activeTab === "items" ? openCreateItem : openCreatePrice}>
              {activeTab === "items" ? "New Item" : "New Price"}
            </Button>
          </Group>
        </Group>
      </Card>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red" onClose={() => setError(null)} withCloseButton>
          {error}
        </Alert>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(value) => setActiveTab((value as "items" | "prices") || "items")}>
        <Tabs.List>
          <Tabs.Tab value="items">
            Items ({filteredItems.length}{hasActiveFilters ? `/${items.length}` : ""})
          </Tabs.Tab>
          <Tabs.Tab value="prices">
            Prices ({visiblePriceCount}{hasPriceFilters ? `/${totalPriceCount}` : ""})
          </Tabs.Tab>
        </Tabs.List>

        {/* Items Tab */}
        <Tabs.Panel value="items" pt="md">
          <Stack gap="md">
            {/* Filters */}
            <Card>
              <Stack gap="xs">
                <Group gap="sm" wrap="wrap">
                <TextInput
                  placeholder="Search name or SKU..."
                  leftSection={<IconSearch size={16} />}
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  style={{ minWidth: 180 }}
                />
                <Select
                  placeholder="Type"
                  value={itemTypeFilter}
                  onChange={setItemTypeFilter}
                  data={itemTypeSelectOptions}
                  clearable
                  style={{ minWidth: 120 }}
                />
                <Select
                  placeholder="Group"
                  value={itemGroupFilter}
                  onChange={setItemGroupFilter}
                  data={itemGroupSelectOptions}
                  clearable
                  style={{ minWidth: 140 }}
                />
                <Select
                  placeholder="Status"
                  value={itemActiveFilter === null ? null : String(itemActiveFilter)}
                  onChange={(v) => setItemActiveFilter(v === null ? null : v === "true")}
                  data={[
                    { value: "true", label: "Active" },
                    { value: "false", label: "Inactive" }
                  ]}
                  clearable
                  style={{ minWidth: 100 }}
                />
                  {hasActiveFilters && (
                    <Button variant="subtle" size="sm" onClick={resetItemFilters} leftSection={<CloseButton size={14} />}>
                      Clear
                    </Button>
                  )}
                </Group>
                {hasActiveFilters && (
                  <Group gap="xs">
                    <Text size="xs" c="dimmed">Active filters:</Text>
                    {itemSearch && <Badge variant="light">Search: {itemSearch}</Badge>}
                    {itemTypeFilter && <Badge variant="light">Type: {itemTypeFilter}</Badge>}
                    {itemGroupFilter && <Badge variant="light">Group: {getGroupPath(Number(itemGroupFilter))}</Badge>}
                    {itemActiveFilter !== null && (
                      <Badge variant="light">Status: {itemActiveFilter ? "Active" : "Inactive"}</Badge>
                    )}
                  </Group>
                )}
              </Stack>
            </Card>

            {/* Items Table */}
            <Card>
              <Stack gap="md">
                {filteredItems.length === 0 ? (
                  <Text c="dimmed" ta="center">
                    {hasActiveFilters ? "No items match your filters." : "No items found."}
                  </Text>
                ) : isMobile ? (
                  <Stack gap="xs">
                    {filteredItems.map((item) => {
                      const isEditing = editingItemId === item.id;
                      const draft = isEditing ? itemDraft : null;
                      return (
                        <Card key={item.id} withBorder>
                          <Stack gap="xs">
                            <Group justify="space-between" align="flex-start">
                              <div>
                                <Text size="sm" fw={600}>{item.name}</Text>
                                <Text size="xs" c="dimmed">#{item.id} · {item.sku ?? "No SKU"}</Text>
                              </div>
                              <Badge color={item.is_active ? "green" : "red"} variant="light">
                                {item.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </Group>
                            {isEditing ? (
                              <Stack gap="xs">
                                <TextInput
                                  size="sm"
                                  label="SKU"
                                  value={draft?.sku ?? ""}
                                  onChange={(event) =>
                                    setItemDraft((prev) => ({ ...prev, sku: event.target.value || null }))
                                  }
                                />
                                <TextInput
                                  size="sm"
                                  label="Name"
                                  value={draft?.name ?? ""}
                                  onChange={(event) =>
                                    setItemDraft((prev) => ({ ...prev, name: event.target.value }))
                                  }
                                />
                                <Select
                                  size="sm"
                                  label="Type"
                                  value={draft?.type ?? "PRODUCT"}
                                  onChange={(value) =>
                                    setItemDraft((prev) => ({ ...prev, type: (value as ItemType) || "PRODUCT" }))
                                  }
                                  data={itemTypeSelectOptions}
                                />
                                <Select
                                  size="sm"
                                  label="Group"
                                  value={draft?.item_group_id ? String(draft.item_group_id) : ""}
                                  onChange={(value) =>
                                    setItemDraft((prev) => ({ ...prev, item_group_id: value ? Number(value) : null }))
                                  }
                                  data={itemGroupSelectOptions}
                                />
                                <Checkbox
                                  label="Active"
                                  checked={draft?.is_active ?? true}
                                  onChange={(event) =>
                                    setItemDraft((prev) => ({ ...prev, is_active: event.currentTarget.checked }))
                                  }
                                />
                                <Group>
                                  <Button
                                    size="xs"
                                    color="green"
                                    onClick={async () => {
                                      const merged = { ...item, ...itemDraft };
                                      await saveItem(merged);
                                      cancelEditItem();
                                    }}
                                    loading={savingItem === item.id}
                                  >
                                    Save
                                  </Button>
                                  <Button size="xs" variant="light" onClick={cancelEditItem}>Cancel</Button>
                                </Group>
                              </Stack>
                            ) : (
                              <Group justify="space-between" align="center">
                                <Group gap="xs">
                                  <Badge variant="light">{item.type}</Badge>
                                  <Text size="xs" c="dimmed">{getGroupPath(item.item_group_id)}</Text>
                                </Group>
                                <Group gap="xs">
                                  <Button size="xs" variant="light" onClick={() => startEditItem(item)}>Edit</Button>
                                  <ActionIcon
                                    aria-label="Delete item"
                                    variant="light"
                                    color="red"
                                    size="sm"
                                    onClick={() => handleDeleteClick("item", item.id)}
                                    loading={deletingItem === item.id}
                                  >
                                    <IconTrash size={16} />
                                  </ActionIcon>
                                </Group>
                              </Group>
                            )}
                          </Stack>
                        </Card>
                      );
                    })}
                  </Stack>
                ) : (
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
                          <Table.Th>Actions</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {filteredItems.map((item) => {
                          const isEditing = editingItemId === item.id;
                          const draft = isEditing ? itemDraft : null;

                          return (
                            <Table.Tr key={item.id}>
                              <Table.Td>{item.id}</Table.Td>
                              <Table.Td>
                                {isEditing ? (
                                  <TextInput
                                    size="sm"
                                    value={draft?.sku ?? ""}
                                    onChange={(event) =>
                                      setItemDraft((prev) => ({ ...prev, sku: event.target.value || null }))
                                    }
                                  />
                                ) : (
                                  <Text size="sm">{item.sku ?? "-"}</Text>
                                )}
                              </Table.Td>
                              <Table.Td>
                                {isEditing ? (
                                  <TextInput
                                    size="sm"
                                    value={draft?.name ?? ""}
                                    onChange={(event) =>
                                      setItemDraft((prev) => ({ ...prev, name: event.target.value }))
                                    }
                                  />
                                ) : (
                                  <Text size="sm" fw={500}>{item.name}</Text>
                                )}
                              </Table.Td>
                              <Table.Td>
                                {isEditing ? (
                                  <Select
                                    size="sm"
                                    value={draft?.item_group_id ? String(draft.item_group_id) : ""}
                                    onChange={(value) =>
                                      setItemDraft((prev) => ({ ...prev, item_group_id: value ? Number(value) : null }))
                                    }
                                    data={itemGroupSelectOptions}
                                  />
                                ) : (
                                  <Text size="sm">{getGroupPath(item.item_group_id)}</Text>
                                )}
                              </Table.Td>
                              <Table.Td>
                                {isEditing ? (
                                  <Select
                                    size="sm"
                                    value={draft?.type ?? "PRODUCT"}
                                    onChange={(value) =>
                                      setItemDraft((prev) => ({ ...prev, type: (value as ItemType) || "PRODUCT" }))
                                    }
                                    data={itemTypeSelectOptions}
                                  />
                                ) : (
                                  <Badge variant="light">{item.type}</Badge>
                                )}
                              </Table.Td>
                              <Table.Td>
                                {isEditing ? (
                                  <Checkbox
                                    checked={draft?.is_active ?? true}
                                    onChange={(event) =>
                                      setItemDraft((prev) => ({ ...prev, is_active: event.currentTarget.checked }))
                                    }
                                  />
                                ) : (
                                  <Badge color={item.is_active ? "green" : "red"} variant="light">
                                    {item.is_active ? "Active" : "Inactive"}
                                  </Badge>
                                )}
                              </Table.Td>
                              <Table.Td>
                                {isEditing ? (
                                  <Group gap="xs">
                                    <Button
                                      size="xs"
                                      color="green"
                                      onClick={async () => {
                                        const merged = { ...item, ...itemDraft };
                                        await saveItem(merged);
                                        cancelEditItem();
                                      }}
                                      loading={savingItem === item.id}
                                    >
                                      Save
                                    </Button>
                                    <Button size="xs" variant="light" onClick={cancelEditItem}>
                                      Cancel
                                    </Button>
                                  </Group>
                                ) : (
                                  <Group gap="xs">
                                    <Button size="xs" variant="light" onClick={() => startEditItem(item)}>
                                      Edit
                                    </Button>
                                    <ActionIcon
                                      aria-label="Delete item"
                                      variant="light"
                                      color="red"
                                      size="sm"
                                      onClick={() => handleDeleteClick("item", item.id)}
                                      loading={deletingItem === item.id}
                                    >
                                      <IconTrash size={16} />
                                    </ActionIcon>
                                  </Group>
                                )}
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
          </Stack>
        </Tabs.Panel>

          {/* Prices Tab */}
          <Tabs.Panel value="prices" pt="md">
            <Stack gap="md">
              {/* Filters for Prices */}
              <Card>
                <Stack gap="xs">
                  <Group gap="sm" wrap="wrap">
                    <TextInput
                      placeholder="Search item..."
                      leftSection={<IconSearch size={16} />}
                      value={priceSearch}
                      onChange={(e) => setPriceSearch(e.target.value)}
                      style={{ minWidth: 180 }}
                    />
                    {pricingViewMode === "outlet" && (
                      <Select
                        placeholder="Scope"
                        value={priceScopeFilter}
                        onChange={setPriceScopeFilter}
                        data={[
                          { value: "override", label: "Override" },
                          { value: "default", label: "Default" }
                        ]}
                        clearable
                        style={{ minWidth: 100 }}
                      />
                    )}
                    <Select
                      placeholder="Status"
                      value={priceActiveFilter === null ? null : String(priceActiveFilter)}
                      onChange={(v) => setPriceActiveFilter(v === null ? null : v === "true")}
                      data={[
                        { value: "true", label: "Active" },
                        { value: "false", label: "Inactive" }
                      ]}
                      clearable
                      style={{ minWidth: 100 }}
                    />
                    {hasPriceFilters && (
                      <Button variant="subtle" size="sm" onClick={resetPriceFilters} leftSection={<CloseButton size={14} />}>
                        Clear
                      </Button>
                    )}
                  </Group>
                  {hasPriceFilters && (
                    <Group gap="xs">
                      <Text size="xs" c="dimmed">Active filters:</Text>
                      {priceSearch && <Badge variant="light">Search: {priceSearch}</Badge>}
                      {priceScopeFilter && <Badge variant="light">Scope: {priceScopeFilter}</Badge>}
                      {priceActiveFilter !== null && (
                        <Badge variant="light">Status: {priceActiveFilter ? "Active" : "Inactive"}</Badge>
                      )}
                    </Group>
                  )}
                </Stack>
              </Card>

              {/* Prices Table */}
              {isMobile ? (
                <Card>
                  <Stack gap="xs">
                    {(pricingViewMode === "defaults" ? filteredDefaults : filteredPrices).length === 0 ? (
                      <Text c="dimmed" ta="center">
                        {hasPriceFilters
                          ? "No prices match your filters."
                          : pricingViewMode === "defaults"
                            ? "No company default prices."
                            : "No prices for this outlet."}
                      </Text>
                    ) : (
                      (pricingViewMode === "defaults" ? filteredDefaults : filteredPrices).map((price) => {
                        const item = itemMap.get(price.item_id);
                        const isOverride = price.outlet_id !== null;
                        return (
                          <Card key={price.id} withBorder>
                            <Stack gap="xs">
                              <Group justify="space-between" align="flex-start">
                                <div>
                                  <Text fw={600} size="sm">{item ? item.name : "Unknown item"}</Text>
                                  <Text size="xs" c="dimmed">#{price.id} · {item ? item.type : "-"}</Text>
                                </div>
                                <Badge variant="light" color={price.is_active ? "green" : "red"}>
                                  {price.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </Group>
                              <Group justify="space-between">
                                <Text size="sm" c="dimmed">{getGroupPath(item?.item_group_id)}</Text>
                                <Text size="sm" fw={600}>{formatCurrency(price.price)}</Text>
                              </Group>
                              {pricingViewMode === "outlet" && (
                                <Group justify="space-between">
                                  {isOverride ? (
                                    <Badge color={price.is_active ? "green" : "red"} variant="light">
                                      {price.is_active ? "Override" : "Unavailable"}
                                    </Badge>
                                  ) : (
                                    <Badge variant="light" color="gray">Default</Badge>
                                  )}
                                  <Group gap="xs">
                                    {isOverride ? (
                                      <>
                                        <Button
                                          size="xs"
                                          variant="light"
                                          onClick={() => setOutletAvailabilityFromDefault(price, !price.is_active)}
                                        >
                                          {price.is_active ? "Disable" : "Enable"}
                                        </Button>
                                        <ActionIcon
                                          aria-label="Delete price"
                                          variant="light"
                                          color="red"
                                          size="sm"
                                          onClick={() => handleDeleteClick("price", price.id)}
                                          loading={deletingPrice === price.id}
                                        >
                                          <IconTrash size={16} />
                                        </ActionIcon>
                                      </>
                                    ) : (
                                      <Button size="xs" variant="light" onClick={() => handleSetOverrideClick(price)}>Override</Button>
                                    )}
                                  </Group>
                                </Group>
                              )}
                            </Stack>
                          </Card>
                        );
                      })
                    )}
                  </Stack>
                </Card>
              ) : pricingViewMode === "defaults" ? (
                <Card>
                  <Stack gap="md">
                    <ScrollArea>
                      <Table highlightOnHover striped stickyHeader>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>ID</Table.Th>
                            <Table.Th>Item</Table.Th>
                            <Table.Th>Group</Table.Th>
                            <Table.Th>Price</Table.Th>
                            <Table.Th>Status</Table.Th>
                            <Table.Th>Actions</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {filteredDefaults.length === 0 ? (
                            <Table.Tr>
                              <Table.Td colSpan={6}>
                                <Text c="dimmed" ta="center">
                                  {hasPriceFilters ? "No prices match your filters." : "No company default prices."}
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          ) : (
                            filteredDefaults.map((price) => {
                              const isEditing = editingDefaultPriceId === price.id;
                              const draft = isEditing ? defaultPriceDraft : null;

                              return (
                                <Table.Tr key={price.id}>
                                  <Table.Td>{price.id}</Table.Td>
                                  <Table.Td>
                                    {isEditing ? (
                                      <Select
                                        size="sm"
                                        value={draft?.item_id ? String(draft.item_id) : ""}
                                        onChange={(value) => {
                                          if (!value) return;
                                          setDefaultPriceDraft((prev) => ({ ...prev, item_id: Number(value) }));
                                        }}
                                        data={itemSelectOptions.filter((opt) => opt.value !== "0")}
                                      />
                                    ) : (
                                      <Text size="sm" fw={500}>
                                        {(() => {
                                          const item = itemMap.get(price.item_id);
                                          return item ? `${item.name} (${item.type})` : "-";
                                        })()}
                                      </Text>
                                    )}
                                  </Table.Td>
                                  <Table.Td>
                                    <Text size="sm">
                                      {(() => {
                                        const item = itemMap.get(price.item_id);
                                        if (!item) return "-";
                                        return getGroupPath(item.item_group_id);
                                      })()}
                                    </Text>
                                  </Table.Td>
                                  <Table.Td>
                                    {isEditing ? (
                                      <NumberInput
                                        size="sm"
                                        value={draft?.price ?? 0}
                                        onChange={(value) =>
                                          setDefaultPriceDraft((prev) => ({ ...prev, price: Number(value) || 0 }))
                                        }
                                        min={0}
                                        decimalScale={2}
                                      />
                                    ) : (
                                      <Text size="sm" fw={500}>{formatCurrency(price.price)}</Text>
                                    )}
                                  </Table.Td>
                                  <Table.Td>
                                    {isEditing ? (
                                      <Checkbox
                                        checked={draft?.is_active ?? true}
                                        onChange={(event) =>
                                          setDefaultPriceDraft((prev) => ({ ...prev, is_active: event.currentTarget.checked }))
                                        }
                                      />
                                    ) : (
                                      <Badge color={price.is_active ? "green" : "red"} variant="light">
                                        {price.is_active ? "Active" : "Inactive"}
                                      </Badge>
                                    )}
                                  </Table.Td>
                                  <Table.Td>
                                    {isEditing ? (
                                      <Group gap="xs">
                                        <Button
                                          size="xs"
                                          color="green"
                                          onClick={async () => {
                                            setSavingPrice(price.id);
                                            try {
                                              await apiRequest(`/inventory/item-prices/${price.id}`, {
                                                method: "PATCH",
                                                body: JSON.stringify({
                                                  item_id: draft!.item_id,
                                                  price: draft!.price,
                                                  is_active: draft!.is_active
                                                })
                                              }, props.accessToken);
                                              await refreshData(selectedOutletId);
                                              cancelEditDefaultPrice();
                                            } catch (err) {
                                              if (err instanceof ApiError) {
                                                setError(err.message);
                                              }
                                            } finally {
                                              setSavingPrice(null);
                                            }
                                          }}
                                          loading={savingPrice === price.id}
                                        >
                                          Save
                                        </Button>
                                        <Button size="xs" variant="light" onClick={cancelEditDefaultPrice}>
                                          Cancel
                                        </Button>
                                      </Group>
                                    ) : (
                                      <Group gap="xs">
                                        <Button size="xs" variant="light" onClick={() => startEditDefaultPrice(price)}>
                                          Edit
                                        </Button>
                                        <ActionIcon
                                          aria-label="Delete price"
                                          variant="light"
                                          color="red"
                                          size="sm"
                                          onClick={() => handleDeleteClick("price", price.id)}
                                          loading={deletingPrice === price.id}
                                        >
                                          <IconTrash size={16} />
                                        </ActionIcon>
                                      </Group>
                                    )}
                                  </Table.Td>
                                </Table.Tr>
                              );
                            })
                          )}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  </Stack>
                </Card>
              ) : (
                <Card>
                  <Stack gap="md">
                    <ScrollArea>
                      <Table highlightOnHover striped stickyHeader>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>ID</Table.Th>
                            <Table.Th>Item</Table.Th>
                            <Table.Th>Group</Table.Th>
                            <Table.Th>Scope</Table.Th>
                            <Table.Th>Price</Table.Th>
                            <Table.Th>Status</Table.Th>
                            <Table.Th>Actions</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {filteredPrices.length === 0 ? (
                            <Table.Tr>
                              <Table.Td colSpan={7}>
                                <Text c="dimmed" ta="center">
                                  {hasPriceFilters ? "No prices match your filters." : "No prices for this outlet."}
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          ) : (
                            filteredPrices.map((price) => {
                              const isOverride = price.outlet_id !== null;
                              const isEditing = editingOutletPriceId === price.id;
                              const draft = isEditing ? outletPriceDraft : null;

                              return (
                                <Table.Tr key={price.id} bg={isOverride ? undefined : "gray.0"}>
                                  <Table.Td>{price.id}</Table.Td>
                                  <Table.Td>
                                    {isEditing ? (
                                      <Select
                                        size="sm"
                                        value={draft?.item_id ? String(draft.item_id) : ""}
                                        onChange={(value) => {
                                          if (!value) return;
                                          setOutletPriceDraft((prev) => ({ ...prev, item_id: Number(value) }));
                                        }}
                                        data={itemSelectOptions.filter((opt) => opt.value !== "0")}
                                      />
                                    ) : (
                                      <Text size="sm" fw={500}>
                                        {(() => {
                                          const item = itemMap.get(price.item_id);
                                          return item ? `${item.name} (${item.type})` : "-";
                                        })()}
                                      </Text>
                                    )}
                                  </Table.Td>
                                  <Table.Td>
                                    <Text size="sm">
                                      {(() => {
                                        const item = itemMap.get(price.item_id);
                                        if (!item) return "-";
                                        return getGroupPath(item.item_group_id);
                                      })()}
                                    </Text>
                                  </Table.Td>
                                  <Table.Td>
                                    {isOverride ? (
                                      price.is_active ? (
                                        <Badge color="green">Override</Badge>
                                      ) : (
                                        <Badge color="red">Unavailable</Badge>
                                      )
                                    ) : (
                                      <Badge variant="light" color="gray">Default</Badge>
                                    )}
                                  </Table.Td>
                                  <Table.Td>
                                    {isEditing ? (
                                      <NumberInput
                                        size="sm"
                                        value={draft?.price ?? 0}
                                        onChange={(value) =>
                                          setOutletPriceDraft((prev) => ({ ...prev, price: Number(value) || 0 }))
                                        }
                                        min={0}
                                        decimalScale={2}
                                      />
                                    ) : (
                                      <Text size="sm" fw={500}>{formatCurrency(price.price)}</Text>
                                    )}
                                  </Table.Td>
                                  <Table.Td>
                                    {isEditing ? (
                                      <Checkbox
                                        checked={draft?.is_active ?? true}
                                        onChange={(event) =>
                                          setOutletPriceDraft((prev) => ({ ...prev, is_active: event.currentTarget.checked }))
                                        }
                                      />
                                    ) : isOverride ? (
                                      <Badge color={price.is_active ? "green" : "red"} variant="light">
                                        {price.is_active ? "Active" : "Inactive"}
                                      </Badge>
                                    ) : (
                                      <Text fs="italic" c="dimmed">
                                        {price.is_active ? "Yes" : "No"}
                                      </Text>
                                    )}
                                  </Table.Td>
                                  <Table.Td>
                                    {isEditing ? (
                                      <Group gap="xs">
                                        <Button
                                          size="xs"
                                          color="green"
                                          onClick={async () => {
                                            await savePrice({ ...price, ...outletPriceDraft });
                                            cancelEditOutletPrice();
                                          }}
                                          loading={savingPrice === price.id}
                                        >
                                          Save
                                        </Button>
                                        <Button size="xs" variant="light" onClick={cancelEditOutletPrice}>
                                          Cancel
                                        </Button>
                                      </Group>
                                    ) : isOverride ? (
                                      <Group gap="xs">
                                        <Button size="xs" variant="light" onClick={() => startEditOutletPrice(price)}>
                                          Edit
                                        </Button>
                                        {!price.is_active && (
                                          <Button
                                            size="xs"
                                            color="green"
                                            variant="light"
                                            onClick={() => setOutletAvailabilityFromDefault(price, true)}
                                          >
                                            Enable
                                          </Button>
                                        )}
                                        <ActionIcon
                                          aria-label="Delete price"
                                          variant="light"
                                          color="red"
                                          size="sm"
                                          onClick={() => handleDeleteClick("price", price.id)}
                                          loading={deletingPrice === price.id}
                                        >
                                          <IconTrash size={16} />
                                        </ActionIcon>
                                      </Group>
                                    ) : (
                                      (() => {
                                        const hasOverride = prices.some(
                                          (p) => p.item_id === price.item_id && p.outlet_id === selectedOutletId
                                        );
                                        if (hasOverride) {
                                          return (
                                            <Text size="xs" c="dimmed">
                                              Overridden
                                            </Text>
                                          );
                                        }
                                        return (
                                          <Group gap="xs">
                                            <Button
                                              size="xs"
                                              color="green"
                                              variant="light"
                                              leftSection={<IconEdit size={14} />}
                                              onClick={() => handleSetOverrideClick(price)}
                                            >
                                              Override
                                            </Button>
                                            <Button
                                              size="xs"
                                              color="red"
                                              variant="light"
                                              onClick={() => setOutletAvailabilityFromDefault(price, false)}
                                            >
                                              Disable
                                            </Button>
                                          </Group>
                                        );
                                      })()
                                    )}
                                  </Table.Td>
                                </Table.Tr>
                              );
                            })
                          )}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  </Stack>
                </Card>
              )}
            </Stack>
          </Tabs.Panel>
        </Tabs>

      <Accordion variant="filled" radius="md">
        <Accordion.Item value="info">
          <Accordion.Control icon={<IconInfoCircle size={16} />}>
            <Text size="sm" fw={500}>Info & Data Freshness</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <SimpleGrid cols={{ base: 2, md: 4 }} spacing="xs">
                <div>
                  <Text fw={600} size="sm">SERVICE</Text>
                  <Text size="xs" c="dimmed">Non-tangible (delivery, labor)</Text>
                </div>
                <div>
                  <Text fw={600} size="sm">PRODUCT</Text>
                  <Text size="xs" c="dimmed">Finished goods (default)</Text>
                </div>
                <div>
                  <Text fw={600} size="sm">INGREDIENT</Text>
                  <Text size="xs" c="dimmed">Raw materials</Text>
                </div>
                <div>
                  <Text fw={600} size="sm">RECIPE</Text>
                  <Text size="xs" c="dimmed">Bill of Materials</Text>
                </div>
              </SimpleGrid>
              <Stack gap="xs">
                <StaleDataWarning
                  cacheKey={buildCacheKey("items", { companyId: props.user.company_id })}
                  label="items"
                />
                <StaleDataWarning
                  cacheKey={buildCacheKey("item_groups", { companyId: props.user.company_id })}
                  label="item groups"
                />
                <StaleDataWarning
                  cacheKey={buildCacheKey("item_prices", {
                    companyId: props.user.company_id,
                    outletId: selectedOutletId
                  })}
                  label={`prices for outlet #${selectedOutletId}`}
                />
              </Stack>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      {/* Create Item Modal */}
      <Modal
        opened={createItemOpened}
        onClose={closeCreateItem}
        title="Create New Item"
        centered
        fullScreen={isMobile}
        size="lg"
      >
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput
              label="SKU"
              placeholder="SKU"
              value={newItem.sku}
              onChange={(event) => setNewItem((prev) => ({ ...prev, sku: event.target.value }))}
            />
            <TextInput
              label="Name"
              placeholder="Name"
              value={newItem.name}
              onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <Select
              label="Type"
              value={newItem.type}
              onChange={(value) => setNewItem((prev) => ({ ...prev, type: (value as ItemType) || "PRODUCT" }))}
              data={itemTypeSelectOptions}
            />
            <Select
              label="Group"
              value={newItem.item_group_id ? String(newItem.item_group_id) : ""}
              onChange={(value) => setNewItem((prev) => ({ ...prev, item_group_id: value ? Number(value) : null }))}
              data={itemGroupSelectOptions}
            />
          </SimpleGrid>
          <Checkbox
            label="Active"
            checked={newItem.is_active}
            onChange={(event) => setNewItem((prev) => ({ ...prev, is_active: event.currentTarget.checked }))}
          />
          <Group justify="space-between">
            <Text size="sm" c="dimmed">{itemTypeExamples[newItem.type]}</Text>
            <Group>
              <Button variant="subtle" component="a" href="#/item-groups">
                Manage groups
              </Button>
              <Button onClick={createItem} loading={creatingItem} disabled={!newItem.name.trim()}>
                Create item
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>

      {/* Create Price Modal */}
      <Modal
        opened={createPriceOpened}
        onClose={closeCreatePrice}
        title={pricingViewMode === "defaults" ? "Create Company Default Price" : "Create Price"}
        centered
        fullScreen={isMobile}
        size="lg"
      >
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Select
              label="Item"
              value={String(newPrice.item_id)}
              onChange={(value) => {
                if (!value) return;
                setNewPrice((prev) => ({ ...prev, item_id: Number(value) }));
              }}
              data={itemSelectOptions}
            />
            <NumberInput
              label="Price"
              placeholder="Price"
              value={newPrice.price}
              onChange={(value) => setNewPrice((prev) => ({ ...prev, price: value == null ? "" : String(value) }))}
              min={0}
              decimalScale={2}
            />
          </SimpleGrid>
          {pricingViewMode === "outlet" && canManageDefaults && (
            <Checkbox
              label="Set as company default (applies to all outlets)"
              checked={newPrice.is_company_default}
              onChange={(event) =>
                setNewPrice((prev) => ({ ...prev, is_company_default: event.currentTarget.checked }))
              }
            />
          )}
          <Checkbox
            label="Active"
            checked={newPrice.is_active}
            onChange={(event) =>
              setNewPrice((prev) => ({ ...prev, is_active: event.currentTarget.checked }))
            }
          />
          {pricingViewMode === "defaults" && (
            <Alert variant="light" color="blue">
              Company default prices apply to all outlets unless overridden.
            </Alert>
          )}
          {newPrice.item_id > 0 && (() => {
            const selectedItem = itemMap.get(newPrice.item_id);
            if (!selectedItem) return null;
            const warning = getItemTypeWarning(selectedItem.type, newPrice.price.trim().length > 0);
            if (!warning) return null;
            return (
              <Alert icon={<IconAlertCircle size={16} />} color="yellow">
                {warning}
              </Alert>
            );
          })()}
          <Group justify="flex-end">
            <Button
              onClick={createPrice}
              loading={creatingPrice}
              disabled={newPrice.item_id <= 0 || !newPrice.price.trim() || Number.isNaN(Number(newPrice.price)) || Number(newPrice.price) < 0}
            >
              Create price
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Override Modal */}
      <Modal
        opened={overrideModalOpened}
        onClose={closeOverrideModal}
        title="Set Outlet Override Price"
        centered
      >
        <Stack>
          <Text size="sm">
            Create an outlet-specific price override. Default price: {overrideTarget?.defaultPrice}
          </Text>
          <NumberInput
            label="Override Price"
            value={overridePriceValue}
            onChange={(value) => setOverridePriceValue(value == null ? "" : String(value))}
            min={0}
            decimalScale={2}
            required
          />
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={closeOverrideModal}>
              Cancel
            </Button>
            <Button
              onClick={confirmOverride}
              loading={creatingOverride}
              disabled={!overridePriceValue.trim() || Number.isNaN(Number(overridePriceValue)) || Number(overridePriceValue) < 0}
            >
              Create Override
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        opened={deleteModalOpened}
        onClose={closeDeleteModal}
        title={`Delete ${deleteTarget?.type === "item" ? "Item" : "Price"}?`}
        centered
      >
        <Stack>
          <Text>
            Are you sure you want to delete this {deleteTarget?.type}? This action cannot be undone.
          </Text>
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={closeDeleteModal}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmDelete} loading={deleting}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Import Items Modal */}
      <Modal
        opened={importItemsOpened}
        onClose={() => {
          importItemsHandlers.close();
          resetItemsImport();
        }}
        title="Import Items"
        size="lg"
        centered
        fullScreen={isMobile}
      >
        <Stack>
          <ImportStepBadges step={importItemsStep} />

          {importItemsStep === "source" && (
            <Stack>
              <Textarea
                label="Paste CSV data"
                description="Format: sku, name, type, item_group_code, is_active"
                placeholder="sku,name,type,item_group_code,is_active&#10;SKU001,Coffee Beans,INGREDIENT,GRP001,true&#10;SKU002,Latte Recipe,RECIPE,,true"
                value={importItemsText}
                onChange={(e) => setImportItemsText(e.currentTarget.value)}
                minRows={6}
              />
              <Text size="sm" c="dimmed">
                Or upload a file
              </Text>
              <FileInput
                placeholder="Select CSV or TXT file"
                accept=".csv,.txt"
                onChange={handleItemsFileSelect}
              />
              <Button onClick={processItemsImport} disabled={!importItemsText.trim()}>
                Preview
              </Button>
            </Stack>
          )}

          {importItemsStep === "preview" && (
            <Stack>
              <Group gap="sm">
                <Badge color="green">Create: {importItemsSummary.create}</Badge>
                <Badge color="red">Error: {importItemsSummary.error}</Badge>
                <Badge color="gray">Total: {importItemsSummary.total}</Badge>
              </Group>

              {importItemsSummary.error > 0 && (
                <Alert color="red" title="Validation Errors">
                  Fix errors in your data before importing.
                </Alert>
              )}

              <ScrollArea type="auto" h={300}>
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Row</Table.Th>
                      <Table.Th>SKU</Table.Th>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Group</Table.Th>
                      <Table.Th>Status</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {importItemsPlan.slice(0, 50).map((row) => (
                      <Table.Tr key={row.rowIndex}>
                        <Table.Td>{row.rowIndex + 1}</Table.Td>
                        <Table.Td>{row.original.sku ?? "-"}</Table.Td>
                        <Table.Td>{row.original.name}</Table.Td>
                        <Table.Td>{row.original.type}</Table.Td>
                        <Table.Td>{row.original.item_group_code ?? "-"}</Table.Td>
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

              {importItemsSummary.create > 0 && (
                <Button onClick={runItemsImport} disabled={importingItems}>
                  Import ({importItemsSummary.create} items)
                </Button>
              )}
              <Button variant="default" onClick={() => setImportItemsStep("source")}>
                Back
              </Button>
            </Stack>
          )}

          {importItemsStep === "apply" && (
            <Stack>
              {importingItems ? (
                <Stack align="center" gap="md">
                  <Loader size="lg" />
                  <Text>Importing...</Text>
                  <Progress value={importItemsProgress} w="100%" animated />
                </Stack>
              ) : (
                <Stack>
                  <Alert color={importItemsResults.failed === 0 ? "green" : "yellow"}>
                    {importItemsResults.success} of {importItemsSummary.create} items imported successfully.
                    {importItemsResults.failed > 0 && ` ${importItemsResults.failed} failed.`}
                  </Alert>
                  <Button
                    onClick={() => {
                      importItemsHandlers.close();
                      resetItemsImport();
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

      {/* Import Prices Modal */}
      <Modal
        opened={importPricesOpened}
        onClose={() => {
          importPricesHandlers.close();
          resetPricesImport();
        }}
        title="Import Prices"
        size="lg"
        centered
        fullScreen={isMobile}
      >
        <Stack>
          <ImportStepBadges step={importPricesStep} />

          {importPricesStep === "source" && (
            <Stack>
              <Textarea
                label="Paste CSV data"
                description="Format: item_sku, price, is_active, scope, outlet_id"
                placeholder="item_sku,price,is_active,scope,outlet_id&#10;SKU001,25000,true,outlet,1&#10;SKU002,30000,true,default,"
                value={importPricesText}
                onChange={(e) => setImportPricesText(e.currentTarget.value)}
                minRows={6}
              />
              <Text size="sm" c="dimmed">
                Or upload a file
              </Text>
              <FileInput
                placeholder="Select CSV or TXT file"
                accept=".csv,.txt"
                onChange={handlePricesFileSelect}
              />
              <Text size="xs" c="dimmed">
                scope: &quot;default&quot; (company-wide) or &quot;outlet&quot; (specific outlet)
              </Text>
              <Button onClick={processPricesImport} disabled={!importPricesText.trim()}>
                Preview
              </Button>
            </Stack>
          )}

          {importPricesStep === "preview" && (
            <Stack>
              <Group gap="sm">
                <Badge color="green">Create: {importPricesSummary.create}</Badge>
                <Badge color="red">Error: {importPricesSummary.error}</Badge>
                <Badge color="gray">Total: {importPricesSummary.total}</Badge>
              </Group>

              {importPricesSummary.error > 0 && (
                <Alert color="red" title="Validation Errors">
                  Fix errors in your data before importing.
                </Alert>
              )}

              <ScrollArea type="auto" h={300}>
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Row</Table.Th>
                      <Table.Th>Item SKU</Table.Th>
                      <Table.Th>Price</Table.Th>
                      <Table.Th>Scope</Table.Th>
                      <Table.Th>Status</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {importPricesPlan.slice(0, 50).map((row) => (
                      <Table.Tr key={row.rowIndex}>
                        <Table.Td>{row.rowIndex + 1}</Table.Td>
                        <Table.Td>{row.original.item_sku}</Table.Td>
                        <Table.Td>{row.original.price}</Table.Td>
                        <Table.Td>{row.original.scope}</Table.Td>
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

              {importPricesSummary.create > 0 && (
                <Button onClick={runPricesImport} disabled={importingPrices}>
                  Import ({importPricesSummary.create} prices)
                </Button>
              )}
              <Button variant="default" onClick={() => setImportPricesStep("source")}>
                Back
              </Button>
            </Stack>
          )}

          {importPricesStep === "apply" && (
            <Stack>
              {importingPrices ? (
                <Stack align="center" gap="md">
                  <Loader size="lg" />
                  <Text>Importing...</Text>
                  <Progress value={importPricesProgress} w="100%" animated />
                </Stack>
              ) : (
                <Stack>
                  <Alert color={importPricesResults.failed === 0 ? "green" : "yellow"}>
                    {importPricesResults.success} of {importPricesSummary.create} prices imported successfully.
                    {importPricesResults.failed > 0 && ` ${importPricesResults.failed} failed.`}
                  </Alert>
                  <Button
                    onClick={() => {
                      importPricesHandlers.close();
                      resetPricesImport();
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
  );
}
