"use client";

import { useEffect, useState } from "react";

export const PAGE_SIZE_OPTIONS = [50, 100, 500, 1000] as const;
export const DEFAULT_PAGE_SIZE = 50;

const isValidPageSize = (n: number): boolean =>
  (PAGE_SIZE_OPTIONS as readonly number[]).includes(n);

export function usePageSize(pageKey: string): [number, (n: number) => void] {
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`forge.page-size.${pageKey}`);
      const value = Number(raw);
      if (isValidPageSize(value)) {
        setPageSize(value);
      }
    } catch {
      // storage unavailable — stay on the default
    }
  }, [pageKey]);

  function set(n: number) {
    if (!isValidPageSize(n)) return;
    setPageSize(n);
    try {
      window.localStorage.setItem(`forge.page-size.${pageKey}`, String(n));
    } catch {
      // storage unavailable — in-memory only
    }
  }

  return [pageSize, set];
}
