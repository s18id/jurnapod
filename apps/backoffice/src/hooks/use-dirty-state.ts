// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useCallback, useState } from "react";

/**
 * Hook to track unsaved changes in a form.
 * Returns the dirty state and callbacks to mark as dirty/clean.
 */
export function useDirtyState() {
  const [isDirty, setIsDirty] = useState(false);

  const markDirty = useCallback(() => {
    setIsDirty(true);
  }, []);

  const markClean = useCallback(() => {
    setIsDirty(false);
  }, []);

  const toggleDirty = useCallback((dirty: boolean) => {
    setIsDirty(dirty);
  }, []);

  return {
    isDirty,
    markDirty,
    markClean,
    toggleDirty,
  };
}
