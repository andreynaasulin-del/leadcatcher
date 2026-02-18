/**
 * Masks a phone number for logging purposes.
 * "+79161234567" -> "+7***4567"
 * "89161234567"  -> "8***4567"
 */
export function maskPhone(phone: string | null): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return '***';

    const prefix = phone.startsWith('+') ? '+' : '';
    const firstDigit = digits[0];
    const lastFour = digits.slice(-4);
    return `${prefix}${firstDigit}***${lastFour}`;
}

/**
 * Sanitizes text for logging — removes phone numbers.
 */
export function sanitizeForLog(text: string): string {
    return text.replace(
        /(\+?[78])[\s\-]?\(?(\d{3})\)?[\s\-]?(\d{3})[\s\-]?(\d{2})[\s\-]?(\d{2})/g,
        (_, prefix) => `${prefix}***XXXX`
    );
}

/**
 * Safe console.log that masks phones in any string argument.
 */
export function safeLog(...args: any[]): void {
    const sanitized = args.map(arg =>
        typeof arg === 'string' ? sanitizeForLog(arg) : arg
    );
    console.log(...sanitized);
}
