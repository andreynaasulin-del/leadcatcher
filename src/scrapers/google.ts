import { chromium } from 'playwright';
import { CONFIG } from '../config';
import { RawLead } from '../models';
import { safeLog } from '../privacy';

const GOOGLE_QUERIES = [
    'site:vk.com "нужны деньги срочно"',
    'site:threads.net "посоветуйте кредитного брокера"',
    'site:avito.ru "срочно деньги" москва',
    'форум "не дают кредит" 2024',
    'заявка на кредит бизнес москва',
];

export async function scrapeGoogle(): Promise<RawLead[]> {
    const browser = await chromium.launch({ headless: CONFIG.HEADLESS });
    const page = await browser.newPage();
    const leads: RawLead[] = [];

    try {
        for (const query of GOOGLE_QUERIES) {
            safeLog(`[Google] Searching: ${query}`);
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(3000);

            const items = await page.locator('#search .g').all();
            safeLog(`[Google] Found ${items.length} snippets for "${query}"`);

            for (const item of items) {
                const text = await item.innerText();
                const link = await item.locator('a').first().getAttribute('href').catch(() => '');

                if (text.length > 50) {
                    leads.push({
                        source: 'google',
                        source_lead_id: `google_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                        raw_text: text,
                        phone: null,
                        region: null,
                        url: link || searchUrl,
                        scraped_at: new Date().toISOString(),
                    });
                }
            }
        }
    } catch (e) {
        safeLog('[Google] Scrape error');
    } finally {
        await browser.close();
    }
    return leads;
}
