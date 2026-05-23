import {
  CreateEventPayload,
  EnergyProgressionPoint,
  PlanTimelineItem,
} from "@/lib/events/types";

type GeneratedPlan = {
  timeline: PlanTimelineItem[];
  energyProgression: EnergyProgressionPoint[];
  recommendedGenres: string[];
  starterPlaylist: string[];
};

const fallbackGenres = ["House", "Afrobeats", "Pop", "R&B"];

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part));
  return hours * 60 + minutes;
}

function toTimeLabel(totalMinutes: number) {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function eventTypeProfile(eventType: string) {
  const lower = eventType.toLowerCase();
  if (lower.includes("wedding")) {
    return {
      phases: ["arrival warmth", "social/lounge", "dance buildup", "peak energy", "closing vibes"],
      vibeBoost: 1,
    };
  }
  if (lower.includes("corporate")) {
    return {
      phases: ["networking", "social/lounge", "upbeat transition", "celebration peak", "refined closing"],
      vibeBoost: -1,
    };
  }
  if (lower.includes("birthday") || lower.includes("party")) {
    return {
      phases: ["warmup", "social/lounge", "dance buildup", "peak energy", "closing vibes"],
      vibeBoost: 0,
    };
  }
  return {
    phases: ["warmup", "social/lounge", "dance buildup", "peak energy", "closing vibes"],
    vibeBoost: 0,
  };
}

export function generateEventPlan(payload: CreateEventPayload): GeneratedPlan {
  const start = toMinutes(payload.startTime);
  let end = toMinutes(payload.endTime);
  if (end <= start) end += 24 * 60;
  const duration = Math.max(end - start, 60);
  const step = Math.max(Math.floor(duration / 4), 15);

  const profile = eventTypeProfile(payload.eventType);
  const baseEnergy = Math.min(Math.max(payload.energyLevel + profile.vibeBoost, 1), 10);
  const crowdBoost = payload.crowdSize >= 250 ? 1 : payload.crowdSize >= 120 ? 0 : -1;

  const progressionLevels = [
    Math.max(baseEnergy - 2 + crowdBoost, 1),
    Math.max(baseEnergy - 1 + crowdBoost, 2),
    Math.min(baseEnergy + crowdBoost, 9),
    Math.min(baseEnergy + 1 + crowdBoost, 10),
    Math.max(baseEnergy - 2, 2),
  ];

  const timeline: PlanTimelineItem[] = profile.phases.map((phase, index) => {
    const minuteMark = start + step * index;
    return {
      time: toTimeLabel(minuteMark),
      phase,
      note:
        index === 0
          ? "Set the tone with recognizable grooves and elegant transitions."
          : index === 3
            ? "Deploy high-impact anthems and crowd-pullers."
            : "Blend genres smoothly while maintaining floor momentum.",
      targetEnergy: progressionLevels[index],
    };
  });

  const recommendedGenres = Array.from(
    new Set([...payload.genres, ...fallbackGenres]).values(),
  ).slice(0, 6);

  const starterPlaylist = [
    `${recommendedGenres[0] ?? "House"} Intro Mix`,
    `${recommendedGenres[1] ?? "Pop"} Sunset Edit`,
    `${recommendedGenres[2] ?? "R&B"} Social Groove`,
    `${recommendedGenres[0] ?? "House"} Energy Lift`,
    `${recommendedGenres[1] ?? "Pop"} Peak Anthem`,
  ];

  const energyProgression: EnergyProgressionPoint[] = [
    { label: "Warmup", level: progressionLevels[0] },
    { label: "Social", level: progressionLevels[1] },
    { label: "Build", level: progressionLevels[2] },
    { label: "Peak", level: progressionLevels[3] },
    { label: "Close", level: progressionLevels[4] },
  ];

  return {
    timeline,
    energyProgression,
    recommendedGenres,
    starterPlaylist,
  };
}
