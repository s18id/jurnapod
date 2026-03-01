// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Alert, Container, Text, Title } from "@mantine/core";

type OfflinePageProps = {
  title: string;
  message: string;
};

export function OfflinePage({ title, message }: OfflinePageProps) {
  return (
    <Container size="sm" py="xl">
      <Alert color="yellow" title={<Title order={4}>{title}</Title>} variant="light">
        <Text size="sm">{message}</Text>
      </Alert>
    </Container>
  );
}
