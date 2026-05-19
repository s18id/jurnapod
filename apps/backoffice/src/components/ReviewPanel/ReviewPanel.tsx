import { Alert, Badge, Button, Card, Checkbox, Group, Modal, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { hasHighValueMoneyDelta } from "@/lib/diff-engine";
import type { DiffChange } from "@/lib/diff-engine";

import { DiffView } from "./DiffView";
import { ReviewSection } from "./ReviewSection";
import type { ReviewSectionStatus } from "./ReviewSection";
import { ReviewStepper } from "./ReviewStepper";

export type ReviewPanelRolloutMode = "off" | "shadow" | "10" | "50" | "100";

export interface ReviewPanelFeatureFlag {
  mode: ReviewPanelRolloutMode;
  isDevelopmentRoute?: boolean;
}

export interface ReviewPanelSection {
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
  errors?: string[];
}

export interface ReviewPanelSummaryItem {
  label: string;
  value: ReactNode;
}

export interface ReviewPanelScopeBadge {
  label: string;
  value: string;
}

export interface ReviewPanelProps {
  title: string;
  description?: string;
  sections: ReviewPanelSection[];
  summaryItems?: ReviewPanelSummaryItem[];
  scopeBadges?: ReviewPanelScopeBadge[];
  diffChanges?: DiffChange[];
  highValueThreshold?: number;
  autosaveWarning?: string;
  featureFlag?: ReviewPanelFeatureFlag;
  saveLabel?: string;
  saveDisabled?: boolean;
  submitting?: boolean;
  unsavedDialogOpened?: boolean;
  onSubmit: () => void;
  onDiscardDraft?: () => void;
  onStay?: () => void;
  onLeave?: () => void;
}

export function shouldRenderReviewPanel(featureFlag?: ReviewPanelFeatureFlag): boolean {
  if (!featureFlag) return true;
  if (featureFlag.mode === "off") return false;
  if (featureFlag.mode === "shadow") return Boolean(featureFlag.isDevelopmentRoute);
  return true;
}

export function getReviewSectionStatus(params: { active: boolean; complete: boolean; errors?: string[] }): ReviewSectionStatus {
  if (params.errors?.length) return "invalid";
  if (params.complete) return "complete";
  if (params.active) return "in-progress";
  return "incomplete";
}

function focusFirstInvalidField(sectionId: string): void {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    const panel = document.getElementById(`${sectionId}-panel`);
    const firstInvalidField = panel?.querySelector<HTMLElement>([
      "[aria-invalid='true']",
      "[data-invalid='true']",
      "input:invalid",
      "textarea:invalid",
      "select:invalid",
      "[role='alert']",
    ].join(","));
    firstInvalidField?.focus();
  });
}

