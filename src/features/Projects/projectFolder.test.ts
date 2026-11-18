import { describe, expect, it, vi } from 'vitest';

import { electronSystemService } from '@/services/electron/system';

import { pickProjectFolders } from './PickProjectFoldersModal';
import { chooseProjectFolders, projectFolderName } from './projectFolder';

vi.mock('./PickProjectFoldersModal', () => ({ pickProjectFolders: vi.fn() }));
vi.mock('@/services/electron/system', () => ({ electronSystemService: { selectFolder: vi.fn() } }));

describe('choosing project folders', () => {
  const options = { deviceId: 'mac', local: true, title: 'Choose folders' };
  it('returns every selected local folder and an empty selection on cancel', async () => {
    vi.mocked(electronSystemService.selectFolder)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ path: '/A', paths: ['/A', '/B'] })
      .mockResolvedValueOnce({ path: '/legacy' });
    await expect(chooseProjectFolders(options)).resolves.toEqual([]);
    await expect(chooseProjectFolders(options)).resolves.toEqual(['/A', '/B']);
    await expect(chooseProjectFolders(options)).resolves.toEqual(['/legacy']);
    expect(electronSystemService.selectFolder).toHaveBeenCalledWith({
      multiple: true,
      title: 'Choose folders',
    });
  });
  it('uses the enrolled device browser outside the native desktop', async () => {
    const paths = ['C:\\Work\\demo', 'C:\\Work\\docs'];
    vi.mocked(pickProjectFolders).mockResolvedValue(paths);
    await expect(
      chooseProjectFolders({ ...options, deviceId: 'win', local: false }),
    ).resolves.toEqual(paths);
    expect(pickProjectFolders).toHaveBeenCalledWith({ deviceId: 'win', title: 'Choose folders' });
    expect(projectFolderName(paths[0])).toBe('demo');
  });
});
