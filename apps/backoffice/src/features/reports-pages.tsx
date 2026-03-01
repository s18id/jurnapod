// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Group,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title
} from "@mantine/core";
import type { ColumnDef } from "@tanstack/react-table";
import { apiRequest, ApiError } from "../lib/api-client";
import type { SessionUser } from "../lib/session";
import { useOnlineStatus } from "../lib/connection";
import { DataTable } from "../components/DataTable";
import { FilterBar } from "../components/FilterBar";
import { OfflinePage } from "../components/offline-page";
import { PageCard } from "../components/PageCard";
import { StatTiles } from "../components/StatTiles";
import { useAccounts, useAccountTypes } from "../hooks/use-accounts";

type ReportsProps = {
  user: SessionUser;
  accessToken: string;
};

type PosTransaction = {
  id: number;
  outlet_id: number;
  client_tx_id: string;
  status: string;
  trx_at: string;
  gross_total: number;
  paid_total: number;
  item_count: number;
};

type PosTransactionsResponse = {
  ok: true;
  total: number;
  transactions: PosTransaction[];
};

type DailySalesRow = {
  trx_date: string;
  outlet_id: number;
  outlet_name: string | null;
  tx_count: number;
  gross_total: number;
  paid_total: number;
};

type DailySalesResponse = {
  ok: true;
  rows: DailySalesRow[];
};

type PosPaymentRow = {
  outlet_id: number;
  outlet_name: string | null;
  method: "CASH" | "QRIS" | "CARD" | string;
  payment_count: number;
  total_amount: number;
};

type PosPaymentsResponse = {
  ok: true;
  rows: PosPaymentRow[];
};

type JournalRow = {
  id: number;
  outlet_id: number | null;
  outlet_name: string | null;
  doc_type: string;
  doc_id: number;
  posted_at: string;
  total_debit: number;
  total_credit: number;
  line_count: number;
};

type JournalResponse = {
  ok: true;
  total: number;
  journals: JournalRow[];
};

type TrialBalanceRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  total_debit: number;
  total_credit: number;
  balance: number;
};

type TrialBalanceResponse = {
  ok: true;
  totals: {
    total_debit: number;
    total_credit: number;
    balance: number;
  };
  rows: TrialBalanceRow[];
};

type GeneralLedgerLine = {
  line_id: number;
  line_date: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  outlet_id: number | null;
  outlet_name: string | null;
  journal_batch_id: number;
  doc_type: string;
  doc_id: number;
  posted_at: string;
};

type GeneralLedgerRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  report_group: string | null;
  normal_balance: string | null;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  opening_balance: number;
  ending_balance: number;
  lines: GeneralLedgerLine[];
};

type GeneralLedgerResponse = {
  ok: true;
  filters: {
    outlet_ids: number[];
    account_id: number | null;
    date_from: string;
    date_to: string;
    round: number;
    line_limit: number | null;
    line_offset: number | null;
  };
  rows: GeneralLedgerRow[];
};

type WorksheetRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  type_name: string | null;
  report_group: string | null;
  normal_balance: string | null;
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  ending_debit: number;
  ending_credit: number;
  pl_debit: number;
  pl_credit: number;
  bs_debit: number;
  bs_credit: number;
};

type WorksheetResponse = {
  ok: true;
  filters: {
    outlet_ids: number[];
    date_from: string;
    date_to: string;
    round: number;
  };
  summary: {
    opening_debit: number;
    opening_credit: number;
    period_debit: number;
    period_credit: number;
    ending_debit: number;
    ending_credit: number;
    total_debit: number;
    total_credit: number;
    balance: number;
    bs_debit: number;
    bs_credit: number;
    pl_debit: number;
    pl_credit: number;
  };
  rows: WorksheetRow[];
};

type ProfitLossRow = {
  account_id: number;
  account_code: string;
  account_name: string;
  total_debit: number;
  total_credit: number;
  net: number;
};

