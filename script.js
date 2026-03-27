/* ═══════════════════════════════════════════════════════════════
   STOCKQUEST — script.js
   Dos mercados independientes: 🇪🇸 ES (EUR) y 🇺🇸 US (USD)
   Transferencias entre carteras con tipo de cambio real EUR/USD
   Todos los datos guardados en localStorage
   ═══════════════════════════════════════════════════════════════ */

"use strict";

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

const INITIAL_BALANCE_ES = 5000;   // saldo inicial España en EUR
const INITIAL_BALANCE_US = 0;      // saldo inicial USA en USD (se obtiene por transferencia)

/** Claves de localStorage */
const LS_KEYS = {
  balanceEs:   "sq_balance_es",
  balanceUs:   "sq_balance_us",
  portfolioEs: "sq_portfolio_es",
  portfolioUs: "sq_portfolio_us",
  history:     "sq_history_v2",
  stats:       "sq_stats_v2",
  market:      "sq_market",
};

/**
 * Proxy CORS público para saltarse las restricciones de Yahoo Finance.
 * Cambia este valor si el proxy deja de funcionar.
 */
const CORS_PROXY = "https://corsproxy.io/?";
const YF_URL     = "https://query1.finance.yahoo.com/v8/finance/chart/";

/**
 * API de tipo de cambio EUR/USD (pública, sin clave).
 * Usamos la API de Frankfurt (gratuita).
 */
const EXCHANGE_API = "https://api.frankfurter.app/latest?from=EUR&to=USD";

// ─────────────────────────────────────────────────────────────
// TICKERS SUGERIDOS POR MERCADO
// ─────────────────────────────────────────────────────────────

const SUGGESTED_TICKERS = {
  ES: ["IBE.MC", "BBVA.MC", "SAN.MC", "ITX.MC", "REP.MC", "TEF.MC", "AMS.MC", "ACX.MC", "FER.MC", "IAG.MC"],
  US: ["AAPL",   "MSFT",    "TSLA",   "NVDA",   "AMZN",   "GOOGL",  "META",   "NFLX",   "SPY",    "QQQ"],
};

// ─────────────────────────────────────────────────────────────
// ESTADO DE LA APLICACIÓN
// ─────────────────────────────────────────────────────────────

/** Mercado activo: 'ES' o 'US' */
let activeMarket = "ES";

/** Saldos independientes por mercado */
let balanceEs = INITIAL_BALANCE_ES;
let balanceUs = INITIAL_BALANCE_US;

/**
 * Carteras independientes. Clave: ticker. Valor: { qty, avgPrice }
 * portfolioEs → acciones con precios en EUR
 * portfolioUs → acciones con precios en USD
 */
let portfolioEs = {};
let portfolioUs = {};

/**
 * Historial global de operaciones. Cada entrada:
 * { type: 'buy'|'sell'|'xfer', market: 'ES'|'US'|'XFER',
 *   ticker?, qty?, price?, total?, pnl?, date,
 *   // para transferencias:
 *   dir?, amountFrom?, amountTo?, currency?, rate? }
 */
let history = [];

/** Estadísticas globales */
let stats = {
  totalPlEs: 0,   // P&L realizado en EUR
  totalPlUs: 0,   // P&L realizado en USD
  bestOp: null,   // { ticker, pnl, currency }
  worstOp: null,
};

/** Tipo de cambio EUR/USD en caché */
let exchangeRate = null;

/** Dirección de transferencia activa en el modal */
let transferDir = "ES_TO_US";

/** Filtro activo del historial */
let historyFilter = "all";

// ─────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  loadFromStorage();
  renderAll();
  renderTickerChips();

  // Eventos de botones de cabecera
  document.getElementById("btn-reset").addEventListener("click", openResetModal);
  document.getElementById("btn-transfer").addEventListener("click", openTransferModal);
});

// ─────────────────────────────────────────────────────────────
// PERSISTENCIA
// ─────────────────────────────────────────────────────────────

function saveToStorage() {
  localStorage.setItem(LS_KEYS.balanceEs,   JSON.stringify(balanceEs));
  localStorage.setItem(LS_KEYS.balanceUs,   JSON.stringify(balanceUs));
  localStorage.setItem(LS_KEYS.portfolioEs, JSON.stringify(portfolioEs));
  localStorage.setItem(LS_KEYS.portfolioUs, JSON.stringify(portfolioUs));
  localStorage.setItem(LS_KEYS.history,     JSON.stringify(history));
  localStorage.setItem(LS_KEYS.stats,       JSON.stringify(stats));
  localStorage.setItem(LS_KEYS.market,      activeMarket);
}

