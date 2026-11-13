/** Money is carried in minor units (paise), exactly as the backend stores it. */

export const DEFAULT_CURRENCY = 'INR';

export function formatMoney(minor: number, currency: string = DEFAULT_CURRENCY): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export function toMinor(major: number): number {
  return Math.round(major * 100);
}
