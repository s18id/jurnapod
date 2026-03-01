import type { ReactNode } from "react";
import { Card, Group, Stack, Text, Title } from "@mantine/core";

type PageCardProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function PageCard({ title, description, actions, children }: PageCardProps) {
  return (
    <Card>
      <Stack gap="sm">
        {title || description || actions ? (
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <div>
              {title ? <Title order={4}>{title}</Title> : null}
              {description ? (
                <Text c="dimmed" size="sm">
                  {description}
                </Text>
              ) : null}
            </div>
            {actions ? <Group gap="sm">{actions}</Group> : null}
          </Group>
        ) : null}
        {children}
      </Stack>
    </Card>
  );
}
