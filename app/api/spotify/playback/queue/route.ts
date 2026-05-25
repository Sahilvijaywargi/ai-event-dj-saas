import { NextResponse } from "next/server";
import { queueAiRecommendedTrack } from "@/lib/spotify/device-orchestrator";
import { queueSpotifyTrack } from "@/lib/spotify/playback-service";
import { executeGuardedPlaybackCommand } from "@/lib/spotify/playback-guarded";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  spotifyTrackId?: string;
  uri?: string;
  deviceId?: string;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }

  try {
    const trackUri = body.spotifyTrackId
      ? `spotify:track:${body.spotifyTrackId}`
      : body.uri ?? null;
    if (!trackUri) {
      return NextResponse.json(
        { message: "spotifyTrackId or uri is required." },
        { status: 400 },
      );
    }
    const execution = await executeGuardedPlaybackCommand({
      userId: user.id,
      commandType: "queue",
      executionSource: body.spotifyTrackId ? "ai_recommendation" : "manual_user",
      targetDeviceId: body.deviceId,
      trackUri,
      commandPayload: { spotifyTrackId: body.spotifyTrackId ?? null, uri: body.uri ?? null },
      execute: async () =>
        body.spotifyTrackId
          ? queueAiRecommendedTrack({
              userId: user.id,
              spotifyTrackId: body.spotifyTrackId,
              deviceId: body.deviceId,
            })
          : queueSpotifyTrack({ userId: user.id, uri: body.uri as string, deviceId: body.deviceId }),
    });
    if (!execution.ok) {
      return NextResponse.json(
        { message: execution.message, guardrailViolations: execution.violations },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ...execution.result,
      guardrailViolations: execution.violations,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to queue track." },
      { status: 500 },
    );
  }
}

