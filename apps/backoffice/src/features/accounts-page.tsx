// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type {
  AccountResponse,
  AccountTreeNode,
  NormalBalance,
  ReportGroup
} from "@jurnapod/shared";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  ThemeIcon,
  Title
} from "@mantine/core";
import { useState, useMemo, useEffect } from "react";

import { ReviewPanel, type ReviewPanelSection } from "@/components/ReviewPanel";
import { OfflinePage } from "../components/offline-page";
import { StaleDataWarning } from "../components/stale-data-warning";
import { useAccountTree, useAccountTypes ,
  createAccount,
  updateAccount
} from "../hooks/use-accounts";
import { ApiError } from "../lib/api-client";
import { actionGates, resolveEffectivePermissions } from "../lib/auth/permissions";
import { buildCacheKey } from "../lib/cache-service";
import { useOnlineStatus } from "../lib/connection";
import type { SessionUser } from "../lib/session";
import type { DiffChange } from "../lib/diff-engine";


type AccountsPageProps = {
  user: SessionUser;
};

type FormMode = "create" | "edit" | null;
type AccountViewMode = "tree" | "flat";

type AccountFormData = {
  code: string;
  name: string;
  parent_account_id: number | null;
  is_group: boolean;
  account_type_id: number | null;
  type_name: string | null;
  normal_balance: NormalBalance | null;
  report_group: ReportGroup | null;
  is_payable: boolean;
  is_active: boolean;
};

const emptyForm: AccountFormData = {
  code: "",
  name: "",
  parent_account_id: null,
  is_group: false,
  account_type_id: null,
  type_name: null,
  normal_balance: null,
  report_group: null,
  is_payable: false,
  is_active: true
};

const reportGroupOptions = [
  { value: "NRC", label: "NRC (Neraca/Balance Sheet)" },
  { value: "PL", label: "PL (Laba Rugi/P&L)" }
];

const normalBalanceOptions = [
  { value: "D", label: "D (Debit)" },
  { value: "K", label: "K (Kredit)" }
];

export function validateAccountForm(data: AccountFormData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.code.trim()) errors.code = "Account code is required";
  if (!data.name.trim()) errors.name = "Account name is required";
  return errors;
}

export function formatAccountApiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "DUPLICATE_CODE") return "Account code already exists.";
    if (error.code === "INVALID_PARENT") return "Parent account is invalid or belongs to a different company.";
    if (error.code === "INVALID_ACCOUNT_TYPE") return "Account type is invalid or belongs to a different company.";
    if (error.code === "CIRCULAR_REFERENCE") return "Parent selection creates a circular account hierarchy.";
    if (error.code === "NOT_FOUND") return "Account was not found. Refresh the list and try again.";
    if (error.code === "ACCOUNT_IN_USE") return "Account is in use and cannot be deactivated.";
    if (error.code === "FORBIDDEN") return "You do not have permission to perform this account action.";
    return error.message;
  }
  return "Failed to save account";
}

function formatNullable(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function accountResponseToTreeNode(account: AccountResponse): AccountTreeNode {
  return { ...account, children: [] };
}

export function buildAccountDiffChanges(before: AccountResponse | null, after: AccountFormData): DiffChange[] {
  const fields: Array<{ key: keyof AccountFormData; label: string; type?: DiffChange["valueType"] }> = [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "parent_account_id", label: "Parent account", type: "number" },
    { key: "is_group", label: "Group account", type: "boolean" },
    { key: "account_type_id", label: "Classification template", type: "number" },
    { key: "type_name", label: "Type name" },
    { key: "normal_balance", label: "Normal balance" },
    { key: "report_group", label: "Report group" },
    { key: "is_payable", label: "Payment destination", type: "boolean" },
    { key: "is_active", label: "Active", type: "boolean" },
  ];
  return fields.flatMap((field): DiffChange[] => {
    const oldValue = before ? before[field.key as keyof AccountResponse] : undefined;
    const newValue = after[field.key];
    if (formatNullable(oldValue) === formatNullable(newValue)) return [];
    return [{
      path: String(field.key),
      label: field.label,
      kind: before ? "changed" : "added",
      oldValue,
      newValue,
      oldFormatted: formatNullable(oldValue),
      newFormatted: formatNullable(newValue),
      valueType: field.type ?? "string",
    }];
  });
}

