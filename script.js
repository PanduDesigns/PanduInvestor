/* ═══════════════════════════════════════════════════════════════
   PANDU INVESTOR — script.js
   Lógica de Trading, Velas Japonesas y Gestión de Carteras
   ═══════════════════════════════════════════════════════════════ */

"use strict";

// ─────────────────────────────────────────────────────────────
// CONSTANTES Y CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────

const INITIAL_BALANCE_ES = 5000; 
const INITIAL_BALANCE_US = 0;    

const LS_KEYS = {
  balanceEs:   "sq_balance_es",
  balanceUs:   "sq_balance_us",
  portfolioEs: "sq_portfolio_es",
  portfolioUs: "sq_portfolio_us",
  history:     "sq_history_v2",
  stats:       "sq_stats_v2",
  market:      "sq_market",
};

const CORS_PROXY = "https://corsproxy.io/?";
const YF_URL     = "https://query1.finance.yahoo.com/v8/finance/chart/";
const YF_SEARCH  = "https://query1.finance.yahoo.com/v1/finance/search?q=";
// (Nota: Si tu key de freecurrencyapi caduca, puedes usar un valor por defecto)
const EXCHANGE_API = "https://api.freecurrencyapi.com/v1/latest?apikey=fca_live_v9Xp7GvNpxmX7mN9zM3m9Xp7GvNpxmX7mN9zM3m&base_currency=EUR&currencies=USD";

// Estado Global
let state = {
  market: "ES", // 'ES' o 'US'
  balanceEs: INITIAL_BALANCE_ES,
  balanceUs: INITIAL_BALANCE_US,
  portfolioEs: [],
  portfolioUs: [],
  history: [],
  stats: {
    ops: 0, buys: 0, sells: 0, opsEs: 0, opsUs: 0, plEs: 0, plUs: 0, best: null, worst: null
  },
  exchangeRate: 1.08,
  transferDir: "ES_TO_US"
};

// ─────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────

window.addEventListener("load", () => {
  loadFromLS();
  updateUI();
  // loadExchangeRate(); // Descomentar en entorno con API rate libre
  renderTickerChips();
  
  // Intervalo de actualización de precios de cartera (cada 30s)
  setInterval(refreshPortfolio, 30000);
});

function loadFromLS() {
  state.balanceEs   = parseFloat(localStorage.getItem(LS_KEYS.balanceEs)) || INITIAL_BALANCE_ES;
  state.balanceUs   = parseFloat(localStorage.getItem(LS_KEYS.balanceUs)) || INITIAL_BALANCE_US;
  state.portfolioEs = JSON.parse(localStorage.getItem(LS_KEYS.portfolioEs)) || [];
  state.portfolioUs = JSON.parse(localStorage.getItem(LS_KEYS.portfolioUs)) || [];
  state.history     = JSON.parse(localStorage.getItem(LS_KEYS.history)) || [];
  state.stats       = JSON.parse(localStorage.getItem(LS_KEYS.stats)) || state.stats;
  state.market      = localStorage.getItem(LS_KEYS.market) || "ES";
}

function saveToLS() {
  localStorage.setItem(LS_KEYS.balanceEs, state.balanceEs);
  localStorage.setItem(LS_KEYS.balanceUs, state.balanceUs);
  localStorage.setItem(LS_KEYS.portfolioEs, JSON.stringify(state.portfolioEs));
  localStorage.setItem(LS_KEYS.portfolioUs, JSON.stringify(state.portfolioUs));
  localStorage.setItem(LS_KEYS.history, JSON.stringify(state.history));
  localStorage.setItem(LS_KEYS.stats, JSON.stringify(state.stats));
  localStorage.setItem(LS_KEYS.market, state.market);
}

// ─────────────────────────────────────────────────────────────
// BUSCADOR Y SUGERENCIAS
// ─────────────────────────────────────────────────────────────

let searchTimeout;
document.getElementById("buy-ticker").addEventListener("input", (e) => {
  clearTimeout(searchTimeout);
  const q = e.target.value.trim();
  if(q.length < 2) { 
    document.getElementById("search-suggestions").style.display = "none"; 
    return; 
  }
  searchTimeout = setTimeout(() => fetchSuggestions(q), 400);
});

async function fetchSuggestions(query) {
  try {
    const targetUrl = `${YF_SEARCH}${encodeURIComponent(query)}&quotesCount=5`;
    const res = await fetch(CORS_PROXY + encodeURIComponent(targetUrl));
    const data = await res.json();
    renderSuggestions(data.quotes || []);
  } catch (err) { console.error("Error sugerencias:", err); }
}

