import { AgentChatConfigSchema, CreateAgentSchema } from '@lobechat/types';
import { z } from 'zod';

import { getActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { agentService, type CreateAgentParams, type CreateAgentResult } from '@/services/agent';
import { discoverService } from '@/services/discover';
import { type AssistantMarketSource } from '@/types/discover';

const modelParamsSchema = z.object({
  frequency_penalty: z.number().optional(),
  max_tokens: z.number().optional(),
  presence_penalty: z.number().optional(),
  reasoning_effort: z.string().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
});

// A template carries portable behavior, never the publisher's device bindings,
// credentials, local resource IDs, rich-editor references or Market ownership.
const publicConfigSchema = CreateAgentSchema.pick({
  avatar: true,
  backgroundColor: true,
  description: true,
  name: true,
  openingMessage: true,
  openingQuestions: true,
  plugins: true,
  provider: true,
  systemRole: true,
  tags: true,
  title: true,
}).extend({
  chatConfig: AgentChatConfigSchema.omit({ runtimeEnv: true }).optional(),
  fewShots: z
    .array(z.object({ content: z.string(), role: z.enum(['user', 'assistant', 'system']) }))
    .optional(),
  model: z
    .union([
      z.string(),
      z.object({
        model: z.string(),
        parameters: modelParamsSchema.optional(),
        provider: z.string().optional(),
      }),
    ])
    .nullish(),
  params: modelParamsSchema.optional(),
  tts: z
    .object({
      showAllLocaleVoice: z.boolean().optional(),
      ttsService: z.literal('openai'),
      voice: z.object({ openai: z.string() }),
    })
    .optional(),
});

interface ImportPublicAgentOptions {
  createAgent: (params: CreateAgentParams) => Promise<CreateAgentResult>;
  identifier: string;
  source?: AssistantMarketSource;
  version?: string;
  visibility: 'private' | 'public';
  workspaceId: string | null;
}

export const importPublicAgent = async ({
  createAgent,
  identifier,
  source,
  version,
  visibility,
  workspaceId,
}: ImportPublicAgentOptions) => {
  const assertCurrentScope = () => {
    if (getActiveWorkspaceId() !== workspaceId) throw new Error('Workspace changed during import');
  };
  assertCurrentScope();

  const existingAgentId = await agentService.getAgentByForkedFromIdentifier(identifier);
  assertCurrentScope();
  if (existingAgentId) return { agentId: existingAgentId, alreadyAdded: true } as const;

  // Refetch anonymously even when the detail page was loaded with Market login.
  // This endpoint must not fall back to authenticated details on older servers.
  const detail = await discoverService.getPublicAssistantDetail({ identifier, source, version });
  assertCurrentScope();
  if (!detail?.config || (detail.status && detail.status !== 'published')) {
    throw new Error('Public assistant configuration is unavailable');
  }

  const config = publicConfigSchema.parse(detail.config);
  const { agentId } = await createAgent({
    config: {
      ...config,
      avatar: detail.avatar ?? config.avatar,
      backgroundColor: detail.backgroundColor ?? config.backgroundColor,
      description: detail.description ?? config.description,
      // AgentService normalizes the Market model-object representation.
      model: config.model as string | null | undefined,
      params: { ...config.params, forkedFromIdentifier: identifier },
      tags: detail.tags ?? config.tags,
      title: detail.title ?? config.title,
    },
    ...(workspaceId ? { visibility } : {}),
  });

  return {
    agentId,
    alreadyAdded: false,
    hasUnavailableResources: Boolean(
      detail.knowledgeCount || detail.config.knowledgeBases?.length || detail.config.files?.length,
    ),
    plugins: config.plugins,
  } as const;
};
