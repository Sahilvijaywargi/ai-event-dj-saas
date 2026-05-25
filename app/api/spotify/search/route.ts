import { NextResponse } from "next/server";
import {
  readSpotifyCache,
  searchSpotify,
  writeSpotifyCache,
} from "@/lib/spotify/service";
import { SpotifySearchType } from "@/lib/spotify/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const type = (url.searchParams.get("type") ?? "track") as SpotifySearchType;
  if (!q) {
    return NextResponse.json({ message: "Query q is required." }, { status: 400 });
  }
  if (!["track", "artist", "playlist"].includes(type)) {
    return NextResponse.json({ message: "Invalid type." }, { status: 400 });
  }

  const cacheKey = `search:${type}:${q.toLowerCase()}`;
  const cached = await readSpotifyCache(user.id, cacheKey);
  if (cached) {
    return NextResponse.json({ results: cached, fromCache: true });
  }

  try {
    const results = await searchSpotify(user.id, q, type);
    await writeSpotifyCache({
      userId: user.id,
      cacheKey,
      cacheType: "search",
      payload: results,
      ttlSeconds: 90,
    });
    return NextResponse.json({ results, fromCache: false });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Search failed." },
      { status: 500 },
    );
  }
}

