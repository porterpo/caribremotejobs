CREATE TABLE "resumes" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"summary" text,
	"experience" jsonb DEFAULT '[]'::jsonb,
	"education" jsonb DEFAULT '[]'::jsonb,
	"skills" text[] DEFAULT '{}'::text[],
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resumes_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