type ProfitLossResponse = {
  ok: true;
  filters: {
    outlet_ids: number[];
    date_from: string;
    date_to: string;
    round: number;
  };
  totals: {
    total_debit: number;
    total_credit: number;
    net: number;
  };
  rows: ProfitLossRow[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfYearIso(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return start.toISOString().slice(0, 10);
}

function beforeDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

const monthNames = [
  "JANUARI",
  "FEBRUARI",
  "MARET",
  "APRIL",
  "MEI",
  "JUNI",
  "JULI",
  "AGUSTUS",
  "SEPTEMBER",
  "OKTOBER",
  "NOVEMBER",
  "DESEMBER"
];

function formatPeriod(dateFrom: string, dateTo: string): string {
  const from = new Date(`${dateFrom}T00:00:00`);
  const to = new Date(`${dateTo}T00:00:00`);
  const fromMonth = monthNames[from.getMonth()] ?? "";
  const toMonth = monthNames[to.getMonth()] ?? "";
  const fromYear = from.getFullYear();
  const toYear = to.getFullYear();
  if (fromYear === toYear) {
    return `PERIODE ${fromMonth} - ${toMonth} ${fromYear}`;
  }
  return `PERIODE ${fromMonth} ${fromYear} - ${toMonth} ${toYear}`;
}

const moneyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatMoneyDisplay(value: number): string {
  return moneyFormatter.format(value);
}

function buildOutletOptions(outlets: SessionUser["outlets"], includeAll = false) {
  const items = outlets.map((outlet) => ({
    value: String(outlet.id),
    label: `${outlet.code} - ${outlet.name}`
  }));
  if (!includeAll) {
    return items;
  }
  return [{ value: "0", label: "All Outlets" }, ...items];
}

function renderStatusBadge(status: string) {
  const normalized = status.toUpperCase();
  const color =
    normalized === "COMPLETED"
      ? "green"
      : normalized === "VOID"
        ? "red"
        : normalized === "REFUND"
          ? "orange"
          : "gray";

  return (
    <Badge color={color} variant="light" size="sm">
      {status}
    </Badge>
  );
}

export function PosTransactionsPage(props: ReportsProps) {
  const isOnline = useOnlineStatus();
  const [outletId, setOutletId] = useState<number>(props.user.outlets[0]?.id ?? 0);
  const [dateFrom, setDateFrom] = useState<string>(beforeDaysIso(7));
  const [dateTo, setDateTo] = useState<string>(todayIso());
  const [rows, setRows] = useState<PosTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<PosTransaction>[]>(
    () => [
      {
        header: "TX ID",
        accessorKey: "client_tx_id"
      },
      {
        header: "Status",
        accessorKey: "status",
        cell: ({ getValue }) => renderStatusBadge(String(getValue()))
      },
      {
        header: "Date",
        accessorKey: "trx_at",
        cell: ({ getValue }) => new Date(String(getValue())).toLocaleString()
      },
      {
        header: "Items",
        accessorKey: "item_count",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {Number(getValue())}
          </Text>
        )
      },
      {
        header: "Gross",
        accessorKey: "gross_total",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {formatMoneyDisplay(Number(getValue()))}
          </Text>
        )
      },
      {
        header: "Paid",
        accessorKey: "paid_total",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {formatMoneyDisplay(Number(getValue()))}
          </Text>
        )
      }
    ],
    []
  );

  async function loadRows() {
    setError(null);
    try {
      const response = await apiRequest<PosTransactionsResponse>(
        `/reports/pos-transactions?outlet_id=${outletId}&date_from=${dateFrom}&date_to=${dateTo}`,
        {},
        props.accessToken
      );
      setRows(response.transactions);
      setTotal(response.total);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load POS transactions");
      }
    }
  }

  useEffect(() => {
    if (outletId > 0) {
      loadRows().catch(() => undefined);
    }
  }, [outletId, dateFrom, dateTo]);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to View Reports"
        message="Reports require real-time data. Please connect to the internet."
      />
    );
  }

  return (
    <PageCard title="POS Transactions" description="View POS transactions by outlet and date range.">
      <Stack gap="sm">
        <FilterBar>
          <Select
            label="Outlet"
            data={buildOutletOptions(props.user.outlets)}
            value={String(outletId)}
            onChange={(value) => setOutletId(Number(value))}
          />
          <TextInput
            label="From"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
          <TextInput
            label="To"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
          <Button onClick={() => loadRows()}>Refresh</Button>
        </FilterBar>

        {error ? (
          <Text c="red" size="sm">
            {error}
          </Text>
        ) : null}

        <Text size="sm" c="dimmed">
          Total rows: {total}
        </Text>

        <DataTable columns={columns} data={rows} minWidth={720} stickyHeader />
      </Stack>
    </PageCard>
  );
}

export function DailySalesPage(props: ReportsProps) {
  const isOnline = useOnlineStatus();
  const [outletId, setOutletId] = useState<number>(props.user.outlets[0]?.id ?? 0);
  const [dateFrom, setDateFrom] = useState<string>(beforeDaysIso(7));
  const [dateTo, setDateTo] = useState<string>(todayIso());
  const [rows, setRows] = useState<DailySalesRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<DailySalesRow>[]>(
    () => [
      {
        header: "Date",
        accessorKey: "trx_date"
      },
      {
        header: "Outlet",
        accessorKey: "outlet_name",
        cell: ({ row }) => row.original.outlet_name ?? `#${row.original.outlet_id}`
      },
      {
        header: "Transactions",
        accessorKey: "tx_count",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {Number(getValue())}
          </Text>
        )
      },
      {
        header: "Gross",
        accessorKey: "gross_total",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {formatMoneyDisplay(Number(getValue()))}
          </Text>
        )
      },
      {
        header: "Paid",
        accessorKey: "paid_total",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {formatMoneyDisplay(Number(getValue()))}
          </Text>
        )
      }
    ],
    []
  );

  async function loadRows() {
    setError(null);
    try {
      const response = await apiRequest<DailySalesResponse>(
        `/reports/daily-sales?outlet_id=${outletId}&date_from=${dateFrom}&date_to=${dateTo}`,
        {},
        props.accessToken
      );
      setRows(response.rows);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load daily sales");
      }
    }
  }

  useEffect(() => {
    if (outletId > 0) {
      loadRows().catch(() => undefined);
    }
  }, [outletId, dateFrom, dateTo]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          tx_count: acc.tx_count + row.tx_count,
          gross_total: acc.gross_total + row.gross_total,
          paid_total: acc.paid_total + row.paid_total
        }),
        { tx_count: 0, gross_total: 0, paid_total: 0 }
      ),
    [rows]
  );

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to View Reports"
        message="Reports require real-time data. Please connect to the internet."
      />
    );
  }

  return (
    <PageCard title="Daily Sales Summary" description="Daily performance by outlet.">
      <Stack gap="sm">
        <FilterBar>
          <Select
            label="Outlet"
            data={buildOutletOptions(props.user.outlets)}
            value={String(outletId)}
            onChange={(value) => setOutletId(Number(value))}
          />
          <TextInput
            label="From"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
          <TextInput
            label="To"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
          <Button onClick={() => loadRows()}>Refresh</Button>
        </FilterBar>

        {error ? (
          <Text c="red" size="sm">
            {error}
          </Text>
        ) : null}

        <StatTiles
          items={[
            { label: "Transactions", value: totals.tx_count },
            { label: "Gross", value: formatMoneyDisplay(totals.gross_total) },
            { label: "Paid", value: formatMoneyDisplay(totals.paid_total) }
          ]}
        />

        <DataTable columns={columns} data={rows} minWidth={680} stickyHeader />
      </Stack>
    </PageCard>
  );
}

