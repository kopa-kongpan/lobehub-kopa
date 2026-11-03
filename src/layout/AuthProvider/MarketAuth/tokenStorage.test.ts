import type { PartialDeep } from 'type-fest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { userService } from '@/services/user';
import { useUserStore } from '@/store/user';
import type { UserSettings } from '@/types/user/settings';

import {
  clearMarketTokensFromDB,
  getMarketTokensFromDB,
  saveMarketTokensToDB,
} from './tokenStorage';

vi.mock('@/services/user', () => ({
  userService: { updateUserSettings: vi.fn() },
}));

describe('Market token storage', () => {
  let persistedSettings: PartialDeep<UserSettings>;

  beforeEach(() => {
    vi.clearAllMocks();
    persistedSettings = {
      general: { fontSize: 17 },
      keyVaults: { openai: { apiKey: 'synthetic-provider-key' } },
      market: {
        accessToken: 'synthetic-expired-access-token',
        expiresAt: 1,
        refreshToken: 'synthetic-expired-refresh-token',
      },
      tool: { searchProviders: ['searxng'] },
    };
    useUserStore.setState({
      refreshUserState: vi.fn(async () => {
        useUserStore.setState({ settings: persistedSettings });
      }),
      settings: structuredClone(persistedSettings),
      updateSettingsSignal: undefined,
    });
    vi.mocked(userService.updateUserSettings).mockImplementation(async (patch) => {
      persistedSettings = { ...persistedSettings, ...patch };
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('removes stale Market credentials from persisted settings without changing other columns', async () => {
    const { market: _market, ...otherSettings } = structuredClone(persistedSettings);

    await clearMarketTokensFromDB();

    expect(persistedSettings).toEqual({ ...otherSettings, market: null });
    expect(getMarketTokensFromDB()).toBeNull();
    expect(userService.updateUserSettings).toHaveBeenCalledWith(
      { market: null },
      expect.any(AbortSignal),
    );
  });

  it('does not write again when Market credentials are already cleared', async () => {
    await clearMarketTokensFromDB();
    await clearMarketTokensFromDB();

    expect(userService.updateUserSettings).toHaveBeenCalledTimes(1);
  });

  it('can save a new Market session after clearing the expired one', async () => {
    await clearMarketTokensFromDB();
    await saveMarketTokensToDB('synthetic-new-access-token', undefined, 123_456);

    expect(persistedSettings.market).toEqual({
      accessToken: 'synthetic-new-access-token',
      expiresAt: 123_456,
      refreshToken: undefined,
    });
    expect(getMarketTokensFromDB()?.refreshToken).toBeUndefined();
  });
});
