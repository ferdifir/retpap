ALTER TABLE "photos" ADD COLUMN "media_type" text DEFAULT 'photo' NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "poster_url" text;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "media_type" text DEFAULT 'photo' NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "thumbnail_file_id" text;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_media_type_valid" CHECK ("photos"."media_type" in ('photo', 'video'));--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_duration_range" CHECK ("photos"."duration_seconds" is null or "photos"."duration_seconds" between 1 and 30);--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_media_type_valid" CHECK ("upload_sessions"."media_type" in ('photo', 'video'));--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_duration_range" CHECK ("upload_sessions"."duration_seconds" is null or "upload_sessions"."duration_seconds" between 1 and 30);