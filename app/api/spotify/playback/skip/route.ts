import { NextResponse } from "next/server";
import { skipSpotifyTrack } from "@/lib/spotify/playback-service";
import { executeGuardedPlaybackCommand } from "@/lib/spotify/playback-guarded";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const execution = await executeGuardedPlaybackCommand({
      userId: user.id,
      commandType: "skip",
      executionSource: "manual_user",
      commandPayload: {},
      execute: () => skipSpotifyTrack(user.id),
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
      { message: error instanceof Error ? error.message : "Failed to skip track." },
      { status: 500 },
    );
  }
}

