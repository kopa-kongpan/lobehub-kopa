'use client';

import { getDesktopSignInTarget } from '@lobechat/const/desktop';
import { type AuthorizationPhase, type AuthorizationProgress } from '@lobechat/electron-client-ipc';
import { useWatchBroadcast } from '@lobechat/electron-client-ipc';
import { Alert, Button, Center, cssVar, Flexbox, Text } from '@lobehub/ui';
import { LogIn, LogOutIcon, Server, Undo2Icon } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import urlJoin from 'url-join';

import { OFFICIAL_SITE } from '@/const/url';
import { isDesktop } from '@/const/version';
import UserInfo from '@/features/User/UserInfo';
import { useSignOut } from '@/hooks/useSignOut';
import { remoteServerService } from '@/services/electron/remoteServer';
import { electronSystemService } from '@/services/electron/system';
import { useElectronStore } from '@/store/electron';
import { setDesktopAutoOidcFirstOpenHandled } from '@/utils/electron/autoOidc';

import LobeMessage from '../components/LobeMessage';

const LEGACY_LOCAL_DB_MIGRATION_GUIDE_URL = urlJoin(
  OFFICIAL_SITE,
  '/docs/usage/migrate-from-local-database',
);

const authorizationPhaseI18nKeyMap = {
  browser_opened: 'screen5.auth.phase.browserOpened',
  cancelled: 'screen5.actions.cancel',
  verifying: 'screen5.auth.phase.verifying',
  waiting_for_auth: 'screen5.auth.phase.waitingForAuth',
} as const satisfies Record<AuthorizationPhase, string>;

// `status` hosts render this step as a connection panel for already-signed-in users,
// where the wizard's "back" and "next" have no meaning.
type LoginStepMode = 'onboarding' | 'status';

interface LoginStepProps {
  mode?: LoginStepMode;
  onBack: () => void;
  onNext: () => void;
}

