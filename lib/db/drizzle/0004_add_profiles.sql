CREATE TABLE "profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"clerk_user_id" text NOT NULL,
	"display_name" text,
	"headline" text,
	"location" text,
	"bio" text,
	"linkedin_url" text,
	"website_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
