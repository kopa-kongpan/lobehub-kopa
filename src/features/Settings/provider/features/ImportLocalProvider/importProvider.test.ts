import type { LocalProviderImport } from '@lobechat/electron-client-ipc';
import { describe, expect, it, vi } from 'vitest';

import { importLocalProvider } from './importProvider';

const entry: LocalProviderImport = {
  apiKey: 'fixture-key',
  authType: 'bearer',
  baseURL: 'https://fixture.example.com',
  id: 'claude-fixture',
  models: ['model-a', 'model-b'],
  name: 'Claude Code',
  providerId: 'local-claude-fixture',
  sdkType: 'anthropic',
  source: 'claude',
  status: 'ready',
  supportResponsesApi: false,
};
const dependencies = () => ({
  getImport: vi.fn().mockResolvedValue(entry),
  models: { createAiModel: vi.fn().mockResolvedValue('model') },
  providers: {
    createAiProvider: vi.fn().mockResolvedValue(entry.providerId),
    getAiProviderList: vi.fn().mockResolvedValue([]),
  },
});

describe('local configuration import', () => {
  it('preserves endpoint, authentication, protocol, and models', async () => {
    const deps = dependencies();
    expect(await importLocalProvider('scan', entry, deps)).toBe('imported');
    expect(deps.providers.createAiProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: entry.providerId,
        keyVaults: { apiKey: 'fixture-key', authType: 'bearer', baseURL: entry.baseURL },
        settings: expect.objectContaining({ sdkType: 'anthropic', disableBrowserRequest: true }),
      }),
    );
    expect(deps.models.createAiModel.mock.calls.map(([model]) => model.id)).toEqual([
      'model-a',
      'model-b',
    ]);
  });
  it('never retrieves or overwrites a credential when the provider exists', async () => {
    const deps = dependencies();
    deps.providers.getAiProviderList.mockResolvedValue([{ id: entry.providerId }]);
    expect(await importLocalProvider('scan', entry, deps)).toBe('exists');
    expect(deps.getImport).not.toHaveBeenCalled();
    expect(deps.providers.createAiProvider).not.toHaveBeenCalled();
  });
  it('reports partial progress if models fail after the provider is saved', async () => {
    const deps = dependencies();
    deps.models.createAiModel.mockRejectedValueOnce(new Error('offline'));
    expect(await importLocalProvider('scan', entry, deps)).toBe('partial');
  });
  it('does not create models when saving the provider fails', async () => {
    const deps = dependencies();
    deps.providers.createAiProvider.mockRejectedValue(new Error('offline'));
    await expect(importLocalProvider('scan', entry, deps)).rejects.toThrow('offline');
    expect(deps.models.createAiModel).not.toHaveBeenCalled();
  });
});
