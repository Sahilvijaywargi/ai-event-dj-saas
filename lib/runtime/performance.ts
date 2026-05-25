export type PollingOptimizationResult = {
  recommendedIntervalMs: number;
  pollingIntensity: "low" | "medium" | "high";
  backgroundOptimized: boolean;
  batteryFriendlyMode: boolean;
  shouldPoll: boolean;
  reason: string;
};

export type RenderOptimizationIssue = {
  code: "high_render_frequency" | "redundant_refresh" | "heavy_background_polling";
  severity: "warning" | "error";
  message: string;
};

export type NetworkEfficiencyMetrics = {
  online: boolean;
  effectiveType: string;
  saveData: boolean;
  retrySpacingMs: number;
  requestFailureRate: number;
};

export type RuntimePerformanceState = {
  polling: PollingOptimizationResult;
  network: NetworkEfficiencyMetrics;
  renderLoad: "low" | "medium" | "high";
  renderCountEstimate: number;
  issues: RenderOptimizationIssue[];
};

export function getAdaptivePollingOptimization(params: {
  visible: boolean;
  online: boolean;
  saveData: boolean;
  effectiveType: string;
  batteryLevel?: number;
  charging?: boolean;
  baseIntervalMs?: number;
}): PollingOptimizationResult {
  const base = params.baseIntervalMs ?? 6500;
  if (!params.online) {
    return {
      recommendedIntervalMs: 15000,
      pollingIntensity: "low",
      backgroundOptimized: true,
      batteryFriendlyMode: true,
      shouldPoll: false,
      reason: "Offline detected; polling suspended.",
    };
  }

  let interval = base;
  let reason = "Realtime foreground polling.";
  let pollingIntensity: PollingOptimizationResult["pollingIntensity"] = "high";
  let batteryFriendlyMode = false;
  let backgroundOptimized = false;

  if (!params.visible) {
    interval = Math.max(interval, 12000);
    pollingIntensity = "low";
    backgroundOptimized = true;
    reason = "Background tab detected; polling reduced.";
  }

  if (params.saveData || ["2g", "slow-2g"].includes(params.effectiveType)) {
    interval = Math.max(interval, 14000);
    pollingIntensity = "low";
    batteryFriendlyMode = true;
    reason = "Network data-saver/slow link; polling reduced.";
  } else if (params.effectiveType === "3g") {
    interval = Math.max(interval, 10000);
    pollingIntensity = pollingIntensity === "low" ? "low" : "medium";
    reason = "Moderate network quality; polling adjusted.";
  }

  if ((params.batteryLevel ?? 1) <= 0.2 && !params.charging) {
    interval = Math.max(interval, 16000);
    pollingIntensity = "low";
    batteryFriendlyMode = true;
    reason = "Low battery detected; battery-friendly polling active.";
  }

  if (interval >= 10000 && pollingIntensity === "high") {
    pollingIntensity = "medium";
  }

  return {
    recommendedIntervalMs: interval,
    pollingIntensity,
    backgroundOptimized,
    batteryFriendlyMode,
    shouldPoll: true,
    reason,
  };
}

export function getNetworkEfficiencyMetrics(params: {
  online: boolean;
  effectiveType: string;
  saveData: boolean;
  failureCount: number;
  requestCount: number;
}): NetworkEfficiencyMetrics {
  const retrySpacingMs = !params.online
    ? 15000
    : params.saveData || ["2g", "slow-2g"].includes(params.effectiveType)
      ? 12000
      : params.effectiveType === "3g"
        ? 8000
        : 4500;
  const requestFailureRate =
    params.requestCount > 0 ? Number((params.failureCount / params.requestCount).toFixed(4)) : 0;
  return {
    online: params.online,
    effectiveType: params.effectiveType,
    saveData: params.saveData,
    retrySpacingMs,
    requestFailureRate,
  };
}

export function createSwrCache<T>(ttlMs: number) {
  const store = new Map<string, { value: T; createdAt: number }>();
  return {
    read(key: string) {
      const row = store.get(key);
      if (!row) return null;
      const stale = Date.now() - row.createdAt > ttlMs;
      return { value: row.value, stale };
    },
    write(key: string, value: T) {
      store.set(key, { value, createdAt: Date.now() });
    },
    clear(key: string) {
      store.delete(key);
    },
  };
}

export function createMemoizedRuntimeSelector<TInput, TOutput>(
  selector: (input: TInput) => TOutput,
) {
  let lastSerialized = "";
  let lastOutput: TOutput | null = null;
  return (input: TInput) => {
    const next = JSON.stringify(input);
    if (next === lastSerialized && lastOutput !== null) return lastOutput;
    lastSerialized = next;
    lastOutput = selector(input);
    return lastOutput;
  };
}

export function createRealtimeBatcher<T>(flushMs = 180) {
  let buffer: T[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    push(item: T, onFlush: (items: T[]) => void) {
      buffer.push(item);
      if (timer) return;
      timer = setTimeout(() => {
        const batch = [...buffer];
        buffer = [];
        timer = null;
        onFlush(batch);
      }, flushMs);
    },
  };
}

export function evaluateRuntimePerformanceState(params: {
  polling: PollingOptimizationResult;
  network: NetworkEfficiencyMetrics;
  renderCountEstimate: number;
}): RuntimePerformanceState {
  const issues: RenderOptimizationIssue[] = [];
  if (params.renderCountEstimate > 45) {
    issues.push({
      code: "high_render_frequency",
      severity: "warning",
      message: "Render frequency is elevated for current runtime window.",
    });
  }
  if (
    params.polling.backgroundOptimized === false &&
    params.polling.pollingIntensity === "high" &&
    params.network.online
  ) {
    issues.push({
      code: "heavy_background_polling",
      severity: "warning",
      message: "Polling remains aggressive; consider increased backoff in background.",
    });
  }
  if (params.network.requestFailureRate > 0.25) {
    issues.push({
      code: "redundant_refresh",
      severity: "error",
      message: "High request failure rate indicates inefficient retries/refresh pressure.",
    });
  }

  const renderLoad: RuntimePerformanceState["renderLoad"] =
    params.renderCountEstimate > 60
      ? "high"
      : params.renderCountEstimate > 28
        ? "medium"
        : "low";

  return {
    polling: params.polling,
    network: params.network,
    renderLoad,
    renderCountEstimate: params.renderCountEstimate,
    issues,
  };
}

