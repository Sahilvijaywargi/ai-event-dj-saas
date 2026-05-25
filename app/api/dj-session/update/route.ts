import { NextResponse } from "next/server";
import { updateDjSession } from "@/lib/dj-session/engine";
import { UpdateSessionPayload } from "@/lib/dj-session/types";
import { serveAiSpotifyRecommendations } from "@/lib/spotify/recommendation-serving";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: UpdateSessionPayload;
  try {
    body = (await request.json()) as UpdateSessionPayload;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.sessionId || !body.action) {
    return NextResponse.json(
      { message: "sessionId and action are required." },
      { status: 400 },
    );
  }

  const result = await updateDjSession(user.id, body);
  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: result.status });
  }

  if (body.action === "phase_change") {
    void serveAiSpotifyRecommendations({
      userId: user.id,
      eventPhase: body.phase ?? null,
      forceRefresh: true,
    }).catch(() => {
      // Non-blocking, fallback-safe refresh trigger for recommendation invalidation.
    });
  }

  return NextResponse.json(
    {
      session: result.session,
      activity: result.activity,
      warning: result.warning,
    },
    { status: result.status },
  );
}

