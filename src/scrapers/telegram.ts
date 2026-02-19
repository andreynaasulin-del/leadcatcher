import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import { CONFIG } from '../config';
import { RawLead } from '../models';
import { safeLog } from '../privacy';

// Russian keywords for credit/mortgage intent detection
const INTENT_KEYWORDS = [
    // --- Direct Credit/Loans ---
    'ипотек', 'ипотечн', 'первоначальн', 'первый взнос', 'первоначалка', 'рефинанс',
    'автокредит', 'лизинг', 'потребительск', 'нужен кредит', 'нужны деньги', 'займ',
    'кредитн карт', 'рассрочк', 'кредитни', 'кредитовани', 'микрозайм', 'деньги до зарплаты',
    'кредит наличными', 'деньги на руки', 'взять в долг', 'деньги под процент',
    'под низкий процент', 'снизить ставку', 'перекредитоваться', 'кредитка', 'кредитные каникулы',
    'кредитная линия', 'кредитный лимит', 'экспресс-кредит', 'кредит без отказа',
    'взять лям', 'нужен нал', 'деньги мигом', 'кредит за 1 час', 'помогите с кредитом',

    // --- Business Pain Points (The "Gold" Leads) ---
    'кассовый разрыв', 'оборотные средства', 'оборотка', 'ликвидность', 'закупка товара',
    'деньги на товар', 'средства на закупку', 'деньги на проект', 'инвестиции в бизнес',
    'нужен инвестор', 'ищу инвестора', 'финансирование бизнеса', 'кредит для ип',
    'кредит для ооо', 'кредит на развитие', 'тендерный займ', 'факторинг', 'овердрафт',
    'лимит по счету', 'блокировка счета', '115-фз', 'налоги бизнес', 'зарплатный проект',
    'средства на зарплату', 'масштабирование', 'открытие точки', 'франшиза', 'купить франшизу',
    'оборудование в лизинг', 'спецтехника в кредит', 'коммерческая недвижимость',
    'пополнение оборотных', 'кредитование бизнеса', 'займ ип', 'деньги ооо', 'инвестпроект',
    'стартап инвестиции', 'нужен капитал', 'привлечение инвестиций', 'финансовая помощь бизнесу',
    'госзакупка кредит', 'исполнение контракта', 'деньги на контракт', 'бизнес ангел',

    // --- Real Estate & Property (Indirect Demand) ---
    'выкуп доли', 'срочный выкуп', 'обременение', 'залог недвижимости', 'под залог',
    'деньги под залог', 'переуступка', 'дду', 'новостройка', 'вторичка',
    'материнский капитал', 'военная ипотека', 'сельская ипотека', 'it ипотека',
    'семейная ипотека', 'господдержка', 'субсидированная ставка', 'риелтор', 'брокер',
    'одобрение ипотеки', 'плохая ки', 'кредитная история', 'просрочки', 'суды с банками',
    'банкротство', 'списание долгов', 'приставы', 'фссп', 'арест имущества',
    'оценка недвижимости', 'страховка ипотека', 'рефинансирование ипотеки',
    'как купить без денег', 'ипотека без первого взноса', 'ипотека по двум документам',
    'залог квартиры', 'залог дома', 'выкуп из-под залога', 'снятие обременения',

    // --- Specific Bank Rejections (Aggressive Broker Leads) ---
    'банк отказ', 'не одобрил', 'отказали', 'сбер отказ', 'втб отказ', 'тинькофф отказ',
    'альфа отказ', 'газпромбанк отказ', 'открытие отказ', 'совкомбанк отказ', 'райффайзен отказ',
    'росбанк отказ', 'мкб отказ', 'псб отказ', 'почта банк отказ', 'дом.рф отказ',
    'не дают кредит', 'где взять кредит если не одобряют', 'черный список банков',
    'отказ по скорингу', 'стоп-лист', 'плохая кредитная история', 'помогите очистить ки',
    'банк заблокировал', 'счета заблокированы', 'отказ по 115фз',

    // --- Indirect Intent & Advise Seekers ---
    'подскажите', 'посоветуйте', 'кто поможет', 'реально ли', 'как получить',
    'какие шансы', 'что делать', 'есть смысл', 'кто сталкивался', 'поделитесь опытом',
    'нужна консультация', 'ищу специалиста', 'нужен профи', 'помощь в получении',
    'юрист по кредитам', 'финансовый советник', 'кредитный эксперт', 'финансовый брокер',
    'в какой банк пойти', 'где одобрят', 'проверенные брокеры', 'брокер по ипотеке',

    // --- Amount & Urgency Signals ---
    'млн', 'миллион', 'рублей', 'тысяч', 'лям', 'арбуз', 'кэш', 'наличка',
    'срочно', 'горит', 'вчера', 'сегодня', 'быстро', 'без справок', 'без поручителей',
    'без подтверждения дохода', 'белая зарплата', 'серая зарплата', 'черная зарплата',
    'нужно 100к', 'нужно 500к', 'нужен 1 млн', 'нужно 5 млн', 'нужно 10 млн', 'нужно 50 млн',
];

