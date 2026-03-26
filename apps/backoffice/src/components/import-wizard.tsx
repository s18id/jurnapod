// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Stack,
  Button,
  Textarea,
  FileInput,
  Table,
  ScrollArea,
  Badge,
  Alert,
  Loader,
  Progress,
  Text,
  Group,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useState, useCallback } from "react";

import { readImportFile } from "../lib/import/delimited";

import { ImportStepBadges, type ImportStep } from "./import-step-badges";


export type ImportRowAction = "CREATE" | "SKIP" | "ERROR";

export interface ImportColumn<T> {
  key: keyof T | string;
  header: string;
  required?: boolean;
  formatter?: (value: string) => string;
}

export interface ImportPlanRow<T> {
  rowIndex: number;
  original: Record<string, string>;
  parsed: Partial<T>;
  action: ImportRowAction;
  error?: string;
}

export interface ImportSummary {
  total: number;
  create: number;
  skip: number;
  error: number;
}

export interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
}

export interface ImportWizardConfig<T> {
  title: string;
  entityName: string;
  csvTemplate: string;
  csvDescription: string;
  columns: ImportColumn<T>[];
  parseRow: (row: Record<string, string>) => Partial<T> | null;
  validateRow: (parsed: Partial<T>, rowIndex: number) => string | null;
  importFn: (rows: ImportPlanRow<T>[]) => Promise<ImportResult>;
}

interface ImportWizardProps<T> {
  config: ImportWizardConfig<T>;
  onComplete: () => void;
  onCancel: () => void;
}

