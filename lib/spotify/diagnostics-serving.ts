import "server-only";

import { createQueueEngineProvider } from "@/lib/ai/providers";
import { evaluateRecommendationInvalidation, recommendationContextHash } from "@/lib/spotify/recommendation-invalidation";
import { RecommendationTelemetryItem, RecommendationTelemetryResponse } from "@/lib/spotify/telemetry-types";
import { normalizeRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CacheRow = {
  event_plan_id: string;
  queue_snapshot_id: string | null;
  recommendation_context_hash: string | null;
  event_phase: string | null;
  created_at: string;
  expires_at: string;
};

function freshnessFrom(expiresAt: string | null) {
  if (!expiresAt) return "expired" as const;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired" as const;
  if (ms <= 1000 * 60 * 4) return "stale" as const;
  return "fresh" as const;
}

export async function serveRecommendationDiagnostics(userId: string): Promise<RecommendationTelemetryResponse> {
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

  const { data: cacheRowsData, error: cacheError } = await supabase
    .from("ai_track_recommendations")
    .select("event_plan_id,queue_snapshot_id,recommendation_context_hash,event_phase,created_at,expires_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (cacheError) throw new Error(cacheError.message);

  const latestCacheByPlan = new Map<string, CacheRow>();
  for (const row of (cacheRowsData ?? []) as CacheRow[]) {
    if (!latestCacheByPlan.has(row.event_plan_id)) {
      latestCacheByPlan.set(row.event_plan_id, row);
    }
  }

  const latestSnapshotByPlan = new Map<string, { id: string; queueData: unknown }>();
  for (const snapshot of snapshotsData ?? []) {
    if (!latestSnapshotByPlan.has(snapshot.event_plan_id)) {
      latestSnapshotByPlan.set(snapshot.event_plan_id, {
        id: snapshot.id,
        queueData: snapshot.queue_data,
      });
    }
  }

  const provider = createQueueEngineProvider();
  const items: RecommendationTelemetryItem[] = [];
  for (const plan of plans) {
    const snapshot = latestSnapshotByPlan.get(plan.id);
    const generated = await provider.generateFromPlan(plan);
    const current = snapshot?.queueData
      ? ({
          ...(snapshot.queueData as Record<string, unknown>),
          bpmFlow: (snapshot.queueData as { bpmFlow?: Array<{ min: number; max: number }> }).bpmFlow ?? generated.bpmFlow,
          crowdMomentum: (snapshot.queueData as { crowdMomentum?: string }).crowdMomentum ?? generated.crowdMomentum,
          currentEnergy: (snapshot.queueData as { currentEnergy?: number }).currentEnergy ?? generated.currentEnergy,
          currentMoodPhase:
            (snapshot.queueData as { currentMoodPhase?: string }).currentMoodPhase ?? generated.currentMoodPhase,
        } as {
          bpmFlow: Array<{ min: number; max: number }>;
          crowdMomentum: string;
          currentEnergy: number;
          currentMoodPhase: string;
        })
      : {
          bpmFlow: generated.bpmFlow,
          crowdMomentum: generated.crowdMomentum,
          currentEnergy: generated.currentEnergy,
          currentMoodPhase: generated.currentMoodPhase,
        };

    const cache = latestCacheByPlan.get(plan.id) ?? null;
    const currentHashInfo = recommendationContextHash({
      eventPhase: current.currentMoodPhase,
      bpmLane: current.bpmFlow[0] ?? null,
      crowdMomentum: current.crowdMomentum,
      energy: current.currentEnergy,
      queueSnapshotId: snapshot?.id ?? null,
    });
    const previousContext = cache
      ? recommendationContextHash({
          eventPhase: cache.event_phase ?? null,
          bpmLane: current.bpmFlow[0] ?? null,
          crowdMomentum: current.crowdMomentum,
          energy: current.currentEnergy,
          queueSnapshotId: cache.queue_snapshot_id,
        }).normalized
      : null;
    const stalenessPercent = cache
      ? Math.max(
          0,
          Math.min(
            1,
            (Date.now() - new Date(cache.created_at).getTime()) /
              Math.max(new Date(cache.expires_at).getTime() - new Date(cache.created_at).getTime(), 1),
          ),
        )
      : 1;
    const invalidation = evaluateRecommendationInvalidation({
      forceRefresh: false,
      hasCache: Boolean(cache),
      cacheExpired: cache ? new Date(cache.expires_at).getTime() <= Date.now() : false,
      queueSnapshotChanged: (cache?.queue_snapshot_id ?? null) !== (snapshot?.id ?? null),
      previousContext,
      currentContext: currentHashInfo.normalized,
      stalenessPercent,
    });

    const freshness = freshnessFrom(cache?.expires_at ?? null);
    items.push({
      eventPlanId: plan.id,
      eventName: plan.eventName,
      eventType: plan.eventType,
      lifecycleState: freshness === "expired" ? "expired" : invalidation.invalidated ? "needs_refresh" : "active",
      invalidationStatus: invalidation.invalidated ? "invalidated" : "valid",
      triggerSource: invalidation.triggerSource,
      refreshReason: invalidation.thresholdExceededReason,
      freshness,
      cacheAgeSeconds: cache ? Math.max(0, Math.round((Date.now() - new Date(cache.created_at).getTime()) / 1000)) : 0,
      eventPhase: currentHashInfo.normalized.eventPhase,
      queueSnapshotId: snapshot?.id ?? null,
      recommendationContextHash: currentHashInfo.hash,
      drift: invalidation.diagnostics.drift,
      thresholds: invalidation.diagnostics.thresholds,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    items,
  };
}

