


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."ai_track_recommendations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_plan_id" "uuid" NOT NULL,
    "queue_snapshot_id" "uuid",
    "spotify_track_id" "text" NOT NULL,
    "recommendation_payload" "jsonb" NOT NULL,
    "ai_confidence" numeric(5,2) NOT NULL,
    "bpm_score" numeric(5,2) NOT NULL,
    "energy_score" numeric(5,2) NOT NULL,
    "transition_score" numeric(5,2) NOT NULL,
    "momentum_score" numeric(5,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "recommendation_context_hash" "text",
    "event_phase" "text"
);


ALTER TABLE "public"."ai_track_recommendations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dj_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_status" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "current_phase" "text" DEFAULT 'warmup'::"text" NOT NULL,
    "current_energy" integer DEFAULT 5 NOT NULL,
    "current_bpm" integer DEFAULT 102 NOT NULL,
    "active_track" "text" DEFAULT 'Session Warmup Prelude'::"text" NOT NULL,
    "crowd_momentum" "text" DEFAULT 'steady'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dj_sessions_crowd_momentum_check" CHECK (("crowd_momentum" = ANY (ARRAY['low'::"text", 'steady'::"text", 'rising'::"text", 'surging'::"text"]))),
    CONSTRAINT "dj_sessions_current_bpm_check" CHECK ((("current_bpm" >= 70) AND ("current_bpm" <= 180))),
    CONSTRAINT "dj_sessions_current_energy_check" CHECK ((("current_energy" >= 1) AND ("current_energy" <= 10))),
    CONSTRAINT "dj_sessions_session_status_check" CHECK (("session_status" = ANY (ARRAY['live'::"text", 'paused'::"text", 'ended'::"text"])))
);


ALTER TABLE "public"."dj_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "timeline" "jsonb" NOT NULL,
    "energy_progression" "jsonb" NOT NULL,
    "recommended_genres" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "starter_playlist" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."event_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_name" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "crowd_size" integer NOT NULL,
    "genres" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "energy_level" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "events_crowd_size_check" CHECK (("crowd_size" > 0)),
    CONSTRAINT "events_energy_level_check" CHECK ((("energy_level" >= 1) AND ("energy_level" <= 10)))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."queue_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_plan_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "queue_data" "jsonb" NOT NULL,
    "current_phase" "text" NOT NULL,
    "average_bpm" integer NOT NULL,
    "average_energy" numeric(5,2) NOT NULL,
    "crowd_momentum" "text" NOT NULL
);


ALTER TABLE "public"."queue_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."runtime_memory_audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "action_reason" "text",
    "pattern_type" "text",
    "pattern_context" "text",
    "confidence_score" numeric,
    "reversed_by_audit_id" "uuid",
    "reversal_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "runtime_memory_audit_action_type_check" CHECK (("action_type" = ANY (ARRAY['reinforce_pattern'::"text", 'penalize_pattern'::"text", 'reset_pattern_bias'::"text", 'freeze_pattern_learning'::"text", 'unfreeze_pattern_learning'::"text", 'undo_reinforce_pattern'::"text", 'undo_penalize_pattern'::"text", 'undo_reset_pattern_bias'::"text", 'undo_freeze_pattern_learning'::"text", 'undo_unfreeze_pattern_learning'::"text"])))
);


ALTER TABLE "public"."runtime_memory_audit" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_activity" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "activity_type" "text" NOT NULL,
    "phase" "text",
    "queue_position" integer,
    "energy" integer,
    "bpm" integer,
    "track" "text",
    "momentum" "text",
    "ai_decision" "text",
    "fallback_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "session_activity_activity_type_check" CHECK (("activity_type" = ANY (ARRAY['SESSION_STARTED'::"text", 'SESSION_PAUSED'::"text", 'SESSION_RESUMED'::"text", 'SESSION_ENDED'::"text", 'PHASE_CHANGE'::"text", 'QUEUE_TRANSITION'::"text", 'ENERGY_CHANGE'::"text", 'AI_DECISION'::"text", 'FALLBACK_EVENT'::"text"]))),
    CONSTRAINT "session_activity_bpm_check" CHECK ((("bpm" IS NULL) OR (("bpm" >= 70) AND ("bpm" <= 180)))),
    CONSTRAINT "session_activity_energy_check" CHECK ((("energy" IS NULL) OR (("energy" >= 1) AND ("energy" <= 10)))),
    CONSTRAINT "session_activity_momentum_check" CHECK ((("momentum" IS NULL) OR ("momentum" = ANY (ARRAY['low'::"text", 'steady'::"text", 'rising'::"text", 'surging'::"text"]))))
);


