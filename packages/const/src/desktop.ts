import type { DesktopHotkeyConfig } from '@lobechat/types';

import { DESKTOP_HOTKEYS_REGISTRATION } from './desktopGlobalShortcuts';

export const DESKTOP_USER_ID = 'DEFAULT_DESKTOP_USER';

export const DEFAULT_DESKTOP_HOTKEY_CONFIG: DesktopHotkeyConfig =
  DESKTOP_HOTKEYS_REGISTRATION.reduce((acc: DesktopHotkeyConfig, item) => {
    acc[item.id] = item.keys;
    return acc;
  }, {} as DesktopHotkeyConfig);

export const isValidDesktopServerUrl = (value?: string): value is string => {
  const url = value && URL.parse(value);
  return !!url && (url.protocol === 'https:' || url.protocol === 'http:');
};

/** A new installation uses the project's server. Keep explicitly configured self-hosts on upgrade. */
export const getDesktopSignInTarget = (config?: {
  remoteServerUrl?: string;
  storageMode: string;
}) => ({
  remoteServerUrl:
    config?.storageMode === 'selfHost' && isValidDesktopServerUrl(config.remoteServerUrl)
      ? config.remoteServerUrl.trim()
      : 'https://lobe.muyimusic.net',
  storageMode: 'selfHost' as const,
});
