import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "../lib/api-client";
import { CacheService } from "../lib/cache-service";
import { useOnlineStatus } from "../lib/connection";
import type {
  AccountResponse,
  AccountCreateRequest,
  AccountUpdateRequest,
  AccountTreeNode,
  AccountListQuery,
  AccountTypeResponse
} from "@jurnapod/shared";

/**
 * Account Usage Check Response
 */
type AccountUsageResponse = {
  ok: boolean;
  in_use: boolean;
  usage_count?: number;
  details?: {
    journal_lines?: number;
    child_accounts?: number;
  };
};

/**
 * API Response Types
 */
type AccountsListResponse = {
  success: true;
  data: AccountResponse[];
};

type AccountTreeResponse = {
  success: true;
  data: AccountTreeNode[];
};

type AccountSingleResponse = {
  success: true;
  data: AccountResponse;
};

type AccountTypesListResponse = {
  success: true;
  data: AccountTypeResponse[];
};

function buildAccountTree(accounts: AccountResponse[]): AccountTreeNode[] {
  const nodeMap = new Map<number, AccountTreeNode>();
  const roots: AccountTreeNode[] = [];

  for (const account of accounts) {
    nodeMap.set(account.id, {
      ...account,
      children: []
    });
  }

  for (const node of nodeMap.values()) {
    if (node.parent_account_id && nodeMap.has(node.parent_account_id)) {
      const parent = nodeMap.get(node.parent_account_id);
      parent?.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function flattenTree(nodes: AccountTreeNode[]): AccountResponse[] {
  const result: AccountResponse[] = [];
  const stack = [...nodes];
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node) continue;
    const { children, ...rest } = node;
    result.push(rest);
    if (children && children.length > 0) {
      stack.push(...children);
    }
  }
  return result;
}

/**
 * Hook: useAccountTypes
 * Fetches list of account types for a company
 */
export function useAccountTypes(companyId: number, accessToken: string) {
  const [data, setData] = useState<AccountTypeResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isOnline) {
        const params = new URLSearchParams({ 
          company_id: String(companyId),
          is_active: "true"
        });

        const response = await apiRequest<AccountTypesListResponse>(
          `/account-types?${params.toString()}`,
          {},
          accessToken
        );
        setData(response.data);
        await CacheService.cacheAccountTypes(response.data);
      } else {
        const cached = await CacheService.getCachedAccountTypes(companyId, accessToken, { allowStale: true });
        setData(cached);
      }
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load account types");
      }
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, accessToken, isOnline]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Hook: useAccounts
 * Fetches list of accounts with optional filters
 */
export function useAccounts(
  companyId: number,
  accessToken: string,
  filters?: Partial<Omit<AccountListQuery, "company_id">>
) {
  const [data, setData] = useState<AccountResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  function applyAccountFilters(accounts: AccountResponse[]) {
    let result = accounts;
    if (filters?.is_active !== undefined) {
      result = result.filter((account) => account.is_active === filters.is_active);
    }
    if (filters?.report_group) {
      result = result.filter((account) => account.report_group === filters.report_group);
    }
    if (filters?.parent_account_id !== undefined) {
      result = result.filter((account) => account.parent_account_id === filters.parent_account_id);
    }
    if (filters?.search) {
      const query = filters.search.toLowerCase();
      result = result.filter((account) =>
        account.name.toLowerCase().includes(query) || account.code.toLowerCase().includes(query)
      );
    }
    return result;
  }

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isOnline) {
        const params = new URLSearchParams({ company_id: String(companyId) });
        
        if (filters?.is_active !== undefined) {
          params.set("is_active", String(filters.is_active));
        }
        if (filters?.report_group) {
          params.set("report_group", filters.report_group);
        }
        if (filters?.parent_account_id !== undefined) {
          params.set("parent_account_id", String(filters.parent_account_id));
        }
        if (filters?.search) {
          params.set("search", filters.search);
        }
        if (filters?.include_children !== undefined) {
          params.set("include_children", String(filters.include_children));
        }

        const response = await apiRequest<AccountsListResponse>(
          `/accounts?${params.toString()}`,
          {},
          accessToken
        );
        setData(response.data);
        if (filters?.is_active !== false) {
          await CacheService.cacheAccounts(response.data);
        }
      } else {
        const cached = await CacheService.getCachedAccounts(companyId, accessToken, { allowStale: true });
        setData(applyAccountFilters(cached));
      }
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load accounts");
      }
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, accessToken, filters, isOnline]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Hook: useAccountTree
 * Fetches hierarchical account tree structure
 */
