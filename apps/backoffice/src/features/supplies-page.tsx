// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Divider,
  FileInput,
  Group,
  Loader,
  Modal,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  ActionIcon,
  Tooltip
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconUpload,
  IconPlus,
  IconTrash,
  IconSearch,
  IconArrowRight
} from "@tabler/icons-react";
import type { SessionUser } from "../lib/session";
import { apiRequest, ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import { OfflinePage } from "../components/offline-page";
import {
  parseDelimited,
  normalizeImportRow,
  buildImportPlan,
  computeImportSummary,
  type ImportPlanRow,
  type ImportSummary,
  type ApplyResult
} from "./supplies-import-utils";

type Supply = {
  id: number;
  company_id: number;
  sku: string | null;
  name: string;
  unit: string;
  is_active: boolean;
  updated_at: string;
};

type SuppliesPageProps = {
  user: SessionUser;
  accessToken: string;
};

type ImportStep = "source" | "preview" | "apply";

export function SuppliesPage(props: SuppliesPageProps) {
  const isOnline = useOnlineStatus();
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [importOpened, importHandlers] = useDisclosure(false);
  const [importStep, setImportStep] = useState<ImportStep>("source");
  const [importText, setImportText] = useState("");
  const [importPlan, setImportPlan] = useState<ImportPlanRow[]>([]);
  const [importSummary, setImportSummary] = useState<ImportSummary>({
    create: 0,
    update: 0,
    skip: 0,
    error: 0,
    total: 0
  });

  const [isApplying, setIsApplying] = useState(false);
  const [applyIndex, setApplyIndex] = useState(0);
  const [applyResults, setApplyResults] = useState<ApplyResult[]>([]);
  const [hasAppliedImport, setHasAppliedImport] = useState(false);

  const [addOpened, addHandlers] = useDisclosure(false);
  const [newSupplyForm, setNewSupplyForm] = useState({
    sku: "",
    name: "",
    unit: "unit",
    is_active: true
  });
  const [creatingSupply, setCreatingSupply] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Supply | null>(null);
  const [deletingSupplyId, setDeletingSupplyId] = useState<number | null>(null);

  async function refreshSupplies() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<{ success: true; data: Supply[] }>(
        "/inventory/supplies",
        {},
        props.accessToken
      );
      setSupplies(response.data);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load supplies");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOnline) {
      refreshSupplies().catch(() => undefined);
    }
  }, [isOnline]);

  const filteredSupplies = useMemo(() => {
    let result = supplies;
    if (!showInactive) {
      result = result.filter((s) => s.is_active);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.sku?.toLowerCase().includes(q)) ||
          s.unit.toLowerCase().includes(q)
      );
    }
    return result;
  }, [supplies, showInactive, searchQuery]);

  const stats = useMemo(
    () => ({
      total: supplies.length,
      active: supplies.filter((s) => s.is_active).length,
      inactive: supplies.filter((s) => !s.is_active).length,
      visible: filteredSupplies.length
    }),
    [supplies, filteredSupplies]
  );

  const actionablePlanCount = useMemo(
    () => importPlan.filter((p) => p.action === "CREATE" || p.action === "UPDATE").length,
    [importPlan]
  );

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Master Data"
        message="Supply changes require a connection."
      />
    );
  }

  async function handleCreateSupply() {
    if (!newSupplyForm.name.trim()) {
      setError("Supply name is required");
      return;
    }

    setCreatingSupply(true);
    try {
      setError(null);
      await apiRequest("/inventory/supplies", {
        method: "POST",
        body: JSON.stringify({
          sku: newSupplyForm.sku.trim() || null,
          name: newSupplyForm.name.trim(),
          unit: newSupplyForm.unit.trim() || "unit",
          is_active: newSupplyForm.is_active
        })
      }, props.accessToken);
      addHandlers.close();
      setNewSupplyForm({ sku: "", name: "", unit: "unit", is_active: true });
      setSuccessMessage("Supply created successfully");
      await refreshSupplies();
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      } else {
        setError("Failed to create supply");
      }
    } finally {
      setCreatingSupply(false);
    }
  }

  async function handleDeleteSupply() {
    if (!deleteTarget) return;

    setDeletingSupplyId(deleteTarget.id);
    try {
      await apiRequest(`/inventory/supplies/${deleteTarget.id}`, { method: "DELETE" }, props.accessToken);
      setDeleteTarget(null);
      setSuccessMessage("Supply deleted successfully");
      await refreshSupplies();
    } catch (deleteError) {
      if (deleteError instanceof ApiError) {
        setError(deleteError.message);
      } else {
        setError("Failed to delete supply");
      }
    } finally {
      setDeletingSupplyId(null);
    }
  }

  function handleFileSelect(file: File | null) {
    if (file) {
      file.text().then((text) => {
        setImportText(text);
      });
    }
  }

  function processImportText() {
    const parsed = parseDelimited(importText);
    if (parsed.length < 2) {
      setError("Import file must have a header row and at least one data row");
      return;
    }

    const header = parsed[0];
    const body = parsed.slice(1);
    const rows = body.map((cells) => normalizeImportRow(cells, header));

    setHasAppliedImport(false);

    const plan = buildImportPlan(rows, supplies);
    setImportPlan(plan);

    const summary = computeImportSummary(plan);
    setImportSummary(summary);

    setImportStep("preview");
  }

  async function runImport() {
    setIsApplying(true);
    const results: ApplyResult[] = [];

    const actionable = importPlan.filter(
      (p) => p.action === "CREATE" || p.action === "UPDATE"
    );

    for (let i = 0; i < actionable.length; i++) {
      const plan = actionable[i];
      setApplyIndex(i + 1);

      try {
        if (plan.action === "CREATE") {
          const res = await apiRequest<{ success: true; data: number }>(
            "/inventory/supplies",
            {
              method: "POST",
              body: JSON.stringify({
                sku: plan.original.sku,
                name: plan.original.name,
                unit: plan.original.unit,
                is_active: plan.original.is_active
              })
            },
            props.accessToken
          );
          results.push({
            rowIndex: plan.rowIndex,
            action: "CREATE",
            success: true,
            supplyId: res.data
          });
        } else if (plan.action === "UPDATE" && plan.existingSupplyId) {
          await apiRequest(`/inventory/supplies/${plan.existingSupplyId}`, {
            method: "PATCH",
            body: JSON.stringify({
              sku: plan.original.sku,
              name: plan.original.name,
              unit: plan.original.unit,
              is_active: plan.original.is_active
            })
          }, props.accessToken);
          results.push({
            rowIndex: plan.rowIndex,
            action: "UPDATE",
            success: true
          });
        }
      } catch (err) {
        results.push({
          rowIndex: plan.rowIndex,
          action: plan.action,
          success: false,
          error: err instanceof ApiError ? err.message : "Unknown error"
        });
      }

      setApplyResults([...results]);
    }

    setIsApplying(false);
    setHasAppliedImport(true);
    await refreshSupplies();
  }

  function resetImportState() {
    setImportStep("source");
    setImportText("");
    setImportPlan([]);
    setImportSummary({ create: 0, update: 0, skip: 0, error: 0, total: 0 });
    setApplyIndex(0);
    setApplyResults([]);
    setHasAppliedImport(false);
  }

  const hasFiltersActive = searchQuery.trim() !== "" || showInactive;

  return (
    <Container size="lg" py="xl">
      <Stack gap="md">
        <Card>
          <Stack gap="sm">
            <Group justify="space-between" wrap="wrap">
              <div>
                <Title order={2}>Supplies</Title>
                <Text c="dimmed" size="sm">
                  Track consumables for daily operations. Use import for bulk updates.
                </Text>
              </div>
              <Group gap="sm">
                <Button leftSection={<IconUpload size={16} />} onClick={() => importHandlers.open()}>
                  Import supplies
                </Button>
                <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => addHandlers.open()}>
                  Add one supply
                </Button>
              </Group>
            </Group>

            <Group gap="lg">
              <Badge size="lg" variant="light">
                Total: {stats.total}
              </Badge>
              <Badge size="lg" color="green" variant="light">
                Active: {stats.active}
              </Badge>
              <Badge size="lg" color="gray" variant="light">
                Inactive: {stats.inactive}
              </Badge>
              <Badge size="lg" color="blue" variant="light">
                Visible: {stats.visible}
              </Badge>
            </Group>

            {loading && (
              <Group gap="xs">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">
                  Loading supplies...
                </Text>
              </Group>
            )}

            {error && (
              <Alert color="red" withCloseButton onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {successMessage && (
              <Alert color="green" withCloseButton onClose={() => setSuccessMessage(null)}>
                {successMessage}
              </Alert>
            )}
          </Stack>
        </Card>

        <Card>
          <Group justify="space-between" wrap="wrap">
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                placeholder="Search by name, SKU, or unit..."
                leftSection={<IconSearch size={16} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
              />
              <Switch
                label="Show inactive"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.currentTarget.checked)}
              />
            </SimpleGrid>
            {hasFiltersActive && (
              <Button
                variant="subtle"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setShowInactive(false);
                }}
              >
                Reset filters
              </Button>
            )}
          </Group>
        </Card>

        <Card>
          <ScrollArea type="auto" scrollbarSize={8}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>SKU</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Unit</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Updated</Table.Th>
                  <Table.Th>Actions</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredSupplies.length === 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={7}>
                      <Text c="dimmed" ta="center" py="xl">
                        {supplies.length === 0
                          ? "No supplies yet. Import or add one to get started."
                          : "No supplies match your filters."}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : (
                  filteredSupplies.map((supply) => (
                    <Table.Tr key={supply.id}>
                      <Table.Td>{supply.id}</Table.Td>
                      <Table.Td>{supply.sku || "-"}</Table.Td>
                      <Table.Td>{supply.name}</Table.Td>
                      <Table.Td>{supply.unit}</Table.Td>
                      <Table.Td>
                        <Badge color={supply.is_active ? "green" : "gray"} size="sm">
                          {supply.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {new Date(supply.updated_at).toLocaleDateString()}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Tooltip label="Delete">
                          <ActionIcon
                            color="red"
                            variant="subtle"
                            onClick={() => setDeleteTarget(supply)}
                          >
                            <IconTrash size={16} />
                          </ActionIcon>
                        </Tooltip>
                      </Table.Td>
                    </Table.Tr>
                  ))
                )}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Card>

        <Modal
          opened={importOpened}
          onClose={() => {
            importHandlers.close();
            resetImportState();
          }}
          title="Import Supplies"
          size="lg"
        >
          <Stack>
            <Group gap="xs">
              <Badge color={importStep === "source" ? "blue" : "green"}>1. Source</Badge>
              <IconArrowRight size={14} />
              <Badge color={importStep === "preview" ? "blue" : importStep === "apply" ? "green" : "gray"}>
                2. Preview
              </Badge>
              <IconArrowRight size={14} />
              <Badge color={importStep === "apply" ? "blue" : "gray"}>3. Apply</Badge>
            </Group>

            <Divider />

            {importStep === "source" && (
              <Stack>
                <Textarea
                  label="Paste data"
                  placeholder="sku,name,unit,is_active&#10;PAPER-A4,A4 Paper,pack,true&#10;PAPER-A5,A5 Paper,pack,true"
                  minRows={5}
                  value={importText}
                  onChange={(e) => setImportText(e.currentTarget.value)}
                />
                <FileInput
                  label="Or upload file"
                  placeholder="Choose CSV or TXT file"
                  accept=".csv,.txt"
                  onChange={handleFileSelect}
                />
                <Text size="xs" c="dimmed">
                  Template: sku,name,unit,is_active
                </Text>
                <Button onClick={processImportText} disabled={!importText.trim()}>
                  Continue to preview
                </Button>
              </Stack>
            )}

            {importStep === "preview" && (
              <Stack>
                <Group justify="space-between">
                  <Text fw={500}>Import plan</Text>
                  <Group gap="xs">
                    <Badge color="green">Create: {importSummary.create}</Badge>
                    <Badge color="blue">Update: {importSummary.update}</Badge>
                    <Badge color="gray">Skip: {importSummary.skip}</Badge>
                    <Badge color="red">Error: {importSummary.error}</Badge>
                  </Group>
                </Group>

                <ScrollArea type="auto" mah={400}>
                  <Table striped>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>#</Table.Th>
                        <Table.Th>SKU</Table.Th>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Unit</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Action</Table.Th>
                        <Table.Th>Reason</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {importPlan.map((row) => (
                        <Table.Tr key={row.rowIndex}>
                          <Table.Td>{row.rowIndex + 1}</Table.Td>
                          <Table.Td>{row.original.sku || "-"}</Table.Td>
                          <Table.Td>{row.original.name}</Table.Td>
                          <Table.Td>{row.original.unit}</Table.Td>
                          <Table.Td>{row.original.is_active ? "Active" : "Inactive"}</Table.Td>
                          <Table.Td>
                            <Badge
                              color={
                                row.action === "CREATE"
                                  ? "green"
                                  : row.action === "UPDATE"
                                  ? "blue"
                                  : row.action === "SKIP"
                                  ? "gray"
                                  : "red"
                              }
                              size="sm"
                            >
                              {row.action}
                            </Badge>
                          </Table.Td>
                          <Table.Td>{row.reason || row.error || "-"}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>

                <Group justify="space-between">
                  <Button variant="default" onClick={() => setImportStep("source")}>
                    Back
                  </Button>
                  <Button
                    onClick={() => {
                      setApplyIndex(0);
                      setApplyResults([]);
                      setImportStep("apply");
                    }}
                    disabled={actionablePlanCount === 0}
                  >
                    Apply import ({actionablePlanCount} changes)
                  </Button>
                </Group>
              </Stack>
            )}

            {importStep === "apply" && (
              <Stack>
                <Text fw={500}>Applying changes...</Text>

                <Progress value={actionablePlanCount > 0 ? (applyIndex / actionablePlanCount) * 100 : 0} animated={isApplying} />

                <Text size="sm" c="dimmed">
                  {applyIndex} / {actionablePlanCount} processed
                </Text>

                {applyResults.length > 0 && (
                  <ScrollArea type="auto" mah={300}>
                    <Table striped>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>#</Table.Th>
                          <Table.Th>Action</Table.Th>
                          <Table.Th>Result</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {applyResults.slice(-10).map((result, idx) => (
                          <Table.Tr key={idx}>
                            <Table.Td>{result.rowIndex + 1}</Table.Td>
                            <Table.Td>{result.action}</Table.Td>
                            <Table.Td>
                              {result.success ? (
                                <Badge color="green" size="sm">
                                  Success
                                </Badge>
                              ) : (
                                <Badge color="red" size="sm">
                                  {result.error}
                                </Badge>
                              )}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                )}

                {!isApplying && applyResults.length === actionablePlanCount && (
                  <Alert
                    color={applyResults.some((r) => !r.success) ? "yellow" : "green"}
                    title="Import complete"
                  >
                    Created: {applyResults.filter((r) => r.action === "CREATE" && r.success).length} | Updated:{" "}
                    {applyResults.filter((r) => r.action === "UPDATE" && r.success).length} | Failed:{" "}
                    {applyResults.filter((r) => !r.success).length}
                  </Alert>
                )}

                <Group justify="space-between">
                  <Button
                    variant="default"
                    onClick={() => {
                      resetImportState();
                    }}
                  >
                    Start over
                  </Button>
                  <Button
                    onClick={runImport}
                    loading={isApplying}
                    disabled={isApplying || actionablePlanCount === 0 || hasAppliedImport}
                  >
                    {isApplying ? "Applying..." : hasAppliedImport ? "Import already applied" : "Start import"}
                  </Button>
                </Group>
              </Stack>
            )}
          </Stack>
        </Modal>

        <Modal
          opened={addOpened}
          onClose={() => {
            addHandlers.close();
            setNewSupplyForm({ sku: "", name: "", unit: "unit", is_active: true });
            setError(null);
          }}
          title="Add Supply"
          centered
        >
          <Stack>
            <TextInput
              label="SKU"
              placeholder="Optional SKU code"
              value={newSupplyForm.sku}
              onChange={(e) => setNewSupplyForm((p) => ({ ...p, sku: e.currentTarget.value }))}
            />
            <TextInput
              label="Name"
              placeholder="Supply name"
              required
              value={newSupplyForm.name}
              onChange={(e) => setNewSupplyForm((p) => ({ ...p, name: e.currentTarget.value }))}
            />
            <TextInput
              label="Unit"
              placeholder="e.g., pack, box, unit"
              value={newSupplyForm.unit}
              onChange={(e) => setNewSupplyForm((p) => ({ ...p, unit: e.currentTarget.value }))}
            />
            <Switch
              label="Active"
              checked={newSupplyForm.is_active}
              onChange={(e) => setNewSupplyForm((p) => ({ ...p, is_active: e.currentTarget.checked }))}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => addHandlers.close()}>
                Cancel
              </Button>
              <Button onClick={handleCreateSupply} loading={creatingSupply}>
                Create
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Modal
          opened={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          title="Delete Supply"
          centered
        >
          <Stack>
            <Text>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
              {deleteTarget?.sku && <span> (SKU: {deleteTarget.sku})</span>}?
            </Text>
            <Text size="sm" c="dimmed">
              This action cannot be undone. The supply will be permanently removed.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button color="red" onClick={handleDeleteSupply} loading={deletingSupplyId !== null}>
                Delete
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}
