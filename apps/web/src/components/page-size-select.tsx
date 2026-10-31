"use client";

import { Select } from "@/components/ui";
import { PAGE_SIZE_OPTIONS } from "@/lib/use-page-size";

export function PageSizeSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <Select
      aria-label="Rows per page"
      value={String(value)}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-8! w-auto! text-[12px]!"
    >
      {PAGE_SIZE_OPTIONS.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </Select>
  );
}
