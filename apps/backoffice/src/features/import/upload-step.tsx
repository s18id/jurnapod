// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState } from "react";
import { Alert, Button, Card, FileInput, Group, Progress, Stack, Table, Text } from "@mantine/core";
import { IconAlertCircle, IconDownload, IconFileSpreadsheet, IconRefresh } from "@tabler/icons-react";

import type { ImportWizardState } from "../../hooks/use-import";

const ALLOWED_EXTENSIONS = [".csv", ".xlsx"];

export function validateImportFile(file: Pick<File, "name">): string | null {
  const normalizedName = file.name.toLowerCase();
  const isAllowed = ALLOWED_EXTENSIONS.some((extension) => normalizedName.endsWith(extension));
  return isAllowed ? null : "File must be a CSV or XLSX file.";
}

type UploadStepProps = {
  state: ImportWizardState;
  loading: boolean;
  error: string | null;
  progress: number;
  templateLoading: boolean;
  isMobile: boolean;
  onUpload: (file: File) => Promise<void>;
  onDownloadTemplate: () => Promise<void>;
  onContinueRecovered: () => void;
  onCancel: () => void;
};

export function UploadStep({
  state,
  loading,
  error,
  progress,
  templateLoading,
  isMobile,
  onUpload,
  onDownloadTemplate,
  onContinueRecovered,
  onCancel,
}: UploadStepProps) {
  const [fileError, setFileError] = useState<string | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    const validationError = validateImportFile(file);
    if (validationError) {
      setFileError(validationError);
      return;
    }
    setFileError(null);
    await onUpload(file);
  };

  return (
    <Stack gap="md">
      {state.sessionError && (
        <Alert color="red" icon={<IconAlertCircle size={16} />} title="Session expired">
          {state.sessionError}
        </Alert>
      )}

      {state.recoveredFromSession && state.uploadId && (
        <Alert color="blue" icon={<IconRefresh size={16} />} title="Import session recovered">
          <Group justify="space-between" align="center">
            <Text size="sm">Session {state.uploadId} was recovered from this browser tab.</Text>
            <Button size="xs" variant="light" onClick={onContinueRecovered}>
              Resume {state.step}
            </Button>
          </Group>
        </Alert>
      )}

      <Card withBorder bg="blue.0">
        <Group justify="space-between" align="center">
          <div>
            <Text fw={500}>Download Template</Text>
            <Text size="sm" c="dimmed">Use the backend import template for the current entity.</Text>
          </div>
          <Button leftSection={<IconDownload size={16} />} loading={templateLoading} onClick={onDownloadTemplate}>
            Template
          </Button>
        </Group>
      </Card>

      <Card withBorder p="xl" style={{ borderStyle: isMobile ? "solid" : "dashed" }}>
        <Stack align="center" gap="md">
          <IconFileSpreadsheet size={44} />
          <Text fw={500}>{isMobile ? "Choose CSV/XLSX file" : "Drag a CSV/XLSX file here or choose a file"}</Text>
          <FileInput accept=".csv,.xlsx" placeholder="Select file" onChange={handleFile} disabled={loading} />
        </Stack>
      </Card>

      {loading && <Progress value={progress} animated />}
      {(fileError || error) && (
        <Alert color="red" icon={<IconAlertCircle size={16} />}>
          {fileError ?? error}
        </Alert>
      )}

      {state.columns.length > 0 && (
        <Card withBorder>
          <Text fw={500} mb="sm">Preview first 5 rows</Text>
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>{state.columns.map((column) => <Table.Th key={column}>{column}</Table.Th>)}</Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {state.sampleData.slice(0, 5).map((row, rowIndex) => (
                <Table.Tr key={rowIndex}>{state.columns.map((column, columnIndex) => <Table.Td key={column}>{row[columnIndex] ?? ""}</Table.Td>)}</Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      )}

      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>Cancel</Button>
      </Group>
    </Stack>
  );
}