function loadFromStorage() {
  const saved = localStorage.getItem(LS_KEYS.balanceEs);
  if (saved === null) {
    // Primera visita: valores por defecto
    resetState();
    saveToStorage();
    return;
  }
  balanceEs   = JSON.parse(localStorage.getItem(LS_KEYS.balanceEs)   ?? INITIAL_BALANCE_ES);
  balanceUs   = JSON.parse(localStorage.getItem(LS_KEYS.balanceUs)   ?? INITIAL_BALANCE_US);
  portfolioEs = JSON.parse(localStorage.getItem(LS_KEYS.portfolioEs) ?? "{}");
  portfolioUs = JSON.parse(localStorage.getItem(LS_KEYS.portfolioUs) ?? "{}");
  history     = JSON.parse(localStorage.getItem(LS_KEYS.history)     ?? "[]");
  stats       = JSON.parse(localStorage.getItem(LS_KEYS.stats)       ?? '{"totalPlEs":0,"totalPlUs":0,"bestOp":null,"worstOp":null}');
  activeMarket = localStorage.getItem(LS_KEYS.market) || "ES";
}

function resetState() {
  balanceEs   = INITIAL_BALANCE_ES;
  balanceUs   = INITIAL_BALANCE_US;
  portfolioEs = {};
  portfolioUs = {};
  history     = [];
  stats       = { totalPlEs: 0, totalPlUs: 0, bestOp: null, worstOp: null };
  activeMarket = "ES";
}

// ─────────────────────────────────────────────────────────────
// HELPERS: acceso a datos del mercado activo
// ─────────────────────────────────────────────────────────────

function getBalance()       { return activeMarket === "ES" ? balanceEs : balanceUs; }
function getPortfolio()     { return activeMarket === "ES" ? portfolioEs : portfolioUs; }
function getCurrency()      { return activeMarket === "ES" ? "EUR" : "USD"; }
function getCurrencySymbol(){ return activeMarket === "ES" ? "€" : "$"; }

function setBalance(val) {
  if (activeMarket === "ES") balanceEs = val; else balanceUs = val;
}

// ─────────────────────────────────────────────────────────────
// CAMBIO DE MERCADO
// ─────────────────────────────────────────────────────────────

/**
 * Cambia el mercado activo y actualiza toda la UI.
 * @param {'ES'|'US'} market
 */
function setMarket(market) {
  activeMarket = market;
  saveToStorage();

  // Actualizar botones del switcher
  document.getElementById("mkt-es").classList.toggle("active", market === "ES");
  document.getElementById("mkt-us").classList.toggle("active", market === "US");

  // Clase en body para theming CSS
  document.body.classList.toggle("market-es", market === "ES");
  document.body.classList.toggle("market-us", market === "US");

  // Actualizar banner
  const isEs = market === "ES";
  document.getElementById("mb-flag").textContent = isEs ? "🇪🇸" : "🇺🇸";
  document.getElementById("mb-name").textContent = isEs
    ? "MERCADO ESPAÑOL — IBEX 35 & BME"
    : "MERCADO AMERICANO — NYSE / NASDAQ";
  document.getElementById("mb-hint").textContent = isEs
    ? "IBE.MC · BBVA.MC · SAN.MC · ITX.MC · REP.MC · TEF.MC · AMS.MC · ACX.MC"
    : "AAPL · MSFT · TSLA · NVDA · AMZN · GOOGL · META · NFLX · SPY · QQQ";

  // Actualizar panel de trading
  document.getElementById("buy-ticker-label").textContent =
    isEs ? "TICKER (mercado español)" : "TICKER (mercado americano)";
  document.getElementById("buy-ticker").placeholder =
    isEs ? "Ej: IBE.MC, BBVA.MC" : "Ej: AAPL, TSLA, MSFT";
  document.getElementById("portfolio-panel-title").textContent =
    isEs ? "🎮 CARTERA ESPAÑOLA" : "🎮 CARTERA AMERICANA";

  // Limpiar formulario de compra
  resetBuyForm();

  // Actualizar chips y selects
  renderTickerChips();
  populateSellSelect();

  // Re-renderizar
  renderAll();
}

// ─────────────────────────────────────────────────────────────
// CHIPS DE TICKERS SUGERIDOS
// ─────────────────────────────────────────────────────────────

function renderTickerChips() {
  const container = document.getElementById("ticker-chips");
  const tickers   = SUGGESTED_TICKERS[activeMarket];
  container.innerHTML = tickers.map(t =>
    `<button class="ticker-chip-btn" onclick="selectTicker('${t}')">${t}</button>`
  ).join("");
}

/** Rellena el campo de ticker al hacer clic en un chip */
function selectTicker(ticker) {
  document.getElementById("buy-ticker").value = ticker;
  fetchBuyPrice();
}

// ─────────────────────────────────────────────────────────────
// PESTAÑA COMPRA / VENTA
// ─────────────────────────────────────────────────────────────

function switchTab(tab) {
  document.getElementById("form-buy").classList.toggle("hidden",  tab !== "buy");
  document.getElementById("form-sell").classList.toggle("hidden", tab !== "sell");
  document.getElementById("tab-buy").classList.toggle("active",   tab === "buy");
  document.getElementById("tab-sell").classList.toggle("active",  tab === "sell");
  if (tab === "sell") populateSellSelect();
}

