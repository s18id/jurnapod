// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import {
  Alert,
  Button,
  Card,
  Container,
  Group,
  NumberInput,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  Modal
} from "@mantine/core";
import { useEffect, useState } from "react";

import { OfflinePage } from "../components/offline-page";
import { apiRequest, ApiError } from "../lib/api-client";
import { useOnlineStatus } from "../lib/connection";
import type { SessionUser } from "../lib/session";

type PlatformSettingsPageProps = {
  user: SessionUser;
  accessToken: string;
};

type PlatformSettingsResponse = {
  success: true;
  data: {
    settings: Record<string, string>;
  };
};

type MailerTestResponse = {
  success: true;
  data: { message: string };
};

const cardStyle = {
  border: "1px solid #e2ddd2",
  borderRadius: "10px",
  padding: "16px",
  backgroundColor: "#fcfbf8"
} as const;

const initialFormState: Record<string, any> = {
  "mailer.driver": "disabled",
  "mailer.from_name": "",
  "mailer.from_email": "",
  "mailer.smtp.host": "",
  "mailer.smtp.port": "587",
  "mailer.smtp.user": "",
  "mailer.smtp.pass": "",
  "mailer.smtp.secure": "false",
  "mailer.smtp.tls_reject_unauthorized": "true"
};

export function PlatformSettingsPage({ user: _user, accessToken }: PlatformSettingsPageProps) {
  const isOnline = useOnlineStatus();
  
  // Form state
  const [formState, setFormState] = useState<Record<string, any>>(initialFormState);
  
  const [updatePassword, setUpdatePassword] = useState(false);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Test email modal state
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSubject, setTestSubject] = useState("Test Email from Jurnapod");
  const [testText, setTestText] = useState("This is a test email sent from Jurnapod platform settings.");
  const [testSending, setTestSending] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testSuccess, setTestSuccess] = useState(false);

  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      setError(null);
      setSaveSuccess(false);
      try {
        const response = await apiRequest<PlatformSettingsResponse>(
          `/platform/settings`,
          {},
          accessToken
        );
        const normalizedSettings = { ...initialFormState, ...response.data.settings };
        if (normalizedSettings["mailer.smtp.pass"] === "*****") {
          normalizedSettings["mailer.smtp.pass"] = "";
        }
        setFormState(normalizedSettings);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError("Failed to load platform settings");
        }
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, [accessToken]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      // Build settings object, exclude password unless updating
      const settingsToSave: Record<string, any> = { ...formState };
      if (!updatePassword) {
        delete settingsToSave["mailer.smtp.pass"];
      } else {
        settingsToSave["mailer.smtp.pass"] = formState["mailer.smtp.pass"];
      }

      await apiRequest(
        `/platform/settings`,
        {
          method: "PUT",
          body: JSON.stringify({ settings: settingsToSave })
        },
        accessToken
      );
      setSaveSuccess(true);
      setUpdatePassword(false);
      
      // Refresh settings to get updated data
      const response = await apiRequest<PlatformSettingsResponse>(
        `/platform/settings`,
        {},
        accessToken
      );
      const normalizedSettings = { ...initialFormState, ...response.data.settings };
      setFormState(normalizedSettings);
    } catch (err) {
      if (err instanceof ApiError) {
        setSaveError(err.message);
      } else {
        setSaveError("Failed to save platform settings");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleTestEmail() {
    setTestSending(true);
    setTestError(null);
    setTestSuccess(false);
    try {
      await apiRequest<MailerTestResponse>(
        `/settings/mailer-test`,
        {
          method: "POST",
          body: JSON.stringify({
            to: testEmail,
            subject: testSubject,
            text: testText
          })
        },
        accessToken
      );
      setTestSuccess(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setTestError(err.message);
      } else {
        setTestError("Failed to send test email");
      }
    } finally {
      setTestSending(false);
    }
  }

  function openTestModal() {
    setTestEmail("");
    setTestSubject("Test Email from Jurnapod");
    setTestText("This is a test email sent from Jurnapod platform settings.");
    setTestError(null);
    setTestSuccess(false);
    setTestModalOpen(true);
  }

  function updateField(key: string, value: any) {
    setFormState((prev) => ({ ...prev, [key]: value }));
    setSaveSuccess(false);
  }

  if (!isOnline) {
    return <OfflinePage title="Offline" message="Platform settings require an active internet connection." />;
  }

  if (loading) {
    return (
      <Container size="lg" py="xl">
        <Text>Loading platform settings...</Text>
      </Container>
    );
  }

  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={2}>Platform Settings</Title>
          <Text c="dimmed" size="sm">
            Global configuration for the entire platform (SUPER_ADMIN only)
          </Text>
        </div>

        {error && (
          <Alert color="red" title="Error">
            {error}
          </Alert>
        )}

        {saveSuccess && (
          <Alert color="green" title="Success">
            Platform settings saved successfully
          </Alert>
        )}

        {saveError && (
          <Alert color="red" title="Save Error">
            {saveError}
          </Alert>
        )}

        {/* Mailer Settings Card */}
        <Card style={cardStyle}>
          <Stack gap="md">
            <Group justify="space-between">
              <div>
                <Title order={3}>Mailer Configuration</Title>
                <Text c="dimmed" size="sm">
                  Configure email sending for the platform
                </Text>
              </div>
              <Button size="sm" onClick={openTestModal} disabled={formState["mailer.driver"] === "disabled"}>
                Send Test Email
              </Button>
            </Group>

            <Select
              label="Driver"
              description="Email sending mode"
              data={[
                { value: "disabled", label: "Disabled" },
                { value: "log", label: "Log (dev mode)" },
                { value: "smtp", label: "SMTP" }
              ]}
              value={formState["mailer.driver"]}
              onChange={(value) => updateField("mailer.driver", value)}
              rightSection={null}
            />

            <TextInput
              label="From Name"
              description="Display name for outgoing emails"
              value={formState["mailer.from_name"]}
              onChange={(e) => updateField("mailer.from_name", e.target.value)}
              rightSection={null}
            />

            <TextInput
              label="From Email"
              description="Email address for outgoing emails"
              type="email"
              value={formState["mailer.from_email"]}
              onChange={(e) => updateField("mailer.from_email", e.target.value)}
              rightSection={null}
            />

            {formState["mailer.driver"] === "smtp" && (
              <>
                <Title order={4} mt="md">SMTP Configuration</Title>

                <TextInput
                  label="SMTP Host"
                  value={formState["mailer.smtp.host"]}
                  onChange={(e) => updateField("mailer.smtp.host", e.target.value)}
                    rightSection={null}
                  />

                <NumberInput
                  label="SMTP Port"
                  value={parseInt(formState["mailer.smtp.port"], 10)}
                  onChange={(value) => updateField("mailer.smtp.port", String(value))}
                  min={1}
                  max={65535}
                    rightSection={null}
                  />

                <TextInput
                  label="SMTP User"
                  value={formState["mailer.smtp.user"]}
                  onChange={(e) => updateField("mailer.smtp.user", e.target.value)}
                    rightSection={null}
                  />

                <Stack gap="xs">
                  <Switch
                    label="Update SMTP Password"
                    checked={updatePassword}
                    onChange={(e) => setUpdatePassword(e.currentTarget.checked)}
                  />
                  {updatePassword && (
                    <>
                      <PasswordInput
                        label="SMTP Password"
                        value={formState["mailer.smtp.pass"]}
                        onChange={(e) => updateField("mailer.smtp.pass", e.target.value)}
                        rightSection={null}
                      />
                      <Text size="xs" c="dimmed">
                        Leave blank to clear the stored password.
                      </Text>
                    </>
                  )}
                </Stack>

                <Switch
                  label="Use SSL/TLS (port 465)"
                  description="Enable for port 465, disable for STARTTLS (port 587)"
                  checked={formState["mailer.smtp.secure"] === "true"}
                  onChange={(e) => updateField("mailer.smtp.secure", String(e.currentTarget.checked))}
                />

                <Switch
                  label="Reject Unauthorized TLS"
                  description="Disable only for self-signed certificates in dev"
                  checked={formState["mailer.smtp.tls_reject_unauthorized"] === "true"}
                  onChange={(e) => updateField("mailer.smtp.tls_reject_unauthorized", String(e.currentTarget.checked))}
                />
              </>
            )}
          </Stack>
        </Card>

        {/* Save Button */}
        <Group justify="flex-end">
          <Button onClick={handleSave} loading={saving} size="md">
            Save Settings
          </Button>
        </Group>

        {/* Test Email Modal */}
        <Modal
          opened={testModalOpen}
          onClose={() => setTestModalOpen(false)}
          title="Send Test Email"
          size="md"
        >
          <Stack gap="md">
            {testSuccess && (
              <Alert color="green" title="Success">
                Test email sent successfully!
              </Alert>
            )}

            {testError && (
              <Alert color="red" title="Error">
                {testError}
              </Alert>
            )}

            <TextInput
              label="Recipient Email"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              required
            />

            <TextInput
              label="Subject"
              value={testSubject}
              onChange={(e) => setTestSubject(e.target.value)}
              required
            />

            <TextInput
              label="Message"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              required
            />

            <Group justify="flex-end">
              <Button variant="subtle" onClick={() => setTestModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleTestEmail}
                loading={testSending}
                disabled={!testEmail || !testSubject || !testText}
              >
                Send Test Email
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </Container>
  );
}
