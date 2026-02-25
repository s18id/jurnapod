import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "../lib/api-client";
import type { SessionUser } from "../lib/session";
import { useOnlineStatus } from "../lib/connection";
import { OfflinePage } from "../components/offline-page";
import { useAccounts } from "../hooks/use-accounts";

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

const boxStyle = {
  border: "1px solid #e2ddd2",
  borderRadius: "10px",
  padding: "16px",
  backgroundColor: "#fcfbf8",
  marginBottom: "14px"
} as const;

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const
};

const cellStyle = {
  borderBottom: "1px solid #ece7dc",
  padding: "8px"
} as const;

const numberCellStyle = {
  ...cellStyle,
  textAlign: "right" as const,
  fontVariantNumeric: "tabular-nums" as const
};

const inputStyle = {
  border: "1px solid #cabfae",
  borderRadius: "6px",
  padding: "6px 8px"
} as const;

const summaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "10px",
  marginBottom: "12px"
} as const;

const summaryCardStyle = {
  border: "1px solid #e6e0d6",
  borderRadius: "10px",
  padding: "10px 12px",
  backgroundColor: "#fff"
} as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function beforeDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function formatMoney(value: number): string {
  return value.toFixed(2);
}

export function PosTransactionsPage(props: ReportsProps) {
  const isOnline = useOnlineStatus();
  const [outletId, setOutletId] = useState<number>(props.user.outlets[0]?.id ?? 0);
  const [dateFrom, setDateFrom] = useState<string>(beforeDaysIso(7));
  const [dateTo, setDateTo] = useState<string>(todayIso());
  const [rows, setRows] = useState<PosTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
    <section style={boxStyle}>
      <h2 style={{ marginTop: 0 }}>POS Transactions</h2>
      <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <select value={outletId} onChange={(event) => setOutletId(Number(event.target.value))} style={inputStyle}>
          {props.user.outlets.map((outlet) => (
            <option key={outlet.id} value={outlet.id}>
              {outlet.code} - {outlet.name}
            </option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={inputStyle} />
        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} style={inputStyle} />
        <button type="button" onClick={() => loadRows()}>
          Refresh
        </button>
      </div>
      {error ? <p style={{ color: "#8d2626" }}>{error}</p> : null}
      <p>Total rows: {total}</p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>TX ID</th>
            <th style={cellStyle}>Status</th>
            <th style={cellStyle}>Date</th>
            <th style={cellStyle}>Items</th>
            <th style={cellStyle}>Gross</th>
            <th style={cellStyle}>Paid</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td style={cellStyle}>{row.client_tx_id}</td>
              <td style={cellStyle}>{row.status}</td>
              <td style={cellStyle}>{new Date(row.trx_at).toLocaleString()}</td>
              <td style={cellStyle}>{row.item_count}</td>
              <td style={cellStyle}>{row.gross_total.toFixed(2)}</td>
              <td style={cellStyle}>{row.paid_total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function DailySalesPage(props: ReportsProps) {
  const isOnline = useOnlineStatus();
  const [outletId, setOutletId] = useState<number>(props.user.outlets[0]?.id ?? 0);
  const [dateFrom, setDateFrom] = useState<string>(beforeDaysIso(7));
  const [dateTo, setDateTo] = useState<string>(todayIso());
  const [rows, setRows] = useState<DailySalesRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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
    <section style={boxStyle}>
      <h2 style={{ marginTop: 0 }}>Daily Sales Summary</h2>
      <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <select value={outletId} onChange={(event) => setOutletId(Number(event.target.value))} style={inputStyle}>
          {props.user.outlets.map((outlet) => (
            <option key={outlet.id} value={outlet.id}>
              {outlet.code} - {outlet.name}
            </option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={inputStyle} />
        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} style={inputStyle} />
        <button type="button" onClick={() => loadRows()}>
          Refresh
        </button>
      </div>
      {error ? <p style={{ color: "#8d2626" }}>{error}</p> : null}
      <p>
        Total tx: {totals.tx_count} | Gross: {totals.gross_total.toFixed(2)} | Paid: {totals.paid_total.toFixed(2)}
      </p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>Date</th>
            <th style={cellStyle}>Outlet</th>
            <th style={cellStyle}>Transactions</th>
            <th style={cellStyle}>Gross</th>
            <th style={cellStyle}>Paid</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.trx_date}:${row.outlet_id}`}>
              <td style={cellStyle}>{row.trx_date}</td>
              <td style={cellStyle}>{row.outlet_name ?? `#${row.outlet_id}`}</td>
              <td style={cellStyle}>{row.tx_count}</td>
              <td style={cellStyle}>{row.gross_total.toFixed(2)}</td>
              <td style={cellStyle}>{row.paid_total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
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
    <section style={boxStyle}>
      <h2 style={{ marginTop: 0 }}>General Ledger</h2>
      <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <select value={outletId} onChange={(event) => setOutletId(Number(event.target.value))} style={inputStyle}>
          {props.user.outlets.map((outlet) => (
            <option key={outlet.id} value={outlet.id}>
              {outlet.code} - {outlet.name}
            </option>
          ))}
        </select>
        <select
          value={accountId}
          onChange={(event) => setAccountId(Number(event.target.value))}
          style={inputStyle}
        >
          <option value={0}>Select account</option>
          {activeAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.code} - {account.name}
            </option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={inputStyle} />
        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} style={inputStyle} />
        <select value={lineLimit} onChange={(event) => setLineLimit(Number(event.target.value))} style={inputStyle}>
          <option value={25}>25 lines</option>
          <option value={50}>50 lines</option>
          <option value={100}>100 lines</option>
          <option value={200}>200 lines</option>
        </select>
        <button type="button" onClick={() => loadRows()} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>
      {accountsLoading ? <p>Loading accounts...</p> : null}
      {accountsError ? <p style={{ color: "#8d2626" }}>{accountsError}</p> : null}
      {error ? <p style={{ color: "#8d2626" }}>{error}</p> : null}

      {row ? (
        <div style={summaryGridStyle}>
          <div style={summaryCardStyle}>
            <strong>Account</strong>
            <div>{row.account_code}</div>
            <div>{row.account_name}</div>
          </div>
          <div style={summaryCardStyle}>
            <strong>Opening Balance</strong>
            <div>{formatMoney(row.opening_balance)}</div>
            <div style={{ fontSize: "12px", color: "#5b6664" }}>
              Debit {formatMoney(row.opening_debit)} | Credit {formatMoney(row.opening_credit)}
            </div>
          </div>
          <div style={summaryCardStyle}>
            <strong>Period Movement</strong>
            <div style={{ fontSize: "12px", color: "#5b6664" }}>
              Debit {formatMoney(row.period_debit)} | Credit {formatMoney(row.period_credit)}
            </div>
          </div>
          <div style={summaryCardStyle}>
            <strong>Ending Balance</strong>
            <div>{formatMoney(row.ending_balance)}</div>
          </div>
        </div>
      ) : (
        <p style={{ color: "#5b6664" }}>Select an account to view its ledger lines.</p>
      )}

      {row ? (
        <div style={{ marginBottom: "10px", display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => setLineOffset(Math.max(0, lineOffset - lineLimit))}
            disabled={!canPageBack}
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setLineOffset(lineOffset + lineLimit)}
            disabled={!canPageNext}
          >
            Next
          </button>
          <span style={{ color: "#5b6664", fontSize: "12px" }}>
            Showing {lineOffset + 1}-{lineOffset + row.lines.length}
          </span>
        </div>
      ) : null}

      {row ? (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>Date</th>
              <th style={cellStyle}>Description</th>
              <th style={cellStyle}>Outlet</th>
              <th style={cellStyle}>Debit</th>
              <th style={cellStyle}>Credit</th>
              <th style={cellStyle}>Balance</th>
              <th style={cellStyle}>Doc</th>
            </tr>
          </thead>
          <tbody>
            {row.lines.map((line) => (
              <tr key={line.line_id}>
                <td style={cellStyle}>{line.line_date}</td>
                <td style={cellStyle}>{line.description}</td>
                <td style={cellStyle}>{line.outlet_name ?? "ALL"}</td>
                <td style={cellStyle}>{formatMoney(line.debit)}</td>
                <td style={cellStyle}>{formatMoney(line.credit)}</td>
                <td style={cellStyle}>{formatMoney(line.balance)}</td>
                <td style={cellStyle}>
                  {line.doc_type} #{line.doc_id}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
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
    <section style={boxStyle}>
      <h2 style={{ marginTop: 0 }}>POS Payment Summary</h2>
      <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <select value={outletId} onChange={(event) => setOutletId(Number(event.target.value))} style={inputStyle}>
          {props.user.outlets.map((outlet) => (
            <option key={outlet.id} value={outlet.id}>
              {outlet.code} - {outlet.name}
            </option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={inputStyle} />
        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} style={inputStyle} />
        <select value={status} onChange={(event) => setStatus(event.target.value)} style={inputStyle}>
          <option value="COMPLETED">COMPLETED</option>
          <option value="VOID">VOID</option>
          <option value="REFUND">REFUND</option>
        </select>
        <button type="button" onClick={() => loadRows()}>
          Refresh
        </button>
      </div>
      {error ? <p style={{ color: "#8d2626" }}>{error}</p> : null}
      <p>
        Total payments: {totals.payment_count} | Total amount: {totals.total_amount.toFixed(2)}
      </p>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>Outlet</th>
            <th style={cellStyle}>Method</th>
            <th style={cellStyle}>Payment Count</th>
            <th style={cellStyle}>Total Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.outlet_id}:${row.method}`}>
              <td style={cellStyle}>{row.outlet_name ?? `#${row.outlet_id}`}</td>
              <td style={cellStyle}>{row.method}</td>
              <td style={cellStyle}>{row.payment_count}</td>
              <td style={cellStyle}>{row.total_amount.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
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
    <div>
      <section style={boxStyle}>
        <h2 style={{ marginTop: 0 }}>Journal List</h2>
        <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
          <select value={outletId} onChange={(event) => setOutletId(Number(event.target.value))} style={inputStyle}>
            {props.user.outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.code} - {outlet.name}
              </option>
            ))}
          </select>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={inputStyle} />
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} style={inputStyle} />
          <button type="button" onClick={() => loadRows()}>
            Refresh
          </button>
        </div>
        {error ? <p style={{ color: "#8d2626" }}>{error}</p> : null}
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>Posted At</th>
              <th style={cellStyle}>Doc</th>
              <th style={cellStyle}>Outlet</th>
              <th style={cellStyle}>Lines</th>
              <th style={cellStyle}>Debit</th>
              <th style={cellStyle}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {journals.map((row) => (
              <tr key={row.id}>
                <td style={cellStyle}>{new Date(row.posted_at).toLocaleString()}</td>
                <td style={cellStyle}>
                  {row.doc_type} #{row.doc_id}
                </td>
                <td style={cellStyle}>{row.outlet_name ?? "ALL"}</td>
                <td style={cellStyle}>{row.line_count}</td>
                <td style={cellStyle}>{row.total_debit.toFixed(2)}</td>
                <td style={cellStyle}>{row.total_credit.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={boxStyle}>
        <h3 style={{ marginTop: 0 }}>Trial Balance</h3>
        <p>
          Debit: {trialTotals.total_debit.toFixed(2)} | Credit: {trialTotals.total_credit.toFixed(2)} | Balance: {" "}
          {trialTotals.balance.toFixed(2)}
        </p>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>Account</th>
              <th style={cellStyle}>Name</th>
              <th style={cellStyle}>Debit</th>
              <th style={cellStyle}>Credit</th>
              <th style={cellStyle}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {trialRows.map((row) => (
              <tr key={row.account_id}>
                <td style={cellStyle}>{row.account_code}</td>
                <td style={cellStyle}>{row.account_name}</td>
                <td style={cellStyle}>{row.total_debit.toFixed(2)}</td>
                <td style={cellStyle}>{row.total_credit.toFixed(2)}</td>
                <td style={cellStyle}>{row.balance.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
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
    <section style={boxStyle}>
      <h2 style={{ marginTop: 0 }}>Accounting Worksheet</h2>
      <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <select value={outletId} onChange={(event) => setOutletId(Number(event.target.value))} style={inputStyle}>
          {props.user.outlets.map((outlet) => (
            <option key={outlet.id} value={outlet.id}>
              {outlet.code} - {outlet.name}
            </option>
          ))}
        </select>
        <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={inputStyle} />
        <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} style={inputStyle} />
        <button type="button" onClick={() => loadRows()} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>
      {error ? <p style={{ color: "#8d2626" }}>{error}</p> : null}

      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={cellStyle}>Code</th>
              <th style={cellStyle}>Account Name</th>
              <th style={numberCellStyle}>Opening Debit</th>
              <th style={numberCellStyle}>Opening Credit</th>
              <th style={numberCellStyle}>Movement Debit</th>
              <th style={numberCellStyle}>Movement Credit</th>
              <th style={numberCellStyle}>Ending Debit</th>
              <th style={numberCellStyle}>Ending Credit</th>
              <th style={numberCellStyle}>P/L Debit</th>
              <th style={numberCellStyle}>P/L Credit</th>
              <th style={numberCellStyle}>BS Debit</th>
              <th style={numberCellStyle}>BS Credit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.account_id}>
                <td style={cellStyle}>{row.account_code}</td>
                <td style={cellStyle}>{row.account_name}</td>
                <td style={numberCellStyle}>{formatMoney(row.opening_debit)}</td>
                <td style={numberCellStyle}>{formatMoney(row.opening_credit)}</td>
                <td style={numberCellStyle}>{formatMoney(row.period_debit)}</td>
                <td style={numberCellStyle}>{formatMoney(row.period_credit)}</td>
                <td style={numberCellStyle}>{formatMoney(row.ending_debit)}</td>
                <td style={numberCellStyle}>{formatMoney(row.ending_credit)}</td>
                <td style={numberCellStyle}>{formatMoney(row.pl_debit)}</td>
                <td style={numberCellStyle}>{formatMoney(row.pl_credit)}</td>
                <td style={numberCellStyle}>{formatMoney(row.bs_debit)}</td>
                <td style={numberCellStyle}>{formatMoney(row.bs_credit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th style={cellStyle} colSpan={2}>
                Total
              </th>
              <th style={numberCellStyle}>{formatMoney(summary.opening_debit)}</th>
              <th style={numberCellStyle}>{formatMoney(summary.opening_credit)}</th>
              <th style={numberCellStyle}>{formatMoney(summary.period_debit)}</th>
              <th style={numberCellStyle}>{formatMoney(summary.period_credit)}</th>
              <th style={numberCellStyle}>{formatMoney(summary.ending_debit)}</th>
              <th style={numberCellStyle}>{formatMoney(summary.ending_credit)}</th>
              <th style={numberCellStyle}>{formatMoney(summary.pl_debit)}</th>
              <th style={numberCellStyle}>{formatMoney(summary.pl_credit)}</th>
              <th style={numberCellStyle}>{formatMoney(summary.bs_debit)}</th>
              <th style={numberCellStyle}>{formatMoney(summary.bs_credit)}</th>
            </tr>
          </tfoot>
        </table>
      </div>

      <p style={{ marginTop: "10px", marginBottom: 0 }}>
        Final P/L ({profitLabel}): {formatMoney(Math.abs(profit))} | Balance Sheet: {formatMoney(summary.bs_debit)} / {formatMoney(summary.bs_credit)} | {balanceLabel}
      </p>
    </section>
  );
}
