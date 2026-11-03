import { INBOX_SESSION_ID, isDesktop } from '@lobechat/const';
import type { LobeAgentConfig } from '@lobechat/types';

import type { AgentStoreState } from '../initialState';

type AgentConfig = AgentStoreState['agentMap'][string];

const desktopConfigs = new WeakMap<AgentConfig, LobeAgentConfig>();

/**
 * Kopa's personal desktop assistant uses the installed Codex CLI by default.
 * Keep this as a read projection: the shared server row and web client retain
 * their own runtime. An explicitly configured external runtime always wins.
 */
export const getDesktopInboxConfig = (agentId: string, state: AgentStoreState): LobeAgentConfig => {
  const config = state.agentMap[agentId];
  const isInbox =
    config?.slug && config.virtual !== undefined
      ? config.slug === INBOX_SESSION_ID && config.virtual === true
      : state.builtinAgentIdMap[INBOX_SESSION_ID] === agentId;

  if (
    !isDesktop ||
    !config ||
    !isInbox ||
    config.workspaceId ||
    config.agencyConfig?.heterogeneousProvider
  ) {
    return config as LobeAgentConfig;
  }

  const cached = desktopConfigs.get(config);
  if (cached) return cached;

  const projected = {
    ...config,
    agencyConfig: {
      ...config.agencyConfig,
      boundDeviceId: undefined,
      executionTarget: 'local',
      // No model, arguments, environment or API binding: Codex owns its login
      // and model defaults, including subsequent changes to its local config.
      heterogeneousProvider: { authMode: 'subscription', type: 'codex' },
    },
    model: 'codex',
    provider: 'codex',
  } as LobeAgentConfig;

  desktopConfigs.set(config, projected);
  return projected;
};