// ─────────────────────────────────────────────────────────────
// API: PRECIO DE YAHOO FINANCE
// ─────────────────────────────────────────────────────────────

/**
 * Obtiene el precio actual de un ticker desde Yahoo Finance.
 * @param {string} ticker - Ej: "IBE.MC" o "AAPL"
 * @returns {Promise<number>}
 */
async function fetchPrice(ticker) {
  ticker = ticker.toUpperCase().trim();
  const targetUrl = `${YF_URL}${encodeURIComponent(ticker)}?interval=1m&range=1d`;
  const proxyUrl  = `${CORS_PROXY}${encodeURIComponent(targetUrl)}`;

  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data   = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("Ticker no encontrado");

  const price = result.meta?.regularMarketPrice || result.meta?.previousClose;
  if (!price || price <= 0) throw new Error("Precio inválido");

  return parseFloat(price.toFixed(4));
}

// ─────────────────────────────────────────────────────────────
// COMPRA: OBTENER PRECIO
// ─────────────────────────────────────────────────────────────

async function fetchBuyPrice() {
  const ticker = document.getElementById("buy-ticker").value.trim().toUpperCase();
  if (!ticker) { showToast("Introduce un ticker", "error"); return; }

  const priceEl = document.getElementById("buy-price");
  const badgeEl = document.getElementById("buy-badge");
  const sym     = getCurrencySymbol();

  priceEl.textContent    = "Cargando…";
  priceEl.dataset.price  = "";
  badgeEl.textContent    = "";

  try {
    const price = await fetchPrice(ticker);
    priceEl.dataset.price  = price;
    priceEl.dataset.ticker = ticker;
    priceEl.textContent    = formatAmount(price, getCurrency());
    priceEl.classList.add("price-pop");
    setTimeout(() => priceEl.classList.remove("price-pop"), 500);
    badgeEl.textContent = "EN VIVO";
    updateBuyCost();
  } catch (err) {
    priceEl.textContent    = "Error";
    priceEl.dataset.price  = "";
    showToast(`No se pudo obtener ${ticker}: ${err.message}`, "error");
  }
}

function updateBuyCost() {
  const price = parseFloat(document.getElementById("buy-price").dataset.price) || 0;
  const qty   = parseInt(document.getElementById("buy-qty").value) || 0;
  const total = price * qty;
  const bal   = getBalance();
  const sym   = getCurrencySymbol();
  const cur   = getCurrency();

  document.getElementById("buy-total-cost").textContent =
    total > 0 ? formatAmount(total, cur) : "—";

  // Indicador de saldo disponible
  const hint = document.getElementById("buy-balance-hint");
  if (price > 0) {
    hint.textContent = `Saldo disponible: ${formatAmount(bal, cur)}`;
    hint.style.color = total > bal ? "var(--neon-red)" : "var(--text-muted)";
  } else {
    hint.textContent = "";
  }
}

// ─────────────────────────────────────────────────────────────
// COMPRA: EJECUTAR
// ─────────────────────────────────────────────────────────────

async function executeBuy() {
  const ticker = document.getElementById("buy-ticker").value.trim().toUpperCase();
  const qty    = parseInt(document.getElementById("buy-qty").value);

  if (!ticker)          { showTradeMsg("buy", "⚠ Introduce un ticker", "error"); return; }
  if (!qty || qty < 1)  { showTradeMsg("buy", "⚠ Cantidad debe ser ≥ 1", "error"); return; }

  showTradeMsg("buy", "Consultando precio real…", "");

  let price;
  try {
    price = await fetchPrice(ticker);
  } catch (err) {
    showTradeMsg("buy", `✗ ${err.message}`, "error");
    return;
  }

  const total = price * qty;
  const bal   = getBalance();
  const cur   = getCurrency();
  const port  = getPortfolio();

  if (total > bal) {
    showTradeMsg("buy", `✗ Saldo insuficiente (necesitas ${formatAmount(total, cur)})`, "error");
    return;
  }

  // Descontar saldo
  setBalance(bal - total);

  // Actualizar cartera: precio medio ponderado
  if (port[ticker]) {
    const { qty: oldQty, avgPrice: oldAvg } = port[ticker];
    const newQty = oldQty + qty;
    const newAvg = ((oldAvg * oldQty) + (price * qty)) / newQty;
    port[ticker] = { qty: newQty, avgPrice: parseFloat(newAvg.toFixed(4)) };
  } else {
    port[ticker] = { qty, avgPrice: price };
  }

  addHistory({ type: "buy", market: activeMarket, ticker, qty, price, total, pnl: null });
  saveToStorage();
  renderAll();
  populateSellSelect();
  resetBuyForm();

  showTradeMsg("buy", `✔ ${qty}x ${ticker} compradas a ${formatAmount(price, cur)}`, "success");
  showToast(`✔ COMPRA: ${qty}x ${ticker}`, "success");
}

// ─────────────────────────────────────────────────────────────
// VENTA: SELECTOR
// ─────────────────────────────────────────────────────────────

