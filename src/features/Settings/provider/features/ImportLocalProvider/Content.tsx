'use client';

import type { LocalProviderCandidate, LocalProviderScan } from '@lobechat/electron-client-ipc';
import { Alert, Button, Flexbox, Text, useModalContext } from '@lobehub/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useClientDataSWR } from '@/libs/swr';
import { localProviderService } from '@/services/electron/localProvider';
import { useAiInfraStore } from '@/store/aiInfra';
import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';

import { importLocalProvider } from './importProvider';

export const ImportLocalProviderContent = () => {
  const { t } = useTranslation('modelProvider');
  const { close } = useModalContext();
  const navigate = useWorkspaceAwareNavigate();
  const { allowed } = usePermission('manage_provider_key');
  const serverUrl = useElectronStore(electronSyncSelectors.remoteServerUrl);
  const providerList = useAiInfraStore((s) => s.aiProviderList);
  const {
    data: scan,
    error: scanError,
    isValidating: scanning,
    mutate,
  } = useClientDataSWR<LocalProviderScan>('localProviderScan', localProviderService.scan, {
    revalidateOnFocus: false,
    revalidateOnMount: true,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  });
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState(false);
  const [results, setResults] = useState<Record<string, 'imported' | 'exists' | 'partial'>>({});

  const detect = async () => {
    setError(false);
    try {
      await mutate();
    } catch {
      console.error('Local provider detection failed');
      setError(true);
    }
  };

  const importEntry = async (entry: LocalProviderCandidate) => {
    if (!scan || !allowed || busy) return;
    setBusy(entry.id);
    setError(false);
    try {
      const result = await importLocalProvider(scan.scanId, entry);
      setResults((previous) => ({ ...previous, [entry.id]: result }));
      await useAiInfraStore.getState().refreshAiProviderList();
    } catch {
      console.error('Local provider import failed');
      setError(true);
    } finally {
      setBusy(undefined);
    }
  };

  const viewProvider = (providerId: string) => {
    close();
    navigate(`/settings/provider/${providerId}`);
  };

  return (
    <Flexbox gap={16}>
      <Text>{t('localImport.description')}</Text>
      <Alert description={t('localImport.destination', { server: serverUrl })} type={'info'} />
      {(error || scanError) && <Alert description={t('localImport.error')} type={'error'} />}
      <Button disabled={!!busy} loading={scanning} onClick={detect}>
        {t(scanning ? 'localImport.scanning' : 'localImport.rescan')}
      </Button>
      {!scanning &&
        scan?.candidates.map((entry) => {
          const result = results[entry.id];
          const exists =
            !!result || providerList.some((provider) => provider.id === entry.providerId);
          return (
            <Flexbox gap={8} key={entry.id} paddingBlock={8}>
              <Flexbox horizontal align={'center'} gap={12} justify={'space-between'}>
                <Text weight={600}>{entry.name}</Text>
                {exists ? (
                  <Button onClick={() => viewProvider(entry.providerId)}>
                    {t('localImport.view')}
                  </Button>
                ) : (
                  <Button
                    disabled={!allowed || !!busy || entry.status !== 'ready'}
                    loading={busy === entry.id}
                    type={entry.status === 'ready' ? 'primary' : 'default'}
                    onClick={() => importEntry(entry)}
                  >
                    {t('localImport.import')}
                  </Button>
                )}
              </Flexbox>
              {entry.baseURL && (
                <Text style={{ overflowWrap: 'anywhere' }} type={'secondary'}>
                  {entry.baseURL}
                </Text>
              )}
              <Text type={'secondary'}>
                {entry.models.length
                  ? t('localImport.models', { models: entry.models.join('、') })
                  : t('localImport.noModels')}
              </Text>
              <Text role={'status'} type={result === 'partial' ? 'warning' : 'secondary'}>
                {t(
                  result
                    ? `localImport.${result}`
                    : exists
                      ? 'localImport.exists'
                      : `localImport.status.${entry.status}`,
                )}
              </Text>
              {entry.source === 'codex' && entry.status === 'sign_in' && (
                <Button onClick={() => viewProvider('chatgpt')}>{t('localImport.chatgpt')}</Button>
              )}
            </Flexbox>
          );
        })}
    </Flexbox>
  );
};
