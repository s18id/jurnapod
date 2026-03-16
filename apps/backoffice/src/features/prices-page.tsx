// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useMemo, useCallback, useEffect } from "react";
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
  NumberInput,
  Checkbox,
  Menu,
  SegmentedControl,
  Tooltip,
  ThemeIcon,
  ActionIcon,
} from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconTrash,
  IconSearch,
  IconEdit,
  IconPlus,
  IconDownload,
  IconPackage,
  IconDots,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { apiRequest } from "../lib/api-client";
import { useItems, type Item } from "../hooks/use-items";
import { useItemGroups } from "../hooks/use-item-groups";
import type { SessionUser } from "../lib/session";

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

interface PriceFormData {
  item_id: number;
  price: number;
  is_active: boolean;
  is_company_default?: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(value);
}

function calculatePriceDifference(
  defaultPrice: number,
  overridePrice: number
): number {
  return Math.abs(((overridePrice - defaultPrice) / defaultPrice) * 100);
}

export function PricesPage({ user, accessToken }: PricesPageProps) {
  const isMobile = useMediaQuery("(max-width: 48em)");

  // Data hooks
  const {
    items,
    loading: itemsLoading,
    error: itemsError,
    refresh: refreshItems,
    itemMap,
  } = useItems({ user, accessToken });

  const {
    itemGroups,
    loading: groupsLoading,
    error: groupsError,
    groupMap,
  } = useItemGroups({ user, accessToken });

  // Pricing data state
  const [prices, setPrices] = useState<ItemPrice[]>([]);
  const [companyDefaults, setCompanyDefaults] = useState<ItemPrice[]>([]);
  const [pricesLoading, setPricesLoading] = useState(true);
  const [pricesError, setPricesError] = useState<string | null>(null);

  // View and filter states
  const [viewMode, setViewMode] = useState<PricingViewMode>("outlet");
  const [selectedOutletId, setSelectedOutletId] = useState<number>(
    user.outlets[0]?.id ?? 0
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<boolean | null>(null);

  // Modal states
  const [
    createModalOpen,
    { open: openCreateModal, close: closeCreateModal },
  ] = useDisclosure(false);
  const [overrideModalOpen, { open: openOverrideModal, close: closeOverrideModal }] =
    useDisclosure(false);
  const [editModalOpen, { open: openEditModal, close: closeEditModal }] =
    useDisclosure(false);
  const [deleteModalOpen, { open: openDeleteModal, close: closeDeleteModal }] =
    useDisclosure(false);

  // Form states
  const [editingPrice, setEditingPrice] = useState<ItemPrice | null>(null);
  const [deletingPriceId, setDeletingPriceId] = useState<number | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<{
    itemId: number;
    defaultPrice: number;
  } | null>(null);
  const [formData, setFormData] = useState<PriceFormData>({
    item_id: 0,
    price: 0,
    is_active: true,
    is_company_default: false,
  });
  const [overridePrice, setOverridePrice] = useState<string>("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch prices
  const fetchPrices = useCallback(async () => {
    setPricesLoading(true);
    setPricesError(null);

    try {
      // Fetch outlet-specific prices
      const pricesResponse = await apiRequest<{ data: ItemPrice[] }>(
        `/inventory/item-prices?outlet_id=${selectedOutletId}`,
        {},
        accessToken
      );

      // Fetch company defaults
      const defaultsResponse = await apiRequest<{ data: ItemPrice[] }>(
        "/inventory/item-prices?scope=default",
        {},
        accessToken
      );

      setPrices(pricesResponse.data);
      setCompanyDefaults(defaultsResponse.data);
    } catch (err) {
      setPricesError(
        err instanceof Error ? err.message : "Failed to fetch prices"
      );
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

    // For outlet view, merge defaults and overrides
    const merged = new Map<number, PriceWithItem>();

    // Add all company defaults first
    companyDefaults.forEach((defaultPrice) => {
      merged.set(defaultPrice.item_id, {
        ...defaultPrice,
        item: itemMap.get(defaultPrice.item_id),
        hasOverride: false,
        effectivePrice: defaultPrice.price,
        defaultPrice: defaultPrice.price,
      });
    });

    // Override with outlet-specific prices
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
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const nameMatch = price.item?.name.toLowerCase().includes(search) ?? false;
        const skuMatch = price.item?.sku?.toLowerCase().includes(search) ?? false;
        if (!nameMatch && !skuMatch) return false;
      }

      // Scope filter (only in outlet mode)
      if (viewMode === "outlet" && scopeFilter) {
        if (scopeFilter === "override" && !price.hasOverride) return false;
        if (scopeFilter === "default" && price.hasOverride) return false;
      }

      // Status filter
      if (statusFilter !== null && price.is_active !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [pricesWithHierarchy, searchTerm, scopeFilter, statusFilter, viewMode]);

  const hasActiveFilters =
    searchTerm || scopeFilter || statusFilter !== null;

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
    setScopeFilter(null);
    setStatusFilter(null);
  };

  // Form handlers
  const resetForm = () => {
    setFormData({
      item_id: 0,
      price: 0,
      is_active: true,
      is_company_default: viewMode === "defaults",
    });
    setOverridePrice("");
    setFormErrors({});
    setActionError(null);
    setOverrideTarget(null);
  };

  const openCreate = () => {
    resetForm();
    openCreateModal();
  };

  const openEdit = (price: ItemPrice) => {
    setEditingPrice(price);
    setFormData({
      item_id: price.item_id,
      price: price.price,
      is_active: price.is_active,
      is_company_default: price.outlet_id === null,
    });
    setFormErrors({});
    setActionError(null);
    openEditModal();
  };

  const openSetOverride = (itemId: number, defaultPrice: number) => {
    setOverrideTarget({ itemId, defaultPrice });
    setOverridePrice(String(defaultPrice));
    setActionError(null);
    openOverrideModal();
  };

  const openDelete = (priceId: number) => {
    setDeletingPriceId(priceId);
    setActionError(null);
    openDeleteModal();
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (formData.item_id <= 0) {
      errors.item_id = "Item is required";
    }

    if (formData.price <= 0) {
      errors.price = "Price must be greater than 0";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    setActionError(null);

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
      resetForm();
      await fetchPrices();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to create price"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingPrice || !validateForm()) return;

    setSubmitting(true);
    setActionError(null);

    try {
      await apiRequest(
        `/inventory/item-prices/${editingPrice.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            price: formData.price,
            is_active: formData.is_active,
          }),
        },
        accessToken
      );

      closeEditModal();
      setEditingPrice(null);
      resetForm();
      await fetchPrices();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to update price"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateOverride = async () => {
    if (!overrideTarget) return;

    const priceValue = parseFloat(overridePrice);
    if (isNaN(priceValue) || priceValue <= 0) {
      setActionError("Please enter a valid price");
      return;
    }

    setSubmitting(true);
    setActionError(null);

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
      setOverridePrice("");
      await fetchPrices();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to create override"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingPriceId) return;

    setSubmitting(true);
    setActionError(null);

    try {
      await apiRequest(
        `/inventory/item-prices/${deletingPriceId}`,
        {
          method: "DELETE",
        },
        accessToken
      );

      closeDeleteModal();
      setDeletingPriceId(null);
      await fetchPrices();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to delete price"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    console.log("Export prices - not yet implemented");
  };

  // Item options for create modal
  const itemOptions = useMemo(() => {
    return items.map((item) => ({
      value: String(item.id),
      label: `${item.name} (${item.sku ?? "No SKU"})`,
    }));
  }, [items]);

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
            leftSection={<IconPlus size={16} />}
            onClick={openCreate}
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
                onChange={(value) => setSelectedOutletId(Number(value))}
                data={outletOptions}
                style={{ minWidth: 200 }}
              />
            )}
          </Group>

          {/* Hierarchy Explanation */}
          <Alert icon={<IconAlertCircle size={16} />} color="blue" variant="light">
            <Text size="sm">
              <strong>Pricing Hierarchy:</strong> Company Default prices apply to
              all outlets. Outlet-specific overrides take precedence.
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
              {scopeFilter && (
                <Badge variant="light">Scope: {scopeFilter}</Badge>
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
          // Mobile card view
          <Stack gap="xs">
            {filteredPrices.map((price) => {
              const differencePercent =
                price.defaultPrice && price.hasOverride
                  ? calculatePriceDifference(price.defaultPrice, price.price)
                  : 0;
              const isSignificantDifference = differencePercent > 20;

              return (
                <Card key={price.id} withBorder>
                  <Stack gap="xs">
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Text size="sm" fw={600}>
                          {price.item?.name ?? "Unknown Item"}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {price.item?.sku ?? "No SKU"}
                        </Text>
                      </div>
                      <Badge
                        color={price.is_active ? "green" : "red"}
                        variant="light"
                      >
                        {price.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </Group>

                    <Group justify="space-between" align="center">
                      <Text size="xs" c="dimmed">
                        {getGroupName(price.item?.item_group_id ?? null)}
                      </Text>
                      <Badge variant="light">{price.item?.type}</Badge>
                    </Group>

                    {/* Price Display with Hierarchy */}
                    <Group justify="space-between" align="center">
                      {viewMode === "outlet" && price.hasOverride ? (
                        <Stack gap={2}>
                          <Text size="xs" c="dimmed" td="line-through">
                            {formatCurrency(price.defaultPrice ?? 0)}
                          </Text>
                          <Group gap={4}>
                            <Badge color="blue" size="sm">
                              Override
                            </Badge>
                            <Text fw={500}>
                              {formatCurrency(price.price)}
                            </Text>
                            {isSignificantDifference && (
                              <ThemeIcon color="orange" size="sm" variant="light">
                                <IconAlertTriangle size={12} />
                              </ThemeIcon>
                            )}
                          </Group>
                        </Stack>
                      ) : viewMode === "outlet" ? (
                        <Group gap={4}>
                          <Badge color="green" size="sm">
                            Default
                          </Badge>
                          <Text>{formatCurrency(price.price)}</Text>
                        </Group>
                      ) : (
                        <Group gap={4}>
                          <Badge color="green" size="sm">
                            Default
                          </Badge>
                          <Text fw={500}>{formatCurrency(price.price)}</Text>
                        </Group>
                      )}

                      <Menu>
                        <Menu.Target>
                          <ActionIcon variant="subtle">
                            <IconDots size={16} />
                          </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                          <Menu.Item
                            leftSection={<IconEdit size={14} />}
                            onClick={() => openEdit(price)}
                          >
                            Edit
                          </Menu.Item>
                          {viewMode === "outlet" && !price.hasOverride && (
                            <Menu.Item
                              onClick={() =>
                                openSetOverride(price.item_id, price.price)
                              }
                            >
                              Set Override
                            </Menu.Item>
                          )}
                          <Menu.Item
                            leftSection={<IconTrash size={14} />}
                            color="red"
                            onClick={() => openDelete(price.id)}
                          >
                            Delete
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Group>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        ) : (
          // Desktop table view
          <ScrollArea>
            <Table highlightOnHover striped stickyHeader>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Item</Table.Th>
                  <Table.Th>Group</Table.Th>
                  {viewMode === "outlet" && <Table.Th>Scope</Table.Th>}
                  <Table.Th>Price</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredPrices.map((price) => {
                  const differencePercent =
                    price.defaultPrice && price.hasOverride
                      ? calculatePriceDifference(
                          price.defaultPrice,
                          price.price
                        )
                      : 0;
                  const isSignificantDifference = differencePercent > 20;

                  return (
                    <Table.Tr key={price.id}>
                      <Table.Td>{price.id}</Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500}>
                          {price.item?.name ?? "Unknown Item"}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {price.item?.sku ?? "No SKU"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">
                          {getGroupName(price.item?.item_group_id ?? null)}
                        </Text>
                      </Table.Td>
                      {viewMode === "outlet" && (
                        <Table.Td>
                          {price.hasOverride ? (
                            <Badge color="blue" size="sm">
                              Override
                            </Badge>
                          ) : (
                            <Badge color="green" size="sm">
                              Default
                            </Badge>
                          )}
                        </Table.Td>
                      )}
                      <Table.Td>
                        {viewMode === "outlet" && price.hasOverride ? (
                          <Tooltip
                            label={`Default: ${formatCurrency(
                              price.defaultPrice ?? 0
                            )}`}
                          >
                            <Stack gap={2}>
                              <Text size="xs" c="dimmed" td="line-through">
                                {formatCurrency(price.defaultPrice ?? 0)}
                              </Text>
                              <Group gap={4}>
                                <Text fw={500}>
                                  {formatCurrency(price.price)}
                                </Text>
                                {isSignificantDifference && (
                                  <ThemeIcon
                                    color="orange"
                                    size="sm"
                                    variant="light"
                                  >
                                    <IconAlertTriangle size={12} />
                                  </ThemeIcon>
                                )}
                              </Group>
                            </Stack>
                          </Tooltip>
                        ) : (
                          <Text fw={500}>{formatCurrency(price.price)}</Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Badge
                          color={price.is_active ? "green" : "red"}
                          variant="light"
                        >
                          {price.is_active ? "Active" : "Inactive"}
                        </Badge>
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
                              onClick={() => openEdit(price)}
                            >
                              Edit
                            </Menu.Item>
                            {viewMode === "outlet" && !price.hasOverride && (
                              <Menu.Item
                                onClick={() =>
                                  openSetOverride(price.item_id, price.price)
                                }
                              >
                                Set Override
                              </Menu.Item>
                            )}
                            <Menu.Item
                              leftSection={<IconTrash size={14} />}
                              color="red"
                              onClick={() => openDelete(price.id)}
                            >
                              Delete
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Card>

      {/* Create Price Modal */}
      <Modal
        opened={createModalOpen}
        onClose={closeCreateModal}
        title={viewMode === "defaults" ? "Create Default Price" : "Create Price"}
        size="md"
      >
        <Stack gap="md">
          {actionError && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {actionError}
            </Alert>
          )}

          <Select
            label="Item"
            placeholder="Select an item"
            value={formData.item_id ? String(formData.item_id) : ""}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                item_id: value ? Number(value) : 0,
              }))
            }
            data={itemOptions}
            error={formErrors.item_id}
            required
            searchable
          />

          <NumberInput
            label="Price"
            placeholder="Enter price"
            value={formData.price}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                price: Number(value) || 0,
              }))
            }
            min={0}
            decimalScale={2}
            error={formErrors.price}
            required
          />

          <Checkbox
            label="Set as company default (applies to all outlets)"
            checked={formData.is_company_default}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                is_company_default: e.currentTarget.checked,
              }))
            }
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
              Create Price
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Set Override Modal */}
      <Modal
        opened={overrideModalOpen}
        onClose={closeOverrideModal}
        title="Set Outlet Override Price"
        size="md"
      >
        <Stack gap="md">
          {actionError && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {actionError}
            </Alert>
          )}

          {overrideTarget && (
            <>
              <Text size="sm">
                Create an outlet-specific price override for this item.
              </Text>
              <Text size="sm" c="dimmed">
                Default price: {formatCurrency(overrideTarget.defaultPrice)}
              </Text>

              <NumberInput
                label="Override Price"
                placeholder="Enter override price"
                value={overridePrice}
                onChange={(value) => setOverridePrice(String(value))}
                min={0}
                decimalScale={2}
                required
              />

              <Group justify="flex-end" mt="md">
                <Button variant="default" onClick={closeOverrideModal}>
                  Cancel
                </Button>
                <Button onClick={handleCreateOverride} loading={submitting}>
                  Create Override
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      {/* Edit Price Modal */}
      <Modal
        opened={editModalOpen}
        onClose={closeEditModal}
        title="Edit Price"
        size="md"
      >
        <Stack gap="md">
          {actionError && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {actionError}
            </Alert>
          )}

          <Text size="sm" fw={500}>
            {editingPrice?.item_id
              ? itemMap.get(editingPrice.item_id)?.name ?? "Unknown Item"
              : "Unknown Item"}
          </Text>

          <NumberInput
            label="Price"
            placeholder="Enter price"
            value={formData.price}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                price: Number(value) || 0,
              }))
            }
            min={0}
            decimalScale={2}
            error={formErrors.price}
            required
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

          <Text>Are you sure you want to delete this price?</Text>
          <Text size="sm" c="dimmed">
            {viewMode === "defaults"
              ? "This will remove the company default price."
              : "This will remove the outlet-specific price override."}
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
    </Stack>
  );
}
