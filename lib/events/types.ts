export type EventRecord = {
  id: string;
  event_name: string;
  event_type: string;
  event_date: string;
  start_time: string;
  end_time: string;
  crowd_size: number;
  genres: string[];
  energy_level: number;
  created_at: string;
};

export type CreateEventPayload = {
  eventName: string;
  eventType: string;
  date: string;
  startTime: string;
  endTime: string;
  crowdSize: number;
  genres: string[];
  energyLevel: number;
};

export type PlanTimelineItem = {
  time: string;
  phase: string;
  note: string;
  targetEnergy: number;
};

export type EnergyProgressionPoint = {
  label: string;
  level: number;
};

export type EventPlanRecord = {
  id: string;
  event_id: string;
  user_id: string;
  timeline: PlanTimelineItem[];
  energy_progression: EnergyProgressionPoint[];
  recommended_genres: string[];
  starter_playlist: string[];
  created_at: string;
};

export type EventPlanView = {
  id: string;
  eventId: string;
  eventName: string;
  eventType: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  crowdSize: number;
  timeline: PlanTimelineItem[];
  energyProgression: EnergyProgressionPoint[];
  recommendedGenres: string[];
  starterPlaylist: string[];
  createdAt: string;
};
