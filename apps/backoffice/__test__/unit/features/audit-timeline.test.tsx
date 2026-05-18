import { MantineProvider } from "@mantine/core";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuditTimeline } from "@/features/audit/audit-timeline";
import type { AuditLogRecord } from "@/features/audit/api";

function makeAuditEntry(overrides: Partial<AuditLogRecord> = {}): AuditLogRecord {
  return {
    id: 1,
    company_id: 10,
    outlet_id: null,
    user_id: 20,
    entity_type: "items",
    entity_id: "42",
    action: "UPDATE",
    result: "success",
    success: true,
    status: "completed",
    ip_address: "127.0.0.1",
    payload_json: "{}",
    changes_json: '{"name":{"old":"Old Name","new":"New Name"}}',
    created_at: "2026-05-19T12:00:00.000Z",
    ...overrides,
  };
}

function renderTimeline(entries: AuditLogRecord[], loading = false): string {
  return renderToStaticMarkup(
    createElement(MantineProvider, {},
      createElement(AuditTimeline, { entries, loading }),
    ),
  );
}

describe("AuditTimeline", () => {
  it("renders entries in reverse chronological order", () => {
    const entries = [
      makeAuditEntry({ id: 1, action: "CREATE", created_at: "2026-05-19T10:00:00.000Z" }),
      makeAuditEntry({ id: 2, action: "UPDATE", created_at: "2026-05-19T14:00:00.000Z" }),
    ];
    const html = renderTimeline(entries);
    expect(html).toContain("UPDATE");
    expect(html).toContain("CREATE");
    // UPDATE (newer) should appear before CREATE in the rendered output
    expect(html.indexOf("UPDATE")).toBeLessThan(html.indexOf("CREATE"));
  });

  it("shows empty state when no entries", () => {
    const html = renderTimeline([]);
    expect(html).toContain("No changes recorded for this entity");
  });

  it("shows loading state", () => {
    const html = renderTimeline([], true);
    expect(html).toContain("Loading audit history");
  });

  it("renders action badges for each entry type", () => {
    const entries = [
      makeAuditEntry({ id: 1, action: "CREATE" }),
      makeAuditEntry({ id: 2, action: "UPDATE" }),
      makeAuditEntry({ id: 3, action: "DELETE" }),
      makeAuditEntry({ id: 4, action: "VOID" }),
      makeAuditEntry({ id: 5, action: "REFUND" }),
    ];
    const html = renderTimeline(entries);
    expect(html).toContain("CREATE");
    expect(html).toContain("UPDATE");
    expect(html).toContain("DELETE");
    expect(html).toContain("VOID");
    expect(html).toContain("REFUND");
  });

  it("renders diff preview for entries with changes_json", () => {
    const html = renderTimeline([makeAuditEntry()]);
    expect(html).toContain("name:");
    expect(html).toContain("Old Name");
    expect(html).toContain("New Name");
  });

  it("shows actor and timestamp for each entry", () => {
    const html = renderTimeline([makeAuditEntry({ user_id: 42, created_at: "2026-05-19T08:30:00.000Z" })]);
    expect(html).toContain("By user 42");
  });
});
