import { NextResponse } from "next/server";
import { getPlaybackOrchestrationState } from "@/lib/spotify/device-orchestrator";
import { getSpotifyConnectionStatus } from "@/lib/spotify/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const degraded = (errorCode: string) =>
    NextResponse.json({
      connected: false,
      devices: [],
      activeDevice: null,
      playbackState: null,
      queueStatus: {
        canQueue: false,
        syncStatus: "no_active_device",
      },
      error: errorCode,
    });

  try {
    const connection = await getSpotifyConnectionStatus(user.id);
    if (!connection) {
      return degraded("spotify_not_connected");
    }

    const state = await getPlaybackOrchestrationState(user.id);
    return NextResponse.json({
      connected: true,
      ...state,
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const unavailable =
      message.includes("spotify account not connected") ||
      message.includes("token") ||
      message.includes("auth") ||
      message.includes("unauthorized") ||
      message.includes("invalid_grant");
    if (unavailable) {
      return degraded("spotify_unavailable");
    }
    return degraded("playback_state_unavailable");
  }
}

