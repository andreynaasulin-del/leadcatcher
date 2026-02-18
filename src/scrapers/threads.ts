import { chromium } from 'playwright';
import { CONFIG } from '../config';
import { RawLead } from '../models';
import { safeLog } from '../privacy';

const THREADS_QUERIES = [
    'займ на бизнес москва',
    'ищу частного инвестора',
    'инвестиции в мой проект',
    'деньги под процент срочно',
    'банки не дают кредит ипотеку',
    'кто поможет с наличными',
    'займ под залог недвижимости',
    'срочно куплю бизнес в долг',
    'проблемы с кредитной историей что делать',
    'нужны оборотные средства',
];

export async function scrapeThreads(): Promise<RawLead[]> {
    const browser = await chromium.launch({ headless: CONFIG.HEADLESS });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        locale: 'ru-RU',
    });

    const page = await context.newPage();
    const leads: RawLead[] = [];

    try {
        safeLog('[Threads] Starting scrape cycle...');

        for (const query of THREADS_QUERIES) {
            try {
                safeLog(`[Threads] Searching: "${query}"`);
                const searchUrl = `https://www.threads.net/search?q=${encodeURIComponent(query)}`;

                await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
                await page.waitForTimeout(5000 + Math.random() * 2000);

                // Try to scroll to load more
                for (let i = 0; i < 3; i++) {
                    await page.mouse.wheel(0, 1000);
                    await page.waitForTimeout(1500);
                }

                // Robust extraction: looking for common post containers or just all text if needed
                const posts = await page.locator('article, div[role="none"], div[data-testid="post-content"]').all();
                safeLog(`[Threads] Found ${posts.length} potential post containers`);

                for (const post of posts) {
                    const text = await post.innerText().catch(() => '');
                    const lowerText = text.toLowerCase();

                    // Relaxed filter for all money/intent signals
                    const hasIntent =
                        lowerText.includes('кредит') ||
                        lowerText.includes('ипотек') ||
                        lowerText.includes('деньги') ||
                        lowerText.includes('бизнес') ||
                        lowerText.includes('инвест') ||
                        lowerText.includes('займ') ||
                        lowerText.includes('долг') ||
                        lowerText.includes('наличи');

                    if (text.length > 40 && hasIntent) {
                        leads.push({
                            source: 'threads',
                            source_lead_id: `threads_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                            raw_text: text.trim(),
                            phone: null,
                            region: null,
                            url: searchUrl,
                            scraped_at: new Date().toISOString(),
                        });
                    }
                }

                if (leads.length === 0) {
                    // Last resort: grab all long strings from any block
                    const textBlocks = await page.locator('div, span, p').allInnerTexts();
                    const heavyBlocks = textBlocks.filter(t => t.length > 80 && (t.includes('ипотек') || t.includes('кредит') || t.includes('бизнес')));
                    for (const text of [...new Set(heavyBlocks)].slice(0, 10)) {
                        leads.push({
                            source: 'threads',
                            source_lead_id: `threads_raw_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                            raw_text: text.trim(),
                            phone: null,
                            region: null,
                            url: searchUrl,
                            scraped_at: new Date().toISOString(),
                        });
                    }
                }

                await page.waitForTimeout(2000);
            } catch (e: any) {
                console.error(`[Threads] Error on query "${query}":`, e.message);
            }
        }
    } catch (err: any) {
        console.error('[Threads] Global error:', err);
    } finally {
        await browser.close();
    }

    return leads;
}
