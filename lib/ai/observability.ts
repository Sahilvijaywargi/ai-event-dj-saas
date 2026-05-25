import "server-only";

export type ProviderMode = "mock" | "openrouter";

type ObservabilityState = {
  providerMode: ProviderMode;
  activeProvider: string;
  fallbackHitCount: number;
  timeoutCount: number;
  retryCount: number;
  totalAiGenerations: number;
  successfulAiGenerations: number;
  failedAiGenerations: number;
  totalResponseTimeMs: number;
  lastSuccessfulAiGeneration: string | null;
  lastFallbackReason: string | null;
};

const state: ObservabilityState = {
  providerMode: "mock",
  activeProvider: "MockQueueEngineProvider",
  fallbackHitCount: 0,
  timeoutCount: 0,
  retryCount: 0,
  totalAiGenerations: 0,
  successfulAiGenerations: 0,
  failedAiGenerations: 0,
  totalResponseTimeMs: 0,
  lastSuccessfulAiGeneration: null,
  lastFallbackReason: null,
};

export function setProviderSelection(mode: ProviderMode, activeProvider: string) {
  state.providerMode = mode;
  state.activeProvider = activeProvider;
}

export function recordAiSuccess(responseTimeMs: number) {
  state.totalAiGenerations += 1;
  state.successfulAiGenerations += 1;
  state.totalResponseTimeMs += responseTimeMs;
  state.lastSuccessfulAiGeneration = new Date().toISOString();
}

export function recordAiFailure(responseTimeMs: number, reason: string) {
  state.totalAiGenerations += 1;
  state.failedAiGenerations += 1;
  state.totalResponseTimeMs += responseTimeMs;
  state.lastFallbackReason = reason;
}

export function recordPipelineFailure(reason: string) {
  state.lastFallbackReason = reason;
}

export function recordFallback(reason: string) {
  state.fallbackHitCount += 1;
  state.lastFallbackReason = reason;
}

export function recordRetry() {
  state.retryCount += 1;
}

export function recordTimeout() {
  state.timeoutCount += 1;
}

export function getProviderHealthMetrics() {
  const averageResponseTimeMs =
    state.totalAiGenerations > 0
      ? Number((state.totalResponseTimeMs / state.totalAiGenerations).toFixed(2))
      : 0;
  const fallbackRate =
    state.totalAiGenerations > 0
      ? Number(((state.fallbackHitCount / state.totalAiGenerations) * 100).toFixed(2))
      : 0;

  return {
    providerMode: state.providerMode,
    activeProvider: state.activeProvider,
    fallbackHitCount: state.fallbackHitCount,
    timeoutCount: state.timeoutCount,
    retryCount: state.retryCount,
    averageResponseTimeMs,
    lastSuccessfulAiGeneration: state.lastSuccessfulAiGeneration,
    lastFallbackReason: state.lastFallbackReason,
    totalAiGenerations: state.totalAiGenerations,
    successfulAiGenerations: state.successfulAiGenerations,
    failedAiGenerations: state.failedAiGenerations,
    fallbackRate,
    aiOnline: state.lastSuccessfulAiGeneration !== null,
  };
}

