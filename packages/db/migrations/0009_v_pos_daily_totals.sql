-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
-- Ownership: Ahmad Faruk (Signal18 ID)

CREATE OR REPLACE VIEW v_pos_daily_totals AS
SELECT pt.company_id,
       pt.outlet_id,
       DATE(pt.trx_at) AS trx_date,
       pt.status,
       COUNT(*) AS tx_count,
       COALESCE(SUM(i.gross_total), 0) AS gross_total,
       COALESCE(SUM(p.paid_total), 0) AS paid_total
FROM pos_transactions pt
LEFT JOIN (
  SELECT pos_transaction_id,
         SUM(qty * price_snapshot) AS gross_total
  FROM pos_transaction_items
  GROUP BY pos_transaction_id
) i ON i.pos_transaction_id = pt.id
LEFT JOIN (
  SELECT pos_transaction_id,
         SUM(amount) AS paid_total
  FROM pos_transaction_payments
  GROUP BY pos_transaction_id
) p ON p.pos_transaction_id = pt.id
GROUP BY pt.company_id, pt.outlet_id, DATE(pt.trx_at), pt.status;
