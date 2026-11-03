'use client';

import { AGENT_CHAT_URL } from '@lobechat/const';
import { Button, Flexbox, Select, toast } from '@lobehub/ui';
import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { memo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  getActiveWorkspaceId,
  useActiveWorkspaceId,
} from '@/business/client/hooks/useActiveWorkspaceId';
import { importPublicAgent } from '@/features/CommunityAgentImport/importPublicAgent';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useQuery } from '@/hooks/useQuery';
import { ensureAgentMarketSkillsAndWarn } from '@/services/ensureAgentMarketSkills';
import { useAgentStore } from '@/store/agent';
import { useHomeStore } from '@/store/home';

import { useDetailContext } from '../../DetailProvider';

const styles = stylex.create({
  buttonGroup: { width: '100%' },
  forkButton: {
    flex: '1',
    width: 'unset',
    borderStartStartRadius: '0',
    borderEndStartRadius: '0',
  },
  // Match Button type="primary" on the right so the two halves read as one
  // pill. (colorPrimary bg + colorBgLayout text) auto-flips with the theme:
  // dark bg + near-white text in light theme, white bg + near-black text
  // in dark theme. We use colorBgLayout directly instead of the
  // semantically-named colorTextLightSolid because the cssVar proxy doesn't
  // pick up LobeHub's JS-level override of that token.
  visibilitySelect: {
    width: '130px',
    borderColor: cssVar.colorPrimary,
    borderInlineEndWidth: '0',
    borderStartEndRadius: '0',
    borderEndEndRadius: '0',
    color: cssVar.colorBgLayout,
    backgroundColor: cssVar.colorPrimary,
    backgroundImage: 'none',
  },
  // Hover / active feedback; skipped while the select is disabled.
  visibilitySelectInteractive: {
    borderColor: {
      'default': cssVar.colorPrimary,
      ':hover': cssVar.colorPrimaryHover,
      ':active': cssVar.colorPrimaryActive,
    },
    backgroundColor: {
      'default': cssVar.colorPrimary,
      ':hover': cssVar.colorPrimaryHover,
      ':active': cssVar.colorPrimaryActive,
    },
  },
});

type AddTarget = 'private' | 'public';

const ForkAndChat = memo<{ mobile?: boolean }>(({ mobile }) => {
  const { identifier, currentVersion } = useDetailContext();
  const { source } = useQuery();
  const pending = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const createAgent = useAgentStore((s) => s.createAgent);
  const refreshAgentList = useHomeStore((s) => s.refreshAgentList);

  const navigate = useWorkspaceAwareNavigate();
  const { t } = useTranslation('discover');
  const { allowed: canCreate } = usePermission('create_content');
  const activeWorkspaceId = useActiveWorkspaceId();
  const [visibility, setVisibility] = useState<AddTarget>('private');

  const handleAddAndChat = async (target: AddTarget = 'private') => {
    if (!canCreate || pending.current || !identifier) return;
    pending.current = true;
    setIsLoading(true);

    try {
      const result = await importPublicAgent({
        createAgent,
        identifier,
        source: source === 'legacy' ? 'legacy' : undefined,
        version: currentVersion,
        visibility: target,
        workspaceId: activeWorkspaceId,
      });
      // Navigation and dependent installs must stay in the scope of the copy.
      if (getActiveWorkspaceId() !== activeWorkspaceId) return;

      if (result.alreadyAdded) {
        toast.info(t('addAgent.alreadyAdded'));
      } else {
        // A sidebar refresh failure does not undo a successful local creation.
        try {
          await refreshAgentList();
        } catch (error) {
          console.error('Failed to refresh agents after import:', error);
        }
        if (getActiveWorkspaceId() !== activeWorkspaceId) return;
        toast.success(t('addAgent.success'));
        if (result.hasUnavailableResources) toast.warning(t('addAgent.resourcesNotCopied'));
        await ensureAgentMarketSkillsAndWarn(result.plugins);
      }

      if (getActiveWorkspaceId() === activeWorkspaceId) {
        navigate(AGENT_CHAT_URL(result.agentId, mobile));
      }
    } catch (error) {
      console.error('Adding public assistant failed:', error);
      toast.error(t('addAgent.failed'));
    } finally {
      pending.current = false;
      setIsLoading(false);
    }
  };

  // Personal mode has no Private/Public split — render the plain primary
  // button so users don't see a meaningless dropdown.
  if (!activeWorkspaceId) {
    return (
      <Button
        block
        className={stylex.props(styles.buttonGroup).className}
        disabled={!canCreate || !identifier}
        loading={isLoading}
        size={'large'}
        type={'primary'}
        onClick={() => handleAddAndChat('private')}
      >
        {t('addAgent.action')}
      </Button>
    );
  }

  // Workspace mode: Select on the left chooses Private (default) vs Public,
  // primary button on the right adds the local copy. Keeping the choice next to
  // the action makes the target visibility explicit at click time.
  const visibilityOptions = [
    { label: t('fork.visibilityPrivate'), value: 'private' },
    { label: t('fork.visibilityPublic'), value: 'public' },
  ];

  const isVisibilityDisabled = !canCreate || isLoading;

  return (
    <Flexbox horizontal className={stylex.props(styles.buttonGroup).className} gap={0}>
      <Select
        disabled={isVisibilityDisabled}
        options={visibilityOptions}
        size={'large'}
        suffixIconProps={{ color: cssVar.colorBgLayout }}
        value={visibility}
        className={
          stylex.props(
            styles.visibilitySelect,
            !isVisibilityDisabled && styles.visibilitySelectInteractive,
          ).className
        }
        onChange={(v) => setVisibility(v as AddTarget)}
      />
      <Button
        block
        className={stylex.props(styles.forkButton).className}
        disabled={!canCreate || !identifier}
        loading={isLoading}
        size={'large'}
        type={'primary'}
        onClick={() => handleAddAndChat(visibility)}
      >
        {t('addAgent.action')}
      </Button>
    </Flexbox>
  );
});

export default ForkAndChat;
