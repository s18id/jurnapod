// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useCallback, useMemo } from "react";
import {
  Stack,
  Button,
  Group,
  Text,
  FileInput,
  Alert,
  Loader,
  Progress,
  ThemeIcon,
  Stepper,
  Card,
  Badge,
  ScrollArea,
  Table,
  ActionIcon,
  Tooltip,
  Divider,
  Select,
  Textarea,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconFileSpreadsheet,
  IconX,
  IconCheck,
  IconArrowRight,
  IconDownload,
  IconRefresh,
} from "@tabler/icons-react";

import { parseDelimited, readImportFile } from "../lib/import/delimited";
import { downloadCsv, rowsToCsv } from "../lib/import/csv";

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
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

export interface ImportWizardConfig<T> {
  title: string;
  entityName: string;
  entityType: "items" | "prices";
  csvTemplate: string;
  csvDescription: string;
  columns: ImportColumn<T>[];
  sampleColumnCount?: number;
  parseRow: (row: Record<string, string>, columnMap: Record<string, string>) => Partial<T> | null;
  validateRow: (parsed: Partial<T>, rowIndex: number) => string | null;
  importFn: (rows: ImportPlanRow<T>[], onProgress?: (current: number, total: number) => void) => Promise<ImportResult>;
  accessToken: string;
}

interface ImportWizardProps<T> {
  config: ImportWizardConfig<T>;
  onComplete: () => void;
  onCancel: () => void;
}

type WizardStep = "source" | "mapping" | "validation" | "apply" | "results";

// Auto-detect column mappings based on header names
const detectColumnMapping = <T,>(
  headers: string[],
  configColumns: ImportColumn<T>[]
): Record<string, string> => {
  const mapping: Record<string, string> = {};
  
  const normalizedConfigKeys = configColumns.reduce((acc, col) => {
    acc[col.key.toString().toLowerCase().replace(/[_\s-]/g, "")] = col.key.toString();
    return acc;
  }, {} as Record<string, string>);

  headers.forEach((header) => {
    const normalized = header.toLowerCase().replace(/[_\s-]/g, "");
    
    // Check for exact matches first
    if (normalizedConfigKeys[normalized]) {
      mapping[header] = normalizedConfigKeys[normalized];
      return;
    }

    // Check for partial matches
    for (const [pattern, key] of Object.entries(normalizedConfigKeys)) {
      if (normalized.includes(pattern) || pattern.includes(normalized)) {
        mapping[header] = key;
        return;
      }
    }
  });

  return mapping;
};

