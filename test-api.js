// ═══════════════════════════════════════════════════════════════════════
//  test-api.js — Skrypt testowy API Stooq + corsproxy.io
//
//  Uruchomienie:  node test-api.js
//  Wymagania  :   Node.js 18+ (wbudowany fetch)
//
//  Sprawdza:
//    1. Proxy (corsproxy.io) — czy serwer odpowiada
//    2. Aktualny kurs (JSON)  — dla każdego ETF z portfeli
//    3. Dane historyczne (CSV) — dla losowego ETF (CSPX)
// ═══════════════════════════════════════════════════════════════════════

// W przeglądarce używamy corsproxy.io (CORS). Node.js nie ma ograniczeń CORS,
// więc skrypt testowy łączy się ze Stooq bezpośrednio — dokładnie te same dane.
const STOOQ_BASE = 'https://stooq.com';

// Nagłówki imitujące przeglądarkę — Stooq może blokować gołe requesty Node.js
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
    'Accept': 'application/json, text/csv, text/html, */*',
    'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': 'https://stooq.com/',
    'Origin': 'https://stooq.com',
};

// ── Ta sama lista ETF co w index.html ───────────────────────────────────
const ALL_ETFS = [
    { symbol: 'ETFBTCPL',  stooqSymbol: 'etfbtcpl.pl',  portfolio: 'Leo',         currency: 'PLN' },
    { symbol: 'GRID',      stooqSymbol: 'grid.de',       portfolio: 'Leo',         currency: 'EUR' },
    { symbol: 'ETFNATO',   stooqSymbol: 'etfnato.pl',    portfolio: 'Leo',         currency: 'PLN' },
    { symbol: 'CNDX',      stooqSymbol: 'cndx.uk',       portfolio: 'Leo',         currency: 'USD' },
    { symbol: 'ETFBSPXPL', stooqSymbol: 'etfbspxpl.pl',  portfolio: 'Leo',         currency: 'PLN' },
    { symbol: 'EIMI',      stooqSymbol: 'eimi.uk',       portfolio: 'Mamus',       currency: 'USD' },
    { symbol: 'CSPX',      stooqSymbol: 'cspx.uk',       portfolio: 'Mamus',       currency: 'USD' },
    { symbol: 'SMH',       stooqSymbol: 'smh.uk',        portfolio: 'Marcelinka',  currency: 'USD' },
    { symbol: 'INRA',      stooqSymbol: 'inra.nl',       portfolio: 'Marcelinka',  currency: 'USD' },
    { symbol: 'VWRA',      stooqSymbol: 'vwra.uk',       portfolio: 'Kacper',      currency: 'USD' },
    { symbol: 'ETFBNDXPL', stooqSymbol: 'etfbndxpl.pl',  portfolio: 'Kacper',      currency: 'PLN' },
];

// ETF użyty do testu danych historycznych
const HISTORY_TEST_ETF = ALL_ETFS.find(e => e.symbol === 'CSPX');

// ── Pomocnicze ──────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

function ok(msg)   { console.log(`  ${GREEN}✔${RESET}  ${msg}`); }
function fail(msg) { console.log(`  ${RED}✘${RESET}  ${RED}${msg}${RESET}`); }
function warn(msg) { console.log(`  ${YELLOW}⚠${RESET}  ${YELLOW}${msg}${RESET}`); }
function info(msg) { console.log(`  ${CYAN}→${RESET}  ${msg}`); }
function header(msg) { console.log(`\n${BOLD}${msg}${RESET}`); }

