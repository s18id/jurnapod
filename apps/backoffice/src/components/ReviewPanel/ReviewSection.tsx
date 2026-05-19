import { Badge, Button, Card, Collapse, Group, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";

export type ReviewSectionStatus = "incomplete" | "in-progress" | "complete" | "invalid";

export interface ReviewSectionProps {
  id: string;
  title: string;
  description?: string;
  status: ReviewSectionStatus;
  expanded: boolean;
  children: ReactNode;
  errors?: string[];
  onToggle?: (id: string) => void;
  onComplete?: (id: string) => void;
}

const STATUS_LABELS: Record<ReviewSectionStatus, string> = {
  incomplete: "Incomplete",
  "in-progress": "In progress",
  complete: "Complete",
  invalid: "Invalid",
};

const STATUS_COLORS: Record<ReviewSectionStatus, string> = {
  incomplete: "red",
  "in-progress": "yellow",
  complete: "green",
  invalid: "red",
};

export function getReviewSectionBadgeColor(status: ReviewSectionStatus): string {
  return STATUS_COLORS[status];
}

export function ReviewSection({
  id,
  title,
  description,
  status,
  expanded,
  children,
  errors = [],
  onToggle,
  onComplete,
}: ReviewSectionProps) {
  const panelId = `${id}-panel`;
  return (
    <Card withBorder radius="md" p="md" component="section" aria-labelledby={`${id}-title`}>
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Text id={`${id}-title`} fw={700}>{title}</Text>
            {description ? <Text size="sm" c="dimmed">{description}</Text> : null}
          </Stack>
          <Badge color={STATUS_COLORS[status]} aria-label={`${title} section status: ${STATUS_LABELS[status]}`}>
            {STATUS_LABELS[status]}
          </Badge>
        </Group>
        {errors.length > 0 ? (
          <Stack gap={2} role="alert" aria-label={`${title} validation errors`}>
            {errors.map((error) => <Text key={error} size="sm" c="red">{error}</Text>)}
          </Stack>
        ) : null}
        <Button
          variant="subtle"
          onClick={() => onToggle?.(id)}
          aria-controls={panelId}
          aria-expanded={expanded}
        >
          {expanded ? "Hide section" : "Show section"}
        </Button>
        <Collapse in={expanded} id={panelId} aria-expanded={expanded}>
          <Stack gap="md">
            {children}
            <Button onClick={() => onComplete?.(id)} aria-label={`Complete ${title} section`}>
              Mark section complete
            </Button>
          </Stack>
        </Collapse>
      </Stack>
    </Card>
  );
}
