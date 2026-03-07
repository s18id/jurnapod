// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useEffect, useRef, useMemo } from "react";

/**
 * Virtual scroll configuration
 */
export interface VirtualScrollConfig {
  itemHeight: number; // Fixed height per item (px)
  containerHeight: number; // Visible container height (px)
  overscan?: number; // Number of extra items to render above/below
}

/**
 * Virtual scroll result
 */
export interface VirtualScrollResult {
  virtualItems: Array<{
    index: number;
    offsetTop: number;
  }>;
  totalHeight: number;
  scrollToIndex: (index: number) => void;
}

/**
 * Hook for virtual scrolling of large lists.
 * Only renders visible items plus overscan buffer.
 */
export function useVirtualScroll<T>(
  items: T[],
  config: VirtualScrollConfig
): VirtualScrollResult {
  const { itemHeight, containerHeight, overscan = 3 } = config;

  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate visible range
  const { startIndex, endIndex, totalHeight } = useMemo(() => {
    const itemCount = items.length;
    const visibleCount = Math.ceil(containerHeight / itemHeight);

    const start = Math.floor(scrollTop / itemHeight);
    const end = Math.min(start + visibleCount, itemCount);

    // Add overscan
    const startWithOverscan = Math.max(0, start - overscan);
    const endWithOverscan = Math.min(itemCount, end + overscan);

    return {
      startIndex: startWithOverscan,
      endIndex: endWithOverscan,
      totalHeight: itemCount * itemHeight,
    };
  }, [items.length, scrollTop, itemHeight, containerHeight, overscan]);

  // Generate virtual items
  const virtualItems = useMemo(() => {
    const result = [];
    for (let i = startIndex; i < endIndex; i++) {
      result.push({
        index: i,
        offsetTop: i * itemHeight,
      });
    }
    return result;
  }, [startIndex, endIndex, itemHeight]);

  // Handle scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // Scroll to specific index
  const scrollToIndex = (index: number) => {
    const container = containerRef.current;
    if (!container) return;

    const offsetTop = index * itemHeight;
    container.scrollTo({
      top: offsetTop,
      behavior: "smooth",
    });
  };

  return {
    virtualItems,
    totalHeight,
    scrollToIndex,
  };
}

/**
 * Hook for infinite scroll / lazy loading
 */
export interface InfiniteScrollConfig {
  threshold?: number; // Distance from bottom to trigger load (px)
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading: boolean;
}

export function useInfiniteScroll(config: InfiniteScrollConfig) {
  const { threshold = 200, onLoadMore, hasMore, isLoading } = config;
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || isLoading) return;

    // Use Intersection Observer for better performance
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          onLoadMore();
        }
      },
      {
        root: containerRef.current,
        rootMargin: `${threshold}px`,
      }
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoading, onLoadMore, threshold]);

  return { containerRef, sentinelRef };
}
