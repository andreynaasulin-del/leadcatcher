import { chromium } from 'playwright';

async function debug() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const query = 'займ на бизнес москва';
    const url = `https://www.threads.net/search?q=${encodeURIComponent(query)}`;

    console.log(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);

    const content = await page.content();
    const text = await page.textContent('body');

    console.log('HTML Length:', content.length);
    console.log('Body Text includes "кредит":', text?.toLowerCase().includes('кредит'));
    console.log('Body Text snippet:', text?.slice(0, 500));

    await browser.close();
}

debug();
