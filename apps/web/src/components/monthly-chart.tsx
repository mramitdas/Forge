"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui";
import { inr } from "@/lib/mock";

export function MonthlyChart({
  title,
  subtitle,
  seriesName,
  ariaLabel,
  data,
}: {
  title: string;
  subtitle: string;
  seriesName: string;
  ariaLabel: string;
  data: { month: string; amount: number }[];
}) {
  return (
    <Card className="p-5">
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
        <p className="mt-0.5 text-[12px] text-ink-faint">{subtitle}</p>
      </div>
      <div className="h-64" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <XAxis dataKey="month" />
            <YAxis width={56} tickFormatter={(v: number) => (v ? `₹${Math.round(v / 100000)}k` : "₹0")} />
            <Tooltip formatter={(value) => inr(Number(value))} />
            <Bar dataKey="amount" name={seriesName} fill="#7b87f2" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
