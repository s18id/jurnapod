<!-- Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
Ownership: Ahmad Faruk (Signal18 ID) -->

# ADR-0001: GL as Source of Truth

## Status
Accepted

## Decision
Semua dokumen `POSTED/COMPLETED` wajib menghasilkan jurnal di `journal_batches` dan `journal_lines`.

## Consequences
- Laporan keuangan diturunkan dari jurnal + COA.
- Modul domain tidak membuat laporan keuangan sendiri.
