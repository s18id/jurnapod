// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { AccountTypeResponse } from "@jurnapod/shared";
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState, useMemo } from "react";

import { OfflinePage } from "../components/offline-page";
import { StaleDataWarning } from "../components/stale-data-warning";
import { useAccountTypes ,
  createAccountType,
  updateAccountType,
  deactivateAccountType
} from "../hooks/use-accounts";
import { ApiError } from "../lib/api-client";
import { buildCacheKey } from "../lib/cache-service";
import { useOnlineStatus } from "../lib/connection";
import type { SessionUser } from "../lib/session";


type AccountTypesPageProps = {
  user: SessionUser;
};

type FormMode = "create" | "edit" | null;

type AccountTypeFormData = {
  name: string;
  category: string;
  normal_balance: string;
  report_group: string;
};

const emptyForm: AccountTypeFormData = {
  name: "",
  category: "ASSET",
  normal_balance: "D",
  report_group: "NRC"
};

const CATEGORY_OPTIONS = [
  { value: "ASSET", label: "Asset" },
  { value: "LIABILITY", label: "Liability" },
  { value: "EQUITY", label: "Equity" },
  { value: "REVENUE", label: "Revenue" },
  { value: "EXPENSE", label: "Expense" }
];

const NORMAL_BALANCE_OPTIONS = [
  { value: "D", label: "DEBIT" },
  { value: "K", label: "KREDIT" }
];

const REPORT_GROUP_OPTIONS = [
  { value: "NRC", label: "Neraca (Balance Sheet)" },
  { value: "PL", label: "Laba Rugi (P&L)" }
];

