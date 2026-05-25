import { NextResponse } from "next/server";
import {
  QueueRecommendationWithMeta,
  QueueRecommendation,
} from "@/lib/ai/queue-engine";
import { createQueueEngineProvider } from "@/lib/ai/providers";
import { getPreviousSnapshotsForPlan } from "@/lib/ai/providers/openrouter-provider";
import { createSpotifyEnhancedRecommendations } from "@/lib/spotify/ai-bridge";
import { EventPlanView } from "@/lib/events/types";
import { normalizeRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("event_plans")
    .select(
      "id,event_id,user_id,timeline,energy_progression,recommended_genres,starter_playlist,created_at,events!inner(event_name,event_type,event_date,start_time,end_time,crowd_size)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const plans: EventPlanView[] =
    data?.map((row) => {
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
    .select(
      "id,event_plan_id,created_at,queue_data,current_phase,average_bpm,average_energy,crowd_momentum",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (snapshotsError) {
    return NextResponse.json({ message: snapshotsError.message }, { status: 500 });
  }

  const snapshotsByPlan = new Map<
    string,
    {
      latestSnapshotId: string;
      latestGeneratedAt: string;
      latestQueueData: QueueRecommendation;
      count: number;
    }
  >();

  for (const snapshot of snapshotsData ?? []) {
    const existing = snapshotsByPlan.get(snapshot.event_plan_id);
    if (existing) {
      snapshotsByPlan.set(snapshot.event_plan_id, {
        ...existing,
        count: existing.count + 1,
      });
      continue;
    }
    snapshotsByPlan.set(snapshot.event_plan_id, {
      latestSnapshotId: snapshot.id,
      latestGeneratedAt: snapshot.created_at,
      latestQueueData: snapshot.queue_data as QueueRecommendation,
      count: 1,
    });
  }

  const provider = createQueueEngineProvider();
  const recommendations: QueueRecommendationWithMeta[] = [];

  for (const plan of plans) {
    const snapshotMeta = snapshotsByPlan.get(plan.id);
    const previousSnapshots = await getPreviousSnapshotsForPlan({
      supabase,
      eventPlanId: plan.id,
    });
    const generated = await provider.generateFromPlan(plan, {
      previousSnapshots,
    });
    const baseData = snapshotMeta?.latestQueueData ?? generated;

    recommendations.push({
      ...baseData,
      spotifyEnhancedRecommendations: [],
      latestSnapshotId: snapshotMeta?.latestSnapshotId ?? null,
      latestGeneratedAt: snapshotMeta?.latestGeneratedAt ?? null,
      queueVersionCount: snapshotMeta?.count ?? 0,
    });
  }

  for (const recommendation of recommendations) {
    const spotifyResult = await createSpotifyEnhancedRecommendations({
      userId: user.id,
      recommendation,
    });
    if (spotifyResult.ok) {
      recommendation.spotifyEnhancedRecommendations = spotifyResult.enhanced;
    } else {
      recommendation.spotifyEnhancedRecommendations = [];
    }
  }

  return NextResponse.json({ recommendations });
}
