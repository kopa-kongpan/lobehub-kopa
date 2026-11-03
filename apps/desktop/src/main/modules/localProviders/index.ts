import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import type {
  LocalProviderCandidate,
  LocalProviderImport,
  LocalProviderScan,
  LocalProviderStatus,
} from '@lobechat/electron-client-ipc';
import { isRecord, pickTrimmedString, toRecord, type UnknownRecord } from '@lobechat/utils/object';
import { parse } from 'smol-toml';

interface ScannerOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
}

const string = pickTrimmedString;
const record = (value: unknown) => toRecord(value) ?? {};
const unique = (values: unknown[]) => [...new Set(values.map(string).filter((v) => !!v))];

// Never evaluate shell config, apiKeyHelper, or command-backed token providers.
const readConfig = async (
  file: string,
  format: 'json' | 'toml',
): Promise<{ state: 'ok' | 'missing' | 'invalid'; value: UnknownRecord }> => {
  try {
    if ((await stat(file)).size > 1024 * 1024) throw new Error('Oversized config');
    const contents = await readFile(file, 'utf8');
    const value: unknown = format === 'toml' ? parse(contents) : JSON.parse(contents);
    if (!isRecord(value)) throw new Error('Invalid config');
    return { state: 'ok' as const, value };
  } catch (error) {
    if (record(error).code === 'ENOENT') return { state: 'missing' as const, value: {} };
    // Parsers can include the offending line (and a secret) in their error text.
    return { state: 'invalid' as const, value: {} };
  }
};

