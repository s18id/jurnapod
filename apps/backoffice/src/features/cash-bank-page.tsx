// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Grid,
  Group,
  NumberInput,
  Paper,
  Select,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import type { SessionUser } from "../lib/session";
import { ApiError, apiRequest } from "../lib/api-client";
import { useAccounts } from "../hooks/use-accounts";

type CashBankType = "MUTATION" | "TOP_UP" | "WITHDRAWAL" | "FOREX";
type CashBankStatus = "DRAFT" | "POSTED" | "VOID";

type CashBankTransaction = {
  id: number;
  transaction_type: CashBankType;
  transaction_date: string;
  reference: string | null;
  description: string;
  source_account_id: number;
  source_account_name?: string;
  destination_account_id: number;
  destination_account_name?: string;
  amount: number;
  currency_code: string;
  exchange_rate: number | null;
  base_amount: number | null;
  fx_gain_loss: number | null;
  status: CashBankStatus;
};

type ListResponse = {
  success: true;
  data: {
    total: number;
    transactions: CashBankTransaction[];
  };
};

type CashBankPageProps = {
  user: SessionUser;
  accessToken: string;
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function statusColor(status: CashBankStatus): string {
  if (status === "POSTED") return "green";
  if (status === "VOID") return "gray";
  return "yellow";
}

function isCashBankTypeName(typeName: string | null): boolean {
  const value = (typeName ?? "").toLowerCase();
  return value.includes("kas") || value.includes("cash") || value.includes("bank");
}

export function CashBankPage(props: CashBankPageProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CashBankTransaction[]>([]);
  const [statusFilter, setStatusFilter] = useState<"ALL" | CashBankStatus>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | CashBankType>("ALL");

  const [transactionType, setTransactionType] = useState<CashBankType>("MUTATION");
  const [transactionDate, setTransactionDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [sourceAccountId, setSourceAccountId] = useState<string | null>(null);
  const [destinationAccountId, setDestinationAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [currencyCode, setCurrencyCode] = useState<string>("IDR");
  const [exchangeRate, setExchangeRate] = useState<number | "">("");
  const [baseAmount, setBaseAmount] = useState<number | "">("");
  const [fxAccountId, setFxAccountId] = useState<string | null>(null);

  const accountsQuery = useAccounts(props.user.company_id, props.accessToken, {
    is_active: true
  });

  const cashBankAccounts = useMemo(
    () => accountsQuery.data.filter((account) => isCashBankTypeName(account.type_name)),
    [accountsQuery.data]
  );

  const accountOptions = useMemo(
    () =>
      cashBankAccounts.map((account) => ({
        value: String(account.id),
        label: `${account.code} - ${account.name}`
      })),
    [cashBankAccounts]
  );

  const forexPreviewBaseAmount =
    typeof baseAmount === "number"
      ? baseAmount
      : typeof exchangeRate === "number" && amount > 0
        ? Number((amount * exchangeRate).toFixed(2))
        : 0;
  const forexPreviewDiff = Number((forexPreviewBaseAmount - amount).toFixed(2));

  async function loadTransactions() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }
      if (typeFilter !== "ALL") {
        params.set("transaction_type", typeFilter);
      }
      const response = await apiRequest<ListResponse>(
        `/cash-bank-transactions?${params.toString()}`,
        {},
        props.accessToken
      );
      setItems(response.data.transactions);
    } catch (loadError) {
      if (loadError instanceof ApiError) {
        setError(loadError.message);
      } else {
        setError("Failed to load cash/bank transactions");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTransactions().catch(() => undefined);
  }, [statusFilter, typeFilter]);

  async function createDraft() {
    if (!sourceAccountId || !destinationAccountId) {
      setError("Source and destination account are required");
      return;
    }
    if (!description.trim()) {
      setError("Description is required");
      return;
    }
    if (amount <= 0) {
      setError("Amount must be positive");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        transaction_type: transactionType,
        transaction_date: transactionDate,
        reference: reference.trim() || undefined,
        description: description.trim(),
        source_account_id: Number(sourceAccountId),
        destination_account_id: Number(destinationAccountId),
        amount,
        currency_code: currencyCode.toUpperCase()
      };

      if (transactionType === "FOREX") {
        payload.exchange_rate = typeof exchangeRate === "number" ? exchangeRate : undefined;
        payload.base_amount = typeof baseAmount === "number" ? baseAmount : undefined;
        payload.fx_account_id = fxAccountId ? Number(fxAccountId) : undefined;
      }

      await apiRequest(
        "/cash-bank-transactions",
        { method: "POST", body: JSON.stringify(payload) },
        props.accessToken
      );

      setReference("");
      setDescription("");
      setAmount(0);
      setExchangeRate("");
      setBaseAmount("");
      setFxAccountId(null);

      await loadTransactions();
    } catch (createError) {
      if (createError instanceof ApiError) {
        setError(createError.message);
      } else {
        setError("Failed to create draft transaction");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function postById(id: number) {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/cash-bank-transactions/${id}/post`, { method: "POST" }, props.accessToken);
      await loadTransactions();
    } catch (postError) {
      setError(postError instanceof ApiError ? postError.message : "Failed to post transaction");
    } finally {
      setSubmitting(false);
    }
  }

  async function voidById(id: number) {
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/cash-bank-transactions/${id}/void`, { method: "POST" }, props.accessToken);
      await loadTransactions();
    } catch (voidError) {
      setError(voidError instanceof ApiError ? voidError.message : "Failed to void transaction");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack gap="md">
      <Title order={2}>Cash &amp; Bank</Title>
      {error ? <Alert color="red">{error}</Alert> : null}

      <Paper p="md" withBorder>
        <Stack gap="sm">
          <SegmentedControl
            value={transactionType}
            onChange={(value) => setTransactionType(value as CashBankType)}
            data={[
              { label: "Mutation", value: "MUTATION" },
              { label: "Top Up", value: "TOP_UP" },
              { label: "Withdrawal", value: "WITHDRAWAL" },
              { label: "FOREX", value: "FOREX" }
            ]}
          />

          <Grid>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <TextInput
                label="Date"
                type="date"
                value={transactionDate}
                onChange={(event) => setTransactionDate(event.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <TextInput
                label="Reference"
                placeholder="Optional"
                value={reference}
                onChange={(event) => setReference(event.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <TextInput
                label="Description"
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Select
                label="Source Account"
                data={accountOptions}
                searchable
                value={sourceAccountId}
                onChange={setSourceAccountId}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Select
                label="Destination Account"
                data={accountOptions}
                searchable
                value={destinationAccountId}
                onChange={setDestinationAccountId}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <NumberInput
                label="Amount"
                value={amount}
                onChange={(value) => setAmount(Number(value ?? 0))}
                min={0}
                decimalScale={2}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 3 }}>
              <TextInput
                label="Currency"
                value={currencyCode}
                onChange={(event) => setCurrencyCode(event.currentTarget.value.toUpperCase())}
                maxLength={3}
              />
            </Grid.Col>
          </Grid>

          {transactionType === "FOREX" ? (
            <Paper p="sm" withBorder>
              <Stack gap="sm">
                <Text fw={600}>FOREX</Text>
                <Grid>
                  <Grid.Col span={{ base: 12, md: 4 }}>
                    <NumberInput
                      label="Exchange Rate"
                      value={exchangeRate}
                      onChange={(value) => setExchangeRate(typeof value === "number" ? value : "")}
                      min={0}
                      decimalScale={8}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 4 }}>
                    <NumberInput
                      label="Base Amount"
                      value={baseAmount}
                      onChange={(value) => setBaseAmount(typeof value === "number" ? value : "")}
                      min={0}
                      decimalScale={2}
                    />
                  </Grid.Col>
                  <Grid.Col span={{ base: 12, md: 4 }}>
                    <Select
                      label="FX Gain/Loss Account"
                      data={accountOptions}
                      searchable
                      value={fxAccountId}
                      onChange={setFxAccountId}
                    />
                  </Grid.Col>
                </Grid>
                <Alert color={forexPreviewDiff > 0 ? "green" : forexPreviewDiff < 0 ? "red" : "blue"}>
                  Base amount preview: {formatMoney(forexPreviewBaseAmount)} | Gain/Loss preview: {formatMoney(forexPreviewDiff)}
                </Alert>
              </Stack>
            </Paper>
          ) : null}

          <Group justify="flex-end">
            <Button onClick={createDraft} loading={submitting}>
              Create Draft
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between" align="flex-end">
            <Title order={4}>Recent Transactions</Title>
            <Group>
              <Select
                label="Type"
                value={typeFilter}
                onChange={(value) => setTypeFilter((value as "ALL" | CashBankType) ?? "ALL")}
                data={[
                  { value: "ALL", label: "All" },
                  { value: "MUTATION", label: "Mutation" },
                  { value: "TOP_UP", label: "Top Up" },
                  { value: "WITHDRAWAL", label: "Withdrawal" },
                  { value: "FOREX", label: "FOREX" }
                ]}
              />
              <Select
                label="Status"
                value={statusFilter}
                onChange={(value) => setStatusFilter((value as "ALL" | CashBankStatus) ?? "ALL")}
                data={[
                  { value: "ALL", label: "All" },
                  { value: "DRAFT", label: "Draft" },
                  { value: "POSTED", label: "Posted" },
                  { value: "VOID", label: "Void" }
                ]}
              />
            </Group>
          </Group>

          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Description</Table.Th>
                <Table.Th>Source</Table.Th>
                <Table.Th>Destination</Table.Th>
                <Table.Th>Amount</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {loading ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>Loading...</Table.Td>
                </Table.Tr>
              ) : items.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>No transactions</Table.Td>
                </Table.Tr>
              ) : (
                items.map((tx) => (
                  <Table.Tr key={tx.id}>
                    <Table.Td>{tx.transaction_date}</Table.Td>
                    <Table.Td>{tx.transaction_type}</Table.Td>
                    <Table.Td>
                      <Text size="sm">{tx.description}</Text>
                      {tx.reference ? <Text size="xs" c="dimmed">Ref: {tx.reference}</Text> : null}
                    </Table.Td>
                    <Table.Td>{tx.source_account_name ?? `#${tx.source_account_id}`}</Table.Td>
                    <Table.Td>{tx.destination_account_name ?? `#${tx.destination_account_id}`}</Table.Td>
                    <Table.Td>{formatMoney(tx.amount)}</Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(tx.status)}>{tx.status}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant="light"
                          disabled={tx.status !== "DRAFT" || submitting}
                          onClick={() => postById(tx.id)}
                        >
                          Post
                        </Button>
                        <Button
                          size="xs"
                          color="gray"
                          variant="light"
                          disabled={tx.status !== "POSTED" || submitting}
                          onClick={() => voidById(tx.id)}
                        >
                          Void
                        </Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))
              )}
            </Table.Tbody>
          </Table>
        </Stack>
      </Paper>
    </Stack>
  );
}