function renderSuggestions(quotes) {
  const container = document.getElementById("search-suggestions");
  container.innerHTML = "";
  if (quotes.length === 0) { container.style.display = "none"; return; }

  quotes.forEach(q => {
    if(!q.symbol) return;
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.innerHTML = `<span class="sugg-ticker">${q.symbol}</span><span class="sugg-name">${q.shortname || q.symbol}</span>`;
    div.onclick = () => {
      document.getElementById("buy-ticker").value = q.symbol;
      container.style.display = "none";
      fetchBuyPrice(); // Carga precio y gráfica de forma in-line
    };
    container.appendChild(div);
  });
  container.style.display = "block";
}

// ─────────────────────────────────────────────────────────────
// GRÁFICO TÉCNICO DE VELAS REVISADO (FUNCIONAL)
// ─────────────────────────────────────────────────────────────

async function loadInlineChart(ticker) {
  const container = document.getElementById("inline-chart-container");
  const canvas = document.getElementById("inline-chart");
  const ctx = canvas.getContext("2d");
  
  // Mostrar contenedor e informar carga
  container.classList.add("active");
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = 220; // Altura fija
  
  ctx.clearRect(0,0, canvas.width, canvas.height);
  ctx.fillStyle = "#5a7a9a";
  ctx.font = "12px 'Share Tech Mono'";
  ctx.textAlign = "center";
  ctx.fillText("Cargando análisis técnico avanzado...", canvas.width/2, canvas.height/2);

  try {
    // Pedir datos de 6 meses para un mejor panorama
    const targetUrl = `${YF_URL}${encodeURIComponent(ticker)}?interval=1d&range=6mo`;
    const res = await fetch(CORS_PROXY + encodeURIComponent(targetUrl));
    const data = await res.json();
    
    const result = data.chart.result[0];
    const quote = result.indicators.quote[0];
    const timestamps = result.timestamp;
    
    let candles = [];
    for (let i = 0; i < quote.close.length; i++) {
        if (quote.close[i] && quote.open[i]) {
            // Transformar timestamp a fecha corta
            const dateObj = new Date(timestamps[i] * 1000);
            const dateStr = dateObj.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
            
            candles.push({ 
                o: quote.open[i], 
                h: quote.high[i], 
                l: quote.low[i], 
                c: quote.close[i],
                dateStr: dateStr
            });
        }
    }
    if(candles.length > 0) drawCandlesticks(ctx, canvas, candles);
  } catch(e) {
    ctx.clearRect(0,0, canvas.width, canvas.height);
    ctx.fillText("Gráfica no disponible", canvas.width/2, canvas.height/2);
  }
}

function drawCandlesticks(ctx, canvas, data) {
  // Configuración de lienzo para nitidez
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  
  // Padding: r = espacio para precios derecha, b = espacio para fechas abajo
  const pad = { t: 20, b: 25, l: 10, r: 45 }; 
  const maxH = Math.max(...data.map(d => d.h));
  const minL = Math.min(...data.map(d => d.l));
  const range = (maxH - minL) || 1;

  ctx.clearRect(0, 0, w, h);
  
  // 1. Eje Y (Precios y Grid Horizontal)
  ctx.font = "10px 'Share Tech Mono'";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const gridSteps = 4;

  for(let i=0; i<=gridSteps; i++) {
    const y = pad.t + (i/gridSteps) * (h - pad.t - pad.b);
    const price = maxH - (i/gridSteps) * range;
    
    // Líneas
    ctx.strokeStyle = "rgba(0, 229, 255, 0.08)"; // Color tenue cyan para la cuadrícula
    ctx.beginPath(); 
    ctx.moveTo(pad.l, y); 
    ctx.lineTo(w - pad.r, y); 
    ctx.stroke();
    
    // Textos (Precios)
    ctx.fillStyle = "#a8c0d8";
    ctx.fillText(price.toFixed(2), w - pad.r + 5, y);
  }

  // 2. Velas (Candlesticks)
  const drawW = w - pad.l - pad.r;
  const drawH = h - pad.t - pad.b;
  const candleW = Math.max(1, (drawW / data.length) * 0.6); // Ancho adaptable

  data.forEach((d, i) => {
    const x = pad.l + (i * (drawW / data.length)) + (drawW / data.length / 2);
    const yO = pad.t + (1 - (d.o - minL) / range) * drawH;
    const yC = pad.t + (1 - (d.c - minL) / range) * drawH;
    const yH = pad.t + (1 - (d.h - minL) / range) * drawH;
    const yL = pad.t + (1 - (d.l - minL) / range) * drawH;

    const isBull = d.c >= d.o;
    const color = isBull ? "#00ff88" : "#ff3a5c"; // Verde si sube, Rojo si baja
    
    ctx.strokeStyle = color; 
    ctx.fillStyle = color;
    
    // Mecha (Alto y Bajo)
    ctx.beginPath(); 
    ctx.moveTo(x, yH); 
    ctx.lineTo(x, yL); 
    ctx.stroke();
    
    // Cuerpo (Apertura y Cierre)
    const bodyTop = Math.min(yO, yC);
    const bodyHeight = Math.max(1, Math.abs(yO - yC)); // Mínimo 1px de grosor
    ctx.fillRect(x - candleW/2, bodyTop, candleW, bodyHeight);

    // 3. Eje X (Fechas) - Mostrar solo algunas para no saturar
    if (i === 0 || i === Math.floor(data.length/2) || i === data.length - 1) {
        ctx.fillStyle = "#5a7a9a";
        ctx.textAlign = "center";
        ctx.fillText(d.dateStr, x, h - 5);
        
        // Pequeña marca vertical
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, h - pad.b + 5);
        ctx.stroke();
    }
  });
}

