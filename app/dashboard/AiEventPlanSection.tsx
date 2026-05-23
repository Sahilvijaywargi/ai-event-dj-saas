"use client";

import { useState } from "react";
import { EventPlanView } from "@/lib/events/types";

type AiEventPlanSectionProps = {
  initialPlans: EventPlanView[];
};

function formatEventDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function AiEventPlanSection({ initialPlans }: AiEventPlanSectionProps) {
  const [plans, setPlans] = useState<EventPlanView[]>(initialPlans);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function refreshPlans() {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/event-plans", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message ?? "Unable to refresh AI plans.");
      }
      setPlans(data.plans ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to refresh AI plans.");
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <article id="ai-event-plan" className="glass-panel animate-fade-up rounded-2xl p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold md:text-2xl">AI Event Plan</h2>
          <p className="mt-1 text-sm text-white/65">
            Timelines, energy curves, and starter queue generated from your event specs.
          </p>
        </div>
        <button
          onClick={refreshPlans}
          type="button"
          disabled={isRefreshing}
          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition hover:border-white/40 hover:bg-white/10 disabled:opacity-60"
        >
          {isRefreshing ? "Refreshing..." : "Refresh Plans"}
        </button>
      </div>

      {errorMessage ? (
        <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </p>
      ) : null}

      {plans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-black/25 p-6 text-sm text-white/70">
          No AI plans yet. Create an event to generate an automatic AI event plan.
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm uppercase tracking-wider text-purple-200">{plan.eventType}</p>
                  <h3 className="text-lg font-semibold">{plan.eventName}</h3>
                  <p className="text-sm text-white/65">
                    {formatEventDate(plan.eventDate)} | {plan.startTime} - {plan.endTime} | Crowd{" "}
                    {plan.crowdSize}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-xs uppercase tracking-widest text-white/65">AI Timeline</p>
                  <div className="mt-3 space-y-2">
                    {plan.timeline.map((item) => (
                      <div key={`${plan.id}-${item.time}-${item.phase}`} className="text-sm text-white/85">
                        <span className="font-semibold text-purple-200">{item.time}</span> {"->"}{" "}
                        {item.phase}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-xs uppercase tracking-widest text-white/65">Energy Progression</p>
                  <div className="mt-3 space-y-2">
                    {plan.energyProgression.map((point) => (
                      <div key={`${plan.id}-${point.label}`} className="flex items-center justify-between text-sm">
                        <span className="text-white/80">{point.label}</span>
                        <span className="font-semibold text-purple-200">{point.level}/10</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-xs uppercase tracking-widest text-white/65">Recommended Genres</p>
                  <p className="mt-2 text-sm text-white/85">{plan.recommendedGenres.join(", ")}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/35 p-4">
                  <p className="text-xs uppercase tracking-widest text-white/65">Starter Playlist Queue</p>
                  <ul className="mt-2 space-y-1 text-sm text-white/85">
                    {plan.starterPlaylist.map((track) => (
                      <li key={`${plan.id}-${track}`}>• {track}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
