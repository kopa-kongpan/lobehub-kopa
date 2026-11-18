import { createProjectCoordinatorAgentConfig } from '@lobechat/builtin-agents';
import { Block, Flexbox, Icon, Tag, Text } from '@lobehub/ui';
import { ChevronDownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import AgentAvatar from '@/components/AgentAvatar';
import AssigneeAgentSelector from '@/features/AgentTasks/features/AssigneeAgentSelector';
import { useAgentDisplayMeta } from '@/features/AgentTasks/shared/useAgentDisplayMeta';

interface MainAgentSectionProps {
  coordinatorAgentId: string | null;
  /** Id reserved for the dedicated agent and used to seed its avatar. */
  dedicatedAgentId: string;
  disabled: boolean;
  onChange: (agentId: string | null) => void;
  projectAvatar?: string;
  projectName: string;
}

const MainAgentSection = ({
  coordinatorAgentId,
  dedicatedAgentId,
  disabled,
  onChange,
  projectAvatar,
  projectName,
}: MainAgentSectionProps) => {
  const { t } = useTranslation('project');
  const selected = useAgentDisplayMeta(coordinatorAgentId);
  const name = projectName.trim();
  const createLabel = t('create.mainAgentDedicatedPlaceholder');
  const newTitle = name ? createProjectCoordinatorAgentConfig({ name }).title : createLabel;
  const title = selected?.title ?? newTitle;

  return (
    <Flexbox gap={6}>
      <Text fontSize={13} weight={500}>
        {t('create.mainAgentLabel')}
      </Text>
      <AssigneeAgentSelector
        block
        currentAgentId={coordinatorAgentId}
        disabled={disabled}
        emptySelectionLabel={createLabel}
        triggerLabel={`${t('create.mainAgentLabel')} · ${title}`}
        onChange={onChange}
      >
        <Block
          clickable
          horizontal
          align="center"
          flex={1}
          gap={8}
          height={36}
          paddingInline={8}
          style={{ minWidth: 0 }}
          variant="outlined"
        >
          <AgentAvatar
            agentId={coordinatorAgentId ?? dedicatedAgentId}
            avatar={coordinatorAgentId ? selected?.avatar : projectAvatar}
            name={title}
            size={22}
          />
          <Text ellipsis style={{ flex: 1, minWidth: 0, textAlign: 'start' }} title={title}>
            {title}
          </Text>
          {!coordinatorAgentId && name && (
            <Tag size="small">{t('create.mainAgentDedicatedTag')}</Tag>
          )}
          <Icon icon={ChevronDownIcon} size={16} />
        </Block>
      </AssigneeAgentSelector>
      {!coordinatorAgentId && (
        <Text fontSize={12} type="secondary">
          {t('create.mainAgentDedicatedDescription')}
        </Text>
      )}
    </Flexbox>
  );
};

export default MainAgentSection;
