import { isDesktop } from '@lobechat/const';
import { Button, Flexbox, Select, Text, toast } from '@lobehub/ui';
import { FolderOpenIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { devicePoolForAgent } from '@/features/ExecutionTargetPicker';
import { useLocalMachineDeviceIds } from '@/hooks/useLocalMachineDeviceIds';
import { useDeviceList } from '@/store/device';

import { chooseProjectFolder, type ProjectFolderSelection } from './projectFolder';

interface Props {
  disabled: boolean;
  initialDeviceId?: string;
  onChange: (folder?: ProjectFolderSelection) => void;
  value?: ProjectFolderSelection;
}

export default function ProjectFolderField({ disabled, initialDeviceId, onChange, value }: Props) {
  const { t } = useTranslation(['project', 'device', 'common']);
  const devices = useDeviceList({ refreshInterval: 15_000 });
  const workspaceId = useActiveWorkspaceId();
  const localIds = useLocalMachineDeviceIds();
  const pool = devicePoolForAgent(devices.data, !!workspaceId);
  const online = pool.filter((d) => d.online && !d.onlineUnknown);
  const [chosen, setChosen] = useState(initialDeviceId);
  const deviceId =
    value?.deviceId ??
    chosen ??
    online.find((d) => localIds.includes(d.deviceId))?.deviceId ??
    (online.length === 1 ? online[0].deviceId : undefined);
  const canBrowse = devices.isConfirmed && online.some((d) => d.deviceId === deviceId);
  const browse = async () => {
    if (!deviceId || !canBrowse) return;
    try {
      await chooseProjectFolder({
        defaultPath: value?.path,
        deviceId,
        local: isDesktop && localIds.includes(deviceId),
        onPick: onChange,
        title: t('create.chooseFolder'),
      });
    } catch (error) {
      console.error('Failed to open project folder picker', error);
      toast.error(t('workingDirectory.addFolderFailed', { ns: 'device' }));
    }
  };

  return (
    <Flexbox gap={8}>
      <Text fontSize={13} weight={500}>
        {t('directories.device')}
      </Text>
      <Select
        aria-label={t('directories.device')}
        disabled={disabled || !devices.isConfirmed}
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
        title={value?.path}
        onClick={browse}
      >
        <Text ellipsis>{value?.path || t('create.chooseFolder')}</Text>
      </Button>
      {devices.error ? (
        <AsyncError error={devices.error} variant="inline" onRetry={() => devices.mutate()} />
      ) : devices.isConfirmed && online.length === 0 ? (
        <Text type="secondary">{t('create.noOnlineDevices')}</Text>
      ) : null}
    </Flexbox>
  );
}
