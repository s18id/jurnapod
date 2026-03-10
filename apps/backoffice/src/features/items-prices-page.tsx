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
  Divider,
  SegmentedControl,
  Box
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconAlertCircle, IconTrash, IconInfoCircle, IconEdit } from "@tabler/icons-react";
import { apiRequest, ApiError } from "../lib/api-client";
import { CacheService, buildCacheKey } from "../lib/cache-service";
import { useOnlineStatus } from "../lib/connection";
import { StaleDataWarning } from "../components/stale-data-warning";
import { OfflinePage } from "../components/offline-page";
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
  const [pricingViewMode, setPricingViewMode] = useState<PricingViewMode>("outlet");
  const [savingItem, setSavingItem] = useState<number | null>(null);
  const [deletingItem, setDeletingItem] = useState<number | null>(null);
  const [savingPrice, setSavingPrice] = useState<number | null>(null);
  const [deletingPrice, setDeletingPrice] = useState<number | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);
  const [creatingPrice, setCreatingPrice] = useState(false);
  const canManageDefaults = canManageCompanyDefaults(props.user);
  const isOnline = useOnlineStatus();

  // Modal states for override creation
  const [overrideModalOpened, { open: openOverrideModal, close: closeOverrideModal }] = useDisclosure(false);
  const [overrideTarget, setOverrideTarget] = useState<{ itemId: number; defaultPrice: number } | null>(null);
  const [overridePriceValue, setOverridePriceValue] = useState<string>("");
  const [creatingOverride, setCreatingOverride] = useState(false);

  // Modal states for delete confirmation
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "item" | "price"; id: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Master Data"
        message="Items and pricing changes require a connection."
      />
    );
  }

  return (
    <Stack gap="md">
      {/* Header and Controls */}
      <Card>
        <Stack gap="md">
          <Title order={2}>Items + Prices Management</Title>

          {/* Item Types Guide Accordion */}
          <Accordion variant="filled" radius="md">
            <Accordion.Item value="guide">
              <Accordion.Control icon={<IconInfoCircle size={16} />}>
                <Text fw={600} c="green.7">Item Types Guide</Text>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  <Text size="sm">
                    <strong>SERVICE:</strong> Non-tangible offerings like delivery fees, labor, consulting
                  </Text>
                  <Text size="sm">
                    <strong>PRODUCT:</strong> Finished goods sold to customers (coffee, pastries, retail items) - Default type
                  </Text>
                  <Text size="sm">
                    <strong>INGREDIENT:</strong> Raw materials used in production (beans, milk, sugar, cups)
                  </Text>
                  <Text size="sm">
                    <strong>RECIPE:</strong> Bill of Materials / formulas for making products (requires inventory level 2+)
                  </Text>
                  <Alert variant="light" color="blue" mt="xs">
                    All types can be sold via POS. INGREDIENT and RECIPE types will have special behavior when inventory module is enabled.
                  </Alert>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          <Divider />

          {/* Outlet and Pricing View Controls */}
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Select
              label="Outlet scope for prices"
              value={String(selectedOutletId)}
              onChange={(value) => {
                if (!value) return;
                setSelectedOutletId(Number(value));
              }}
              data={outletOptions}
              disabled={loading}
            />

            <Box>
              <Text size="sm" fw={500} mb="xs">Pricing view</Text>
              <SegmentedControl
                value={pricingViewMode}
                onChange={(value) => setPricingViewMode(value as PricingViewMode)}
                data={[
                  { value: "outlet", label: "Outlet Prices" },
                  ...(canManageDefaults ? [{ value: "defaults", label: "Company Defaults" }] : [])
                ]}
              />
              {pricingViewMode === "defaults" && !canManageDefaults && (
                <Text size="xs" c="dimmed" mt="xs">
                  Only OWNER and COMPANY_ADMIN can manage company default prices.
                </Text>
              )}
            </Box>
          </SimpleGrid>

          {/* Stale Data Warnings */}
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

          {/* Loading and Error States */}
          {loading && (
            <Group gap="xs">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">Loading data...</Text>
            </Group>
          )}
          {error && (
            <Alert icon={<IconAlertCircle size={16} />} title="Error" color="red">
              {error}
            </Alert>
          )}
        </Stack>
      </Card>

      {/* Create Item Form */}
      <Card>
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <Title order={3}>Create Item</Title>
            <Button
              variant="subtle"
              component="a"
              href="#/item-groups"
              size="sm"
            >
              Manage groups
            </Button>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
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
              description={itemTypeDescriptions[newItem.type]}
            />
            <Select
              label="Group"
              value={newItem.item_group_id ? String(newItem.item_group_id) : ""}
              onChange={(value) => setNewItem((prev) => ({ ...prev, item_group_id: value ? Number(value) : null }))}
              data={itemGroupSelectOptions}
              description="Optional grouping for POS and reports"
            />
          </SimpleGrid>

          <Group justify="space-between" align="flex-start">
            <Checkbox
              label="Active"
              checked={newItem.is_active}
              onChange={(event) => setNewItem((prev) => ({ ...prev, is_active: event.currentTarget.checked }))}
            />
            <Button
              onClick={createItem}
              loading={creatingItem}
              disabled={!newItem.name.trim()}
            >
              Add item
            </Button>
          </Group>

          <Text size="sm" c="dimmed">
            {itemTypeExamples[newItem.type]}
          </Text>
        </Stack>
      </Card>

      {/* Items Table */}
      <Card>
        <Stack gap="md">
          <Title order={3}>Items</Title>

          <ScrollArea>
            <Table highlightOnHover striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>SKU</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Group</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Active</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {items.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={7}>
                      <Text c="dimmed" ta="center">No items found. Create one above.</Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  items.map((item) => (
                    <Table.Tr key={item.id}>
                      <Table.Td>{item.id}</Table.Td>
                      <Table.Td>
                        <TextInput
                          size="sm"
                          value={item.sku ?? ""}
                          onChange={(event) =>
                            setItems((prev) =>
                              prev.map((entry) =>
                                entry.id === item.id ? { ...entry, sku: event.target.value || null } : entry
                              )
                            )
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          size="sm"
                          value={item.name}
                          onChange={(event) =>
                            setItems((prev) =>
                              prev.map((entry) =>
                                entry.id === item.id ? { ...entry, name: event.target.value } : entry
                              )
                            )
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <Select
                          size="sm"
                          value={item.item_group_id ? String(item.item_group_id) : ""}
                          onChange={(value) =>
                            setItems((prev) =>
                              prev.map((entry) =>
                                entry.id === item.id
                                  ? { ...entry, item_group_id: value ? Number(value) : null }
                                  : entry
                              )
                            )
                          }
                          data={itemGroupSelectOptions}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Select
                          size="sm"
                          value={item.type}
                          onChange={(value) =>
                            setItems((prev) =>
                              prev.map((entry) =>
                                entry.id === item.id
                                  ? { ...entry, type: (value as ItemType) || item.type }
                                  : entry
                              )
                            )
                          }
                          data={itemTypeSelectOptions}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Checkbox
                          checked={item.is_active}
                          onChange={(event) =>
                            setItems((prev) =>
                              prev.map((entry) =>
                                entry.id === item.id
                                  ? { ...entry, is_active: event.currentTarget.checked }
                                  : entry
                              )
                            )
                          }
                        />
                      </Table.Td>
                      <Table.Td>
                        <Group gap="xs">
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => saveItem(item)}
                            loading={savingItem === item.id}
                          >
                            Save
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
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Stack>
      </Card>

      {/* Create Price Form */}
      <Card>
        <Stack gap="md">
          <Title order={3}>
            {pricingViewMode === "defaults" ? "Create Company Default Price" : "Create Price"}
          </Title>

          <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
            <Select
              label="Item"
              value={String(newPrice.item_id)}
              onChange={(value) => {
                if (!value) return;
                setNewPrice((prev) => ({ ...prev, item_id: Number(value) }));
              }}
              data={itemSelectOptions}
              required
            />
            <NumberInput
              label="Price"
              placeholder="Price"
              value={newPrice.price}
              onChange={(value) => setNewPrice((prev) => ({ ...prev, price: value == null ? "" : String(value) }))}
              min={0}
              decimalScale={2}
              required
            />
            {pricingViewMode === "outlet" && canManageDefaults && (
              <Checkbox
                label="Company default"
                checked={newPrice.is_company_default}
                onChange={(event) =>
                  setNewPrice((prev) => ({ ...prev, is_company_default: event.currentTarget.checked }))
                }
                mt="lg"
              />
            )}
            <Checkbox
              label="Active"
              checked={newPrice.is_active}
              onChange={(event) =>
                setNewPrice((prev) => ({ ...prev, is_active: event.currentTarget.checked }))
              }
              mt="lg"
            />
          </SimpleGrid>

          <Group justify="flex-end">
            <Button
              onClick={createPrice}
              loading={creatingPrice}
              disabled={newPrice.item_id <= 0 || !newPrice.price.trim() || Number.isNaN(Number(newPrice.price)) || Number(newPrice.price) < 0}
            >
              Add price
            </Button>
          </Group>

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
        </Stack>
      </Card>

      {/* Prices Table */}
      {pricingViewMode === "defaults" ? (
        <Card>
          <Stack gap="md">
            <Group gap="xs">
              <Title order={3}>Company Default Prices</Title>
              <Badge variant="light" color="gray">applies to all outlets</Badge>
            </Group>

            {companyDefaults.length === 0 ? (
              <Text c="dimmed">No company default prices. Create one above.</Text>
            ) : (
              <ScrollArea>
                <Table highlightOnHover striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>Item</Table.Th>
                      <Table.Th>Group</Table.Th>
                      <Table.Th>Price</Table.Th>
                      <Table.Th>Active</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {companyDefaults.map((price) => (
                      <Table.Tr key={price.id}>
                        <Table.Td>{price.id}</Table.Td>
                        <Table.Td>
                          <Select
                            size="sm"
                            value={String(price.item_id)}
                            onChange={(value) => {
                              if (!value) return;
                              setCompanyDefaults((prev) =>
                                prev.map((entry) =>
                                  entry.id === price.id
                                    ? { ...entry, item_id: Number(value) }
                                    : entry
                                )
                              );
                            }}
                            data={itemSelectOptions.filter(opt => opt.value !== "0")}
                          />
                        </Table.Td>
                        <Table.Td>
                          {(() => {
                            const item = itemMap.get(price.item_id);
                            if (!item) return "-";
                            return getGroupPath(item.item_group_id);
                          })()}
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            size="sm"
                            value={price.price}
                            onChange={(value) =>
                              setCompanyDefaults((prev) =>
                                prev.map((entry) =>
                                  entry.id === price.id
                                    ? { ...entry, price: Number(value) || 0 }
                                    : entry
                                )
                              )
                            }
                            min={0}
                            decimalScale={2}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Checkbox
                            checked={price.is_active}
                            onChange={(event) =>
                              setCompanyDefaults((prev) =>
                                prev.map((entry) =>
                                  entry.id === price.id
                                    ? { ...entry, is_active: event.currentTarget.checked }
                                    : entry
                                )
                              )
                            }
                          />
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Button
                              size="xs"
                              variant="light"
                              onClick={async () => {
                                setSavingPrice(price.id);
                                try {
                                  await apiRequest(`/inventory/item-prices/${price.id}`, {
                                    method: "PATCH",
                                    body: JSON.stringify({
                                      item_id: price.item_id,
                                      price: price.price,
                                      is_active: price.is_active
                                    })
                                  }, props.accessToken);
                                  await refreshData(selectedOutletId);
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
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            )}
          </Stack>
        </Card>
      ) : (
        <Card>
          <Stack gap="md">
            <Group gap="xs">
              <Title order={3}>
                Outlet Prices: {props.user.outlets.find((o) => o.id === selectedOutletId)?.name ?? selectedOutletId}
              </Title>
              <Badge variant="light" color="gray">outlet override or company default fallback</Badge>
            </Group>

            {prices.length === 0 ? (
              <Text c="dimmed">No prices for this outlet. Set a company default or create an outlet override above.</Text>
            ) : (
              <ScrollArea>
                <Table highlightOnHover striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>Item</Table.Th>
                      <Table.Th>Group</Table.Th>
                      <Table.Th>Scope</Table.Th>
                      <Table.Th>Price</Table.Th>
                      <Table.Th>Active</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {prices.map((price) => {
                      const isOverride = price.outlet_id !== null;
                      return (
                        <Table.Tr key={price.id} bg={isOverride ? undefined : "gray.0"}>
                          <Table.Td>{price.id}</Table.Td>
                          <Table.Td>
                            <Select
                              size="sm"
                              value={String(price.item_id)}
                              onChange={(value) => {
                                if (!value) return;
                                setPrices((prev) =>
                                  prev.map((entry) =>
                                    entry.id === price.id
                                      ? { ...entry, item_id: Number(value) }
                                      : entry
                                  )
                                );
                              }}
                              data={itemSelectOptions.filter(opt => opt.value !== "0")}
                            />
                          </Table.Td>
                          <Table.Td>
                            {(() => {
                              const item = itemMap.get(price.item_id);
                              if (!item) return "-";
                              return getGroupPath(item.item_group_id);
                            })()}
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
                            {isOverride ? (
                              <NumberInput
                                size="sm"
                                value={price.price}
                                onChange={(value) =>
                                  setPrices((prev) =>
                                    prev.map((entry) =>
                                      entry.id === price.id
                                        ? { ...entry, price: Number(value) || 0 }
                                        : entry
                                    )
                                  )
                                }
                                min={0}
                                decimalScale={2}
                              />
                            ) : (
                              <Text fs="italic" c="dimmed">
                                {price.price}
                              </Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            {isOverride ? (
                              <Checkbox
                                checked={price.is_active}
                                onChange={(event) =>
                                  setPrices((prev) =>
                                    prev.map((entry) =>
                                      entry.id === price.id
                                        ? { ...entry, is_active: event.currentTarget.checked }
                                        : entry
                                    )
                                  )
                                }
                              />
                            ) : (
                              <Text fs="italic" c="dimmed">
                                {price.is_active ? "Yes" : "No"}
                              </Text>
                            )}
                          </Table.Td>
                          <Table.Td>
                            {isOverride ? (
                              price.is_active ? (
                                <Group gap="xs">
                                  <Button
                                    size="xs"
                                    variant="light"
                                    onClick={() => savePrice(price)}
                                    loading={savingPrice === price.id}
                                  >
                                    Save
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
                              ) : (
                                <Button
                                  size="xs"
                                  color="green"
                                  onClick={() => setOutletAvailabilityFromDefault(price, true)}
                                  loading={savingPrice === price.id}
                                >
                                  Make Available
                                </Button>
                              )
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
                                      leftSection={<IconEdit size={14} />}
                                      onClick={() => handleSetOverrideClick(price)}
                                    >
                                      Set Override
                                    </Button>
                                    <Button
                                      size="xs"
                                      color="red"
                                      variant="light"
                                      onClick={() => setOutletAvailabilityFromDefault(price, false)}
                                    >
                                      Mark Unavailable
                                    </Button>
                                  </Group>
                                );
                              })()
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
      )}

      {/* Quick Checks */}
      <Card bg="gray.0">
        <Stack gap="xs">
          <Text fw={600}>Quick checks</Text>
          <Text size="sm" c="dimmed">
            Loaded {items.length} items, {itemGroups.length} groups, and {prices.length} prices for outlet
            #{selectedOutletId}. First visible item: {itemMap.get(items[0]?.id ?? -1)?.name ?? "-"}
          </Text>
        </Stack>
      </Card>

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
    </Stack>
  );
}
