import "server-only";

import { QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { ingestCrowdFeedback } from "@/lib/ai/crowd-feedback";
import { getAudioEnvironmentState } from "@/lib/audio/audio-energy";
import {
  evaluateTransitionEngine,
  executeTransitionEnginePlan,
  TransitionEvaluationResult,
} from "@/lib/ai/transition-engine";
import { createQueueEngineProvider } from "@/lib/ai/providers";
import { storeRuntimeMemoryPattern } from "@/lib/ai/runtime-memory";
import { getPlaybackOrchestrationState } from "@/lib/spotify/device-orchestrator";
import { serveRecommendationDiagnostics } from "@/lib/spotify/diagnostics-serving";
import { normalizeRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { markStaleState, touchRuntimeHeartbeat } from "@/lib/runtime/reliability";

export type AutonomousExecutionDecision =
  | "hold_current_state"
  | "queue_next_track"
  | "recommend_transition"
  | "execute_supervised_transition"
  | "cooldown_energy"
  | "ramp_energy"
  | "blocked_by_safety";

export type AutonomousSafetyStatus = {
  safeToExecute: boolean;
  maxTransitionFrequencyOk: boolean;
  repeatedTransitionSuppressionOk: boolean;
  runawayEnergyEscalationOk: boolean;
  staleRecommendationOk: boolean;
  playbackDesyncOk: boolean;
  reasons: string[];
};

export type AutonomousLoopTick = {
  tickAt: string;
  decision: AutonomousExecutionDecision;
  confidence: number;
  riskLevel: TransitionEvaluationResult["riskLevel"] | "n/a";
  executed: boolean;
  message: string;
};

export type AutonomousLoopState = {
  userId: string;
  status: "stopped" | "running";
  supervisionMode: "manual_override" | "assisted_autonomous";
  intervalMs: number;
  startedAt: string | null;
  lastEvaluationAt: string | null;
  pendingTransition: string | null;
  lastDecision: AutonomousExecutionDecision | null;
  safetyStatus: AutonomousSafetyStatus;
  tickHistory: AutonomousLoopTick[];
};

type RuntimeLoopHandle = {
  timer: NodeJS.Timeout | null;
  state: AutonomousLoopState;
  lastExecutedTrackId: string | null;
  lastExecutionAt: number;
};

const LOOP_REGISTRY = new Map<string, RuntimeLoopHandle>();

function defaultSafetyStatus(): AutonomousSafetyStatus {
  return {
    safeToExecute: true,
    maxTransitionFrequencyOk: true,
    repeatedTransitionSuppressionOk: true,
    runawayEnergyEscalationOk: true,
    staleRecommendationOk: true,
    playbackDesyncOk: true,
    reasons: [],
  };
}

function makeInitialState(userId: string, intervalMs: number): AutonomousLoopState {
  return {
    userId,
    status: "stopped",
    supervisionMode: "manual_override",
    intervalMs,
    startedAt: null,
    lastEvaluationAt: null,
    pendingTransition: null,
    lastDecision: null,
    safetyStatus: defaultSafetyStatus(),
    tickHistory: [],
  };
}

function appendTick(state: AutonomousLoopState, tick: AutonomousLoopTick) {
  state.tickHistory = [tick, ...state.tickHistory].slice(0, 25);
  state.lastEvaluationAt = tick.tickAt;
  state.lastDecision = tick.decision;
}

async function loadQueueRecommendationsForUser(userId: string): Promise<QueueRecommendationWithMeta[]> {
  const supabase = await createSupabaseServerClient();
  const { data: plansData, error: plansError } = await supabase
    .from("event_plans")
    .select(
      "id,event_id,user_id,timeline,energy_progression,recommended_genres,starter_playlist,created_at,events!inner(event_name,event_type,event_date,start_time,end_time,crowd_size)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (plansError) throw new Error(plansError.message);

  const plans =
    plansData?.map((row) => {
      const relatedEvent = normalizeRelation(row.events);

      return {
        id: row.id,
        eventId: row.event_id,
        eventName: relatedEvent?.event_name ?? "",
        eventType: relatedEvent?.event_type ?? "",
        eventDate: relatedEvent?.event_date ?? "",
        startTime: relatedEvent?.start_time ?? "",
        endTime: relatedEvent?.end_time ?? "",
        crowdSize: relatedEvent?.crowd_size ?? 0,
        timeline: row.timeline,
        energyProgression: row.energy_progression,
        recommendedGenres: row.recommended_genres,
        starterPlaylist: row.starter_playlist,
        createdAt: row.created_at,
      };
    }) ?? [];

  const { data: snapshotsData } = await supabase
    .from("queue_snapshots")
    .select("id,event_plan_id,created_at,queue_data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const snapshotsByPlan = new Map<
    string,
    { latestSnapshotId: string; latestGeneratedAt: string; queueData: QueueRecommendationWithMeta; count: number }
  >();
  for (const snapshot of snapshotsData ?? []) {
    const existing = snapshotsByPlan.get(snapshot.event_plan_id);
    if (existing) {
      snapshotsByPlan.set(snapshot.event_plan_id, { ...existing, count: existing.count + 1 });
      continue;
    }
    snapshotsByPlan.set(snapshot.event_plan_id, {
      latestSnapshotId: snapshot.id,
      latestGeneratedAt: snapshot.created_at,
      queueData: snapshot.queue_data as QueueRecommendationWithMeta,
      count: 1,
    });
  }

  const provider = createQueueEngineProvider();
  const recommendations: QueueRecommendationWithMeta[] = [];
  for (const plan of plans) {
    const snapshotMeta = snapshotsByPlan.get(plan.id);
    const generated = await provider.generateFromPlan(plan);
    recommendations.push({
      ...(snapshotMeta?.queueData ?? generated),
      latestSnapshotId: snapshotMeta?.latestSnapshotId ?? null,
      latestGeneratedAt: snapshotMeta?.latestGeneratedAt ?? null,
      queueVersionCount: snapshotMeta?.count ?? 0,
      spotifyEnhancedRecommendations: (snapshotMeta?.queueData as QueueRecommendationWithMeta | undefined)
        ?.spotifyEnhancedRecommendations,
    });
  }
  return recommendations;
}

async function evaluateSafety(params: {
  userId: string;
  evaluation: TransitionEvaluationResult;
  lastExecutedTrackId: string | null;
  lastExecutionAt: number;
}) {
  const playback = await getPlaybackOrchestrationState(params.userId);
  const telemetry = (await serveRecommendationDiagnostics(params.userId)).items[0] ?? null;
  const now = Date.now();
  const audioState = await getAudioEnvironmentState({
    userId: params.userId,
    sessionId: params.evaluation.currentState.sessionId ?? undefined,
    limit: 20,
  });
  const reasons: string[] = [];

  const maxTransitionFrequencyOk = now - params.lastExecutionAt > 25_000;
  if (!maxTransitionFrequencyOk) reasons.push("Max transition frequency protection active.");

  const repeatedTransitionSuppressionOk =
    !params.evaluation.executionPlan.targetTrackId ||
    params.evaluation.executionPlan.targetTrackId !== params.lastExecutedTrackId;
  if (!repeatedTransitionSuppressionOk) reasons.push("Repeated transition suppressed.");

  const currentEnergy = params.evaluation.currentState.energy ?? 5;
  const runawayEnergyEscalationOk =
    params.evaluation.executionPlan.targetEnergy - currentEnergy <= 2.5;
  if (!runawayEnergyEscalationOk) reasons.push("Runaway energy escalation prevented.");

  const staleRecommendationOk = telemetry ? telemetry.freshness !== "expired" : false;
  if (!staleRecommendationOk) reasons.push("Recommendation freshness is stale/expired.");

  const playbackDesyncOk = Boolean(playback.activeDevice && playback.playbackState);
  if (!playbackDesyncOk) reasons.push("Playback desync detected (missing active device/state).");

  const audioSafetyOk =
    !audioState.drift.silenceDetected &&
    !(audioState.drift.spikeDetected && audioState.engagement.engagementScore < 40);
  if (!audioSafetyOk) reasons.push("Audio energy safety gate blocked execution.");

  const safeToExecute =
    maxTransitionFrequencyOk &&
    repeatedTransitionSuppressionOk &&
    runawayEnergyEscalationOk &&
    staleRecommendationOk &&
    playbackDesyncOk &&
    audioSafetyOk;

  return {
    safeToExecute,
    maxTransitionFrequencyOk,
    repeatedTransitionSuppressionOk,
    runawayEnergyEscalationOk,
    staleRecommendationOk,
    playbackDesyncOk,
    reasons,
  } satisfies AutonomousSafetyStatus;
}

async function runAutonomousTick(handle: RuntimeLoopHandle, executeIfSafe: boolean) {
  touchRuntimeHeartbeat(handle.state.userId, { source: "autonomous_loop_tick_start" });
  const queueRecommendations = await loadQueueRecommendationsForUser(handle.state.userId);
  const evaluation = await evaluateTransitionEngine({
    userId: handle.state.userId,
    queueRecommendations,
    assistedAutonomousEnabled: handle.state.supervisionMode === "assisted_autonomous",
  });
  const safetyStatus = await evaluateSafety({
    userId: handle.state.userId,
    evaluation,
    lastExecutedTrackId: handle.lastExecutedTrackId,
    lastExecutionAt: handle.lastExecutionAt,
  });
  handle.state.safetyStatus = safetyStatus;
  handle.state.pendingTransition = evaluation.executionPlan.targetTrackLabel;

  let decision: AutonomousExecutionDecision = "hold_current_state";
  let message = "Holding current state.";
  let executed = false;

  if (!evaluation.decision.shouldTransition) {
    decision = "recommend_transition";
    message = "Transition suggested for review, not yet executed.";
  } else if (!safetyStatus.safeToExecute) {
    decision = "blocked_by_safety";
    message = safetyStatus.reasons[0] ?? "Blocked by safety rules.";
  } else if (evaluation.decision.cooldownEnergy) {
    decision = "cooldown_energy";
    message = "Cooling down energy band before next transition.";
  } else if (evaluation.decision.rampEnergy) {
    decision = "ramp_energy";
    message = "Ramping energy lane for upcoming transition.";
  } else {
    decision = "queue_next_track";
    message = "Queue-next-track decision ready.";
  }

  if (
    executeIfSafe &&
    handle.state.supervisionMode === "assisted_autonomous" &&
    safetyStatus.safeToExecute &&
    evaluation.decision.shouldTransition
  ) {
    const execution = await executeTransitionEnginePlan({
      userId: handle.state.userId,
      evaluation,
      mode: "execute",
    });
    executed = execution.ok;
    decision = execution.ok ? "execute_supervised_transition" : "blocked_by_safety";
    message = execution.message;
    if (execution.ok && evaluation.executionPlan.targetTrackId) {
      handle.lastExecutedTrackId = evaluation.executionPlan.targetTrackId;
      handle.lastExecutionAt = Date.now();
      void ingestCrowdFeedback({
        userId: handle.state.userId,
        sessionId: evaluation.currentState.sessionId,
        feedbackType: "transition_accept",
        feedbackSource: "autonomous_loop",
        feedbackPayload: {
          decision,
          confidence: evaluation.confidence.score,
          riskLevel: evaluation.riskLevel,
        },
        energyImpact: evaluation.executionPlan.targetEnergy - (evaluation.currentState.energy ?? 5),
        confidenceImpact: (evaluation.confidence.score - 50) / 10,
      }).catch(() => {});
    } else if (!execution.ok) {
      void ingestCrowdFeedback({
        userId: handle.state.userId,
        sessionId: evaluation.currentState.sessionId,
        feedbackType: "transition_reject",
        feedbackSource: "autonomous_loop",
        feedbackPayload: {
          decision,
          reason: execution.message,
        },
        energyImpact: 0,
        confidenceImpact: -2,
      }).catch(() => {});
    }
  }

  const tick: AutonomousLoopTick = {
    tickAt: new Date().toISOString(),
    decision,
    confidence: evaluation.confidence.score,
    riskLevel: evaluation.riskLevel,
    executed,
    message,
  };
  if (!safetyStatus.staleRecommendationOk) {
    markStaleState(handle.state.userId, "Autonomous tick observed stale recommendation state.");
  }
  appendTick(handle.state, tick);
  touchRuntimeHeartbeat(handle.state.userId, { source: "autonomous_loop_tick_end", decision });
  void storeRuntimeMemoryPattern({
    userId: handle.state.userId,
    patternType:
      decision === "execute_supervised_transition"
        ? "successful_transition"
        : decision === "blocked_by_safety"
          ? "failed_transition"
          : "playlist_flow_pattern",
    patternContext: evaluation.executionPlan.targetPhase,
    successScore:
      decision === "execute_supervised_transition" ? 75 : decision === "blocked_by_safety" ? 24 : 52,
    confidenceScore: evaluation.confidence.score,
    learnedSignals: [
      {
        source: "autonomous_loop",
        signal: "loop_decision_confidence",
        value: evaluation.confidence.score / 100,
        weight: 0.9,
        polarity: executed ? "positive" : decision === "blocked_by_safety" ? "negative" : "neutral",
      },
      {
        source: "autonomous_loop",
        signal: "safety_status",
        value: safetyStatus.safeToExecute ? 1 : 0,
        weight: 0.75,
        polarity: safetyStatus.safeToExecute ? "positive" : "negative",
      },
      {
        source: "operator",
        signal: "operator_override_pattern",
        value: evaluation.crowdFeedbackInfluence.operatorInterventionRate / 100,
        weight: 0.6,
        polarity:
          evaluation.crowdFeedbackInfluence.operatorInterventionRate > 65 ? "negative" : "neutral",
      },
    ],
    reinforce: executed,
  }).catch(() => {});
  return tick;
}

export async function startAutonomousLoop(params: {
  userId: string;
  intervalMs?: number;
  supervisionMode?: "manual_override" | "assisted_autonomous";
}) {
  const intervalMs = Math.max(4000, Math.min(120000, params.intervalMs ?? 15000));
  const existing = LOOP_REGISTRY.get(params.userId);
  if (existing?.timer) {
    clearInterval(existing.timer);
  }
  const state = existing?.state ?? makeInitialState(params.userId, intervalMs);
  state.status = "running";
  state.intervalMs = intervalMs;
  state.supervisionMode = params.supervisionMode ?? state.supervisionMode;
  state.startedAt = new Date().toISOString();
  const handle: RuntimeLoopHandle = {
    timer: null,
    state,
    lastExecutedTrackId: existing?.lastExecutedTrackId ?? null,
    lastExecutionAt: existing?.lastExecutionAt ?? 0,
  };
  const timer = setInterval(() => {
    void runAutonomousTick(handle, true).catch((error) => {
      appendTick(handle.state, {
        tickAt: new Date().toISOString(),
        decision: "blocked_by_safety",
        confidence: 0,
        riskLevel: "n/a",
        executed: false,
        message: error instanceof Error ? error.message : "Autonomous tick failed.",
      });
    });
  }, intervalMs);
  handle.timer = timer;
  LOOP_REGISTRY.set(params.userId, handle);
  return state;
}

export function stopAutonomousLoop(userId: string) {
  const handle = LOOP_REGISTRY.get(userId);
  if (!handle) {
    return makeInitialState(userId, 15000);
  }
  if (handle.timer) {
    clearInterval(handle.timer);
    handle.timer = null;
  }
  handle.state.status = "stopped";
  handle.state.pendingTransition = null;
  LOOP_REGISTRY.set(userId, handle);
  return handle.state;
}

export function getAutonomousLoopState(userId: string) {
  return LOOP_REGISTRY.get(userId)?.state ?? makeInitialState(userId, 15000);
}

export async function tickAutonomousLoop(params: {
  userId: string;
  executeIfSafe?: boolean;
  supervisionMode?: "manual_override" | "assisted_autonomous";
}) {
  const handle =
    LOOP_REGISTRY.get(params.userId) ??
    ({
      timer: null,
      state: makeInitialState(params.userId, 15000),
      lastExecutedTrackId: null,
      lastExecutionAt: 0,
    } satisfies RuntimeLoopHandle);
  if (params.supervisionMode) {
    handle.state.supervisionMode = params.supervisionMode;
  }
  const tick = await runAutonomousTick(handle, params.executeIfSafe ?? false);
  LOOP_REGISTRY.set(params.userId, handle);
  return {
    state: handle.state,
    tick,
  };
}

