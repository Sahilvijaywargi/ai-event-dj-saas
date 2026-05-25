import "server-only";
import * as Sentry from "@sentry/nextjs";

export type RuntimeHeartbeatStatus = {
  alive: boolean;
  lastHeartbeatAt: string | null;
  stale: boolean;
  staleMs: number;
};

export type RuntimeReconnectStatus = {
  state: "idle" | "reconnecting" | "recovered" | "failed";
  lastAttemptAt: string | null;
  lastRecoveredAt: string | null;
  lastError: string | null;
  attempts: number;
};

export type RuntimeRecoveryEvent = {
  id: string;
  userId: string;
  eventType:
    | "heartbeat"
    | "stale_state_detected"
    | "spotify_reconnect_attempt"
    | "spotify_reconnect_success"
    | "spotify_reconnect_failed"
    | "playback_desync_detected"
    | "playback_resync_applied"
    | "offline_detected"
    | "api_retry";
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type RuntimeReliabilityState = {
  connectionQuality: "good" | "degraded" | "offline";
  spotifySyncHealth: "synced" | "degraded" | "desynced";
  heartbeat: RuntimeHeartbeatStatus;
  reconnect: RuntimeReconnectStatus;
  staleStateDetected: boolean;
  playbackDesyncDetected: boolean;
  pollingBackoffMs: number;
  retryBudgetRemaining: number;
  recoverySuggestions: string[];
  reconnectInProgress: boolean;
  diagnostics: RuntimeRecoveryEvent[];
};

type RuntimeReliabilityRegistry = {
  lastHeartbeatAt: number | null;
  reconnect: RuntimeReconnectStatus;
  retryBudgetRemaining: number;
  pollingBackoffMs: number;
  diagnostics: RuntimeRecoveryEvent[];
  staleStateDetected: boolean;
  playbackDesyncDetected: boolean;
  offlineDetected: boolean;
};

const RELIABILITY_REGISTRY = new Map<string, RuntimeReliabilityRegistry>();
const HEARTBEAT_STALE_MS = 60_000;
const DEFAULT_RETRY_BUDGET = 8;
const MAX_DIAGNOSTICS = 40;

function nowIso() {
  return new Date().toISOString();
}

function getOrCreateRegistry(userId: string) {
  const current = RELIABILITY_REGISTRY.get(userId);
  if (current) return current;
  const created: RuntimeReliabilityRegistry = {
    lastHeartbeatAt: null,
    reconnect: {
      state: "idle",
      lastAttemptAt: null,
      lastRecoveredAt: null,
      lastError: null,
      attempts: 0,
    },
    retryBudgetRemaining: DEFAULT_RETRY_BUDGET,
    pollingBackoffMs: 6500,
    diagnostics: [],
    staleStateDetected: false,
    playbackDesyncDetected: false,
    offlineDetected: false,
  };
  RELIABILITY_REGISTRY.set(userId, created);
  return created;
}

function appendEvent(
  userId: string,
  eventType: RuntimeRecoveryEvent["eventType"],
  message: string,
  metadata?: Record<string, unknown>,
) {
  const registry = getOrCreateRegistry(userId);
  const event: RuntimeRecoveryEvent = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    userId,
    eventType,
    message,
    createdAt: nowIso(),
    metadata,
  };
  registry.diagnostics = [event, ...registry.diagnostics].slice(0, MAX_DIAGNOSTICS);
}

export function touchRuntimeHeartbeat(userId: string, metadata?: Record<string, unknown>) {
  const registry = getOrCreateRegistry(userId);
  registry.lastHeartbeatAt = Date.now();
  registry.offlineDetected = false;
  appendEvent(userId, "heartbeat", "Runtime heartbeat updated.", metadata);
}

export function markStaleState(userId: string, message: string, metadata?: Record<string, unknown>) {
  const registry = getOrCreateRegistry(userId);
  registry.staleStateDetected = true;
  appendEvent(userId, "stale_state_detected", message, metadata);
}

export function markPlaybackDesync(userId: string, message: string, metadata?: Record<string, unknown>) {
  const registry = getOrCreateRegistry(userId);
  registry.playbackDesyncDetected = true;
  appendEvent(userId, "playback_desync_detected", message, metadata);
}

export function markOfflineDetected(userId: string, message: string, metadata?: Record<string, unknown>) {
  const registry = getOrCreateRegistry(userId);
  registry.offlineDetected = true;
  appendEvent(userId, "offline_detected", message, metadata);
}

export function updateReconnectStatus(
  userId: string,
  patch: Partial<RuntimeReconnectStatus>,
  event?: { type: RuntimeRecoveryEvent["eventType"]; message: string; metadata?: Record<string, unknown> },
) {
  const registry = getOrCreateRegistry(userId);
  registry.reconnect = {
    ...registry.reconnect,
    ...patch,
  };
  if (event) {
    appendEvent(userId, event.type, event.message, event.metadata);
  }
}

