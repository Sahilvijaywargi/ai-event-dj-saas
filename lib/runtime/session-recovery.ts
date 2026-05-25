import "server-only";

export type RecoveryConsistencyStatus = {
  status: "consistent" | "degraded" | "stale" | "unrecoverable";
  issues: string[];
  fallbackPath: "resume_snapshot" | "partial_restore" | "fresh_runtime_sync";
};

export type RecoveryCheckpoint = {
  id: string;
  source:
    | "operator_poll"
    | "operator_manual"
    | "reconnect"
    | "pre_refresh"
    | "server_health";
  createdAt: string;
  note?: string;
};

export type RuntimeRecoverySnapshot = {
  id: string;
  userId: string;
  createdAt: string;
  checkpoint: RecoveryCheckpoint;
  session: {
    sessionId: string | null;
    eventId: string | null;
    status: "live" | "paused" | "ended" | "none";
    phase: string | null;
    energy: number | null;
    bpm: number | null;
    activeTrack: string | null;
  };
  playback: {
    activeDevice: string | null;
    isPlaying: boolean;
    trackName: string | null;
    progressMs: number | null;
  };
  autonomous: {
    status: "running" | "stopped" | "unknown";
    supervisionMode: "manual_override" | "assisted_autonomous" | "unknown";
    lastDecision: string | null;
    pendingTransition: string | null;
  };
  reliability: {
    connectionQuality: "good" | "degraded" | "offline" | "unknown";
    spotifySyncHealth: "synced" | "degraded" | "desynced" | "unknown";
    heartbeatStale: boolean;
  };
};

export type SessionRecoveryState = {
  recoverable: boolean;
  latestSnapshot: RuntimeRecoverySnapshot | null;
  historyCount: number;
  staleSnapshot: boolean;
  consistency: RecoveryConsistencyStatus;
  continuityDiagnostics: string[];
};

const SNAPSHOT_REGISTRY = new Map<string, RuntimeRecoverySnapshot[]>();
const SNAPSHOT_MAX_HISTORY = 25;
const SNAPSHOT_STALE_MS = 8 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function snapshotAgeMs(snapshot: RuntimeRecoverySnapshot) {
  return Date.now() - new Date(snapshot.createdAt).getTime();
}

function assessConsistency(snapshot: RuntimeRecoverySnapshot | null): RecoveryConsistencyStatus {
  if (!snapshot) {
    return {
      status: "unrecoverable",
      issues: ["No recovery snapshot exists."],
      fallbackPath: "fresh_runtime_sync",
    };
  }

  const issues: string[] = [];
  const age = snapshotAgeMs(snapshot);
  const stale = age > SNAPSHOT_STALE_MS;
  if (stale) issues.push("Snapshot is stale for current runtime continuity window.");
  if (!snapshot.session.sessionId && snapshot.session.status !== "none") {
    issues.push("Session status is set but session id is missing.");
  }
  if (!snapshot.playback.activeDevice && snapshot.session.status === "live") {
    issues.push("No active playback device while session is live.");
  }
  if (snapshot.reliability.connectionQuality === "offline") {
    issues.push("Snapshot captured during offline/degraded conditions.");
  }

  if (issues.length === 0) {
    return {
      status: "consistent",
      issues: [],
      fallbackPath: "resume_snapshot",
    };
  }
  if (stale) {
    return {
      status: "stale",
      issues,
      fallbackPath: "fresh_runtime_sync",
    };
  }
  return {
    status: "degraded",
    issues,
    fallbackPath: "partial_restore",
  };
}

export function persistRecoveryCheckpoint(params: {
  userId: string;
  checkpoint: Omit<RecoveryCheckpoint, "id" | "createdAt">;
  snapshot: Omit<RuntimeRecoverySnapshot, "id" | "userId" | "createdAt" | "checkpoint">;
}) {
  const existing = SNAPSHOT_REGISTRY.get(params.userId) ?? [];
  const record: RuntimeRecoverySnapshot = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    userId: params.userId,
    createdAt: nowIso(),
    checkpoint: {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      source: params.checkpoint.source,
      createdAt: nowIso(),
      note: params.checkpoint.note,
    },
    session: params.snapshot.session,
    playback: params.snapshot.playback,
    autonomous: params.snapshot.autonomous,
    reliability: params.snapshot.reliability,
  };
  const next = [record, ...existing].slice(0, SNAPSHOT_MAX_HISTORY);
  SNAPSHOT_REGISTRY.set(params.userId, next);
  return record;
}

export function getSessionRecoveryState(userId: string): SessionRecoveryState {
  const history = SNAPSHOT_REGISTRY.get(userId) ?? [];
  const latestSnapshot = history[0] ?? null;
  const consistency = assessConsistency(latestSnapshot);
  const staleSnapshot = latestSnapshot ? snapshotAgeMs(latestSnapshot) > SNAPSHOT_STALE_MS : true;
  const continuityDiagnostics: string[] = [];

  if (latestSnapshot) {
    continuityDiagnostics.push(`Last checkpoint source: ${latestSnapshot.checkpoint.source}`);
    continuityDiagnostics.push(
      `Snapshot age: ${Math.floor(snapshotAgeMs(latestSnapshot) / 1000)}s`,
    );
  } else {
    continuityDiagnostics.push("No checkpoints available.");
  }
  if (consistency.status !== "consistent") {
    continuityDiagnostics.push(...consistency.issues);
  }

  return {
    recoverable: Boolean(latestSnapshot) && consistency.status !== "unrecoverable",
    latestSnapshot,
    historyCount: history.length,
    staleSnapshot,
    consistency,
    continuityDiagnostics: continuityDiagnostics.slice(0, 6),
  };
}

export function restoreSessionRecovery(userId: string) {
  const state = getSessionRecoveryState(userId);
  if (!state.latestSnapshot) {
    return {
      ok: false as const,
      message: "No recovery snapshot available.",
      state,
    };
  }
  const snapshot = state.latestSnapshot;
  if (state.consistency.status === "unrecoverable") {
    return {
      ok: false as const,
      message: "Recovery snapshot is not restorable.",
      state,
    };
  }
  return {
    ok: true as const,
    message:
      state.consistency.status === "consistent"
        ? "Session snapshot restored."
        : "Session snapshot restored with degraded consistency safeguards.",
    snapshot,
    state,
  };
}

