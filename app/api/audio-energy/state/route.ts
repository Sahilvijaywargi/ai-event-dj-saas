import { NextResponse } from "next/server";
import { getAudioEnvironmentState } from "@/lib/audio/audio-energy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? "40");

  try {
    const state = await getAudioEnvironmentState({
      userId: user.id,
      sessionId,
      limit,
    });
    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch audio energy state." },
      { status: 500 },
    );
  }
}