const endpointStatus = (baseURL: string): LocalProviderStatus | undefined => {
  const url = URL.parse(baseURL);
  if (
    !url ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return 'invalid_config';
  // These addresses would point at the remote LobeHub server, not this computer.
  if (/^(localhost|127\.|0\.0\.0\.0$|\[::1\]$)/i.test(url.hostname)) return 'local_endpoint';
};

export class LocalProviderScanner {
  private imports = new Map<string, LocalProviderImport>();
  private scanId = '';
  private expiresAt = 0;

  async scan(options: ScannerOptions = {}): Promise<LocalProviderScan> {
    const env = options.env ?? process.env;
    const homeDir = options.homeDir ?? homedir();
    const codexHome = env.CODEX_HOME || path.join(homeDir, '.codex');
    const claudeHome = env.CLAUDE_CONFIG_DIR || path.join(homeDir, '.claude');
    const [config, auth, claude] = await Promise.all([
      readConfig(path.join(codexHome, 'config.toml'), 'toml'),
      readConfig(path.join(codexHome, 'auth.json'), 'json'),
      readConfig(path.join(claudeHome, 'settings.json'), 'json'),
    ]);
    const imports = new Map<string, LocalProviderImport>();
    const candidates: LocalProviderCandidate[] = [];
    const add = (
      candidate: Omit<LocalProviderCandidate, 'id' | 'providerId'>,
      identity: string,
      apiKey?: string,
      authType: LocalProviderImport['authType'] = 'apiKey',
    ) => {
      const digest = createHash('sha256')
        .update(`${candidate.source}:${identity}:${candidate.baseURL ?? ''}`)
        .digest('hex')
        .slice(0, 16);
      const id = `${candidate.source}-${digest}`;
      const status = candidate.baseURL ? endpointStatus(candidate.baseURL) : undefined;
      const entry: LocalProviderCandidate = {
        ...candidate,
        // Do not expose malformed URLs which may contain embedded credentials.
        baseURL: status === 'invalid_config' ? undefined : candidate.baseURL,
        id,
        providerId: `local-${id}`,
        status: status ?? candidate.status,
      };
      candidates.push(entry);
      if (entry.status === 'ready' && apiKey) imports.set(id, { ...entry, apiKey, authType });
    };

    const codex = config.value;
    const providers = record(codex.model_providers);
    const profiles = Object.values(record(codex.profiles)).filter(isRecord);
    const activeProfile = record(record(codex.profiles)[string(codex.profile) ?? '']);
    const activeProvider =
      string(activeProfile.model_provider) ?? string(codex.model_provider) ?? 'openai';
    const providerNames = new Set([activeProvider, ...Object.keys(providers)]);
    for (const provider of [...providerNames].slice(0, 100)) {
      const settings = record(providers[provider]);
      const usesOpenAI = provider === 'openai' || settings.requires_openai_auth === true;
      const apiKey = usesOpenAI
        ? (string(auth.value.OPENAI_API_KEY) ?? string(env.OPENAI_API_KEY))
        : (string(settings.experimental_bearer_token) ??
          string(env[string(settings.env_key) ?? '']));
      const baseURL =
        string(settings.base_url) ??
        (provider === 'openai'
          ? (string(codex.openai_base_url) ??
            string(env.OPENAI_BASE_URL) ??
            'https://api.openai.com/v1')
          : undefined);
      const models = unique([
        ...(activeProvider === provider ? [activeProfile.model ?? codex.model] : []),
        ...profiles
          .filter((p) => (p.model_provider ?? codex.model_provider ?? 'openai') === provider)
          .map((p) => p.model ?? codex.model),
      ]);
      let status: LocalProviderStatus = apiKey ? 'ready' : 'missing_key';
      if (!apiKey && usesOpenAI && (auth.value.auth_mode === 'chatgpt' || auth.value.tokens))
        status = 'sign_in';
      if (settings.auth || settings.gateway_oauth) status = 'helper_required';
      if (
        settings.http_headers ||
        settings.env_http_headers ||
        settings.query_params ||
        (settings.wire_api && !['responses', 'chat'].includes(String(settings.wire_api)))
      )
        status = 'unsupported';
      if (!baseURL || config.state === 'invalid' || (usesOpenAI && auth.state === 'invalid'))
        status = 'invalid_config';
      if (config.state === 'missing' && auth.state === 'missing' && !apiKey) status = 'not_found';
      add(
        {
          baseURL,
          models,
          name: `Codex · ${string(settings.name) ?? provider}`,
          sdkType: 'openai',
          source: 'codex',
          status,
          supportResponsesApi: settings.wire_api !== 'chat',
        },
        provider,
        apiKey,
      );
    }

    const claudeEnv = { ...env, ...record(claude.value.env) };
    const bearer = string(claudeEnv.ANTHROPIC_AUTH_TOKEN);
    const apiKey = bearer ?? string(claudeEnv.ANTHROPIC_API_KEY);
    const baseURL = string(claudeEnv.ANTHROPIC_BASE_URL) ?? 'https://api.anthropic.com';
    const rawModels = unique([
      claude.value.model,
      claudeEnv.ANTHROPIC_MODEL,
      ...Object.entries(claudeEnv)
        .filter(([key]) => /^ANTHROPIC_DEFAULT_\w+_MODEL$/.test(key))
        .map(([, value]) => value),
    ]);
    const models = unique(
      rawModels.map((model) => {
        const alias = model.replace(/\[1m\]$/, '');
        return ['opus', 'sonnet', 'haiku', 'fable'].includes(alias)
          ? claudeEnv[`ANTHROPIC_DEFAULT_${alias.toUpperCase()}_MODEL`]
          : ['default', 'opusplan'].includes(alias)
            ? undefined
            : alias;
      }),
    );
    let status: LocalProviderStatus = apiKey ? 'ready' : 'missing_key';
    if (apiKey?.startsWith('sk-ant-oat') || (!apiKey && claudeEnv.CLAUDE_CODE_OAUTH_TOKEN))
      status = 'sign_in';
    if (!apiKey && claude.value.apiKeyHelper) status = 'helper_required';
    if (
      ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'].some((key) =>
        ['1', 'true'].includes(String(claudeEnv[key])),
      )
    )
      status = 'unsupported';
    if (claudeEnv.ANTHROPIC_CUSTOM_HEADERS) status = 'unsupported';
    if (claude.state === 'missing' && status === 'missing_key') status = 'not_found';
    if (claude.state === 'invalid') status = 'invalid_config';
    add(
      {
        baseURL,
        models,
        name: 'Claude Code',
        sdkType: 'anthropic',
        source: 'claude',
        status,
        supportResponsesApi: false,
      },
      'claude',
      apiKey,
      bearer ? 'bearer' : 'apiKey',
    );

    this.imports = imports;
    this.scanId = randomUUID();
    this.expiresAt = Date.now() + 5 * 60 * 1000;
    return { candidates, scanId: this.scanId };
  }

  getImport(input: { id: string; scanId: string }): LocalProviderImport {
    const candidate = this.imports.get(input.id);
    if (input.scanId !== this.scanId || Date.now() > this.expiresAt || !candidate) {
      throw new Error('Local provider scan expired. Scan again.');
    }
    return { ...candidate };
  }
}
