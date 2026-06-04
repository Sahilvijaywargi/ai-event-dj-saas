import { NextResponse } from "next/server";
import {
  getPhraseCalibrationHistory,
  recordPhraseCalibrationObservation,
  summarizePhraseCalibration,
} from "@/lib/ai/phrase-calibration";
import type { SongSection } from "@/lib/ai/song-structure";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  trackName?: string;
  playbackPositionMs?: number;
  detectedSection?: SongSection | string;
  humanObservedSection?: SongSection | string;
  confidence?: number;
  notes?: string;
};

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const trackName = url.searchParams.get("trackName") ?? undefined;

    return NextResponse.json({
      ok: true,
      summary: summarizePhraseCalibration(user.id),
      history: getPhraseCalibrationHistory({ userId: user.id, trackName, limit: 40 }),
    });
  } catch (error) {
    console.error("[PHRASE_CALIBRATION] GET failed", error);
    return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
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

    if (!body.trackName || !body.humanObservedSection || !body.detectedSection) {
      return NextResponse.json(
        {
          message: "trackName, detectedSection, and humanObservedSection are required.",
        },
        { status: 400 },
      );
    }

    const observation = recordPhraseCalibrationObservation({
      userId: user.id,
      trackName: body.trackName,
      playbackPositionMs: body.playbackPositionMs ?? 0,
      detectedSection: body.detectedSection,
      humanObservedSection: body.humanObservedSection,
      confidence: body.confidence ?? 80,
      notes: body.notes,
    });

    return NextResponse.json({
      ok: true,
      observation,
      summary: summarizePhraseCalibration(user.id),
    });
  } catch (error) {
    console.error("[PHRASE_CALIBRATION] POST failed", error);
    return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
  }
}
