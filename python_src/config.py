import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Calculate env path relative to src/config.ts
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required in .env"),
  HEADLESS: z.string().default("true").transform((val) => val.toLowerCase() === "true"),
  MAX_CONCURRENT_PAGES: z.string().default("5").transform((val) => parseInt(val, 10)),
  SCROLL_COUNT: z.string().default("10").transform((val) => parseInt(val, 10))
});

export const CONFIG = envSchema.parse(process.env);
