import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalProviderScanner } from '.';

let homeDir: string;
beforeEach(async () => {
  homeDir = await mkdtemp(path.join(tmpdir(), 'local-providers-'));
  await Promise.all(['.codex', '.claude'].map((dir) => mkdir(path.join(homeDir, dir))));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(homeDir, { recursive: true, force: true });
});
const write = (file: string, value: unknown) =>
  writeFile(path.join(homeDir, file), typeof value === 'string' ? value : JSON.stringify(value));
const scan = (scanner = new LocalProviderScanner(), env = {}) => scanner.scan({ env, homeDir });

describe('local provider detection and credential release', () => {
  it('keeps an OpenAI base URL override with its credential', async () => {
    const result = await scan(new LocalProviderScanner(), {
      OPENAI_API_KEY: 'test',
      OPENAI_BASE_URL: 'https://proxy.example.com/v1',
    });
    expect(result.candidates[0]).toMatchObject({
      baseURL: 'https://proxy.example.com/v1',
      status: 'ready',
    });
    await write('.codex/config.toml', 'openai_base_url = "https://configured.example.com/v1"');
    expect(
      (await scan(new LocalProviderScanner(), { OPENAI_API_KEY: 'test' })).candidates[0].baseURL,
    ).toBe('https://configured.example.com/v1');
  });

  it('recognizes Claude subscription environment without a settings file', async () => {
    expect(
      (await scan(new LocalProviderScanner(), { CLAUDE_CODE_OAUTH_TOKEN: 'subscription-fixture' }))
        .candidates[1].status,
    ).toBe('sign_in');
  });

  it('detects absence without making it a scan failure', async () => {
    expect((await scan()).candidates.map((c) => c.status)).toEqual(['not_found', 'not_found']);
  });

  it('imports Claude bearer credentials and explicit model aliases only after selection', async () => {
    await write('.claude/settings.json', {
      env: {
        ANTHROPIC_AUTH_TOKEN: 'fixture-secret',
        ANTHROPIC_BASE_URL: 'https://gateway.example.com',
        ANTHROPIC_DEFAULT_SONNET_MODEL: 'claude-fixture-sonnet',
        ANTHROPIC_DEFAULT_OPUS_MODEL: 'claude-fixture-opus',
      },
      model: 'sonnet',
    });
    const scanner = new LocalProviderScanner();
    const result = await scan(scanner);
    const entry = result.candidates.find((c) => c.source === 'claude')!;
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
    expect(entry).toMatchObject({
      status: 'ready',
      models: ['claude-fixture-sonnet', 'claude-fixture-opus'],
    });
    expect(scanner.getImport({ id: entry.id, scanId: result.scanId })).toMatchObject({
      apiKey: 'fixture-secret',
      authType: 'bearer',
    });
  });

  it('reports ChatGPT subscription login without exporting OAuth tokens', async () => {
    await write('.codex/auth.json', {
      auth_mode: 'chatgpt',
      tokens: { access_token: 'private-access', refresh_token: 'private-refresh' },
    });
    const scanner = new LocalProviderScanner();
    const result = await scan(scanner);
    expect(result.candidates[0].status).toBe('sign_in');
    expect(JSON.stringify(result)).not.toContain('private-');
    expect(() =>
      scanner.getImport({ id: result.candidates[0].id, scanId: result.scanId }),
    ).toThrow();
  });

  it('resolves Codex providers and profile models with their own environment key', async () => {
    await write(
      '.codex/config.toml',
      'model_provider = "proxy"\nmodel = "gpt-fixture"\n[model_providers.proxy]\nbase_url = "https://proxy.example.com/v1"\nenv_key = "PROXY_KEY"\nwire_api = "responses"\n[profiles.fast]\nmodel = "gpt-fast"',
    );
    const scanner = new LocalProviderScanner();
    const result = await scan(scanner, { PROXY_KEY: 'proxy-secret' });
    expect(result.candidates[0]).toMatchObject({
      status: 'ready',
      models: ['gpt-fixture', 'gpt-fast'],
      supportResponsesApi: true,
    });
    expect(scanner.getImport({ id: result.candidates[0].id, scanId: result.scanId }).apiKey).toBe(
      'proxy-secret',
    );
  });

  it('does not apply an OpenAI key to a different provider with no env key', async () => {
    await write(
      '.codex/config.toml',
      'model_provider = "proxy"\n[model_providers.proxy]\nbase_url = "https://proxy.example.com/v1"',
    );
    await write('.codex/auth.json', { OPENAI_API_KEY: 'official-private-key' });
    expect((await scan()).candidates[0].status).toBe('missing_key');
  });

  it('honors requires_openai_auth over the provider env_key', async () => {
    await write(
      '.codex/config.toml',
      'model_provider = "proxy"\n[model_providers.proxy]\nbase_url = "https://proxy.example.com/v1"\nrequires_openai_auth = true\nenv_key = "OTHER_KEY"',
    );
    await write('.codex/auth.json', { OPENAI_API_KEY: 'official-fixture' });
    const scanner = new LocalProviderScanner();
    const result = await scan(scanner, { OTHER_KEY: 'wrong-key' });
    expect(scanner.getImport({ id: result.candidates[0].id, scanId: result.scanId }).apiKey).toBe(
      'official-fixture',
    );
  });

  it('invalidates old scan handles and expires credentials', async () => {
    const scanner = new LocalProviderScanner();
    const first = await scan(scanner, { OPENAI_API_KEY: 'test' });
    const second = await scan(scanner, { OPENAI_API_KEY: 'test' });
    expect(first.candidates[0].providerId).toBe(second.candidates[0].providerId);
    expect(() => scanner.getImport({ id: first.candidates[0].id, scanId: first.scanId })).toThrow();
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);
    expect(() =>
      scanner.getImport({ id: second.candidates[0].id, scanId: second.scanId }),
    ).toThrow();
  });

  it.each([
    ['http://localhost:3000', 'local_endpoint'],
    ['https://secret:password@proxy.example.com', 'invalid_config'],
    ['https://proxy.example.com?api_key=secret', 'invalid_config'],
  ])('rejects unusable or secret-bearing endpoint %s', async (url, status) => {
    const result = await scan(new LocalProviderScanner(), {
      ANTHROPIC_API_KEY: 'secret',
      ANTHROPIC_BASE_URL: url,
    });
    const entry = result.candidates[1];
    expect(entry.status).toBe(status);
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('does not run credential helpers and isolates broken files', async () => {
    await write('.codex/config.toml', 'broken = "fixture-secret');
    await write('.claude/settings.json', { apiKeyHelper: 'touch /never-execute-me' });
    const result = await scan();
    expect(result.candidates.map((c) => c.status)).toEqual(['invalid_config', 'helper_required']);
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
  });

  it('uses custom configuration directories and detects Claude OAuth tokens', async () => {
    await mkdir(path.join(homeDir, 'custom'));
    await write('custom/settings.json', { env: { ANTHROPIC_AUTH_TOKEN: 'sk-ant-oat01-private' } });
    const result = await scan(new LocalProviderScanner(), {
      CLAUDE_CONFIG_DIR: path.join(homeDir, 'custom'),
    });
    expect(result.candidates[1].status).toBe('sign_in');
    expect(JSON.stringify(result)).not.toContain('sk-ant-oat');
  });
});
