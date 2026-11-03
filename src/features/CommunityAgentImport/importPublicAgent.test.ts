import { beforeEach, describe, expect, it, vi } from 'vitest';

import { lambdaClient } from '@/libs/trpc/client';
import { agentService } from '@/services/agent';
import { discoverService } from '@/services/discover';
import { type DiscoverAssistantDetail } from '@/types/discover';

import { importPublicAgent } from './importPublicAgent';

const mocks = vi.hoisted(() => ({ workspaceId: null as string | null }));
vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  getActiveWorkspaceId: () => mocks.workspaceId,
}));
vi.mock('@/services/discover', () => ({
  discoverService: { getPublicAssistantDetail: vi.fn() },
}));
vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: { agent: { createAgent: { mutate: vi.fn() } } },
}));

const detail = (config: Record<string, unknown> = {}) =>
  ({
    avatar: '🤖',
    config,
    description: 'Public template',
    identifier: 'source-agent',
    knowledgeCount: 0,
    status: 'published',
    tags: ['public'],
    title: 'Source assistant',
  }) as unknown as DiscoverAssistantDetail;

describe('importPublicAgent', () => {
  const createAgent = vi.fn();
  const add = () =>
    importPublicAgent({
      createAgent,
      identifier: 'source-agent',
      version: '1.0.0',
      visibility: 'private',
      workspaceId: mocks.workspaceId,
    });

  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.workspaceId = null;
    createAgent.mockReset().mockResolvedValue({ agentId: 'local-agent' });
    vi.spyOn(agentService, 'getAgentByForkedFromIdentifier').mockResolvedValue(null);
    vi.mocked(discoverService.getPublicAssistantDetail).mockReset().mockResolvedValue(detail());
  });

  it('refetches public config and copies portable behavior with local provenance', async () => {
    vi.mocked(discoverService.getPublicAssistantDetail).mockResolvedValue(
      detail({
        agencyConfig: { boundDeviceId: 'publisher-device', env: { API_KEY: 'secret' } },
        chatConfig: {
          enableHistoryCount: true,
          runtimeEnv: { workingDirectory: '/publisher' },
          secret: 'secret',
        },
        editorData: { resourceId: 'publisher-private-file' },
        files: [{ id: 'publisher-file' }],
        knowledgeBases: [{ id: 'publisher-kb' }],
        marketIdentifier: 'publisher-agent',
        metadata: { token: 'secret' },
        model: {
          model: 'model-a',
          parameters: { temperature: 0.2, apiKey: 'secret' },
          provider: 'provider-a',
        },
        openingMessage: 'Hello',
        openingQuestions: ['How can I help?'],
        params: { temperature: 0.6, apiKey: 'secret', forkedFromIdentifier: 'unrelated' },
        plugins: [{ identifier: 'public-skill', mode: 'disabled', settings: { token: 'secret' } }],
        systemRole: 'Be helpful',
        userId: 'publisher',
        workspaceId: 'publisher-workspace',
      }),
    );

    const result = await add();

    expect(discoverService.getPublicAssistantDetail).toHaveBeenCalledWith({
      identifier: 'source-agent',
      source: undefined,
      version: '1.0.0',
    });
    expect(result).toMatchObject({ agentId: 'local-agent', hasUnavailableResources: true });
    const saved = createAgent.mock.calls[0][0];
    expect(saved.visibility).toBeUndefined();
    expect(saved.config).toMatchObject({
      avatar: '🤖',
      chatConfig: { enableHistoryCount: true },
      model: { model: 'model-a', parameters: { temperature: 0.2 }, provider: 'provider-a' },
      openingMessage: 'Hello',
      openingQuestions: ['How can I help?'],
      params: { forkedFromIdentifier: 'source-agent', temperature: 0.6 },
      plugins: [{ identifier: 'public-skill', mode: 'disabled' }],
      systemRole: 'Be helpful',
      title: 'Source assistant',
    });
    expect(JSON.stringify(saved)).not.toContain('secret');
    for (const field of [
      'agencyConfig',
      'editorData',
      'files',
      'knowledgeBases',
      'marketIdentifier',
      'metadata',
      'userId',
      'workspaceId',
    ]) {
      expect(saved.config).not.toHaveProperty(field);
    }
    expect(saved.config.chatConfig).not.toHaveProperty('runtimeEnv');
  });

  it('uses the local agent service to normalize the model before writing', async () => {
    vi.mocked(lambdaClient.agent.createAgent.mutate).mockResolvedValue({ agentId: 'local-agent' });
    vi.mocked(discoverService.getPublicAssistantDetail).mockResolvedValue(
      detail({
        model: {
          model: 'model-a',
          parameters: { max_tokens: 1200, temperature: 0.2 },
          provider: 'provider-a',
        },
        params: { temperature: 0.6 },
      }),
    );

    await importPublicAgent({
      createAgent: agentService.createAgent,
      identifier: 'source-agent',
      visibility: 'private',
      workspaceId: null,
    });

    expect(lambdaClient.agent.createAgent.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          model: 'model-a',
          params: { forkedFromIdentifier: 'source-agent', max_tokens: 1200, temperature: 0.6 },
          provider: 'provider-a',
        }),
      }),
    );
  });

  it.each(['private', 'public'] as const)(
    'preserves the workspace %s destination',
    async (visibility) => {
      mocks.workspaceId = 'own-workspace';
      await importPublicAgent({
        createAgent,
        identifier: 'source-agent',
        visibility,
        workspaceId: mocks.workspaceId,
      });
      expect(createAgent.mock.calls[0][0].visibility).toBe(visibility);
    },
  );

  it('opens an existing copy without another public fetch or local write', async () => {
    vi.spyOn(agentService, 'getAgentByForkedFromIdentifier').mockResolvedValue('existing');
    await expect(add()).resolves.toEqual({ agentId: 'existing', alreadyAdded: true });
    expect(createAgent).not.toHaveBeenCalled();
    expect(discoverService.getPublicAssistantDetail).not.toHaveBeenCalled();
  });

  it.each(['unpublished', 'archived', 'deprecated'] as const)(
    'rejects %s templates',
    async (status) => {
      vi.mocked(discoverService.getPublicAssistantDetail).mockResolvedValue({
        ...detail(),
        status,
      });
      await expect(add()).rejects.toThrow('Public assistant configuration is unavailable');
      expect(createAgent).not.toHaveBeenCalled();
    },
  );

  it('does not import private details when anonymous access fails', async () => {
    vi.mocked(discoverService.getPublicAssistantDetail).mockRejectedValue(new Error('Not found'));
    await expect(add()).rejects.toThrow('Not found');
    expect(createAgent).not.toHaveBeenCalled();
  });

  it('stops before creating if the workspace changes while reading the template', async () => {
    vi.mocked(discoverService.getPublicAssistantDetail).mockImplementation(async () => {
      mocks.workspaceId = 'other-workspace';
      return detail();
    });
    await expect(add()).rejects.toThrow('Workspace changed during import');
    expect(createAgent).not.toHaveBeenCalled();
  });
});
