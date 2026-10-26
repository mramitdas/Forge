"use client";

import { useMemo, type ChangeEvent } from "react";
import { Select } from "@/components/ui";

export function YearSelector({
  id,
  year,
  onYearChange,
  ariaLabel = "Select year",
}: {
  id: string;
  year: number;
  onYearChange: (year: number) => void;
  ariaLabel?: string;
}) {
  const years = useMemo(() => {
    const current = new Date().getFullYear();
    const arr: number[] = [];
    for (let y = current - 5; y <= current + 5; y++) arr.push(y);
    return arr;
  }, []);

  const handleYearChange = (e: ChangeEvent<HTMLSelectElement>) => {
    onYearChange(Number(e.target.value));
  };

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-[12px] font-medium text-ink-soft">
        Year
      </label>
      <div className="w-24">
        <Select
          id={id}
          value={String(year)}
          onChange={handleYearChange}
          aria-label={ariaLabel}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
