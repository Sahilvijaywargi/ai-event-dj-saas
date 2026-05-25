import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OperatorConsole } from "@/app/operator/OperatorConsole";

type OperatorEvent = {
  id: string;
  event_name: string;
  event_type: string;
  event_date: string;
  start_time: string;
  end_time: string;
  crowd_size: number;
  energy_level: number;
};

export default async function OperatorPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: eventsData } = await supabase
    .from("events")
    .select("id,event_name,event_type,event_date,start_time,end_time,crowd_size,energy_level")
    .eq("user_id", user.id)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true });

  const initialEvents = ((eventsData ?? []) as OperatorEvent[]).slice(0, 20);

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-lux-gradient bg-[length:200%_200%] animate-gradient-shift opacity-90" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_10%,rgba(168,85,247,0.2),transparent_40%),radial-gradient(circle_at_85%_20%,rgba(255,255,255,0.09),transparent_35%),radial-gradient(circle_at_50%_85%,rgba(126,34,206,0.2),transparent_38%)]" />
      <div className="mx-auto w-full max-w-6xl px-4 py-5 md:px-6 md:py-8">
        <OperatorConsole initialEvents={initialEvents} />
      </div>
    </main>
  );
}

