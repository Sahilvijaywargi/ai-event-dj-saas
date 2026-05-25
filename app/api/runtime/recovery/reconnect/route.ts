import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getPlaybackOrchestrationState } from "@/lib/spotify/device-orchestrator";
import {
  updateReconnectStatus,
  withTransientRetry,
  getRuntimeReliabilityState,
  markOfflineDetected,
} from "@/lib/runtime/reliability";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  updateReconnectStatus(
    user.id,
    {
      state: "reconnecting",
      lastAttemptAt: new Date().toISOString(),
    },
    { type: "spotify_reconnect_attempt", message: "Operator initiated Spotify reconnect recovery." },
  );

  try {
    const playback = await withTransientRetry({
      userId: user.id,
      actionName: "runtime_reconnect_recovery",
      attempts: 3,
      fn: () => getPlaybackOrchestrationState(user.id),
    });

    const ok = Boolean(playback.activeDevice && playback.playbackState);
    if (!ok) {
      updateReconnectStatus(
        user.id,
        {
          state: "failed",
          lastError: "Playback remained unsynced after reconnect attempt.",
          attempts: 1,
        },
        {
          type: "spotify_reconnect_failed",
          message: "Reconnect recovery completed but playback remains desynced.",
        },
      );
      const state = getRuntimeReliabilityState({ userId: user.id, playbackSynced: false, staleSignal: true });
      return NextResponse.json({ ok: false, message: "Reconnect incomplete. Please sync device manually.", state }, { status: 409 });
    }

    updateReconnectStatus(
      user.id,
      {
        state: "recovered",
        lastRecoveredAt: new Date().toISOString(),
        lastError: null,
        attempts: 0,
      },
      { type: "spotify_reconnect_success", message: "Spotify reconnect recovery succeeded." },
    );
    const state = getRuntimeReliabilityState({ userId: user.id, playbackSynced: true });
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reconnect recovery failed.";
    Sentry.captureException(error, {
      tags: { area: "runtime_recovery", action: "reconnect" },
      level: "error",
    });
    updateReconnectStatus(
      user.id,
      {
        state: "failed",
        lastError: message,
        attempts: 1,
      },
      { type: "spotify_reconnect_failed", message: "Reconnect recovery failed.", metadata: { error: message } },
    );
    markOfflineDetected(user.id, "Reconnect recovery observed transient/offline failure.", { error: message });
    const state = getRuntimeReliabilityState({ userId: user.id, playbackSynced: false, staleSignal: true });
    return NextResponse.json({ ok: false, message, state }, { status: 500 });
  }
}

