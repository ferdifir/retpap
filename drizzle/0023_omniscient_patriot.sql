ALTER TABLE "upload_sessions" DROP CONSTRAINT "upload_sessions_step_valid";--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "scheduled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "channel_post_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "channel_post_claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "channel_post_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "channel_post_error" text;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_channel_post_status_valid" CHECK ("photos"."channel_post_status" in ('idle', 'pending', 'sending', 'sent'));--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_step_valid" CHECK ("upload_sessions"."step" in ('photo', 'caption', 'confirm', 'schedule'));