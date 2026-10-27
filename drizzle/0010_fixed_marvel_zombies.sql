ALTER TABLE "photos" ADD COLUMN "is_nsfw" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "is_nsfw" boolean;