const NEGATIVE_KEYWORDS = [
    // Advertising & Sales (Junk)
    'подписывайтесь', 'канал', 'реклама', 'предлагаю', 'оформлю', 'делаю',
    'гарантия', 'без предоплаты', 'напишите в лс', 'личку', 'вступай',
    'продам', 'купли', 'сотрудничество', 'выплата', 'комиссия за',
    'курсы', 'обучаю', 'бесплатно', 'акция', 'розыгрыш', 'скидка',
    'накрутка', 'продвижение', 'инвестируй', 'доход', 'crypto', 'крипта',
    'trading', 'сигналы', 'обучение', 'вакансия', 'ищу работу', 'резюме',
    'удаленка', 'заработок', 'майнинг', 'арбитраж', 'ставки', 'казино',
    'прогнозы', 'порно', 'знакомства', 'секс', 'вип', 'премиум доступ',

    // Broker Ads (The "Other Side")
    'поможем получить', 'одобрим за час', 'гарантируем одобрение',
    'работаем с любой ки', 'лучшие условия у нас', 'пишите нам',
    'наши услуги', 'наша комиссия', 'честная работа', 'без обмана',
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
    if (emojiCount > 10) return false; // Increased from 5 to 10

    // 4. Check for positive signals
    const hasIntent = INTENT_KEYWORDS.some(kw => lower.includes(kw));

    if (hasIntent) {
        safeLog(`[TG DEBUG] Match found, but checking length/emojis: Len=${text.length}, Emojis=${emojiCount}`);
    }

    return hasIntent;
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

    const requestedChats = CONFIG.TELEGRAM_CHATS;
    const validChats: any[] = [];

    safeLog(`[TG] Validating ${requestedChats.length} chats...`);
    for (const username of requestedChats) {
        try {
            const entity = await client.getEntity(username);
            validChats.push(entity);
            safeLog(`[TG] Monitoring enabled for: ${username}`);
        } catch (e: any) {
            safeLog(`[TG] Warning: Could not resolve chat "${username}": ${e.message}`);
        }
    }

    if (validChats.length === 0 && requestedChats.length > 0) {
        safeLog('[TG] Error: No valid chats found to monitor. Real-time monitoring will not start.');
        return;
    }

    const chatPeers: any[] = [];
    for (const entity of validChats) {
        if ((entity as any).id) {
            chatPeers.push((entity as any).id);
        }
    }

    client.addEventHandler(async (event: any) => {
        try {
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
        } catch (e: any) {
            safeLog(`[TG] Event Handler Error: ${e.message}`);
        }
    }, new NewMessage({ chats: chatPeers.length > 0 ? chatPeers : undefined }));
}

export async function disconnectTelegram(): Promise<void> {
    if (client) {
        await client.disconnect();
        client = null;
    }
}
