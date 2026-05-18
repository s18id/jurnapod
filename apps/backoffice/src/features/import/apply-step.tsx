// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Alert, Button, Card, Group, Modal, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconAlertCircle, IconArrowLeft, IconDownload, IconPlayerPlay, IconRefresh } from "@tabler/icons-react";

import { ImportProgress } from "../../components/import-progress";
import type { ApplyProgress, ImportWizardState } from "../../hooks/use-import";
import { downloadCsvFile, generateApplyErrorCsv } from "./error-csv-generator";

type ApplyStepProps = {
  state: ImportWizardState;
  progress: ApplyProgress | null;
  loading: boolean;
  error: string | null;
  isMobile: boolean;
  onApply: () => Promise<void>;
  onBack: () => void;
  onDone: () => void;
  onCancel: () => void;
};

export function ApplyStep({ state, progress, loading, error, isMobile, onApply, onBack, onDone, onCancel }: ApplyStepProps) {
  const [confirmOpen, confirmHandlers] = useDisclosure(false);
  const validation = state.validationResult;
  const result = state.applyResult;

  const downloadApplyErrors = () => {
    if (!result) return;
    downloadCsvFile(generateApplyErrorCsv(result), "import-apply-errors.csv");
  };

  if (loading || error || result) {
    return (
      <Stack gap="md">
        <ImportProgress
          progress={progress}
          loading={loading}
          error={error}
          result={result}
          onCancel={onCancel}
          onDone={onDone}
          onRetry={onApply}
        />
        {result?.canResume && (
          <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={onApply}>
            Resume from checkpoint
          </Button>
        )}
        {result && result.failed > 0 && (
          <Button variant="light" leftSection={<IconDownload size={16} />} onClick={downloadApplyErrors}>
            Download Errors
          </Button>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {!validation && <Alert color="orange" icon={<IconAlertCircle size={16} />}>Validate the import before applying.</Alert>}
      {validation && (
        <Card withBorder>
          <Stack gap="xs">
            <Text fw={500}>Ready to Apply</Text>
            <Text size="sm" c="dimmed">Confirm before applying the validated rows synchronously.</Text>
            <Group>
              <Text>Valid rows: {validation.validRows}</Text>
              <Text>Skipped/failed before apply: {validation.errorRows}</Text>
            </Group>
          </Stack>
        </Card>
      )}

      <Group justify="space-between">
        <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={onBack}>Back</Button>
        <Button leftSection={<IconPlayerPlay size={16} />} disabled={!validation || validation.validRows === 0} onClick={confirmHandlers.open}>
          Apply Import
        </Button>
      </Group>

      <Modal opened={confirmOpen} onClose={confirmHandlers.close} title="Confirm Import Apply" fullScreen={isMobile}>
        <Stack gap="md">
          <Text>Apply {validation?.validRows ?? 0} validated rows now?</Text>
          <Text size="sm" c="dimmed">Import apply is synchronous. Keep this tab open until completion.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={confirmHandlers.close}>Cancel</Button>
            <Button onClick={() => { confirmHandlers.close(); void onApply(); }}>Confirm Apply</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
