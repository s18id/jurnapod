import { Badge, Button, Group, Stack, Text } from "@mantine/core";

import type { ReviewSectionStatus } from "./ReviewSection";
import { getReviewSectionBadgeColor } from "./ReviewSection";

export interface ReviewStepperStep {
  id: string;
  title: string;
  status: ReviewSectionStatus;
}

export interface ReviewStepperProps {
  steps: ReviewStepperStep[];
  activeStepId?: string;
  onStepSelect?: (id: string) => void;
}

export function ReviewStepper({ steps, activeStepId, onStepSelect }: ReviewStepperProps) {
  return (
    <Stack gap="xs" role="list" aria-label="Form review steps">
      {steps.map((step, index) => {
        const active = step.id === activeStepId;
        return (
          <Group key={step.id} role="listitem" gap="sm" wrap="nowrap">
            <Button
              variant={active ? "filled" : "light"}
              color={active ? "blue" : "gray"}
              onClick={() => onStepSelect?.(step.id)}
              aria-current={active ? "step" : undefined}
              aria-label={`Go to step ${index + 1}: ${step.title}`}
            >
              {index + 1}
            </Button>
            <Stack gap={0} style={{ flex: 1 }}>
              <Text fw={active ? 700 : 500}>{step.title}</Text>
              <Badge color={getReviewSectionBadgeColor(step.status)} aria-label={`${step.title} status ${step.status}`}>
                {step.status}
              </Badge>
            </Stack>
          </Group>
        );
      })}
    </Stack>
  );
}
