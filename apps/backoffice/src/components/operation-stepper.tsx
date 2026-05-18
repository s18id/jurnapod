// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Group, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconCircleCheck, IconCircleDashed, IconCircleX, IconPlayerPlay, IconBan } from "@tabler/icons-react";

import type { OperationStatus } from "@/hooks/use-operation-progress";

export interface OperationLifecycleStep {
  status: OperationStatus;
  label: string;
  description: string;
  active: boolean;
  complete: boolean;
  color: string;
}

const TERMINAL_LABELS: Record<OperationStatus, { label: string; description: string; color: string }> = {
  running: {
    label: "Running",
    description: "The backend is processing the operation.",
    color: "blue",
  },
  completed: {
    label: "Completed",
    description: "The operation finished successfully.",
    color: "green",
  },
  failed: {
    label: "Failed",
    description: "The operation stopped with an error.",
    color: "red",
  },
  cancelled: {
    label: "Cancelled",
    description: "The operation was cancelled before completion.",
    color: "yellow",
  },
};

export function getOperationLifecycleSteps(status: OperationStatus): OperationLifecycleStep[] {
  const runningComplete = status !== "running";
  const terminalStep = status === "running" ? "completed" : status;

  return [
    {
      status: "running",
      ...TERMINAL_LABELS.running,
      active: status === "running",
      complete: runningComplete,
    },
    {
      status: terminalStep,
      ...TERMINAL_LABELS[terminalStep],
      active: status !== "running",
      complete: status !== "running",
    },
  ];
}

function StepIcon({ step }: { step: OperationLifecycleStep }) {
  if (step.complete && step.status === "completed") return <IconCircleCheck size={18} />;
  if (step.status === "failed") return <IconCircleX size={18} />;
  if (step.status === "cancelled") return <IconBan size={18} />;
  if (step.active) return <IconPlayerPlay size={18} />;
  return <IconCircleDashed size={18} />;
}

export function OperationStepper({ status }: { status: OperationStatus }) {
  const steps = getOperationLifecycleSteps(status);

  return (
    <Stack gap="sm" aria-label="Operation lifecycle">
      {steps.map((step) => (
        <Group key={`${step.status}-${step.label}`} gap="sm" align="flex-start" wrap="nowrap">
          <ThemeIcon color={step.color} variant={step.active || step.complete ? "filled" : "light"} radius="xl" size="lg">
            <StepIcon step={step} />
          </ThemeIcon>
          <Stack gap={2}>
            <Text fw={step.active ? 700 : 600}>{step.label}</Text>
            <Text size="sm" c="dimmed">{step.description}</Text>
          </Stack>
        </Group>
      ))}
    </Stack>
  );
}
