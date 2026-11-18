import { TRPCError } from '@trpc/server';
import pMap from 'p-map';
import { z } from 'zod';

import { DeviceModel } from '@/database/models/device';
import { normalizeProjectDirectory } from '@/database/models/projectWorkingDirectory';
import type { LobeChatDatabase } from '@/database/type';
import { deviceGateway } from '@/server/services/deviceGateway';

export const projectFolderSelection = z.object({
  deviceId: z.string().min(1).max(64),
  paths: z.array(z.string().min(1).max(4096)).min(1).max(100),
});

export async function verifyProjectFolders(
  ctx: { serverDB: LobeChatDatabase; userId: string; workspaceId?: string | null },
  selection: z.infer<typeof projectFolderSelection>,
) {
  const { deviceId } = selection;
  const workspaceId = ctx.workspaceId ?? undefined;
  const devices = new DeviceModel(ctx.serverDB, ctx.userId, workspaceId);
  const device = workspaceId
    ? await devices.findWorkspaceDeviceById(deviceId)
    : await devices.findPersonalByDeviceId(deviceId);
  if (!device) throw new TRPCError({ code: 'NOT_FOUND', message: 'Device unavailable' });
  let paths: string[];
  try {
    paths = [
      ...new Set(selection.paths.map((path) => normalizeProjectDirectory(path, device.platform))),
    ];
  } catch {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'An absolute directory path is required' });
  }
  await pMap(
    paths,
    async (path) => {
      const stat = await deviceGateway.statPath({
        deviceId,
        path,
        userId: ctx.userId,
        workspaceId,
      });
      if (!stat?.exists || !stat.isDirectory)
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Directory unavailable: ' + path,
        });
    },
    { concurrency: 5 },
  );
  return { deviceId, paths };
}
