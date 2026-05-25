import { getClientEnv } from "@/lib/env/client";
import { getServerEnv } from "@/lib/env/server";

/**
 * Backward-compatible facade.
 * New code should import from `@/lib/env/server` or `@/lib/env/client` directly.
 */
export const getEnv = getServerEnv;
export const getClientSafeEnv = getClientEnv;

export type { QueueEngineProviderMode, ServerEnvShape as EnvShape } from "@/lib/env/server";