export function ReviewPanel({
  title,
  description,
  sections,
  summaryItems = [],
  scopeBadges = [],
  diffChanges = [],
  highValueThreshold,
  autosaveWarning,
  featureFlag,
  saveLabel = "Save and log change",
  saveDisabled = false,
  submitting = false,
  unsavedDialogOpened = false,
  onSubmit,
  onDiscardDraft,
  onStay,
  onLeave,
}: ReviewPanelProps) {
  const [activeSectionId, setActiveSectionId] = useState(sections[0]?.id ?? "review");
  const [completedSectionIds, setCompletedSectionIds] = useState<Set<string>>(() => new Set());
  const [confirmed, setConfirmed] = useState(false);

  const steps = useMemo(() => sections.map((section) => ({
    id: section.id,
    title: section.title,
    status: getReviewSectionStatus({
      active: section.id === activeSectionId,
      complete: completedSectionIds.has(section.id),
      errors: section.errors,
    }),
  })), [activeSectionId, completedSectionIds, sections]);

  const invalidSection = sections.find((section) => section.errors?.length);
  const allSectionsComplete = sections.length > 0 && sections.every((section) => completedSectionIds.has(section.id) && !section.errors?.length);
  const highValueWarning = highValueThreshold !== undefined && hasHighValueMoneyDelta(diffChanges, highValueThreshold);

  if (!shouldRenderReviewPanel(featureFlag)) return null;

  const handleStay = () => { onStay?.(); };
  const handleLeave = () => { onLeave?.(); };

  const completeSection = (id: string) => {
    const section = sections.find((item) => item.id === id);
    if (section?.errors?.length) {
      setActiveSectionId(id);
      focusFirstInvalidField(id);
      return;
    }
    setCompletedSectionIds((current) => new Set([...Array.from(current), id]));
    const next = sections[sections.findIndex((item) => item.id === id) + 1];
    if (next) setActiveSectionId(next.id);
  };

  const submit = () => {
    if (invalidSection) {
      setActiveSectionId(invalidSection.id);
      return;
    }
    if (allSectionsComplete && confirmed) onSubmit();
  };

  return (
    <Stack gap="lg" aria-label={title}>
      <Stack gap={4}>
        <Title order={2}>{title}</Title>
        {description ? <Text c="dimmed">{description}</Text> : null}
      </Stack>

      <Group align="flex-start" wrap="nowrap">
        <Card withBorder radius="md" p="md" style={{ minWidth: 240 }}>
          <ReviewStepper steps={steps} activeStepId={activeSectionId} onStepSelect={setActiveSectionId} />
        </Card>
        <Stack gap="md" style={{ flex: 1 }}>
          {autosaveWarning ? <Alert color="yellow" role="status" aria-label="Draft autosave warning">{autosaveWarning} Submit remains available.</Alert> : null}
          <div aria-live="polite" aria-atomic="true">
            {invalidSection ? <Alert color="red" role="alert" aria-label="Validation errors present">Resolve validation errors before final submission.</Alert> : null}
          </div>
          {sections.map((section) => {
            const status = getReviewSectionStatus({
              active: section.id === activeSectionId,
              complete: completedSectionIds.has(section.id),
              errors: section.errors,
            });
            return (
              <ReviewSection
                key={section.id}
                id={section.id}
                title={section.title}
                description={section.description}
                status={status}
                expanded={section.id === activeSectionId}
                errors={section.errors}
                onToggle={setActiveSectionId}
                onComplete={completeSection}
              >
                {section.content}
              </ReviewSection>
            );
          })}
        </Stack>
      </Group>

      <Card withBorder radius="md" p="md" component="section" aria-labelledby="review-panel-final-title">
        <Stack gap="md">
          <Title id="review-panel-final-title" order={3}>Final review</Title>
          <Group gap="xs">
            {scopeBadges.map((badge) => (
              <Badge key={`${badge.label}-${badge.value}`} aria-label={`${badge.label}: ${badge.value}`}>{badge.label}: {badge.value}</Badge>
            ))}
          </Group>
          {summaryItems.length > 0 ? (
            <Stack gap="xs" aria-label="Affected entities and summary">
              {summaryItems.map((item) => (
                <Group key={item.label} justify="space-between">
                  <Text fw={600}>{item.label}</Text>
                  <Text>{item.value}</Text>
                </Group>
              ))}
            </Stack>
          ) : null}
          {highValueWarning ? <Alert color="yellow" role="alert" aria-label="High value monetary change warning">High-value monetary delta detected. Review amounts carefully before saving.</Alert> : null}
          <DiffView changes={diffChanges} />
          <Checkbox
            checked={confirmed}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
            label="I reviewed the sections, validation messages, and before/after changes."
            aria-label="Confirm final review"
          />
          <Group justify="space-between">
            <Button variant="light" color="red" onClick={onDiscardDraft}>Discard draft</Button>
            <Button onClick={submit} disabled={!allSectionsComplete || !confirmed || saveDisabled || submitting} loading={submitting}>
              {saveLabel}
            </Button>
          </Group>
        </Stack>
      </Card>

      <Modal
        opened={unsavedDialogOpened}
        onClose={handleStay}
        title="Unsaved changes"
        aria-label="Unsaved changes confirmation dialog"
        trapFocus
        withinPortal={false}
      >
        <Stack gap="md">
          <Text>You have unsaved changes. Stay on this page or leave and discard unsaved edits?</Text>
          <Group justify="flex-end">
            <Button variant="light" onClick={handleStay}>Stay</Button>
            <Button color="red" onClick={handleLeave}>Leave</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