export function GeneralLedgerPage(props: ReportsProps) {
  const isOnline = useOnlineStatus();
  const [outletId, setOutletId] = useState<number>(props.user.outlets[0]?.id ?? 0);
  const [accountId, setAccountId] = useState<number>(0);
  const [dateFrom, setDateFrom] = useState<string>(beforeDaysIso(30));
  const [dateTo, setDateTo] = useState<string>(todayIso());
  const [lineLimit, setLineLimit] = useState<number>(50);
  const [lineOffset, setLineOffset] = useState<number>(0);
  const [rows, setRows] = useState<GeneralLedgerRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { data: accounts, loading: accountsLoading, error: accountsError } = useAccounts(
    props.user.company_id,
    props.accessToken
  );
  const activeAccounts = useMemo(() => accounts.filter((account) => account.is_active), [accounts]);
  const accountOptions = useMemo(
    () =>
      activeAccounts.map((account) => ({
        value: String(account.id),
        label: `${account.code} - ${account.name}`
      })),
    [activeAccounts]
  );
  const columns = useMemo<ColumnDef<GeneralLedgerLine>[]>(
    () => [
      { header: "Date", accessorKey: "line_date" },
      { header: "Description", accessorKey: "description" },
      {
        header: "Outlet",
        accessorKey: "outlet_name",
        cell: ({ row }) => row.original.outlet_name ?? "ALL"
      },
      {
        header: "Debit",
        accessorKey: "debit",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {formatMoneyDisplay(Number(getValue()))}
          </Text>
        )
      },
      {
        header: "Credit",
        accessorKey: "credit",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {formatMoneyDisplay(Number(getValue()))}
          </Text>
        )
      },
      {
        header: "Balance",
        accessorKey: "balance",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {formatMoneyDisplay(Number(getValue()))}
          </Text>
        )
      },
      {
        header: "Doc",
        accessorKey: "doc_id",
        cell: ({ row }) => `${row.original.doc_type} #${row.original.doc_id}`
      }
    ],
    []
  );

  async function loadRows() {
    if (!accountId) {
      setRows([]);
      setError("Select an account to load the ledger.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<GeneralLedgerResponse>(
        `/reports/general-ledger?outlet_id=${outletId}&account_id=${accountId}&date_from=${dateFrom}&date_to=${dateTo}&round=2&line_limit=${lineLimit}&line_offset=${lineOffset}`,
        {},
        props.accessToken
      );
      setRows(response.rows);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load general ledger");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLineOffset(0);
  }, [outletId, accountId, dateFrom, dateTo, lineLimit]);

  useEffect(() => {
    if (accountId > 0) {
      loadRows().catch(() => undefined);
    }
  }, [outletId, accountId, dateFrom, dateTo, lineLimit, lineOffset]);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to View Reports"
        message="Reports require real-time data. Please connect to the internet."
      />
    );
  }

  const row = rows[0];
  const canPageBack = lineOffset > 0;
  const canPageNext = row ? row.lines.length === lineLimit : false;

  return (
    <PageCard title="General Ledger" description="Account movements within a selected period.">
      <Stack gap="sm">
        <FilterBar>
          <Select
            label="Outlet"
            data={buildOutletOptions(props.user.outlets)}
            value={String(outletId)}
            onChange={(value) => setOutletId(Number(value))}
          />
          <Select
            label="Account"
            data={accountOptions}
            value={accountId ? String(accountId) : null}
            onChange={(value) => setAccountId(value ? Number(value) : 0)}
            placeholder="Select account"
            searchable
          />
          <TextInput
            label="From"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
          <TextInput
            label="To"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
          <Select
            label="Lines"
            data={[
              { value: "25", label: "25 lines" },
              { value: "50", label: "50 lines" },
              { value: "100", label: "100 lines" },
              { value: "200", label: "200 lines" }
            ]}
            value={String(lineLimit)}
            onChange={(value) => setLineLimit(Number(value))}
          />
          <Button onClick={() => loadRows()} loading={loading}>
            Refresh
          </Button>
        </FilterBar>

        {accountsLoading ? <Text size="sm">Loading accounts...</Text> : null}
        {accountsError ? (
          <Text c="red" size="sm">
            {accountsError}
          </Text>
        ) : null}
        {error ? (
          <Text c="red" size="sm">
            {error}
          </Text>
        ) : null}

        {row ? (
          <StatTiles
            items={[
              {
                label: "Account",
                value: `${row.account_code} - ${row.account_name}`
              },
              {
                label: "Opening Balance",
                value: formatMoneyDisplay(row.opening_balance),
                helper: `Debit ${formatMoneyDisplay(row.opening_debit)} | Credit ${formatMoneyDisplay(row.opening_credit)}`
              },
              {
                label: "Period Movement",
                value: `${formatMoneyDisplay(row.period_debit)} / ${formatMoneyDisplay(row.period_credit)}`,
                helper: "Debit / Credit"
              },
              {
                label: "Ending Balance",
                value: formatMoneyDisplay(row.ending_balance)
              }
            ]}
          />
        ) : (
          <Text c="dimmed" size="sm">
            Select an account to view its ledger lines.
          </Text>
        )}

        {row ? (
          <Group gap="sm" align="center" wrap="wrap">
            <Button
              variant="light"
              size="xs"
              onClick={() => setLineOffset(Math.max(0, lineOffset - lineLimit))}
              disabled={!canPageBack}
            >
              Prev
            </Button>
            <Button
              variant="light"
              size="xs"
              onClick={() => setLineOffset(lineOffset + lineLimit)}
              disabled={!canPageNext}
            >
              Next
            </Button>
            <Text size="xs" c="dimmed">
              Showing {lineOffset + 1}-{lineOffset + row.lines.length}
            </Text>
          </Group>
        ) : null}

        {row ? <DataTable columns={columns} data={row.lines} minWidth={900} stickyHeader /> : null}
      </Stack>
    </PageCard>
  );
}

