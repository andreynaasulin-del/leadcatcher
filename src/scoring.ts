import { CreditLead, LeadStatus } from './models';

export function scoreLead(lead: CreditLead): CreditLead {
    let points = 0;

    // 1. Intent type
    if (lead.intent_type === 'mortgage' || lead.intent_type === 'refinance') {
        points += 25;
    } else if (lead.intent_type === 'business') {
        points += 20;
    } else if (lead.intent_type === 'auto') {
        points += 15;
    } else if (lead.intent_type === 'consumer') {
        points += 10;
    }

    // 2. Specific amount mentioned
    if (lead.amount) {
        points += 15;
        const numMatch = lead.amount.replace(/\s/g, '').match(/(\d+)/);
        if (numMatch && parseInt(numMatch[1]) >= 1000000) {
            points += 10;
        }
    }

    // 3. Bank rejection mentioned (ideal broker client)
    const rawLower = lead.raw_text.toLowerCase();
    const rejectionKeywords = ['отказ', 'отказал', 'не одобрил', 'сбер', 'втб', 'тинькофф', 'альфа'];
    if (rejectionKeywords.some(kw => rawLower.includes(kw))) {
        points += 30; // Increased weight for rejections
    }

    // 4. Request patterns (asking for advice)
    const requestKeywords = ['подскажите', 'посоветуйте', 'кто поможет', 'реально ли', 'как получить'];
    if (requestKeywords.some(kw => rawLower.includes(kw))) {
        points += 20;
    }

    // 5. Phone available
    if (lead.phone) {
        points += 15;
    }

    // 6. Urgency from AI
    if (lead.urgency >= 8) {
        points += 15;
    }

    // 7. Source trust (Telegram is gold for real-time requests)
    if (lead.source === 'telegram') {
        points += 10;
    }

    const totalScore = Math.min(100, points);

    // Determine status - Tighten thresholds
    let status: LeadStatus = 'new';
    if (totalScore >= 70) { // Was 60
        status = 'hot';
    } else if (totalScore >= 40) { // Was 30
        status = 'processing';
    } else if (lead.intent_type === 'unknown' && totalScore < 15) {
        status = 'rejected';
    }

    // Trust level
    let trustLevel = 5;
    if (lead.phone) trustLevel += 2;
    if (lead.amount) trustLevel += 1;
    if (lead.source === 'telegram') trustLevel += 1;
    if (lead.pain_points.length > 0) trustLevel += 1;
    trustLevel = Math.min(10, trustLevel);

    return {
        ...lead,
        score: totalScore,
        status,
        trust_level: trustLevel,
    };
}
