// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Alert, Card, Group, Stack, Text, Title } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { IconAlertCircle } from "@tabler/icons-react";

import { ImportStepBadges } from "../../components/import-step-badges";
import { useImportWizard, type ImportEntityType } from "../../hooks/use-import";
import { ApplyStep } from "./apply-step";
import { getImportFieldDefinitions } from "./import-fields";
import { MapStep } from "./map-step";
import { UploadStep } from "./upload-step";
import { ValidateStep } from "./validate-step";

type StagedImportWorkflowProps = {
  entityType: ImportEntityType;
  title?: string;
  onComplete: () => void;
  onCancel: () => void;
};

export function StagedImportWorkflow({ entityType, title, onComplete, onCancel }: StagedImportWorkflowProps) {
  const wizard = useImportWizard({ entityType });
  const isMobile = useMediaQuery("(max-width: 48em)") ?? false;
  const fields = getImportFieldDefinitions(entityType);
  const entityName = entityType === "items" ? "items" : "prices";

  const handleDone = () => {
    wizard.reset();
    onComplete();
  };

  const handleCancel = () => {
    wizard.reset();
    onCancel();
  };

  const renderStep = () => {
    switch (wizard.state.step) {
      case "upload":
        return (
          <UploadStep
            state={wizard.state}
            loading={wizard.uploadLoading}
            error={wizard.uploadError}
            progress={wizard.uploadProgress}
            templateLoading={wizard.templateLoading}
            isMobile={isMobile}
            onUpload={wizard.uploadFile}
            onDownloadTemplate={wizard.downloadTemplate}
            onContinueRecovered={() => wizard.goToStep(wizard.state.step === "upload" ? "mapping" : wizard.state.step)}
            onCancel={handleCancel}
          />
        );
      case "mapping":
        return (
          <MapStep
            state={wizard.state}
            fields={fields}
            isMobile={isMobile}
            loading={wizard.validateLoading}
            error={wizard.validateError}
            onMappingChange={wizard.updateMapping}
            onBack={() => wizard.goToStep("upload")}
            onValidate={wizard.validateMappings}
          />
        );
      case "validation":
        return (
          <ValidateStep
            state={wizard.state}
            isMobile={isMobile}
            loading={wizard.validateLoading}
            error={wizard.validateError}
            onBack={() => wizard.goToStep("mapping")}
            onProceed={() => wizard.goToStep("apply")}
            onReset={wizard.reset}
          />
        );
      case "apply":
      case "results":
        return (
          <ApplyStep
            state={wizard.state}
            progress={wizard.applyProgress}
            loading={wizard.applyLoading}
            error={wizard.applyError}
            isMobile={isMobile}
            onApply={wizard.executeImport}
            onBack={() => wizard.goToStep("validation")}
            onDone={handleDone}
            onCancel={handleCancel}
          />
        );
      default:
        return <Alert color="red" icon={<IconAlertCircle size={16} />}>Unknown import step.</Alert>;
    }
  };

  return (
    <Stack gap="md" data-testid={`staged-import-${entityType}`}>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={3}>{title ?? `Import ${entityName}`}</Title>
          <Text size="sm" c="dimmed">Upload → Map → Validate → Apply → Complete</Text>
        </div>
        <ImportStepBadges step={wizard.state.step} variant="staged" />
      </Group>
      {wizard.state.recoveredFromSession && wizard.state.sessionError && wizard.state.step !== "upload" && (
        <Alert color="blue" title="Import session recovered">
          {wizard.state.sessionError}
        </Alert>
      )}
      <Card withBorder p={isMobile ? "sm" : "md"} style={{ minHeight: isMobile ? "calc(100vh - 9rem)" : undefined }}>
        {renderStep()}
      </Card>
    </Stack>
  );
}