export function ImportWizard<T>({
  config,
  onComplete,
  onCancel,
}: ImportWizardProps<T>) {
  const [step, setStep] = useState<WizardStep>("source");
  const [activeStep, setActiveStep] = useState(0);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [sourceText, setSourceText] = useState("");

  // Parsed data state
  const [headers, setHeaders] = useState<string[]>([]);
  const [parsedData, setParsedData] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [autoDetectedMapping, setAutoDetectedMapping] = useState<Record<string, string>>({});

  // Plan/validation state
  const [plan, setPlan] = useState<ImportPlanRow<T>[]>([]);
  const [summary, setSummary] = useState<ImportSummary>({
    total: 0,
    create: 0,
    skip: 0,
    error: 0,
  });

  // Import state
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentRow, setCurrentRow] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Step labels
  const steps = [
    { label: "Upload", description: "Select file" },
    { label: "Mapping", description: "Map columns" },
    { label: "Validation", description: "Preview errors" },
    { label: "Apply", description: "Import data" },
    { label: "Results", description: "Completion" },
  ];

  // Get available target fields for mapping
  const availableFields = useMemo(() => {
    return config.columns.map((col) => ({
      value: col.key.toString(),
      label: col.header,
      required: col.required,
    }));
  }, [config.columns]);

  // Handle file selection
  const handleFileSelect = useCallback(
    async (selectedFile: File | null) => {
      if (!selectedFile) return;

      setFile(selectedFile);
      setError(null);

      try {
        const content = await readImportFile(selectedFile);
        const parsed = parseDelimited(content);

        if (parsed.length < 2) {
          setError("File must have at least a header row and one data row");
          return;
        }

        const fileHeaders = parsed[0];
        const fileData = parsed.slice(1).filter((row) => row.some((cell) => cell.trim()));

        setHeaders(fileHeaders);
        setParsedData(fileData);
        setSourceText(content);

        // Auto-detect mappings
        const detected = detectColumnMapping(fileHeaders, config.columns);
        setAutoDetectedMapping(detected);
        setColumnMapping(detected);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to read file");
      }
    },
    [config.columns]
  );

  // Handle manual mapping change
  const handleMappingChange = useCallback(
    (sourceColumn: string, targetField: string | null) => {
      setColumnMapping((prev) => {
        const updated = { ...prev };
        if (targetField) {
          updated[sourceColumn] = targetField;
        } else {
          delete updated[sourceColumn];
        }
        return updated;
      });
    },
    []
  );

  // Process source data with column mapping
  const processSource = useCallback(() => {
    if (headers.length === 0 || parsedData.length === 0) return;

    setError(null);
    const rows: ImportPlanRow<T>[] = [];

    for (let i = 0; i < parsedData.length; i++) {
      const rowValues = parsedData[i];
      const original: Record<string, string> = {};

      // Build original record using auto-detected positions
      headers.forEach((header, idx) => {
        original[header] = rowValues[idx] ?? "";
      });

      // Parse row with column mapping
      const parsed = config.parseRow(original, columnMapping);

      if (!parsed) {
        rows.push({
          rowIndex: i,
          original,
          parsed: {},
          action: "ERROR",
          error: "Failed to parse row",
        });
        continue;
      }

      // Validate row
      const validationError = config.validateRow(parsed, i);

      rows.push({
        rowIndex: i,
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
    setStep("mapping");
    setActiveStep(1);
  }, [headers, parsedData, columnMapping, config]);

  // Run import
  const runImport = useCallback(async () => {
    const validRows = plan.filter((r) => r.action === "CREATE");
    if (validRows.length === 0) return;

    setImporting(true);
    setProgress(0);
    setCurrentRow(0);
    setError(null);
    setStep("apply");
    setActiveStep(2);

    try {
      const importResult = await config.importFn(validRows, (current, total) => {
        setCurrentRow(current);
        setProgress(Math.round((current / total) * 100));
      });

      setProgress(100);
      setCurrentRow(validRows.length);
      setResult(importResult);
      setStep("results");
      setActiveStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
      setStep("validation");
      setActiveStep(2);
    } finally {
      setImporting(false);
    }
  }, [plan, config]);

  // Download template
  const downloadTemplate = useCallback(() => {
    const headers = config.columns.map((col) => col.header);
    const sampleRows = [
      config.columns.map((col) => {
        switch (col.key) {
          case "sku":
            return "SKU001";
          case "name":
            return "Sample Product";
          case "type":
            return "PRODUCT";
          case "price":
            return "25000";
          case "is_active":
            return "true";
          case "item_sku":
            return "SKU001";
          case "scope":
            return "default";
          default:
            return "";
        }
      }),
    ];
    const csv = rowsToCsv(headers, sampleRows);
    downloadCsv(csv, `${config.entityType}-import-template.csv`);
  }, [config]);

  // Reset wizard
  const reset = useCallback(() => {
    setStep("source");
    setActiveStep(0);
    setFile(null);
    setSourceText("");
    setHeaders([]);
    setParsedData([]);
    setColumnMapping({});
    setAutoDetectedMapping({});
    setPlan([]);
    setSummary({ total: 0, create: 0, skip: 0, error: 0 });
    setResult(null);
    setImporting(false);
    setProgress(0);
    setCurrentRow(0);
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

  // Go to validation step
  const goToValidation = useCallback(() => {
    setStep("validation");
    setActiveStep(2);
  }, []);

  // Render step content
  const renderStepContent = () => {
    switch (step) {
      case "source":
        return (
          <Stack gap="md">
            <div>
              <Text fw={500} size="lg">
                Upload File
              </Text>
              <Text size="sm" c="dimmed">
                Upload a CSV or TXT file to import {config.entityName}
              </Text>
            </div>

            {/* Template Download */}
            <Card withBorder bg="blue.0">
              <Group justify="space-between" align="center">
                <div>
                  <Text size="sm" fw={500}>
                    Download Template
                  </Text>
                  <Text size="xs" c="dimmed">
                    {config.csvDescription}
                  </Text>
                </div>
                <Button
                  variant="light"
                  size="sm"
                  leftSection={<IconDownload size={14} />}
                  onClick={downloadTemplate}
                >
                  Template
                </Button>
              </Group>
            </Card>

            {/* Dropzone */}
            <Card
              withBorder
              style={{
                borderStyle: "dashed",
                borderWidth: 2,
                backgroundColor: "var(--mantine-color-gray-0)",
                cursor: "pointer",
                transition: "all 200ms ease",
              }}
              p="xl"
            >
              <Stack align="center" gap="md">
                <ThemeIcon size={60} variant="light" color="blue">
                  <IconFileSpreadsheet size={30} />
                </ThemeIcon>
                <div style={{ textAlign: "center" }}>
                  <Text size="lg" fw={500}>
                    Drag CSV/TXT file here or click to browse
                  </Text>
                  <Text size="sm" c="dimmed">
                    File should not exceed 10MB
                  </Text>
                </div>
                <FileInput
                  accept=".csv,.txt"
                  placeholder="Select file..."
                  onChange={handleFileSelect}
                  style={{ width: "100%", maxWidth: 300 }}
                />
              </Stack>
            </Card>

            {/* Or paste */}
            <Group justify="center">
              <Text size="sm" c="dimmed">
                or paste data directly
              </Text>
            </Group>

            <Textarea
              placeholder="Paste CSV data here..."
              value={sourceText}
              onChange={(e) => {
                setSourceText(e.currentTarget.value);
                if (e.currentTarget.value) {
                  const parsed = parseDelimited(e.currentTarget.value);
                  if (parsed.length >= 2) {
                    setHeaders(parsed[0]);
                    setParsedData(parsed.slice(1).filter((row) => row.some((cell) => cell.trim())));
                    const detected = detectColumnMapping(parsed[0], config.columns);
                    setAutoDetectedMapping(detected);
                    setColumnMapping(detected);
                  }
                }
              }}
              minRows={4}
            />

            {/* File Info */}
            {file && (
              <Card withBorder>
                <Group justify="space-between">
                  <Group gap="sm">
                    <ThemeIcon color="green" variant="light">
                      <IconCheck size={16} />
                    </ThemeIcon>
                    <div>
                      <Text size="sm" fw={500}>
                        {file.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {(file.size / 1024).toFixed(1)} KB • {parsedData.length} rows •{" "}
                        {headers.length} columns
                      </Text>
                    </div>
                  </Group>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => {
                      setFile(null);
                      setHeaders([]);
                      setParsedData([]);
                      setColumnMapping({});
                      setSourceText("");
                    }}
                  >
                    <IconX size={16} />
                  </ActionIcon>
                </Group>
              </Card>
            )}

            {error && (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                {error}
              </Alert>
            )}

            <Group justify="flex-end">
              <Button variant="default" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                onClick={processSource}
                disabled={headers.length === 0 || parsedData.length === 0}
                rightSection={<IconArrowRight size={16} />}
              >
                Continue to Mapping
              </Button>
            </Group>
          </Stack>
        );

      case "mapping":
        return (
          <Stack gap="md">
            <div>
              <Text fw={500} size="lg">
                Map Columns
              </Text>
              <Text size="sm" c="dimmed">
                Match your file columns to {config.entityName} fields
              </Text>
            </div>

            {/* Mapping Stats */}
            <Group>
              <Badge color="blue" variant="light">
                {Object.keys(columnMapping).length} of {headers.length} mapped
              </Badge>
              {config.columns.filter((c) => c.required).every((c) =>
                Object.values(columnMapping).includes(c.key.toString())
              ) ? (
                <Badge color="green" variant="light" leftSection={<IconCheck size={12} />}>
                  Required fields mapped
                </Badge>
              ) : (
                <Badge color="orange" variant="light" leftSection={<IconAlertCircle size={12} />}>
                  Missing required fields
                </Badge>
              )}
            </Group>

            {/* Mapping Table */}
            <Card withBorder>
              <ScrollArea>
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>File Column</Table.Th>
                      <Table.Th>Sample Values</Table.Th>
                      <Table.Th>Map to Field</Table.Th>
                      <Table.Th>Status</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {headers.map((header, idx) => {
                      const mapping = columnMapping[header];
                      const isAutoDetected = autoDetectedMapping[header] === mapping;
                      const sampleValues = parsedData
                        .slice(0, 3)
                        .map((row) => row[idx])
                        .filter(Boolean);

                      return (
                        <Table.Tr key={header}>
                          <Table.Td>
                            <Group gap="xs">
                              <Text size="sm" fw={500}>
                                {header}
                              </Text>
                              {isAutoDetected && mapping && (
                                <Badge size="xs" color="blue" variant="dot">
                                  auto
                                </Badge>
                              )}
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Stack gap={2}>
                              {sampleValues.map((val, i) => (
                                <Text key={i} size="xs" c="dimmed" lineClamp={1}>
                                  {val}
                                </Text>
                              ))}
                              {sampleValues.length === 0 && (
                                <Text size="xs" c="dimmed" fs="italic">
                                  (empty)
                                </Text>
                              )}
                            </Stack>
                          </Table.Td>
                          <Table.Td>
                            <Select
                              placeholder="Select field..."
                              data={availableFields}
                              value={mapping}
                              onChange={(value) => handleMappingChange(header, value)}
                              searchable
                              clearable
                            />
                          </Table.Td>
                          <Table.Td>
                            <Group justify="center">
                              {mapping ? (
                                <ThemeIcon color="green" size="sm" variant="light">
                                  <IconCheck size={14} />
                                </ThemeIcon>
                              ) : (
                                <ThemeIcon color="gray" size="sm" variant="light">
                                  <IconX size={14} />
                                </ThemeIcon>
                              )}
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </Card>

            {/* Summary */}
            <Card withBorder bg="gray.0">
              <Group justify="space-between">
                <Text size="sm">
                  After mapping, {summary.total} rows will be processed
                </Text>
                <Group gap="xs">
                  <Badge color="green" variant="light">
                    {summary.create} valid
                  </Badge>
                  {summary.error > 0 && (
                    <Badge color="red" variant="light">
                      {summary.error} errors
                    </Badge>
                  )}
                </Group>
              </Group>
            </Card>

            {error && (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                {error}
              </Alert>
            )}

            <Group justify="space-between">
              <Button variant="default" onClick={() => { setStep("source"); setActiveStep(0); }}>
                Back
              </Button>
              <Button onClick={goToValidation} rightSection={<IconArrowRight size={16} />}>
                Validate Data
              </Button>
            </Group>
          </Stack>
        );

      case "validation":
        return (
          <Stack gap="md">
            <div>
              <Text fw={500} size="lg">
                Validation Preview
              </Text>
              <Text size="sm" c="dimmed">
                Review your data before importing
              </Text>
            </div>

            {/* Summary Stats */}
            <Group>
              <Badge size="lg" color="blue" variant="light">
                Total: {summary.total}
              </Badge>
              <Badge size="lg" color="green" variant="light" leftSection={<IconCheck size={14} />}>
                Valid: {summary.create}
              </Badge>
              <Badge
                size="lg"
                color={summary.error > 0 ? "red" : "gray"}
                variant="light"
                leftSection={summary.error > 0 ? <IconX size={14} /> : null}
              >
                Errors: {summary.error}
              </Badge>
            </Group>

            {summary.error > 0 && (
              <Alert color="orange" icon={<IconAlertCircle size={16} />}>
                {summary.error} row{summary.error !== 1 ? "s" : ""} have validation errors. You can
                proceed with the {summary.create} valid row{summary.create !== 1 ? "s" : ""} or
                go back to fix the errors.
              </Alert>
            )}

            {/* Preview Table */}
            <Card withBorder>
              <ScrollArea>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 60 }}>Row</Table.Th>
                      {headers.slice(0, 5).map((h) => (
                        <Table.Th key={h}>{h}</Table.Th>
                      ))}
                      {headers.length > 5 && <Table.Th>...</Table.Th>}
                      <Table.Th style={{ width: 100 }}>Status</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {plan.slice(0, 50).map((row) => (
                      <Table.Tr key={row.rowIndex}>
                        <Table.Td>{row.rowIndex + 1}</Table.Td>
                        {headers.slice(0, 5).map((h) => (
                          <Table.Td key={h}>
                            <Text size="sm" lineClamp={1}>
                              {row.original[h] || (
                                <em className="text-dimmed">(empty)</em>
                              )}
                            </Text>
                          </Table.Td>
                        ))}
                        {headers.length > 5 && <Table.Td>...</Table.Td>}
                        <Table.Td>
                          {row.action === "CREATE" ? (
                            <Badge color="green" variant="light" size="sm">
                              Valid
                            </Badge>
                          ) : (
                            <Tooltip label={row.error}>
                              <Badge color="red" variant="light" size="sm">
                                {row.error?.substring(0, 30)}
                                {(row.error?.length ?? 0) > 30 ? "..." : ""}
                              </Badge>
                            </Tooltip>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
              {plan.length > 50 && (
                <Text size="xs" c="dimmed" ta="center" py="xs">
                  Showing first 50 rows of {plan.length}
                </Text>
              )}
            </Card>

            {error && (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                {error}
              </Alert>
            )}

            <Group justify="space-between">
              <Button
                variant="default"
                onClick={() => { setStep("mapping"); setActiveStep(1); }}
              >
                Back to Mapping
              </Button>
              <Group>
                <Button variant="default" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button
                  onClick={runImport}
                  disabled={summary.create === 0 || importing}
                  loading={importing}
                >
                  Import {summary.create} {config.entityName}
                </Button>
              </Group>
            </Group>
          </Stack>
        );

      case "apply":
        return (
          <Stack gap="md" align="center" py="xl">
            <Loader size="lg" />
            <Text fw={500} size="lg">
              Importing {config.entityName}...
            </Text>
            <Progress
              value={progress}
              w="100%"
              size="lg"
              animated
              color="blue"
            />
            <Text size="sm" c="dimmed">
              Processing row {currentRow} of {summary.create}
            </Text>
            {error && (
              <Alert color="red" icon={<IconAlertCircle size={16} />}>
                {error}
              </Alert>
            )}
          </Stack>
        );

      case "results":
        return (
          <Stack gap="md">
            <div>
              <Text fw={500} size="lg">
                Import Complete
              </Text>
              <Text size="sm" c="dimmed">
                Your import has finished processing
              </Text>
            </div>

            {result && (
              <>
                {/* Result Summary */}
                <Group grow>
                  <Card withBorder>
                    <Stack align="center" gap="xs">
                      <ThemeIcon
                        color={result.failed === 0 ? "green" : "yellow"}
                        size={60}
                        radius="xl"
                        variant="light"
                      >
                        {result.failed === 0 ? (
                          <IconCheck size={30} />
                        ) : (
                          <IconAlertCircle size={30} />
                        )}
                      </ThemeIcon>
                      <Text size="xl" fw={700}>
                        {result.success}
                      </Text>
                      <Text size="sm" c="dimmed">
                        Successful
                      </Text>
                    </Stack>
                  </Card>

                  {result.created > 0 && (
                    <Card withBorder>
                      <Stack align="center" gap="xs">
                        <ThemeIcon color="blue" size={60} radius="xl" variant="light">
                          <IconCheck size={30} />
                        </ThemeIcon>
                        <Text size="xl" fw={700}>
                          {result.created}
                        </Text>
                        <Text size="sm" c="dimmed">
                          Created
                        </Text>
                      </Stack>
                    </Card>
                  )}

                  {result.updated > 0 && (
                    <Card withBorder>
                      <Stack align="center" gap="xs">
                        <ThemeIcon color="cyan" size={60} radius="xl" variant="light">
                          <IconRefresh size={30} />
                        </ThemeIcon>
                        <Text size="xl" fw={700}>
                          {result.updated}
                        </Text>
                        <Text size="sm" c="dimmed">
                          Updated
                        </Text>
                      </Stack>
                    </Card>
                  )}

                  {result.failed > 0 && (
                    <Card withBorder>
                      <Stack align="center" gap="xs">
                        <ThemeIcon color="red" size={60} radius="xl" variant="light">
                          <IconX size={30} />
                        </ThemeIcon>
                        <Text size="xl" fw={700}>
                          {result.failed}
                        </Text>
                        <Text size="sm" c="dimmed">
                          Failed
                        </Text>
                      </Stack>
                    </Card>
                  )}
                </Group>

                {/* Error Details */}
                {result.errors.length > 0 && (
                  <Card withBorder>
                    <Stack gap="sm">
                      <Text fw={500}>Failed Rows</Text>
                      <ScrollArea.Autosize mah={200}>
                        <Stack gap={4}>
                          {result.errors.slice(0, 20).map((err, idx) => (
                            <Group key={idx} justify="space-between">
                              <Text size="sm">Row {err.row}</Text>
                              <Text size="sm" c="red">
                                {err.error}
                              </Text>
                            </Group>
                          ))}
                          {result.errors.length > 20 && (
                            <Text size="xs" c="dimmed">
                              +{result.errors.length - 20} more errors
                            </Text>
                          )}
                        </Stack>
                      </ScrollArea.Autosize>
                    </Stack>
                  </Card>
                )}
              </>
            )}

            <Divider />

            <Group justify="flex-end">
              <Button variant="default" onClick={reset}>
                Import More
              </Button>
              <Button onClick={handleComplete}>Done</Button>
            </Group>
          </Stack>
        );

      default:
        return null;
    }
  };

  return (
    <Stack>
      {/* Stepper */}
      <Stepper active={activeStep} onStepClick={setActiveStep} size="sm">
        {steps.map((s, idx) => (
          <Stepper.Step key={idx} label={s.label} description={s.description} />
        ))}
      </Stepper>

      <Divider />

      {/* Step Content */}
      {renderStepContent()}
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
