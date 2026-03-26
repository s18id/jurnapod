// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Card, Group, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";

type PageCardProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function PageCard({ title, description, actions, children }: PageCardProps) {
  return (
    <Card data-testid="page-card">
      <Stack gap="sm">
        {title || description || actions ? (
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <div>
              {title ? <Title order={4} data-testid="page-card-title">{title}</Title> : null}
              {description ? (
                <Text c="dimmed" size="sm" data-testid="page-card-description">
                  {description}
                </Text>
              ) : null}
            </div>
            {actions ? <Group gap="sm" data-testid="page-card-actions">{actions}</Group> : null}
          </Group>
        ) : null}
        {children}
      </Stack>
    </Card>
  );
}
