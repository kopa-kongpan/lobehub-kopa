import type { LocalProviderImport, LocalProviderScan } from '@lobechat/electron-client-ipc';

import { ensureElectronIpc } from '@/utils/electron/ipc';

export const localProviderService = {
  getImport: (input: { id: string; scanId: string }): Promise<LocalProviderImport> =>
    ensureElectronIpc().localProvider.getImport(input),
  scan: (): Promise<LocalProviderScan> => ensureElectronIpc().localProvider.scan(),
};
