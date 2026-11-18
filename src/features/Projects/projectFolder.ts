import { openPickWorkingDirModal } from '@/features/WorkingDirectory';
import { electronSystemService } from '@/services/electron/system';

export interface ProjectFolderSelection {
  deviceId: string;
  path: string;
}

export const projectFolderName = (path: string) => path.split(/[\\/]/).findLast(Boolean) || path;

export async function chooseProjectFolder({
  defaultPath,
  deviceId,
  local,
  onPick,
  title,
}: {
  defaultPath?: string;
  deviceId: string;
  local: boolean;
  onPick: (folder: ProjectFolderSelection) => void;
  title: string;
}) {
  if (local) {
    const result = await electronSystemService.selectFolder({ defaultPath, title });
    if (result) onPick({ deviceId, path: result.path });
    return;
  }

  openPickWorkingDirModal({
    defaultPath,
    deviceId,
    onPick: ({ path }) => onPick({ deviceId, path }),
  });
}