export function AccountsPage(props: AccountsPageProps) {
  const isOnline = useOnlineStatus();
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [reportGroupFilter, setReportGroupFilter] = useState<ReportGroup | "ALL">("ALL");
  const [viewMode, setViewMode] = useState<AccountViewMode>("tree");
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<AccountFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<AccountTreeNode | null>(null);

  const formOpened = formMode !== null;

  const permissions = useMemo(() => {
    const effective = resolveEffectivePermissions(props.user) ?? [];
    return actionGates(effective, "accounting", "accounts", ["READ", "CREATE", "UPDATE"]);
  }, [props.user]);

  const { data: tree, loading, error: treeError, refetch } = useAccountTree(
    props.user.company_id,
    showInactive,
    { enabled: permissions.READ }
  );

  const { data: accountTypes, loading: accountTypesLoading } = useAccountTypes(
    props.user.company_id,
    { is_active: undefined },
    { enabled: permissions.READ }
  );

  const flatAccounts = useMemo(() => {
    if (!tree) return [];
    const result: AccountResponse[] = [];
    function traverse(nodes: AccountTreeNode[]) {
      for (const node of nodes) {
        result.push(node);
        if (node.children && node.children.length > 0) {
          traverse(node.children);
        }
      }
    }
    traverse(tree);
    return result;
  }, [tree]);

  const filteredTree = useMemo(() => {
    if (!tree) return [];
    if (!searchTerm && reportGroupFilter === "ALL") {
      return tree;
    }

    function matchesFilters(node: AccountTreeNode): boolean {
      const matchesSearch = !searchTerm || 
        node.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        node.name.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesReportGroup = reportGroupFilter === "ALL" || 
        node.report_group === reportGroupFilter;
      
      return matchesSearch && matchesReportGroup;
    }

    function filterTree(nodes: AccountTreeNode[]): AccountTreeNode[] {
      return nodes
        .map((node) => {
          const filteredChildren = node.children ? filterTree(node.children) : [];
          const nodeMatches = matchesFilters(node);
          const hasMatchingChildren = filteredChildren.length > 0;

          if (nodeMatches || hasMatchingChildren) {
            return {
              ...node,
              children: filteredChildren
            };
          }
          return null;
        })
        .filter((node): node is AccountTreeNode => node !== null);
    }

    return filterTree(tree);
  }, [tree, searchTerm, reportGroupFilter]);

  useEffect(() => {
    if (!searchTerm || !filteredTree.length) {
      return;
    }

    function collectExpandedIds(nodes: AccountTreeNode[]): Set<number> {
      const expanded = new Set<number>();
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          const childExpanded = collectExpandedIds(node.children);
          if (childExpanded.size > 0) {
            expanded.add(node.id);
            childExpanded.forEach(id => expanded.add(id));
          }
        }
        if (node.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            node.name.toLowerCase().includes(searchTerm.toLowerCase())) {
          expanded.add(node.id);
        }
      }
      return expanded;
    }

    const nodesToExpand = collectExpandedIds(filteredTree);
    
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      let hasNew = false;
      nodesToExpand.forEach(id => {
        if (!newSet.has(id)) {
          newSet.add(id);
          hasNew = true;
        }
      });
      return hasNew ? newSet : prev;
    });
  }, [searchTerm, filteredTree]);

  function toggleNode(nodeId: number) {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }

  function collectExpandableNodeIds(nodes: AccountTreeNode[]): number[] {
    const ids: number[] = [];
    function walk(items: AccountTreeNode[]) {
      for (const item of items) {
        if (item.children && item.children.length > 0) {
          ids.push(item.id);
          walk(item.children);
        }
      }
    }
    walk(nodes);
    return ids;
  }

  const expandableFilteredNodeIds = useMemo(
    () => collectExpandableNodeIds(filteredTree),
    [filteredTree]
  );

  const filteredFlatAccounts = useMemo(() => {
    const rows: AccountTreeNode[] = [];
    function walk(nodes: AccountTreeNode[]) {
      for (const node of nodes) {
        rows.push(node);
        if (node.children && node.children.length > 0) walk(node.children);
      }
    }
    walk(filteredTree);
    return rows;
  }, [filteredTree]);

  const editingAccount = useMemo(
    () => (editingId ? flatAccounts.find((account) => account.id === editingId) ?? null : null),
    [editingId, flatAccounts]
  );

  const parentAccountData = useMemo(() => [
    { value: "", label: "None (Top Level)" },
    ...flatAccounts
      .filter((acc) => formMode === "edit" ? acc.id !== editingId : true)
      .map((acc) => ({
        value: String(acc.id),
        label: `${acc.code} - ${acc.name}`
      }))
  ], [editingId, flatAccounts, formMode]);

  const accountTypeData = useMemo(() => [
    { value: "", label: "None (manual entry)" },
    ...accountTypes.map((type) => ({
      value: String(type.id),
      label: `${type.category ? `[${type.category}] ` : ""}${type.name}${type.normal_balance ? ` [${type.normal_balance}]` : ""}${type.report_group ? ` - ${type.report_group}` : ""}`
    }))
  ], [accountTypes]);

  const reviewSections: ReviewPanelSection[] = useMemo(() => [
    {
      id: "account-identity",
      title: "Account identity",
      description: "Code, name, parent account, and classification fields sent to the verified accounts contract.",
      errors: [formErrors.code, formErrors.name].filter((item): item is string => Boolean(item)),
      content: (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput
            label="Code"
            placeholder="e.g., 1000, CASH-01"
            value={formData.code}
            onChange={(e) => setFormData({ ...formData, code: e.currentTarget.value })}
            error={formErrors.code}
            withAsterisk
          />
          <TextInput
            label="Name"
            placeholder="e.g., Cash in Bank"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.currentTarget.value })}
            error={formErrors.name}
            withAsterisk
          />
          <Select
            label="Parent Account"
            placeholder="Select parent account"
            data={parentAccountData}
            value={formData.parent_account_id != null ? String(formData.parent_account_id) : ""}
            onChange={(value) =>
              setFormData({
                ...formData,
                parent_account_id: value ? Number(value) : null
              })
            }
            clearable
            searchable
          />
          <Select
            label="Classification (Template)"
            placeholder="Select a template"
            data={accountTypeData}
            value={formData.account_type_id != null ? String(formData.account_type_id) : ""}
            onChange={(value) => {
              const typeId = value ? Number(value) : null;
              const selectedType = accountTypes.find(t => t.id === typeId);
              setFormData({
                ...formData,
                account_type_id: typeId,
                type_name: selectedType?.name ?? formData.type_name,
                normal_balance: selectedType?.normal_balance ?? formData.normal_balance,
                report_group: selectedType?.report_group ?? formData.report_group
              });
            }}
            disabled={accountTypesLoading}
            clearable
            searchable
          />
          <TextInput
            label="Type Name"
            placeholder="e.g., Kas, Bank, Pendapatan"
            value={formData.type_name ?? ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                type_name: e.currentTarget.value || null
              })
            }
            description="Leave empty to inherit from parent account"
          />
          <Select
            label="Normal Balance"
            placeholder="Select normal balance"
            data={[
              { value: "", label: "Inherit from parent" },
              ...normalBalanceOptions
            ]}
            value={formData.normal_balance ?? ""}
            onChange={(value) =>
              setFormData({
                ...formData,
                normal_balance: (value as NormalBalance) || null
              })
            }
            clearable
          />
          <Select
            label="Report Group"
            placeholder="Select report group"
            data={[
              { value: "", label: "Inherit from parent" },
              ...reportGroupOptions
            ]}
            value={formData.report_group ?? ""}
            onChange={(value) =>
              setFormData({
                ...formData,
                report_group: (value as ReportGroup) || null
              })
            }
            clearable
          />
        </SimpleGrid>
      )
    },
    {
      id: "account-controls",
      title: "Controls and impact",
      description: "Activation, group, and payable settings. Deactivation is submitted through PUT and backend ACCOUNT_IN_USE guards remain authoritative.",
      content: (
        <Stack gap="xs">
          <Checkbox
            label="Is Group Account"
            description="Group accounts can have child accounts"
            checked={formData.is_group}
            onChange={(e) => setFormData({ ...formData, is_group: e.currentTarget.checked })}
          />
          <Checkbox
            label="Active"
            checked={formData.is_active}
            onChange={(e) => setFormData({ ...formData, is_active: e.currentTarget.checked })}
          />
          <Checkbox
            label="Payment Destination"
            description="Allow this account to receive POS and sales payments"
            checked={formData.is_payable}
            onChange={(e) => setFormData({ ...formData, is_payable: e.currentTarget.checked })}
          />
          <Alert color="blue" title="History scope">
            Journal-line history is unavailable until a verified backend contract exists. This screen does not fetch or fabricate journal history.
          </Alert>
        </Stack>
      )
    }
  ], [accountTypeData, accountTypes, accountTypesLoading, formData, formErrors.code, formErrors.name, parentAccountData]);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Master Data"
        message="Chart of accounts changes require a connection."
      />
    );
  }

  if (!permissions.READ) {
    return (
      <Container size="lg" py="md">
        <Alert color="red" title="Access denied">
          You need accounting.accounts READ permission to view the chart of accounts.
        </Alert>
      </Container>
    );
  }

  function handleExpandAll() {
    setExpandedNodes(new Set(expandableFilteredNodeIds));
  }

  function handleExpandFirstLevel() {
    setExpandedNodes(new Set(filteredTree.filter((node) => node.children && node.children.length > 0).map((node) => node.id)));
  }

  function handleCollapseAll() {
    setExpandedNodes(new Set());
  }

  function openCreateForm() {
    setFormMode("create");
    setEditingId(null);
    setFormData(emptyForm);
    setFormErrors({});
    setError(null);
    setSuccessMessage(null);
    setExpandedNodes(new Set());
  }

  function openEditForm(account: AccountTreeNode) {
    setFormMode("edit");
    setEditingId(account.id);
    setSelectedAccount(account);
    setFormData({
      code: account.code,
      name: account.name,
      parent_account_id: account.parent_account_id,
      is_group: account.is_group,
      account_type_id: account.account_type_id,
      type_name: account.type_name,
      normal_balance: account.normal_balance,
      report_group: account.report_group,
      is_payable: account.is_payable ?? false,
      is_active: account.is_active
    });
    setFormErrors({});
    setError(null);
    setSuccessMessage(null);
  }

  function closeFormHandler() {
    setFormMode(null);
    setEditingId(null);
    setFormData(emptyForm);
    setFormErrors({});
  }

  function validateForm(): boolean {
    const errors = validateAccountForm(formData);
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validateForm()) {
      return;
    }

    setSubmitLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      let savedAccount: AccountResponse | null = null;
      if (formMode === "create") {
        savedAccount = await createAccount(
          {
            company_id: props.user.company_id,
            code: formData.code.trim(),
            name: formData.name.trim(),
            parent_account_id: formData.parent_account_id,
            is_group: formData.is_group,
            account_type_id: formData.account_type_id,
            type_name: formData.type_name,
            normal_balance: formData.normal_balance,
            report_group: formData.report_group,
            is_payable: formData.is_payable,
            is_active: formData.is_active
          }
        );
        setSuccessMessage("Account created successfully");
      } else if (formMode === "edit" && editingId) {
        savedAccount = await updateAccount(
          editingId,
          {
            code: formData.code.trim(),
            name: formData.name.trim(),
            parent_account_id: formData.parent_account_id,
            is_group: formData.is_group,
            account_type_id: formData.account_type_id,
            type_name: formData.type_name,
            normal_balance: formData.normal_balance,
            report_group: formData.report_group,
            is_payable: formData.is_payable,
            is_active: formData.is_active
          }
        );
        setSuccessMessage("Account updated successfully");
      }

      await refetch();
      setSelectedAccount(savedAccount ? accountResponseToTreeNode(savedAccount) : null);
      closeFormHandler();
    } catch (submitError) {
      setError(formatAccountApiError(submitError));
    } finally {
      setSubmitLoading(false);
    }
  }

  function renderTreeNode(node: AccountTreeNode, level: number) {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const indentPx = level * 24;

    return (
      <div key={node.id}>
        <Paper
          p="sm"
          withBorder
          style={{
            marginBottom: 4,
            marginLeft: indentPx,
            backgroundColor: level % 2 === 0 ? undefined : "var(--mantine-color-gray-light)",
            transition: "background-color 0.15s ease"
          }}
        >
          <Stack gap="xs">
            <Group justify="space-between" wrap="wrap">
              <Group gap="xs" wrap="wrap">
                {hasChildren ? (
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={() => toggleNode(node.id)}
                    aria-label={isExpanded ? "Collapse" : "Expand"}
                  >
                    <Text size="xs" fw={600}>
                      {isExpanded ? "▼" : "▶"}
                    </Text>
                  </ActionIcon>
                ) : (
                  <div style={{ width: 22 }} />
                )}
                
                <ThemeIcon
                  size="sm"
                  variant="light"
                  color={node.is_group ? "blue" : "gray"}
                >
                  {node.is_group ? "📁" : "📄"}
                </ThemeIcon>

                <Text size="sm" fw={600}>
                  {node.code}
                </Text>
                
                <Text size="sm" c="dimmed">-</Text>
                
                <Text size="sm" style={{ flex: 1 }} truncate>
                  {node.name}
                </Text>
              </Group>
            </Group>

            <Group justify="space-between" wrap="wrap">
              <Group gap={4} wrap="wrap">
                <Badge
                  size="xs"
                  color={node.is_active ? "green" : "red"}
                  variant="light"
                >
                  {node.is_active ? "Active" : "Inactive"}
                </Badge>
                {node.is_group && (
                  <Badge size="xs" color="blue" variant="light">
                    Group
                  </Badge>
                )}
                {node.is_payable && (
                  <Badge size="xs" color="yellow" variant="light">
                    Payable
                  </Badge>
                )}
                {node.report_group && (
                  <Badge size="xs" variant="outline">
                    {node.report_group}
                  </Badge>
                )}
                
                <Text size="xs" c="dimmed">
                  {node.type_name && (
                    <span>{node.type_name}</span>
                  )}
                  {!node.type_name && node.account_type_id && accountTypes.length > 0 && (
                    <span>
                      {accountTypes.find(t => t.id === node.account_type_id)?.name}
                    </span>
                  )}
                  {node.normal_balance && (
                    <span> [{node.normal_balance}]</span>
                  )}
                </Text>
              </Group>

              <Group gap={4}>
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => setSelectedAccount(node)}
                >
                  Details
                </Button>
                <Button
                  size="xs"
                  variant="light"
                  onClick={() => openEditForm(node)}
                  disabled={!permissions.UPDATE}
                >
                  Edit
                </Button>
              </Group>
            </Group>
          </Stack>
        </Paper>

        {isExpanded && hasChildren && (
          <div>
            {node.children.map((child) => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Container size="lg" py="md">
      <Stack gap="md">
        {/* Header + Status Card */}
        <Card>
          <Stack gap="sm">
            <Group justify="space-between" wrap="wrap">
              <div>
                <Title order={2}>Chart of Accounts</Title>
                <Text c="dimmed" size="sm">
                  Manage your company&apos;s chart of accounts for financial reporting.
                </Text>
              </div>
              {permissions.CREATE && (
                <Button onClick={openCreateForm}>
                  Create Account
                </Button>
              )}
            </Group>

            {!permissions.CREATE && (
              <Alert color="blue" title="Read-only access">
                You can view accounts, but accounting.accounts CREATE permission is required to create new accounts.
              </Alert>
            )}

            <StaleDataWarning
              cacheKey={buildCacheKey("accounts", { companyId: props.user.company_id })}
              label="accounts"
            />
            
            {loading && (
              <Group gap="xs">
                <Loader size="xs" />
                <Text size="sm" c="dimmed">Loading accounts...</Text>
              </Group>
            )}
            
            {treeError && (
              <Alert color="red" title="Error loading accounts">
                {treeError}
              </Alert>
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

        {/* Filters Card */}
        <Card>
          <Stack gap="sm">
            <Title order={4}>Filters</Title>
            <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
              <TextInput
                placeholder="Search by code or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.currentTarget.value)}
                aria-label="Search accounts"
              />
              
              <Select
                placeholder="All Report Groups"
                data={[
                  { value: "ALL", label: "All Report Groups" },
                  ...reportGroupOptions
                ]}
                value={reportGroupFilter}
                onChange={(value) => setReportGroupFilter((value as ReportGroup | "ALL") || "ALL")}
                aria-label="Filter by report group"
              />
              
              <Switch
                label="Show Inactive"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.currentTarget.checked)}
              />
            </SimpleGrid>
          </Stack>
        </Card>

        {/* Account Form Review */}
        {formOpened && (
          <Card>
            <ReviewPanel
              title={formMode === "create" ? "Create account" : "Edit account"}
              description="Review account identity and control fields before submitting to the verified accounting accounts API."
              sections={reviewSections}
              scopeBadges={[{ label: "Scope", value: `company:${props.user.company_id}` }]}
              summaryItems={[
                { label: "Action", value: formMode === "create" ? "Create account" : "Update account" },
                { label: "Account", value: `${formData.code || "New code"} - ${formData.name || "New name"}` },
                { label: "Endpoint", value: formMode === "create" ? "POST /accounts" : `PUT /accounts/${editingId ?? "{id}"}` },
              ]}
              diffChanges={buildAccountDiffChanges(formMode === "edit" ? editingAccount : null, formData)}
              autosaveWarning="Account drafts are held only in this browser session; no autosave API exists for chart of accounts."
              saveLabel={formMode === "create" ? "Create account" : "Update account"}
              saveDisabled={formMode === "create" ? !permissions.CREATE : !permissions.UPDATE}
              submitting={submitLoading}
              onSubmit={handleSubmit}
              onDiscardDraft={closeFormHandler}
            />
          </Card>
        )}

        {/* Accounts Tree Card */}
        <Card>
          <Stack gap="sm">
            <Group justify="space-between" align="center" wrap="wrap">
              <Title order={4}>
                Accounts ({viewMode === "tree" ? filteredTree.length : filteredFlatAccounts.length})
              </Title>

              <Group gap="xs" wrap="wrap">
                <Button.Group>
                  <Button
                    size="xs"
                    variant={viewMode === "tree" ? "filled" : "default"}
                    onClick={() => setViewMode("tree")}
                  >
                    Tree
                  </Button>
                  <Button
                    size="xs"
                    variant={viewMode === "flat" ? "filled" : "default"}
                    onClick={() => setViewMode("flat")}
                  >
                    Flat
                  </Button>
                </Button.Group>
                <Badge variant="light" color="gray">
                  Expanded {Math.min(expandedNodes.size, expandableFilteredNodeIds.length)}/{expandableFilteredNodeIds.length}
                </Badge>
                <Button
                  size="xs"
                  variant="default"
                  onClick={handleExpandAll}
                  disabled={expandableFilteredNodeIds.length === 0}
                >
                  Expand all
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  onClick={handleExpandFirstLevel}
                  disabled={filteredTree.length === 0}
                >
                  Expand first level
                </Button>
                <Button
                  size="xs"
                  variant="default"
                  onClick={handleCollapseAll}
                  disabled={expandedNodes.size === 0}
                >
                  Collapse all
                </Button>
              </Group>
            </Group>
            
            {filteredTree.length === 0 ? (
              <Text c="dimmed" ta="center" py="xl">
                {searchTerm || reportGroupFilter !== "ALL" 
                  ? "No accounts match your filters. Try adjusting your search criteria."
                  : "No accounts found. Create your first account to get started."}
              </Text>
            ) : (
              <ScrollArea type="auto" scrollbarSize={8}>
                <Stack gap={0}>
                  {viewMode === "tree"
                    ? filteredTree.map((node) => renderTreeNode(node, 0))
                    : filteredFlatAccounts.map((node) => renderTreeNode({ ...node, children: [] }, 0))}
                </Stack>
              </ScrollArea>
            )}
          </Stack>
        </Card>

        <Card>
          <Stack gap="sm">
            <Title order={4}>Account Detail</Title>
            {selectedAccount ? (
              <Stack gap="xs">
                <Group gap="xs" wrap="wrap">
                  <Badge variant="light">{selectedAccount.code}</Badge>
                  <Text fw={600}>{selectedAccount.name}</Text>
                  <Badge color={selectedAccount.is_active ? "green" : "red"} variant="light">
                    {selectedAccount.is_active ? "Active" : "Inactive"}
                  </Badge>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                  <Text size="sm">Type: {selectedAccount.type_name ?? "Inherited / unspecified"}</Text>
                  <Text size="sm">Report group: {selectedAccount.report_group ?? "Inherited / unspecified"}</Text>
                  <Text size="sm">Normal balance: {selectedAccount.normal_balance ?? "Inherited / unspecified"}</Text>
                  <Text size="sm">Payment destination: {selectedAccount.is_payable ? "Yes" : "No"}</Text>
                </SimpleGrid>
                <Alert color="gray" title="Journal history unavailable">
                  Journal-line history is intentionally not shown because Story 69-3-b has no verified journal history API contract. No fabricated audit or journal links are rendered.
                </Alert>
              </Stack>
            ) : (
              <Text c="dimmed">Select Details on an account to view verified account fields. Journal-line history remains unavailable until a verified API contract exists.</Text>
            )}
          </Stack>
        </Card>

        {/* Summary Card */}
        <Card>
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Loaded {flatAccounts.length} accounts total.
              {(searchTerm || reportGroupFilter !== "ALL") && (
                <> Showing {filteredTree.length} after filters.</>
              )}
            </Text>
          </Group>
        </Card>
      </Stack>
    </Container>
  );
}