ALTER TABLE "public"."session_activity" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spotify_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cache_key" "text" NOT NULL,
    "cache_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "spotify_cache_cache_type_check" CHECK (("cache_type" = ANY (ARRAY['playlists'::"text", 'search'::"text", 'recommendations'::"text", 'liked_songs'::"text"])))
);


ALTER TABLE "public"."spotify_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spotify_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "spotify_user_id" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "access_token" "text" NOT NULL,
    "refresh_token" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "connected_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spotify_connections" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_track_recommendations"
    ADD CONSTRAINT "ai_track_recommendations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dj_sessions"
    ADD CONSTRAINT "dj_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_plans"
    ADD CONSTRAINT "event_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."queue_snapshots"
    ADD CONSTRAINT "queue_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."runtime_memory_audit"
    ADD CONSTRAINT "runtime_memory_audit_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_activity"
    ADD CONSTRAINT "session_activity_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spotify_cache"
    ADD CONSTRAINT "spotify_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spotify_cache"
    ADD CONSTRAINT "spotify_cache_user_id_cache_key_key" UNIQUE ("user_id", "cache_key");



ALTER TABLE ONLY "public"."spotify_connections"
    ADD CONSTRAINT "spotify_connections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spotify_connections"
    ADD CONSTRAINT "spotify_connections_user_id_key" UNIQUE ("user_id");



CREATE INDEX "ai_track_recommendations_context_hash_idx" ON "public"."ai_track_recommendations" USING "btree" ("user_id", "event_plan_id", "recommendation_context_hash");



CREATE INDEX "ai_track_recommendations_snapshot_idx" ON "public"."ai_track_recommendations" USING "btree" ("queue_snapshot_id");



CREATE INDEX "ai_track_recommendations_spotify_track_idx" ON "public"."ai_track_recommendations" USING "btree" ("spotify_track_id");



CREATE INDEX "ai_track_recommendations_user_plan_created_idx" ON "public"."ai_track_recommendations" USING "btree" ("user_id", "event_plan_id", "created_at" DESC);



CREATE INDEX "ai_track_recommendations_user_plan_expires_idx" ON "public"."ai_track_recommendations" USING "btree" ("user_id", "event_plan_id", "expires_at" DESC);



CREATE INDEX "dj_sessions_event_id_idx" ON "public"."dj_sessions" USING "btree" ("event_id");



CREATE INDEX "dj_sessions_user_id_idx" ON "public"."dj_sessions" USING "btree" ("user_id");



CREATE INDEX "event_plans_event_id_idx" ON "public"."event_plans" USING "btree" ("event_id");



CREATE INDEX "event_plans_user_id_idx" ON "public"."event_plans" USING "btree" ("user_id");



CREATE INDEX "events_event_date_idx" ON "public"."events" USING "btree" ("event_date");



CREATE INDEX "events_user_id_idx" ON "public"."events" USING "btree" ("user_id");



CREATE INDEX "queue_snapshots_created_at_idx" ON "public"."queue_snapshots" USING "btree" ("created_at" DESC);



CREATE INDEX "queue_snapshots_event_plan_id_idx" ON "public"."queue_snapshots" USING "btree" ("event_plan_id");



CREATE INDEX "queue_snapshots_user_id_idx" ON "public"."queue_snapshots" USING "btree" ("user_id");



CREATE INDEX "runtime_memory_audit_reversed_by_idx" ON "public"."runtime_memory_audit" USING "btree" ("reversed_by_audit_id");



CREATE INDEX "runtime_memory_audit_user_id_idx" ON "public"."runtime_memory_audit" USING "btree" ("user_id");



CREATE INDEX "session_activity_created_at_idx" ON "public"."session_activity" USING "btree" ("created_at" DESC);



CREATE INDEX "session_activity_session_id_idx" ON "public"."session_activity" USING "btree" ("session_id");



CREATE INDEX "spotify_cache_expires_at_idx" ON "public"."spotify_cache" USING "btree" ("expires_at");



CREATE INDEX "spotify_cache_user_id_idx" ON "public"."spotify_cache" USING "btree" ("user_id");