export function ImportWizard<T>({ config, onComplete, onCancel }: ImportWizardProps<T>) {
  const [step, setStep] = useState<ImportStep>("source");
  const [sourceText, setSourceText] = useState("");
  const [plan, setPlan] = useState<ImportPlanRow<T>[]>([]);
  const [summary, setSummary] = useState<ImportSummary>({
    total: 0,
    create: 0,
    skip: 0,
    error: 0,
  });
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback(
    async (file: File | null) => {
      if (!file) return;

      try {
        const content = await readImportFile(file);
        setSourceText(content);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to read file");
      }
    },
    []
  );

  const processSource = useCallback(() => {
    if (!sourceText.trim()) return;

    setError(null);
    const rows: ImportPlanRow<T>[] = [];
    const lines = sourceText.trim().split("\n");

    // Skip header row if it looks like a header
    const startIndex =
      lines[0]?.toLowerCase().includes(config.columns[0].key as string) ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Parse CSV line (simple split, should handle quotes properly in production)
      const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));

      // Build row object from columns
      const original: Record<string, string> = {};
      config.columns.forEach((col, idx) => {
        original[col.key as string] = values[idx] ?? "";
      });

      // Parse row
      const parsed = config.parseRow(original);

      if (!parsed) {
        rows.push({
          rowIndex: i - startIndex,
          original,
          parsed: {},
          action: "ERROR",
          error: "Failed to parse row",
        });
        continue;
      }

      // Validate row
      const validationError = config.validateRow(parsed, i - startIndex);

      rows.push({
        rowIndex: i - startIndex,
        original,
        parsed,
        action: validationError ? "ERROR" : "CREATE",
        error: validationError || undefined,
      });
    }

    // Calculate summary
    const newSummary: ImportSummary = {
      total: rows.length,
      create: rows.filter((r) => r.action === "CREATE").length,
      skip: rows.filter((r) => r.action === "SKIP").length,
      error: rows.filter((r) => r.action === "ERROR").length,
    };

    setPlan(rows);
    setSummary(newSummary);
    setStep("preview");
  }, [sourceText, config]);

  const runImport = useCallback(async () => {
    const validRows = plan.filter((r) => r.action === "CREATE");
    if (validRows.length === 0) return;

    setImporting(true);
    setProgress(0);
    setError(null);

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress((p) => Math.min(p + 10, 90));
      }, 200);

      const importResult = await config.importFn(validRows);

      clearInterval(progressInterval);
      setProgress(100);
      setResult(importResult);
      setStep("apply");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }, [plan, config]);

  const reset = useCallback(() => {
    setStep("source");
    setSourceText("");
    setPlan([]);
    setSummary({ total: 0, create: 0, skip: 0, error: 0 });
    setResult(null);
    setImporting(false);
    setProgress(0);
    setError(null);
  }, []);

  const handleComplete = useCallback(() => {
    reset();
    onComplete();
  }, [reset, onComplete]);

  const handleCancel = useCallback(() => {
    reset();
    onCancel();
  }, [reset, onCancel]);

  return (
    <Stack>
      <ImportStepBadges step={step} />

      {error && (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {error}
        </Alert>
      )}

      {step === "source" && (
        <Stack>
          <Textarea
            label="Paste CSV data"
            description={config.csvDescription}
            placeholder={config.csvTemplate}
            value={sourceText}
            onChange={(e) => setSourceText(e.currentTarget.value)}
            minRows={6}
          />
          <Text size="sm" c="dimmed">
            Or upload a file
          </Text>
          <FileInput
            placeholder="Select CSV or TXT file"
            accept=".csv,.txt"
            onChange={handleFileSelect}
          />
          <Button onClick={processSource} disabled={!sourceText.trim()}>
            Preview
          </Button>
          <Button variant="default" onClick={handleCancel}>
            Cancel
          </Button>
        </Stack>
      )}

      {step === "preview" && (
        <Stack>
          <Group gap="sm">
            <Badge color="green">Create: {summary.create}</Badge>
            <Badge color="red">Error: {summary.error}</Badge>
            <Badge color="gray">Total: {summary.total}</Badge>
          </Group>

          {summary.error > 0 && (
            <Alert color="red" title="Validation Errors">
              Fix errors in your data before importing.
            </Alert>
          )}

          <ScrollArea type="auto" h={300}>
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Row</Table.Th>
                  {config.columns.map((col) => (
                    <Table.Th key={col.key as string}>{col.header}</Table.Th>
                  ))}
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {plan.slice(0, 50).map((row) => (
                  <Table.Tr key={row.rowIndex}>
                    <Table.Td>{row.rowIndex + 1}</Table.Td>
                    {config.columns.map((col) => (
                      <Table.Td key={col.key as string}>
                        {row.original[col.key as string] ?? "-"}
                      </Table.Td>
                    ))}
                    <Table.Td>
                      {row.action === "CREATE" ? (
                        <Badge color="green" size="sm">
                          Create
                        </Badge>
                      ) : (
                        <Badge color="red" size="sm">
                          {row.error}
                        </Badge>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>

          <Group>
            {summary.create > 0 && (
              <Button onClick={runImport} disabled={importing}>
                Import ({summary.create} {config.entityName})
              </Button>
            )}
            <Button variant="default" onClick={() => setStep("source")}>
              Back
            </Button>
          </Group>
        </Stack>
      )}

      {step === "apply" && (
        <Stack>
          {importing ? (
            <Stack align="center" gap="md">
              <Loader size="lg" />
              <Text>Importing...</Text>
              <Progress value={progress} w="100%" animated />
            </Stack>
          ) : (
            <Stack>
              <Alert
                color={
                  result && result.failed === 0
                    ? "green"
                    : result && result.failed > 0
                    ? "yellow"
                    : "blue"
                }
              >
                {result ? (
                  <>
                    {result.success} of {summary.create} {config.entityName}{" "}
                    imported successfully.
                    {result.failed > 0 && ` ${result.failed} failed.`}
                  </>
                ) : (
                  "Import complete"
                )}
              </Alert>
              <Button onClick={handleComplete}>Done</Button>
            </Stack>
          )}
        </Stack>
      )}
    </Stack>
  );
}

// Hook for managing import wizard state
export function useImportWizard<T>(config: ImportWizardConfig<T>) {
  const [opened, setOpened] = useState(false);

  const open = useCallback(() => setOpened(true), []);
  const close = useCallback(() => setOpened(false), []);

  return {
    opened,
    open,
    close,
    config,
  };
}
