import { NextResponse } from "next/server";
import { getAvailableSpotifyDevices } from "@/lib/spotify/playback-service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const devices = await getAvailableSpotifyDevices(user.id);
    return NextResponse.json({ devices });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load devices." },
      { status: 500 },
    );
  }
}

