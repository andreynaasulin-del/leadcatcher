import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Api } from 'telegram/tl';
import { CONFIG } from './src/config';
import { RawLead, CreditLead } from './src/models';
import { processRawLead } from './src/ai';
import { scoreLead } from './src/scoring';
import { upsertLead, loadStore, saveStore } from './src/store';
import { generateDashboard } from './src/reprocess';
import { safeLog } from './src/privacy';

// Рециклинг существующих функций из Telegram модуля 
function extractPhone(text: string): string | null {
    const match = text.match(/(\+?[78])[\s\-]?\(?(\d{3})\)?[\s\-]?(\d{3})[\s\-]?(\d{2})[\s\-]?(\d{2})/);
    return match ? match[0].replace(/[\s\-\(\)]/g, '') : null;
}

const regionMap: Record<string, string> = {
    'москва': 'Москва', 'мск': 'Москва',
    'спб': 'Санкт-Петербург', 'питер': 'Санкт-Петербург',
    'казань': 'Казань', 'екатеринбург': 'Екатеринбург',
};

function extractRegion(text: string): string | null {
    const lower = text.toLowerCase();
    for (const [key, value] of Object.entries(regionMap)) {
        if (lower.includes(key)) return value;
    }
    return null;
}

const INTENT_KEYWORDS = [
    'ипотек', 'кредит', 'займ', 'нужны деньги', 'кассовый разрыв',
    'оборотные средства', 'оборотка', 'инвестор', 'банк отказ', 'отказали'
];

function hasIntentSignal(text: string): boolean {
    const lower = text.toLowerCase();
    if (text.length < 15) return false;
    return INTENT_KEYWORDS.some(kw => lower.includes(kw));
}

async function runHistoryScrape() {
    safeLog('=== [TG HISTORY] Starting scrape for last 7 days ===');

    const session = new StringSession(CONFIG.TELEGRAM_SESSION);
    const client = new TelegramClient(session, CONFIG.TELEGRAM_API_ID, CONFIG.TELEGRAM_API_HASH, {
        connectionRetries: 5,
    });

    await client.connect();

    const store = loadStore();
    const now = Math.floor(Date.now() / 1000);
    const sevenDaysAgo = now - (7 * 24 * 60 * 60);

    const chats = CONFIG.TELEGRAM_CHATS;
    let totalFound = 0;

    for (const username of chats) {
        try {
            safeLog(`[TG HISTORY] Checking ${username}...`);
            // Получаем сообщения (getMessages по умолчанию берет последние)
            const messages = await client.getMessages(username, {
                limit: 100,
            });

            for (const msg of messages) {
                // msg.date - это timestamp
                if (!msg.text || msg.date < sevenDaysAgo) continue;

                if (hasIntentSignal(msg.text)) {
                    const uniqueKey = `telegram:${msg.chatId}_${msg.id}`;

                    // Проверяем дубликаты
                    if (store.leads.some((l: CreditLead) => l.unique_key === uniqueKey)) continue;

                    safeLog(`[TG HISTORY] Found intent in ${username}: ${msg.text.substring(0, 50)}...`);

                    const rawLead: RawLead = {
                        source: 'telegram',
                        source_lead_id: `${msg.chatId}_${msg.id}`,
                        raw_text: msg.text,
                        phone: extractPhone(msg.text),
                        region: extractRegion(msg.text),
                        url: `https://t.me/${username}/${msg.id}`,
                        scraped_at: new Date(msg.date * 1000).toISOString(),
                        chat_name: username,
                    };

                    const processed = await processRawLead(rawLead);
                    if (processed.intent_type === 'junk') {
                        continue;
                    }

                    const scored = scoreLead(processed);
                    upsertLead(store, scored);
                    totalFound++;
                }
            }
        } catch (e: any) {
            safeLog(`[TG HISTORY] Error in ${username}: ${e.message}`);
        }
    }

    if (totalFound > 0) {
        saveStore(store);
        await generateDashboard(store);
        safeLog(`=== [TG HISTORY] Done! Added ${totalFound} historical leads ===`);
    } else {
        safeLog('=== [TG HISTORY] No new historical leads found ===');
    }

    await client.disconnect();
}

runHistoryScrape().catch(console.error);
