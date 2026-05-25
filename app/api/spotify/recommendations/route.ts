import { NextResponse } from "next/server";
import {
  getSpotifyRecommendations,
  readSpotifyCache,
  writeSpotifyCache,
} from "@/lib/spotify/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RecommendationBody = {
  seedTracks?: string[];
  seedArtists?: string[];
  seedGenres?: string[];
  targetEnergy?: number;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: RecommendationBody;
  try {
    body = (await request.json()) as RecommendationBody;
  } catch {
    body = {};
  }

  const cacheKey = `recs:${JSON.stringify({
    t: body.seedTracks ?? [],
    a: body.seedArtists ?? [],
    g: body.seedGenres ?? [],
    e: body.targetEnergy ?? null,
  })}`;
  const cached = await readSpotifyCache(user.id, cacheKey);
  if (cached) {
    return NextResponse.json({ recommendations: cached, fromCache: true });
  }

  try {
    const recommendations = await getSpotifyRecommendations({
      userId: user.id,
      seedTracks: body.seedTracks,
      seedArtists: body.seedArtists,
      seedGenres: body.seedGenres,
      targetEnergy: body.targetEnergy,
    });

    await writeSpotifyCache({
      userId: user.id,
      cacheKey,
      cacheType: "recommendations",
      payload: recommendations,
      ttlSeconds: 120,
    });

    return NextResponse.json({ recommendations, fromCache: false });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Failed to fetch recommendations.",
      },
      { status: 500 },
    );
  }
}

