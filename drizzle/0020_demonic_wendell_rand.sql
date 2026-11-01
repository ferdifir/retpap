ALTER TABLE "drawings" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "is_anonymous" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "drawings" ADD COLUMN "shared_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "drawings_shared_idx" ON "drawings" USING btree ("photo_id","visibility");--> statement-breakpoint
ALTER TABLE "drawings" ADD CONSTRAINT "drawings_visibility_valid" CHECK ("drawings"."visibility" in ('private', 'feed'));