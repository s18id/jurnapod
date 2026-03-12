// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import type { SessionUser } from "../lib/session";
import { useOnlineStatus } from "../lib/connection";
import { OfflinePage } from "../components/offline-page";
import { useAccounts } from "../hooks/use-accounts";
import {
  useOutletAccountMappings,
  type OutletAccountMappingKey,
  type CompanyOnlyMappingKey,
  type AnyMappingKey,
  type OutletAccountMapping,
  type EffectiveOutletAccountMapping
} from "../hooks/use-outlet-account-mappings";
import {
  useOutletPaymentMethodMappings,
  type PaymentMethodConfig,
  type PaymentMethodMapping,
  type EffectivePaymentMethodMapping
} from "../hooks/use-outlet-payment-method-mappings";
import { ApiError } from "../lib/api-client";

type AccountMappingsPageProps = {
  user: SessionUser;
  accessToken: string;
};

type MappingScope = "company" | "outlet";

const mappingGroups: Array<{
  title: string;
  description: string;
  keys: Array<{ key: OutletAccountMappingKey; label: string }>;
  companyOnly?: boolean;
}> = [
  {
    title: "Sales Defaults",
    description: "Used for sales invoice posting.",
    keys: [
      { key: "AR", label: "Accounts Receivable" },
      { key: "SALES_REVENUE", label: "Sales Revenue" }
    ]
  },
  {
    title: "Company Defaults / Other Income-Expense",
    description: "Used for payment variance (forex delta) posting. Configure under company scope only.",
    keys: [],
    companyOnly: true
  }
];

const companyOnlyMappingGroups: Array<{
  title: string;
  description: string;
  keys: Array<{ key: CompanyOnlyMappingKey; label: string }>;
}> = [
  {
    title: "Payment Variance (Forex Delta)",
    description: "Accounts for differences between invoice amount and actual payment from foreign clients.",
    keys: [
      { key: "PAYMENT_VARIANCE_GAIN", label: "Payment Variance Gain" },
      { key: "PAYMENT_VARIANCE_LOSS", label: "Payment Variance Loss" }
    ]
  }
];

const allMappingKeys = mappingGroups.flatMap((group) => group.keys.map((entry) => entry.key));
const persistedMappingKeys: AnyMappingKey[] = Array.from(
  new Set<AnyMappingKey>([...allMappingKeys, "INVOICE_PAYMENT_BANK", "PAYMENT_VARIANCE_GAIN", "PAYMENT_VARIANCE_LOSS"])
);

const requiredSalesMappingKeys: OutletAccountMappingKey[] = ["AR", "SALES_REVENUE"];

function buildDefaultMappings(): Record<AnyMappingKey, number | ""> {
  return persistedMappingKeys.reduce(
    (acc, key) => {
      acc[key] = "";
      return acc;
    },
    {} as Record<AnyMappingKey, number | "">
  );
}

