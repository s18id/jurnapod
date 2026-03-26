// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useMemo, useEffect } from "react";
import {
  Stack,
  Group,
  Text,
  Progress,
  Button,
  Card,
  Alert,
  Loader,
  Modal,
  ThemeIcon,
  RingProgress,
  Badge,
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCheck,
  IconX,
  IconPlayerStop,
  IconRefresh,
  IconArrowRight,
} from "@tabler/icons-react";

import type { ApplyResult, ApplyProgress } from "../hooks/use-import";

interface ImportProgressProps {
  progress: ApplyProgress | null;
  loading: boolean;
  error: string | null;
  result: ApplyResult | null;
  onCancel: () => void;
  onDone: () => void;
  onRetry?: () => void;
  entityName?: string;
}

export function ImportProgress({
  progress,
  loading,
  error,
  result,
  onCancel,
  onDone,
  onRetry,
  entityName = "items",
}: ImportProgressProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Reset elapsed time when loading stops
  useEffect(() => {
    if (!loading) {
      // Use timeout to avoid synchronously calling setState in effect
      const timeoutId = setTimeout(() => setElapsedTime(0), 0);
      return () => clearTimeout(timeoutId);
    }
  }, [loading]);

  // Track elapsed time
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    
    if (loading) {
      intervalId = setInterval(() => {
        setElapsedTime((t) => t + 1);
      }, 1000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [loading]);

  // Format time
  const formatTime = useMemo(() => {
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = elapsedTime % 60;
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }, [elapsedTime]);

  // Calculate ETA
  const eta = useMemo(() => {
    if (!progress || progress.percentage === 0 || progress.percentage === 100) {
      return null;
    }
    const elapsedSeconds = elapsedTime;
    const remainingPercentage = 100 - progress.percentage;
    const estimatedSeconds = Math.round((elapsedSeconds * remainingPercentage) / progress.percentage);
    
    if (estimatedSeconds < 60) {
      return `${estimatedSeconds}s`;
    }
    const minutes = Math.floor(estimatedSeconds / 60);
    const seconds = estimatedSeconds % 60;
    return `${minutes}m ${seconds}s`;
  }, [progress, elapsedTime]);

  // Progress bar color
  const getProgressColor = () => {
    if (error) return "red";
    if (result) {
      return result.failed > 0 ? "yellow" : "green";
    }
    return "blue";
  };

  // Loading state
  if (loading && !progress) {
    return (
      <Stack align="center" gap="xl" py="xl">
        <Loader size="lg" />
        <Text c="dimmed">Preparing import...</Text>
      </Stack>
    );
  }

  // Progress state
  if (loading && progress) {
    return (
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={500} size="lg">
              Importing {entityName}...
            </Text>
            <Text size="sm" c="dimmed">
              Please wait while we process your data
            </Text>
          </div>
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              Elapsed: {formatTime}
            </Text>
            {eta && (
              <Badge variant="light" size="sm">
                ETA: {eta}
              </Badge>
            )}
          </Group>
        </Group>

        <Card withBorder>
          <Stack gap="md">
            {/* Progress Ring */}
            <Group justify="center">
              <RingProgress
                size={180}
                thickness={16}
                roundCaps
                sections={[
                  { value: progress.percentage, color: getProgressColor() },
                ]}
                label={
                  <Stack align="center" gap={0}>
                    <Text size="xl" fw={700}>
                      {progress.percentage}%
                    </Text>
                    <Text size="xs" c="dimmed">
                      Complete
                    </Text>
                  </Stack>
                }
              />
            </Group>

            {/* Progress Details */}
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Progress
                </Text>
                <Text size="sm" fw={500}>
                  {progress.currentRow.toLocaleString()} of {progress.total.toLocaleString()} rows
                </Text>
              </Group>
              <Progress
                value={progress.percentage}
                color={getProgressColor()}
                animated
                size="lg"
              />
              <Text size="xs" c="dimmed" ta="center">
                {progress.current.toLocaleString()} processed •{" "}
                {Math.round((progress.current / Math.max(progress.total, 1)) * 100)}%
              </Text>
            </Stack>

            {/* Cancel Warning */}
            <Alert color="orange" variant="light" icon={<IconAlertCircle size={16} />}>
              <Text size="sm">
                Import is in progress. Canceling may leave your data in an inconsistent state.
              </Text>
            </Alert>

            {/* Cancel Button */}
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconPlayerStop size={16} />}
              onClick={() => setShowCancelConfirm(true)}
            >
              Cancel Import
            </Button>
          </Stack>
        </Card>

        {/* Cancel Confirmation Modal */}
        <Modal
          opened={showCancelConfirm}
          onClose={() => setShowCancelConfirm(false)}
          title="Cancel Import?"
          size="sm"
        >
          <Stack gap="md">
            <Text size="sm">
              Are you sure you want to cancel the import? Some rows may have already been
              processed.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setShowCancelConfirm(false)}>
                Continue Import
              </Button>
              <Button color="red" onClick={onCancel}>
                Cancel Import
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    );
  }

  // Error state
  if (error) {
    return (
      <Stack gap="md">
        <Alert color="red" icon={<IconAlertCircle size={16} />} title="Import Failed">
          {error}
        </Alert>

        <Card withBorder>
          <Stack gap="md" align="center">
            <ThemeIcon color="red" size={60} radius="xl">
              <IconX size={30} />
            </ThemeIcon>
            <Text fw={500} size="lg">
              Import Failed
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              {error || "An unexpected error occurred during import."}
            </Text>
            {onRetry && (
              <Button
                variant="light"
                leftSection={<IconRefresh size={16} />}
                onClick={onRetry}
              >
                Retry Import
              </Button>
            )}
          </Stack>
        </Card>

        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Close
          </Button>
        </Group>
      </Stack>
    );
  }

  // Result state
  if (result) {
    const isAllSuccess = result.failed === 0;
    const isPartialSuccess = result.success > 0 && result.failed > 0;
    const isAllFailed = result.success === 0 && result.failed > 0;

    return (
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <div>
            <Text fw={500} size="lg">
              Import Complete
            </Text>
            <Text size="sm" c="dimmed">
              Finished in {formatTime}
            </Text>
          </div>
          {isAllSuccess && (
            <Badge color="green" size="lg" leftSection={<IconCheck size={14} />}>
              All Successful
            </Badge>
          )}
          {isPartialSuccess && (
            <Badge color="yellow" size="lg" leftSection={<IconAlertCircle size={14} />}>
              Partial Success
            </Badge>
          )}
          {isAllFailed && (
            <Badge color="red" size="lg" leftSection={<IconX size={14} />}>
              Failed
            </Badge>
          )}
        </Group>

        {/* Summary Cards */}
        <Group grow>
          <Card withBorder>
            <Stack align="center" gap="xs">
              <ThemeIcon color="green" size={50} radius="xl" variant="light">
                <IconCheck size={24} />
              </ThemeIcon>
              <Text size="xl" fw={700} c="green">
                {result.success}
              </Text>
              <Text size="sm" c="dimmed">
                Successful
              </Text>
            </Stack>
          </Card>

          {result.created > 0 && (
            <Card withBorder>
              <Stack align="center" gap="xs">
                <ThemeIcon color="blue" size={50} radius="xl" variant="light">
                  <IconCheck size={24} />
                </ThemeIcon>
                <Text size="xl" fw={700} c="blue">
                  {result.created}
                </Text>
                <Text size="sm" c="dimmed">
                  Created
                </Text>
              </Stack>
            </Card>
          )}

          {result.updated > 0 && (
            <Card withBorder>
              <Stack align="center" gap="xs">
                <ThemeIcon color="cyan" size={50} radius="xl" variant="light">
                  <IconRefresh size={24} />
                </ThemeIcon>
                <Text size="xl" fw={700} c="cyan">
                  {result.updated}
                </Text>
                <Text size="sm" c="dimmed">
                  Updated
                </Text>
              </Stack>
            </Card>
          )}

          {result.skipped > 0 && (
            <Card withBorder>
              <Stack align="center" gap="xs">
                <ThemeIcon color="gray" size={50} radius="xl" variant="light">
                  <IconPlayerStop size={24} />
                </ThemeIcon>
                <Text size="xl" fw={700} c="gray">
                  {result.skipped}
                </Text>
                <Text size="sm" c="dimmed">
                  Skipped
                </Text>
              </Stack>
            </Card>
          )}

          {result.failed > 0 && (
            <Card withBorder>
              <Stack align="center" gap="xs">
                <ThemeIcon color="red" size={50} radius="xl" variant="light">
                  <IconX size={24} />
                </ThemeIcon>
                <Text size="xl" fw={700} c="red">
                  {result.failed}
                </Text>
                <Text size="sm" c="dimmed">
                  Failed
                </Text>
              </Stack>
            </Card>
          )}
        </Group>

        {/* Error Details */}
        {result.errors.length > 0 && (
          <Card withBorder>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text fw={500}>Failed Rows</Text>
                <Badge color="red">{result.errors.length}</Badge>
              </Group>
              <Alert color="red" variant="light" icon={<IconAlertCircle size={16} />}>
                {result.errors.length} row{result.errors.length !== 1 ? "s" : ""} failed to import.
                Review the errors below.
              </Alert>
              <Stack gap={4}>
                {result.errors.slice(0, 10).map((err, idx) => (
                  <Group key={idx} justify="space-between">
                    <Text size="sm">Row {err.row}</Text>
                    <Text size="sm" c="red">
                      {err.error}
                    </Text>
                  </Group>
                ))}
                {result.errors.length > 10 && (
                  <Text size="xs" c="dimmed">
                    +{result.errors.length - 10} more errors
                  </Text>
                )}
              </Stack>
            </Stack>
          </Card>
        )}

        {/* Next Steps */}
        <Card withBorder bg="gray.0">
          <Group justify="space-between" align="center">
            <div>
              <Text size="sm" fw={500}>
                What&apos;s Next?
              </Text>
              <Text size="xs" c="dimmed">
                You can view the imported {entityName} or import more data.
              </Text>
            </div>
            <Button
              variant="light"
              rightSection={<IconArrowRight size={16} />}
              onClick={onDone}
            >
              View {entityName}
            </Button>
          </Group>
        </Card>
      </Stack>
    );
  }

  // Default (should not reach here)
  return null;
}