export function PosPaymentsPage(props: ReportsProps) {
  const isOnline = useOnlineStatus();
  const [outletId, setOutletId] = useState<number>(props.user.outlets[0]?.id ?? 0);
  const [dateFrom, setDateFrom] = useState<string>(beforeDaysIso(7));
  const [dateTo, setDateTo] = useState<string>(todayIso());
  const [status, setStatus] = useState<string>("COMPLETED");
  const [rows, setRows] = useState<PosPaymentRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo<ColumnDef<PosPaymentRow>[]>(
    () => [
      {
        header: "Outlet",
        accessorKey: "outlet_name",
        cell: ({ row }) => row.original.outlet_name ?? `#${row.original.outlet_id}`
      },
      { header: "Method", accessorKey: "method" },
      {
        header: "Payment Count",
        accessorKey: "payment_count",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {Number(getValue())}
          </Text>
        )
      },
      {
        header: "Total Amount",
        accessorKey: "total_amount",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {formatMoneyDisplay(Number(getValue()))}
          </Text>
        )
      }
    ],
    []
  );

  async function loadRows() {
    setError(null);
    try {
      const response = await apiRequest<PosPaymentsResponse>(
        `/reports/pos-payments?outlet_id=${outletId}&date_from=${dateFrom}&date_to=${dateTo}&status=${status}`,
        {},
        props.accessToken
      );
      setRows(response.rows);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load POS payment summary");
      }
    }
  }

  useEffect(() => {
    if (outletId > 0) {
      loadRows().catch(() => undefined);
    }
  }, [outletId, dateFrom, dateTo, status]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          payment_count: acc.payment_count + row.payment_count,
          total_amount: acc.total_amount + row.total_amount
        }),
        { payment_count: 0, total_amount: 0 }
      ),
    [rows]
  );

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to View Reports"
        message="Reports require real-time data. Please connect to the internet."
      />
    );
  }

  return (
    <PageCard title="POS Payment Summary" description="Payment methods by outlet and date range.">
      <Stack gap="sm">
        <FilterBar>
          <Select
            label="Outlet"
            data={buildOutletOptions(props.user.outlets)}
            value={String(outletId)}
            onChange={(value) => setOutletId(Number(value))}
          />
          <TextInput
            label="From"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
          <TextInput
            label="To"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
          <Select
            label="Status"
            data={[
              { value: "COMPLETED", label: "COMPLETED" },
              { value: "VOID", label: "VOID" },
              { value: "REFUND", label: "REFUND" }
            ]}
            value={status}
            onChange={(value) => setStatus(value ?? "COMPLETED")}
          />
          <Button onClick={() => loadRows()}>Refresh</Button>
        </FilterBar>

        {error ? (
          <Text c="red" size="sm">
            {error}
          </Text>
        ) : null}

        <StatTiles
          items={[
            { label: "Payments", value: totals.payment_count },
            { label: "Total Amount", value: formatMoneyDisplay(totals.total_amount) }
          ]}
        />

        <DataTable columns={columns} data={rows} minWidth={640} stickyHeader />
      </Stack>
    </PageCard>
  );
}