export function AccountMappingsPage({ user, accessToken }: AccountMappingsPageProps) {
  const isOnline = useOnlineStatus();
  const [scope, setScope] = useState<MappingScope>("outlet");
  const [outletId, setOutletId] = useState<number>(user.outlets[0]?.id ?? 0);
  const [formState, setFormState] = useState<Record<AnyMappingKey, number | "">>(
    buildDefaultMappings() as Record<AnyMappingKey, number | "">
  );
  const [sourceState, setSourceState] = useState<Record<AnyMappingKey, "outlet" | "company" | null>>(
    {} as Record<AnyMappingKey, "outlet" | "company" | null>
  );
  const [companyDefaultsAvailable, setCompanyDefaultsAvailable] = useState<Record<AnyMappingKey, boolean>>(
    {} as Record<AnyMappingKey, boolean>
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paymentSubmitError, setPaymentSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [draftMethodCode, setDraftMethodCode] = useState("");
  const [draftMethodLabel, setDraftMethodLabel] = useState("");
  const [draftMethods, setDraftMethods] = useState<PaymentMethodConfig[]>([]);
  const [paymentLabelState, setPaymentLabelState] = useState<Record<string, string>>({});

  const { data: mappings, loading, error, refetch, save } = useOutletAccountMappings(
    scope === "outlet" ? outletId : null,
    accessToken,
    scope
  );
  const {
    paymentMethods,
    mappings: paymentMappings,
    loading: paymentLoading,
    error: paymentError,
    refetch: refetchPayment,
    save: savePayment
  } = useOutletPaymentMethodMappings(
    scope === "outlet" ? outletId : null,
    accessToken,
    scope
  );
  const accountFilters = useMemo(() => ({ is_active: true }), []);
  const { data: accounts } = useAccounts(user.company_id, accessToken, accountFilters);

  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        label: `${account.code} - ${account.name}`,
        is_payable: account.is_payable
      })),
    [accounts]
  );
  const paymentAccountOptions = useMemo(
    () => accountOptions.filter((account) => account.is_payable),
    [accountOptions]
  );
  const [paymentFormState, setPaymentFormState] = useState<Record<string, number | "">>({});
  const [paymentSourceState, setPaymentSourceState] = useState<Record<string, "outlet" | "company">>({});
  const [paymentCompanyDefaultsAvailable, setPaymentCompanyDefaultsAvailable] = useState<Record<string, boolean>>({});
  const [reloadError, setReloadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"invoice" | "pos">("invoice");

  useEffect(() => {
    const nextState = buildDefaultMappings();
    const nextSource: Record<string, "outlet" | "company" | null> = {};
    const nextCompanyDefaults: Record<string, boolean> = {};
    
    mappings.forEach((mapping) => {
      const m = mapping as EffectiveOutletAccountMapping;
      nextState[m.mapping_key] = (m.account_id ?? "") as number | "";
      nextSource[m.mapping_key] = m.source;
      if (m.company_account_id !== null && m.company_account_id !== undefined) {
        nextCompanyDefaults[m.mapping_key] = true;
      }
    });
    setFormState(nextState);
    setSourceState(nextSource as Record<AnyMappingKey, "outlet" | "company" | null>);
    setCompanyDefaultsAvailable(nextCompanyDefaults as Record<AnyMappingKey, boolean>);
  }, [mappings]);

  useEffect(() => {
    const nextState: Record<string, number | ""> = {};
    const nextLabels: Record<string, string> = {};
    const nextSource: Record<string, "outlet" | "company"> = {};
    const nextCompanyDefaults: Record<string, boolean> = {};
    
    paymentMethods.forEach((method) => {
      nextState[method.code] = "";
      nextLabels[method.code] = method.label;
    });
    paymentMappings.forEach((mapping) => {
      const m = mapping as EffectivePaymentMethodMapping;
      if (m.method_code) {
        nextState[m.method_code] = (m.account_id ?? "") as number | "";
        nextSource[m.method_code] = m.source;
        if (m.company_account_id !== null && m.company_account_id !== undefined) {
          nextCompanyDefaults[m.method_code] = true;
        }
        if (m.label) {
          nextLabels[m.method_code] = m.label;
        }
      }
    });
    setPaymentFormState(nextState);
    setPaymentLabelState(nextLabels);
    setPaymentSourceState(nextSource);
    setPaymentCompanyDefaultsAvailable(nextCompanyDefaults);
  }, [paymentMethods, paymentMappings]);

  const effectivePaymentMethods = useMemo(() => {
    const methodMap = new Map(paymentMethods.map((method) => [method.code, method]));
    draftMethods.forEach((method) => {
      if (!methodMap.has(method.code)) {
        methodMap.set(method.code, method);
      }
    });
    return Array.from(methodMap.values());
  }, [paymentMethods, draftMethods]);

  const missingPaymentMethods = effectivePaymentMethods.filter((method) => {
    const value = paymentFormState[method.code];
    const isBlank = !value;
    if (!isBlank) {
      return false;
    }
    if (scope === "outlet") {
      const source = paymentSourceState[method.code];
      if (source === "company") {
        return false;
      }
      if (source === "outlet") {
        const hasCompanyDefault = paymentCompanyDefaultsAvailable[method.code];
        if (hasCompanyDefault) {
          return false;
        }
        return true;
      }
    }
    return true;
  });

  const mappingLabelByKey = useMemo(() => {
    const map = new Map<OutletAccountMappingKey, string>();
    mappingGroups.forEach((group) => {
      group.keys.forEach((entry) => {
        map.set(entry.key, entry.label);
      });
    });
    return map;
  }, []);

  const missingKeys = requiredSalesMappingKeys.filter((key) => {
    const value = formState[key];
    const isBlank = value === "" || value === 0 || value === undefined || value === null;
    if (!isBlank) {
      return false;
    }
    if (scope === "outlet") {
      const source = sourceState[key];
      if (source === "company") {
        return false;
      }
      if (source === "outlet") {
        const hasCompanyDefault = companyDefaultsAvailable[key];
        if (hasCompanyDefault) {
          return false;
        }
        return true;
      }
    }
    return true;
  });
  const missingKeyLabels = missingKeys.map((key) => mappingLabelByKey.get(key) ?? key);

  const isCompanyScope = scope === "company";
  const effectiveOutletId = isCompanyScope ? null : outletId;
  const accountDataLoading = loading || paymentLoading;
  const canSaveSales = (isCompanyScope || (effectiveOutletId && effectiveOutletId > 0)) && !accountDataLoading && !saving;
  const canSavePayments = (isCompanyScope || (effectiveOutletId && effectiveOutletId > 0)) && !accountDataLoading && !paymentSaving;

  const scopeSelectorValue = isCompanyScope ? "company" : `outlet:${outletId}`;

  function handleScopeChange(value: string) {
    if (value === "company") {
      setScope("company");
      setOutletId(user.outlets[0]?.id ?? 0);
    } else if (value.startsWith("outlet:")) {
      const outletId = Number(value.replace("outlet:", ""));
      setScope("outlet");
      setOutletId(outletId);
    }
    setFormState(buildDefaultMappings());
    setSourceState({} as Record<AnyMappingKey, "outlet" | "company" | null>);
    setPaymentFormState({});
    setPaymentLabelState({});
    setPaymentSourceState({});
    setDraftMethods([]);
    setDraftMethodCode("");
    setDraftMethodLabel("");
    setSubmitError(null);
    setPaymentSubmitError(null);
  }

  async function handleReload() {
    setReloadError(null);
    try {
      await Promise.all([refetch(), refetchPayment()]);
    } catch {
      setReloadError("Failed to reload data. Please try again.");
    }
  }

  useEffect(() => {
    setDraftMethods([]);
    setDraftMethodCode("");
    setDraftMethodLabel("");
    setPaymentSubmitError(null);
    setPaymentLabelState({});
  }, [scope, outletId]);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to Manage Settings"
        message="Account mapping changes require a connection."
      />
    );
  }

  async function handleSave() {
    setSubmitError(null);
    if (scope === "outlet" && outletId <= 0) {
      setSubmitError("Please select an outlet.");
      return;
    }
    if (accountDataLoading) {
      setSubmitError("Please wait for data to load.");
      return;
    }
    if (missingKeys.length > 0) {
      setSubmitError("Please select an account for every sales mapping.");
      return;
    }

    setSaving(true);
    try {
      const payload = persistedMappingKeys.map((key) => ({
        mapping_key: key,
        account_id: formState[key]
      }));
      await save(payload);
      await refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Failed to save sales mappings");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handlePaymentSave() {
    setPaymentSubmitError(null);
    if (scope === "outlet" && outletId <= 0) {
      setPaymentSubmitError("Please select an outlet.");
      return;
    }
    if (accountDataLoading) {
      setPaymentSubmitError("Please wait for data to load.");
      return;
    }
    if (missingPaymentMethods.length > 0) {
      setPaymentSubmitError("Please select an account for every payment method.");
      return;
    }

    setPaymentSaving(true);
    try {
      const payload = effectivePaymentMethods.map((method) => {
        const accountId = paymentFormState[method.code];

        return {
          method_code: method.code,
          account_id: accountId,
          label: paymentLabelState[method.code]?.trim() || undefined,
          is_invoice_default: false
        };
      });
      await savePayment(payload);
      await refetchPayment();
      setDraftMethods([]);
      setDraftMethodCode("");
      setDraftMethodLabel("");
    } catch (err) {
      if (err instanceof ApiError) {
        setPaymentSubmitError(err.message);
      } else {
        setPaymentSubmitError("Failed to save payment method mappings");
      }
    } finally {
      setPaymentSaving(false);
    }
  }

  function handleAddPaymentMethod() {
    const normalizedCode = draftMethodCode.trim().toUpperCase();
    const normalizedLabel = draftMethodLabel.trim() || normalizedCode;
    if (!normalizedCode) {
      setPaymentSubmitError("Payment method code is required.");
      return;
    }
    if (!/^[A-Z0-9_]+$/.test(normalizedCode)) {
      setPaymentSubmitError("Payment method code must use A-Z, 0-9, or underscore.");
      return;
    }
    const exists = effectivePaymentMethods.some((method) => method.code === normalizedCode);
    if (exists) {
      setPaymentSubmitError("Payment method code already exists.");
      return;
    }
    setDraftMethods((prev) => [...prev, { code: normalizedCode, label: normalizedLabel }]);
    setPaymentFormState((prev) => ({ ...prev, [normalizedCode]: "" }));
    setPaymentLabelState((prev) => ({ ...prev, [normalizedCode]: normalizedLabel }));
    setDraftMethodCode("");
    setDraftMethodLabel("");
    setPaymentSubmitError(null);
  }

  function renderMappingRow(entry: { key: AnyMappingKey; label: string }) {
    const source = sourceState[entry.key];
    
    return (
      <Table.Tr key={entry.key}>
        <Table.Td>
          <Group gap="xs">
            {entry.label}
            {scope === "outlet" && source && (
              <Badge 
                size="xs" 
                color={source === "outlet" ? "blue" : "gray"}
                variant="light"
              >
                {source === "outlet" ? "Outlet" : "Company"}
              </Badge>
            )}
          </Group>
        </Table.Td>
        <Table.Td>
          <Select
            value={String(formState[entry.key] ?? "")}
            onChange={(value) =>
              setFormState((prev) => ({
                ...prev,
                [entry.key]: value ? Number(value) : ""
              }))
            }
            placeholder={scope === "outlet" && source === "company" ? "Inherited from company" : "Select account"}
            data={accountOptions.map((account) => ({
              value: String(account.id),
              label: account.label
            }))}
            clearable
            allowDeselect={scope === "outlet"}
            styles={{
              input: { minHeight: "36px" }
            }}
          />
        </Table.Td>
      </Table.Tr>
    );
  }

  return (
    <Container size="lg" py="md">
      <Stack gap="md">
        <div>
          <Title order={1}>Account Mapping Settings</Title>
          <Text c="dimmed" size="sm">
            Configure default accounts for Sales and POS posting. Set company-wide defaults or override per outlet.
          </Text>
        </div>

        <Card withBorder>
          <Group justify="space-between" wrap="wrap" align="flex-end">
            <Stack gap="xs">
              <Select
                label="Scope"
                value={scopeSelectorValue}
                onChange={(value) => value && handleScopeChange(value)}
                data={[
                  { value: "company", label: "Company Default" },
                  ...user.outlets.map((outlet) => ({
                    value: `outlet:${String(outlet.id)}`,
                    label: `${outlet.code} - ${outlet.name}`
                  }))
                ]}
                style={{ minWidth: 200 }}
              />
            </Stack>
            <Button
              variant="light"
              onClick={handleReload}
              loading={loading || paymentLoading}
            >
              {loading || paymentLoading ? "Loading..." : "Reload"}
            </Button>
          </Group>
          {error && (
            <Alert color="red" mt="sm">
              {error}
            </Alert>
          )}
          {paymentError && (
            <Alert color="red" mt="sm">
              {paymentError}
            </Alert>
          )}
          {reloadError && (
            <Alert color="red" mt="sm">
              {reloadError}
            </Alert>
          )}
        </Card>

        <Tabs value={activeTab} onChange={(value) => setActiveTab(value as "invoice" | "pos")}>
          <Tabs.List>
            <Tabs.Tab value="invoice">Invoice</Tabs.Tab>
            <Tabs.Tab value="pos">POS</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="invoice" pt="md">
            <Stack gap="md">
              {mappingGroups.map((group) => (
                <Card key={group.title} withBorder>
                  <Stack gap="sm">
                    <div>
                      <Title order={3}>{group.title}</Title>
                      <Text c="dimmed" size="sm">
                        {scope === "outlet" 
                          ? "Override company defaults for this outlet. Leave blank to inherit company settings."
                          : group.description}
                      </Text>
                    </div>
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Mapping</Table.Th>
                          <Table.Th>Account</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {group.keys.map((entry) => renderMappingRow(entry))}
                      </Table.Tbody>
                    </Table>
                  </Stack>
                </Card>
              ))}

              {scope === "company" && companyOnlyMappingGroups.map((group) => (
                <Card key={group.title} withBorder>
                  <Stack gap="sm">
                    <div>
                      <Title order={3}>{group.title}</Title>
                      <Text c="dimmed" size="sm">
                        {group.description}
                      </Text>
                    </div>
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Mapping</Table.Th>
                          <Table.Th>Account</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {group.keys.map((entry) => renderMappingRow(entry))}
                      </Table.Tbody>
                    </Table>
                  </Stack>
                </Card>
              ))}

              <Card withBorder>
                <Stack gap="sm">
                  <div>
                    <Title order={3}>Invoice Payment Defaults</Title>
                    <Text c="dimmed" size="sm">
                      Default bank account for invoice payments in backoffice. This is used when creating sales payments.
                    </Text>
                    {scope === "outlet" && (
                      <Text c="dimmed" size="xs" mt="xs">
                        Override company default for this outlet. Leave blank to inherit company settings.
                      </Text>
                    )}
                  </div>
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Setting</Table.Th>
                        <Table.Th>Account</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      <Table.Tr>
                        <Table.Td>
                          <Group gap="xs">
                            Default Payment Bank Account
                            {scope === "outlet" && sourceState["INVOICE_PAYMENT_BANK"] && (
                              <Badge 
                                size="xs" 
                                color={sourceState["INVOICE_PAYMENT_BANK"] === "outlet" ? "blue" : "gray"}
                                variant="light"
                              >
                                {sourceState["INVOICE_PAYMENT_BANK"] === "outlet" ? "Outlet" : "Company"}
                              </Badge>
                            )}
                          </Group>
                        </Table.Td>
                        <Table.Td>
                          <Select
                            value={String(formState["INVOICE_PAYMENT_BANK"] ?? "")}
                            onChange={(value) =>
                              setFormState((prev) => ({
                                ...prev,
                                ["INVOICE_PAYMENT_BANK"]: value ? Number(value) : ""
                              }))
                            }
                            placeholder={scope === "outlet" && sourceState["INVOICE_PAYMENT_BANK"] === "company" ? "Inherited from company" : "Select account"}
                            data={paymentAccountOptions.map((account) => ({
                              value: String(account.id),
                              label: account.label
                            }))}
                            clearable
                            allowDeselect={scope === "outlet"}
                            styles={{
                              input: { minHeight: "36px" }
                            }}
                          />
                        </Table.Td>
                      </Table.Tr>
                    </Table.Tbody>
                  </Table>
                </Stack>
              </Card>

              {submitError && (
                <Alert color="red">
                  {submitError}
                </Alert>
              )}
              {missingKeys.length > 0 && (
                <Alert color="orange">
                  Missing sales mappings: {missingKeyLabels.join(", ")}
                </Alert>
              )}
              <Button
                onClick={handleSave}
                disabled={!canSaveSales}
                loading={saving}
              >
                {scope === "company" ? "Save Company Defaults" : "Save Outlet Overrides"}
              </Button>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="pos" pt="md">
            <Card withBorder data-testid="payment-methods-section">
              <Stack gap="sm">
                <div>
                  <Title order={3}>POS Payment Methods</Title>
                  <Text c="dimmed" size="sm">
                    Map each POS payment method to a cash/bank account. Cashiers will manually select payment methods at POS.
                  </Text>
                  {scope === "outlet" && (
                    <Text c="dimmed" size="xs" mt="xs">
                      Override company defaults for this outlet. Leave blank to inherit company settings.
                    </Text>
                  )}
                </div>

                <Group>
                  <TextInput
                    label="Method code"
                    placeholder="Method code (e.g., CARD_BCA)"
                    value={draftMethodCode}
                    onChange={(event) => setDraftMethodCode(event.currentTarget.value)}
                    style={{ flex: "1 1 220px" }}
                  />
                  <TextInput
                    label="Label (optional)"
                    placeholder="Label (optional)"
                    value={draftMethodLabel}
                    onChange={(event) => setDraftMethodLabel(event.currentTarget.value)}
                    style={{ flex: "1 1 220px" }}
                  />
                  <Button variant="light" onClick={handleAddPaymentMethod} mt="lg">
                    Add Method
                  </Button>
                </Group>

                {effectivePaymentMethods.length === 0 ? (
                  <Text c="dimmed" ta="center" py="md">
                    No payment methods configured.
                  </Text>
                ) : (
                  <Table data-testid="payment-methods-table">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Method Code</Table.Th>
                        <Table.Th>Label</Table.Th>
                        <Table.Th>Account</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {effectivePaymentMethods.map((method) => {
                        const source = paymentSourceState[method.code];
                        return (
                          <Table.Tr key={method.code} data-testid={`payment-method-${method.code}`}>
                            <Table.Td>
                              <Group gap="xs">
                                {method.code}
                                {scope === "outlet" && source && (
                                  <Badge 
                                    size="xs" 
                                    color={source === "outlet" ? "blue" : "gray"}
                                    variant="light"
                                  >
                                    {source === "outlet" ? "Outlet" : "Company"}
                                  </Badge>
                                )}
                              </Group>
                            </Table.Td>
                            <Table.Td>
                              <TextInput
                                value={paymentLabelState[method.code] ?? method.label}
                                onChange={(event) =>
                                  setPaymentLabelState((prev) => ({
                                    ...prev,
                                    [method.code]: event.currentTarget.value
                                  }))
                                }
                                styles={{
                                  input: { minHeight: "36px" }
                                }}
                              />
                            </Table.Td>
                            <Table.Td>
                              <Select
                                value={String(paymentFormState[method.code] ?? "")}
                                onChange={(value) =>
                                  setPaymentFormState((prev) => ({
                                    ...prev,
                                    [method.code]: value ? Number(value) : ""
                                  }))
                                }
                                placeholder={scope === "outlet" && source === "company" ? "Inherited from company" : "Select account"}
                                data={paymentAccountOptions.map((account) => ({
                                  value: String(account.id),
                                  label: account.label
                                }))}
                                clearable
                                allowDeselect={scope === "outlet"}
                                styles={{
                                  input: { minHeight: "36px" }
                                }}
                              />
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                )}

                {paymentSubmitError && (
                  <Alert color="red" data-testid="payment-mappings-error">
                    {paymentSubmitError}
                  </Alert>
                )}
                {missingPaymentMethods.length > 0 && (
                  <Alert color="orange">
                    Missing payment mappings: {missingPaymentMethods.map((method) => method.label).join(", ")}
                  </Alert>
                )}
                <Button
                  onClick={handlePaymentSave}
                  disabled={!canSavePayments}
                  loading={paymentSaving}
                  data-testid="save-payment-mappings"
                >
                  {scope === "company" ? "Save Company Defaults" : "Save Outlet Overrides"}
                </Button>
              </Stack>
            </Card>
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Container>
  );
}
