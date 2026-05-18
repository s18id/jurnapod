// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useMemo, useState } from "react";
import { Alert, Button, Card, Group, Select, Stack, Text } from "@mantine/core";
import { IconAlertCircle, IconArrowLeft, IconArrowRight } from "@tabler/icons-react";

import { ImportColumnMapper } from "../../components/import-column-mapper";
import type { ColumnMapping, ImportWizardState } from "../../hooks/use-import";
import type { ImportFieldDefinition } from "./import-fields";

export function hasRequiredMappings(
  mappings: Pick<ColumnMapping, "targetField">[],
  fields: Pick<ImportFieldDefinition, "value" | "required">[]
): boolean {
  const mapped = new Set(mappings.map((mapping) => mapping.targetField).filter(Boolean));
  return fields.filter((field) => field.required).every((field) => mapped.has(field.value));
}

type MapStepProps = {
  state: ImportWizardState;
  fields: ImportFieldDefinition[];
  isMobile: boolean;
  loading: boolean;
  error: string | null;
  onMappingChange: (index: number, targetField: string) => void;
  onBack: () => void;
  onValidate: () => Promise<void>;
};

export function MapStep({
  state,
  fields,
  isMobile,
  loading,
  error,
  onMappingChange,
  onBack,
  onValidate,
}: MapStepProps) {
  const [mobileIndex, setMobileIndex] = useState(0);
  const canProceed = useMemo(() => hasRequiredMappings(state.mappings, fields), [fields, state.mappings]);
  const currentMapping = state.mappings[mobileIndex];

  return (
    <Stack gap="md">
      {isMobile ? (
        <Card withBorder>
          <Stack gap="md">
            <Text fw={500}>Column {mobileIndex + 1} of {state.columns.length}</Text>
            <Text>{currentMapping?.sourceColumn ?? "Unknown column"}</Text>
            <Select
              label="Map to field"
              data={fields}
              value={currentMapping?.targetField ?? ""}
              onChange={(value) => onMappingChange(mobileIndex, value ?? "")}
              searchable
              clearable
            />
            <Group justify="space-between">
              <Button variant="default" disabled={mobileIndex === 0} onClick={() => setMobileIndex((value) => value - 1)}>Previous</Button>
              <Button variant="default" disabled={mobileIndex >= state.columns.length - 1} onClick={() => setMobileIndex((value) => value + 1)}>Next</Button>
            </Group>
          </Stack>
        </Card>
      ) : (
        <ImportColumnMapper
          columns={state.columns}
          sampleData={state.sampleData}
          mappings={state.mappings}
          onMappingChange={onMappingChange}
          availableFields={fields}
        />
      )}

      {!canProceed && (
        <Alert color="orange" icon={<IconAlertCircle size={16} />}>
          Map all required fields before validation.
        </Alert>
      )}
      {error && <Alert color="red" icon={<IconAlertCircle size={16} />}>{error}</Alert>}

      <Group justify="space-between">
        <Button variant="default" leftSection={<IconArrowLeft size={16} />} onClick={onBack}>Back</Button>
        <Button rightSection={<IconArrowRight size={16} />} disabled={!canProceed || loading} loading={loading} onClick={onValidate}>
          Validate Data
        </Button>
      </Group>
    </Stack>
  );
}
