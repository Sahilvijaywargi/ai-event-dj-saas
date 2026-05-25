import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getPlaybackOrchestrationState, selectActiveDevice } from "@/lib/spotify/device-orchestrator";
import {
  getRuntimeReliabilityState,
  markPlaybackResynced,
  setPollingBackoff,
  withTransientRetry,
} from "@/lib/runtime/reliability";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  try {
    const playback = await withTransientRetry({
      userId: user.id,
      actionName: "runtime_resync_state",
      attempts: 2,
      fn: () => getPlaybackOrchestrationState(user.id),
    });

    if (!playback.activeDevice && playback.devices.length > 0) {
      const fallbackDevice = playback.devices[0];
      await withTransientRetry({
        userId: user.id,
        actionName: "runtime_resync_transfer",
        attempts: 2,
        fn: () =>
          selectActiveDevice({
            userId: user.id,
            deviceId: fallbackDevice.id,
            play: false,
          }),
      });
    }

    const refreshed = await getPlaybackOrchestrationState(user.id);
    const synced = Boolean(refreshed.activeDevice && refreshed.playbackState);
    if (synced) {
      markPlaybackResynced(user.id, { source: "manual_resync" });
      setPollingBackoff(user.id, 5500);
      const state = getRuntimeReliabilityState({ userId: user.id, playbackSynced: true });
      return NextResponse.json({ ok: true, state });
    }

    setPollingBackoff(user.id, 9000);
    const state = getRuntimeReliabilityState({ userId: user.id, playbackSynced: false, staleSignal: true });
    return NextResponse.json({ ok: false, message: "Resync attempted but playback is still not synced.", state }, { status: 409 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resync failed.";
    Sentry.captureException(error, {
      tags: { area: "runtime_recovery", action: "resync" },
      level: "error",
    });
    setPollingBackoff(user.id, 12_000);
    const state = getRuntimeReliabilityState({ userId: user.id, playbackSynced: false, staleSignal: true });
    return NextResponse.json({ ok: false, message, state }, { status: 500 });
  }
}