function populateSellSelect() {
  const select  = document.getElementById("sell-ticker");
  const current = select.value;
  const port    = getPortfolio();

  select.innerHTML = '<option value="">— Selecciona —</option>';
  Object.keys(port).forEach(ticker => {
    const opt = document.createElement("option");
    opt.value = ticker;
    opt.textContent = `${ticker} (${port[ticker].qty} acc.)`;
    select.appendChild(opt);
  });
  if (current && port[current]) select.value = current;
}

async function onSellTickerChange() {
  const ticker  = document.getElementById("sell-ticker").value;
  const priceEl = document.getElementById("sell-price");
  const maxEl   = document.getElementById("sell-max");

  // Reset
  priceEl.textContent = "—";
  priceEl.dataset.price = "";
  priceEl.dataset.avgPrice = "";
  document.getElementById("sell-qty").value = "";
  document.getElementById("sell-total-return").textContent = "—";
  document.getElementById("sell-pnl-est").textContent     = "—";
  maxEl.textContent = "0";

  if (!ticker) return;

  const port = getPortfolio();
  const pos  = port[ticker];
  maxEl.textContent = pos.qty;

  priceEl.textContent = "Cargando…";

  try {
    const price = await fetchPrice(ticker);
    priceEl.textContent       = formatAmount(price, getCurrency());
    priceEl.dataset.price     = price;
    priceEl.dataset.avgPrice  = pos.avgPrice;
    priceEl.classList.add("price-pop");
    setTimeout(() => priceEl.classList.remove("price-pop"), 500);
    document.getElementById("sell-badge").textContent = "EN VIVO";
  } catch (err) {
    priceEl.textContent = "Error";
    showToast(`Error obteniendo precio de ${ticker}`, "error");
  }
}

function updateSellReturn() {
  const price    = parseFloat(document.getElementById("sell-price").dataset.price)    || 0;
  const avgPrice = parseFloat(document.getElementById("sell-price").dataset.avgPrice) || 0;
  const qty      = parseInt(document.getElementById("sell-qty").value) || 0;
  const cur      = getCurrency();

  const returnTotal = qty * price;
  const pnl         = qty * (price - avgPrice);

  document.getElementById("sell-total-return").textContent =
    returnTotal > 0 ? formatAmount(returnTotal, cur) : "—";

  const pnlEl = document.getElementById("sell-pnl-est");
  if (qty > 0 && price > 0) {
    pnlEl.textContent = (pnl >= 0 ? "+" : "") + formatAmount(pnl, cur);
    pnlEl.style.color = pnl > 0 ? "var(--neon-green)" : pnl < 0 ? "var(--neon-red)" : "var(--text-muted)";
  } else {
    pnlEl.textContent = "—";
    pnlEl.style.color = "";
  }
}

// ─────────────────────────────────────────────────────────────
// VENTA: EJECUTAR
// ─────────────────────────────────────────────────────────────

async function executeSell() {
  const ticker = document.getElementById("sell-ticker").value;
  const qty    = parseInt(document.getElementById("sell-qty").value);

  if (!ticker)         { showTradeMsg("sell", "⚠ Selecciona un ticker", "error"); return; }
  if (!qty || qty < 1) { showTradeMsg("sell", "⚠ Cantidad debe ser ≥ 1", "error"); return; }

  const port = getPortfolio();
  const pos  = port[ticker];
  if (!pos)       { showTradeMsg("sell", "✗ No tienes ese ticker", "error"); return; }
  if (qty > pos.qty) { showTradeMsg("sell", `✗ Solo tienes ${pos.qty} acciones`, "error"); return; }

  showTradeMsg("sell", "Consultando precio real…", "");

  let price;
  try {
    price = await fetchPrice(ticker);
  } catch (err) {
    showTradeMsg("sell", `✗ ${err.message}`, "error");
    return;
  }

  const total = price * qty;
  const pnl   = (price - pos.avgPrice) * qty;
  const cur   = getCurrency();

  // Actualizar saldo y cartera
  setBalance(getBalance() + total);
  const newQty = pos.qty - qty;
  if (newQty <= 0) delete port[ticker];
  else             port[ticker].qty = newQty;

  // Estadísticas
  if (activeMarket === "ES") stats.totalPlEs += pnl;
  else                       stats.totalPlUs += pnl;

  // Mejor / peor operación
  if (!stats.bestOp  || pnl > stats.bestOp.pnl)  stats.bestOp  = { ticker, pnl, currency: cur, market: activeMarket };
  if (!stats.worstOp || pnl < stats.worstOp.pnl) stats.worstOp = { ticker, pnl, currency: cur, market: activeMarket };

  addHistory({ type: "sell", market: activeMarket, ticker, qty, price, total, pnl });
  saveToStorage();
  renderAll();
  populateSellSelect();

  const pnlStr = (pnl >= 0 ? "+" : "") + formatAmount(pnl, cur);
  showTradeMsg("sell", `✔ ${qty}x ${ticker} vendidas | P&L: ${pnlStr}`, "success");
  showToast(`${pnl >= 0 ? "📈" : "📉"} VENTA: ${qty}x ${ticker} (${pnlStr})`, pnl >= 0 ? "success" : "info");

  // Reset parcial formulario
  document.getElementById("sell-ticker").value = "";
  document.getElementById("sell-price").textContent = "—";
  document.getElementById("sell-qty").value = "";
  document.getElementById("sell-total-return").textContent = "—";
  document.getElementById("sell-pnl-est").textContent = "—";
  document.getElementById("sell-max").textContent = "0";
}

