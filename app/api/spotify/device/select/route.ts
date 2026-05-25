import { NextResponse } from "next/server";
import { selectActiveDevice } from "@/lib/spotify/device-orchestrator";
import { executeGuardedPlaybackCommand } from "@/lib/spotify/playback-guarded";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  deviceId?: string;
  play?: boolean;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }
  if (!body.deviceId) {
    return NextResponse.json({ message: "deviceId is required." }, { status: 400 });
  }
  try {
    const execution = await executeGuardedPlaybackCommand({
      userId: user.id,
      commandType: "device_transfer",
      executionSource: "manual_user",
      targetDeviceId: body.deviceId,
      commandPayload: body as Record<string, unknown>,
      execute: () =>
        selectActiveDevice({
          userId: user.id,
          deviceId: body.deviceId as string,
          play: body.play ?? false,
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
      { message: error instanceof Error ? error.message : "Failed to select device." },
      { status: 500 },
    );
  }
}

