import { render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { EmptyState } from '@/ui/EmptyState';
import { ErrorRetry } from '@/ui/ErrorRetry';
import { FilterSegmented } from '@/ui/FilterSegmented';
import { RestrictedArea } from '@/ui/RestrictedArea';
import { SearchBar } from '@/ui/SearchBar';
import { Skeleton } from '@/ui/Skeleton';
import { SummaryCard } from '@/ui/SummaryCard';

describe('SummaryCard', () => {
  it('shows the kicker and the readout', async () => {
    await render(<SummaryCard kicker="Members" value="128" />);
    expect(screen.getByText('MEMBERS')).toBeOnTheScreen();
    expect(screen.getByText('128')).toBeOnTheScreen();
  });

  it('shows a trend pill when there is one', async () => {
    await render(<SummaryCard kicker="Members" value="128" trend="+4" />);
    expect(screen.getByText('+4')).toBeOnTheScreen();
  });
});

function SearchHarness({ onChange }: { onChange: (value: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <SearchBar
      value={value}
      onChangeText={(next) => {
        setValue(next);
        onChange(next);
      }}
      testID="search"
    />
  );
}

describe('SearchBar', () => {
  it('reports what the user types', async () => {
    let typed = '';
    await render(<SearchHarness onChange={(v) => (typed = v)} />);
    await userEvent.type(screen.getByTestId('search'), 'aarav');
    expect(typed).toBe('aarav');
    expect(screen.getByTestId('search').props.value).toBe('aarav');
  });
});

describe('FilterSegmented', () => {
  it('marks the chosen option and reports a new one', async () => {
    let chosen = 'all';
    const view = await render(
      <FilterSegmented
        options={[
          { value: 'all', label: 'All' },
          { value: 'paid', label: 'Paid' },
        ]}
        value={chosen}
        onChange={(v) => (chosen = v)}
        testID="filter"
      />
    );
    expect(view.getByTestId('filter-all').props.accessibilityState.selected).toBe(true);
    await userEvent.press(view.getByTestId('filter-paid'));
    expect(chosen).toBe('paid');
  });
});

describe('EmptyState', () => {
  it('shows the message and nothing else', async () => {
    await render(<EmptyState title="No Members" message="Nobody has joined yet." />);
    expect(screen.getByText('No Members')).toBeOnTheScreen();
    expect(screen.getByText('Nobody has joined yet.')).toBeOnTheScreen();
  });
});

describe('ErrorRetry', () => {
  it('offers a retry', async () => {
    let retried = 0;
    await render(<ErrorRetry onRetry={() => (retried += 1)} />);
    await userEvent.press(screen.getByText('Try again'));
    expect(retried).toBe(1);
  });
});

describe('Skeleton', () => {
  it('renders a placeholder block', async () => {
    await render(<Skeleton />);
    expect(screen.toJSON()).toBeTruthy();
  });
});

describe('RestrictedArea', () => {
  it('says what happened and offers a way back', async () => {
    await render(<RestrictedArea />);
    expect(screen.getByText('Restricted area')).toBeOnTheScreen();
    expect(screen.getByText('Go back')).toBeOnTheScreen();
  });

  it('never leaks the blocked content', async () => {
    await render(<RestrictedArea />);
    expect(screen.queryByTestId('restricted-area')).toBeTruthy();
    expect(screen.queryByText('Members')).toBeNull();
  });
});
