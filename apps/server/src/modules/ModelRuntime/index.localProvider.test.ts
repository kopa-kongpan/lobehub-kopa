// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildPayloadFromKeyVaults, initModelRuntimeWithUserPayload } from './index';

afterEach(() => vi.restoreAllMocks());

describe('imported Claude API credentials', () => {
  it.each(['bearer', undefined] as const)(
    'sends the matching HTTP auth header for %s',
    async (authType) => {
      const fetch = vi.fn<typeof globalThis.fetch>(
        async () =>
          new Response(
            JSON.stringify({
              content: [{ text: 'fixture reply', type: 'text' }],
              id: 'msg-fixture',
              model: 'claude-fixture',
              role: 'assistant',
              stop_reason: 'end_turn',
              type: 'message',
              usage: { input_tokens: 1, output_tokens: 1 },
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
      );
      const runtime = initModelRuntimeWithUserPayload(
        'local-claude-test',
        buildPayloadFromKeyVaults(
          {
            apiKey: 'fixture-token',
            authType,
            baseURL: 'https://proxy.example.com',
          },
          'anthropic',
        ),
        { fetch },
      );
      await runtime.chat({
        messages: [{ content: 'fixture', role: 'user' }],
        model: 'claude-fixture',
        stream: false,
      });
      const headers = new Headers(fetch.mock.calls[0][1]?.headers);
      expect(headers.get('authorization')).toBe(
        authType === 'bearer' ? 'Bearer fixture-token' : null,
      );
      expect(headers.get('x-api-key')).toBe(authType === 'bearer' ? null : 'fixture-token');
    },
  );
});
