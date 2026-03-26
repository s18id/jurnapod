// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Stack, Text, Group, Image, Badge, ActionIcon, SimpleGrid, Loader, Alert } from "@mantine/core";
import { IconPhoto, IconStar, IconTrash, IconAlertCircle, IconRefresh, IconArrowUp, IconArrowDown } from "@tabler/icons-react";
import { useState, useCallback, useEffect } from "react";

import { apiRequest } from "../lib/api-client";
import type { SessionUser } from "../lib/session";

interface ImageItem {
  id: number;
  file_name: string;
  original_url: string;
  large_url: string;
  medium_url: string;
  thumbnail_url: string;
  width_pixels: number;
  height_pixels: number;
  file_size_bytes: number;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
}

interface ItemImagesResponse {
  images: ImageItem[];
}

interface ItemImageGalleryProps {
  user: SessionUser;
  accessToken: string;
  itemId: number;
  itemName: string;
  onImagesChange?: () => void;
}

export function ItemImageGallery({
  user: _user,
  accessToken,
  itemId,
  itemName,
  onImagesChange,
}: ItemImageGalleryProps) {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchImages = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest<ItemImagesResponse>(
        `/inventory/items/${itemId}/images`,
        {},
        accessToken
      );
      setImages(response.images);
    } catch {
      setError("Failed to load images");
    } finally {
      setLoading(false);
    }
  }, [itemId, accessToken]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const handleSetPrimary = async (imageId: number) => {
    setActionLoading(imageId);
    
    try {
      await apiRequest(
        `/inventory/images/${imageId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_primary: true }),
        },
        accessToken
      );

      // Refresh images
      await fetchImages();
      onImagesChange?.();
    } catch {
      setError("Failed to set primary image");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (imageId: number) => {
    if (!window.confirm('Are you sure you want to delete this image?')) {
      return;
    }

    setActionLoading(imageId);

    try {
      await apiRequest(
        `/inventory/images/${imageId}`,
        {
          method: "DELETE",
        },
        accessToken
      );

      // Refresh images
      await fetchImages();
      onImagesChange?.();
    } catch {
      setError("Failed to delete image");
    } finally {
      setActionLoading(null);
    }
  };

  const handleMoveUp = async (imageId: number, currentOrder: number) => {
    if (currentOrder <= 0) return; // Already at top

    setActionLoading(imageId);

    try {
      await apiRequest(
        `/inventory/images/${imageId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ sort_order: currentOrder - 1 }),
        },
        accessToken
      );

      // Refresh images
      await fetchImages();
      onImagesChange?.();
    } catch {
      setError("Failed to reorder image");
    } finally {
      setActionLoading(null);
    }
  };

  const handleMoveDown = async (imageId: number, currentOrder: number, maxOrder: number) => {
    if (currentOrder >= maxOrder) return; // Already at bottom

    setActionLoading(imageId);

    try {
      await apiRequest(
        `/inventory/images/${imageId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ sort_order: currentOrder + 1 }),
        },
        accessToken
      );

      // Refresh images
      await fetchImages();
      onImagesChange?.();
    } catch {
      setError("Failed to reorder image");
    } finally {
      setActionLoading(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <Stack align="center" py="xl">
        <Loader size="md" />
        <Text size="sm" c="dimmed">Loading images...</Text>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <Group gap="xs" justify="space-between">
        <Group gap="xs">
          <IconPhoto size={20} />
          <Text fw={500}>Image Gallery</Text>
          <Badge variant="light" size="sm">
            {images.length} {images.length === 1 ? 'image' : 'images'}
          </Badge>
        </Group>
        <ActionIcon variant="subtle" onClick={fetchImages} disabled={loading}>
          <IconRefresh size={16} />
        </ActionIcon>
      </Group>

      <Text size="sm" c="dimmed">
        Item: {itemName}
      </Text>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
          {error}
        </Alert>
      )}

      {images.length === 0 ? (
        <Stack align="center" py="xl" gap="xs">
          <IconPhoto size={48} stroke={1.5} color="gray" />
          <Text c="dimmed">No images uploaded yet</Text>
        </Stack>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {images.map((image, index) => (
            <Stack key={image.id} gap="xs">
              <div style={{ position: 'relative' }}>
                <Image
                  src={image.medium_url}
                  alt={image.file_name}
                  radius="md"
                  fit="cover"
                  h={150}
                  fallbackSrc="https://placehold.co/300x150?text=Image"
                />
                {image.is_primary && (
                  <Badge
                    color="yellow"
                    size="sm"
                    style={{ position: 'absolute', top: 8, left: 8 }}
                    leftSection={<IconStar size={12} />}
                  >
                    Primary
                  </Badge>
                )}
              </div>

              <Group gap="xs" justify="space-between">
                <Stack gap={0}>
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {image.file_name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {image.width_pixels}×{image.height_pixels} • {formatFileSize(image.file_size_bytes)}
                  </Text>
                </Stack>

                <Group gap="xs">
                  {index > 0 && (
                    <ActionIcon
                      variant="light"
                      color="blue"
                      onClick={() => handleMoveUp(image.id, image.sort_order)}
                      loading={actionLoading === image.id}
                      title="Move up"
                    >
                      <IconArrowUp size={16} />
                    </ActionIcon>
                  )}
                  {index < images.length - 1 && (
                    <ActionIcon
                      variant="light"
                      color="blue"
                      onClick={() => handleMoveDown(image.id, image.sort_order, images[images.length - 1].sort_order)}
                      loading={actionLoading === image.id}
                      title="Move down"
                    >
                      <IconArrowDown size={16} />
                    </ActionIcon>
                  )}
                  {!image.is_primary && (
                    <ActionIcon
                      variant="light"
                      color="yellow"
                      onClick={() => handleSetPrimary(image.id)}
                      loading={actionLoading === image.id}
                      title="Set as primary"
                    >
                      <IconStar size={16} />
                    </ActionIcon>
                  )}
                  <ActionIcon
                    variant="light"
                    color="red"
                    onClick={() => handleDelete(image.id)}
                    loading={actionLoading === image.id}
                    title="Delete image"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Group>
            </Stack>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}
