import { NextResponse } from "next/server";
import { getPlaybackOrchestrationState } from "@/lib/spotify/device-orchestrator";
import { getRuntimeReliabilityState, touchRuntimeHeartbeat } from "@/lib/runtime/reliability";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const playback = await getPlaybackOrchestrationState(user.id);
    touchRuntimeHeartbeat(user.id, { source: "runtime_reliability_route" });
    const state = getRuntimeReliabilityState({
      userId: user.id,
      playbackSynced: Boolean(playback.activeDevice && playback.playbackState),
    });
    return NextResponse.json({ state });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load runtime reliability state." },
      { status: 500 },
    );
  }
}

