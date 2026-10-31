ALTER TABLE "comments" ADD COLUMN "is_anonymous" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "anonymous" boolean DEFAULT false NOT NULL;