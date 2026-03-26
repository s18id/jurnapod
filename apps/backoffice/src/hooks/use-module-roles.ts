// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import type { ModuleRoleResponse } from "@jurnapod/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest, ApiError } from "../lib/api-client";

type ModuleRolesListResponse = {
  success: true;
  data: ModuleRoleResponse[];
};

type ModuleRoleSingleResponse = {
  success: true;
  data: ModuleRoleResponse;
};

export function useModuleRoles(accessToken: string, roleId: number | null) {
  const [data, setData] = useState<ModuleRoleResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const refetch = useCallback(
    async (options?: { force?: boolean }) => {
      const force = options?.force ?? false;
      if (!roleId) {
        setData([]);
        setLoading(false);
        setError(null);
        return;
      }

      if (!force && inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ role_id: String(roleId) });
        const response = await apiRequest<ModuleRolesListResponse>(
          `/settings/module-roles?${params.toString()}`,
          {},
          accessToken
        );
        setData(response.data);
      } catch (fetchError) {
        if (fetchError instanceof ApiError) {
          setError(fetchError.message);
        } else {
          setError("Failed to load module roles");
        }
        setData([]);
      } finally {
        setLoading(false);
        inFlightRef.current = false;
      }
    },
    [accessToken, roleId]
  );

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

export async function updateModuleRolePermission(
  roleId: number,
  moduleName: string,
  permissionMask: number,
  accessToken: string
): Promise<ModuleRoleResponse> {
  const response = await apiRequest<ModuleRoleSingleResponse>(
    `/settings/module-roles/${roleId}/${moduleName}`,
    {
      method: "PUT",
      body: JSON.stringify({ permission_mask: permissionMask })
    },
    accessToken
  );
  return response.data;
}
