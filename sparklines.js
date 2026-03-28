// sparklines.js — Per-ETF mini performance charts (Od 01.01.2026 → dziś)
// Requires: Chart.js loaded before this file, ALL_ETFS defined in index.html

const SPARK_START  = '20260101';
const sparkCache   = {};   // etfId → [{date, close}]
const sparkCharts  = {};   // etfId → Chart instance

function parseSparkCSV(csv) {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return [];
    return lines.slice(1)
        .map(line => {
            const parts = line.split(',');
            return { date: (parts[0] || '').trim(), close: parseFloat(parts[4]) };
        })
        .filter(r => r.date && !isNaN(r.close));
}

function drawSparkline(etfId, rows) {
    if (!rows || rows.length < 2) return;
    const canvas = document.getElementById('spark-' + etfId);
    if (!canvas) return;
    if (sparkCharts[etfId]) { sparkCharts[etfId].destroy(); delete sparkCharts[etfId]; }

    const closes = rows.map(r => r.close);
    const isUp   = closes[closes.length - 1] >= closes[0];
    const color  = isUp ? '#10b981' : '#ef4444';
    const ctx    = canvas.getContext('2d');
    const h      = (canvas.parentElement && canvas.parentElement.clientHeight) || 60;
    const grad   = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color + '44');
    grad.addColorStop(1, color + '00');

    sparkCharts[etfId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: rows.map(r => r.date),
            datasets: [{
                data: closes,
                borderColor: color,
                borderWidth: 1.5,
                fill: true,
                backgroundColor: grad,
                pointRadius: 0,
                tension: 0.3,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales:  { x: { display: false }, y: { display: false } },
        },
    });
}

async function fetchAllSparklines() {
    const d2 = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    await Promise.allSettled(ALL_ETFS.map(async etf => {
        try {
            // encodeURIComponent ensures &d1=...&d2=...&i=d are not stripped by the proxy
            const stooqUrl = 'https://stooq.com/q/d/l/?s=' + etf.stooqSymbol
                           + '&d1=' + SPARK_START + '&d2=' + d2 + '&i=d';
            const res = await fetch('https://corsproxy.io/?' + encodeURIComponent(stooqUrl));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const rows = parseSparkCSV(await res.text());
            if (rows.length > 0) {
                sparkCache[etf.id] = rows;
                drawSparkline(etf.id, rows);
            }
        } catch (e) {
            console.warn('[Sparkline] ' + etf.symbol + ':', e.message);
        }
    }));
}
