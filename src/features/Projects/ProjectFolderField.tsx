import { isDesktop } from '@lobechat/const';
import { ActionIcon, Button, Flexbox, Select, Text, toast } from '@lobehub/ui';
import { FolderOpenIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';

import { chooseProjectFolders, type ProjectFolderSelection } from './projectFolder';
import { useProjectFolderDevices } from './useProjectFolderDevices';

interface Props {
  disabled: boolean;
  initialDeviceId?: string;
  onChange: (folder?: ProjectFolderSelection) => void;
  value?: ProjectFolderSelection;
}

export default function ProjectFolderField({ disabled, initialDeviceId, onChange, value }: Props) {
  const { t } = useTranslation(['project', 'device', 'common']);
  const { devices, localIds, online, pool, preferred } = useProjectFolderDevices();
  const [chosen, setChosen] = useState(initialDeviceId);
  const deviceId = value?.deviceId ?? chosen ?? preferred?.deviceId;
  const canBrowse = online.some((device) => device.deviceId === deviceId);
  const [browsing, setBrowsing] = useState(false);
  const selectingLocal = !!deviceId && isDesktop && localIds.includes(deviceId);
  const browse = async () => {
    if (!deviceId || !canBrowse || browsing) return;
    setBrowsing(true);
    try {
      const picked = await chooseProjectFolders({
        defaultPath: value?.paths.at(-1),
        deviceId,
        local: selectingLocal,
        title: t('create.chooseFolder'),
      });
      if (picked.length)
        onChange({ deviceId, paths: [...new Set([...(value?.paths ?? []), ...picked])] });
    } catch (error) {
      console.error('Failed to open project folder picker', error);
      toast.error(t('workingDirectory.addFolderFailed', { ns: 'device' }));
    } finally {
      setBrowsing(false);
    }
  };

  return (
    <Flexbox gap={8}>
      <Text fontSize={13} weight={500}>
        {t('directories.device')}
      </Text>
      <Select
        aria-label={t('directories.device')}
        disabled={disabled || browsing || !devices.isConfirmed}
        loading={devices.isLoading}
        placeholder={t('directories.device')}
        value={deviceId}
        options={pool.map((device) => ({
          disabled: !device.online || !!device.onlineUnknown,
          label: [
            device.friendlyName || device.hostname || device.deviceId,
            localIds.includes(device.deviceId) && t('create.thisComputer'),
            devices.isConfirmed && !device.online && !device.onlineUnknown && t('create.offline'),
          ]
            .filter(Boolean)
            .join(' · '),
          value: device.deviceId,
        }))}
        onChange={(id) => {
          setChosen(id);
          onChange(undefined);
        }}
      />
      <Button
        disabled={disabled || !canBrowse}
        icon={FolderOpenIcon}
        loading={browsing}
        onClick={browse}
      >
        {t(selectingLocal ? 'directories.chooseLocal' : 'create.chooseFolder')}
      </Button>
      {value?.paths.map((path) => (
        <Flexbox horizontal align="center" gap={8} key={path}>
          <Text ellipsis style={{ flex: 1, minWidth: 0 }} title={path}>
            {path}
          </Text>
          <ActionIcon
            disabled={disabled || browsing}
            icon={XIcon}
            size="small"
            title={t('directories.removeSelected', { path })}
            onClick={() => {
              const paths = value.paths.filter((item) => item !== path);
              setChosen(value.deviceId);
              onChange(paths.length ? { ...value, paths } : undefined);
            }}
          />
        </Flexbox>
      ))}
      {devices.error ? (
        <AsyncError error={devices.error} variant="inline" onRetry={() => devices.mutate()} />
      ) : devices.isConfirmed && online.length === 0 ? (
        <Text type="secondary">{t('create.noOnlineDevices')}</Text>
      ) : null}
    </Flexbox>
  );
}
