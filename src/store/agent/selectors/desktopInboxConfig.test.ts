import type * as ConstModule from '@lobechat/const';
import { INBOX_SESSION_ID } from '@lobechat/const';
import { buildHeteroSpawnArgs } from '@lobechat/types';
import { describe, expect, it, vi } from 'vitest';

import { selectRuntimeType } from '@/store/chat/slices/agentRun/actions/dispatch/agentDispatcher';

import type { AgentStoreState } from '../initialState';
import { initialState } from '../initialState';
import { agentByIdSelectors } from './agentByIdSelectors';
import { getDesktopInboxConfig } from './desktopInboxConfig';
import { agentSelectors } from './selectors';

const platform = vi.hoisted(() => ({ desktop: true }));

vi.mock('@lobechat/const', async (importOriginal) => ({
  ...(await importOriginal<typeof ConstModule>()),
  get isDesktop() {
    return platform.desktop;
  },
}));

const createState = (config: AgentStoreState['agentMap'][string] = {}): AgentStoreState => ({
  ...initialState,
  activeAgentId: 'inbox-id',
  agentMap: {
    'inbox-id': {
      model: 'server-model',
      provider: 'server-provider',
      slug: INBOX_SESSION_ID,
      systemRole: 'Personal assistant instructions',
      virtual: true,
      ...config,
    },
  },
  builtinAgentIdMap: { [INBOX_SESSION_ID]: 'inbox-id' },
});

describe('desktop inbox Codex default', () => {
  it('uses local Codex consistently for the composer and execution, even with gateway enabled', () => {
    const state = createState();
    const config = agentSelectors.getAgentConfigById('inbox-id')(state);
    const agencyConfig = agentByIdSelectors.getAgencyConfigById('inbox-id')(state);

    expect(agentSelectors.inboxAgentConfig(state)).toBe(config);
    expect(agentSelectors.currentAgentConfig(state)).toBe(config);
    expect(agentSelectors.currentAgentModelProvider(state)).toBe('codex');
    expect(agentByIdSelectors.isAgentHeterogeneousById('inbox-id')(state)).toBe(true);
    expect(agencyConfig).toEqual({
      boundDeviceId: undefined,
      executionTarget: 'local',
      heterogeneousProvider: { authMode: 'subscription', type: 'codex' },
    });
    expect(selectRuntimeType({ ...agencyConfig, isGatewayMode: true }, { isDesktop: true })).toBe(
      'hetero',
    );
    expect(buildHeteroSpawnArgs(agencyConfig!.heterogeneousProvider!)).toBeUndefined();
    expect(config.systemRole).toBe('Personal assistant instructions');
  });

  it('does not mutate or persist the server row and keeps references stable', () => {
    const state = createState();
    const before = structuredClone(state.agentMap['inbox-id']);
    const first = getDesktopInboxConfig('inbox-id', state);

    expect(getDesktopInboxConfig('inbox-id', state)).toBe(first);
    expect(state.agentMap['inbox-id']).toEqual(before);
    expect(state.agentMap['inbox-id'].agencyConfig).toBeUndefined();

    const next = createState({ systemRole: 'Updated instructions' });
    expect(getDesktopInboxConfig('inbox-id', next).systemRole).toBe('Updated instructions');
  });

  it('leaves the web inbox unchanged, including after a desktop read', () => {
    const state = createState();
    getDesktopInboxConfig('inbox-id', state);
    platform.desktop = false;
    try {
      expect(getDesktopInboxConfig('inbox-id', state)).toBe(state.agentMap['inbox-id']);
      expect(agentByIdSelectors.isAgentHeterogeneousById('inbox-id')(state)).toBe(false);
    } finally {
      platform.desktop = true;
    }
  });

  it.each([
    { slug: 'custom-agent', virtual: false },
    { slug: INBOX_SESSION_ID, virtual: false },
    { workspaceId: 'shared-workspace' },
    { agencyConfig: { heterogeneousProvider: { type: 'claude-code' as const } } },
    {
      agencyConfig: {
        executionTarget: 'device' as const,
        heterogeneousProvider: { model: 'chosen-model', type: 'codex' as const },
      },
    },
  ])('preserves unrelated or explicitly configured agents: %j', (config) => {
    const state = createState(config);
    expect(getDesktopInboxConfig('inbox-id', state)).toBe(state.agentMap['inbox-id']);
  });

  it('recognizes a hydrated inbox before the slug index loads', () => {
    const state = { ...createState(), builtinAgentIdMap: {} };
    expect(getDesktopInboxConfig('inbox-id', state).agencyConfig?.heterogeneousProvider?.type).toBe(
      'codex',
    );
  });

  it('does not fabricate config for an unloaded inbox', () => {
    const state = { ...createState(), agentMap: {} };
    expect(getDesktopInboxConfig('inbox-id', state)).toBeUndefined();
  });
});
