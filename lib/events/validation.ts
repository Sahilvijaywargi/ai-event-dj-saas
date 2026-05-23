import { CreateEventPayload } from "@/lib/events/types";

function isTimeFormat(value: string) {
  return /^\d{2}:\d{2}$/.test(value);
}

export function validateCreateEventPayload(payload: CreateEventPayload) {
  if (!payload.eventName.trim()) return "Event name is required.";
  if (!payload.eventType.trim()) return "Event type is required.";
  if (!payload.date) return "Event date is required.";
  if (!isTimeFormat(payload.startTime)) return "Start time must be in HH:MM format.";
  if (!isTimeFormat(payload.endTime)) return "End time must be in HH:MM format.";
  if (!Number.isFinite(payload.crowdSize) || payload.crowdSize < 1) {
    return "Crowd size must be at least 1.";
  }
  if (payload.genres.length === 0) return "Add at least one genre.";
  if (!Number.isFinite(payload.energyLevel) || payload.energyLevel < 1 || payload.energyLevel > 10) {
    return "Energy level must be between 1 and 10.";
  }

  return null;
}