export function useAccountTree(
  companyId: number,
  accessToken: string,
  includeInactive?: boolean
) {
  const [data, setData] = useState<AccountTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isOnline) {
        const params = new URLSearchParams({ company_id: String(companyId) });
        if (includeInactive !== undefined) {
          params.set("include_inactive", String(includeInactive));
        }

        const response = await apiRequest<AccountTreeResponse>(
          `/accounts/tree?${params.toString()}`,
          {},
          accessToken
        );
        setData(response.data);
        await CacheService.cacheAccounts(flattenTree(response.data));
      } else {
        const cached = await CacheService.getCachedAccounts(companyId, accessToken, { allowStale: true });
        const filtered = includeInactive ? cached : cached.filter((account) => account.is_active);
        setData(buildAccountTree(filtered));
      }
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load account tree");
      }
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, accessToken, includeInactive, isOnline]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Hook: useAccount
 * Fetches a single account by ID
 */
export function useAccount(
  accountId: number | null,
  companyId: number,
  accessToken: string
) {
  const [data, setData] = useState<AccountResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOnline = useOnlineStatus();

  const refetch = useCallback(async () => {
    if (!accountId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (isOnline) {
        const params = new URLSearchParams({ company_id: String(companyId) });
        const response = await apiRequest<AccountSingleResponse>(
          `/accounts/${accountId}?${params.toString()}`,
          {},
          accessToken
        );
        setData(response.data);
      } else {
        const cached = await CacheService.getCachedAccounts(companyId, accessToken, { allowStale: true });
        const match = cached.find((account) => account.id === accountId) ?? null;
        setData(match);
      }
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to load account");
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [accountId, companyId, accessToken, isOnline]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Hook: useAccountUsage
 * Checks if an account is in use (has journal lines or child accounts)
 */
export function useAccountUsage(
  accountId: number | null,
  companyId: number,
  accessToken: string
) {
  const [data, setData] = useState<AccountUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!accountId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ company_id: String(companyId) });
      const response = await apiRequest<AccountUsageResponse>(
        `/accounts/${accountId}/usage?${params.toString()}`,
        {},
        accessToken
      );
      setData(response);
    } catch (fetchError) {
      if (fetchError instanceof ApiError) {
        setError(fetchError.message);
      } else {
        setError("Failed to check account usage");
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [accountId, companyId, accessToken]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

/**
 * Mutation: createAccount
 * Creates a new account
 */
export async function createAccount(
  data: AccountCreateRequest,
  accessToken: string
): Promise<AccountResponse> {
  const response = await apiRequest<AccountSingleResponse>(
    "/accounts",
    {
      method: "POST",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Mutation: updateAccount
 * Updates an existing account
 */
export async function updateAccount(
  accountId: number,
  data: AccountUpdateRequest,
  accessToken: string
): Promise<AccountResponse> {
  const response = await apiRequest<AccountSingleResponse>(
    `/accounts/${accountId}`,
    {
      method: "PUT",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Mutation: deactivateAccount
 * Deactivates (soft delete) an account
 */
export async function deactivateAccount(
  accountId: number,
  accessToken: string
): Promise<void> {
  await apiRequest<{ ok: true }>(
    `/accounts/${accountId}`,
    {
      method: "DELETE"
    },
    accessToken
  );
}

/**
 * Mutation: reactivateAccount
 * Reactivates a deactivated account
 */
export async function reactivateAccount(
  accountId: number,
  accessToken: string
): Promise<AccountResponse> {
  const response = await apiRequest<AccountSingleResponse>(
    `/accounts/${accountId}/reactivate`,
    {
      method: "POST"
    },
    accessToken
  );
  return response.data;
}

/**
 * Mutation: createAccountType
 * Creates a new account type
 */
export async function createAccountType(
  data: { company_id: number; name: string; category: string; normal_balance?: string; report_group?: string },
  accessToken: string
): Promise<AccountTypeResponse> {
  const response = await apiRequest<{ success: true; data: AccountTypeResponse }>(
    `/account-types`,
    {
      method: "POST",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Mutation: updateAccountType
 * Updates an existing account type
 */
export async function updateAccountType(
  accountTypeId: number,
  data: { name?: string; category?: string; normal_balance?: string; report_group?: string },
  accessToken: string
): Promise<AccountTypeResponse> {
  const response = await apiRequest<{ success: true; data: AccountTypeResponse }>(
    `/account-types/${accountTypeId}`,
    {
      method: "PUT",
      body: JSON.stringify(data)
    },
    accessToken
  );
  return response.data;
}

/**
 * Mutation: deactivateAccountType
 * Deactivates (soft delete) an account type
 */
export async function deactivateAccountType(
  accountTypeId: number,
  accessToken: string
): Promise<void> {
  await apiRequest<{ ok: true }>(
    `/account-types/${accountTypeId}`,
    {
      method: "DELETE"
    },
    accessToken
  );
}
