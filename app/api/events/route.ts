import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CreateEventPayload } from "@/lib/events/types";
import { generateEventPlan } from "@/lib/events/generator";
import { validateCreateEventPayload } from "@/lib/events/validation";

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
    .from("events")
    .select(
      "id,event_name,event_type,event_date,start_time,end_time,crowd_size,genres,energy_level,created_at",
    )
    .eq("user_id", user.id)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let body: CreateEventPayload;
  try {
    body = (await request.json()) as CreateEventPayload;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const validationMessage = validateCreateEventPayload(body);
  if (validationMessage) {
    return NextResponse.json({ message: validationMessage }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("events")
    .insert({
      user_id: user.id,
      event_name: body.eventName.trim(),
      event_type: body.eventType.trim(),
      event_date: body.date,
      start_time: body.startTime,
      end_time: body.endTime,
      crowd_size: body.crowdSize,
      genres: body.genres,
      energy_level: body.energyLevel,
    })
    .select(
      "id,event_name,event_type,event_date,start_time,end_time,crowd_size,genres,energy_level,created_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }

  const generatedPlan = generateEventPlan(body);

  const { data: planData, error: planError } = await supabase
    .from("event_plans")
    .insert({
      event_id: data.id,
      user_id: user.id,
      timeline: generatedPlan.timeline,
      energy_progression: generatedPlan.energyProgression,
      recommended_genres: generatedPlan.recommendedGenres,
      starter_playlist: generatedPlan.starterPlaylist,
    })
    .select(
      "id,event_id,user_id,timeline,energy_progression,recommended_genres,starter_playlist,created_at",
    )
    .single();

  if (planError) {
    return NextResponse.json(
      { message: `Event created, but AI plan generation failed: ${planError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ event: data, plan: planData }, { status: 201 });
}
