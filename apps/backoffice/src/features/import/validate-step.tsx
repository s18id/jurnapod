// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Alert, Button, Collapse, Group, Stack, Text } from "@mantine/core";
import { IconAlertCircle, IconArrowLeft, IconArrowRight, IconDownload } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";

import { ImportValidationPreview } from "../../components/import-validation-preview";
import type { ImportWizardState } from "../../hooks/use-import";
import { downloadCsvFile, generateValidationErrorCsv } from "./error-csv-generator";

type ValidateStepProps = {
  state: ImportWizardState;
  isMobile: boolean;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onProceed: () => void;
  onReset: () => void;
};

export function ValidateStep({ state, isMobile, loading, error, onBack, onProceed, onReset }: ValidateStepProps) {
  const [detailsOpen, detailsHandlers] = useDisclosure(!isMobile);
  const validationResult = state.validationResult;

  if (!validationResult) {
    return <Alert color="orange">Validation has not run for this import session.</Alert>;
  }

  const downloadValidationErrors = () => {
    downloadCsvFile(generateValidationErrorCsv(validationResult), "import-validation-errors.csv");
  };

  if (isMobile) {
    return (
      <Stack gap="md">
        <Text fw={500}>Validation Results</Text>
        <Group grow>
          <Button variant="light">Valid: {validationResult.validRows}</Button>
          <Button variant="light" color={validationResult.errorRows > 0 ? "red" : "gray"}>Errors: {validationResult.errorRows}</Button>
        </Group>
        {validationResult.errorRows > 0 && <Button variant="subtle" onClick={detailsHandlers.toggle}>View details</Button>}
        <Collapse in={detailsOpen}>
          <ImportValidationPreview validationResult={validationResult} sampleData={state.sampleData} columns={state.columns} onCancel={onReset} onProceed={onProceed} loading={loading} />
        </Collapse>
        {validationResult.errorRows > 0 && <Button variant="light" leftSection={<IconDownload size={16} />} onClick={downloadValidationErrors}>Download Error CSV</Button>}
        {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
        <Group justify="space-between">
          <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={onBack}>Fix Mapping</Button>
          <Button rightSection={<IconArrowRight size={16} />} disabled={validationResult.validRows === 0} onClick={onProceed}>Continue</Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <ImportValidationPreview
        validationResult={validationResult}
        sampleData={state.sampleData}
        columns={state.columns}
        onCancel={onReset}
        onProceed={onProceed}
        proceedLabel="Continue to Apply"
        cancelLabel="Restart"
        loading={loading}
      />
      {validationResult.errorRows > 0 && <Button variant="light" leftSection={<IconDownload size={16} />} onClick={downloadValidationErrors}>Download Validation Error CSV</Button>}
      {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}
      <Group justify="flex-start">
        <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={onBack}>Back to Mapping</Button>
      </Group>
    </Stack>
  );
}
