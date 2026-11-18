import { describe, expect, it, vi } from 'vitest';

import { openPickWorkingDirModal } from '@/features/WorkingDirectory';
import { electronSystemService } from '@/services/electron/system';

import { chooseProjectFolder, projectFolderName } from './projectFolder';

vi.mock('@/features/WorkingDirectory', () => ({ openPickWorkingDirModal: vi.fn() }));
vi.mock('@/services/electron/system', () => ({ electronSystemService: { selectFolder: vi.fn() } }));

describe('choosing a project folder', () => {
  it('uses the system picker for this desktop and leaves the old choice intact on cancel', async () => {
    const options = { deviceId: 'mac', local: true, onPick: vi.fn(), title: 'Choose folder' };
    vi.mocked(electronSystemService.selectFolder)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ path: '/Users/test/demo' });
    await chooseProjectFolder(options);
    expect(options.onPick).not.toHaveBeenCalled();
    await chooseProjectFolder(options);
    expect(options.onPick).toHaveBeenCalledWith({ deviceId: 'mac', path: '/Users/test/demo' });
  });

  it('keeps a Windows directory on the device it was picked from', async () => {
    const onPick = vi.fn();
    await chooseProjectFolder({ deviceId: 'win', local: false, onPick, title: 'Choose folder' });
    const picker = vi.mocked(openPickWorkingDirModal).mock.lastCall![0];
    expect(picker.deviceId).toBe('win');
    const path = 'C:\\Work\\demo';
    await picker.onPick({ path });
    expect(onPick).toHaveBeenCalledWith({ deviceId: 'win', path });
    expect(projectFolderName(path)).toBe('demo');
  });
});
