import "server-only";

import { getServerEnv } from "@/lib/env/server";
import { MockQueueEngineProvider, QueueEngineProvider } from "@/lib/ai/queue-engine";
import { setProviderSelection } from "@/lib/ai/observability";
import { OpenRouterQueueEngineProvider } from "@/lib/ai/providers/openrouter-provider";

export type QueueProviderMode = "mock" | "openrouter";

function getProviderMode(): QueueProviderMode {
  return getServerEnv().queueEngineProvider;
}

export function createQueueEngineProvider(): QueueEngineProvider {
  const fallback = new MockQueueEngineProvider();
  const mode = getProviderMode();

  if (mode === "openrouter") {
    setProviderSelection("openrouter", "OpenRouterQueueEngineProvider");
    return new OpenRouterQueueEngineProvider(fallback);
  }

  setProviderSelection("mock", "MockQueueEngineProvider");
  return fallback;
}

