"use client";

import { FormEvent, useMemo, useState } from "react";
import { EventRecord } from "@/lib/events/types";

type EventsSectionProps = {
  initialEvents: EventRecord[];
  onEventCreated?: () => Promise<void> | void;
};

type FormState = {
  eventName: string;
  eventType: string;
  date: string;
  startTime: string;
  endTime: string;
  crowdSize: string;
  genres: string;
  energyLevel: string;
};

const initialFormState: FormState = {
  eventName: "",
  eventType: "",
  date: "",
  startTime: "",
  endTime: "",
  crowdSize: "",
  genres: "",
  energyLevel: "7",
};

function formatEventDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function EventsSection({ initialEvents, onEventCreated }: EventsSectionProps) {
  const [events, setEvents] = useState<EventRecord[]>(initialEvents);
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(initialFormState);

  const eventCountLabel = useMemo(() => {
    if (events.length === 0) return "No events yet";
    if (events.length === 1) return "1 event";
    return `${events.length} events`;
  }, [events.length]);

  async function refreshEvents() {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/events", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Failed to fetch events.");
      }
      setEvents(data.events ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to fetch events.");
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const payload = {
      eventName: formState.eventName,
      eventType: formState.eventType,
      date: formState.date,
      startTime: formState.startTime,
      endTime: formState.endTime,
      crowdSize: Number(formState.crowdSize),
      genres: formState.genres
        .split(",")
        .map((genre) => genre.trim())
        .filter(Boolean),
      energyLevel: Number(formState.energyLevel),
    };

    try {
      const response = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to create event.");
      }

      setEvents((current) =>
        [...current, data.event as EventRecord].sort((a, b) => {
          const aKey = `${a.event_date}T${a.start_time}`;
          const bKey = `${b.event_date}T${b.start_time}`;
          return aKey.localeCompare(bKey);
        }),
      );
      setFormState(initialFormState);
      setIsOpen(false);
      if (onEventCreated) {
        await onEventCreated();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create event.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article id="events" className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">Events</h2>
          <p className="mt-1 text-sm text-white/65">{eventCountLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshEvents}
            type="button"
            disabled={isRefreshing}
            className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition hover:border-white/40 hover:bg-white/10 disabled:opacity-60"
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
          <button
            onClick={() => setIsOpen(true)}
            className="rounded-full border border-white/25 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition hover:border-white/50 hover:bg-white/10"
          >
            New Event
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-black/25 p-6 text-sm text-white/70">
          No events found. Create your first event to begin generating AI DJ timelines.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {events.map((eventItem) => (
            <div key={eventItem.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
              <p className="text-xs uppercase tracking-wider text-purple-200">
                {eventItem.event_type}
              </p>
              <p className="mt-1 font-semibold">{eventItem.event_name}</p>
              <p className="mt-1 text-sm text-white/70">
                {formatEventDate(eventItem.event_date)} | {eventItem.start_time} - {eventItem.end_time}
              </p>
              <p className="mt-1 text-sm text-white/70">Crowd: {eventItem.crowd_size}</p>
              <p className="mt-1 text-sm text-white/70">
                Genres: {eventItem.genres.join(", ")} | Energy {eventItem.energy_level}/10
              </p>
            </div>
          ))}
        </div>
      )}

      {isOpen ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <div className="glass-panel w-full max-w-2xl rounded-2xl p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold">Create New Event</h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-wider hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className="mb-1 block text-sm text-white/80">Event Name</span>
                <input
                  required
                  value={formState.eventName}
                  onChange={(e) => setFormState((s) => ({ ...s, eventName: e.target.value }))}
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm outline-none focus:border-purple-300/50"
                />
              </label>

              <label>
                <span className="mb-1 block text-sm text-white/80">Event Type</span>
                <input
                  required
                  value={formState.eventType}
                  onChange={(e) => setFormState((s) => ({ ...s, eventType: e.target.value }))}
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm outline-none focus:border-purple-300/50"
                  placeholder="Wedding, Corporate, Private..."
                />
              </label>

              <label>
                <span className="mb-1 block text-sm text-white/80">Date</span>
                <input
                  required
                  type="date"
                  value={formState.date}
                  onChange={(e) => setFormState((s) => ({ ...s, date: e.target.value }))}
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm outline-none focus:border-purple-300/50"
                />
              </label>

              <label>
                <span className="mb-1 block text-sm text-white/80">Start Time</span>
                <input
                  required
                  type="time"
                  value={formState.startTime}
                  onChange={(e) => setFormState((s) => ({ ...s, startTime: e.target.value }))}
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm outline-none focus:border-purple-300/50"
                />
              </label>

              <label>
                <span className="mb-1 block text-sm text-white/80">End Time</span>
                <input
                  required
                  type="time"
                  value={formState.endTime}
                  onChange={(e) => setFormState((s) => ({ ...s, endTime: e.target.value }))}
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm outline-none focus:border-purple-300/50"
                />
              </label>

              <label>
                <span className="mb-1 block text-sm text-white/80">Crowd Size</span>
                <input
                  required
                  min={1}
                  type="number"
                  value={formState.crowdSize}
                  onChange={(e) => setFormState((s) => ({ ...s, crowdSize: e.target.value }))}
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm outline-none focus:border-purple-300/50"
                />
              </label>

              <label>
                <span className="mb-1 block text-sm text-white/80">Energy Level (1-10)</span>
                <input
                  required
                  min={1}
                  max={10}
                  type="number"
                  value={formState.energyLevel}
                  onChange={(e) => setFormState((s) => ({ ...s, energyLevel: e.target.value }))}
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm outline-none focus:border-purple-300/50"
                />
              </label>

              <label className="md:col-span-2">
                <span className="mb-1 block text-sm text-white/80">
                  Genres (comma-separated)
                </span>
                <input
                  required
                  value={formState.genres}
                  onChange={(e) => setFormState((s) => ({ ...s, genres: e.target.value }))}
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm outline-none focus:border-purple-300/50"
                  placeholder="House, Afrobeats, Pop"
                />
              </label>

              <div className="md:col-span-2 flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold uppercase tracking-wider hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-black transition hover:bg-purple-100 disabled:opacity-60"
                >
                  {isSubmitting ? "Saving..." : "Create Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </article>
  );
}
