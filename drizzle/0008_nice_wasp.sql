ALTER TABLE "photos" DROP CONSTRAINT "photos_duration_range";--> statement-breakpoint
ALTER TABLE "upload_sessions" DROP CONSTRAINT "upload_sessions_duration_range";--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_duration_range" CHECK ("photos"."duration_seconds" is null or "photos"."duration_seconds" between 1 and 60);--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_duration_range" CHECK ("upload_sessions"."duration_seconds" is null or "upload_sessions"."duration_seconds" between 1 and 60);