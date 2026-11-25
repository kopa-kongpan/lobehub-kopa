import { Alert, Button, createModal, Flexbox, useModalContext } from '@lobehub/ui';
import { t } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import { useProjectDirectoryStore, useProjectEnvironments } from '@/store/projectWorkingDirectory';

import type { ProjectFolderSelection } from '../projectFolder';
import ProjectFolderField from '../ProjectFolderField';

interface AddDirectoryOptions {
  /** The machine to add it on, when the caller already knows it. */
  deviceId?: string;
  /** Called with the folder once it is part of the project, and the device it was saved on. */
  onAdded?: (directory: { deviceId: string; id: string }) => void;
}

function AddDirectoryContent({
  projectId,
  environmentId: initialEnvironmentId,
  deviceId: initialDeviceId,
  onAdded,
}: AddDirectoryOptions & {
  projectId: string;
  environmentId?: string;
}) {
  const { t } = useTranslation('project');
  const environmentsRequest = useProjectDirectoryStore((s) => s.useFetchEnvironments)(projectId);
  const environments = useProjectEnvironments(projectId);
  // A project has one environment, made with it: nothing to choose.
  const environmentId = initialEnvironmentId ?? environments[0]?.id ?? '';
  const [folder, setFolder] = useState<ProjectFolderSelection>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const bindFolders = useProjectDirectoryStore((s) => s.bindFolders);
  const { close } = useModalContext();
  const save = async () => {
    if (!environmentId || !folder || pending) return;
    const { deviceId, paths } = folder;
    setPending(true);
    setError(undefined);
    try {
      const [added] = await bindFolders({
        projectId,
        environmentId,
        deviceId,
        paths,
      });
      close();
      // The device picked here, not the one the caller suggested: the person may have changed it.
      onAdded?.({ deviceId, id: added.id });
    } catch (error) {
      console.error('Failed to add work location', error);
      setError(error);
    } finally {
      setPending(false);
    }
  };
  return (
    <Flexbox gap={16}>
      <ProjectFolderField
        disabled={pending}
        initialDeviceId={initialDeviceId}
        value={folder}
        onChange={(next) => {
          setFolder(next);
          setError(undefined);
        }}
      />
      {error ? (
        <Alert
          showIcon
          description={error instanceof Error ? error.message : undefined}
          title={t('settings.addDirectoryFailed')}
          type="error"
        />
      ) : null}
      {environmentsRequest.error ? (
        <AsyncError
          error={environmentsRequest.error}
          onRetry={() => environmentsRequest.revalidate()}
        />
      ) : null}
      <Flexbox horizontal gap={8} justify="flex-end">
        <Button disabled={pending} onClick={close}>
          {t('cancel', { ns: 'common' })}
        </Button>
        <Button
          disabled={!environmentId || !folder}
          loading={pending}
          type="primary"
          onClick={save}
        >
          {t('settings.addDirectory')}
        </Button>
      </Flexbox>
    </Flexbox>
  );
}
export const openAddDirectoryModal = (
  projectId: string,
  environmentId?: string,
  options: AddDirectoryOptions = {},
) =>
  createModal({
    title: t(options.deviceId ? 'settings.setDeviceDirectory' : 'settings.addDirectory', {
      ns: 'project',
    }),
    content: (
      <AddDirectoryContent {...options} environmentId={environmentId} projectId={projectId} />
    ),
    footer: null,
    width: 520,
  });
