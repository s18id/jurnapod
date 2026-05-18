// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Badge, Group } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";

export type ImportStep = "source" | "preview" | "apply" | "upload" | "mapping" | "validation" | "results";

type ImportStepBadgesProps = {
  step: ImportStep;
  variant?: "legacy" | "staged";
};

export function ImportStepBadges(props: ImportStepBadgesProps) {
  if (props.variant === "staged") {
    const steps: ImportStep[] = ["upload", "mapping", "validation", "apply", "results"];
    const labels: Record<string, string> = {
      upload: "1. Upload",
      mapping: "2. Map",
      validation: "3. Validate",
      apply: "4. Apply",
      results: "5. Complete",
    };
    const currentIndex = steps.indexOf(props.step);
    return (
      <Group gap="xs">
        {steps.map((step, index) => (
          <Group key={step} gap="xs">
            <Badge color={index === currentIndex ? "blue" : index < currentIndex ? "green" : "gray"}>
              {labels[step]}
            </Badge>
            {index < steps.length - 1 && <IconArrowRight size={14} />}
          </Group>
        ))}
      </Group>
    );
  }

  return (
    <Group gap="xs">
      <Badge color={props.step === "source" ? "blue" : "green"}>1. Source</Badge>
      <IconArrowRight size={14} />
      <Badge color={props.step === "preview" ? "blue" : props.step === "apply" ? "green" : "gray"}>
        2. Preview
      </Badge>
      <IconArrowRight size={14} />
      <Badge color={props.step === "apply" ? "blue" : "gray"}>3. Apply</Badge>
    </Group>
  );
}
