import { NextResponse } from "next/server";
import { getRecentPlaybackAudit } from "@/lib/spotify/playback-audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "15");
  const limit = Number.isFinite(limitParam) ? Math.max(5, Math.min(50, limitParam)) : 15;

  try {
    const entries = await getRecentPlaybackAudit({ userId: user.id, limit });
    return NextResponse.json({ entries });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load playback audit." },
      { status: 500 },
    );
  }
}

