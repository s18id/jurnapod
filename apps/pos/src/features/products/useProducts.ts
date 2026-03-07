// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import React, { useMemo, useState } from "react";
import type { RuntimeProductCatalogItem } from "../../services/runtime-service.js";

export interface UseProductsOptions {
  catalog: RuntimeProductCatalogItem[];
}

export interface UseProductsReturn {
  visibleProducts: RuntimeProductCatalogItem[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export function useProducts({
  catalog
}: UseProductsOptions): UseProductsReturn {
  const [searchTerm, setSearchTerm] = useState<string>("");

  const visibleProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return catalog;
    }

    return catalog.filter((product) => {
      const haystack = `${product.name} ${product.sku ?? ""}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [catalog, searchTerm]);

  return {
    visibleProducts,
    searchTerm,
    setSearchTerm
  };
}
