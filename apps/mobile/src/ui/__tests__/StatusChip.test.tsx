import { render, screen } from '@testing-library/react-native';

import { StatusChip, toneForStatus } from '@/ui/StatusChip';

describe('toneForStatus', () => {
  it('maps the known states to their tone', () => {
    expect(toneForStatus('active')).toBe('positive');
    expect(toneForStatus('paid')).toBe('positive');
    expect(toneForStatus('pending')).toBe('warning');
    expect(toneForStatus('overdue')).toBe('critical');
    expect(toneForStatus('expired')).toBe('critical');
    expect(toneForStatus('cancelled')).toBe('neutral');
  });

  it('falls back to neutral for an unknown state', () => {
    expect(toneForStatus('something-else')).toBe('neutral');
  });
});

describe('StatusChip', () => {
  it('carries the word, never colour alone', async () => {
    await render(<StatusChip status="active" />);
    expect(screen.getByText('active')).toBeOnTheScreen();
  });

  it('accepts a friendlier label', async () => {
    await render(<StatusChip status="active" label="Active" />);
    expect(screen.getByText('Active')).toBeOnTheScreen();
  });

  it('names the status for a screen reader', async () => {
    await render(<StatusChip status="overdue" label="Overdue" />);
    expect(screen.getByLabelText('Status: Overdue')).toBeOnTheScreen();
  });
});
