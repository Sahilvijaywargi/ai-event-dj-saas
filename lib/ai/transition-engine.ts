import "server-only";

import { QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { getCrowdFeedbackSummary } from "@/lib/ai/crowd-feedback";
import { getAudioEnvironmentState } from "@/lib/audio/audio-energy";
import { getLiveSessionState, updateDjSession } from "@/lib/dj-session/engine";
import { RecommendationTelemetryItem } from "@/lib/spotify/telemetry-types";
import { getPlaybackOrchestrationState, queueAiRecommendedTrack } from "@/lib/spotify/device-orchestrator";
import { executeGuardedPlaybackCommand } from "@/lib/spotify/playback-guarded";
import { startSpotifyPlayback } from "@/lib/spotify/playback-service";
import { serveRecommendationDiagnostics } from "@/lib/spotify/diagnostics-serving";
import {
  computeLearnedOrchestrationBias,
  getRuntimeMemoryPatterns,
  storeRuntimeMemoryPattern,
} from "@/lib/ai/runtime-memory";

export type TransitionRiskLevel = "low" | "medium" | "high";
export type TransitionConfidence = {
  score: number;
  reasons: string[];
};

export type TransitionDecision = {
  shouldTransition: boolean;
  holdEnergy: boolean;
  rampEnergy: boolean;
  cooldownEnergy: boolean;
  reason: string;
};

export type TransitionExecutionPlan = {
  nextAction: "queue_next_track" | "advance_playback" | "hold_state" | "reject_unsafe_transition";
  targetTrackId: string | null;
  targetTrackLabel: string | null;
  targetPhase: string;
  targetEnergy: number;
  targetBpm: number;
};

export type TransitionEvaluationResult = {
  autonomousReadiness: "ready" | "needs_review" | "blocked";
  decision: TransitionDecision;
  confidence: TransitionConfidence;
  riskLevel: TransitionRiskLevel;
  executionPlan: TransitionExecutionPlan;
  telemetry: RecommendationTelemetryItem | null;
  currentState: {
    sessionId: string | null;
    phase: string | null;
    energy: number | null;
    bpm: number | null;
    playbackActive: boolean;
  };
  crowdFeedbackInfluence: {
    crowdSentiment: number;
    transitionTrustScore: number;
    energyAdaptationTrend: number;
    operatorInterventionRate: number;
  };
  audioEnergyInfluence: {
    roomEnergy: number;
    crowdIntensity: number;
    silenceDetected: boolean;
    spikeDetected: boolean;
    driftScore: number;
    engagementScore: number;
  };
  learnedMemoryInfluence: {
    transitionBias: number;
    energyBias: number;
    operatorBias: number;
    crowdBias: number;
    confidenceBias: number;
    rationale: string[];
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function computeRiskLevel(params: { confidence: number; telemetry: RecommendationTelemetryItem | null }) {
  if (!params.telemetry) return "high" as const;
  if (params.telemetry.invalidationStatus === "invalidated") return "high" as const;
  if (params.confidence < 55) return "high" as const;
  if (params.confidence < 75) return "medium" as const;
  return "low" as const;
}

function recentTransitionCooldown(activities: Array<{ activity_type: string; created_at: string }>) {
  const lastTransition = activities.find((activity) => activity.activity_type === "QUEUE_TRANSITION");
  if (!lastTransition) return false;
  return Date.now() - new Date(lastTransition.created_at).getTime() < 25_000;
}

export async function evaluateTransitionEngine(params: {
  userId: string;
  queueRecommendations: QueueRecommendationWithMeta[];
  assistedAutonomousEnabled: boolean;
}) {
  const [liveState, playback, diagnostics] = await Promise.all([
    getLiveSessionState(params.userId),
    getPlaybackOrchestrationState(params.userId),
    serveRecommendationDiagnostics(params.userId),
  ]);
  const feedbackSummary = await getCrowdFeedbackSummary({
    userId: params.userId,
    sessionId: liveState.session?.id,
    limit: 60,
  });
  const audioState = await getAudioEnvironmentState({
    userId: params.userId,
    sessionId: liveState.session?.id ?? undefined,
    limit: 40,
  });
  const session = liveState.session;
  const telemetry = diagnostics.items[0] ?? null;
  const memoryPatterns = await getRuntimeMemoryPatterns({
    userId: params.userId,
    limit: 30,
  });
  const memoryBias = computeLearnedOrchestrationBias(memoryPatterns);
  const topRecommendation = params.queueRecommendations
    .flatMap((item) => item.spotifyEnhancedRecommendations ?? [])
    .sort((a, b) => b.aiConfidence - a.aiConfidence)[0];
  const cooldownBlocked = recentTransitionCooldown(liveState.activities);
  const playbackTrackId = playback.playbackState?.track?.id ?? null;
  const duplicateTransition = Boolean(topRecommendation?.id && topRecommendation.id === playbackTrackId);
  const unsafeEnergySpike =
    session && topRecommendation ? topRecommendation.energy - session.current_energy > 2.5 : false;

  const reasons: string[] = [];
  if (!params.assistedAutonomousEnabled) reasons.push("Assisted-autonomous mode disabled.");
  if (cooldownBlocked) reasons.push("Transition cooldown active.");
  if (duplicateTransition) reasons.push("Duplicate transition prevented.");
  if (unsafeEnergySpike) reasons.push("Energy spike protection triggered.");
  if (telemetry?.invalidationStatus === "invalidated") reasons.push("Telemetry indicates invalidated state.");
  if (!topRecommendation) reasons.push("No AI-enhanced track available.");
  if (feedbackSummary.transitionTrustScore < 40)
    reasons.push("Low transition trust score from crowd feedback.");
  if (feedbackSummary.operatorInterventionRate > 65)
    reasons.push("High operator intervention frequency suggests caution.");
  if (audioState.drift.silenceDetected) reasons.push("Audio sensing detected silence/drop period.");
  if (audioState.drift.spikeDetected) reasons.push("Audio sensing detected energy spike.");

  let score = 86;
  if (!params.assistedAutonomousEnabled) score -= 35;
  if (cooldownBlocked) score -= 22;
  if (duplicateTransition) score -= 16;
  if (unsafeEnergySpike) score -= 30;
  if (telemetry?.invalidationStatus === "invalidated") score -= 24;
  if (!topRecommendation) score -= 30;
  score += (feedbackSummary.transitionTrustScore - 50) * 0.12;
  score += feedbackSummary.energyAdaptationTrend * 2.4;
  score -= Math.max(0, feedbackSummary.operatorInterventionRate - 45) * 0.45;
  score += (audioState.engagement.engagementScore - 50) * 0.16;
  score += audioState.drift.silenceDetected ? -8 : 0;
  score += audioState.drift.spikeDetected ? -4 : 0;
  score += memoryBias.confidenceBias * 0.45;
  score += memoryBias.crowdBias * 0.25;
  score -= memoryBias.operatorBias * 0.2;
  const confidence = clamp(score, 0, 100);
  const riskLevel = computeRiskLevel({ confidence, telemetry });

  const shouldTransition =
    params.assistedAutonomousEnabled &&
    !cooldownBlocked &&
    !duplicateTransition &&
    !unsafeEnergySpike &&
    Boolean(topRecommendation);
  const holdEnergy = !shouldTransition || (session ? session.current_energy >= 8.6 : false);
  const rampEnergy = shouldTransition && Boolean(session && session.current_energy <= 6.8);
  const cooldownEnergy = shouldTransition && Boolean(session && session.current_energy >= 8.8);
  const nextAction: TransitionExecutionPlan["nextAction"] = !params.assistedAutonomousEnabled
    ? "hold_state"
    : shouldTransition
      ? "queue_next_track"
      : unsafeEnergySpike
        ? "reject_unsafe_transition"
        : "hold_state";

  const executionPlan: TransitionExecutionPlan = {
    nextAction,
    targetTrackId: topRecommendation?.id ?? null,
    targetTrackLabel: topRecommendation
      ? `${topRecommendation.name} - ${topRecommendation.artistName}`
      : null,
    targetPhase: session?.current_phase ?? "social",
    targetEnergy: clamp(
      (topRecommendation?.energy ?? session?.current_energy ?? 5) + memoryBias.energyBias * 0.12,
      0,
      10,
    ),
    targetBpm: topRecommendation?.bpm ?? session?.current_bpm ?? 110,
  };

  const decision: TransitionDecision = {
    shouldTransition,
    holdEnergy,
    rampEnergy,
    cooldownEnergy,
    reason: reasons[0] ?? "Transition lane is healthy.",
  };

  const result: TransitionEvaluationResult = {
    autonomousReadiness: shouldTransition ? "ready" : params.assistedAutonomousEnabled ? "needs_review" : "blocked",
    decision,
    confidence: { score: confidence, reasons: reasons.length ? reasons : ["Healthy transition profile."] },
    riskLevel,
    executionPlan,
    telemetry,
    currentState: {
      sessionId: session?.id ?? null,
      phase: session?.current_phase ?? null,
      energy: session?.current_energy ?? null,
      bpm: session?.current_bpm ?? null,
      playbackActive: Boolean(playback.playbackState?.isPlaying),
    },
    crowdFeedbackInfluence: {
      crowdSentiment: feedbackSummary.crowdSentiment,
      transitionTrustScore: feedbackSummary.transitionTrustScore,
      energyAdaptationTrend: feedbackSummary.energyAdaptationTrend,
      operatorInterventionRate: feedbackSummary.operatorInterventionRate,
    },
    audioEnergyInfluence: {
      roomEnergy: audioState.latest?.energy_level ?? audioState.drift.shortTermAverage,
      crowdIntensity: audioState.latest?.crowd_intensity ?? audioState.engagement.crowdNoiseIntensity,
      silenceDetected: audioState.drift.silenceDetected,
      spikeDetected: audioState.drift.spikeDetected,
      driftScore: audioState.drift.driftScore,
      engagementScore: audioState.engagement.engagementScore,
    },
    learnedMemoryInfluence: memoryBias,
  };
  return result;
}

export async function executeTransitionEnginePlan(params: {
  userId: string;
  evaluation: TransitionEvaluationResult;
  mode: "review_only" | "execute";
}) {
  const { evaluation } = params;
  if (params.mode === "review_only" || evaluation.executionPlan.nextAction === "hold_state") {
    return {
      ok: true,
      message: "Review-only mode or hold-state selected; no playback mutation executed.",
      execution: null,
    };
  }
  if (evaluation.executionPlan.nextAction === "reject_unsafe_transition") {
    return {
      ok: false,
      message: "Unsafe transition rejected by engine guardrails.",
      execution: null,
    };
  }
  if (!evaluation.executionPlan.targetTrackId) {
    return {
      ok: false,
      message: "No target track available for transition execution.",
      execution: null,
    };
  }

  const queueResult = await executeGuardedPlaybackCommand({
    userId: params.userId,
    sessionId: evaluation.currentState.sessionId,
    commandType: "queue",
    executionSource: "live_session_sync",
    trackUri: `spotify:track:${evaluation.executionPlan.targetTrackId}`,
    commandPayload: {
      source: "transition_engine",
      confidence: evaluation.confidence.score,
      riskLevel: evaluation.riskLevel,
    },
    execute: () =>
      queueAiRecommendedTrack({
        userId: params.userId,
        spotifyTrackId: evaluation.executionPlan.targetTrackId as string,
      }),
  });
  if (!queueResult.ok) {
    return {
      ok: false,
      message: queueResult.message ?? "Failed to queue transition track.",
      execution: { queueResult },
    };
  }

  const startPlaybackResult = await executeGuardedPlaybackCommand({
    userId: params.userId,
    sessionId: evaluation.currentState.sessionId,
    commandType: "play",
    executionSource: "live_session_sync",
    commandPayload: { source: "transition_engine" },
    execute: () => startSpotifyPlayback({ userId: params.userId }),
  });

  if (evaluation.currentState.sessionId) {
    await updateDjSession(params.userId, {
      sessionId: evaluation.currentState.sessionId,
      action: "queue_transition",
      track: evaluation.executionPlan.targetTrackLabel ?? undefined,
      bpm: evaluation.executionPlan.targetBpm,
      energy: evaluation.executionPlan.targetEnergy,
      aiDecision: `Transition Engine executed ${evaluation.executionPlan.nextAction} (${evaluation.confidence.score}% confidence, ${evaluation.riskLevel} risk).`,
      fallbackReason: startPlaybackResult.ok
        ? undefined
        : startPlaybackResult.message ?? undefined,
    });
  }

  void storeRuntimeMemoryPattern({
    userId: params.userId,
    patternType: "successful_transition",
    patternContext: evaluation.executionPlan.targetPhase,
    successScore: queueResult.ok && startPlaybackResult.ok ? 78 : 28,
    confidenceScore: evaluation.confidence.score,
    learnedSignals: [
      {
        source: "transition_engine",
        signal: "transition_confidence",
        value: evaluation.confidence.score / 100,
        weight: 0.9,
        polarity: queueResult.ok ? "positive" : "negative",
      },
      {
        source: "crowd_feedback",
        signal: "crowd_trust",
        value: evaluation.crowdFeedbackInfluence.transitionTrustScore / 100,
        weight: 0.8,
        polarity: evaluation.crowdFeedbackInfluence.transitionTrustScore >= 50 ? "positive" : "negative",
      },
      {
        source: "audio_energy",
        signal: "audio_energy_drift",
        value: evaluation.audioEnergyInfluence.driftScore / 10,
        weight: 0.55,
        polarity: evaluation.audioEnergyInfluence.silenceDetected ? "negative" : "neutral",
      },
      {
        source: "operator",
        signal: "operator_intervention",
        value: evaluation.crowdFeedbackInfluence.operatorInterventionRate / 100,
        weight: 0.6,
        polarity: evaluation.crowdFeedbackInfluence.operatorInterventionRate > 60 ? "negative" : "neutral",
      },
    ],
    reinforce: queueResult.ok && startPlaybackResult.ok,
  }).catch(() => {});

  return {
    ok: true,
    message: "Transition plan executed in supervised mode.",
    execution: {
      queueResult,
      startPlaybackResult,
    },
  };
}

