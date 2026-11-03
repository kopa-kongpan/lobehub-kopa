/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as I18nextModule from 'i18next';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { agentService } from '@/services/agent';
import { discoverService } from '@/services/discover';
import { marketApiService } from '@/services/marketApi';
import { agentSkillService } from '@/services/skill';
import { useToolStore } from '@/store/tool';

import ForkAndChat from './ForkAndChat';

const mocks = vi.hoisted(() => ({
  createAgent: vi.fn(),
  canCreate: true,
  isAuthenticated: true,
  navigate: vi.fn(),
  signIn: vi.fn(),
  refreshAgentList: vi.fn(),
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof I18nextModule>()),
  t: (key: string, options?: { skills?: string }) => `${key}: ${options?.skills}`,
}));
vi.mock('@lobehub/ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Button: ({
    children,
    disabled,
    loading,
    onClick,
  }: {
    children: ReactNode;
    disabled?: boolean;
    loading?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled || loading} onClick={onClick}>
      {children}
    </button>
  ),
  Flexbox: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Select: () => null,
  toast: mocks.toast,
}));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  getActiveWorkspaceId: () => null,
  useActiveWorkspaceId: () => null,
}));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: mocks.canCreate }) }));
vi.mock('@/hooks/useQuery', () => ({ useQuery: () => ({}) }));
vi.mock('@/layout/AuthProvider/MarketAuth', () => ({
  useMarketAuth: () => ({ isAuthenticated: mocks.isAuthenticated, signIn: mocks.signIn }),
}));
vi.mock('@/services/discover', () => ({
  discoverService: { getPublicAssistantDetail: vi.fn(), reportAgentEvent: vi.fn() },
}));
vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (s: object) => unknown) => selector({ createAgent: mocks.createAgent }),
}));
vi.mock('@/store/home', () => ({
  useHomeStore: (selector: (s: object) => unknown) =>
    selector({ refreshAgentList: mocks.refreshAgentList }),
}));
vi.mock('../../DetailProvider', () => ({
  useDetailContext: () => ({
    config: { params: {}, plugins: ['skill-a', { identifier: 'skill-b', mode: 'disabled' }] },
    identifier: 'source-agent',
    title: 'Source Agent',
  }),
}));

describe('ForkAndChat market skills', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.canCreate = true;
    mocks.isAuthenticated = true;
    vi.mocked(discoverService.getPublicAssistantDetail).mockResolvedValue({
      config: { params: {}, plugins: ['skill-a', { identifier: 'skill-b', mode: 'disabled' }] },
      identifier: 'source-agent',
      title: 'Source Agent',
    } as Awaited<ReturnType<typeof discoverService.getPublicAssistantDetail>>);
    mocks.signIn.mockReset();
    Object.values(mocks.toast).forEach((fn) => fn.mockReset());
    mocks.navigate.mockReset();
    mocks.createAgent.mockReset().mockResolvedValue({ agentId: 'new-agent' });
    mocks.refreshAgentList.mockReset().mockResolvedValue(undefined);
    vi.spyOn(agentService, 'getAgentByForkedFromIdentifier').mockResolvedValue(null);
    vi.spyOn(marketApiService, 'forkAgent').mockResolvedValue([
      { data: { agent: { identifier: 'forked', name: 'Forked' } }, success: true },
    ] as any);
    vi.spyOn(useToolStore, 'getState').mockReturnValue({
      ...useToolStore.getState(),
      refreshAgentSkills: vi.fn().mockResolvedValue(undefined),
    });
  });

  const fork = async () => {
    render(<ForkAndChat />);
    fireEvent.click(screen.getByText('addAgent.action'));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
  };

  it('adds a public assistant without an official Market login or fork', async () => {
    mocks.isAuthenticated = false;
    mocks.signIn.mockRejectedValue(new Error('Official Market login is unavailable'));
    vi.spyOn(agentSkillService, 'ensureFromMarket').mockResolvedValue([]);

    await fork();

    expect(mocks.createAgent).toHaveBeenCalledOnce();
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(marketApiService.forkAgent).not.toHaveBeenCalled();
  });

  it('does not create when local permission is missing', () => {
    mocks.canCreate = false;
    render(<ForkAndChat />);
    fireEvent.click(screen.getByText('addAgent.action'));
    expect(mocks.createAgent).not.toHaveBeenCalled();
    expect(discoverService.getPublicAssistantDetail).not.toHaveBeenCalled();
  });

  it('opens an existing local copy without creating another one', async () => {
    vi.spyOn(agentService, 'getAgentByForkedFromIdentifier').mockResolvedValue('existing-agent');
    await fork();
    expect(mocks.navigate).toHaveBeenCalledWith(expect.stringContaining('existing-agent'));
    expect(mocks.createAgent).not.toHaveBeenCalled();
    expect(mocks.toast.info).toHaveBeenCalledWith('addAgent.alreadyAdded');
  });

  it('clears pending state and allows retry after creation fails', async () => {
    mocks.createAgent.mockRejectedValueOnce(new Error('Local server unavailable'));
    vi.spyOn(agentSkillService, 'ensureFromMarket').mockResolvedValue([]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ForkAndChat />);
    const button = screen.getByText('addAgent.action');
    fireEvent.click(button);
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith('addAgent.failed'));
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalled());
    expect(mocks.createAgent).toHaveBeenCalledTimes(2);
  });

  it('continues to the created assistant when refreshing the list fails', async () => {
    mocks.refreshAgentList.mockRejectedValueOnce(new Error('Refresh unavailable'));
    vi.spyOn(agentSkillService, 'ensureFromMarket').mockResolvedValue([]);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await fork();
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalledWith('addAgent.success');
  });

  it('installs the referenced skills after creating the agent, without warning on success', async () => {
    const ensure = vi.spyOn(agentSkillService, 'ensureFromMarket').mockResolvedValue([
      { identifier: 'skill-a', status: 'installed' },
      { identifier: 'skill-b', status: 'notSkill' },
    ]);

    await fork();

    expect(ensure).toHaveBeenCalledWith(['skill-a', 'skill-b']);
    expect(ensure.mock.invocationCallOrder[0]).toBeGreaterThan(
      mocks.createAgent.mock.invocationCallOrder[0],
    );
    expect(mocks.toast.warning).not.toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalledWith('addAgent.success');
  });

  it('still reports success and navigates when installing skills fails outright', async () => {
    vi.spyOn(agentSkillService, 'ensureFromMarket').mockRejectedValue(new Error('network down'));

    await fork();

    expect(mocks.navigate).toHaveBeenCalledWith(expect.stringContaining('new-agent'));
    expect(mocks.toast.success).toHaveBeenCalledWith('addAgent.success');
    expect(mocks.toast.error).not.toHaveBeenCalled();
    expect(mocks.toast.warning).toHaveBeenCalledTimes(1);
    expect(mocks.toast.warning.mock.calls[0][0]).toContain('skill-a');
  });

  it('warns only about failed skills, not about notSkill ones', async () => {
    vi.spyOn(agentSkillService, 'ensureFromMarket').mockResolvedValue([
      { identifier: 'skill-a', reason: 'download', status: 'failed' },
      { identifier: 'skill-b', status: 'notSkill' },
    ]);

    await fork();

    expect(mocks.toast.warning).toHaveBeenCalledTimes(1);
    const message = mocks.toast.warning.mock.calls[0][0] as string;
    expect(message).toContain('skill-a');
    expect(message).not.toContain('skill-b');
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });
});
