ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_valid";--> statement-breakpoint
ALTER TABLE "photos" DROP COLUMN "last_digest_at";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_valid" CHECK ("notifications"."kind" in ('comment', 'rating', 'reaction'));