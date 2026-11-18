import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getTestDB } from '../../core/getTestDB';
import { ProjectRepository } from '../../repositories/project';
import { ProjectDirectoryRepository } from '../../repositories/projectDirectory';
import {
  agents,
  devices,
  environmentInstances,
  environments,
  projectEnvironments,
  users,
  workspaces,
} from '../../schemas';
import type { LobeChatDatabase } from '../../type';
import { EnvironmentModel } from '../environment';
import type { CreateProjectInput } from '../project';
import { ProjectModel } from '../project';
import { ProjectWorkingDirectoryModel } from '../projectWorkingDirectory';

const serverDB: LobeChatDatabase = await getTestDB();
const userId = 'project-repository-user';
const workspaceId = 'project-repository-workspace';
let projectIdentifierSequence = 0;

// Creating a project spans the project and the environment aggregates, so the
// environment rides on `ProjectRepository.create`'s transaction rather than on
// the single-table model insert.
const createProject = (repo: ProjectRepository, input: Omit<CreateProjectInput, 'identifier'>) =>
  repo.create({
    ...input,
    identifier: `R${String(++projectIdentifierSequence).padStart(5, '0')}`,
  });

describe('project creation and its resources', () => {
  const repo = new ProjectRepository(serverDB, userId);
  const model = new ProjectModel(serverDB, userId);

  beforeEach(async () => {
    await serverDB.delete(users);
    await serverDB.insert(users).values([{ id: userId }]);
  });

  afterEach(async () => {
    await serverDB.delete(projectEnvironments);
    await serverDB.delete(environmentInstances);
    await serverDB.delete(environments);
    await serverDB.delete(workspaces);
    await serverDB.delete(users);
  });

  it('creates a runnable folder on the selected device and pins the project agent to it', async () => {
    const folder = { deviceId: 'office-mac', path: '/Users/test/Project' };
    await serverDB.insert(devices).values({
      deviceId: folder.deviceId,
      identitySource: 'fallback',
      platform: 'darwin',
      userId,
    });

    const secondPath = '/Users/test/Sibling';
    const project = await repo.create({
      folders: { deviceId: folder.deviceId, paths: [folder.path, secondPath, folder.path] },
      name: 'Office',
    });
    expect(await new ProjectWorkingDirectoryModel(serverDB, userId).list(project.id)).toHaveLength(
      2,
    );
    expect(await new ProjectWorkingDirectoryModel(serverDB, userId).list(project.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ...folder, runnable: true }),
        expect.objectContaining({ deviceId: folder.deviceId, path: secondPath, runnable: true }),
      ]),
    );
    const agent = await serverDB.query.agents.findFirst({
      where: (row, { eq }) => eq(row.id, project.coordinatorAgentId!),
    });
    expect(agent?.agencyConfig).toMatchObject({
      boundDeviceId: folder.deviceId,
      executionTarget: 'device',
      workingDirByDevice: { [folder.deviceId]: { path: folder.path } },
    });
  });

  it('rolls back both the new project and its dedicated agent if binding fails', async () => {
    await expect(
      repo.create({ name: 'Unbound', folders: { deviceId: 'unknown', paths: ['/work'] } }),
    ).rejects.toThrow('Device not found');
    expect(await model.list()).toEqual([]);
    expect(await serverDB.select().from(agents)).toEqual([]);
  });

  it('attaches folders and links the existing agent without changing its configuration', async () => {
    const [agent] = await serverDB
      .insert(agents)
      .values({
        agencyConfig: { executionTarget: 'sandbox' },
        systemRole: 'Maintain the existing application.',
        title: 'Existing agent',
        userId,
      })
      .returning();
    await serverDB.insert(devices).values({
      deviceId: 'shared-mac',
      identitySource: 'fallback',
      platform: 'darwin',
      userId,
    });

    const project = await repo.create({
      coordinatorAgentId: agent.id,
      folders: { deviceId: 'shared-mac', paths: ['/work/app'] },
      name: 'App',
    });

    expect(project.coordinatorAgentId).toBe(agent.id);
    expect(await serverDB.select().from(agents)).toEqual([agent]);
    expect(await new ProjectWorkingDirectoryModel(serverDB, userId).list(project.id)).toEqual([
      expect.objectContaining({ deviceId: 'shared-mac', path: '/work/app', runnable: true }),
    ]);
  });

  it('rolls back earlier folders when a later folder cannot be bound to an existing project', async () => {
    await serverDB
      .insert(devices)
      .values({ deviceId: 'batch-mac', identitySource: 'fallback', platform: 'darwin', userId });
    const project = await createProject(repo, { name: 'Existing project' });
    const directories = new ProjectDirectoryRepository(serverDB, userId);
    const base = { deviceId: 'batch-mac', projectId: project.id };
    await directories.bindFolders({ ...base, paths: ['/work/original'] });
    await expect(
      directories.bindFolders({ ...base, paths: ['/work/new', 'relative'] }),
    ).rejects.toThrow();
    const after = await new ProjectWorkingDirectoryModel(serverDB, userId).list(project.id);
    expect(after.map(({ path }) => path)).toEqual(['/work/original']);
  });

  it('creates a project from a GitHub repository with its environment attached', async () => {
    const project = await createProject(repo, {
      name: 'lobehub',
      repository: {
        defaultBranch: 'canary',
        name: 'lobehub/lobehub',
        url: 'https://github.com/lobehub/lobehub.git',
      },
    });

    expect(await model.listEnvironments(project.id)).toEqual([
      expect.objectContaining({
        configuration: expect.objectContaining({
          kind: 'code',
          sources: [{ kind: 'git', ref: 'canary', url: 'https://github.com/lobehub/lobehub' }],
        }),
        name: 'lobehub/lobehub',
      }),
    ]);

    // A second project on the same repository shares the definition.
    const second = await createProject(repo, {
      name: 'lobehub again',
      repository: { name: 'lobehub/lobehub', url: 'git@github.com:lobehub/lobehub.git' },
    });
    const [first] = await model.listEnvironments(project.id);
    expect(await model.listEnvironments(second.id)).toEqual([
      expect.objectContaining({ id: first.id }),
    ]);
  });

  it('publishes the repository of a shared workspace project instead of reusing a private one', async () => {
    await serverDB.insert(workspaces).values({
      id: workspaceId,
      name: 'Repository Workspace',
      primaryOwnerId: userId,
      slug: workspaceId,
    });
    const repository = { name: 'lobehub/lobehub', url: 'https://github.com/lobehub/lobehub' };
    // The creator already checks the repository out privately.
    const own = await new EnvironmentModel(serverDB, userId, workspaceId).ensureForRepository({
      name: repository.name,
      repositoryUrl: repository.url,
    });
    const workspaceRepo = new ProjectRepository(serverDB, userId, workspaceId);
    const workspaceModel = new ProjectModel(serverDB, userId, workspaceId);

    const shared = await createProject(workspaceRepo, {
      name: 'Shared',
      repository,
      visibility: 'public',
    });
    const privateProject = await createProject(workspaceRepo, {
      name: 'Private',
      repository,
      visibility: 'private',
    });

    const [sharedEnvironment] = await workspaceModel.listEnvironments(shared.id);
    expect(sharedEnvironment).toEqual(expect.objectContaining({ visibility: 'public' }));
    expect(sharedEnvironment.id).not.toBe(own.id);
    expect(await workspaceModel.listEnvironments(privateProject.id)).toEqual([
      expect.objectContaining({ id: own.id, visibility: 'private' }),
    ]);
  });

  it('names the unique index a taken slug violates, so the router can map it', async () => {
    await createProject(repo, { name: 'Taken', slug: 'taken' });
    const error = await createProject(repo, { name: 'Taken again', slug: 'taken' }).catch(
      (e: unknown) => e,
    );
    let cause: any = error;
    while (cause && !cause.constraint) cause = cause.cause;
    expect(cause).toMatchObject({ code: '23505', constraint: 'projects_slug_user_id_unique' });
  });

  it('creates nothing when the repository URL is not a GitHub repository', async () => {
    await expect(
      createProject(repo, {
        name: 'Broken',
        repository: { name: 'broken', url: 'https://example.com/a/b' },
      }),
    ).rejects.toThrow('GitHub');
    expect(await model.list()).toEqual([]);
    expect(await serverDB.select().from(environments)).toEqual([]);
  });
});
