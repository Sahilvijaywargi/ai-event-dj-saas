import "server-only";

import { AIEnhancedTrackRecommendation, QueueRecommendationWithMeta } from "@/lib/ai/queue-engine";
import { createQueueEngineProvider } from "@/lib/ai/providers";
import { createSpotifyEnhancedRecommendations } from "@/lib/spotify/ai-bridge";
import {
  evaluateRecommendationInvalidation,
  recommendationContextHash,
} from "@/lib/spotify/recommendation-invalidation";
import { normalizeRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CACHE_TTL_MS = 1000 * 60 * 20;

type ServingOptions = {
  userId: string;
  eventPlanId?: string;
  eventPhase?: string | null;
  forceRefresh?: boolean;
};

type RecommendationCacheRow = {
  id: string;
  user_id: string;
  event_plan_id: string;
  queue_snapshot_id: string | null;
  spotify_track_id: string;
  recommendation_payload: AIEnhancedTrackRecommendation;
  ai_confidence: number;
  bpm_score: number;
  energy_score: number;
  transition_score: number;
  momentum_score: number;
  recommendation_context_hash: string | null;
  event_phase: string | null;
  created_at: string;
  expires_at: string;
};

type RecommendationServeItem = {
  eventPlanId: string;
  eventName: string;
  eventType: string;
  queueSnapshotId: string | null;
  source: "cache" | "live";
  createdAt: string | null;
  expiresAt: string | null;
  freshness: "fresh" | "stale" | "expired";
  eventPhase: string | null;
  recommendationContextHash: string | null;
  sourceContext: string | null;
  invalidationStatus: "valid" | "invalidated";
  refreshReason: string | null;
  triggerSource:
    | "force_refresh"
    | "phase_change"
    | "bpm_lane_drift"
    | "momentum_drift"
    | "energy_drift"
    | "queue_snapshot_change"
    | "cache_expired"
    | "cache_missing"
    | "none";
  thresholdDiagnostics: {
    drift: {
      bpmLaneDriftPercent: number;
      momentumDrift: number;
      energyDriftPercent: number;
      stalenessPercent: number;
      phaseDistance: number;
    };
    thresholds: {
      bpmLaneDriftThresholdPercent: number;
      crowdMomentumDriftThreshold: number;
      energyDriftThresholdPercent: number;
      recommendationStalenessThresholdPercent: number;
      phaseTransitionSensitivity: number;
    };
    exceeded: {
      bpmLane: boolean;
      momentum: boolean;
      energy: boolean;
      staleness: boolean;
      phase: boolean;
      snapshot: boolean;
    };
  };
  lifecycleState: "active" | "needs_refresh" | "expired";
  tracks: AIEnhancedTrackRecommendation[];
};

type CacheInspection =
  | {
      status: "valid";
      rows: RecommendationCacheRow[];
      reason: null;
    }
  | {
      status: "invalid";
      rows: RecommendationCacheRow[];
      reason:
        | "cache_miss"
        | "cache_expired"
        | "queue_snapshot_changed"
        | "recommendation_context_changed";
    };

function isExpired(expiresAt: string) {
  return new Date(expiresAt).getTime() <= Date.now();
}

function freshnessFrom(expiresAt: string | null) {
  if (!expiresAt) return "expired" as const;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired" as const;
  if (ms <= 1000 * 60 * 4) return "stale" as const;
  return "fresh" as const;
}

function inferLatestSnapshotId(recommendation: QueueRecommendationWithMeta) {
  return recommendation.latestSnapshotId ?? null;
}

async function getQueueRecommendationsForUser(userId: string) {
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

  const { data: snapshotsData, error: snapshotsError } = await supabase
    .from("queue_snapshots")
    .select("id,event_plan_id,created_at,queue_data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (snapshotsError) throw new Error(snapshotsError.message);

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
      spotifyEnhancedRecommendations: [],
    });
  }

  return recommendations;
}

async function inspectCacheByPlan(params: {
  userId: string;
  eventPlanId: string;
  queueSnapshotId: string | null;
  expectedContextHash: string;
}): Promise<CacheInspection> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_track_recommendations")
    .select("*")
    .eq("user_id", params.userId)
    .eq("event_plan_id", params.eventPlanId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as RecommendationCacheRow[];
  if (!rows.length) return { status: "invalid", rows: [], reason: "cache_miss" };
  const first = rows[0];
  if (!first) return { status: "invalid", rows: [], reason: "cache_miss" };
  if (isExpired(first.expires_at)) return { status: "invalid", rows, reason: "cache_expired" };
  if ((first.queue_snapshot_id ?? null) !== (params.queueSnapshotId ?? null)) {
    return { status: "invalid", rows, reason: "queue_snapshot_changed" };
  }
  if ((first.recommendation_context_hash ?? "") !== params.expectedContextHash) {
    return { status: "invalid", rows, reason: "recommendation_context_changed" };
  }

  return { status: "valid", rows, reason: null };
}

