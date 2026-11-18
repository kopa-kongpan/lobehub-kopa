import { createModal, useModalContext } from '@lobehub/ui';
import { useTranslation } from 'react-i18next';

import { DirectoryBrowser } from '@/features/WorkingDirectory/DirectoryBrowser';
import { useDeviceDirectorySource } from '@/features/WorkingDirectory/sources/useDeviceDirectorySource';

type PickerProps = { defaultPath?: string; deviceId: string; onPick: (paths: string[]) => void };

function ProjectFolderBrowser({ defaultPath, deviceId, onPick }: PickerProps) {
  const source = useDeviceDirectorySource(deviceId);
  const { close } = useModalContext();
  const { t } = useTranslation('project');
  const confirm = (paths: string[]) => {
    onPick(paths);
    close();
  };
  return (
    <DirectoryBrowser
      defaultPath={defaultPath}
      description={t('directories.multiSelectHint')}
      loading={false}
      source={source}
      multiSelect={{
        confirmLabel: (count) => t('directories.useSelected', { count }),
        onSelect: confirm,
      }}
      onCancel={close}
      onSelect={(path) => confirm([path])}
    />
  );
}

export function pickProjectFolders(options: Omit<PickerProps, 'onPick'> & { title: string }) {
  return new Promise<string[]>((resolve) => {
    createModal({
      onOpenChangeComplete: (open) => {
        if (!open) resolve([]);
      },
      content: <ProjectFolderBrowser {...options} onPick={resolve} />,
      footer: null,
      title: options.title,
      width: 'min(90vw, 560px)',
    });
  });
}
