ALTER TABLE "photos" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gender_preference" text;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_gender_valid" CHECK ("photos"."gender" is null or "photos"."gender" in ('female', 'male'));--> statement-breakpoint
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_gender_valid" CHECK ("upload_sessions"."gender" is null or "upload_sessions"."gender" in ('female', 'male'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_gender_preference_valid" CHECK ("users"."gender_preference" is null or "users"."gender_preference" in ('female', 'male', 'all'));