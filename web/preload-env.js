/**
 * preload-env.js — Loaded via Node's --import flag BEFORE any other ESM module.
 * This ensures process.env is populated from .env before any import runs.
 */
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });
