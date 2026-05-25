export type DjSessionStatus = "live" | "paused" | "ended";

export type CrowdMomentum = "low" | "steady" | "rising" | "surging";

export type SessionActivityType =
  | "SESSION_STARTED"
  | "SESSION_PAUSED"
  | "SESSION_RESUMED"
  | "SESSION_ENDED"
  | "PHASE_CHANGE"
  | "QUEUE_TRANSITION"
  | "ENERGY_CHANGE"
  | "AI_DECISION"
  | "FALLBACK_EVENT";

export type DjSessionRecord = {
  id: string;
  event_id: string;
  user_id: string;
  session_status: DjSessionStatus;
  started_at: string;
  ended_at: string | null;
  current_phase: string;
  current_energy: number;
  current_bpm: number;
  active_track: string;
  crowd_momentum: CrowdMomentum;
  created_at: string;
  updated_at: string;
};

export type SessionActivityRecord = {
  id: string;
  session_id: string;
  user_id: string;
  activity_type: SessionActivityType;
  phase: string | null;
  queue_position: number | null;
  energy: number | null;
  bpm: number | null;
  track: string | null;
  momentum: CrowdMomentum | null;
  ai_decision: string | null;
  fallback_reason: string | null;
  created_at: string;
};

export type StartSessionPayload = {
  eventId: string;
};

export type UpdateSessionPayload = {
  sessionId: string;
  action:
    | "pause"
    | "resume"
    | "phase_change"
    | "queue_transition"
    | "energy_change"
    | "ai_decision"
    | "fallback_event";
  phase?: string;
  queuePosition?: number;
  energy?: number;
  bpm?: number;
  track?: string;
  momentum?: CrowdMomentum;
  aiDecision?: string;
  fallbackReason?: string;
};