export function AccountTypesPage({ user }: AccountTypesPageProps) {
  const isOnline = useOnlineStatus();
  const companyId = user.company_id;

  const [formMode, setFormMode] = useState<FormMode>(null);
  const [formData, setFormData] = useState<AccountTypeFormData>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);
  const [confirmOpened, { open: openConfirm, close: closeConfirm }] = useDisclosure(false);
  const [deactivateTarget, setDeactivateTarget] = useState<AccountTypeResponse | null>(null);

  const typeFilters = useMemo(() => ({
    is_active: showInactive ? undefined : true,
    search: searchQuery || undefined
  }), [showInactive, searchQuery]);

  const { data: accountTypes, loading, error, refetch } = useAccountTypes(
    companyId,
    
    typeFilters
  );

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Master Data"
        message="Account type changes require a connection."
      />
    );
  }

  const groupedByCategory = accountTypes.reduce((acc, type) => {
    const category = type.category || "OTHER";
    if (!acc[category]) acc[category] = [];
    acc[category].push(type);
    return acc;
  }, {} as Record<string, AccountTypeResponse[]>);

  const hasFiltersActive = searchQuery.trim() !== "" || showInactive;

  function resetFilters() {
    setSearchQuery("");
    setShowInactive(false);
  }

  function openCreateForm() {
    setFormMode("create");
    setFormData(emptyForm);
    setEditingId(null);
    setFormError(null);
    openForm();
  }

  function openEditForm(accountType: AccountTypeResponse) {
    setFormMode("edit");
    setFormData({
      name: accountType.name,
      category: accountType.category || "ASSET",
      normal_balance: accountType.normal_balance || "D",
      report_group: accountType.report_group || "NRC"
    });
    setEditingId(accountType.id);
    setFormError(null);
    openForm();
  }

  function closeFormHandler() {
    setFormMode(null);
    setFormData(emptyForm);
    setEditingId(null);
    setFormError(null);
    closeForm();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setUiError(null);
    setSuccessMessage(null);

    try {
      if (formMode === "create") {
        await createAccountType(
          {
            company_id: companyId,
            name: formData.name,
            category: formData.category,
            normal_balance: formData.normal_balance,
            report_group: formData.report_group
          }
        );
        setSuccessMessage("Account type created successfully");
      } else if (formMode === "edit" && editingId) {
        await updateAccountType(
          editingId,
          {
            name: formData.name,
            category: formData.category,
            normal_balance: formData.normal_balance,
            report_group: formData.report_group
          }
        );
        setSuccessMessage("Account type updated successfully");
      }
      closeFormHandler();
      refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("An unexpected error occurred");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function confirmDeactivate(accountType: AccountTypeResponse) {
    setDeactivateTarget(accountType);
    openConfirm();
  }

  async function handleDeactivate() {
    if (!deactivateTarget) return;

    setUiError(null);
    setSuccessMessage(null);

    try {
      await deactivateAccountType(deactivateTarget.id);
      setSuccessMessage("Account type deactivated successfully");
      refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        setUiError(err.message);
      } else {
        setUiError("An unexpected error occurred");
      }
    } finally {
      setDeactivateTarget(null);
      closeConfirm();
    }
  }

  const activeCount = accountTypes.filter((t) => t.is_active).length;
  const categoryCount = Object.keys(groupedByCategory).length;

  return (
    <Container size="lg" py="md">
      <Stack gap="md">
        {/* Header + Status Card */}
        <Card>
          <Stack gap="sm">
            <Group justify="space-between" wrap="wrap">
              <div>
                <Title order={2}>Account Type Templates</Title>
                <Text c="dimmed" size="sm">
                  Optional templates for account classification. Accounts can inherit classification directly from parent accounts.
                </Text>
              </div>
              <Button onClick={openCreateForm}>
                Create Account Type
              </Button>
            </Group>

            <StaleDataWarning
              cacheKey={buildCacheKey("account_types", { companyId })}
              label="account types"
            />

            {loading && (
              <Group gap="xs">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">Loading account types...</Text>
              </Group>
            )}

            {error && (
              <Alert color="red" title="Error loading account types">
                {error}
              </Alert>
            )}

            {uiError && (
              <Alert color="red" withCloseButton onClose={() => setUiError(null)}>
                {uiError}
              </Alert>
            )}

            {successMessage && (
              <Alert color="green" withCloseButton onClose={() => setSuccessMessage(null)}>
                {successMessage}
              </Alert>
            )}
          </Stack>
        </Card>

        {/* Filters Card */}
        <Card>
          <Group justify="space-between" wrap="wrap">
            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
              <TextInput
                placeholder="Search by name or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.currentTarget.value)}
                aria-label="Search account types"
              />

              <Switch
                label="Show Inactive"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.currentTarget.checked)}
              />
            </SimpleGrid>

            {hasFiltersActive && (
              <Button variant="subtle" size="sm" onClick={resetFilters}>
                Reset filters
              </Button>
            )}
          </Group>
        </Card>

        {/* Account Types List */}
        {!loading && !error && (
          <>
            {Object.keys(groupedByCategory).length === 0 ? (
              <Card>
                <Text c="dimmed" ta="center" py="xl">
                  {hasFiltersActive
                    ? "No account types match your filters. Try adjusting your search criteria."
                    : "No account types found. Create one to get started."}
                </Text>
              </Card>
            ) : (
              Object.entries(groupedByCategory)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([category, types]) => (
                  <Card key={category}>
                    <Stack gap="sm">
                      <Group gap="xs">
                        <Badge size="lg" variant="light" color="blue">
                          {category}
                        </Badge>
                        <Text size="sm" c="dimmed">
                          ({types.length} {types.length === 1 ? "type" : "types"})
                        </Text>
                      </Group>

                      <ScrollArea type="auto" scrollbarSize={8}>
                        <Table striped highlightOnHover>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Name</Table.Th>
                              <Table.Th>Normal Balance</Table.Th>
                              <Table.Th>Report Group</Table.Th>
                              <Table.Th>Status</Table.Th>
                              <Table.Th style={{ width: 140 }}>Actions</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {types.map((type) => (
                              <Table.Tr key={type.id}>
                                <Table.Td>
                                  <Text fw={500}>{type.name}</Text>
                                </Table.Td>
                                <Table.Td>
                                  <Text size="sm">{type.normal_balance || "-"}</Text>
                                </Table.Td>
                                <Table.Td>
                                  <Text size="sm">{type.report_group || "-"}</Text>
                                </Table.Td>
                                <Table.Td>
                                  <Badge
                                    size="sm"
                                    color={type.is_active ? "green" : "red"}
                                    variant="light"
                                  >
                                    {type.is_active ? "Active" : "Inactive"}
                                  </Badge>
                                </Table.Td>
                                <Table.Td>
                                  <Group gap="xs">
                                    <Button
                                      size="xs"
                                      variant="light"
                                      onClick={() => openEditForm(type)}
                                      disabled={!type.is_active}
                                    >
                                      Edit
                                    </Button>
                                    {type.is_active && (
                                      <Button
                                        size="xs"
                                        variant="light"
                                        color="red"
                                        onClick={() => confirmDeactivate(type)}
                                      >
                                        Deactivate
                                      </Button>
                                    )}
                                  </Group>
                                </Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </ScrollArea>
                    </Stack>
                  </Card>
                ))
            )}
          </>
        )}

        {/* Summary Stats Card */}
        <Card>
          <SimpleGrid cols={{ base: 3, sm: 3 }} spacing="md">
            <div>
              <Text size="xl" fw={700}>
                {accountTypes.length}
              </Text>
              <Text size="sm" c="dimmed">
                Total Types
              </Text>
            </div>
            <div>
              <Text size="xl" fw={700} c="green">
                {activeCount}
              </Text>
              <Text size="sm" c="dimmed">
                Active
              </Text>
            </div>
            <div>
              <Text size="xl" fw={700} c="blue">
                {categoryCount}
              </Text>
              <Text size="sm" c="dimmed">
                Categories
              </Text>
            </div>
          </SimpleGrid>
        </Card>
      </Stack>

      {/* Form Modal */}
      <Modal
        opened={formOpened}
        onClose={closeFormHandler}
        title={
          <Title order={4}>
            {formMode === "create" ? "Create Account Type" : "Edit Account Type"}
          </Title>
        }
        centered
      >
        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput
              label="Name"
              placeholder="e.g., Current Assets, Fixed Assets"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
              withAsterisk
              required
            />

            <Select
              label="Category"
              placeholder="Select category"
              data={CATEGORY_OPTIONS}
              value={formData.category}
              onChange={(value) => setFormData({ ...formData, category: value || "ASSET" })}
              required
            />

            <Select
              label="Normal Balance"
              placeholder="Select normal balance"
              data={NORMAL_BALANCE_OPTIONS}
              value={formData.normal_balance}
              onChange={(value) => setFormData({ ...formData, normal_balance: value || "D" })}
            />

            <Select
              label="Report Group"
              placeholder="Select report group"
              data={REPORT_GROUP_OPTIONS}
              value={formData.report_group}
              onChange={(value) => setFormData({ ...formData, report_group: value || "NRC" })}
            />

            {formError && (
              <Alert color="red">
                {formError}
              </Alert>
            )}

            <Group justify="flex-end">
              <Button variant="default" onClick={closeFormHandler} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" loading={submitting}>
                {submitting ? "Saving..." : formMode === "create" ? "Create" : "Save"}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Deactivate Confirmation Modal */}
      <Modal
        opened={confirmOpened}
        onClose={() => {
          setDeactivateTarget(null);
          closeConfirm();
        }}
        title={<Title order={4}>Confirm Deactivation</Title>}
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Are you sure you want to deactivate account type{" "}
            <Text span fw={600}>&quot;{deactivateTarget?.name}&quot;</Text>?{" "}
            This will prevent new accounts from using this classification template.
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => {
                setDeactivateTarget(null);
                closeConfirm();
              }}
            >
              Cancel
            </Button>
            <Button color="red" onClick={handleDeactivate}>
              Deactivate
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Container>
  );
}
