import { chromium } from 'playwright';
import { CONFIG } from '../config';
import { RawLead } from '../models';
import { safeLog } from '../privacy';

// Search queries targeting businesses that need financial products
const MAPS_QUERIES = [
    'выкуп недвижимости москва',
    'срочный выкуп авто',
    'ломбард недвижимости',
    'автоломбард москва',
    'деньги под залог птс',
    'кредитный брокер помощь',
    'ипотека с плохой КИ',
    'микрозаймы для бизнеса',
    'потребительские кооперативы',
];

export async function scrapeMaps(): Promise<RawLead[]> {
    const browser = await chromium.launch({ headless: CONFIG.HEADLESS });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    const leads: RawLead[] = [];

    // Limit per run to avoid long scraping sessions
    const regionsToScrape = CONFIG.TARGET_REGIONS.slice(0, 3);
    const queriesToRun = MAPS_QUERIES.slice(0, 4);

    for (const region of regionsToScrape) {
        for (const baseQuery of queriesToRun) {
            const query = `${baseQuery} ${region}`;
            try {
                safeLog(`[Maps] Searching: "${query}"`);
                await page.goto(
                    `https://www.google.com/maps/search/${encodeURIComponent(query)}`,
                    { waitUntil: 'domcontentloaded', timeout: 20000 }
                );
                await page.waitForTimeout(4000);

                // Scroll feed
                const feedSelector = 'div[role="feed"]';
                try {
                    await page.waitForSelector(feedSelector, { timeout: 8000 });
                } catch {
                    safeLog(`[Maps] No feed for "${query}", skipping`);
                    continue;
                }

                for (let i = 0; i < CONFIG.SCROLL_COUNT; i++) {
                    await page.evaluate((sel) => {
                        const el = document.querySelector(sel);
                        if (el) el.scrollTop = el.scrollHeight;
                    }, feedSelector);
                    await page.waitForTimeout(1500);
                }

                // Collect place URLs
                const anchorElements = await page.locator(`${feedSelector} a[href*="/maps/place/"]`).all();
                const uniquePlaceUrls = new Set<string>();
                for (const anchor of anchorElements) {
                    const href = await anchor.getAttribute('href');
                    if (href) uniquePlaceUrls.add(href.split('?')[0]);
                }

                safeLog(`[Maps] Found ${uniquePlaceUrls.size} places for "${query}"`);
                const targetUrls = Array.from(uniquePlaceUrls).slice(0, 15);

                // Visit each place
                for (const url of targetUrls) {
                    try {
                        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

                        // Name
                        let name = 'Unknown';
                        try {
                            await page.waitForSelector('h1', { timeout: 5000 });
                            name = (await page.locator('h1').first().textContent()) || 'Unknown';
                        } catch { }

                        // Phone
                        const phoneBtn = page.locator('button[data-item-id^="phone:tel:"]').first();
                        let phone: string | null = null;
                        if (await phoneBtn.count() > 0) {
                            const rawPhone = await phoneBtn.getAttribute('data-item-id');
                            if (rawPhone) {
                                phone = rawPhone.replace('phone:tel:', '').replace(/\D/g, '');
                                if (phone && !phone.startsWith('7') && !phone.startsWith('8')) {
                                    phone = null; // Skip non-Russian numbers
                                }
                            }
                        }

                        // Rating & Reviews
                        let rating = '0';
                        let reviewCount = '0';
                        const starEl = page.locator('span[aria-label*=" stars "][aria-label*=" Reviews"]').first();
                        if (await starEl.count() > 0) {
                            const aria = await starEl.getAttribute('aria-label');
                            if (aria) {
                                const parts = aria.split(' stars ');
                                if (parts.length > 0) rating = parts[0].trim();
                                if (parts.length > 1) reviewCount = parts[1].replace(/reviews|Reviews/g, '').trim().replace(/,/g, '');
                            }
                        }

                        // Only collect leads with phone numbers (usable for broker)
                        if (!phone) continue;

                        leads.push({
                            source: 'maps',
                            source_lead_id: phone,
                            raw_text: `Бизнес: ${name}\nРегион: ${region}\nРейтинг: ${rating}\nОтзывы: ${reviewCount}`,
                            phone,
                            region,
                            url: page.url(),
                            scraped_at: new Date().toISOString(),
                        });
                    } catch { }
                }

                await page.waitForTimeout(2000 + Math.random() * 2000);
            } catch (e: any) {
                safeLog(`[Maps] Error on "${query}":`, e.message);
            }
        }
    }

    await browser.close();
    safeLog(`[Maps] Total leads: ${leads.length}`);
    return leads;
}