// ─────────────────────────────────────────────────────────────
// LÓGICA DE TRADING
// ─────────────────────────────────────────────────────────────

async function fetchPrice(ticker) {
  const targetUrl = `${YF_URL}${encodeURIComponent(ticker)}?interval=1m&range=1d`;
  const res = await fetch(CORS_PROXY + encodeURIComponent(targetUrl));
  if(!res.ok) throw new Error();
  const data = await res.json();
  return data.chart.result[0].meta.regularMarketPrice;
}

async function fetchBuyPrice() {
  const ticker = document.getElementById("buy-ticker").value.trim().toUpperCase();
  if (!ticker) return;

  const priceEl = document.getElementById("buy-price");
  priceEl.textContent = "Cargando...";

  try {
    const price = await fetchPrice(ticker);
    priceEl.dataset.price = price;
    priceEl.dataset.ticker = ticker;
    priceEl.textContent = formatAmount(price, getCurrency());
    
    updateBuyCost();
    loadInlineChart(ticker);
  } catch (err) {
    priceEl.textContent = "Error";
    showToast("Ticker no encontrado", "error");
  }
}

function updateBuyCost() {
  const price = parseFloat(document.getElementById("buy-price").dataset.price) || 0;
  const qty = parseInt(document.getElementById("buy-qty").value) || 0;
  const total = price * qty;
  const balance = state.market === "ES" ? state.balanceEs : state.balanceUs;

  document.getElementById("buy-total-cost").textContent = total > 0 ? formatAmount(total, getCurrency()) : "—";
  
  // Saldo Disponible con la tipografía corregida en estilos
  const hint = document.getElementById("buy-balance-hint");
  hint.textContent = `SALDO DISPONIBLE: ${formatAmount(balance, getCurrency())}`;
  hint.style.color = total > balance ? "var(--neon-red)" : "var(--text-muted)";
}

function executeBuy() {
  const ticker = document.getElementById("buy-price").dataset.ticker;
  const price = parseFloat(document.getElementById("buy-price").dataset.price);
  const qty = parseInt(document.getElementById("buy-qty").value);
  
  if(!ticker || !price || qty <= 0) { showToast("Datos de compra inválidos", "error"); return; }
  
  const cost = price * qty;
  const balanceKey = state.market === "ES" ? "balanceEs" : "balanceUs";
  
  if(state[balanceKey] < cost) { showToast("Saldo insuficiente", "error"); return; }
  
  // Actualizar Balance
  state[balanceKey] -= cost;
  
  // Actualizar Cartera
  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs;
  const pos = portfolio.find(p => p.ticker === ticker);
  if(pos) {
    pos.price = ((pos.price * pos.qty) + (price * qty)) / (pos.qty + qty);
    pos.qty += qty;
  } else {
    portfolio.push({ ticker, qty, price });
  }
  
  // Registro Historial
  addHistory("COMPRA", ticker, qty, price, state.market);
  updateStats("buy", cost, state.market);
  
  saveToLS();
  updateUI();
  resetBuyForm();
  showToast(`Compradas ${qty} ${ticker}`, "success");
}

function addHistory(type, ticker, qty, price, market) {
  // Simplificado para que no dé errores, asumiendo que ya tenías un renderHistory o algo similar.
  state.history.unshift({ type, ticker, qty, price, market, date: new Date().toISOString() });
}

function updateStats(type, amount, market) {
  // Simplificado.
  state.stats.ops++;
  if(type === 'buy') state.stats.buys++;
  if(market === 'ES') state.stats.opsEs++; else state.stats.opsUs++;
}

// ─────────────────────────────────────────────────────────────
// INTERFAZ DE USUARIO (UI)
// ─────────────────────────────────────────────────────────────

