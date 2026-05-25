import { NextResponse } from "next/server";
import { startSpotifyPlayback } from "@/lib/spotify/playback-service";
import { executeGuardedPlaybackCommand } from "@/lib/spotify/playback-guarded";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  deviceId?: string;
  uris?: string[];
  positionMs?: number;
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
    const execution = await executeGuardedPlaybackCommand({
      userId: user.id,
      commandType: "play",
      executionSource: "manual_user",
      targetDeviceId: body.deviceId,
      trackUri: body.uris?.[0],
      commandPayload: body as Record<string, unknown>,
      execute: () =>
        startSpotifyPlayback({
          userId: user.id,
          deviceId: body.deviceId,
          uris: body.uris,
          positionMs: body.positionMs,
        }),
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
      { message: error instanceof Error ? error.message : "Failed to start playback." },
      { status: 500 },
    );
  }
}