// ─────────────────────────────────────────────────────────────
// ACTUALIZAR PRECIOS DE CARTERA
// ─────────────────────────────────────────────────────────────

async function refreshPortfolio() {
  const port    = getPortfolio();
  const tickers = Object.keys(port);

  if (tickers.length === 0) { showToast("La cartera está vacía", "info"); return; }

  const btn = document.querySelector(".btn-refresh");
  btn.classList.add("spinning");

  const prices = {};
  await Promise.allSettled(tickers.map(async t => {
    try { prices[t] = await fetchPrice(t); } catch { prices[t] = null; }
  }));

  renderPortfolioTable(prices);
  renderPortfolioSummary(prices);
  btn.classList.remove("spinning");
  showToast("✔ Precios actualizados", "success");
}

// ─────────────────────────────────────────────────────────────
// RENDER GLOBAL
// ─────────────────────────────────────────────────────────────

function renderAll() {
  // Aplicar clase de mercado al body
  document.body.classList.toggle("market-es", activeMarket === "ES");
  document.body.classList.toggle("market-us", activeMarket === "US");

  renderHeader();
  renderPortfolioTable({});
  renderPortfolioSummary({});
  renderStats();
  renderHistory();
  updateXpBar();
}

function renderHeader() {
  document.getElementById("header-saldo-es").textContent = formatAmount(balanceEs, "EUR");
  document.getElementById("header-saldo-us").textContent = formatAmount(balanceUs, "USD");

  // P&L global (mostramos el del mercado activo como referencia principal)
  const plEs = stats.totalPlEs;
  const plUs = stats.totalPlUs;
  // Mostramos ambos de forma compacta
  const plText = `${plEs >= 0 ? "+" : ""}${formatAmount(plEs,"EUR")} / ${plUs >= 0 ? "+" : ""}${formatAmount(plUs,"USD")}`;
  document.getElementById("header-pl").textContent = plText;

  const pill = document.getElementById("header-pl-pill");
  const totalPl = plEs + plUs; // aproximado, ignora tipo de cambio
  pill.classList.remove("gain", "loss");
  if (totalPl > 0) pill.classList.add("gain");
  if (totalPl < 0) pill.classList.add("loss");
}

function renderPortfolioTable(prices) {
  const tbody   = document.getElementById("portfolio-body");
  const port    = getPortfolio();
  const cur     = getCurrency();
  const tickers = Object.keys(port);

  if (tickers.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No tienes posiciones abiertas</td></tr>';
    return;
  }

  tbody.innerHTML = tickers.map(ticker => {
    const pos          = port[ticker];
    const currentPrice = prices[ticker] ?? null;
    const currentVal   = currentPrice !== null ? currentPrice * pos.qty : null;
    const pnl          = currentPrice !== null ? (currentPrice - pos.avgPrice) * pos.qty : null;
    const pnlClass     = pnl === null ? "td-neutral" : pnl >= 0 ? "td-pos" : "td-neg";
    const pnlStr       = pnl === null ? "—"
      : (pnl >= 0 ? "+" : "") + formatAmount(pnl, cur);

    return `<tr class="row-appear">
      <td><span class="ticker-chip">${ticker}</span></td>
      <td>${pos.qty}</td>
      <td>${formatAmount(pos.avgPrice, cur)}</td>
      <td>${currentPrice !== null ? formatAmount(currentPrice, cur) : '<span class="td-neutral">—</span>'}</td>
      <td>${currentVal  !== null ? formatAmount(currentVal,   cur) : '<span class="td-neutral">—</span>'}</td>
      <td class="${pnlClass}">${pnlStr}</td>
    </tr>`;
  }).join("");
}

function renderPortfolioSummary(prices) {
  const port = getPortfolio();
  const cur  = getCurrency();
  let portfolioValue = 0;
  Object.entries(port).forEach(([ticker, pos]) => {
    const p = prices[ticker] ?? pos.avgPrice;
    portfolioValue += p * pos.qty;
  });

  const cash  = getBalance();
  const total = cash + portfolioValue;

  document.getElementById("portfolio-value").textContent = formatAmount(portfolioValue, cur);
  document.getElementById("portfolio-cash").textContent  = formatAmount(cash, cur);
  document.getElementById("portfolio-total").textContent = formatAmount(total, cur);
}