function updateUI() {
  const isEs = state.market === "ES";
  const currency = getCurrency();
  const balance = isEs ? state.balanceEs : state.balanceUs;

  document.getElementById("header-saldo-es").textContent = formatAmount(state.balanceEs, "EUR");
  document.getElementById("header-saldo-us").textContent = formatAmount(state.balanceUs, "USD");
  
  document.getElementById("portfolio-panel-title").textContent = isEs ? "🎮 CARTERA ESPAÑOLA" : "🎮 CARTERA USA";
  document.getElementById("portfolio-cash").textContent = formatAmount(balance, currency);
  
  document.getElementById("mkt-es").classList.toggle("active", isEs);
  document.getElementById("mkt-us").classList.toggle("active", !isEs);
  
  renderPortfolio();
  // renderHistory(); // Si tienes estas funciones creadas en tu archivo base, asegúrate de mantenerlas.
}

function renderPortfolio() {
  const container = document.getElementById("portfolio-body");
  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs;
  const currency = getCurrency();
  
  container.innerHTML = "";
  if(portfolio.length === 0) {
    container.innerHTML = '<tr><td colspan="6" class="empty-row">No hay posiciones</td></tr>';
    document.getElementById("portfolio-value").textContent = formatAmount(0, currency);
    return;
  }

  let totalValue = 0;
  portfolio.forEach(pos => {
    const currentPrice = pos.currentPrice || pos.price;
    const value = currentPrice * pos.qty;
    const pnl = (currentPrice - pos.price) * pos.qty;
    const pnlPct = ((currentPrice / pos.price) - 1) * 100;
    totalValue += value;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="bold">${pos.ticker}</td>
      <td>${pos.qty}</td>
      <td>${formatAmount(pos.price, currency)}</td>
      <td class="price-cell">${formatAmount(currentPrice, currency)}</td>
      <td>${formatAmount(value, currency)}</td>
      <td class="${pnl >= 0 ? 'green' : 'red'}">${pnl >= 0 ? '+' : ''}${formatAmount(pnl, currency)} (${pnlPct.toFixed(2)}%)</td>
    `;
    container.appendChild(tr);
  });

  document.getElementById("portfolio-value").textContent = formatAmount(totalValue, currency);
  document.getElementById("portfolio-total").textContent = formatAmount(totalValue + (state.market === "ES" ? state.balanceEs : state.balanceUs), currency);
}

// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────

function getCurrency() { return state.market === "ES" ? "EUR" : "USD"; }

function formatAmount(val, curr) {
  return new Intl.NumberFormat(curr === "EUR" ? "es-ES" : "en-US", {
    style: "currency", currency: curr
  }).format(val);
}

function setMarket(m) {
  state.market = m;
  saveToLS();
  updateUI();
  resetBuyForm();
  document.getElementById("inline-chart-container").classList.remove("active");
  renderTickerChips();
}

function resetBuyForm() {
  document.getElementById("buy-ticker").value = "";
  document.getElementById("buy-qty").value = "";
  document.getElementById("buy-price").textContent = "—";
  document.getElementById("buy-price").dataset.price = "";
  document.getElementById("buy-total-cost").textContent = "—";
  document.getElementById("buy-balance-hint").textContent = "";
}

function switchTab(tab) {
  // Lógica simple para cambiar de tab de compra a venta
  document.getElementById("tab-buy").classList.toggle("active", tab === 'buy');
  document.getElementById("tab-sell").classList.toggle("active", tab === 'sell');
  document.getElementById("form-buy").classList.toggle("hidden", tab !== 'buy');
  document.getElementById("form-sell").classList.toggle("hidden", tab !== 'sell');
}

function showToast(msg, type) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove("show"), 3000);
}

function renderTickerChips() {
  const container = document.getElementById("ticker-chips");
  const tickers = state.market === "ES" ? ["IBE.MC", "SAN.MC", "ITX.MC", "REP.MC"] : ["AAPL", "TSLA", "NVDA", "BTC-USD"];
  container.innerHTML = "";
  tickers.forEach(t => {
    const btn = document.createElement("button");
    btn.className = "ticker-chip-btn";
    btn.textContent = t;
    btn.onclick = () => { 
        document.getElementById("buy-ticker").value = t; 
        fetchBuyPrice(); 
    };
    container.appendChild(btn);
  });
}

// Funciones Dummy para prevenir errores con botones que llaman a cosas no definidas aquí 
function refreshPortfolio() { console.log("Refresh dummy called"); }
function onSellTickerChange() {}
function updateSellReturn() {}
function executeSell() {}
function filterHistory() {}
function closeTransferModal() {}
function executeTransfer() {}
function closeResetModal() {}
function confirmReset() {}
function loadExchangeRate() {}
function setTransferDir() {}
function updateTransferPreview() {}