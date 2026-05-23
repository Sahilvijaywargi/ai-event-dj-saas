"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

type AuthFormProps = {
  mode: AuthMode;
};

export function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const isLogin = mode === "login";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const authCall = isLogin
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });

      const { error } = await authCall;

      if (error) {
        setErrorMessage(error.message);
        setLoading(false);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        "Unable to reach Supabase auth right now. Verify NEXT_PUBLIC_SUPABASE_URL and your internet/DNS, then try again.",
      );
      setLoading(false);
      console.error("Supabase auth request failed:", error);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-lux-gradient bg-[length:200%_200%] animate-gradient-shift opacity-90" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_15%_20%,rgba(168,85,247,0.24),transparent_36%),radial-gradient(circle_at_80%_10%,rgba(255,255,255,0.08),transparent_30%),radial-gradient(circle_at_50%_80%,rgba(147,51,234,0.2),transparent_40%)]" />

      <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-10">
        <section className="glass-panel animate-fade-up w-full rounded-3xl p-7 shadow-[0_0_60px_rgba(147,51,234,0.22)] md:p-8">
          <p className="mb-3 inline-block rounded-full border border-purple-300/30 bg-purple-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-purple-200">
            AI EVENT DJ
          </p>
          <h1 className="text-3xl font-semibold">
            {isLogin ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-white/70">
            {isLogin
              ? "Log in to manage your premium AI DJ events."
              : "Sign up to start building luxury event soundtracks."}
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-white/80">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm outline-none transition placeholder:text-white/35 focus:border-purple-300/50 focus:bg-white/10"
                placeholder="you@eventdj.com"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm text-white/80">Password</span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm outline-none transition placeholder:text-white/35 focus:border-purple-300/50 focus:bg-white/10"
                placeholder="Minimum 6 characters"
              />
            </label>

            {errorMessage ? (
              <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {errorMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-white px-6 py-3 text-sm font-semibold uppercase tracking-wider text-black transition hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? isLogin
                  ? "Logging in..."
                  : "Creating account..."
                : isLogin
                  ? "Login"
                  : "Sign up"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-white/70">
            {isLogin ? "New to AI EVENT DJ?" : "Already have an account?"}{" "}
            <Link
              href={isLogin ? "/signup" : "/login"}
              className="font-semibold text-purple-200 hover:text-purple-100"
            >
              {isLogin ? "Create one" : "Log in"}
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
