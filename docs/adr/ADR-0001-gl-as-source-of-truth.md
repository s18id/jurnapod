# ADR-0001: GL as Source of Truth

## Status
Accepted

## Decision
Semua dokumen `POSTED/COMPLETED` wajib menghasilkan jurnal di `journal_batches` dan `journal_lines`.

## Consequences
- Laporan keuangan diturunkan dari jurnal + COA.
- Modul domain tidak membuat laporan keuangan sendiri.
