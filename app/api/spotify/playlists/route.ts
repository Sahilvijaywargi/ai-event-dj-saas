import { NextResponse } from "next/server";
import {
  getSpotifyConnectionStatus,
  getSpotifyLikedSongs,
  getSpotifyPlaylists,
  readSpotifyCache,
  writeSpotifyCache,
} from "@/lib/spotify/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const connection = await getSpotifyConnectionStatus(user.id);
  if (!connection) {
    return NextResponse.json({ connected: false, playlists: [], likedSongs: [] });
  }

  const cacheKey = "playlists:v1";
  const cached = await readSpotifyCache(user.id, cacheKey);
  if (cached) {
    return NextResponse.json({
      connected: true,
      account: connection,
      ...(cached as object),
      fromCache: true,
    });
  }

  try {
    const [playlists, likedSongs] = await Promise.all([
      getSpotifyPlaylists(user.id),
      getSpotifyLikedSongs(user.id),
    ]);

    const payload = { playlists, likedSongs };
    await writeSpotifyCache({
      userId: user.id,
      cacheKey,
      cacheType: "playlists",
      payload,
      ttlSeconds: 120,
    });

    return NextResponse.json({
      connected: true,
      account: connection,
      playlists,
      likedSongs,
      fromCache: false,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch playlists." },
      { status: 500 },
    );
  }
}

