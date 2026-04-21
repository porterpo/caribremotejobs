CREATE TABLE "analytics_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"job_id" integer,
	"user_id" text,
	"has_resume" boolean,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
