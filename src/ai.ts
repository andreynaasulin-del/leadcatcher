import OpenAI from 'openai';
import { CONFIG } from './config';
import { RawLead, CreditLead, IntentType } from './models';
import { maskPhone } from './privacy';

const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });

interface AIExtractionResult {
    intent_type: string;
    amount: string | null;
    region: string | null;
    urgency: number;
    pain_points: string[];
    name: string;
    summary: string;
    suggested_response: string;
}

export async function processRawLead(raw: RawLead): Promise<CreditLead> {
    const prompt = `
Ты - Старший AI-Архитектор и CPO SaaS-платформы "TrendSynthesis". 
Твоя цель: ВЫЖАТЬ ВСЕ ДЕНЬГИ из этого сообщения ($$$). Если человек пишет про нужду в деньгах, недвижке, бизнесе или долгах - это наш "клиент".

Будь агрессивным, циничным реалистом. Мы не благотворительность. 

Анализируй лид:
Источник: ${raw.source}
Текст: "${raw.raw_text}"
Регион: ${raw.region || 'не указан'}

Извлеки строго JSON:
1. intent_type: "mortgage" | "auto" | "business" | "consumer" | "refinance" | "unknown"
2. amount: максимальная сумма, которую можно "продать" или "выдать" (например "50 млн руб").
3. region: город.
4. urgency: 1-10. СТАВЬ 10 ТЕМ, КТО В ОТЧАЯНИИ (срочно, долги, отказ, обременение).
5. pain_points: боли. Ключевые слова: "срочно нужны деньги", "отказ в банках", "нужны оборотные средства".
6. name: имя (или "Клиент").
7. summary: 1 фраза. Почему мы на нем заработаем?
8. suggested_response: УЛЬТРА-АГРЕССИВНЫЙ ОФФЕР. Никаких "Здравствуйте, мы рады". Сразу в лоб: "Вижу проблему с деньгами под бизнес. Решим за 24 часа. Платите комиссию только по факту. Пишите в WhatsApp прямо сейчас."

ТОЛЬКО JSON. Никаких пояснений.
`;

    try {
        const response = await openai.chat.completions.create({
            model: CONFIG.OPENAI_MODEL,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.3,
        });

        const result: AIExtractionResult = JSON.parse(response.choices[0].message.content || '{}');
        const uniqueKey = `${raw.source}:${raw.source_lead_id}`;

        const validIntents: IntentType[] = ['mortgage', 'auto', 'business', 'consumer', 'refinance', 'unknown'];
        const intentType: IntentType = validIntents.includes(result.intent_type as IntentType)
            ? (result.intent_type as IntentType)
            : 'unknown';

        return {
            unique_key: uniqueKey,
            source: raw.source,
            source_lead_id: raw.source_lead_id,
            name: result.name || 'Unknown',
            phone: raw.phone,
            phone_masked: maskPhone(raw.phone),
            intent_type: intentType,
            amount: result.amount || null,
            region: result.region || raw.region,
            urgency: Math.min(10, Math.max(1, result.urgency || 5)),
            pain_points: result.pain_points || [],
            ai_summary: result.summary || '',
            suggested_response: result.suggested_response || '',
            score: 0,
            status: 'new',
            trust_level: 5,
            raw_text: raw.raw_text,
            url: raw.url,
            chat_name: raw.chat_name,
            scraped_at: raw.scraped_at,
            processed_at: new Date().toISOString(),
            last_activity: new Date().toISOString(),
        };
    } catch (e) {
        console.error('[AI] Processing error:', e);
        return {
            unique_key: `${raw.source}:${raw.source_lead_id}`,
            source: raw.source,
            source_lead_id: raw.source_lead_id,
            name: 'Unknown',
            phone: raw.phone,
            phone_masked: maskPhone(raw.phone),
            intent_type: 'unknown',
            amount: null,
            region: raw.region,
            urgency: 5,
            pain_points: [],
            ai_summary: 'AI processing failed',
            suggested_response: '',
            score: 0,
            status: 'new',
            trust_level: 3,
            raw_text: raw.raw_text,
            url: raw.url,
            chat_name: raw.chat_name,
            scraped_at: raw.scraped_at,
            processed_at: new Date().toISOString(),
            last_activity: new Date().toISOString(),
        };
    }
}
