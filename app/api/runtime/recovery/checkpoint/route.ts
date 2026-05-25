import { NextResponse } from "next/server";
import { persistRecoveryCheckpoint } from "@/lib/runtime/session-recovery";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  source?: "operator_poll" | "operator_manual" | "reconnect" | "pre_refresh" | "server_health";
  note?: string;
  snapshot?: {
    session?: {
      sessionId?: string | null;
      eventId?: string | null;
      status?: "live" | "paused" | "ended" | "none";
      phase?: string | null;
      energy?: number | null;
      bpm?: number | null;
      activeTrack?: string | null;
    };
    playback?: {
      activeDevice?: string | null;
      isPlaying?: boolean;
      trackName?: string | null;
      progressMs?: number | null;
    };
    autonomous?: {
      status?: "running" | "stopped" | "unknown";
      supervisionMode?: "manual_override" | "assisted_autonomous" | "unknown";
      lastDecision?: string | null;
      pendingTransition?: string | null;
    };
    reliability?: {
      connectionQuality?: "good" | "degraded" | "offline" | "unknown";
      spotifySyncHealth?: "synced" | "degraded" | "desynced" | "unknown";
      heartbeatStale?: boolean;
    };
  };
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
    const checkpoint = persistRecoveryCheckpoint({
      userId: user.id,
      checkpoint: {
        source: body.source ?? "operator_poll",
        note: body.note,
      },
      snapshot: {
        session: {
          sessionId: body.snapshot?.session?.sessionId ?? null,
          eventId: body.snapshot?.session?.eventId ?? null,
          status: body.snapshot?.session?.status ?? "none",
          phase: body.snapshot?.session?.phase ?? null,
          energy: body.snapshot?.session?.energy ?? null,
          bpm: body.snapshot?.session?.bpm ?? null,
          activeTrack: body.snapshot?.session?.activeTrack ?? null,
        },
        playback: {
          activeDevice: body.snapshot?.playback?.activeDevice ?? null,
          isPlaying: body.snapshot?.playback?.isPlaying ?? false,
          trackName: body.snapshot?.playback?.trackName ?? null,
          progressMs: body.snapshot?.playback?.progressMs ?? null,
        },
        autonomous: {
          status: body.snapshot?.autonomous?.status ?? "unknown",
          supervisionMode: body.snapshot?.autonomous?.supervisionMode ?? "unknown",
          lastDecision: body.snapshot?.autonomous?.lastDecision ?? null,
          pendingTransition: body.snapshot?.autonomous?.pendingTransition ?? null,
        },
        reliability: {
          connectionQuality: body.snapshot?.reliability?.connectionQuality ?? "unknown",
          spotifySyncHealth: body.snapshot?.reliability?.spotifySyncHealth ?? "unknown",
          heartbeatStale: body.snapshot?.reliability?.heartbeatStale ?? false,
        },
      },
    });
    return NextResponse.json({ checkpoint });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to persist recovery checkpoint." },
      { status: 500 },
    );
  }
}

