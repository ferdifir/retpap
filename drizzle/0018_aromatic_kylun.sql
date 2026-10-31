ALTER TABLE "reactions" DROP CONSTRAINT "reactions_photo_user";--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_spot_user" UNIQUE("spot_id","user_id");