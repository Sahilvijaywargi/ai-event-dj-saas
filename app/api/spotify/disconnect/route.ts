import { NextResponse } from "next/server";
import { removeSpotifyConnection } from "@/lib/spotify/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await removeSpotifyConnection(user.id);
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to disconnect." },
      { status: 500 },
    );
  }
}