const LoginStep = memo<LoginStepProps>(({ mode = 'onboarding', onBack, onNext }) => {
  const { t } = useTranslation('desktop-onboarding');
  const [isWaiting, setIsWaiting] = useState(false);
  const [authProgress, setAuthProgress] = useState<AuthorizationProgress | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [hasLegacyLocalDb, setHasLegacyLocalDb] = useState(false);
  const [localRemainingSeconds, setLocalRemainingSeconds] = useState<number | null>(null);

  const [
    dataSyncConfig,
    isConnectingServer,
    remoteServerSyncError,
    useDataSyncConfig,
    connectRemoteServer,
    refreshServerConfig,
    clearRemoteServerSyncError,
  ] = useElectronStore((s) => [
    s.dataSyncConfig,
    s.isConnectingServer,
    s.remoteServerSyncError,
    s.useDataSyncConfig,
    s.connectRemoteServer,
    s.refreshServerConfig,
    s.clearRemoteServerSyncError,
  ]);

  const signOut = useSignOut();

  useDataSyncConfig();

  useEffect(() => {
    if (!isDesktop) return;

    let mounted = true;
    electronSystemService
      .hasLegacyLocalDb()
      .then((value) => {
        if (mounted) setHasLegacyLocalDb(value);
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  const target = getDesktopSignInTarget(dataSyncConfig);
  const error = remoteError ?? remoteServerSyncError?.message;
  const handleLogin = async () => {
    if (!isDesktop) {
      setRemoteError(t('screen5.errors.desktopOnlyOidc'));
      return;
    }
    clearRemoteServerSyncError();
    setRemoteError(null);
    setAuthProgress(null);
    setIsWaiting(true);
    setDesktopAutoOidcFirstOpenHandled();
    await connectRemoteServer(target);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      setIsSigningOut(false);
    }
  };

  useWatchBroadcast('authorizationSuccessful', async () => {
    setRemoteError(null);
    clearRemoteServerSyncError();
    setAuthProgress(null);
    await refreshServerConfig();
    setIsWaiting(false);
  });

  useWatchBroadcast('authorizationFailed', ({ error }) => {
    setRemoteError(error);
    setIsWaiting(false);
    setAuthProgress(null);
  });

  useWatchBroadcast('authorizationProgress', (progress) => {
    if (progress.phase === 'cancelled') {
      setIsWaiting(false);
      setAuthProgress(null);
    } else {
      setAuthProgress(progress);
      setLocalRemainingSeconds(
        Math.max(0, Math.ceil((progress.maxPollTime - progress.elapsed) / 1000)),
      );
    }
  });

  // Decrement local countdown every second for smooth UI updates
  useEffect(() => {
    if (!isWaiting || error || !authProgress || !localRemainingSeconds) return;

    const timer = setTimeout(() => {
      setLocalRemainingSeconds((prev) => {
        if (prev === null || prev <= 0) return prev;
        return prev - 1;
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [authProgress, error, isWaiting, localRemainingSeconds]);

  const handleCancelAuth = async () => {
    setRemoteError(null);
    clearRemoteServerSyncError();

    setIsWaiting(false);
    setAuthProgress(null);
    await remoteServerService.cancelAuthorization();
  };

  if (dataSyncConfig?.active) {
    const isStatusMode = mode === 'status';
    const serverUrl = dataSyncConfig?.remoteServerUrl;

    const title = isStatusMode
      ? [
          dataSyncConfig.storageMode === 'cloud'
            ? t('screen5.status.cloud.title')
            : t('screen5.status.selfhost.title'),
        ]
      : [t('screen5.title'), t('screen5.title2'), t('screen5.title3')];

    const description = !isStatusMode
      ? t('screen5.description')
      : dataSyncConfig.storageMode === 'selfHost' && serverUrl
        ? t('screen5.status.selfhost.description', { url: serverUrl })
        : t('screen5.status.description');

    return (
      <Center gap={32} style={{ height: '100%', minHeight: '100%' }}>
        <Flexbox align={'flex-start'} justify={'flex-start'} style={{ width: '100%' }}>
          <LobeMessage sentences={title} />
          <Text as={'p'}>{description}</Text>
        </Flexbox>

        <Flexbox gap={16} style={{ width: '100%' }}>
          <UserInfo
            style={{
              background: cssVar.colorFillSecondary,
              borderRadius: 8,
            }}
          />
        </Flexbox>

        <Flexbox horizontal justify={'space-between'} style={{ marginTop: 32 }}>
          {isStatusMode ? (
            <Button
              disabled={isSigningOut}
              icon={LogOutIcon}
              style={{ color: cssVar.colorTextDescription }}
              type={'text'}
              onClick={handleSignOut}
            >
              {isSigningOut ? t('screen5.actions.signingOut') : t('screen5.actions.signOut')}
            </Button>
          ) : (
            <Button
              icon={Undo2Icon}
              style={{ color: cssVar.colorTextDescription }}
              type={'text'}
              onClick={onBack}
            >
              {t('back')}
            </Button>
          )}
          <Button type={'primary'} onClick={onNext}>
            {isStatusMode ? t('screen5.actions.done') : t('next')}
          </Button>
        </Flexbox>
      </Center>
    );
  }

  return (
    <Center gap={32} style={{ height: '100%', minHeight: '100%' }}>
      <Flexbox gap={8} width="100%">
        <LobeMessage sentences={[t('screen5.project.title')]} />
        <Text as="p">{t('screen5.project.description', { url: target.remoteServerUrl })}</Text>
      </Flexbox>
      <Flexbox gap={12} width="100%">
        {error && <Alert description={error} title={t('authResult.failed.title')} type="error" />}
        {isWaiting && !error ? (
          <>
            <Button block disabled loading icon={Server} size="large" type="primary">
              {t('screen5.actions.signingIn')}
            </Button>
            <Text role="status">
              {t(authorizationPhaseI18nKeyMap[authProgress?.phase ?? 'browser_opened'])}
            </Text>
            <Flexbox horizontal align="center" justify="space-between">
              {authProgress && localRemainingSeconds !== null && (
                <Text type="secondary">
                  {t('screen5.auth.remaining', { time: localRemainingSeconds })}
                </Text>
              )}
              <Button size="small" type="text" onClick={handleCancelAuth}>
                {t('screen5.actions.cancel')}
              </Button>
            </Flexbox>
          </>
        ) : (
          <Button
            block
            disabled={isConnectingServer}
            icon={LogIn}
            size="large"
            type="primary"
            onClick={handleLogin}
          >
            {t(error ? 'screen5.actions.tryAgain' : 'screen5.actions.signInProject')}
          </Button>
        )}
        {hasLegacyLocalDb && (
          <Button
            type="link"
            onClick={() =>
              electronSystemService.openExternalLink(LEGACY_LOCAL_DB_MIGRATION_GUIDE_URL)
            }
          >
            {t('screen5.legacyLocalDb.link')}
          </Button>
        )}
      </Flexbox>
    </Center>
  );
});

LoginStep.displayName = 'LoginStep';

export default LoginStep;
