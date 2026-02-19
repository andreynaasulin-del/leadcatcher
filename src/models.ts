import { z } from 'zod';

// === Enums ===
export const IntentType = z.enum(['mortgage', 'auto', 'business', 'consumer', 'refinance', 'unknown', 'junk']);
export type IntentType = z.infer<typeof IntentType>;

export const LeadStatus = z.enum(['new', 'processing', 'hot', 'rejected', 'contacted']);
export type LeadStatus = z.infer<typeof LeadStatus>;

export const LeadSource = z.enum(['telegram', 'avito', 'maps', 'threads', 'vk', 'google']);
export type LeadSource = z.infer<typeof LeadSource>;

// === Raw Lead (from scrapers, before AI processing) ===
export const RawLeadSchema = z.object({
    source: LeadSource,
    source_lead_id: z.string(),
    raw_text: z.string(),
    phone: z.string().nullable().default(null),
    region: z.string().nullable().default(null),
    url: z.string().default(''),
    scraped_at: z.string().default(() => new Date().toISOString()),
    chat_name: z.string().optional(),
});
export type RawLead = z.infer<typeof RawLeadSchema>;

// === Processed Lead (after AI + scoring) ===
export const CreditLeadSchema = z.object({
    // Identity
    unique_key: z.string(),
    source: LeadSource,
    source_lead_id: z.string(),

    // Contact
    name: z.string().default('Unknown'),
    phone: z.string().nullable().default(null),
    phone_masked: z.string().nullable().default(null),

    // Intent extracted by AI
    intent_type: IntentType,
    amount: z.string().nullable().default(null),
    region: z.string().nullable().default(null),
    urgency: z.number().min(1).max(10).default(5),
    pain_points: z.array(z.string()).default([]),

    // AI output
    ai_summary: z.string().default(''),
    suggested_response: z.string().default(''),

    // Scoring
    score: z.number().min(0).max(100).default(0),
    status: LeadStatus.default('new'),
    trust_level: z.number().min(0).max(10).default(5),

    // Metadata
    raw_text: z.string(),
    url: z.string().default(''),
    chat_name: z.string().optional(),
    scraped_at: z.string(),
    processed_at: z.string().default(() => new Date().toISOString()),
    last_activity: z.string().default(() => new Date().toISOString()),
});
export type CreditLead = z.infer<typeof CreditLeadSchema>;

// === Store shape ===
export const LeadStoreSchema = z.object({
    leads: z.array(CreditLeadSchema),
    last_updated: z.string(),
    stats: z.object({
        total: z.number(),
        hot: z.number(),
        new_today: z.number(),
    }),
});
export type LeadStore = z.infer<typeof LeadStoreSchema>;
