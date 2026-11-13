import { formatMoney, toMinor } from '@/lib/money';

describe('formatMoney', () => {
  it('renders minor units as a rupee amount', () => {
    expect(formatMoney(250000)).toContain('2,500');
  });

  it('defaults to INR', () => {
    expect(formatMoney(100000)).toContain('1,000');
    expect(formatMoney(100000)).toContain('₹');
  });

  it('handles zero', () => {
    expect(formatMoney(0)).toContain('0');
  });
});

describe('toMinor', () => {
  it('converts major units to paise', () => {
    expect(toMinor(2500)).toBe(250000);
    expect(toMinor(0)).toBe(0);
  });
});
