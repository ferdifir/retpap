CREATE TABLE "upload_sessions" (
	"telegram_id" bigint PRIMARY KEY NOT NULL,
	"step" text NOT NULL,
	"file_id" text,
	"image_width" integer,
	"image_height" integer,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_sessions_step_valid" CHECK ("upload_sessions"."step" in ('photo', 'caption', 'confirm'))
);
