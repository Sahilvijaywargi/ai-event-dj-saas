import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/env/server";
import { getSpotifyConnectUrl } from "@/lib/spotify/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const state = `${user.id}:${randomUUID()}`;
  const cookieStore = await cookies();
  const env = getServerEnv();
  cookieStore.set("spotify_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    path: "/",
    maxAge: 10 * 60,
  });

  const url = getSpotifyConnectUrl(state);
  return NextResponse.redirect(url);
}

