"use client";

import { useState } from "react";
import { EventsSection } from "@/app/dashboard/EventsSection";
import { AiEventPlanSection } from "@/app/dashboard/AiEventPlanSection";
import { EventPlanView, EventRecord } from "@/lib/events/types";

type DashboardContentProps = {
  initialEvents: EventRecord[];
  initialPlans: EventPlanView[];
};

export function DashboardContent({ initialEvents, initialPlans }: DashboardContentProps) {
  const [plans, setPlans] = useState(initialPlans);

  async function refreshPlans() {
    const response = await fetch("/api/event-plans", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message ?? "Failed to refresh AI plans.");
    }
    setPlans(data.plans ?? []);
  }

  return (
    <>
      <EventsSection initialEvents={initialEvents} onEventCreated={refreshPlans} />
      <AiEventPlanSection initialPlans={plans} />
    </>
  );
}
