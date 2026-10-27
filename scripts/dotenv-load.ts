import { config } from "dotenv";

config({ path: process.env.DOTENV_PATH ?? ".env.local" });