ALTER TABLE ONLY "public"."ai_track_recommendations"
    ADD CONSTRAINT "ai_track_recommendations_event_plan_id_fkey" FOREIGN KEY ("event_plan_id") REFERENCES "public"."event_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_track_recommendations"
    ADD CONSTRAINT "ai_track_recommendations_queue_snapshot_id_fkey" FOREIGN KEY ("queue_snapshot_id") REFERENCES "public"."queue_snapshots"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ai_track_recommendations"
    ADD CONSTRAINT "ai_track_recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dj_sessions"
    ADD CONSTRAINT "dj_sessions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dj_sessions"
    ADD CONSTRAINT "dj_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_plans"
    ADD CONSTRAINT "event_plans_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_plans"
    ADD CONSTRAINT "event_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."queue_snapshots"
    ADD CONSTRAINT "queue_snapshots_event_plan_id_fkey" FOREIGN KEY ("event_plan_id") REFERENCES "public"."event_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."queue_snapshots"
    ADD CONSTRAINT "queue_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."runtime_memory_audit"
    ADD CONSTRAINT "runtime_memory_audit_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_activity"
    ADD CONSTRAINT "session_activity_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."dj_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_activity"
    ADD CONSTRAINT "session_activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spotify_cache"
    ADD CONSTRAINT "spotify_cache_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spotify_connections"
    ADD CONSTRAINT "spotify_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can delete own AI track recommendations" ON "public"."ai_track_recommendations" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own AI track recommendations" ON "public"."ai_track_recommendations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own runtime memory audit" ON "public"."runtime_memory_audit" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own AI track recommendations" ON "public"."ai_track_recommendations" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own runtime memory audit" ON "public"."runtime_memory_audit" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own AI track recommendations" ON "public"."ai_track_recommendations" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."ai_track_recommendations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dj_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."queue_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."runtime_memory_audit" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_activity" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spotify_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spotify_connections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_can_delete_own_dj_sessions" ON "public"."dj_sessions" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_delete_own_event_plans" ON "public"."event_plans" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_delete_own_events" ON "public"."events" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_delete_own_queue_snapshots" ON "public"."queue_snapshots" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_delete_own_session_activity" ON "public"."session_activity" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_delete_own_spotify_cache" ON "public"."spotify_cache" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_delete_own_spotify_connections" ON "public"."spotify_connections" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_insert_own_dj_sessions" ON "public"."dj_sessions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_insert_own_event_plans" ON "public"."event_plans" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_insert_own_events" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_insert_own_queue_snapshots" ON "public"."queue_snapshots" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_insert_own_session_activity" ON "public"."session_activity" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_insert_own_spotify_cache" ON "public"."spotify_cache" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_insert_own_spotify_connections" ON "public"."spotify_connections" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_select_own_dj_sessions" ON "public"."dj_sessions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_select_own_event_plans" ON "public"."event_plans" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_select_own_events" ON "public"."events" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_select_own_queue_snapshots" ON "public"."queue_snapshots" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_select_own_session_activity" ON "public"."session_activity" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_select_own_spotify_cache" ON "public"."spotify_cache" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_select_own_spotify_connections" ON "public"."spotify_connections" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_update_own_dj_sessions" ON "public"."dj_sessions" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_update_own_event_plans" ON "public"."event_plans" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_update_own_events" ON "public"."events" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_update_own_queue_snapshots" ON "public"."queue_snapshots" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_update_own_session_activity" ON "public"."session_activity" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_update_own_spotify_cache" ON "public"."spotify_cache" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "users_can_update_own_spotify_connections" ON "public"."spotify_connections" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."ai_track_recommendations" TO "anon";
GRANT ALL ON TABLE "public"."ai_track_recommendations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_track_recommendations" TO "service_role";



GRANT ALL ON TABLE "public"."dj_sessions" TO "anon";
GRANT ALL ON TABLE "public"."dj_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."dj_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."event_plans" TO "anon";
GRANT ALL ON TABLE "public"."event_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."event_plans" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."queue_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."queue_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."queue_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."runtime_memory_audit" TO "anon";
GRANT ALL ON TABLE "public"."runtime_memory_audit" TO "authenticated";
GRANT ALL ON TABLE "public"."runtime_memory_audit" TO "service_role";



GRANT ALL ON TABLE "public"."session_activity" TO "anon";
GRANT ALL ON TABLE "public"."session_activity" TO "authenticated";
GRANT ALL ON TABLE "public"."session_activity" TO "service_role";



GRANT ALL ON TABLE "public"."spotify_cache" TO "anon";
GRANT ALL ON TABLE "public"."spotify_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."spotify_cache" TO "service_role";



GRANT ALL ON TABLE "public"."spotify_connections" TO "anon";
GRANT ALL ON TABLE "public"."spotify_connections" TO "authenticated";
GRANT ALL ON TABLE "public"."spotify_connections" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







