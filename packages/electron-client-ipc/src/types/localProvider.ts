export type LocalProviderStatus =
  | 'ready'
  | 'not_found'
  | 'missing_key'
  | 'sign_in'
  | 'invalid_config'
  | 'helper_required'
  | 'unsupported'
  | 'local_endpoint';

/** Detection results deliberately contain no credential values. */
export interface LocalProviderCandidate {
  baseURL?: string;
  id: string;
  models: string[];
  name: string;
  providerId: string;
  sdkType: 'openai' | 'anthropic';
  source: 'codex' | 'claude';
  status: LocalProviderStatus;
  supportResponsesApi: boolean;
}

export interface LocalProviderScan {
  candidates: LocalProviderCandidate[];
  scanId: string;
}

/** Released only after the user chooses Import for a specific scan result. */
export interface LocalProviderImport extends LocalProviderCandidate {
  apiKey: string;
  authType: 'apiKey' | 'bearer';
}
