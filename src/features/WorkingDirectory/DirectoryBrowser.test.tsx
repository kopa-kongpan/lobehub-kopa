import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DirectoryBrowser } from './DirectoryBrowser';
import type { DirectoryListing, DirectorySource } from './directorySource';

const sourceWith = (listing: Partial<DirectoryListing>): DirectorySource => ({
  createFolder: vi.fn(),
  editablePath: false,
  rootLabel: 'Drive',
  useListing: () => ({
    directory: { parentPath: null, path: '' },
    entries: [{ name: 'held', path: 'held' }],
    hasMore: false,
    isLoading: false,
    isLoadingMore: false,
    isRefreshing: false,
    loadMore: vi.fn(),
    refresh: vi.fn(),
    retry: vi.fn(),
    ...listing,
  }),
});

const renderBrowser = (source: DirectorySource) =>
  render(
    <DirectoryBrowser loading={false} source={source} onCancel={vi.fn()} onSelect={vi.fn()} />,
  );

describe('DirectoryBrowser', () => {
  it('should neither list nor allow using a folder whose listing failed', () => {
    // Folders came back but what classifies them did not: an environment
    // directory would read as a plain folder to browse into and use.
    renderBrowser(sourceWith({ error: new Error('instances unavailable') }));

    expect(screen.queryByText('held')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('workingDirectory.useFolder').closest('button')).toBeDisabled();
  });

  it('should list the folders and allow using the folder once it loads', () => {
    renderBrowser(sourceWith({}));

    expect(screen.getByText('held')).toBeInTheDocument();
    expect(screen.getByText('workingDirectory.useFolder').closest('button')).not.toBeDisabled();
  });

  it('confirms checked siblings together, leaving unselected folders out', () => {
    const onSelect = vi.fn();
    render(
      <DirectoryBrowser
        loading={false}
        multiSelect={{ onSelect, confirmLabel: (count) => `Use ${count}` }}
        source={sourceWith({
          entries: ['A', 'B', 'C'].map((name) => ({ name, path: '/' + name })),
        })}
        onCancel={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: '/A' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '/C' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use 2' }));
    expect(onSelect).toHaveBeenCalledWith(['/A', '/C']);
  });

  it('should keep what a pick carries along off the footer buttons row', () => {
    // Beside the buttons, an environment select pushed them onto a second line
    // in English, where the labels run longer.
    render(
      <DirectoryBrowser
        loading={false}
        pickExtra={<span>environment</span>}
        source={sourceWith({})}
        onCancel={vi.fn()}
        onManual={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const footer = screen
      .getByText('workingDirectory.enterPathManually')
      .closest('button')!.parentElement!;
    expect(screen.getByText('environment')).toBeInTheDocument();
    expect(footer).not.toContainElement(screen.getByText('environment'));
  });
});
