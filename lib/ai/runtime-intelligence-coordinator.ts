import "server-only";

import { QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { createQueueEngineProvider } from "@/lib/ai/providers";
import { getAudioEnvironmentState } from "@/lib/audio/audio-energy";
import { getCrowdFeedbackSummary } from "@/lib/ai/crowd-feedback";
import { getAutonomousLoopState } from "@/lib/ai/autonomous-loop";
import { evaluateTransitionEngine } from "@/lib/ai/transition-engine";
import { getPlaybackOrchestrationState } from "@/lib/spotify/device-orchestrator";
import { serveRecommendationDiagnostics } from "@/lib/spotify/diagnostics-serving";
import { serveAiSpotifyRecommendations } from "@/lib/spotify/recommendation-serving";
import { normalizeRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  computeLearnedOrchestrationBias,
  getRuntimeMemoryPatterns,
  RuntimeBiasAdjustment,
  storeRuntimeMemoryPattern,
} from "@/lib/ai/runtime-memory";
import {
  getRuntimeReliabilityState,
  markStaleState,
  RuntimeReliabilityState,
  touchRuntimeHeartbeat,
} from "@/lib/runtime/reliability";

export type RuntimeSignalSummary = {
  autonomousLoopStatus: "running" | "stopped";
  transitionRiskLevel: "low" | "medium" | "high" | "n/a";
  crowdSentiment: number;
  audioEngagement: number;
  playbackSynced: boolean;
  recommendationFreshness: "fresh" | "stale" | "expired" | "unknown";
  safetyBlocked: boolean;
};

export type RuntimeStabilityScore = {
  value: number;
  reasons: string[];
};

export type RuntimeConfidenceScore = {
  unifiedConfidence: number;
  components: {
    transitionConfidence: number;
    crowdTrust: number;
    audioEngagement: number;
    recommendationHealth: number;
    playbackConsistency: number;
  };
};

export type RuntimeCoordinationDecision = {
  orchestrationPriority:
    | "stabilize_signals"
    | "refresh_recommendations"
    | "maintain_current_state"
    | "prepare_transition";
  activeRiskFactors: string[];
  signalConflicts: string[];
  operatorInterventions: string[];
};

export type RuntimeIntelligenceState = {
  timestamp: string;
  unifiedConfidence: RuntimeConfidenceScore;
  stability: RuntimeStabilityScore;
  autonomyReadiness: number;
  signalSummary: RuntimeSignalSummary;
  decision: RuntimeCoordinationDecision;
  learnedMemoryInfluence: RuntimeBiasAdjustment;
  reliability: RuntimeReliabilityState;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export async function loadQueueRecommendationsForUser(
  userId: string,
): Promise<QueueRecommendationWithMeta[]> {
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

export async function evaluateRuntimeIntelligence(params: {
  userId: string;
  assistedAutonomousEnabled?: boolean;
}) {
  touchRuntimeHeartbeat(params.userId, { source: "runtime_coordinator_start" });
  const queueRecommendations = await loadQueueRecommendationsForUser(params.userId);
  const [
    autonomousState,
    transitionEvaluation,
    crowdSummary,
    audioState,
    playbackState,
    recommendationDiagnostics,
    spotifyServingState,
    runtimeMemoryPatterns,
  ] = await Promise.all([
    Promise.resolve(getAutonomousLoopState(params.userId)),
    evaluateTransitionEngine({
      userId: params.userId,
      queueRecommendations,
      assistedAutonomousEnabled: params.assistedAutonomousEnabled ?? false,
    }),
    getCrowdFeedbackSummary({ userId: params.userId, limit: 80 }),
    getAudioEnvironmentState({ userId: params.userId, limit: 40 }),
    getPlaybackOrchestrationState(params.userId),
    serveRecommendationDiagnostics(params.userId),
    serveAiSpotifyRecommendations({
      userId: params.userId,
      forceRefresh: false,
    }),
    getRuntimeMemoryPatterns({ userId: params.userId, limit: 40 }),
  ]);
  const memoryBias = computeLearnedOrchestrationBias(runtimeMemoryPatterns);

  const recommendationFreshness =
    recommendationDiagnostics.items[0]?.freshness ?? ("unknown" as const);
  const recommendationHealth =
    recommendationFreshness === "fresh"
      ? 90
      : recommendationFreshness === "stale"
        ? 65
        : recommendationFreshness === "expired"
          ? 30
          : 45;
  const playbackConsistency = playbackState.activeDevice && playbackState.playbackState ? 88 : 35;
  const transitionConfidence = transitionEvaluation.confidence.score;
  const crowdTrust = crowdSummary.transitionTrustScore;
  const audioEngagement = audioState.engagement.engagementScore;

  const unifiedConfidenceValue = clamp(
    Number(
      (
        transitionConfidence * 0.3 +
        crowdTrust * 0.22 +
        audioEngagement * 0.2 +
        recommendationHealth * 0.14 +
        playbackConsistency * 0.14 +
        memoryBias.confidenceBias * 0.1
      ).toFixed(2),
    ),
    0,
    100,
  );
  const unifiedConfidence: RuntimeConfidenceScore = {
    unifiedConfidence: unifiedConfidenceValue,
    components: {
      transitionConfidence,
      crowdTrust,
      audioEngagement,
      recommendationHealth,
      playbackConsistency,
    },
  };

  const activeRiskFactors: string[] = [];
  if (transitionEvaluation.riskLevel === "high") activeRiskFactors.push("High transition risk");
  if (audioState.drift.silenceDetected) activeRiskFactors.push("Audio silence/drop detected");
  if (audioState.drift.spikeDetected) activeRiskFactors.push("Audio spike instability");
  if (crowdSummary.operatorInterventionRate > 65) activeRiskFactors.push("Frequent manual interventions");
  if (recommendationFreshness !== "fresh") activeRiskFactors.push("Recommendation freshness degraded");
  if (!playbackState.activeDevice) activeRiskFactors.push("Playback device desync");
  if (autonomousState.safetyStatus?.safeToExecute === false) activeRiskFactors.push("Autonomous safety blocked");

  const signalConflicts: string[] = [];
  if (transitionEvaluation.decision.rampEnergy && audioState.drift.spikeDetected) {
    signalConflicts.push("Transition wants ramp while audio detects spike");
  }
  if (transitionEvaluation.decision.cooldownEnergy && crowdSummary.energyAdaptationTrend > 0.6) {
    signalConflicts.push("Cooldown recommendation conflicts with rising crowd energy trend");
  }
  if (transitionEvaluation.decision.shouldTransition && recommendationFreshness === "expired") {
    signalConflicts.push("Transition suggested with stale recommendation intelligence");
  }

  const stabilityReasons: string[] = [];
  let stability = 84;
  stability -= activeRiskFactors.length * 8;
  stability -= signalConflicts.length * 7;
  if (autonomousState.status === "running" && autonomousState.safetyStatus?.safeToExecute) stability += 4;
  if (spotifyServingState.served.some((item) => item.source === "live")) stability += 2;
  stability += memoryBias.transitionBias * 0.35;
  stability = clamp(stability, 0, 100);
  if (activeRiskFactors.length === 0) stabilityReasons.push("No major risk factors detected.");
  else stabilityReasons.push(...activeRiskFactors);

  const autonomyReadiness = clamp(
    Number(
      (
        unifiedConfidenceValue * 0.55 +
        stability * 0.35 +
        (autonomousState.safetyStatus?.safeToExecute ? 10 : 0) +
        memoryBias.transitionBias * 0.2
      ).toFixed(2),
    ),
    0,
    100,
  );

  const orchestrationPriority: RuntimeCoordinationDecision["orchestrationPriority"] =
    signalConflicts.length > 0
      ? "stabilize_signals"
      : recommendationFreshness !== "fresh"
        ? "refresh_recommendations"
        : transitionEvaluation.decision.shouldTransition && autonomyReadiness >= 70
          ? "prepare_transition"
          : "maintain_current_state";

  const operatorInterventions: string[] = [];
  if (orchestrationPriority === "stabilize_signals")
    operatorInterventions.push("Review conflicting signals before next autonomous action.");
  if (orchestrationPriority === "refresh_recommendations")
    operatorInterventions.push("Refresh recommendation telemetry and queue intelligence.");
  if (!playbackState.activeDevice)
    operatorInterventions.push("Sync Spotify playback device before executing transitions.");
  if (crowdSummary.operatorInterventionRate > 65)
    operatorInterventions.push("Keep manual override active due to high intervention rate.");

  const signalSummary: RuntimeSignalSummary = {
    autonomousLoopStatus: autonomousState.status,
    transitionRiskLevel: transitionEvaluation.riskLevel,
    crowdSentiment: crowdSummary.crowdSentiment,
    audioEngagement: audioEngagement,
    playbackSynced: Boolean(playbackState.activeDevice && playbackState.playbackState),
    recommendationFreshness,
    safetyBlocked: autonomousState.safetyStatus?.safeToExecute === false,
  };

  const decision: RuntimeCoordinationDecision = {
    orchestrationPriority,
    activeRiskFactors,
    signalConflicts,
    operatorInterventions,
  };

  if (recommendationFreshness !== "fresh") {
    markStaleState(params.userId, "Runtime coordinator detected recommendation freshness degradation.", {
      recommendationFreshness,
    });
  }
  const reliability = getRuntimeReliabilityState({
    userId: params.userId,
    playbackSynced: Boolean(playbackState.activeDevice && playbackState.playbackState),
    staleSignal: recommendationFreshness !== "fresh",
  });

  void storeRuntimeMemoryPattern({
    userId: params.userId,
    patternType: "engagement_pattern",
    patternContext: signalSummary.recommendationFreshness,
    successScore: unifiedConfidenceValue,
    confidenceScore: stability,
    learnedSignals: [
      {
        source: "runtime_coordinator",
        signal: "orchestration_stability",
        value: stability / 100,
        weight: 0.9,
        polarity: stability >= 70 ? "positive" : "negative",
      },
      {
        source: "runtime_coordinator",
        signal: "autonomy_readiness",
        value: autonomyReadiness / 100,
        weight: 0.8,
        polarity: autonomyReadiness >= 65 ? "positive" : "neutral",
      },
      {
        source: "crowd_feedback",
        signal: "crowd_sentiment",
        value: crowdSummary.crowdSentiment / 100,
        weight: 0.7,
        polarity: crowdSummary.crowdSentiment >= 55 ? "positive" : "negative",
      },
    ],
    reinforce: unifiedConfidenceValue >= 70 && stability >= 68,
  }).catch(() => {});

  return {
    timestamp: new Date().toISOString(),
    unifiedConfidence,
    stability: {
      value: Number(stability.toFixed(2)),
      reasons: stabilityReasons,
    },
    autonomyReadiness,
    signalSummary,
    decision,
    learnedMemoryInfluence: memoryBias,
    reliability,
  } satisfies RuntimeIntelligenceState;
}

