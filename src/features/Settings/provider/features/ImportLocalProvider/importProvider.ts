import type { LocalProviderCandidate, LocalProviderImport } from '@lobechat/electron-client-ipc';

import { aiModelService } from '@/services/aiModel';
import { aiProviderService } from '@/services/aiProvider';
import { localProviderService } from '@/services/electron/localProvider';

interface ImportDependencies {
  getImport: typeof localProviderService.getImport;
  models: Pick<typeof aiModelService, 'createAiModel'>;
  providers: Pick<typeof aiProviderService, 'createAiProvider' | 'getAiProviderList'>;
}

export const toProviderParams = (entry: LocalProviderImport) => ({
  config: { enableResponseApi: entry.supportResponsesApi },
  id: entry.providerId,
  keyVaults: { apiKey: entry.apiKey, authType: entry.authType, baseURL: entry.baseURL },
  name: entry.name,
  settings: {
    disableBrowserRequest: true,
    sdkType: entry.sdkType,
    supportResponsesApi: entry.supportResponsesApi,
  },
  source: 'custom' as const,
});

/** A duplicate never updates credentials. Failed model additions leave a usable provider. */
export const importLocalProvider = async (
  scanId: string,
  candidate: LocalProviderCandidate,
  deps: ImportDependencies = {
    getImport: localProviderService.getImport,
    models: aiModelService,
    providers: aiProviderService,
  },
): Promise<'imported' | 'exists' | 'partial'> => {
  const providers = await deps.providers.getAiProviderList();
  if (providers.some((provider) => provider.id === candidate.providerId)) return 'exists';
  const entry = await deps.getImport({ id: candidate.id, scanId });
  await deps.providers.createAiProvider(toProviderParams(entry));
  // No credential-bearing errors are logged or put into UI state.
  const results = await Promise.allSettled(
    entry.models.map((id) =>
      deps.models.createAiModel({
        id,
        providerId: entry.providerId,
        type: 'chat',
      }),
    ),
  );
  return results.some((result) => result.status === 'rejected') ? 'partial' : 'imported';
};
