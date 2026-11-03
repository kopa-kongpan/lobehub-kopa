import { MarketAPIError, type MarketSDK } from '@lobehub/market-sdk';

import { MarketService } from '@/server/services/market';

/**
 * An expired Market login must not block a publicly readable agent template.
 * Keep authenticated access first (owners may view private agents), then let
 * Market itself enforce anonymous access. Never reuse credentials for this retry
 * or apply it to a write operation.
 */
export const readAgentDetailWithPublicFallback = async (
  market: MarketSDK,
  identifier: string,
  options: { locale?: string; version?: string },
) => {
  try {
    return await market.agents.getAgentDetail(identifier, options);
  } catch (error) {
    if (!(error instanceof MarketAPIError) || error.status !== 401) throw error;

    return new MarketService().market.agents.getAgentDetail(identifier, options);
  }
};
