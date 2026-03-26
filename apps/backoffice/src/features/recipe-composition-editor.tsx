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
  Badge,
  Alert,
  Loader,
  Modal,
  ActionIcon,
  NumberInput,
  Divider,
  Box
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconAlertCircle,
  IconTrash,
  IconPlus,
  IconCalculator
} from "@tabler/icons-react";
import { useState, useEffect, useCallback } from "react";

import { useItems } from "../hooks/use-items";
import { apiRequest } from "../lib/api-client";
import type { SessionUser } from "../lib/session";

interface RecipeIngredient {
  id: number;
  recipe_item_id: number;
  ingredient_item_id: number;
  ingredient_name: string;
  ingredient_sku: string | null;
  ingredient_type: "SERVICE" | "PRODUCT" | "INGREDIENT" | "RECIPE";
  quantity: number;
  unit_of_measure: string;
  unit_cost: number;
  total_cost: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface RecipeCostBreakdown {
  recipe_item_id: number;
  total_ingredient_cost: number;
  ingredient_count: number;
  ingredients: Array<{
    ingredient_item_id: number;
    name: string;
    sku: string | null;
    quantity: number;
    unit_of_measure: string;
    unit_cost: number;
    line_cost: number;
  }>;
}

interface RecipeCompositionEditorProps {
  recipeId: number;
  recipeName: string;
  recipeSku: string | null;
  user: SessionUser;
  accessToken: string;
  onClose: () => void;
}

export function RecipeCompositionEditor({
  recipeId,
  recipeName,
  recipeSku,
  user,
  accessToken,
  onClose
}: RecipeCompositionEditorProps) {
  // Data states
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [costBreakdown, setCostBreakdown] = useState<RecipeCostBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Modal states
  const [addModalOpen, { open: openAddModal, close: closeAddModal }] = useDisclosure(false);

  // Get available ingredients from useItems hook
  const { items: allItems, loading: itemsLoading } = useItems({ user, accessToken });

  // Filter to only INGREDIENT and PRODUCT types for selection
  const availableIngredients = allItems.filter(
    (item) => item.type === "INGREDIENT" || item.type === "PRODUCT"
  );

  // Form state for adding ingredient
  const [formData, setFormData] = useState({
    ingredient_item_id: null as number | null,
    quantity: 1,
    unit_of_measure: "unit"
  });

  // Fetch ingredients and cost on mount
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch ingredients
      const ingredientsRes = await apiRequest(
        `/inventory/recipes/${recipeId}/ingredients`,
        {},
        accessToken
      ) as { data: RecipeIngredient[] };
      setIngredients(ingredientsRes.data || []);

      // Fetch cost breakdown
      const costRes = await apiRequest(
        `/inventory/recipes/${recipeId}/cost`,
        {},
        accessToken
      ) as { data: RecipeCostBreakdown };
      setCostBreakdown(costRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch recipe data");
    } finally {
      setLoading(false);
    }
  }, [recipeId, accessToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddIngredient = async () => {
    if (!formData.ingredient_item_id) {
      setError("Please select an ingredient");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await apiRequest(
        `/inventory/recipes/${recipeId}/ingredients`,
        {
          method: "POST",
          body: JSON.stringify({
            ingredient_item_id: formData.ingredient_item_id,
            quantity: formData.quantity,
            unit_of_measure: formData.unit_of_measure
          })
        },
        accessToken
      );

      closeAddModal();
      setFormData({ ingredient_item_id: null, quantity: 1, unit_of_measure: "unit" });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add ingredient");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveIngredient = async (ingredientId: number) => {
    if (!window.confirm("Are you sure you want to remove this ingredient?")) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await apiRequest(
        `/inventory/recipes/ingredients/${ingredientId}`,
        { method: "DELETE" },
        accessToken
      );
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove ingredient");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateQuantity = async (ingredientId: number, newQuantity: number) => {
    if (newQuantity <= 0) {
      setError("Quantity must be greater than 0");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await apiRequest(
        `/inventory/recipes/ingredients/${ingredientId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ quantity: newQuantity })
        },
        accessToken
      );
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update quantity");
    } finally {
      setSubmitting(false);
    }
  };

  const ingredientSelectOptions = availableIngredients.map((item) => ({
    value: String(item.id),
    label: `${item.name} (${item.sku ?? "No SKU"}) [${item.type}]`,
    disabled: ingredients.some((ing) => ing.ingredient_item_id === item.id)
  }));

  return (
    <>
      <Modal opened onClose={onClose} title="Recipe Composition" size="xl">
        <Stack gap="md">
          {/* Header */}
          <Card withBorder>
            <Group justify="space-between" align="flex-start">
              <Box>
                <Title order={4}>{recipeName}</Title>
                <Text size="sm" c="dimmed">
                  SKU: {recipeSku ?? "N/A"} · ID: {recipeId}
                </Text>
              </Box>
              <Badge size="lg" color="blue">
                RECIPE
              </Badge>
            </Group>
          </Card>

          {/* Error Alert */}
          {error && (
            <Alert color="red" icon={<IconAlertCircle size={16} />} withCloseButton onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* Loading State */}
          {loading ? (
            <Group justify="center" py="xl">
              <Loader size="md" />
              <Text>Loading recipe composition...</Text>
            </Group>
          ) : (
            <>
              {/* Cost Summary */}
              {costBreakdown && (
                <Card withBorder bg="gray.0">
                  <Group justify="space-between" align="center">
                    <Group>
                      <IconCalculator size={20} />
                      <Box>
                        <Text size="sm" fw={500}>Recipe Cost Breakdown</Text>
                        <Text size="xs" c="dimmed">
                          {costBreakdown.ingredient_count} ingredient(s)
                        </Text>
                      </Box>
                    </Group>
                    <Box ta="right">
                      <Text size="lg" fw={700}>
                        ${costBreakdown.total_ingredient_cost.toFixed(2)}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Total Ingredient Cost
                      </Text>
                    </Box>
                  </Group>
                </Card>
              )}

              {/* Add Ingredient Button */}
              <Group justify="space-between">
                <Text size="sm" fw={500}>
                  Ingredients ({ingredients.length})
                </Text>
                <Button
                  leftSection={<IconPlus size={16} />}
                  onClick={openAddModal}
                  disabled={itemsLoading || submitting}
                >
                  Add Ingredient
                </Button>
              </Group>

              {/* Ingredients Table */}
              {ingredients.length === 0 ? (
                <Card withBorder py="xl">
                  <Text c="dimmed" ta="center">
                    No ingredients added yet. Click &quot;Add Ingredient&quot; to build your recipe.
                  </Text>
                </Card>
              ) : (
                <Table highlightOnHover striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Ingredient</Table.Th>
                      <Table.Th>SKU</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Quantity</Table.Th>
                      <Table.Th>Unit</Table.Th>
                      <Table.Th>Unit Cost</Table.Th>
                      <Table.Th>Total Cost</Table.Th>
                      <Table.Th>Actions</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {ingredients.map((ing) => (
                      <Table.Tr key={ing.id}>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            {ing.ingredient_name}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{ing.ingredient_sku ?? "-"}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="sm" variant="light">
                            {ing.ingredient_type}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            value={ing.quantity}
                            onChange={(val) => {
                              if (typeof val === "number") {
                                handleUpdateQuantity(ing.id, val);
                              }
                            }}
                            min={0.001}
                            step={0.1}
                            decimalScale={3}
                            size="xs"
                            style={{ width: 100 }}
                            disabled={submitting}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{ing.unit_of_measure}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">${ing.unit_cost.toFixed(2)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            ${ing.total_cost.toFixed(2)}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            onClick={() => handleRemoveIngredient(ing.id)}
                            disabled={submitting}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </>
          )}

          {/* Footer Actions */}
          <Group justify="flex-end" pt="md">
            <Button variant="default" onClick={onClose}>
              Close
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Add Ingredient Modal */}
      <Modal opened={addModalOpen} onClose={closeAddModal} title="Add Ingredient" size="md">
        <Stack gap="md">
          {error && (
            <Alert color="red" icon={<IconAlertCircle size={16} />}>
              {error}
            </Alert>
          )}

          <Select
            label="Ingredient"
            placeholder="Select an ingredient"
            data={ingredientSelectOptions}
            value={formData.ingredient_item_id ? String(formData.ingredient_item_id) : null}
            onChange={(val) =>
              setFormData((prev) => ({ ...prev, ingredient_item_id: val ? Number(val) : null }))
            }
            searchable
            disabled={itemsLoading}
            required
          />

          <NumberInput
            label="Quantity"
            placeholder="Enter quantity"
            value={formData.quantity}
            onChange={(val) =>
              setFormData((prev) => ({ ...prev, quantity: typeof val === "number" ? val : 1 }))
            }
            min={0.001}
            step={0.1}
            decimalScale={3}
            required
          />

          <TextInput
            label="Unit of Measure"
            placeholder="e.g., kg, liter, piece"
            value={formData.unit_of_measure}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, unit_of_measure: e.target.value }))
            }
            required
          />

          <Alert color="blue" variant="light">
            <Text size="sm">
              <strong>Note:</strong> Only INGREDIENT and PRODUCT type items can be added to recipes.
            </Text>
          </Alert>

          <Divider />

          <Group justify="flex-end">
            <Button variant="default" onClick={closeAddModal} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleAddIngredient}
              loading={submitting}
              disabled={!formData.ingredient_item_id}
            >
              Add Ingredient
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
