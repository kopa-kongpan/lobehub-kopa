// @vitest-environment node
import { MarketAPIError, MarketSDK } from '@lobehub/market-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { readAgentDetailWithPublicFallback } from './publicAgentDetail';

// Keep the real SDK and HTTP serialization, isolating only service dependencies.
vi.mock('@/server/services/market', () => ({
  MarketService: class {
    market = new MarketSDK({ baseURL: 'https://market.example.test' });
  },
}));

const makeClient = () =>
  new MarketSDK({
    accessToken: 'expired-fixture-token',
    baseURL: 'https://market.example.test',
    trustedClientToken: 'fixture-trust-token',
  });

afterEach(() => vi.unstubAllGlobals());

describe('public agent detail with a stale Market login', () => {
  it('reads a public template without forwarding either credential on the retry', async () => {
    const requests: { headers: Headers; url: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      requests.push({ headers: new Headers(init?.headers), url: String(url) });
      if (requests.length === 1) return Response.json({ error: 'invalid_token' }, { status: 401 });
      return Response.json({
        config: { systemRole: 'Public template' },
        identifier: 'public-agent',
      });
    });

    await expect(
      readAgentDetailWithPublicFallback(makeClient(), 'public-agent', {
        locale: 'zh-CN',
        version: '1.0.0',
      }),
    ).resolves.toMatchObject({ identifier: 'public-agent' });
    expect(requests).toHaveLength(2);
    expect(requests[0].headers.get('authorization')).toBe('Bearer expired-fixture-token');
    expect(requests[1].headers.has('authorization')).toBe(false);
    expect(requests[1].headers.has('x-lobe-trust-token')).toBe(false);
    expect(requests[1].url).toBe(requests[0].url);
  });

  it('does not downgrade an authenticated successful read', async () => {
    const fetchMock = vi.fn(async () => Response.json({ identifier: 'private-owned-agent' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      readAgentDetailWithPublicFallback(makeClient(), 'private-owned-agent', {}),
    ).resolves.toMatchObject({ identifier: 'private-owned-agent' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([403, 404, 429, 500])(
    'does not retry non-authentication failures (%s)',
    async (status) => {
      const fetchMock = vi.fn(async () => Response.json({ error: 'rejected' }, { status }));
      vi.stubGlobal('fetch', fetchMock);
      await expect(
        readAgentDetailWithPublicFallback(makeClient(), 'agent', {}),
      ).rejects.toMatchObject({ status });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('does not grant access when the anonymous request is also rejected', async () => {
    const fetchMock = vi.fn(async () => Response.json({ error: 'invalid_token' }, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      readAgentDetailWithPublicFallback(makeClient(), 'private-agent', {}),
    ).rejects.toBeInstanceOf(MarketAPIError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
