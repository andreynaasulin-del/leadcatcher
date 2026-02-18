import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import { CONFIG } from '../config';
import { RawLead } from '../models';
import { safeLog } from '../privacy';

// Russian keywords for credit/mortgage intent detection
const INTENT_KEYWORDS = [
    // Request patterns
    'подскажите', 'посоветуйте', 'кто поможет', 'реально ли', 'как получить',
    'под какой процент', 'какие шансы', 'что делать', 'отказ',
    // Mortgage
    'ипотек', 'ипотечн', 'первоначальн', 'первый взнос',
    'рефинанс', 'банк отказ', 'одобрен',
    // Auto credit
    'автокредит', 'кредит на авто', 'машин в кредит', 'лизинг',
    // Business credit
    'кредит для бизнес', 'кредит ип', 'кредит ооо', 'бизнес кредит',
    'оборотн', 'займ для бизнес',
    // Rejection signals
    'банк отказал', 'не одобрил', 'отказали в кредит',
    'сбер отказ', 'втб отказ', 'тинькофф отказ', 'альфа отказ',
];

const NEGATIVE_KEYWORDS = [
    'подписывайтесь', 'канал', 'реклама', 'предлагаю', 'оформлю', 'делаю',
    'гарантия', 'без предоплаты', 'напишите в лс', 'личку', 'вступай',
    'продам', 'купли', 'сотрудничество', 'выплата', 'комиссия за',
    'курсы', 'обучаю', 'бесплатно', 'акция', 'розыгрыш', 'скидка',
    'накрутка', 'продвижение', 'инвестируй', 'доход', 'crypto', 'крипта',
    'trading', 'сигналы', 'обучение',
];

let client: TelegramClient | null = null;

function extractPhone(text: string): string | null {
    const match = text.match(/(\+?[78])[\s\-]?\(?(\d{3})\)?[\s\-]?(\d{3})[\s\-]?(\d{2})[\s\-]?(\d{2})/);
    if (match) {
        return match[0].replace(/[\s\-\(\)]/g, '');
    }
    return null;
}

function extractRegion(text: string): string | null {
    const regionMap: Record<string, string> = {
        'москва': 'Москва', 'мск': 'Москва',
        'спб': 'Санкт-Петербург', 'петербург': 'Санкт-Петербург', 'питер': 'Санкт-Петербург',
        'казань': 'Казань', 'екатеринбург': 'Екатеринбург', 'екб': 'Екатеринбург',
        'сочи': 'Сочи', 'краснодар': 'Краснодар', 'новосибирск': 'Новосибирск',
        'ростов': 'Ростов-на-Дону', 'уфа': 'Уфа', 'самара': 'Самара',
        'нижний': 'Нижний Новгород', 'воронеж': 'Воронеж', 'красноярск': 'Красноярск',
    };
    const lower = text.toLowerCase();
    for (const [key, value] of Object.entries(regionMap)) {
        if (lower.includes(key)) return value;
    }
    return null;
}

function hasIntentSignal(text: string): boolean {
    const lower = text.toLowerCase();

    // 1. Check for negative signals (filter out ads/junk)
    if (NEGATIVE_KEYWORDS.some(kw => lower.includes(kw))) return false;

    // 2. Minimum length (too short = no value)
    if (text.length < 15) return false;

    // 3. Filter out messages that look like broker ads (too many emojis or links)
    const emojiCount = (text.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || []).length;
    if (emojiCount > 5) return false;

    // 4. Check for positive signals
    return INTENT_KEYWORDS.some(kw => lower.includes(kw));
}

export async function initTelegram(): Promise<TelegramClient> {
    if (!CONFIG.TELEGRAM_API_ID || !CONFIG.TELEGRAM_API_HASH) {
        throw new Error('Telegram credentials not configured');
    }

    const session = new StringSession(CONFIG.TELEGRAM_SESSION);
    client = new TelegramClient(session, CONFIG.TELEGRAM_API_ID, CONFIG.TELEGRAM_API_HASH, {
        connectionRetries: 5,
    });

    await client.start({
        phoneNumber: async () => CONFIG.TELEGRAM_PHONE,
        password: async () => {
            const input = require('input');
            return await input.text('Enter 2FA Password (if any, else leave empty): ');
        },
        phoneCode: async () => {
            const input = require('input');
            return await input.text('Enter Telegram code: ');
        },
        onError: (err: Error) => console.error('[TG] Auth Error:', err),
    });

    // Save session for future re-use
    const sessionString = client.session.save() as unknown as string;
    safeLog('[TG] Connected. Session string (save to TELEGRAM_SESSION in .env):');
    safeLog(sessionString);

    return client;
}

export async function startRealtimeMonitor(
    onNewLead: (lead: RawLead) => void
): Promise<void> {
    if (!client) throw new Error('Telegram client not initialized. Call initTelegram() first.');

    const chatIds = CONFIG.TELEGRAM_CHATS;
    safeLog(`[TG] Monitoring ${chatIds.length} chats for credit intent...`);

    client.addEventHandler(async (event: any) => {
        const message = event.message;
        if (!message || !message.text) return;

        const text: string = message.text;
        if (!hasIntentSignal(text)) return;

        const chatId = message.chatId?.toString() || '';

        let chatName = 'Unknown Chat';
        try {
            const chat = await message.getChat();
            chatName = (chat as any).title || (chat as any).username || chatName;
        } catch { }

        const lead: RawLead = {
            source: 'telegram',
            source_lead_id: `${chatId}_${message.id}`,
            raw_text: text,
            phone: extractPhone(text),
            region: extractRegion(text),
            url: `https://t.me/${chatName.replace(/\s/g, '_')}/${message.id}`,
            scraped_at: new Date().toISOString(),
            chat_name: chatName,
        };

        safeLog(`[TG] Intent detected in ${chatName}: "${text.substring(0, 80)}..."`);
        onNewLead(lead);
    }, new NewMessage({ chats: chatIds.length > 0 ? chatIds : undefined }));
}

export async function disconnectTelegram(): Promise<void> {
    if (client) {
        await client.disconnect();
        client = null;
    }
}
