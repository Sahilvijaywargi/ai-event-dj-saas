import { NextResponse } from "next/server";
import { ingestAudioEnergyEvent } from "@/lib/audio/audio-energy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Body = {
  sessionId?: string | null;
  energyLevel?: number;
  crowdIntensity?: number;
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
  if (typeof body.energyLevel !== "number" || typeof body.crowdIntensity !== "number") {
    return NextResponse.json(
      { message: "energyLevel and crowdIntensity are required numeric values." },
      { status: 400 },
    );
  }

  try {
    const snapshot = await ingestAudioEnergyEvent({
      userId: user.id,
      sessionId: body.sessionId,
      energyLevel: body.energyLevel,
      crowdIntensity: body.crowdIntensity,
    });
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to ingest audio energy." },
      { status: 500 },
    );
  }
}