function renderStats() {
  const buysEs  = history.filter(h => h.type === "buy"  && h.market === "ES").length;
  const buysUs  = history.filter(h => h.type === "buy"  && h.market === "US").length;
  const sellsEs = history.filter(h => h.type === "sell" && h.market === "ES").length;
  const sellsUs = history.filter(h => h.type === "sell" && h.market === "US").length;
  const totalBuys  = buysEs + buysUs;
  const totalSells = sellsEs + sellsUs;
  const totalOps   = totalBuys + totalSells;

  document.getElementById("stat-ops").textContent    = totalOps;
  document.getElementById("stat-buys").textContent   = totalBuys;
  document.getElementById("stat-sells").textContent  = totalSells;
  document.getElementById("stat-ops-es").textContent = buysEs + sellsEs;
  document.getElementById("stat-ops-us").textContent = buysUs + sellsUs;

  const plEs = stats.totalPlEs;
  const plUs = stats.totalPlUs;

  const plEsEl = document.getElementById("stat-pl-es");
  plEsEl.textContent = (plEs >= 0 ? "+" : "") + formatAmount(plEs, "EUR");
  plEsEl.className   = "stat-card-val " + (plEs > 0 ? "green" : plEs < 0 ? "red" : "");

  const plUsEl = document.getElementById("stat-pl-us");
  plUsEl.textContent = (plUs >= 0 ? "+" : "") + formatAmount(plUs, "USD");
  plUsEl.className   = "stat-card-val " + (plUs > 0 ? "green" : plUs < 0 ? "red" : "");

  if (stats.bestOp) {
    const s = stats.bestOp;
    document.getElementById("stat-best").textContent =
      `${s.market === "ES" ? "🇪🇸" : "🇺🇸"} ${s.ticker} +${formatAmount(s.pnl, s.currency)}`;
  }
  if (stats.worstOp) {
    const s = stats.worstOp;
    document.getElementById("stat-worst").textContent =
      `${s.market === "ES" ? "🇪🇸" : "🇺🇸"} ${s.ticker} ${formatAmount(s.pnl, s.currency)}`;
  }
}

function renderHistory() {
  const container = document.getElementById("history-list");
  let filtered = history;

  if (historyFilter === "ES")   filtered = history.filter(h => h.market === "ES");
  if (historyFilter === "US")   filtered = history.filter(h => h.market === "US");
  if (historyFilter === "xfer") filtered = history.filter(h => h.type   === "xfer");

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-history">Sin operaciones en este filtro</div>';
    return;
  }

  container.innerHTML = filtered.map(op => {
    if (op.type === "xfer") return renderHistoryXfer(op);

    const isBuy    = op.type === "buy";
    const flagHtml = op.market === "ES" ? "🇪🇸" : "🇺🇸";
    const cur      = op.market === "ES" ? "EUR" : "USD";

    let pnlHtml = "";
    if (op.pnl !== null && op.pnl !== undefined) {
      const cls  = op.pnl > 0 ? "pos" : op.pnl < 0 ? "neg" : "neu";
      const sign = op.pnl >= 0 ? "+" : "";
      pnlHtml = `<div class="history-pnl ${cls}">${sign}${formatAmount(op.pnl, cur)}</div>`;
    } else {
      pnlHtml = `<div class="history-pnl neu">—</div>`;
    }

    return `<div class="history-item ${op.type}">
      <span class="history-badge ${op.type}">${isBuy ? "COMPRA" : "VENTA"}</span>
      <div class="history-detail">
        <span class="history-market">${flagHtml}</span>
        <span class="history-ticker"> ${op.ticker}</span>
        <div class="history-info">${op.qty} acc. × ${formatAmount(op.price, cur)} = ${formatAmount(op.total, cur)}</div>
        <div class="history-date">${op.date}</div>
      </div>
      ${pnlHtml}
    </div>`;
  }).join("");
}

function renderHistoryXfer(op) {
  const fromCur = op.dir === "ES_TO_US" ? "EUR" : "USD";
  const toCur   = op.dir === "ES_TO_US" ? "USD" : "EUR";
  const fromFlag = op.dir === "ES_TO_US" ? "🇪🇸" : "🇺🇸";
  const toFlag   = op.dir === "ES_TO_US" ? "🇺🇸" : "🇪🇸";

  return `<div class="history-item xfer">
    <span class="history-badge xfer">TRASPASO</span>
    <div class="history-detail">
      <span class="history-market">${fromFlag} → ${toFlag}</span>
      <div class="history-info">
        ${formatAmount(op.amountFrom, fromCur)} → ${formatAmount(op.amountTo, toCur)}
        (TC: ${op.rate.toFixed(4)})
      </div>
      <div class="history-date">${op.date}</div>
    </div>
    <div class="history-pnl neu">⇄</div>
  </div>`;
}

function filterHistory(filter) {
  historyFilter = filter;
  // Actualizar botones de filtro
  ["all","es","us","xfer"].forEach(id => {
    document.getElementById(`hf-${id}`).classList.toggle("active", id === filter);
  });
  renderHistory();
}

