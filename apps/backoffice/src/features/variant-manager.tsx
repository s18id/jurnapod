// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useMemo } from "react";
import {
  Stack,
  Card,
  Title,
  Text,
  Group,
  Button,
  TextInput,
  Table,
  ScrollArea,
  Badge,
  NumberInput,
  Switch,
  Divider,
  ActionIcon,
  Tooltip,
  Modal,
  Loader,
  Alert,
  Flex,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconTrash,
  IconEdit,
  IconPlus,
  IconPackage,
  IconTag,
  IconCheck,
  IconX,
  IconCoins,
  IconBuildingStore,
} from "@tabler/icons-react";
import type { SessionUser } from "../lib/session";
import { useVariants, type VariantAttribute, type ItemVariant } from "../hooks/use-variants";

interface VariantManagerProps {
  user: SessionUser;
  accessToken: string;
  itemId: number;
  itemName: string;
  itemSku: string | null;
  onClose: () => void;
}

type AttributeFormData = {
  attribute_name: string;
  values: string;
};

export function VariantManager({ user, accessToken, itemId, itemName, itemSku, onClose }: VariantManagerProps) {
  const {
    attributes,
    variants,
    loading,
    error,
    createAttribute,
    updateAttribute,
    deleteAttribute,
    updateVariant,
    adjustStock,
  } = useVariants({ user, accessToken, itemId });

  const [attributeForm, setAttributeForm] = useState<AttributeFormData>({
    attribute_name: "",
    values: "",
  });
  const [editingAttribute, setEditingAttribute] = useState<VariantAttribute | null>(null);
  const [editingVariant, setEditingVariant] = useState<ItemVariant | null>(null);
  const [stockAdjustment, setStockAdjustment] = useState<{ variantId: number; amount: number; reason: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleCreateAttribute = async () => {
    if (!attributeForm.attribute_name.trim() || !attributeForm.values.trim()) {
      setFormError("Attribute name and values are required");
      return;
    }

    const values = attributeForm.values.split(",").map((v) => v.trim()).filter(Boolean);
    if (values.length === 0) {
      setFormError("At least one value is required");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      await createAttribute({
        attribute_name: attributeForm.attribute_name.trim(),
        values,
      });
      setAttributeForm({ attribute_name: "", values: "" });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create attribute");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateAttribute = async () => {
    if (!editingAttribute) return;

    const values = attributeForm.values.split(",").map((v) => v.trim()).filter(Boolean);

    setSaving(true);
    try {
      await updateAttribute(editingAttribute.id, {
        attribute_name: attributeForm.attribute_name.trim() || undefined,
        values: values.length > 0 ? values : undefined,
      });
      setEditingAttribute(null);
      setAttributeForm({ attribute_name: "", values: "" });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update attribute");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAttribute = async (attributeId: number) => {
    if (!confirm("Are you sure? This will archive all variants using this attribute.")) return;

    try {
      await deleteAttribute(attributeId);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to delete attribute");
    }
  };

  const startEditingAttribute = (attr: VariantAttribute) => {
    setEditingAttribute(attr);
    setAttributeForm({
      attribute_name: attr.attribute_name,
      values: attr.values.map((v) => v.value).join(", "),
    });
  };

  const handleUpdateVariant = async () => {
    if (!editingVariant) return;

    setSaving(true);
    try {
      await updateVariant(editingVariant.id, {
        sku: editingVariant.sku,
        price_override: editingVariant.price_override,
        barcode: editingVariant.barcode,
        is_active: editingVariant.is_active,
      });
      setEditingVariant(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update variant");
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustStock = async () => {
    if (!stockAdjustment) return;

    setSaving(true);
    try {
      await adjustStock(stockAdjustment.variantId, stockAdjustment.amount, stockAdjustment.reason);
      setStockAdjustment(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to adjust stock");
    } finally {
      setSaving(false);
    }
  };

  const totalStock = useMemo(() => variants.reduce((sum, v) => sum + v.stock_quantity, 0), [variants]);
  const activeVariants = useMemo(() => variants.filter((v) => v.is_active).length, [variants]);

  if (loading) {
    return (
      <Flex justify="center" align="center" h={400}>
        <Loader size="lg" />
      </Flex>
    );
  }

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between">
        <div>
          <Title order={3}>Variant Manager</Title>
          <Text c="dimmed" size="sm">
            {itemName} {itemSku && `(SKU: ${itemSku})`}
          </Text>
        </div>
        <Button variant="light" onClick={onClose}>
          Close
        </Button>
      </Group>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red">
          {error}
        </Alert>
      )}

      {formError && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" onClose={() => setFormError(null)} withCloseButton>
          {formError}
        </Alert>
      )}

      {/* Stats */}
      <Group>
        <Card withBorder p="sm">
          <Group>
            <IconPackage size={20} />
            <div>
              <Text size="xs" c="dimmed">Total Variants</Text>
              <Text fw={600}>{variants.length}</Text>
            </div>
          </Group>
        </Card>
        <Card withBorder p="sm">
          <Group>
            <IconCheck size={20} />
            <div>
              <Text size="xs" c="dimmed">Active</Text>
              <Text fw={600}>{activeVariants}</Text>
            </div>
          </Group>
        </Card>
        <Card withBorder p="sm">
          <Group>
            <IconBuildingStore size={20} />
            <div>
              <Text size="xs" c="dimmed">Total Stock</Text>
              <Text fw={600}>{totalStock}</Text>
            </div>
          </Group>
        </Card>
      </Group>

      <Divider />

      {/* Attributes Section */}
      <Card withBorder>
        <Title order={4} mb="md">Variant Attributes</Title>
        
        {attributes.length === 0 ? (
          <Text c="dimmed" mb="md">No attributes defined yet. Add attributes to generate variants.</Text>
        ) : (
          <Table mb="md">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Attribute</Table.Th>
                <Table.Th>Values</Table.Th>
                <Table.Th style={{ width: 100 }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {attributes.map((attr) => (
                <Table.Tr key={attr.id}>
                  <Table.Td>{attr.attribute_name}</Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      {attr.values.map((v) => (
                        <Badge key={v.id} size="sm" variant="light">
                          {v.value}
                        </Badge>
                      ))}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Tooltip label="Edit">
                        <ActionIcon variant="light" onClick={() => startEditingAttribute(attr)}>
                          <IconEdit size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete">
                        <ActionIcon variant="light" color="red" onClick={() => handleDeleteAttribute(attr.id)}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        {/* Add/Edit Attribute Form */}
        <Card withBorder bg="gray.0">
          <Title order={5} mb="sm">
            {editingAttribute ? "Edit Attribute" : "Add Attribute"}
          </Title>
          <Stack gap="sm">
            <TextInput
              label="Attribute Name"
              placeholder="e.g., Size, Color"
              value={attributeForm.attribute_name}
              onChange={(e) => setAttributeForm({ ...attributeForm, attribute_name: e.target.value })}
            />
            <TextInput
              label="Values"
              placeholder="e.g., Small, Medium, Large (comma-separated)"
              value={attributeForm.values}
              onChange={(e) => setAttributeForm({ ...attributeForm, values: e.target.value })}
            />
            <Group>
              {editingAttribute ? (
                <>
                  <Button onClick={handleUpdateAttribute} loading={saving}>
                    Update Attribute
                  </Button>
                  <Button variant="light" onClick={() => {
                    setEditingAttribute(null);
                    setAttributeForm({ attribute_name: "", values: "" });
                  }}>
                    Cancel
                  </Button>
                </>
              ) : (
                <Button onClick={handleCreateAttribute} loading={saving} leftSection={<IconPlus size={16} />}>
                  Add Attribute
                </Button>
              )}
            </Group>
          </Stack>
        </Card>
      </Card>

      {/* Variants Section */}
      {variants.length > 0 && (
        <Card withBorder>
          <Title order={4} mb="md">Variants</Title>
          <ScrollArea>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>SKU</Table.Th>
                  <Table.Th>Variant</Table.Th>
                  <Table.Th>Price</Table.Th>
                  <Table.Th>Stock</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th style={{ width: 120 }}>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {variants.map((variant) => (
                  <Table.Tr key={variant.id}>
                    <Table.Td>
                      <Group gap="xs">
                        <IconTag size={14} />
                        <Text size="sm" fw={500}>{variant.sku}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td>{variant.variant_name}</Table.Td>
                    <Table.Td>
                      {variant.price_override !== null ? (
                        <Group gap="xs">
                          <Text fw={600}>${variant.effective_price.toFixed(2)}</Text>
                          <Badge size="xs" color="blue">override</Badge>
                        </Group>
                      ) : (
                        <Text>${variant.effective_price.toFixed(2)}</Text>
                      )}
                    </Table.Td>
                    <Table.Td>{variant.stock_quantity}</Table.Td>
                    <Table.Td>
                      {variant.is_active ? (
                        <Badge color="green" size="sm">Active</Badge>
                      ) : (
                        <Badge color="gray" size="sm">Inactive</Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Tooltip label="Edit">
                          <ActionIcon variant="light" onClick={() => setEditingVariant(variant)}>
                            <IconEdit size={16} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Adjust Stock">
                          <ActionIcon variant="light" onClick={() => setStockAdjustment({ variantId: variant.id, amount: 0, reason: "" })}>
                            <IconPackage size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>
      )}

      {/* Edit Variant Modal */}
      <Modal opened={!!editingVariant} onClose={() => setEditingVariant(null)} title="Edit Variant" size="md">
        {editingVariant && (
          <Stack>
            <TextInput
              label="SKU"
              value={editingVariant.sku}
              onChange={(e) => setEditingVariant({ ...editingVariant, sku: e.target.value })}
            />
            <Group align="flex-end">
              <NumberInput
                label="Price Override"
                placeholder="Leave empty to inherit from parent"
                value={editingVariant.price_override ?? undefined}
                onChange={(val) => setEditingVariant({ ...editingVariant, price_override: val === "" ? null : Number(val) })}
                prefix="$"
                decimalScale={2}
                style={{ flex: 1 }}
              />
              {editingVariant.price_override !== null && (
                <Button variant="light" size="sm" onClick={() => setEditingVariant({ ...editingVariant, price_override: null })}>
                  Reset to Parent
                </Button>
              )}
            </Group>
            <TextInput
              label="Barcode"
              value={editingVariant.barcode || ""}
              onChange={(e) => setEditingVariant({ ...editingVariant, barcode: e.target.value || null })}
              placeholder="Optional"
            />
            <Switch
              label="Active"
              checked={editingVariant.is_active}
              onChange={(e) => setEditingVariant({ ...editingVariant, is_active: e.currentTarget.checked })}
            />
            <Group justify="flex-end">
              <Button variant="light" onClick={() => setEditingVariant(null)}>Cancel</Button>
              <Button onClick={handleUpdateVariant} loading={saving}>Save Changes</Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* Stock Adjustment Modal */}
      <Modal opened={!!stockAdjustment} onClose={() => setStockAdjustment(null)} title="Adjust Stock" size="sm">
        {stockAdjustment && (
          <Stack>
            <NumberInput
              label="Adjustment Amount"
              description="Positive to add, negative to remove"
              value={stockAdjustment.amount}
              onChange={(val) => setStockAdjustment({ ...stockAdjustment, amount: Number(val) })}
            />
            <TextInput
              label="Reason"
              placeholder="e.g., Initial stock, Damaged goods"
              value={stockAdjustment.reason}
              onChange={(e) => setStockAdjustment({ ...stockAdjustment, reason: e.target.value })}
            />
            <Group justify="flex-end">
              <Button variant="light" onClick={() => setStockAdjustment(null)}>Cancel</Button>
              <Button onClick={handleAdjustStock} loading={saving}>Apply Adjustment</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}