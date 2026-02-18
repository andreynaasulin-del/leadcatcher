import * as fs from 'fs';
import { CreditLead, LeadStore } from './models';

const LEADS_PATH = './leads.json';

export function loadStore(): LeadStore {
    if (!fs.existsSync(LEADS_PATH)) {
        return {
            leads: [],
            last_updated: new Date().toISOString(),
            stats: { total: 0, hot: 0, new_today: 0 },
        };
    }
    const raw = JSON.parse(fs.readFileSync(LEADS_PATH, 'utf8'));
    return raw as LeadStore;
}

export function saveStore(store: LeadStore): void {
    store.last_updated = new Date().toISOString();
    const todayStr = new Date().toDateString();
    store.stats = {
        total: store.leads.length,
        hot: store.leads.filter(l => l.status === 'hot').length,
        new_today: store.leads.filter(l => new Date(l.scraped_at).toDateString() === todayStr).length,
    };
    fs.writeFileSync(LEADS_PATH, JSON.stringify(store, null, 2));
}

export function upsertLead(store: LeadStore, lead: CreditLead): boolean {
    const idx = store.leads.findIndex(l => l.unique_key === lead.unique_key);
    if (idx >= 0) {
        store.leads[idx] = {
            ...store.leads[idx],
            ...lead,
            score: Math.max(store.leads[idx].score, lead.score),
            last_activity: new Date().toISOString(),
        };
        return false;
    }
    store.leads.push(lead);
    return true;
}

export function findDuplicate(store: LeadStore, uniqueKey: string): CreditLead | undefined {
    return store.leads.find(l => l.unique_key === uniqueKey);
}