function updateXpBar() {
  const ops   = history.filter(h => h.type !== "xfer").length;
  const level = Math.floor(ops / 5) + 1;
  const xp    = ((ops % 5) / 5) * 100;
  document.getElementById("xp-bar").style.width = xp + "%";
  document.getElementById("xp-label").textContent = `NIVEL ${level}`;
}

// ─────────────────────────────────────────────────────────────
// MODAL: TRANSFERENCIA DE FONDOS
// ─────────────────────────────────────────────────────────────

async function openTransferModal() {
  document.getElementById("modal-transfer").classList.remove("hidden");
  document.getElementById("transfer-amount").value = "";
  document.getElementById("transfer-msg").textContent = "";
  resetTransferPreview();
  updateTransferBalances();
  await loadExchangeRate();
}

function closeTransferModal() {
  document.getElementById("modal-transfer").classList.add("hidden");
}

/** Carga el tipo de cambio EUR/USD desde Frankfurter API */
async function loadExchangeRate() {
  const el = document.getElementById("er-value");
  el.textContent = "Cargando…";

  try {
    // Frankfurter es una API pública y gratuita, sin proxy necesario
    const res  = await fetch(EXCHANGE_API);
    const data = await res.json();
    exchangeRate = data.rates.USD;
    el.textContent = `1 EUR = ${exchangeRate.toFixed(4)} USD`;
    updateTransferPreview();
  } catch (err) {
    // Fallback: tipo de cambio aproximado
    exchangeRate = 1.08;
    el.textContent = `~1 EUR = ${exchangeRate.toFixed(4)} USD (estimado)`;
    showToast("TC en modo estimado (sin conexión)", "info");
  }
}

function setTransferDir(dir) {
  transferDir = dir;
  document.getElementById("dir-es-us").classList.toggle("active", dir === "ES_TO_US");
  document.getElementById("dir-us-es").classList.toggle("active", dir === "US_TO_ES");

  // Actualizar etiquetas del formulario
  const isEsToUs = dir === "ES_TO_US";
  document.getElementById("transfer-label").textContent =
    isEsToUs ? "IMPORTE EN EUR A ENVIAR" : "IMPORTE EN USD A ENVIAR";
  document.getElementById("transfer-amount").placeholder = isEsToUs ? "0.00 EUR" : "0.00 USD";

  document.getElementById("tp-from-lbl").textContent = isEsToUs ? "Envías desde 🇪🇸 (EUR)" : "Envías desde 🇺🇸 (USD)";
  document.getElementById("tp-to-lbl").textContent   = isEsToUs ? "Recibes en 🇺🇸 (USD)"   : "Recibes en 🇪🇸 (EUR)";

  updateTransferPreview();
  updateTransferBalances();
}

function updateTransferPreview() {
  if (!exchangeRate) return;

  const amount = parseFloat(document.getElementById("transfer-amount").value) || 0;
  const isEsToUs = transferDir === "ES_TO_US";

  const fromCur = isEsToUs ? "EUR" : "USD";
  const toCur   = isEsToUs ? "USD" : "EUR";

  // Conversión
  let converted;
  if (isEsToUs) {
    converted = amount * exchangeRate;            // EUR → USD
  } else {
    converted = amount / exchangeRate;            // USD → EUR
  }

  document.getElementById("tp-from-val").textContent = amount > 0 ? formatAmount(amount, fromCur) : "—";
  document.getElementById("tp-to-val").textContent   = amount > 0 ? formatAmount(converted, toCur) : "—";
}

function updateTransferBalances() {
  const container = document.getElementById("transfer-balances");
  container.innerHTML = `
    <div class="tb-item">
      <span>🇪🇸 Disponible EUR</span>
      <span class="tb-val" style="color:var(--es-color)">${formatAmount(balanceEs, "EUR")}</span>
    </div>
    <div class="tb-item">
      <span>🇺🇸 Disponible USD</span>
      <span class="tb-val" style="color:var(--us-color)">${formatAmount(balanceUs, "USD")}</span>
    </div>
  `;
}

function resetTransferPreview() {
  document.getElementById("tp-from-val").textContent = "—";
  document.getElementById("tp-to-val").textContent   = "—";
}

