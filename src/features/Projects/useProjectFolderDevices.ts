import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { devicePoolForAgent } from '@/features/ExecutionTargetPicker';
import { useLocalMachineDeviceIds } from '@/hooks/useLocalMachineDeviceIds';
import { useDeviceList } from '@/store/device';

export function useProjectFolderDevices() {
  const devices = useDeviceList({ refreshInterval: 15_000 });
  const workspaceId = useActiveWorkspaceId();
  const localIds = useLocalMachineDeviceIds();
  const pool = devicePoolForAgent(devices.data, !!workspaceId);
  const online = devices.isConfirmed ? pool.filter((d) => d.online && !d.onlineUnknown) : [];
  const localDevice = online.find((d) => localIds.includes(d.deviceId));
  const preferred = localDevice ?? (online.length === 1 ? online[0] : undefined);
  return { devices, localIds, online, pool, preferred };
}
