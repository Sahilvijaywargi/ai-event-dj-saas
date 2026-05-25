import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CrowdMomentum,
  DjSessionRecord,
  SessionActivityRecord,
  SessionActivityType,
  StartSessionPayload,
  UpdateSessionPayload,
} from "@/lib/dj-session/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function deriveActivityType(action: UpdateSessionPayload["action"]): SessionActivityType {
  switch (action) {
    case "pause":
      return "SESSION_PAUSED";
    case "resume":
      return "SESSION_RESUMED";
    case "phase_change":
      return "PHASE_CHANGE";
    case "queue_transition":
      return "QUEUE_TRANSITION";
    case "energy_change":
      return "ENERGY_CHANGE";
    case "ai_decision":
      return "AI_DECISION";
    case "fallback_event":
      return "FALLBACK_EVENT";
    default:
      return "AI_DECISION";
  }
}

export async function startDjSession(userId: string, payload: StartSessionPayload) {
  const supabase = await createSupabaseServerClient();

  const { data: existingLiveSession } = await supabase
    .from("dj_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("event_id", payload.eventId)
    .in("session_status", ["live", "paused"])
    .maybeSingle();

  if (existingLiveSession) {
    return { ok: false as const, status: 409, message: "Session already active for this event." };
  }

  const { data: session, error: sessionError } = await supabase
    .from("dj_sessions")
    .insert({
      event_id: payload.eventId,
      user_id: userId,
      session_status: "live",
      started_at: new Date().toISOString(),
      ended_at: null,
      current_phase: "warmup",
      current_energy: 5,
      current_bpm: 102,
      active_track: "Session Warmup Prelude",
      crowd_momentum: "steady",
    })
    .select("*")
    .single();

  if (sessionError || !session) {
    return { ok: false as const, status: 500, message: sessionError?.message ?? "Failed to start session." };
  }

  const { error: activityError } = await supabase.from("session_activity").insert({
    session_id: session.id,
    user_id: userId,
    activity_type: "SESSION_STARTED",
    phase: session.current_phase,
    queue_position: 1,
    energy: session.current_energy,
    bpm: session.current_bpm,
    track: session.active_track,
    momentum: session.crowd_momentum,
    ai_decision: "Session initialized with warmup lane.",
    fallback_reason: null,
  });

  if (activityError) {
    return {
      ok: true as const,
      status: 201,
      session: session as DjSessionRecord,
      warning: `Session started but activity logging failed: ${activityError.message}`,
    };
  }

  return { ok: true as const, status: 201, session: session as DjSessionRecord, warning: null };
}

export async function updateDjSession(userId: string, payload: UpdateSessionPayload) {
  const supabase = await createSupabaseServerClient();
  const { data: session, error: sessionError } = await supabase
    .from("dj_sessions")
    .select("*")
    .eq("id", payload.sessionId)
    .eq("user_id", userId)
    .single();

  if (sessionError || !session) {
    return { ok: false as const, status: 404, message: "Session not found." };
  }

  const updates: Partial<DjSessionRecord> = {};

  if (payload.action === "pause") {
    updates.session_status = "paused";
  }
  if (payload.action === "resume") {
    updates.session_status = "live";
  }
  if (payload.phase) {
    updates.current_phase = payload.phase;
  }
  if (typeof payload.energy === "number") {
    updates.current_energy = clamp(payload.energy, 1, 10);
  }
  if (typeof payload.bpm === "number") {
    updates.current_bpm = clamp(payload.bpm, 70, 180);
  }
  if (payload.track) {
    updates.active_track = payload.track;
  }
  if (payload.momentum) {
    updates.crowd_momentum = payload.momentum as CrowdMomentum;
  }

  const { data: updatedSession, error: updateError } = await supabase
    .from("dj_sessions")
    .update(updates)
    .eq("id", payload.sessionId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (updateError || !updatedSession) {
    return { ok: false as const, status: 500, message: updateError?.message ?? "Failed to update session." };
  }

  const { data: activity, error: activityError } = await supabase
    .from("session_activity")
    .insert({
      session_id: payload.sessionId,
      user_id: userId,
      activity_type: deriveActivityType(payload.action),
      phase: payload.phase ?? updatedSession.current_phase,
      queue_position: payload.queuePosition ?? null,
      energy: typeof payload.energy === "number" ? clamp(payload.energy, 1, 10) : updatedSession.current_energy,
      bpm: typeof payload.bpm === "number" ? clamp(payload.bpm, 70, 180) : updatedSession.current_bpm,
      track: payload.track ?? updatedSession.active_track,
      momentum: payload.momentum ?? updatedSession.crowd_momentum,
      ai_decision: payload.aiDecision ?? null,
      fallback_reason: payload.fallbackReason ?? null,
    })
    .select("*")
    .single();

  return {
    ok: true as const,
    status: 200,
    session: updatedSession as DjSessionRecord,
    activity: (activity ?? null) as SessionActivityRecord | null,
    warning: activityError ? `Activity logging failed: ${activityError.message}` : null,
  };
}

export async function endDjSession(userId: string, sessionId: string) {
  const supabase = await createSupabaseServerClient();
  const endedAt = new Date().toISOString();

  const { data: endedSession, error: endError } = await supabase
    .from("dj_sessions")
    .update({
      session_status: "ended",
      ended_at: endedAt,
    })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (endError || !endedSession) {
    return { ok: false as const, status: 404, message: "Session not found or already closed." };
  }

  const { error: activityError } = await supabase.from("session_activity").insert({
    session_id: sessionId,
    user_id: userId,
    activity_type: "SESSION_ENDED",
    phase: endedSession.current_phase,
    queue_position: null,
    energy: endedSession.current_energy,
    bpm: endedSession.current_bpm,
    track: endedSession.active_track,
    momentum: endedSession.crowd_momentum,
    ai_decision: "Session closed cleanly.",
    fallback_reason: null,
  });

  return {
    ok: true as const,
    status: 200,
    session: endedSession as DjSessionRecord,
    warning: activityError ? `Activity logging failed: ${activityError.message}` : null,
  };
}

export async function getLiveSessionState(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase
    .from("dj_sessions")
    .select("*")
    .eq("user_id", userId)
    .in("session_status", ["live", "paused"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: activities } = session
    ? await supabase
        .from("session_activity")
        .select("*")
        .eq("session_id", session.id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  return {
    session: (session ?? null) as DjSessionRecord | null,
    activities: (activities ?? []) as SessionActivityRecord[],
  };
}

