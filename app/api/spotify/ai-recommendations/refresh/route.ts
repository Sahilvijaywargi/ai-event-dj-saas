import { NextResponse } from "next/server";
import { serveAiSpotifyRecommendations } from "@/lib/spotify/recommendation-serving";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RefreshBody = {
  eventPlanId?: string;
  eventPhase?: string | null;
  forceRefresh?: boolean;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: RefreshBody = {};
  try {
    body = (await request.json()) as RefreshBody;
  } catch {
    body = {};
  }

  try {
    const result = await serveAiSpotifyRecommendations({
      userId: user.id,
      eventPlanId: body.eventPlanId,
      eventPhase: body.eventPhase ?? null,
      forceRefresh: body.forceRefresh ?? true,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to refresh AI recommendations." },
      { status: 500 },
    );
  }
}

