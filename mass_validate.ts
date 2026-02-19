import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { CONFIG } from './src/config';
import * as fs from 'fs';

const HUGE_LIST = [
    // --- Business & Networking ---
    'biznes_RRF', 'biznesdvigmoskva', 'biznesdvigspb', 'bizneschat_spb', 'predprinimateli_club',
    'business_vopros', 'networking_online', 'vse_o_nalogah', 'biznes_chat_moscow', 'biznes_spb',
    'networking_msk', 'networking_spb', 'networking_rf', 'business_networking_ru',
    'delovoy_format', 'biznes_svyazi', 'tceh_chat', 'skolkovo_community', 'bm_chat',
    'like_family', 'molodoy_predprinimatel', 'biznes_lyudi', 'svoi_lyudi_bz', 'ne_tvor_king',
    'networking_biz', 'biz_chat_ru', 'predprinimatel_ru', 'club_500_chat', 'atlanty_chat',

    // --- Real Estate (Target for Mortgage/Credit) ---
    'nedvizmo', 'nedvizo_spb', 'ugnest_spb', 'nedvizhimost_v_moskve', 'novostroyki_ekb',
    'spb_nedviga', 'arendamsk', 'realtor_chat_moscow', 'rieltory_rossii', 'ipoteka_vopros',
    'ipotekachat', 'vseogipoteke', 'novostroyki_msk', 'kvartira_v_moskve', 'kuplyu_kvartiru',
    'invest_nedvizhimost', 'nedviga_invest', 'arendaspb', 'nedviga_spb', 'cian_chat',
    'avito_nedvizhimost', 'piter_nedvig', 'moskva_nedvig', 'nedvizhimost_rf', 'dom_klik',

    // --- Business Buy/Sell & Franchise ---
    'kuplyu_biznes', 'prodazha_biznesa', 'biznes_doska', 'franchise_chat', 'franshizy_ru',
    'gotoviy_biznes', 'invest_proekty', 'startup_pitch_ru', 'prodazha_biznesa_msk',
    'doska_obyavleniy_biznes', 'biznes_broker', 'partnerstvo_biznes', 'investicii_biznes',

    // --- Finance & Investments ---
    'markettwits', 'InvestProfit2019', 'million_fonda', 'MoneyHack', 'limon_na_chay',
    'invest_na_divane', 'finsid', 'investrbank', 'finam_alert', 'sveta_economy',
    'cryptomarket_ru', 'trading_ru', 'finance_chat', 'investory_rossii', 'dividend_chat',
    'invest_talk', 'pro_dengi', 'fin_gramota', 'akcii_ru', 'fondovy_rynok',

    // --- Freight & Transport (Cash Flow Demand) ---
    'gruzoperevozki_rf', 'perevozki_msk', 'fura_chat', 'logistika_ru', 'perevozki_spb',
    'avtoperevozchiki', 'gruz_chat', 'logist_club', 'perevozchik_ru', 'transport_rf',

    // --- Regional Business Hubs ---
    'biznes_kazan', 'biznes_ekb', 'biznes_sochi', 'biznes_krd', 'biznes_nsk',
    'biznes_nn', 'biznes_ufa', 'biznes_tmn', 'biznes_vladivostok', 'biznes_voronezh',

    // --- Networking Patterns (Brute Scan) ---
    'networkingmsk', 'networkingspb', 'networkingrf', 'biznes_moskva', 'biznes_piter',
    'pro_biznes', 'svoybiznes', 'startupmsk', 'startupspb', 'investmsk', 'investspb',
    'realtormsk', 'realtorspb', 'ipotechniy_broker', 'kredi_broker', 'pomosh_v_kredite',
    'vzyat_v_dolg', 'dengi_v_dolg', 'chastnyy_zaim', 'zaim_msk', 'zaim_spb'
];

async function massValidate() {
    const session = new StringSession(CONFIG.TELEGRAM_SESSION);
    const client = new TelegramClient(session, CONFIG.TELEGRAM_API_ID, CONFIG.TELEGRAM_API_HASH, {});
    await client.connect();

    const valid: string[] = [];
    console.log(`Starting mass validation of ${HUGE_LIST.length} chats...`);

    for (const chat of HUGE_LIST) {
        try {
            await client.getEntity(chat);
            console.log(`✅ ${chat}`);
            valid.push(chat);
        } catch (e) {
            // console.log(`❌ ${chat}`);
        }
    }

    await client.disconnect();

    if (valid.length > 0) {
        const envPath = './.env';
        let env = fs.readFileSync(envPath, 'utf8');
        const newList = valid.join(',');
        env = env.replace(/TELEGRAM_CHATS=.*/, `TELEGRAM_CHATS=${newList}`);
        fs.writeFileSync(envPath, env);
        console.log(`\n🔥 Success! Found ${valid.length} valid chats out of ${HUGE_LIST.length}.`);
        console.log(`Updated .env with the new list.`);
    }
}

massValidate();
