import { useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "../lib/api-client";
import type { SessionUser } from "../lib/session";

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

const inputStyle = {
  border: "1px solid #cabfae",
  borderRadius: "6px",
  padding: "6px 8px"
} as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function beforeDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function PosTransactionsPage(props: ReportsProps) {
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

export function PosPaymentsPage(props: ReportsProps) {
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
