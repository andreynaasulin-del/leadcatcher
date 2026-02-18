import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const envSchema = z.object({
    // OpenAI
    OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required in .env'),
    OPENAI_MODEL: z.string().default('gpt-4o'),

    // Browser
    HEADLESS: z.string().default('true').transform(val => val.toLowerCase() === 'true'),
    MAX_CONCURRENT_PAGES: z.string().default('5').transform(val => parseInt(val, 10)),
    SCROLL_COUNT: z.string().default('5').transform(val => parseInt(val, 10)),

    // Telegram (optional — app can run without TG)
    TELEGRAM_API_ID: z.string().default('').transform(val => val ? parseInt(val, 10) : 0),
    TELEGRAM_API_HASH: z.string().default(''),
    TELEGRAM_PHONE: z.string().default(''),
    TELEGRAM_SESSION: z.string().default(''),
    TELEGRAM_CHATS: z.string().default('').transform(val =>
        val.split(',').map(s => s.trim()).filter(Boolean)
    ),

    // Proxy rotation for Avito (comma-separated)
    PROXY_LIST: z.string().default('').transform(val =>
        val.split(',').map(s => s.trim()).filter(Boolean)
    ),

    // Target regions
    TARGET_REGIONS: z.string()
        .default('Москва,Санкт-Петербург,Казань,Екатеринбург,Сочи')
        .transform(val => val.split(',').map(s => s.trim()).filter(Boolean)),

    // Broker WhatsApp number
    BROKER_WHATSAPP: z.string().default(''),
});

export const CONFIG = envSchema.parse(process.env);
