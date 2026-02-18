import { initTelegram, startRealtimeMonitor, disconnectTelegram } from './scrapers/telegram';
import { scrapeAvito } from './scrapers/avito';
import { scrapeMaps } from './scrapers/maps';
import { scrapeThreads } from './scrapers/threads';
import { scrapeVK } from './scrapers/vk';
import { processRawLead } from './ai';
import { scoreLead } from './scoring';
import { loadStore, saveStore, upsertLead, findDuplicate } from './store';
import { generateDashboard } from './reprocess';
import { RawLead } from './models';
import { safeLog } from './privacy';
import { CONFIG } from './config';

import { scrapeGoogle } from './scrapers/google';

const MAPS_INTERVAL = 30 * 60000;
const AVITO_INTERVAL = 20 * 60000;
const THREADS_INTERVAL = 60 * 60000;
const VK_INTERVAL = 15 * 60000;
const GOOGLE_INTERVAL = 40 * 60000;

async function runGoogleCycle(): Promise<void> {
    safeLog('\n=== [Google] Starting scrape cycle ===');
    try {
        const leads = await scrapeGoogle();
        const newCount = await processAndStore(leads);
        safeLog(`[Google] Cycle complete. ${newCount} new leads.`);
    } catch (e) {
        console.error('[Google] Cycle error:', e);
    }
}

const MAPS_OFFSET = 10 * 60 * 1000;
const THREADS_OFFSET = 45 * 60 * 1000;
const VK_OFFSET = 5 * 60 * 1000;

async function processAndStore(rawLeads: RawLead[]): Promise<number> {
    const store = loadStore();
    let newCount = 0;

    for (const raw of rawLeads) {
        const uniqueKey = `${raw.source}:${raw.source_lead_id}`;

        if (findDuplicate(store, uniqueKey)) {
            safeLog(`[Skip] Duplicate: ${uniqueKey}`);
            continue;
        }

        safeLog(`[AI] Processing lead from ${raw.source}...`);
        const processed = await processRawLead(raw);
        const scored = scoreLead(processed);
        const isNew = upsertLead(store, scored);

        if (isNew) newCount++;

        if (scored.status === 'hot') {
            safeLog(`[HOT LEAD] ${scored.intent_type} | ${scored.amount || 'no amount'} | Score: ${scored.score} | ${scored.name}`);
        }
    }

    if (newCount > 0) {
        saveStore(store);
        await generateDashboard(store);
        safeLog(`[Dashboard] Regenerated. +${newCount} new leads. Total: ${store.leads.length}`);
    }

    return newCount;
}

async function runAvitoCycle(): Promise<void> {
    safeLog('\n=== [Avito] Starting scrape cycle ===');
    try {
        const leads = await scrapeAvito();
        const newCount = await processAndStore(leads);
        safeLog(`[Avito] Cycle complete. ${newCount} new leads.`);
    } catch (e) {
        console.error('[Avito] Cycle error:', e);
    }
}

async function runMapsCycle(): Promise<void> {
    safeLog('\n=== [Maps] Starting scrape cycle ===');
    try {
        const leads = await scrapeMaps();
        const newCount = await processAndStore(leads);
        safeLog(`[Maps] Cycle complete. ${newCount} new leads.`);
    } catch (e) {
        console.error('[Maps] Cycle error:', e);
    }
}

async function runThreadsCycle(): Promise<void> {
    safeLog('\n=== [Threads] Starting scrape cycle ===');
    try {
        const leads = await scrapeThreads();
        const newCount = await processAndStore(leads);
        safeLog(`[Threads] Cycle complete. ${newCount} new leads.`);
    } catch (e) {
        console.error('[Threads] Cycle error:', e);
    }
}

async function runVKCycle(): Promise<void> {
    safeLog('\n=== [VK] Starting scrape cycle ===');
    try {
        const leads = await scrapeVK();
        const newCount = await processAndStore(leads);
        safeLog(`[VK] Cycle complete. ${newCount} new leads.`);
    } catch (e) {
        console.error('[VK] Cycle error:', e);
    }
}

async function main(): Promise<void> {
    safeLog('=== Credit Lead Aggregator Engine ===');
    safeLog(`Started: ${new Date().toISOString()}`);
    safeLog(`Regions: ${CONFIG.TARGET_REGIONS.join(', ')}`);

    // 1. Initialize Telegram (real-time) — only if configured
    const hasTelegram = CONFIG.TELEGRAM_API_ID && CONFIG.TELEGRAM_API_HASH && CONFIG.TELEGRAM_PHONE;

    if (hasTelegram) {
        try {
            await initTelegram();
            await startRealtimeMonitor(async (rawLead: RawLead) => {
                safeLog(`[TG] New intent lead received`);
                await processAndStore([rawLead]);
            });
            safeLog('[TG] Real-time monitor active.');
        } catch (e) {
            console.error('[TG] Failed to start Telegram monitor:', e);
            safeLog('[TG] Continuing without Telegram...');
        }
    } else {
        safeLog('[TG] Skipped — no Telegram credentials in .env');
    }


    // 2. Run Avito immediately
    // 3. Run Threads immediately (parallel)
    // 4. Run VK immediately
    // 5. Run Google search immediately
    await Promise.all([
        runAvitoCycle(),
        runThreadsCycle(),
        runVKCycle(),
        runGoogleCycle(),
    ]);

    // Set intervals
    const avitoTimer = setInterval(runAvitoCycle, AVITO_INTERVAL);
    const threadsTimer = setInterval(runThreadsCycle, THREADS_INTERVAL);
    const vkTimer = setInterval(runVKCycle, VK_INTERVAL);
    const googleTimer = setInterval(runGoogleCycle, GOOGLE_INTERVAL);

    // 4. Maps disabled as requested
    /*
    const mapsStartTimer = setTimeout(async () => {
        await runMapsCycle();
        setInterval(runMapsCycle, MAPS_INTERVAL);
    }, MAPS_OFFSET);
    */

    safeLog('\n=== Engine running ===');
    safeLog(`Telegram: real-time active`);
    safeLog(`Avito: every ${AVITO_INTERVAL / 60000}min`);
    safeLog(`Maps: disabled`);
    safeLog(`Threads: every ${THREADS_INTERVAL / 60000}min`);
    safeLog(`VK: every ${VK_INTERVAL / 60000}min`);
    safeLog(`Google Search: every ${GOOGLE_INTERVAL / 60000}min`);
    safeLog('Press Ctrl+C to stop.\n');

    // Graceful shutdown
    process.on('SIGINT', async () => {
        safeLog('\n=== Shutting down ===');
        clearInterval(avitoTimer);
        clearInterval(threadsTimer);
        clearInterval(vkTimer);
        clearInterval(googleTimer);
        await disconnectTelegram();
        process.exit(0);
    });
}

main().catch(console.error);
