import "server-only";

import { TransitionEvaluationResult } from "@/lib/ai/transition-engine";
import { getPlaybackOrchestrationState, queueAiRecommendedTrack } from "@/lib/spotify/device-orchestrator";
import { executeGuardedPlaybackCommand } from "@/lib/spotify/playback-guarded";

type MutationType =
  | "prepare_queue"
  | "prepare_execution_window"
  | "refresh_transport_state"
  | "recover_playback_sync"
  | "none";

export type TransportMutationResult = {
  success: boolean;
  mutationType: MutationType;
  executionSafety: "safe" | "guarded" | "blocked";
  rollbackPrepared: boolean;
  synchronizationHealth: "healthy" | "degraded" | "critical";
  blockers: string[];
  warnings: string[];
  explainability: string[];
  recoverySuggested: boolean;
  data?: Record<string, unknown>;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nowIso() {
  return new Date().toISOString();
}

function toSyncHealth(confidence: number): TransportMutationResult["synchronizationHealth"] {
  if (confidence >= 72) return "healthy";
  if (confidence >= 50) return "degraded";
  return "critical";
}

function toSafety(state: TransitionEvaluationResult["executionReadiness"]): TransportMutationResult["executionSafety"] {
  if (state === "ready") return "safe";
  if (state === "prepare" || state === "guarded") return "guarded";
  return "blocked";
}

export async function verifyActivePlaybackDevice(params: {
  userId: string;
  evaluation?: TransitionEvaluationResult | null;
}) {
  console.log("[TransportOrchestrator] verifyActivePlaybackDevice:start", { at: nowIso() });
  const playback = await getPlaybackOrchestrationState(params.userId);
  const blockers: string[] = [];
  const explainability: string[] = [];
  const activeDevice = playback.activeDevice;
  const playbackActive = Boolean(playback.playbackState);
  const syncStatus = playback.queueStatus?.syncStatus ?? "unknown";

  if (!activeDevice) blockers.push("no_active_device");
  if (activeDevice?.is_restricted) blockers.push("device_restricted");
  if (!playbackActive) blockers.push("playback_state_unavailable");
  if (syncStatus !== "synced") blockers.push("device_desynced");

  const synchronizationConfidence = clamp(
    (activeDevice ? 42 : 10) + (playbackActive ? 36 : 12) + (syncStatus === "synced" ? 22 : 6),
    0,
    100,
  );

  explainability.push(
    activeDevice ? "Active playback device detected." : "No active playback device detected.",
    playbackActive ? "Playback session telemetry is available." : "Playback session telemetry is missing.",
    syncStatus === "synced" ? "Playback synchronization healthy." : "Playback synchronization degraded.",
  );
  console.log("[TransportOrchestrator] verifyActivePlaybackDevice:result", {
    blockers,
    synchronizationConfidence,
    syncStatus,
  });
  return {
    playback,
    deviceReady: blockers.length === 0,
    synchronizationConfidence: Number(synchronizationConfidence.toFixed(2)),
    blockers,
    explainability,
  };
}

export async function prepareExecutionWindow(params: {
  userId: string;
  evaluation: TransitionEvaluationResult;
}) {
  console.log("[TransportOrchestrator] prepareExecutionWindow:start", { at: nowIso() });
  const deviceCheck = await verifyActivePlaybackDevice({
    userId: params.userId,
    evaluation: params.evaluation,
  });
  const freshness =
    params.evaluation.telemetry?.freshness === "fresh"
      ? 90
      : params.evaluation.telemetry?.freshness === "stale"
        ? 64
        : params.evaluation.telemetry?.freshness === "expired"
          ? 30
          : 52;
  const queueFreshness = clamp(
    freshness * 0.65 + params.evaluation.executionReadinessScore * 0.35 - deviceCheck.blockers.length * 4,
    0,
    100,
  );
  const mutationSafety = clamp(
    params.evaluation.executionReadinessScore * 0.4 +
      params.evaluation.transportStability * 0.3 +
      params.evaluation.deviceSynchronizationConfidence * 0.2 +
      queueFreshness * 0.1,
    0,
    100,
  );
  const executionWindowViable =
    params.evaluation.executionWindowState === "stable_window" ||
    (params.evaluation.executionWindowState === "narrow_window" && mutationSafety >= 60);
  const explainability = [
    executionWindowViable
      ? "Execution window viable for supervised preparation."
      : "Execution window not viable; transport preparation should be guarded.",
    queueFreshness >= 60
      ? "Queue freshness supports mutation preparation."
      : "Queue freshness degraded; refresh recommended before mutation.",
    ...deviceCheck.explainability,
  ];
  console.log("[TransportOrchestrator] prepareExecutionWindow:result", {
    queueFreshness,
    mutationSafety,
    executionWindowViable,
  });
  return {
    playbackFreshnessScore: Number(freshness.toFixed(2)),
    queueFreshnessScore: Number(queueFreshness.toFixed(2)),
    estimatedMutationSafety: Number(mutationSafety.toFixed(2)),
    executionWindowViability: executionWindowViable,
    explainability,
    blockers: deviceCheck.blockers,
  };
}

export async function queuePreparedTransitionTrack(params: {
  userId: string;
  evaluation: TransitionEvaluationResult;
  targetTrackId?: string | null;
}) {
  console.log("[TransportOrchestrator] queuePreparedTransitionTrack:start", {
    at: nowIso(),
    targetTrackId: params.targetTrackId ?? params.evaluation.executionPlan.targetTrackId,
  });
  const targetTrackId = params.targetTrackId ?? params.evaluation.executionPlan.targetTrackId;
  const explainability: string[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!targetTrackId) blockers.push("missing_target_track");
  if (params.evaluation.executionReadiness === "blocked") blockers.push("execution_readiness_blocked");
  if (params.evaluation.rollbackSafetyMargin < 40) blockers.push("rollback_margin_insufficient");
  if ((params.evaluation.telemetry?.freshness ?? "unknown") === "expired") blockers.push("stale_telemetry");
  if (params.evaluation.deviceSynchronizationConfidence < 50) blockers.push("sync_health_degraded");

  const deviceCheck = await verifyActivePlaybackDevice({ userId: params.userId, evaluation: params.evaluation });
  blockers.push(...deviceCheck.blockers.filter((item) => !blockers.includes(item)));
  if (params.evaluation.executionBlockers.includes("conflicting_runtime_signals")) {
    warnings.push("runtime_signal_conflicts_detected");
  }

  if (blockers.length > 0) {
    explainability.push("Queue preparation rejected due to transport safety blockers.");
    console.log("[TransportOrchestrator] queuePreparedTransitionTrack:rejected", { blockers, warnings });
    return {
      success: false,
      mutationType: "prepare_queue" as const,
      executionSafety: toSafety(params.evaluation.executionReadiness),
      rollbackPrepared: params.evaluation.rollbackSafetyMargin >= 45,
      synchronizationHealth: toSyncHealth(params.evaluation.deviceSynchronizationConfidence),
      blockers,
      warnings,
      explainability: [
        ...explainability,
        "WHY rejected: execution readiness or synchronization prerequisites are not satisfied.",
      ],
      recoverySuggested: true,
    } satisfies TransportMutationResult;
  }
  if (!targetTrackId) {
    return {
      success: false,
      mutationType: "prepare_queue" as const,
      executionSafety: "blocked",
      rollbackPrepared: false,
      synchronizationHealth: "critical",
      blockers: ["missing_target_track"],
      warnings,
      explainability: ["Queue preparation rejected because target track is missing."],
      recoverySuggested: true,
    } satisfies TransportMutationResult;
  }

  const guardedResult = await executeGuardedPlaybackCommand({
    userId: params.userId,
    commandType: "queue",
    executionSource: "live_session_sync",
    trackUri: `spotify:track:${targetTrackId}`,
    commandPayload: {
      source: "transport_orchestrator",
      readiness: params.evaluation.executionReadiness,
      readinessScore: params.evaluation.executionReadinessScore,
      rollbackSafetyMargin: params.evaluation.rollbackSafetyMargin,
    },
    execute: () => queueAiRecommendedTrack({ userId: params.userId, spotifyTrackId: targetTrackId }),
  });

  if (!guardedResult.ok) {
    explainability.push("Queue preparation failed under playback guardrails.");
    console.log("[TransportOrchestrator] queuePreparedTransitionTrack:guarded-failure", {
      message: guardedResult.message,
      blockers,
    });
    return {
      success: false,
      mutationType: "prepare_queue",
      executionSafety: "guarded",
      rollbackPrepared: params.evaluation.rollbackSafetyMargin >= 45,
      synchronizationHealth: toSyncHealth(params.evaluation.deviceSynchronizationConfidence),
      blockers: blockers.concat("queue_mutation_rejected"),
      warnings,
      explainability: [
        ...explainability,
        guardedResult.message ?? "Guardrail rejected queue mutation.",
      ],
      recoverySuggested: true,
    } satisfies TransportMutationResult;
  }

  explainability.push("Queue preparation completed under supervised guardrails.");
  console.log("[TransportOrchestrator] queuePreparedTransitionTrack:success", { targetTrackId });
  return {
    success: true,
    mutationType: "prepare_queue",
    executionSafety: toSafety(params.evaluation.executionReadiness),
    rollbackPrepared: params.evaluation.rollbackSafetyMargin >= 45,
    synchronizationHealth: toSyncHealth(params.evaluation.deviceSynchronizationConfidence),
    blockers: [],
    warnings,
    explainability: [
      ...explainability,
      "WHY allowed: readiness, synchronization, and telemetry checks passed.",
    ],
    recoverySuggested: false,
  } satisfies TransportMutationResult;
}

export async function recoverPlaybackSynchronization(params: {
  userId: string;
}) {
  console.log("[TransportOrchestrator] recoverPlaybackSynchronization:start", { at: nowIso() });
  const firstCheck = await verifyActivePlaybackDevice({
    userId: params.userId,
    evaluation: null,
  });
  const blockers = [...firstCheck.blockers];
  const warnings: string[] = [];
  const explainability: string[] = [
    "Recovery attempts are supervised and bounded to telemetry/device refresh only.",
  ];
  if (!firstCheck.playback.playbackState) warnings.push("telemetry_refresh_required");
  if (!firstCheck.playback.activeDevice) warnings.push("active_device_recovery_required");
  if (firstCheck.playback.queueStatus?.syncStatus !== "synced") warnings.push("transport_resync_required");

  const secondCheck = await verifyActivePlaybackDevice({
    userId: params.userId,
    evaluation: null,
  });
  const recovered = secondCheck.deviceReady;
  explainability.push(
    recovered
      ? "Recovery check indicates transport synchronization restored."
      : "Recovery check indicates transport remains degraded; operator intervention required.",
  );
  console.log("[TransportOrchestrator] recoverPlaybackSynchronization:result", {
    recovered,
    warnings,
    blockers: recovered ? [] : blockers,
  });

  const rollbackPrepared = secondCheck.synchronizationConfidence >= 45 && recovered;

  return {
    success: recovered,
    mutationType: "recover_playback_sync" as const,
    executionSafety: recovered ? "guarded" : "blocked",
    rollbackPrepared,
    synchronizationHealth: toSyncHealth(secondCheck.synchronizationConfidence),
    blockers: recovered ? [] : blockers,
    warnings,
    explainability,
    recoverySuggested: !recovered,
    data: {
      initialSynchronizationConfidence: firstCheck.synchronizationConfidence,
      finalSynchronizationConfidence: secondCheck.synchronizationConfidence,
    },
  } satisfies TransportMutationResult;
}

export async function prepareTransportMutation(params: {
  userId: string;
  evaluation: TransitionEvaluationResult;
  queueTrack?: boolean;
}) {
  const executionWindow = await prepareExecutionWindow({
    userId: params.userId,
    evaluation: params.evaluation,
  });

  if (params.evaluation.executionReadiness === "blocked" || !executionWindow.executionWindowViability) {
    console.log("[TransportOrchestrator] prepareTransportMutation:blocked", {
      executionReadiness: params.evaluation.executionReadiness,
      executionWindowState: params.evaluation.executionWindowState,
    });
    return {
      success: false,
      mutationType: "prepare_execution_window" as const,
      executionSafety: "blocked",
      rollbackPrepared: params.evaluation.rollbackSafetyMargin >= 45,
      synchronizationHealth: toSyncHealth(params.evaluation.deviceSynchronizationConfidence),
      blockers: [
        ...(params.evaluation.executionReadiness === "blocked" ? ["execution_readiness_blocked"] : []),
        ...(executionWindow.executionWindowViability ? [] : ["execution_window_not_viable"]),
        ...executionWindow.blockers,
      ],
      warnings: ["transport_preparation_requires_operator_review"],
      explainability: [
        "Transport preparation rejected.",
        ...executionWindow.explainability,
      ],
      recoverySuggested: true,
      data: {
        playbackFreshnessScore: executionWindow.playbackFreshnessScore,
        queueFreshnessScore: executionWindow.queueFreshnessScore,
        estimatedMutationSafety: executionWindow.estimatedMutationSafety,
      },
    } satisfies TransportMutationResult;
  }

  if (params.queueTrack && params.evaluation.executionPlan.targetTrackId) {
    const queued = await queuePreparedTransitionTrack({
      userId: params.userId,
      evaluation: params.evaluation,
      targetTrackId: params.evaluation.executionPlan.targetTrackId,
    });
    return {
      ...queued,
      data: {
        ...(queued as TransportMutationResult).data ?? {},
        playbackFreshnessScore: executionWindow.playbackFreshnessScore,
        queueFreshnessScore: executionWindow.queueFreshnessScore,
        estimatedMutationSafety: executionWindow.estimatedMutationSafety,
      },
    } satisfies TransportMutationResult;
  }

  console.log("[TransportOrchestrator] prepareTransportMutation:prepared-window", {
    safety: executionWindow.estimatedMutationSafety,
  });
  return {
    success: true,
    mutationType: "prepare_execution_window",
    executionSafety: toSafety(params.evaluation.executionReadiness),
    rollbackPrepared: params.evaluation.rollbackSafetyMargin >= 45,
    synchronizationHealth: toSyncHealth(params.evaluation.deviceSynchronizationConfidence),
    blockers: [],
    warnings: executionWindow.queueFreshnessScore < 60 ? ["queue_freshness_degraded"] : [],
    explainability: [
      "Execution window prepared for supervised transport mutation.",
      ...executionWindow.explainability,
    ],
    recoverySuggested: executionWindow.queueFreshnessScore < 55,
    data: {
      playbackFreshnessScore: executionWindow.playbackFreshnessScore,
      queueFreshnessScore: executionWindow.queueFreshnessScore,
      estimatedMutationSafety: executionWindow.estimatedMutationSafety,
      executionWindowViability: executionWindow.executionWindowViability,
    },
  } satisfies TransportMutationResult;
}
