// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { Stack, Button, Text, Group, Alert, Image, Checkbox, FileButton } from "@mantine/core";
import { IconUpload, IconPhoto, IconAlertCircle, IconCheck } from "@tabler/icons-react";
import { useState, useCallback } from "react";

import { apiRequest, ApiError } from "../lib/api-client";
import type { SessionUser } from "../lib/session";

interface ImageUploadProps {
  user: SessionUser;
  accessToken: string;
  itemId: number;
  itemName: string;
  onUploadSuccess?: () => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function ImageUpload({
  user: _user,
  accessToken,
  itemId,
  itemName,
  onUploadSuccess,
}: ImageUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileSelect = useCallback((selectedFile: File | null) => {
    setError(null);
    setSuccess(null);

    if (!selectedFile) {
      setFile(null);
      setPreview(null);
      return;
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      setError("Only JPG, PNG, and WebP images are supported");
      setFile(null);
      setPreview(null);
      return;
    }

    // Validate file size
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`Image must be under 5MB. Selected: ${(selectedFile.size / 1024 / 1024).toFixed(2)}MB`);
      setFile(null);
      setPreview(null);
      return;
    }

    setFile(selectedFile);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(selectedFile);
  }, []);

  const handleUpload = async () => {
    if (!file) {
      setError("Please select an image file");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('is_primary', isPrimary ? 'true' : 'false');

      await apiRequest(
        `/inventory/items/${itemId}/images`,
        {
          method: "POST",
          body: formData,
          // Don't set content-type header, browser will set it with boundary for FormData
        },
        accessToken
      );

      setSuccess("Image uploaded successfully");
      setFile(null);
      setPreview(null);
      setIsPrimary(false);
      onUploadSuccess?.();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "Failed to upload image");
      } else {
        setError("Failed to upload image");
      }
    } finally {
      setLoading(false);
    }
  };

  const clearSelection = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    setSuccess(null);
  };

  return (
    <Stack gap="md">
      <Group gap="xs">
        <IconPhoto size={20} />
        <Text fw={500}>Upload Image</Text>
      </Group>

      <Text size="sm" c="dimmed">
        Item: {itemName}
      </Text>

      {error && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
          {error}
        </Alert>
      )}

      {success && (
        <Alert icon={<IconCheck size={16} />} color="green" variant="light">
          {success}
        </Alert>
      )}

      {!file ? (
        <Stack gap="xs" align="center" py="xl">
          <FileButton 
            onChange={handleFileSelect} 
            accept="image/png,image/jpeg,image/webp"
          >
            {(props) => (
              <Button 
                {...props} 
                variant="light" 
                leftSection={<IconUpload size={16} />}
                size="lg"
              >
                Select Image
              </Button>
            )}
          </FileButton>
          <Text size="xs" c="dimmed">
            JPG, PNG, or WebP • Max 5MB
          </Text>
        </Stack>
      ) : (
        <Stack gap="md">
          {preview && (
            <Image
              src={preview}
              alt="Preview"
              radius="md"
              fit="contain"
              h={200}
              fallbackSrc="https://placehold.co/400x200?text=Preview"
            />
          )}

          <Group gap="xs">
            <Text size="sm" fw={500}>Selected:</Text>
            <Text size="sm" c="dimmed">{file.name}</Text>
            <Text size="sm" c="dimmed">
              ({(file.size / 1024).toFixed(1)} KB)
            </Text>
          </Group>

          <Checkbox
            label="Set as primary image"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.currentTarget.checked)}
          />

          <Group justify="space-between">
            <Button variant="subtle" onClick={clearSelection} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              loading={loading}
              leftSection={<IconUpload size={16} />}
            >
              Upload
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
