import { electronSystemService } from '@/services/electron/system';

import { pickProjectFolders } from './PickProjectFoldersModal';

export interface ProjectFolderSelection {
  deviceId: string;
  paths: string[];
}

export const projectFolderName = (path: string) => path.split(/[\\/]/).findLast(Boolean) || path;

export async function chooseProjectFolders({
  defaultPath,
  deviceId,
  local,
  title,
}: {
  defaultPath?: string;
  deviceId: string;
  local: boolean;
  title: string;
}): Promise<string[]> {
  if (!local) return pickProjectFolders({ defaultPath, deviceId, title });
  const result = await electronSystemService.selectFolder({ defaultPath, multiple: true, title });
  // Older desktop shells return just the first path; the form also supports adding another pick.
  return result?.paths ?? (result ? [result.path] : []);
}
