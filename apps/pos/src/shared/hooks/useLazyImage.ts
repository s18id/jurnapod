// Copyright (c) 2026 Ahmad Faruk (Signal18 ID). All rights reserved.
// Ownership: Ahmad Faruk (Signal18 ID)

import { useState, useEffect, useRef } from "react";

/**
 * Lazy image loading configuration
 */
export interface LazyImageConfig {
  src: string;
  placeholder?: string;
  threshold?: number; // Intersection threshold (0-1)
  rootMargin?: string; // Margin around viewport
}

/**
 * Lazy image loading result
 */
export interface LazyImageResult {
  src: string;
  isLoaded: boolean;
  isError: boolean;
  imgRef: React.RefObject<HTMLImageElement>;
}

/**
 * Hook for lazy loading images.
 * Images load when they enter viewport.
 */
export function useLazyImage(config: LazyImageConfig): LazyImageResult {
  const {
    src,
    placeholder = "",
    threshold = 0.1,
    rootMargin = "50px",
  } = config;

  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(placeholder);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!imgRef.current) return;

    // Use Intersection Observer for lazy loading
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          // Start loading image
          const img = new Image();

          img.onload = () => {
            setCurrentSrc(src);
            setIsLoaded(true);
          };

          img.onerror = () => {
            setIsError(true);
          };

          img.src = src;

          // Stop observing once loading starts
          observer.disconnect();
        }
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, [src, threshold, rootMargin]);

  return {
    src: currentSrc,
    isLoaded,
    isError,
    imgRef,
  };
}

/**
 * Hook for preloading images
 */
export function useImagePreload(sources: string[]): boolean {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let loadedCount = 0;
    const images: HTMLImageElement[] = [];

    sources.forEach((src) => {
      const img = new Image();

      img.onload = () => {
        loadedCount++;
        if (loadedCount === sources.length) {
          setIsLoaded(true);
        }
      };

      img.onerror = () => {
        console.warn(`Failed to preload image: ${src}`);
        loadedCount++;
        if (loadedCount === sources.length) {
          setIsLoaded(true);
        }
      };

      img.src = src;
      images.push(img);
    });

    return () => {
      // Cleanup
      images.forEach((img) => {
        img.onload = null;
        img.onerror = null;
      });
    };
  }, [sources]);

  return isLoaded;
}

/**
 * Progressive image loading (load low-res first, then high-res)
 */
export interface ProgressiveImageConfig {
  lowResSrc: string;
  highResSrc: string;
}

export function useProgressiveImage(
  config: ProgressiveImageConfig
): LazyImageResult {
  const { lowResSrc, highResSrc } = config;

  const [currentSrc, setCurrentSrc] = useState(lowResSrc);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    // Load low-res first
    const lowResImg = new Image();

    lowResImg.onload = () => {
      setCurrentSrc(lowResSrc);

      // Then load high-res
      const highResImg = new Image();

      highResImg.onload = () => {
        setCurrentSrc(highResSrc);
        setIsLoaded(true);
      };

      highResImg.onerror = () => {
        setIsError(true);
        setIsLoaded(true); // Still mark as loaded, use low-res
      };

      highResImg.src = highResSrc;
    };

    lowResImg.onerror = () => {
      setIsError(true);
    };

    lowResImg.src = lowResSrc;
  }, [lowResSrc, highResSrc]);

  return {
    src: currentSrc,
    isLoaded,
    isError,
    imgRef,
  };
}