export function JournalsPage(props: ReportsProps) {
  const isOnline = useOnlineStatus();
  const [outletId, setOutletId] = useState<number>(props.user.outlets[0]?.id ?? 0);
  const [dateFrom, setDateFrom] = useState<string>(beforeDaysIso(7));
  const [dateTo, setDateTo] = useState<string>(todayIso());
  const [journals, setJournals] = useState<JournalRow[]>([]);
  const [trialRows, setTrialRows] = useState<TrialBalanceRow[]>([]);
  const [trialTotals, setTrialTotals] = useState<{ total_debit: number; total_credit: number; balance: number }>({
    total_debit: 0,
    total_credit: 0,
    balance: 0
  });
  const [error, setError] = useState<string | null>(null);

  const journalColumns = useMemo<ColumnDef<JournalRow>[]>(
    () => [
      {
        header: "Posted At",
        accessorKey: "posted_at",
        cell: ({ getValue }) => new Date(String(getValue())).toLocaleString()
      },
      {
        header: "Doc",
        accessorKey: "doc_id",
        cell: ({ row }) => `${row.original.doc_type} #${row.original.doc_id}`
      },
      {
        header: "Outlet",
        accessorKey: "outlet_name",
        cell: ({ row }) => row.original.outlet_name ?? "ALL"
      },
      {
        header: "Lines",
        accessorKey: "line_count",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {Number(getValue())}
          </Text>
        )
      },
      {
        header: "Debit",
        accessorKey: "total_debit",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {formatMoneyDisplay(Number(getValue()))}
          </Text>
        )
      },
      {
        header: "Credit",
        accessorKey: "total_credit",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {formatMoneyDisplay(Number(getValue()))}
          </Text>
        )
      }
    ],
    []
  );

  const trialColumns = useMemo<ColumnDef<TrialBalanceRow>[]>(
    () => [
      { header: "Account", accessorKey: "account_code" },
      { header: "Name", accessorKey: "account_name" },
      {
        header: "Debit",
        accessorKey: "total_debit",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {formatMoneyDisplay(Number(getValue()))}
          </Text>
        )
      },
      {
        header: "Credit",
        accessorKey: "total_credit",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {formatMoneyDisplay(Number(getValue()))}
          </Text>
        )
      },
      {
        header: "Balance",
        accessorKey: "balance",
        cell: ({ getValue }) => (
          <Text size="sm" ta="right">
            {formatMoneyDisplay(Number(getValue()))}
          </Text>
        )
      }
    ],
    []
  );

  async function loadRows() {
    setError(null);
    try {
      const asOf = new Date().toISOString();
      const [journalResponse, trialResponse] = await Promise.all([
        apiRequest<JournalResponse>(
          `/reports/journals?outlet_id=${outletId}&date_from=${dateFrom}&date_to=${dateTo}&as_of=${encodeURIComponent(asOf)}`,
          {},
          props.accessToken
        ),
        apiRequest<TrialBalanceResponse>(
          `/reports/trial-balance?outlet_id=${outletId}&date_from=${dateFrom}&date_to=${dateTo}&as_of=${encodeURIComponent(asOf)}`,
          {},
          props.accessToken
        )
      ]);

      setJournals(journalResponse.journals);
      setTrialRows(trialResponse.rows);
      setTrialTotals(trialResponse.totals);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load journal report");
      }
    }
  }

  useEffect(() => {
    if (outletId > 0) {
      loadRows().catch(() => undefined);
    }
  }, [outletId, dateFrom, dateTo]);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to View Reports"
        message="Reports require real-time data. Please connect to the internet."
      />
    );
  }

  return (
    <Stack gap="md">
      <PageCard title="Journal List" description="Posted journal batches for the selected period.">
        <Stack gap="sm">
          <FilterBar>
            <Select
              label="Outlet"
              data={buildOutletOptions(props.user.outlets)}
              value={String(outletId)}
              onChange={(value) => setOutletId(Number(value))}
            />
            <TextInput
              label="From"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <TextInput
              label="To"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
            <Button onClick={() => loadRows()}>Refresh</Button>
          </FilterBar>
          {error ? (
            <Text c="red" size="sm">
              {error}
            </Text>
          ) : null}
          <DataTable columns={journalColumns} data={journals} minWidth={760} stickyHeader />
        </Stack>
      </PageCard>

      <PageCard title="Trial Balance" description="Summary balances for the selected period.">
        <Stack gap="sm">
          <StatTiles
            items={[
              { label: "Debit", value: formatMoneyDisplay(trialTotals.total_debit) },
              { label: "Credit", value: formatMoneyDisplay(trialTotals.total_credit) },
              { label: "Balance", value: formatMoneyDisplay(trialTotals.balance) }
            ]}
          />
          <DataTable columns={trialColumns} data={trialRows} minWidth={640} stickyHeader />
        </Stack>
      </PageCard>
    </Stack>
  );
}

