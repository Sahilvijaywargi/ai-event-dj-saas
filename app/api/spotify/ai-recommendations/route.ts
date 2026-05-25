import { NextResponse } from "next/server";
import { serveAiSpotifyRecommendations } from "@/lib/spotify/recommendation-serving";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const eventPlanId = url.searchParams.get("eventPlanId") ?? undefined;
  const eventPhase = url.searchParams.get("eventPhase");

  try {
    const result = await serveAiSpotifyRecommendations({
      userId: user.id,
      eventPlanId,
      eventPhase,
      forceRefresh: false,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load AI recommendations." },
      { status: 500 },
    );
  }
}

