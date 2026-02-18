import { chromium } from 'playwright';
import { CONFIG } from '../config';
import { RawLead } from '../models';
import { safeLog } from '../privacy';

const VK_QUERIES = [
    'нужны деньги срочно',
    'помогите с кредитом',
    'ищу инвестора для бизнеса',
    'отказали в ипотеке',
    'деньги под залог квартиры',
];

export async function scrapeVK(): Promise<RawLead[]> {
    const browser = await chromium.launch({ headless: CONFIG.HEADLESS });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1' });
    const page = await context.newPage();
    const leads: RawLead[] = [];

    try {
        for (const query of VK_QUERIES) {
            safeLog(`[VK] Searching: ${query}`);
            const searchUrl = `https://m.vk.com/search?c[section]=statuses&q=${encodeURIComponent(query)}`;
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(4000);

            const items = await page.locator('.SearchItem').all();
            safeLog(`[VK] Found ${items.length} posts for "${query}"`);

            for (const item of items) {
                const text = await item.innerText();
                if (text.length > 30) {
                    leads.push({
                        source: 'vk',
                        source_lead_id: `vk_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                        raw_text: text,
                        phone: null,
                        region: null,
                        url: searchUrl,
                        scraped_at: new Date().toISOString(),
                    });
                }
            }
        }
    } catch (e) {
        safeLog('[VK] Scrape error');
    } finally {
        await browser.close();
    }
    return leads;
}
