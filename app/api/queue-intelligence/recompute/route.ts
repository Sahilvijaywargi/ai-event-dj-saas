import { NextResponse } from "next/server";
import { createQueueEngineProvider } from "@/lib/ai/providers";
import { getPreviousSnapshotsForPlan } from "@/lib/ai/providers/openrouter-provider";
import { createQueueSnapshotForPlan } from "@/lib/ai/queue-snapshots";
import { createSpotifyEnhancedRecommendations } from "@/lib/spotify/ai-bridge";
import { EventPlanView } from "@/lib/events/types";
import { normalizeRelation } from "@/lib/supabase/relations";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RecomputeRequestBody = {
  eventPlanId?: string;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: RecomputeRequestBody;
  try {
    body = (await request.json()) as RecomputeRequestBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.eventPlanId) {
    return NextResponse.json({ message: "eventPlanId is required." }, { status: 400 });
  }

  const { data: planRow, error: planError } = await supabase
    .from("event_plans")
    .select(
      "id,event_id,user_id,timeline,energy_progression,recommended_genres,starter_playlist,created_at,events!inner(event_name,event_type,event_date,start_time,end_time,crowd_size)",
    )
    .eq("id", body.eventPlanId)
    .eq("user_id", user.id)
    .single();

  if (planError || !planRow) {
    return NextResponse.json({ message: "Event plan not found." }, { status: 404 });
  }

  const relatedEvent = normalizeRelation(planRow.events);

  const plan: EventPlanView = {
    id: planRow.id,
    eventId: planRow.event_id,
    eventName: relatedEvent?.event_name ?? "",
    eventType: relatedEvent?.event_type ?? "",
    eventDate: relatedEvent?.event_date ?? "",
    startTime: relatedEvent?.start_time ?? "",
    endTime: relatedEvent?.end_time ?? "",
    crowdSize: relatedEvent?.crowd_size ?? 0,
    timeline: planRow.timeline,
    energyProgression: planRow.energy_progression,
    recommendedGenres: planRow.recommended_genres,
    starterPlaylist: planRow.starter_playlist,
    createdAt: planRow.created_at,
  };

  const provider = createQueueEngineProvider();
  const previousSnapshots = await getPreviousSnapshotsForPlan({
    supabase,
    eventPlanId: plan.id,
  });

  const snapshotResult = await createQueueSnapshotForPlan({
    supabase,
    provider,
    userId: user.id,
    plan,
    context: {
      previousSnapshots,
    },
  });

  if (!snapshotResult.ok) {
    return NextResponse.json({ message: snapshotResult.message }, { status: 500 });
  }

  const recommendationWithMeta = {
    ...snapshotResult.recommendation,
    latestSnapshotId: snapshotResult.snapshot?.id ?? null,
    latestGeneratedAt: snapshotResult.snapshot?.created_at ?? null,
    queueVersionCount: snapshotResult.queueVersionCount,
  };
  const spotifyEnhanced = await createSpotifyEnhancedRecommendations({
    userId: user.id,
    recommendation: recommendationWithMeta,
  });

  return NextResponse.json({
    snapshot: snapshotResult.snapshot,
    queueVersionCount: snapshotResult.queueVersionCount,
    spotifyEnhancedRecommendations: spotifyEnhanced.ok ? spotifyEnhanced.enhanced : [],
    spotifyBridgeWarning: spotifyEnhanced.ok ? null : spotifyEnhanced.reason,
  });
}