export function markPlaybackResynced(userId: string, metadata?: Record<string, unknown>) {
  const registry = getOrCreateRegistry(userId);
  registry.playbackDesyncDetected = false;
  appendEvent(userId, "playback_resync_applied", "Playback resync completed.", metadata);
}

export function setPollingBackoff(userId: string, ms: number) {
  const registry = getOrCreateRegistry(userId);
  registry.pollingBackoffMs = Math.max(3000, Math.min(30000, ms));
}

export function resetRetryBudget(userId: string) {
  const registry = getOrCreateRegistry(userId);
  registry.retryBudgetRemaining = DEFAULT_RETRY_BUDGET;
}

export async function withTransientRetry<T>(params: {
  userId: string;
  actionName: string;
  attempts?: number;
  fn: () => Promise<T>;
}) {
  const registry = getOrCreateRegistry(params.userId);
  const attempts = Math.max(1, Math.min(4, params.attempts ?? 2));
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await params.fn();
      if (attempt > 1) {
        appendEvent(params.userId, "api_retry", `${params.actionName} succeeded after retry ${attempt - 1}.`, {
          attempts: attempt,
        });
      }
      registry.retryBudgetRemaining = Math.max(0, registry.retryBudgetRemaining - (attempt - 1));
      return result;
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        Sentry.captureException(error, {
          tags: { area: "runtime_reliability", action: params.actionName },
          level: "error",
          extra: {
            attempts,
            retryBudgetRemaining: registry.retryBudgetRemaining,
          },
        });
      }
      appendEvent(params.userId, "api_retry", `${params.actionName} retry attempt ${attempt} failed.`, {
        attempt,
        error: error instanceof Error ? error.message : "unknown",
      });
      if (attempt < attempts) {
        const waitMs = 180 * attempt;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }
  throw lastError;
}

export function getRuntimeReliabilityState(params: {
  userId: string;
  playbackSynced: boolean;
  staleSignal?: boolean;
}) {
  const registry = getOrCreateRegistry(params.userId);
  const now = Date.now();
  const staleMs = registry.lastHeartbeatAt ? now - registry.lastHeartbeatAt : Number.POSITIVE_INFINITY;
  const heartbeat: RuntimeHeartbeatStatus = {
    alive: Number.isFinite(staleMs) && staleMs < HEARTBEAT_STALE_MS,
    lastHeartbeatAt: registry.lastHeartbeatAt ? new Date(registry.lastHeartbeatAt).toISOString() : null,
    stale: !Number.isFinite(staleMs) || staleMs >= HEARTBEAT_STALE_MS,
    staleMs: Number.isFinite(staleMs) ? staleMs : HEARTBEAT_STALE_MS + 1,
  };

  const staleStateDetected = Boolean(params.staleSignal || registry.staleStateDetected || heartbeat.stale);
  const playbackDesyncDetected = Boolean(registry.playbackDesyncDetected || !params.playbackSynced);
  const connectionQuality: RuntimeReliabilityState["connectionQuality"] = registry.offlineDetected
    ? "offline"
    : heartbeat.stale || registry.reconnect.state === "failed"
      ? "degraded"
      : "good";
  const spotifySyncHealth: RuntimeReliabilityState["spotifySyncHealth"] = playbackDesyncDetected
    ? "desynced"
    : registry.reconnect.state === "failed"
      ? "degraded"
      : "synced";

  const recoverySuggestions: string[] = [];
  if (connectionQuality !== "good") recoverySuggestions.push("Run reconnect recovery to restore session stability.");
  if (playbackDesyncDetected) recoverySuggestions.push("Run playback resync to align device and track state.");
  if (heartbeat.stale) recoverySuggestions.push("Heartbeat stale: keep operator console open and refresh runtime state.");
  if (registry.retryBudgetRemaining <= 2) {
    recoverySuggestions.push("Retry budget low: reduce control spam and allow polling backoff.");
  }
  if (recoverySuggestions.length === 0) {
    recoverySuggestions.push("Reliability healthy. Continue normal supervised operation.");
  }

  return {
    connectionQuality,
    spotifySyncHealth,
    heartbeat,
    reconnect: registry.reconnect,
    staleStateDetected,
    playbackDesyncDetected,
    pollingBackoffMs: registry.pollingBackoffMs,
    retryBudgetRemaining: registry.retryBudgetRemaining,
    recoverySuggestions,
    reconnectInProgress: registry.reconnect.state === "reconnecting",
    diagnostics: registry.diagnostics.slice(0, 15),
  } satisfies RuntimeReliabilityState;
}

