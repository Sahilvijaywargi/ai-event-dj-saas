import { NextResponse } from "next/server";
import { seekSpotifyPlayback } from "@/lib/spotify/playback-service";
import { executeGuardedPlaybackCommand } from "@/lib/spotify/playback-guarded";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  positionMs?: number;
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
  if (typeof body.positionMs !== "number") {
    return NextResponse.json({ message: "positionMs is required." }, { status: 400 });
  }
  try {
    const execution = await executeGuardedPlaybackCommand({
      userId: user.id,
      commandType: "seek",
      executionSource: "manual_user",
      targetDeviceId: body.deviceId,
      commandPayload: body as Record<string, unknown>,
      execute: () =>
        seekSpotifyPlayback({
          userId: user.id,
          positionMs: body.positionMs as number,
          deviceId: body.deviceId,
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
      { message: error instanceof Error ? error.message : "Failed to seek playback." },
      { status: 500 },
    );
  }
}

