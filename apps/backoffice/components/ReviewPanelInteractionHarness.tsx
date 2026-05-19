import { MantineProvider, TextInput } from "@mantine/core";
import { useState } from "react";

import { ReviewPanel, type ReviewPanelFeatureFlag } from "../src/components/ReviewPanel";

export interface ReviewPanelFixtureProps {
  title?: string;
  invalidLines?: boolean;
  featureFlag?: ReviewPanelFeatureFlag;
  unsavedDialogOpened?: boolean;
  onStay?: () => void;
  onLeave?: () => void;
}

export function ReviewPanelContent({
  title = "Review AP invoice",
  invalidLines = false,
  featureFlag,
  unsavedDialogOpened = false,
  onStay,
  onLeave,
}: ReviewPanelFixtureProps) {
  return (
    <ReviewPanel
      title={title}
      description="Review before posting financial changes."
      sections={[
        {
          id: "header",
          title: "Header",
          description: "Supplier and invoice metadata",
          content: <TextInput label="Supplier" defaultValue="Global Supplies" />,
        },
        {
          id: "lines",
          title: "Lines",
          description: "Invoice line amounts",
          content: (
            <TextInput
              label="Invoice amount"
              defaultValue={invalidLines ? "-10.00" : "10.00"}
              error={invalidLines ? "Amount cannot be negative." : undefined}
              aria-invalid={invalidLines ? "true" : undefined}
            />
          ),
          errors: invalidLines ? ["Amount cannot be negative."] : undefined,
        },
      ]}
      summaryItems={[{ label: "Entity", value: "AP invoice draft" }]}
      scopeBadges={[{ label: "Company", value: "10" }]}
      featureFlag={featureFlag}
      unsavedDialogOpened={unsavedDialogOpened}
      onStay={onStay}
      onLeave={onLeave}
      onSubmit={() => undefined}
    />
  );
}

export function ReviewPanelFixture(props: ReviewPanelFixtureProps) {
  return (
    <MantineProvider>
      <ReviewPanelContent {...props} />
    </MantineProvider>
  );
}

export function ReviewPanelFeatureFlagHarness() {
  return (
    <MantineProvider>
      <ReviewPanelContent title="Shadow Review Panel" featureFlag={{ mode: "shadow", isDevelopmentRoute: false }} />
      <ReviewPanelContent title="Enabled Review Panel" featureFlag={{ mode: "100" }} />
    </MantineProvider>
  );
}

export function ReviewPanelModalHarness() {
  const [opened, setOpened] = useState(false);
  return (
    <MantineProvider>
      <button type="button" onClick={() => setOpened(true)}>Attempt guarded navigation</button>
      <ReviewPanelContent
        unsavedDialogOpened={opened}
        onStay={() => setOpened(false)}
        onLeave={() => setOpened(false)}
      />
    </MantineProvider>
  );
}