async function writeRecommendations(params: {
  userId: string;
  eventPlanId: string;
  queueSnapshotId: string | null;
  eventPhase: string | null;
  recommendationContextHash: string;
  tracks: AIEnhancedTrackRecommendation[];
}) {
  const supabase = await createSupabaseServerClient();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();

  await supabase
    .from("ai_track_recommendations")
    .delete()
    .eq("user_id", params.userId)
    .eq("event_plan_id", params.eventPlanId);

  if (!params.tracks.length) {
    return { createdAt, expiresAt };
  }

  const rows = params.tracks.map((track) => ({
    user_id: params.userId,
    event_plan_id: params.eventPlanId,
    queue_snapshot_id: params.queueSnapshotId,
    spotify_track_id: track.id,
    recommendation_payload: track,
    ai_confidence: track.aiConfidence,
    bpm_score: track.scoreBreakdown.bpmCompatibility,
    energy_score: track.scoreBreakdown.energyCompatibility,
    transition_score: track.scoreBreakdown.transitionSmoothness,
    momentum_score: track.scoreBreakdown.crowdMomentumFit,
    recommendation_context_hash: params.recommendationContextHash,
    event_phase: params.eventPhase,
    created_at: createdAt,
    expires_at: expiresAt,
  }));

  const { error } = await supabase.from("ai_track_recommendations").insert(rows);
  if (error) throw new Error(error.message);
  return { createdAt, expiresAt };
}

export async function serveAiSpotifyRecommendations(options: ServingOptions) {
  const recommendations = await getQueueRecommendationsForUser(options.userId);
  const filtered = options.eventPlanId
    ? recommendations.filter((item) => item.planId === options.eventPlanId)
    : recommendations;

  const served: RecommendationServeItem[] = [];

  for (const recommendation of filtered) {
    const queueSnapshotId = inferLatestSnapshotId(recommendation);
    const primaryBpmLane = recommendation.bpmFlow[0] ?? null;
    const { hash: contextHash, normalized } = recommendationContextHash({
      eventPhase: options.eventPhase ?? recommendation.currentMoodPhase,
      bpmLane: primaryBpmLane,
      crowdMomentum: recommendation.crowdMomentum,
      energy: recommendation.currentEnergy,
      queueSnapshotId,
    });
    let cacheInspection: CacheInspection | null = null;
    if (!options.forceRefresh) {
      cacheInspection = await inspectCacheByPlan({
        userId: options.userId,
        eventPlanId: recommendation.planId,
        queueSnapshotId,
        expectedContextHash: contextHash,
      });
    }
    const previous = cacheInspection?.rows?.[0];
    const previousContext = previous?.recommendation_context_hash
      ? recommendationContextHash({
          eventPhase: previous.event_phase ?? null,
          bpmLane: primaryBpmLane,
          crowdMomentum: recommendation.crowdMomentum,
          energy: recommendation.currentEnergy,
          queueSnapshotId: previous.queue_snapshot_id ?? null,
        }).normalized
      : null;
    const currentContext = recommendationContextHash({
      eventPhase: options.eventPhase ?? recommendation.currentMoodPhase,
      bpmLane: primaryBpmLane,
      crowdMomentum: recommendation.crowdMomentum,
      energy: recommendation.currentEnergy,
      queueSnapshotId,
    }).normalized;
    const stalenessPercent = previous
      ? Math.max(
          0,
          Math.min(
            1,
            (Date.now() - new Date(previous.created_at).getTime()) /
              Math.max(new Date(previous.expires_at).getTime() - new Date(previous.created_at).getTime(), 1),
          ),
        )
      : 1;
    const invalidationEval = evaluateRecommendationInvalidation({
      forceRefresh: Boolean(options.forceRefresh),
      hasCache: Boolean(previous),
      cacheExpired: cacheInspection?.reason === "cache_expired",
      queueSnapshotChanged: cacheInspection?.reason === "queue_snapshot_changed",
      previousContext,
      currentContext,
      stalenessPercent,
    });

    if (cacheInspection && cacheInspection.status === "valid" && !invalidationEval.invalidated) {
      const first = cacheInspection.rows[0];
      if (!first) continue;
      served.push({
        eventPlanId: recommendation.planId,
        eventName: recommendation.eventName,
        eventType: recommendation.eventType,
        queueSnapshotId: first.queue_snapshot_id ?? null,
        source: "cache",
        createdAt: first.created_at,
        expiresAt: first.expires_at,
        freshness: freshnessFrom(first.expires_at),
        eventPhase: first.event_phase ?? null,
        recommendationContextHash: first.recommendation_context_hash ?? null,
        sourceContext: normalized.eventPhase,
        invalidationStatus: "valid",
        refreshReason: null,
        triggerSource: invalidationEval.triggerSource,
        thresholdDiagnostics: invalidationEval.diagnostics,
        lifecycleState: freshnessFrom(first.expires_at) === "expired" ? "expired" : "active",
        tracks: cacheInspection.rows.map((row) => row.recommendation_payload),
      });
      continue;
    }

    const live = await createSpotifyEnhancedRecommendations({
      userId: options.userId,
      recommendation,
    });
    const tracks = live.ok ? live.enhanced : [];
    const persisted = await writeRecommendations({
      userId: options.userId,
      eventPlanId: recommendation.planId,
      queueSnapshotId,
      eventPhase: normalized.eventPhase,
      recommendationContextHash: contextHash,
      tracks,
    });
    served.push({
      eventPlanId: recommendation.planId,
      eventName: recommendation.eventName,
      eventType: recommendation.eventType,
      queueSnapshotId,
      source: "live",
      createdAt: persisted.createdAt,
      expiresAt: persisted.expiresAt,
      freshness: freshnessFrom(persisted.expiresAt),
      eventPhase: normalized.eventPhase,
      recommendationContextHash: contextHash,
      sourceContext: normalized.eventPhase,
      invalidationStatus: "invalidated",
      refreshReason: invalidationEval.thresholdExceededReason ?? "cache_miss",
      triggerSource: invalidationEval.triggerSource,
      thresholdDiagnostics: invalidationEval.diagnostics,
      lifecycleState: "needs_refresh",
      tracks,
    });
  }

  return {
    served,
    generatedAt: new Date().toISOString(),
    phase: options.eventPhase ?? null,
  };
}

