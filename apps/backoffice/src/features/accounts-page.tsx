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
  Collapse,
  Container,
  Divider,
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
import { useDisclosure } from "@mantine/hooks";
import { useState, useMemo, useEffect } from "react";

import { OfflinePage } from "../components/offline-page";
import { StaleDataWarning } from "../components/stale-data-warning";
import { useAccountTree, useAccountTypes ,
  createAccount,
  updateAccount,
  deactivateAccount,
  reactivateAccount
} from "../hooks/use-accounts";
import { ApiError } from "../lib/api-client";
import { buildCacheKey } from "../lib/cache-service";
import { useOnlineStatus } from "../lib/connection";
import type { SessionUser } from "../lib/session";


type AccountsPageProps = {
  user: SessionUser;
};

type FormMode = "create" | "edit" | null;

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

export function AccountsPage(props: AccountsPageProps) {
  const isOnline = useOnlineStatus();
  const [searchTerm, setSearchTerm] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [reportGroupFilter, setReportGroupFilter] = useState<ReportGroup | "ALL">("ALL");
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());
  
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<AccountFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [formOpened, { open: openForm, close: closeForm }] = useDisclosure(false);

  const { data: tree, loading, error: treeError, refetch } = useAccountTree(
    props.user.company_id,
    showInactive
  );

  const { data: accountTypes, loading: accountTypesLoading } = useAccountTypes(
    props.user.company_id,
    { is_active: undefined }
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

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Master Data"
        message="Chart of accounts changes require a connection."
      />
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
    openForm();
  }

  function openEditForm(account: AccountTreeNode) {
    setFormMode("edit");
    setEditingId(account.id);
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
    openForm();
  }

  function closeFormHandler() {
    setFormMode(null);
    setEditingId(null);
    setFormData(emptyForm);
    setFormErrors({});
    closeForm();
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    
    if (!formData.code.trim()) {
      errors.code = "Account code is required";
    }
    if (!formData.name.trim()) {
      errors.name = "Account name is required";
    }

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
      if (formMode === "create") {
        await createAccount(
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
        await updateAccount(
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
      closeFormHandler();
    } catch (submitError) {
      if (submitError instanceof ApiError) {
        setError(submitError.message);
      } else {
        setError("Failed to save account");
      }
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleDeactivate(account: AccountTreeNode) {
    if (!window.confirm(`Are you sure you want to deactivate account "${account.code} - ${account.name}"?`)) {
      return;
    }

    setError(null);
    setSuccessMessage(null);

    try {
      await deactivateAccount(account.id);
      setSuccessMessage("Account deactivated successfully");
      await refetch();
    } catch (deactivateError) {
      if (deactivateError instanceof ApiError) {
        if (deactivateError.code === "ACCOUNT_IN_USE") {
          setError("Cannot deactivate: Account is in use (has journal entries or child accounts)");
        } else {
          setError(deactivateError.message);
        }
      } else {
        setError("Failed to deactivate account");
      }
    }
  }

  async function handleReactivate(account: AccountTreeNode) {
    setError(null);
    setSuccessMessage(null);

    try {
      await reactivateAccount(account.id);
      setSuccessMessage("Account reactivated successfully");
      await refetch();
    } catch (reactivateError) {
      if (reactivateError instanceof ApiError) {
        setError(reactivateError.message);
      } else {
        setError("Failed to reactivate account");
      }
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
                  variant="light"
                  onClick={() => openEditForm(node)}
                >
                  Edit
                </Button>
                {node.is_active ? (
                  <Button
                    size="xs"
                    variant="light"
                    color="red"
                    onClick={() => handleDeactivate(node)}
                  >
                    Deactivate
                  </Button>
                ) : (
                  <Button
                    size="xs"
                    variant="light"
                    color="green"
                    onClick={() => handleReactivate(node)}
                  >
                    Reactivate
                  </Button>
                )}
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

  const parentAccountData = [
    { value: "", label: "None (Top Level)" },
    ...flatAccounts
      .filter((acc) => formMode === "edit" ? acc.id !== editingId : true)
      .map((acc) => ({
        value: String(acc.id),
        label: `${acc.code} - ${acc.name}`
      }))
  ];

  const accountTypeData = [
    { value: "", label: "None (manual entry)" },
    ...accountTypes.map((type) => ({
      value: String(type.id),
      label: `${type.category ? `[${type.category}] ` : ""}${type.name}${type.normal_balance ? ` [${type.normal_balance}]` : ""}${type.report_group ? ` - ${type.report_group}` : ""}`
    }))
  ];

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
              <Button onClick={openCreateForm}>
                Create Account
              </Button>
            </Group>

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

        {/* Account Form Card */}
        <Collapse in={formOpened}>
          <Card>
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={4}>
                  {formMode === "create" ? "Create New Account" : "Edit Account"}
                </Title>
                <Button variant="subtle" size="xs" onClick={closeFormHandler}>
                  Close
                </Button>
              </Group>
              
              <Divider />
              
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
                
                <div />
                
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
                </Stack>
              </SimpleGrid>
              
              <Divider />
              
              <Group justify="flex-end">
                <Button variant="default" onClick={closeFormHandler} disabled={submitLoading}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} loading={submitLoading}>
                  Save
                </Button>
              </Group>
            </Stack>
          </Card>
        </Collapse>

        {/* Accounts Tree Card */}
        <Card>
          <Stack gap="sm">
            <Group justify="space-between" align="center" wrap="wrap">
              <Title order={4}>
                Accounts Tree ({filteredTree.length})
              </Title>

              <Group gap="xs" wrap="wrap">
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
                  {filteredTree.map((node) => renderTreeNode(node, 0))}
                </Stack>
              </ScrollArea>
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
