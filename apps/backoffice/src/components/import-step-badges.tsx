// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Badge, Group } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";

export type ImportStep = "source" | "preview" | "apply";

type ImportStepBadgesProps = {
  step: ImportStep;
};

export function ImportStepBadges(props: ImportStepBadgesProps) {
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