/** Ejecuta la transferencia de fondos entre carteras */
function executeTransfer() {
  const amount   = parseFloat(document.getElementById("transfer-amount").value);
  const msgEl    = document.getElementById("transfer-msg");
  const isEsToUs = transferDir === "ES_TO_US";

  if (!amount || amount <= 0) {
    msgEl.textContent = "⚠ Introduce un importe válido";
    msgEl.className   = "trade-msg error";
    return;
  }

  if (!exchangeRate) {
    msgEl.textContent = "⚠ Tipo de cambio no disponible, espera un momento";
    msgEl.className   = "trade-msg error";
    return;
  }

  if (isEsToUs) {
    // Enviamos EUR, recibimos USD
    if (amount > balanceEs) {
      msgEl.textContent = `✗ Saldo EUR insuficiente (tienes ${formatAmount(balanceEs,"EUR")})`;
      msgEl.className   = "trade-msg error";
      return;
    }
    const converted = parseFloat((amount * exchangeRate).toFixed(2));
    balanceEs -= amount;
    balanceUs  = parseFloat((balanceUs + converted).toFixed(2));

    addHistoryXfer({ dir: "ES_TO_US", amountFrom: amount, amountTo: converted, rate: exchangeRate });
    showToast(`⇄ ${formatAmount(amount,"EUR")} → ${formatAmount(converted,"USD")}`, "success");
  } else {
    // Enviamos USD, recibimos EUR
    if (amount > balanceUs) {
      msgEl.textContent = `✗ Saldo USD insuficiente (tienes ${formatAmount(balanceUs,"USD")})`;
      msgEl.className   = "trade-msg error";
      return;
    }
    const converted = parseFloat((amount / exchangeRate).toFixed(2));
    balanceUs -= amount;
    balanceEs  = parseFloat((balanceEs + converted).toFixed(2));

    addHistoryXfer({ dir: "US_TO_ES", amountFrom: amount, amountTo: converted, rate: exchangeRate });
    showToast(`⇄ ${formatAmount(amount,"USD")} → ${formatAmount(converted,"EUR")}`, "success");
  }

  saveToStorage();
  renderAll();
  updateTransferBalances();

  // Limpiar formulario del modal
  document.getElementById("transfer-amount").value = "";
  resetTransferPreview();
  msgEl.textContent = "✔ Transferencia realizada";
  msgEl.className   = "trade-msg success";

  // Cerrar modal tras 1.2 segundos
  setTimeout(closeTransferModal, 1200);
}

// ─────────────────────────────────────────────────────────────
// HISTORIAL: AÑADIR ENTRADAS
// ─────────────────────────────────────────────────────────────

function addHistory(op) {
  op.date = nowDate();
  history.unshift(op);
  if (history.length > 300) history.pop();
}

function addHistoryXfer({ dir, amountFrom, amountTo, rate }) {
  history.unshift({
    type: "xfer",
    market: "XFER",
    dir,
    amountFrom,
    amountTo,
    rate,
    date: nowDate(),
  });
  if (history.length > 300) history.pop();
}

function nowDate() {
  return new Date().toLocaleString("es-ES", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─────────────────────────────────────────────────────────────
// MODAL: RESET
// ─────────────────────────────────────────────────────────────

function openResetModal() {
  document.getElementById("modal-reset").classList.remove("hidden");
}
function closeResetModal() {
  document.getElementById("modal-reset").classList.add("hidden");
}
function confirmReset() {
  Object.values(LS_KEYS).forEach(k => localStorage.removeItem(k));
  resetState();
  saveToStorage();
  closeResetModal();
  renderAll();
  renderTickerChips();
  populateSellSelect();
  resetBuyForm();
  showToast("✔ SIMULACIÓN REINICIADA — Saldo: €5.000", "success");
}

// Cerrar modales al hacer clic en el overlay
document.addEventListener("DOMContentLoaded", () => {
  ["modal-reset", "modal-transfer"].forEach(id => {
    document.getElementById(id).addEventListener("click", function(e) {
      if (e.target === this) {
        if (id === "modal-reset")    closeResetModal();
        if (id === "modal-transfer") closeTransferModal();
      }
    });
  });

  // Enter en ticker lanza búsqueda
  document.getElementById("buy-ticker").addEventListener("keydown", e => {
    if (e.key === "Enter") fetchBuyPrice();
  });
});

// ─────────────────────────────────────────────────────────────
// HELPERS UI
// ─────────────────────────────────────────────────────────────

function resetBuyForm() {
  document.getElementById("buy-ticker").value            = "";
  document.getElementById("buy-qty").value               = "";
  document.getElementById("buy-price").textContent       = "—";
  document.getElementById("buy-price").dataset.price     = "";
  document.getElementById("buy-badge").textContent       = "";
  document.getElementById("buy-total-cost").textContent  = "—";
  document.getElementById("buy-balance-hint").textContent = "";
  document.getElementById("buy-msg").textContent         = "";
  document.getElementById("buy-msg").className           = "trade-msg";
}

function showTradeMsg(form, msg, type) {
  const el = document.getElementById(`${form}-msg`);
  el.textContent = msg;
  el.className   = `trade-msg ${type}`;
}

let toastTimer = null;
function showToast(msg, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className   = `toast ${type} show`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}

// ─────────────────────────────────────────────────────────────
// FORMATEO DE MONEDA
// ─────────────────────────────────────────────────────────────

/**
 * Formatea un valor como moneda.
 * @param {number} value
 * @param {'EUR'|'USD'} currency
 * @returns {string}
 */
function formatAmount(value, currency) {
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency", currency: "USD",
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value);
  }
  // Por defecto EUR con formato español
  return new Intl.NumberFormat("es-ES", {
    style: "currency", currency: "EUR",
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}
