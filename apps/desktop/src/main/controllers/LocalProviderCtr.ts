import { z } from 'zod';

import { LocalProviderScanner } from '@/modules/localProviders';

import { ControllerModule, IpcMethod } from './index';

export default class LocalProviderCtr extends ControllerModule {
  static override readonly groupName = 'localProvider';
  private scanner = new LocalProviderScanner();

  @IpcMethod()
  async scan() {
    return this.scanner.scan();
  }

  @IpcMethod()
  async getImport(input: { id: string; scanId: string }) {
    return this.scanner.getImport(z.object({ id: z.string(), scanId: z.string() }).parse(input));
  }
}
