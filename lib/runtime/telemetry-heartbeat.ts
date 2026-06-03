import "server-only";

export type FreshnessState = "healthy" | "aging" | "stale" | "expired";

export type RuntimeTelemetryHeartbeat = {
  lastPlaybackHeartbeat: number;
  lastDeviceHeartbeat: number;
  lastQueueHeartbeat: number;
  playbackFreshness: FreshnessState;
  deviceFreshness: FreshnessState;
  queueFreshness: FreshnessState;
  heartbeatContinuityScore: number;
  heartbeatDrift: number;
};

const playbackHeartbeatStore = new Map<string, number>();
const deviceHeartbeatStore = new Map<string, number>();
const queueHeartbeatStore = new Map<string, number>();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toFreshness(ageMs: number, windows: { healthy: number; aging: number; stale: number }): FreshnessState {
  if (ageMs < windows.healthy) return "healthy";
  if (ageMs < windows.aging) return "aging";
  if (ageMs < windows.stale) return "stale";
  return "expired";
}

function now() {
  return Date.now();
}

export function refreshPlaybackHeartbeat(userId: string) {
  const timestamp = now();
  playbackHeartbeatStore.set(userId, timestamp);
  return timestamp;
}

export function refreshDeviceHeartbeat(userId: string) {
  const timestamp = now();
  deviceHeartbeatStore.set(userId, timestamp);
  return timestamp;
}

export function refreshQueueHeartbeat(userId: string) {
  const timestamp = now();
  queueHeartbeatStore.set(userId, timestamp);
  return timestamp;
}

export function computeHeartbeatContinuity(params: {
  playbackAgeMs: number;
  deviceAgeMs: number;
  queueAgeMs: number;
}) {
  return Number(
    clamp(
      100 -
        (params.playbackAgeMs / 35_000) * 45 -
        (params.deviceAgeMs / 45_000) * 30 -
        (params.queueAgeMs / 75_000) * 25,
      0,
      100,
    ).toFixed(2),
  );
}

export function computeHeartbeatDrift(params: {
  playbackAgeMs: number;
  deviceAgeMs: number;
  queueAgeMs: number;
}) {
  const maxAge = Math.max(params.playbackAgeMs, params.deviceAgeMs, params.queueAgeMs);
  const minAge = Math.min(params.playbackAgeMs, params.deviceAgeMs, params.queueAgeMs);
  return Number(clamp(maxAge - minAge, 0, 120_000).toFixed(2));
}

export function evaluateTelemetryFreshness(userId: string): RuntimeTelemetryHeartbeat & {
  playbackAgeMs: number;
  deviceAgeMs: number;
  queueAgeMs: number;
} {
  const current = now();
  const lastPlaybackHeartbeat = playbackHeartbeatStore.get(userId) ?? current;
  const lastDeviceHeartbeat = deviceHeartbeatStore.get(userId) ?? current;
  const lastQueueHeartbeat = queueHeartbeatStore.get(userId) ?? current;

  const playbackAgeMs = Math.max(0, current - lastPlaybackHeartbeat);
  const deviceAgeMs = Math.max(0, current - lastDeviceHeartbeat);
  const queueAgeMs = Math.max(0, current - lastQueueHeartbeat);

  const playbackFreshness = toFreshness(playbackAgeMs, {
    healthy: 8_000,
    aging: 18_000,
    stale: 35_000,
  });
  const deviceFreshness = toFreshness(deviceAgeMs, {
    healthy: 12_000,
    aging: 25_000,
    stale: 45_000,
  });
  const queueFreshness = toFreshness(queueAgeMs, {
    healthy: 20_000,
    aging: 45_000,
    stale: 75_000,
  });

  return {
    lastPlaybackHeartbeat,
    lastDeviceHeartbeat,
    lastQueueHeartbeat,
    playbackFreshness,
    deviceFreshness,
    queueFreshness,
    heartbeatContinuityScore: computeHeartbeatContinuity({
      playbackAgeMs,
      deviceAgeMs,
      queueAgeMs,
    }),
    heartbeatDrift: computeHeartbeatDrift({
      playbackAgeMs,
      deviceAgeMs,
      queueAgeMs,
    }),
    playbackAgeMs,
    deviceAgeMs,
    queueAgeMs,
  };
}