export function ProfitLossPage(props: ReportsProps) {
  const isOnline = useOnlineStatus();
  const [outletId, setOutletId] = useState<number>(props.user.outlets[0]?.id ?? 0);
  const [dateFrom, setDateFrom] = useState<string>(startOfYearIso());
  const [dateTo, setDateTo] = useState<string>(todayIso());
  const [rows, setRows] = useState<ProfitLossRow[]>([]);
  const [totals, setTotals] = useState<ProfitLossResponse["totals"]>({
    total_debit: 0,
    total_credit: 0,
    net: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const accountFilters = useMemo(() => ({ report_group: "LR" as const, is_active: true }), []);
  const { data: accounts, loading: accountsLoading, error: accountsError } = useAccounts(
    props.user.company_id,
    props.accessToken,
    accountFilters
  );
  const { data: accountTypes, loading: accountTypesLoading, error: accountTypesError } = useAccountTypes(
    props.user.company_id,
    props.accessToken
  );

  async function loadRows() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to: dateTo,
        round: "2"
      });
      if (outletId > 0) {
        params.set("outlet_id", String(outletId));
      }
      const response = await apiRequest<ProfitLossResponse>(
        `/reports/profit-loss?${params.toString()}`,
        {},
        props.accessToken
      );
      setRows(response.rows);
      setTotals(response.totals);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load profit loss report");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows().catch(() => undefined);
  }, [outletId, dateFrom, dateTo]);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to View Reports"
        message="Reports require real-time data. Please connect to the internet."
      />
    );
  }

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const accountTypeById = useMemo(
    () => new Map(accountTypes.map((type) => [type.id, type])),
    [accountTypes]
  );

  type ProfitLossGroup = {
    key: string;
    label: string;
    category: "REVENUE" | "EXPENSE" | "OTHER";
    isTaxGroup: boolean;
    rows: Array<ProfitLossRow & { displayNet: number }>;
    displayTotal: number;
    netTotal: number;
  };

  const grouped = useMemo(() => {
    const buckets = new Map<string, ProfitLossGroup>();

    rows.forEach((row) => {
      const account = accountById.get(row.account_id);
      const accountType = account?.account_type_id ? accountTypeById.get(account.account_type_id) : null;
      const rawCategory = accountType?.category ?? null;
      const category: ProfitLossGroup["category"] =
        rawCategory === "REVENUE" || rawCategory === "EXPENSE"
          ? rawCategory
          : row.account_code.startsWith("4")
            ? "REVENUE"
            : row.account_code.startsWith("5")
              ? "EXPENSE"
              : "OTHER";
      const typeName = account?.type_name ?? accountType?.name ?? null;
      const label = (typeName ?? (category === "REVENUE" ? "PENDAPATAN" : category === "EXPENSE" ? "BEBAN" : "LAIN-LAIN")).toUpperCase();
      const isTaxGroup = /PAJAK/i.test(typeName ?? "") || /^5-3/.test(row.account_code);
      const displayNet = category === "EXPENSE" ? Math.abs(row.net) : row.net;
      const key = `${category}:${label}`;
      const bucket = buckets.get(key) ?? {
        key,
        label,
        category,
        isTaxGroup,
        rows: [],
        displayTotal: 0,
        netTotal: 0
      };
      bucket.rows.push({ ...row, displayNet });
      bucket.displayTotal += displayNet;
      bucket.netTotal += row.net;
      bucket.isTaxGroup = bucket.isTaxGroup || isTaxGroup;
      buckets.set(key, bucket);
    });

    const categoryOrder = ["REVENUE", "EXPENSE", "OTHER"] as const;
    return Array.from(buckets.values()).sort((left, right) => {
      const categoryDiff = categoryOrder.indexOf(left.category) - categoryOrder.indexOf(right.category);
      if (categoryDiff !== 0) return categoryDiff;
      return left.label.localeCompare(right.label);
    });
  }, [rows, accountById, accountTypeById]);

  const revenueGroups = grouped.filter((group) => group.category === "REVENUE");
  const expenseGroups = grouped.filter((group) => group.category === "EXPENSE" && !group.isTaxGroup);
  const taxGroups = grouped.filter((group) => group.category === "EXPENSE" && group.isTaxGroup);

  const totalRevenue = revenueGroups.reduce((acc, group) => acc + group.displayTotal, 0);
  const totalExpense = expenseGroups.reduce((acc, group) => acc + group.displayTotal, 0);
  const totalTax = taxGroups.reduce((acc, group) => acc + group.displayTotal, 0);
  const taxNet = taxGroups.reduce((acc, group) => acc + group.netTotal, 0);
  const netBeforeTax = totals.net - taxNet;

  const sectionRowStyle = { backgroundColor: "var(--mantine-color-gray-1)" };
  const totalRowStyle = { fontWeight: 700 } as const;

  function renderGroupRows(group: ProfitLossGroup) {
    return (
      <>
        <Table.Tr style={sectionRowStyle}>
          <Table.Td colSpan={3}>
            <Text fw={700} tt="uppercase" size="sm">
              {group.label}
            </Text>
          </Table.Td>
        </Table.Tr>
        {group.rows.map((row) => (
          <Table.Tr key={row.account_id}>
            <Table.Td>{row.account_code}</Table.Td>
            <Table.Td>{row.account_name}</Table.Td>
            <Table.Td>
              <Text ta="right" size="sm">
                {formatMoneyDisplay(row.displayNet)}
              </Text>
            </Table.Td>
          </Table.Tr>
        ))}
        <Table.Tr>
          <Table.Td colSpan={2} style={totalRowStyle}>
            TOTAL {group.label}
          </Table.Td>
          <Table.Td>
            <Text ta="right" size="sm" fw={700}>
              {formatMoneyDisplay(group.displayTotal)}
            </Text>
          </Table.Td>
        </Table.Tr>
      </>
    );
  }

  return (
    <PageCard title="Profit & Loss" description="Income statement for the selected period.">
      <Stack gap="sm">
        <Box ta="center">
          <Title order={3} mb={4}>
            LAPORAN LABA RUGI
          </Title>
          <Text size="xs" c="dimmed" tt="uppercase" style={{ letterSpacing: "0.08em" }}>
            {formatPeriod(dateFrom, dateTo)}
          </Text>
        </Box>

        <FilterBar>
          <Select
            label="Outlet"
            data={buildOutletOptions(props.user.outlets, true)}
            value={String(outletId)}
            onChange={(value) => setOutletId(Number(value))}
          />
          <TextInput
            label="From"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
          <TextInput
            label="To"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
          <Button onClick={() => loadRows()} loading={loading}>
            Refresh
          </Button>
        </FilterBar>

        {accountsLoading || accountTypesLoading ? <Text size="sm">Loading account mappings...</Text> : null}
        {accountsError ? (
          <Text c="red" size="sm">
            {accountsError}
          </Text>
        ) : null}
        {accountTypesError ? (
          <Text c="red" size="sm">
            {accountTypesError}
          </Text>
        ) : null}
        {error ? (
          <Text c="red" size="sm">
            {error}
          </Text>
        ) : null}

        {rows.length === 0 ? (
          <Text c="dimmed" size="sm">
            No P/L data available for the selected period.
          </Text>
        ) : (
          <ScrollArea type="auto" scrollbarSize={8} offsetScrollbars>
            <Table style={{ minWidth: 640 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>KODE</Table.Th>
                  <Table.Th>KETERANGAN</Table.Th>
                  <Table.Th>
                    <Text ta="right" size="sm">
                      SALDO
                    </Text>
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {revenueGroups.map((group) => (
                  <Fragment key={group.key}>{renderGroupRows(group)}</Fragment>
                ))}

                <Table.Tr>
                  <Table.Td colSpan={2} style={totalRowStyle}>
                    TOTAL PENDAPATAN
                  </Table.Td>
                  <Table.Td>
                    <Text ta="right" size="sm" fw={700}>
                      {formatMoneyDisplay(totalRevenue)}
                    </Text>
                  </Table.Td>
                </Table.Tr>

                {expenseGroups.map((group) => (
                  <Fragment key={group.key}>{renderGroupRows(group)}</Fragment>
                ))}

                <Table.Tr>
                  <Table.Td colSpan={2} style={totalRowStyle}>
                    TOTAL BEBAN
                  </Table.Td>
                  <Table.Td>
                    <Text ta="right" size="sm" fw={700}>
                      {formatMoneyDisplay(totalExpense)}
                    </Text>
                  </Table.Td>
                </Table.Tr>

                {taxGroups.length > 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={2} style={totalRowStyle}>
                      LABA BERSIH SEBELUM PAJAK
                    </Table.Td>
                    <Table.Td>
                      <Text ta="right" size="sm" fw={700}>
                        {formatMoneyDisplay(netBeforeTax)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : null}

                {taxGroups.map((group) => (
                  <Fragment key={group.key}>{renderGroupRows(group)}</Fragment>
                ))}

                {taxGroups.length > 0 ? (
                  <Table.Tr>
                    <Table.Td colSpan={2} style={totalRowStyle}>
                      TOTAL BEBAN PAJAK PERUSAHAAN
                    </Table.Td>
                    <Table.Td>
                      <Text ta="right" size="sm" fw={700}>
                        {formatMoneyDisplay(totalTax)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ) : null}

                <Table.Tr>
                  <Table.Td colSpan={2} style={totalRowStyle}>
                    {taxGroups.length > 0 ? "LABA BERSIH SETELAH PAJAK" : "LABA BERSIH"}
                  </Table.Td>
                  <Table.Td>
                    <Text ta="right" size="sm" fw={700}>
                      {formatMoneyDisplay(totals.net)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
      </Stack>
    </PageCard>
  );
}

export function AccountingWorksheetPage(props: ReportsProps) {
  const isOnline = useOnlineStatus();
  const [outletId, setOutletId] = useState<number>(props.user.outlets[0]?.id ?? 0);
  const [dateFrom, setDateFrom] = useState<string>(beforeDaysIso(30));
  const [dateTo, setDateTo] = useState<string>(todayIso());
  const [rows, setRows] = useState<WorksheetRow[]>([]);
  const [summary, setSummary] = useState<WorksheetResponse["summary"]>({
    opening_debit: 0,
    opening_credit: 0,
    period_debit: 0,
    period_credit: 0,
    ending_debit: 0,
    ending_credit: 0,
    total_debit: 0,
    total_credit: 0,
    balance: 0,
    bs_debit: 0,
    bs_credit: 0,
    pl_debit: 0,
    pl_credit: 0
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadRows() {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest<WorksheetResponse>(
        `/reports/worksheet?outlet_id=${outletId}&date_from=${dateFrom}&date_to=${dateTo}&round=2`,
        {},
        props.accessToken
      );
      setRows(response.rows);
      setSummary(response.summary);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load accounting worksheet");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (outletId > 0) {
      loadRows().catch(() => undefined);
    }
  }, [outletId, dateFrom, dateTo]);

  if (!isOnline) {
    return (
      <OfflinePage
        title="Connect to View Reports"
        message="Reports require real-time data. Please connect to the internet."
      />
    );
  }

  const profit = summary.pl_credit - summary.pl_debit;
  const isBalanced = Math.abs(summary.bs_debit - summary.bs_credit) < 0.005;
  const balanceLabel = isBalanced ? "BALANCED" : "NOT BALANCED";
  const profitLabel = profit >= 0 ? "PROFIT" : "LOSS";

  return (
    <PageCard title="Accounting Worksheet" description="Trial balance and adjustments in one view.">
      <Stack gap="sm">
        <FilterBar>
          <Select
            label="Outlet"
            data={buildOutletOptions(props.user.outlets)}
            value={String(outletId)}
            onChange={(value) => setOutletId(Number(value))}
          />
          <TextInput
            label="From"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
          <TextInput
            label="To"
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
          <Button onClick={() => loadRows()} loading={loading}>
            Refresh
          </Button>
        </FilterBar>
        {error ? (
          <Text c="red" size="sm">
            {error}
          </Text>
        ) : null}

        <ScrollArea type="auto" scrollbarSize={8} offsetScrollbars>
          <Table stickyHeader style={{ minWidth: 980 }}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Code</Table.Th>
                <Table.Th>Account Name</Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    Opening Debit
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    Opening Credit
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    Movement Debit
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    Movement Credit
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    Ending Debit
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    Ending Credit
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    P/L Debit
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    P/L Credit
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    BS Debit
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    BS Credit
                  </Text>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => (
                <Table.Tr key={row.account_id}>
                  <Table.Td>{row.account_code}</Table.Td>
                  <Table.Td>{row.account_name}</Table.Td>
                  <Table.Td>
                    <Text ta="right" size="sm">
                      {formatMoneyDisplay(row.opening_debit)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text ta="right" size="sm">
                      {formatMoneyDisplay(row.opening_credit)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text ta="right" size="sm">
                      {formatMoneyDisplay(row.period_debit)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text ta="right" size="sm">
                      {formatMoneyDisplay(row.period_credit)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text ta="right" size="sm">
                      {formatMoneyDisplay(row.ending_debit)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text ta="right" size="sm">
                      {formatMoneyDisplay(row.ending_credit)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text ta="right" size="sm">
                      {formatMoneyDisplay(row.pl_debit)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text ta="right" size="sm">
                      {formatMoneyDisplay(row.pl_credit)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text ta="right" size="sm">
                      {formatMoneyDisplay(row.bs_debit)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text ta="right" size="sm">
                      {formatMoneyDisplay(row.bs_credit)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
            <Table.Tfoot>
              <Table.Tr>
                <Table.Th colSpan={2}>Total</Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    {formatMoneyDisplay(summary.opening_debit)}
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    {formatMoneyDisplay(summary.opening_credit)}
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    {formatMoneyDisplay(summary.period_debit)}
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    {formatMoneyDisplay(summary.period_credit)}
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    {formatMoneyDisplay(summary.ending_debit)}
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    {formatMoneyDisplay(summary.ending_credit)}
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    {formatMoneyDisplay(summary.pl_debit)}
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    {formatMoneyDisplay(summary.pl_credit)}
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    {formatMoneyDisplay(summary.bs_debit)}
                  </Text>
                </Table.Th>
                <Table.Th>
                  <Text ta="right" size="sm">
                    {formatMoneyDisplay(summary.bs_credit)}
                  </Text>
                </Table.Th>
              </Table.Tr>
            </Table.Tfoot>
          </Table>
        </ScrollArea>

        <Text size="sm" c="dimmed">
          Final P/L ({profitLabel}): {formatMoneyDisplay(Math.abs(profit))} | Balance Sheet: {formatMoneyDisplay(summary.bs_debit)} / {formatMoneyDisplay(summary.bs_credit)} | {balanceLabel}
        </Text>
      </Stack>
    </PageCard>
  );
}
