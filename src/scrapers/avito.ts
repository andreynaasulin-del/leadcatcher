import { chromium } from 'playwright';
import { CONFIG } from '../config';
import { RawLead } from '../models';
import { safeLog } from '../privacy';

// Avito search URLs targeting distress/high-intent situations
const AVITO_SEARCHES = [
    {
        url: 'https://www.avito.ru/moskva/predlozheniya_uslug/biznes/konsultirovanie-ASgBAgICA0SMC76XAQ?q=кредит+на+бизнес',
        label: 'Деньги на бизнес',
    },
    {
        url: 'https://www.avito.ru/moskva/gotoviy_biznes/prodam-ASgBAgICAUSyA9IQ?q=срочно+деньги',
        label: 'Продажа бизнеса (срочно)',
    },
    {
        url: 'https://www.avito.ru/moskva/kvartiry/prodam-ASgBAgICAUSSA8YQ?q=срочно+нужны+деньги',
        label: 'Срочники Недвижка',
    },
    {
        url: 'https://www.avito.ru/moskva/avtomobili?q=деньги+под+залог',
        label: 'Авто под залог',
    },
    {
        url: 'https://www.avito.ru/moskva?q=нужен+инвестор',
        label: 'Поиск инвестора/партнера',
    },
    {
        url: 'https://www.avito.ru/moskva/predlozheniya_uslug/finansovye_uslugi-ASgBAgICAURYnAI?q=помощь+в+кредитовании',
        label: 'Прямые запросы на помощь',
    }
];

const INTENT_PATTERNS = [
    /срочн/i, /ипотек/i, /кредит/i, /рассрочк/i, /первоначальн/i,
    /обмен/i, /материнск.*капитал/i, /субсид/i, /банк.*отказ/i,
    /нужны деньги/i, /помощь.*кредит/i, /брокер/i, /одобрен/i,
];

function getRandomProxy(): string | undefined {
    if (CONFIG.PROXY_LIST.length === 0) return undefined;
    return CONFIG.PROXY_LIST[Math.floor(Math.random() * CONFIG.PROXY_LIST.length)];
}

function parseProxyUrl(proxyUrl: string): { server: string; username?: string; password?: string } {
    const url = new URL(proxyUrl);
    return {
        server: `${url.protocol}//${url.hostname}:${url.port}`,
        username: url.username || undefined,
        password: url.password || undefined,
    };
}

export async function scrapeAvito(): Promise<RawLead[]> {
    const proxyUrl = getRandomProxy();
    const launchOptions: any = { headless: CONFIG.HEADLESS };

    if (proxyUrl) {
        const proxy = parseProxyUrl(proxyUrl);
        launchOptions.proxy = proxy;
        safeLog(`[Avito] Using proxy: ${proxy.server}`);
    }

    const browser = await chromium.launch(launchOptions);
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        locale: 'ru-RU',
    });

    const page = await context.newPage();
    const leads: RawLead[] = [];

    try {
        for (const search of AVITO_SEARCHES) {
            try {
                safeLog(`[Avito] Scraping: ${search.label}`);
                await page.goto(search.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(6000);

                // Check for block
                const bodyText = await page.textContent('body').catch(() => '');
                if (bodyText?.includes('Доступ временно ограничен') || bodyText?.includes('робот')) {
                    safeLog(`[Avito] BLOCKED or CAPTCHA detected on "${search.label}"`);
                    continue;
                }

                // Scroll to trigger lazy loading
                await page.evaluate(() => window.scrollBy(0, 1500));
                await page.waitForTimeout(2000);

                const items = await page.locator('[data-marker="item"]').all();
                safeLog(`[Avito] Found ${items.length} listings for "${search.label}"`);

                for (const item of items.slice(0, 40)) {
                    try {
                        const titleEl = item.locator('[data-marker="item-title"], [itemprop="name"], h3');
                        const title = await titleEl.first().textContent().catch(() => '') || '';

                        const priceEl = item.locator('[data-marker="item-price"], [itemprop="price"]');
                        const price = await priceEl.first().textContent().catch(() => '') || '';

                        const descEl = item.locator('[class*="description"], [data-marker="item-description"]');
                        const desc = await descEl.first().textContent().catch(() => '') || '';

                        const linkEl = item.locator('a[data-marker="item-title"], a[itemprop="url"]').first();
                        const href = await linkEl.getAttribute('href').catch(() => '') || '';
                        if (!href) continue;

                        const itemUrl = href.startsWith('http') ? href : `https://www.avito.ru${href}`;
                        const combinedText = `${title} ${desc} ${price}`.toLowerCase();

                        // Relaxed match for intent or specific urgent labels
                        const idMatch = href.match(/_(\d+)$/);
                        const itemId = idMatch ? idMatch[1] : `avito_${Date.now()}`;

                        leads.push({
                            source: 'avito',
                            source_lead_id: itemId,
                            raw_text: `[${search.label}] ${title}\nЦена: ${price}\n${desc}`,
                            phone: null,
                            region: 'Москва',
                            url: itemUrl,
                            scraped_at: new Date().toISOString(),
                        });
                    } catch (itemErr) {
                        // ignore item error
                    }
                }

                // Pace between categories
                await page.waitForTimeout(2000 + Math.random() * 3000);
            } catch (catErr) {
                safeLog(`[Avito] Category error: ${search.label}`);
            }
        }
    } finally {
        await browser.close();
    }

    safeLog(`[Avito] Total leads scraped: ${leads.length}`);
    return leads;
}
