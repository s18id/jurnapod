// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { AuditLogResponse } from "@jurnapod/shared";
import { Stack, Select, TextInput, Button, Group, Alert } from "@mantine/core";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

import { DataTable } from "../components/DataTable";
import { PageCard } from "../components/PageCard";
import { apiRequest, ApiError } from "../lib/api-client";
import type { SessionUser } from "../lib/session";


type AuditLogsPageProps = {
  user: SessionUser;
  accessToken: string;
};

type AuditLogsResult = {
  total: number;
  logs: AuditLogResponse[];
};

type AuditLogsApiResponse = {
  success: true;
  data: AuditLogsResult;
};

const entityTypeOptions = [
  { value: "", label: "All Entity Types" },
  { value: "account", label: "Account" },
  { value: "account_type", label: "Account Type" },
  { value: "item", label: "Item" },
  { value: "item_price", label: "Item Price" },
  { value: "invoice", label: "Invoice" },
  { value: "payment", label: "Payment" },
  { value: "journal_batch", label: "Journal Batch" },
  { value: "pos_transaction", label: "POS Transaction" },
  { value: "user", label: "User" },
  { value: "outlet", label: "Outlet" },
  { value: "company", label: "Company" },
  { value: "setting", label: "Setting" },
  { value: "feature_flag", label: "Feature Flag" },
  { value: "tax_rate", label: "Tax Rate" }
];

const actionOptions = [
  { value: "", label: "All Actions" },
  { value: "CREATE", label: "Create" },
  { value: "UPDATE", label: "Update" },
  { value: "DELETE", label: "Delete" },
  { value: "DEACTIVATE", label: "Deactivate" },
  { value: "REACTIVATE", label: "Reactivate" },
  { value: "VOID", label: "Void" },
  { value: "REFUND", label: "Refund" },
  { value: "POST", label: "Post" },
  { value: "IMPORT", label: "Import" }
];

export function AuditLogsPage(props: AuditLogsPageProps) {
  const [logs, setLogs] = useState<AuditLogResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [entityId, setEntityId] = useState("");
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  async function fetchLogs() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        company_id: String(props.user.company_id),
        limit: String(limit),
        offset: String(offset)
      });

      if (entityType) {
        params.set("entity_type", entityType);
      }
      if (action) {
        params.set("action", action);
      }
      if (entityId.trim()) {
        params.set("entity_id", entityId.trim());
      }

      const response = await apiRequest<AuditLogsApiResponse>(
        `/audit-logs?${params.toString()}`,
        {},
        props.accessToken
      );

      setLogs(response.data.logs);
      setTotal(response.data.total);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load audit logs");
      }
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs();
  }, [limit, offset]);

  function handleSearch() {
    setOffset(0);
    fetchLogs();
  }

  function handleNextPage() {
    if (offset + limit < total) {
      setOffset(offset + limit);
    }
  }

  function handlePrevPage() {
    if (offset > 0) {
      setOffset(Math.max(0, offset - limit));
    }
  }

  const columns: ColumnDef<AuditLogResponse>[] = [
    {
      id: "created_at",
      header: "Date/Time",
      cell: (info) => new Date(info.row.original.created_at).toLocaleString("id-ID")
    },
    {
      id: "entity_type",
      header: "Entity Type",
      cell: (info) => info.row.original.entity_type ?? "-"
    },
    {
      id: "entity_id",
      header: "Entity ID",
      cell: (info) => info.row.original.entity_id ?? "-"
    },
    {
      id: "action",
      header: "Action",
      cell: (info) => info.row.original.action
    },
    {
      id: "result",
      header: "Result",
      cell: (info) => info.row.original.result
    },
    {
      id: "user_id",
      header: "User ID",
      cell: (info) => info.row.original.user_id ?? "-"
    },
    {
      id: "ip_address",
      header: "IP Address",
      cell: (info) => info.row.original.ip_address ?? "-"
    }
  ];

  return (
    <Stack gap="md">
      <PageCard title="Audit Logs" description="View system audit log entries">
        <Stack gap="sm">
          <Group gap="sm">
            <Select
              label="Entity Type"
              data={entityTypeOptions}
              value={entityType}
              onChange={(value) => setEntityType(value ?? "")}
              style={{ flex: 1 }}
            />
            <Select
              label="Action"
              data={actionOptions}
              value={action}
              onChange={(value) => setAction(value ?? "")}
              style={{ flex: 1 }}
            />
            <TextInput
              label="Entity ID"
              value={entityId}
              onChange={(e) => setEntityId(e.currentTarget.value)}
              placeholder="Optional"
              style={{ flex: 1 }}
            />
            <Button onClick={handleSearch} style={{ alignSelf: "flex-end" }}>
              Search
            </Button>
          </Group>

          {error ? <Alert color="red">{error}</Alert> : null}

          <DataTable
            columns={columns}
            data={logs}
            emptyState={loading ? "Loading logs..." : "No audit logs found"}
            minWidth={900}
          />

          <Group justify="space-between">
            <div>
              Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} logs
            </div>
            <Group gap="xs">
              <Button onClick={handlePrevPage} disabled={offset === 0} size="sm">
                Previous
              </Button>
              <Button onClick={handleNextPage} disabled={offset + limit >= total} size="sm">
                Next
              </Button>
            </Group>
          </Group>
        </Stack>
      </PageCard>
    </Stack>
  );
}
