import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("event_plans")
    .select(
      "id,event_id,user_id,timeline,energy_progression,recommended_genres,starter_playlist,created_at,events!inner(event_name,event_type,event_date,start_time,end_time,crowd_size)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const plans =
    data?.map((row) => ({
      id: row.id,
      eventId: row.event_id,
      eventName: row.events.event_name,
      eventType: row.events.event_type,
      eventDate: row.events.event_date,
      startTime: row.events.start_time,
      endTime: row.events.end_time,
      crowdSize: row.events.crowd_size,
      timeline: row.timeline,
      energyProgression: row.energy_progression,
      recommendedGenres: row.recommended_genres,
      starterPlaylist: row.starter_playlist,
      createdAt: row.created_at,
    })) ?? [];

  return NextResponse.json({ plans });
}
