import { NextResponse } from "next/server";
import { serveRecommendationDiagnostics } from "@/lib/spotify/diagnostics-serving";
import { getSpotifyConnectionStatus } from "@/lib/spotify/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const degraded = (errorCode: string) =>
    NextResponse.json({
      telemetry: [],
      connected: false,
      error: errorCode,
    });

  try {
    const connection = await getSpotifyConnectionStatus(user.id);
    if (!connection) {
      return degraded("spotify_not_connected");
    }

    const telemetry = await serveRecommendationDiagnostics(user.id);
    return NextResponse.json({
      telemetry: telemetry.items,
      generatedAt: telemetry.generatedAt,
      connected: true,
      error: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const unavailable =
      message.includes("spotify account not connected") ||
      message.includes("token") ||
      message.includes("auth") ||
      message.includes("unauthorized") ||
      message.includes("invalid_grant");
    if (unavailable) {
      return degraded("spotify_unavailable");
    }
    return degraded("diagnostics_unavailable");
  }
}

