POS Table Configuration and UI Improvement Plan
Problem Statement

The current POS tables page seeds four hard‑coded tables (A1, A2, B1, T1) when no table metadata exists in the client. This causes the page to display invalid table configurations for outlets where table layouts are managed in backoffice. The runtime service does not fetch table definitions from backoffice; instead it seeds default tables and returns them. To make the POS reflect the actual restaurant layout, we need to fetch table metadata via sync and persist it locally.

Goals

Load outlet table configuration from backoffice through the existing sync mechanism rather than seeding defaults.

Persist table metadata and statuses in Dexie and expose them through the runtime service.

Provide a clear UI when no tables are configured.

Keep backward compatibility for outlets without table data by falling back to default tables only when necessary.

Define phases and tasks to implement and roll out these changes.

Required Changes
1. Extend the Sync Pull Contract

Add a tables array to the /api/sync/pull response as specified in the POS sync contracts spec. Each table record should include table_id, code, name, zone, capacity, and status (AVAILABLE, RESERVED, OCCUPIED, UNAVAILABLE) and be returned incrementally by data_version. Also include an optional reservations array if reservation metadata is synchronised.

2. Update Server Query

Modify the server’s sync pull endpoint to join outlet_tables and return tables for the requested company_id and outlet_id, filtering by updated timestamps and status. The queries outlined in the spec should be used to select tables and active reservations.

3. Extend Client Sync Ingestion

In apps/pos/src/offline/sync-pull.ts:

Define Zod schemas for tables and reservations (SyncPullTableSchema and SyncPullReservationSchema) and extend the existing response schema.

In the syncPullIngest function, after ingesting products and prices, upsert tables into the outlet_tables Dexie store and log the number of rows inserted. Repeat the same for reservations.

Add conflict resolution logic: if the server marks a table AVAILABLE but a local active order exists, preserve the local OCCUPIED status.

4. Modify Runtime Service

Refactor getOutletTables to avoid unconditional default seeding. The method should:

Read tables from Dexie via storage.getOutletTablesByOutlet.

If no tables exist, trigger a manual sync pull to fetch data from the server.

Only seed the default tables (A1, A2, B1, T1) when no table metadata is returned by the server and the outlet has no backoffice configuration.

Expose a method to refresh tables manually; this can be called after the user logs in or selects an outlet.

5. Update the Tables Page

TablesPage.tsx currently calls runtime.getOutletTables and renders the returned list. After the runtime service is updated, the tables page will display the actual outlet configuration. Add a message when no tables are configured (e.g., “No tables configured for this outlet. Please configure tables in backoffice.”) to guide the cashier.

6. Bootstrapping and Sync Triggers

Ensure that a sync pull runs on POS initialization (login or outlet switch) before showing the tables page.

Provide a manual refresh button on the tables page to re-fetch tables from backoffice.

7. Backward Compatibility

To avoid breaking older clients or outlets without table configuration:

Wrap table ingestion behind a feature flag (e.g. ENABLE_DINE_IN_SYNC) so that the client gracefully ignores unknown fields if the server does not supply tables.

Continue to seed default tables when no tables are returned by the server, ensuring the UI remains functional.

Optional Enhancements

Service Mode Landing Page: Introduce a landing page where the cashier selects Take Away or Dine In. This ensures the user explicitly chooses the service mode before entering the product list. This improvement aligns with the ADR’s “one page, one job” philosophy and provides a clearer workflow for dine‑in versus takeaway orders.

Persistent Orders and Snapshots: Track an order snapshot and update history for each table. Push finalised orders and update history to the server so that multiple POS devices stay in sync.

Implementation Phases
Phase	Tasks	Notes
1	Extend /api/sync/pull server response to include tables and reservations	Ensure backwards compatibility by keeping fields optional
2	Update sync-pull.ts schemas and ingestion logic	Upsert tables/reservations into Dexie
3	Modify RuntimeService.getOutletTables	Add sync call and fallback logic
4	Add manual sync trigger on POS bootstrap and tables page	Also handle error states
5	Add UI message for no table configuration	Keep existing layouts
6	Roll out to staging and test with backoffice configuration	Validate conflict resolution and sync behaviour
Conclusion

This plan outlines how to replace the hard‑coded default tables with real table metadata fetched from backoffice. By extending the sync contract, ingesting table data locally, and updating the runtime service and UI, the POS will reflect the outlet’s actual table layout and improve the dine‑in workflow.