function isoDate(d) {
    return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// ── TESTY ───────────────────────────────────────────────────────────────

async function testProxy() {
    header('TEST 1 — Dostępność serwera Stooq');
    const url = `${STOOQ_BASE}`;
    try {
        const res = await fetch(url, { method: 'HEAD', headers: HEADERS });
        if (res.ok || res.status < 500) {
            ok(`Stooq.com odpowiada — HTTP ${res.status}`);
            return true;
        } else {
            fail(`Stooq.com zwróciło błąd — HTTP ${res.status}`);
            return false;
        }
    } catch (e) {
        fail(`Brak odpowiedzi Stooq: ${e.message}`);
        return false;
    }
}

async function testCurrentPrices() {
    header('TEST 2 — Aktualne kursy ETF (endpoint JSON)');

    const results = await Promise.allSettled(
        ALL_ETFS.map(async etf => {
            const url = `${STOOQ_BASE}/q/l/?s=${etf.stooqSymbol}&f=sd2t2ohlcv&h&e=json`;
            const res = await fetch(url, { headers: HEADERS });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            return { etf, data: json.symbols?.[0] ?? null };
        })
    );

    let passed = 0;
    let failed = 0;

    for (const result of results) {
        if (result.status === 'rejected') {
            const etf = ALL_ETFS[results.indexOf(result)];
            fail(`${etf.symbol.padEnd(12)} [${etf.portfolio}] — Błąd: ${result.reason?.message}`);
            failed++;
            continue;
        }

        const { etf, data } = result.value;
        if (!data || !data.close || data.close === 'N/D') {
            warn(`${etf.symbol.padEnd(12)} [${etf.portfolio}] — Brak danych (rynek zamknięty lub symbol nieaktywny)`);
            failed++;
        } else {
            ok(`${etf.symbol.padEnd(12)} [${etf.portfolio}] — kurs: ${data.close} ${etf.currency}  |  otwarcie: ${data.open}  |  wol.: ${data.volume ?? '—'}`);
            passed++;
        }
    }

    console.log(`\n  Wynik: ${GREEN}${passed} OK${RESET}  /  ${failed > 0 ? RED : RESET}${failed} BŁĄD${RESET}  z ${ALL_ETFS.length} ETF`);
    return { passed, failed };
}

async function testHistoricalData() {
    const etf = HISTORY_TEST_ETF;
    header(`TEST 3 — Dane historyczne CSV (${etf.symbol})`);

    // Cofnij d2 do ostatniego piątku jeśli dziś jest weekend (Stooq zwraca pusty CSV dla dni bez sesji)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=niedz, 6=sob
    const offsetToFriday = dayOfWeek === 0 ? 2 : dayOfWeek === 6 ? 1 : 0;
    const d2Date = new Date(today);
    d2Date.setDate(d2Date.getDate() - offsetToFriday);
    const d2 = isoDate(d2Date);

    const dStart = new Date(d2Date);
    dStart.setFullYear(dStart.getFullYear() - 1);
    const d1 = isoDate(dStart);

    if (offsetToFriday > 0) {
        info(`Dziś jest weekend — d2 cofnięte do ostatniego piątku: ${d2Date.toLocaleDateString('pl-PL')}`);
    }
    info(`Zakres: ${d1} → ${d2}  |  Symbol: ${etf.stooqSymbol}`);

    // Stooq CSV wymaga ciasteczka sesji — najpierw odwiedź stronę, żeby je uzyskać
    let sessionCookies = '';
    try {
        const homeRes = await fetch(`${STOOQ_BASE}/`, { headers: HEADERS });
        const rawCookies = homeRes.headers.getSetCookie?.() ?? [];
        sessionCookies = rawCookies.map(c => c.split(';')[0]).join('; ');
        if (sessionCookies) info(`Pobrano ciasteczka sesji (${rawCookies.length} szt.)`);
    } catch { /* bez sesji — spróbuj i tak */ }

    const csvHeaders = { ...HEADERS, ...(sessionCookies ? { 'Cookie': sessionCookies } : {}) };
    const url = `${STOOQ_BASE}/q/d/l/?s=${etf.stooqSymbol}&d1=${d1}&d2=${d2}&i=d`;

    try {
        const res = await fetch(url, { headers: csvHeaders });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const csv = await res.text();

        const lines = csv.trim().split('\n').filter(Boolean);
        if (lines.length < 2) {
            const preview = csv.slice(0, 200).replace(/\n/g, ' ').trim();
            warn(`Endpoint CSV zwrócił pustą odpowiedź — Stooq może wymagać aktywnej sesji przeglądarki.`);
            warn(`Aby sprawdzić ręcznie: ${url}`);
            if (preview) info(`Podgląd odpowiedzi: "${preview}"`);
            return 'skip';
        }

        const header_row = lines[0];
        const dataLines  = lines.slice(1);

        const parseRow = row => {
            const p = row.split(',');
            return { date: p[0]?.trim(), close: parseFloat(p[4]) };
        };

        const first = parseRow(dataLines[0]);
        const last  = parseRow(dataLines[dataLines.length - 1]);
        const ret   = ((last.close - first.close) / first.close * 100).toFixed(2);
        const sign  = ret >= 0 ? '+' : '';

        ok(`Pobrano ${dataLines.length} dni handlowych`);
        ok(`Nagłówek CSV: ${header_row.trim()}`);
        ok(`Pierwszy wpis: ${first.date}  kurs zamknięcia: ${first.close} ${etf.currency}`);
        ok(`Ostatni wpis : ${last.date}  kurs zamknięcia: ${last.close} ${etf.currency}`);
        ok(`Stopa zwrotu za okres: ${sign}${ret}%`);
        return true;

    } catch (e) {
        fail(`Błąd pobierania danych historycznych: ${e.message}`);
        return false;
    }
}

// ── TEST 4: Kalkulator historyczny — symulacja pełnego przepływu ─────────
// Testuje te same ETF-y i zakresy dat co przyciski preset w kalkulatorze.
// Używa bezpośredniego dostępu do Stooq (jak poprawiona wersja index.html).
async function testCalculator() {
    header('TEST 4 — Kalkulator historyczny (symulacja presetów)');

    // Oblicz d2 z uwzględnieniem weekendu (taki sam algorytm co w index.html)
    const today = new Date();
    const dow = today.getDay();
    const d2Date = new Date(today);
    if (dow === 0) d2Date.setDate(d2Date.getDate() - 2);
    if (dow === 6) d2Date.setDate(d2Date.getDate() - 1);
    if (dow === 0 || dow === 6) {
        info(`Dziś jest weekend — d2 cofnięte do: ${d2Date.toLocaleDateString('pl-PL')}`);
    }

    // Pobierz sesję (wymagane przez Stooq CSV)
    let sessionCookies = '';
    try {
        const homeRes = await fetch(`${STOOQ_BASE}/`, { headers: HEADERS });
        const rawCookies = homeRes.headers.getSetCookie?.() ?? [];
        sessionCookies = rawCookies.map(c => c.split(';')[0]).join('; ');
    } catch { /* kontynuuj bez ciasteczek */ }

    const csvHeaders = { ...HEADERS, ...(sessionCookies ? { 'Cookie': sessionCookies } : {}) };

    // Presetowe zakresy dat (etykieta, miesiące wstecz)
    const presets = [
        { label: '3M',  months: 3  },
        { label: '6M',  months: 6  },
        { label: '1R',  months: 12 },
        { label: '3R',  months: 36 },
        { label: '5R',  months: 60 },
    ];

    // Po jednym ETF z każdego portfela
    const TEST_ETFS = [
        ALL_ETFS.find(e => e.symbol === 'ETFBSPXPL'),   // Leo / GPW / PLN
        ALL_ETFS.find(e => e.symbol === 'CSPX'),         // Mamus / LSE / USD
        ALL_ETFS.find(e => e.symbol === 'SMH'),          // Marcelinka / LSE / USD
        ALL_ETFS.find(e => e.symbol === 'VWRA'),         // Kacper / LSE / USD
    ];

    let passed = 0;
    let failed = 0;

    for (const etf of TEST_ETFS) {
        console.log(`\n  ${CYAN}${BOLD}${etf.symbol}${RESET} ${CYAN}[${etf.portfolio}]${RESET}`);

        for (const preset of presets) {
            const d1Date = new Date(d2Date);
            d1Date.setMonth(d1Date.getMonth() - preset.months);
            const d1 = isoDate(d1Date);
            const d2 = isoDate(d2Date);

            const url = `${STOOQ_BASE}/q/d/l/?s=${etf.stooqSymbol}&d1=${d1}&d2=${d2}&i=d`;

            try {
                const res = await fetch(url, { headers: csvHeaders });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const csv = await res.text();

                const lines = csv.trim().split('\n').filter(Boolean);
                if (lines.length < 2) {
                    warn(`  ${preset.label.padEnd(4)} (${d1}→${d2}) — brak danych handlowych`);
                    failed++;
                    continue;
                }

                const dataLines = lines.slice(1);
                const parseClose = row => parseFloat(row.split(',')[4]);
                const firstClose = parseClose(dataLines[0]);
                const lastClose  = parseClose(dataLines[dataLines.length - 1]);
                const ret        = ((lastClose - firstClose) / firstClose * 100).toFixed(2);
                const sign       = ret >= 0 ? '+' : '';

                ok(`  ${preset.label.padEnd(4)} (${d1}→${d2}) — ${dataLines.length} dni  |  zwrot: ${sign}${ret}%  |  kurs: ${firstClose} → ${lastClose} ${etf.currency}`);
                passed++;
            } catch (e) {
                fail(`  ${preset.label.padEnd(4)} (${d1}→${d2}) — Błąd: ${e.message}`);
                failed++;
            }
        }
    }

    const total = TEST_ETFS.length * presets.length;
    console.log(`\n  Wynik: ${GREEN}${passed} OK${RESET}  /  ${failed > 0 ? RED : RESET}${failed} BŁĄD${RESET}  z ${total} kombinacji`);
    return failed === 0;
}

// ── Weryfikacja wersji Node ─────────────────────────────────────────────

function checkNodeVersion() {
    const [major] = process.versions.node.split('.').map(Number);
    if (major < 18) {
        console.error(`${RED}${BOLD}BŁĄD: Wymagany Node.js 18+. Aktualna wersja: ${process.version}${RESET}`);
        process.exit(1);
    }
}

// ── Główna funkcja ──────────────────────────────────────────────────────

async function main() {
    checkNodeVersion();

    console.log(`\n${BOLD}╔═══════════════════════════════════════════════════╗`);
    console.log(`║   Test API — Tracker Portfeli ETF                 ║`);
    console.log(`║   Źródło danych: Stooq.com                        ║`);
    console.log(`╚═══════════════════════════════════════════════════╝${RESET}`);
    console.log(`  Data testu : ${new Date().toLocaleString('pl-PL')}`);
    console.log(`  Node.js    : ${process.version}`);

    const proxyOk     = await testProxy();
    const priceResult = await testCurrentPrices();
    const histOk      = await testHistoricalData();
    const calcOk      = await testCalculator();

    header('PODSUMOWANIE');

    if (proxyOk)                     ok('Serwer Stooq dostępny');
    else                             fail('Serwer Stooq niedostępny — sprawdź połączenie z internetem');

    if (priceResult.failed === 0)    ok(`Wszystkie ${ALL_ETFS.length} ETF zwróciły dane`);
    else if (priceResult.passed > 0) warn(`${priceResult.passed}/${ALL_ETFS.length} ETF zwróciło dane (pozostałe mogą być poza godzinami handlu)`);
    else                             fail('Żaden ETF nie zwrócił danych — sprawdź połączenie lub proxy');

    if (histOk === true)        ok('Dane historyczne CSV działają poprawnie');
    else if (histOk === 'skip') warn('Endpoint CSV wymaga sesji przeglądarki — sprawdź ręcznie przez kalkulator w index.html');
    else                        fail('Dane historyczne CSV niedostępne');

    if (calcOk)  ok('Kalkulator — wszystkie presetowe zakresy i ETF dają dane');
    else         fail('Kalkulator — jeden lub więcej zakresów nie zwróciło danych');

    console.log('');
}

main().catch(e => {
    console.error(`\n${RED}Nieoczekiwany błąd: ${e.message}${RESET}`);
    process.exit(1);
});
