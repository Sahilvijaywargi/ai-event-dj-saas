import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  exchangeCodeForTokens,
  fetchSpotifyProfile,
  upsertSpotifyConnection,
} from "@/lib/spotify/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/dashboard?spotify_error=missing_callback_params", request.url),
    );
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("spotify_oauth_state")?.value;
  cookieStore.delete("spotify_oauth_state");

  if (!expectedState || expectedState !== state || !state.startsWith(`${user.id}:`)) {
    return NextResponse.redirect(new URL("/dashboard?spotify_error=invalid_state", request.url));
  }

  try {
    const tokenData = await exchangeCodeForTokens(code);
    const profile = await fetchSpotifyProfile(tokenData.access_token);
    await upsertSpotifyConnection({
      userId: user.id,
      profile,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? "",
      expiresInSeconds: tokenData.expires_in,
    });

    return NextResponse.redirect(new URL("/dashboard?spotify_connected=1", request.url));
  } catch {
    return NextResponse.redirect(new URL("/dashboard?spotify_error=connect_failed", request.url));
  }
}

