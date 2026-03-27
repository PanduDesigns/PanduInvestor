/* ═══════════════════════════════════════════════════════════════
   PANDU INVESTOR — script.js
   Dos mercados independientes: 🇪🇸 ES (EUR) y 🇺🇸 US (USD)
   ═══════════════════════════════════════════════════════════════ */

"use strict";

// ─────────────────────────────────────────────────────────────
// CONSTANTES
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
const YF_SEARCH  = "https://query2.finance.yahoo.com/v1/finance/search?q=";

const EXCHANGE_API = "https://api.frankfurter.app/latest?from=EUR&to=USD";

const SUGGESTED_TICKERS = {
  ES: ["IBE.MC", "BBVA.MC", "SAN.MC", "ITX.MC", "REP.MC", "TEF.MC", "IAG.MC"],
  US: ["AAPL", "MSFT", "TSLA", "NVDA", "AMZN", "GOOGL", "META"],
};

// ─────────────────────────────────────────────────────────────
// ESTADO DE LA APLICACIÓN
// ─────────────────────────────────────────────────────────────

let activeMarket = "ES";
let balanceEs = INITIAL_BALANCE_ES;
let balanceUs = INITIAL_BALANCE_US;
let portfolioEs = {};
let portfolioUs = {};
let history = [];
let stats = { totalPlEs: 0, totalPlUs: 0, bestOp: null, worstOp: null };

let exchangeRate = null;
let transferDir = "ES_TO_US";
let historyFilter = "all";

// ─────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  loadFromStorage();
  renderAll();
  renderTickerChips();

  document.getElementById("btn-reset").addEventListener("click", openResetModal);
  document.getElementById("btn-transfer").addEventListener("click", openTransferModal);

  // Carga tipo de cambio de fondo para Patrimonio Total
  await loadExchangeRate(true); 

  // Cerrar sugerencias si se hace clic fuera
  document.addEventListener("click", (e) => {
    const wrapper = document.getElementById("search-suggestions");
    if (wrapper && !e.target.closest(".autocomplete-wrapper")) {
      wrapper.style.display = "none";
    }
  });
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
  balanceEs = INITIAL_BALANCE_ES; balanceUs = INITIAL_BALANCE_US;
  portfolioEs = {}; portfolioUs = {}; history = [];
  stats = { totalPlEs: 0, totalPlUs: 0, bestOp: null, worstOp: null };
  activeMarket = "ES";
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function getBalance()       { return activeMarket === "ES" ? balanceEs : balanceUs; }
function getPortfolio()     { return activeMarket === "ES" ? portfolioEs : portfolioUs; }
function getCurrency()      { return activeMarket === "ES" ? "EUR" : "USD"; }
function getCurrencySymbol(){ return activeMarket === "ES" ? "€" : "$"; }
function setBalance(val)    { if (activeMarket === "ES") balanceEs = val; else balanceUs = val; }

function getPortfolioFor(market) { return market === "ES" ? portfolioEs : portfolioUs; }

function setMarket(market) {
  activeMarket = market;
  saveToStorage();

  document.getElementById("mkt-es").classList.toggle("active", market === "ES");
  document.getElementById("mkt-us").classList.toggle("active", market === "US");
  document.body.classList.toggle("market-es", market === "ES");
  document.body.classList.toggle("market-us", market === "US");

  const isEs = market === "ES";
  document.getElementById("mb-flag").textContent = isEs ? "🇪🇸" : "🇺🇸";
  document.getElementById("mb-name").textContent = isEs ? "MERCADO ESPAÑOL — IBEX 35 & BME" : "MERCADO AMERICANO — NYSE / NASDAQ";
  
  document.getElementById("portfolio-panel-title").textContent = isEs ? "🎮 CARTERA ESPAÑOLA" : "🎮 CARTERA AMERICANA";

  resetBuyForm();
  renderTickerChips();
  populateSellSelect();
  renderAll();
}

function renderTickerChips() {
  const container = document.getElementById("ticker-chips");
  const tickers   = SUGGESTED_TICKERS[activeMarket];
  container.innerHTML = tickers.map(t =>
    `<button class="ticker-chip-btn" onclick="selectTicker('${t}')">${t}</button>`
  ).join("");
}

function selectTicker(ticker) {
  document.getElementById("buy-ticker").value = ticker;
  fetchBuyPrice();
}

function switchTab(tab) {
  document.getElementById("form-buy").classList.toggle("hidden",  tab !== "buy");
  document.getElementById("form-sell").classList.toggle("hidden", tab !== "sell");
  document.getElementById("tab-buy").classList.toggle("active",   tab === "buy");
  document.getElementById("tab-sell").classList.toggle("active",  tab === "sell");
  if (tab === "sell") populateSellSelect();
}

// ─────────────────────────────────────────────────────────────
// BUSCADOR / AUTOCOMPLETADO
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
    const targetUrl = `${YF_SEARCH}${encodeURIComponent(query)}&quotesCount=5&newsCount=0`;
    const res = await fetch(CORS_PROXY + encodeURIComponent(targetUrl));
    const data = await res.json();
    const quotes = data.quotes || [];
    renderSuggestions(quotes);
  } catch (err) {
    console.error("Error buscando sugerencias:", err);
  }
}

function renderSuggestions(quotes) {
  const container = document.getElementById("search-suggestions");
  container.innerHTML = "";
  if (quotes.length === 0) {
    container.style.display = "none";
    return;
  }
  quotes.forEach(q => {
    // Filtrar para mostrar más resultados lógicos
    if(!q.symbol || (!q.shortname && !q.longname)) return;
    const name = q.shortname || q.longname;
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.innerHTML = `<span class="sugg-ticker">${q.symbol}</span><span class="sugg-name">${name} (${q.exchDisp || 'Mercado'})</span>`;
    
    div.onclick = () => {
      document.getElementById("buy-ticker").value = q.symbol;
      container.style.display = "none";
      openAssetModal(q.symbol, name); // Abrir info del activo
    };
    container.appendChild(div);
  });
  container.style.display = "block";
}


// ─────────────────────────────────────────────────────────────
// MODAL DE ACTIVO (INFO Y GRÁFICA)
// ─────────────────────────────────────────────────────────────

async function openAssetModal(ticker, name) {
  document.getElementById("modal-asset").classList.remove("hidden");
  document.getElementById("asset-title").textContent = name || ticker;
  document.getElementById("asset-ticker").textContent = ticker;
  document.getElementById("asset-price").textContent = "Cargando...";

  const canvas = document.getElementById("asset-chart");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Texto de carga en canvas
  ctx.fillStyle = "#5a7a9a";
  ctx.font = "14px 'Share Tech Mono'";
  ctx.fillText("Obteniendo datos de mercado...", 20, 30);

  try {
    // Pedimos 3 meses de historia
    const targetUrl = `${YF_URL}${encodeURIComponent(ticker)}?interval=1d&range=3mo`;
    const res = await fetch(CORS_PROXY + encodeURIComponent(targetUrl));
    if(!res.ok) throw new Error("No data");
    const data = await res.json();
    const result = data.chart.result[0];
    const closePrices = result.indicators.quote[0].close;
    
    // Filtrar nulls
    const validPrices = closePrices.filter(p => p !== null);
    
    if(validPrices.length > 0) {
      drawChart(ctx, canvas, validPrices);
      const currentPrice = validPrices[validPrices.length-1];
      // Si el ticker es americano o español
      const cur = activeMarket === "ES" ? (ticker.includes(".MC") || ticker.includes(".MA") ? "EUR" : "USD") : "USD";
      document.getElementById("asset-price").textContent = formatAmount(currentPrice, cur);
    } else {
      throw new Error("No valid prices");
    }

  } catch(e) {
    ctx.clearRect(0,0, canvas.width, canvas.height);
    ctx.fillText("Gráfica no disponible para este activo.", 20, 30);
  }
}

function closeAssetModal() {
  document.getElementById("modal-asset").classList.add("hidden");
}

function selectAssetForBuy() {
  const ticker = document.getElementById("asset-ticker").textContent;
  document.getElementById("buy-ticker").value = ticker;
  closeAssetModal();
  fetchBuyPrice(); // Autocargar precio en el panel
}

function drawChart(ctx, canvas, prices) {
  if (!prices || prices.length < 2) return;
  const w = canvas.width;
  const h = canvas.height;
  const padding = 25;

  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const rangeP = maxP - minP || 1;

  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  
  // Si sube o baja, cambiamos color
  const isUp = prices[prices.length-1] >= prices[0];
  ctx.strokeStyle = isUp ? "#00ff88" : "#ff3a5c"; 
  ctx.lineWidth = 2.5;

  prices.forEach((p, i) => {
    const x = padding + (i / (prices.length - 1)) * (w - padding * 2);
    const y = h - padding - ((p - minP) / rangeP) * (h - padding * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Sombras/Glow
  ctx.shadowBlur = 10;
  ctx.shadowColor = isUp ? "#00ff88" : "#ff3a5c";
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Textos
  ctx.fillStyle = "#e8f4ff";
  ctx.font = "11px sans-serif";
  ctx.fillText(maxP.toFixed(2), 2, padding + 4);
  ctx.fillText(minP.toFixed(2), 2, h - padding + 4);
}


// ─────────────────────────────────────────────────────────────
// PRECIOS DE YAHOO
// ─────────────────────────────────────────────────────────────

async function fetchPrice(ticker) {
  ticker = ticker.toUpperCase().trim();
  const targetUrl = `${YF_URL}${encodeURIComponent(ticker)}?interval=1m&range=1d`;
  const proxyUrl  = `${CORS_PROXY}${encodeURIComponent(targetUrl)}`;

  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const data   = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("No encontrado");

  const price = result.meta?.regularMarketPrice || result.meta?.previousClose;
  if (!price || price <= 0) throw new Error("Precio inválido");

  return parseFloat(price.toFixed(4));
}

async function fetchBuyPrice() {
  const ticker = document.getElementById("buy-ticker").value.trim().toUpperCase();
  if (!ticker) { showToast("Introduce un ticker", "error"); return; }

  const priceEl = document.getElementById("buy-price");
  const badgeEl = document.getElementById("buy-badge");

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
    showToast(`No se pudo obtener ${ticker}. Intenta usar el buscador.`, "error");
  }
}

function updateBuyCost() {
  const price = parseFloat(document.getElementById("buy-price").dataset.price) || 0;
  const qty   = parseInt(document.getElementById("buy-qty").value) || 0;
  const total = price * qty;
  const bal   = getBalance();
  const cur   = getCurrency();

  document.getElementById("buy-total-cost").textContent = total > 0 ? formatAmount(total, cur) : "—";

  const hint = document.getElementById("buy-balance-hint");
  if (price > 0) {
    hint.textContent = `Saldo disponible: ${formatAmount(bal, cur)}`;
    hint.style.color = total > bal ? "var(--neon-red)" : "var(--text-muted)";
  } else { hint.textContent = ""; }
}

async function executeBuy() {
  const ticker = document.getElementById("buy-ticker").value.trim().toUpperCase();
  const qty    = parseInt(document.getElementById("buy-qty").value);

  if (!ticker)          { showTradeMsg("buy", "⚠ Introduce un ticker", "error"); return; }
  if (!qty || qty < 1)  { showTradeMsg("buy", "⚠ Cantidad debe ser ≥ 1", "error"); return; }

  showTradeMsg("buy", "Consultando precio real…", "");

  let price;
  try { price = await fetchPrice(ticker); } catch (err) { showTradeMsg("buy", `✗ ${err.message}`, "error"); return; }

  const total = price * qty;
  const bal   = getBalance();
  const cur   = getCurrency();
  const port  = getPortfolio();

  if (total > bal) {
    showTradeMsg("buy", `✗ Saldo insuficiente (necesitas ${formatAmount(total, cur)})`, "error");
    return;
  }

  setBalance(bal - total);

  if (port[ticker]) {
    const { qty: oldQty, avgPrice: oldAvg } = port[ticker];
    const newQty = oldQty + qty;
    const newAvg = ((oldAvg * oldQty) + (price * qty)) / newQty;
    port[ticker] = { qty: newQty, avgPrice: parseFloat(newAvg.toFixed(4)) };
  } else { port[ticker] = { qty, avgPrice: price }; }

  addHistory({ type: "buy", market: activeMarket, ticker, qty, price, total, pnl: null });
  saveToStorage();
  renderAll();
  populateSellSelect();
  resetBuyForm();

  showTradeMsg("buy", `✔ ${qty}x ${ticker} a ${formatAmount(price, cur)}`, "success");
  showToast(`✔ COMPRA: ${qty}x ${ticker}`, "success");
  updateGlobalNetWorth(); // Refrescar patrimonio total
}

// ─────────────────────────────────────────────────────────────
// VENTA
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

  priceEl.textContent = "—"; priceEl.dataset.price = ""; priceEl.dataset.avgPrice = "";
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
    priceEl.textContent = "Error"; showToast(`Error obteniendo precio`, "error");
  }
}

function updateSellReturn() {
  const price    = parseFloat(document.getElementById("sell-price").dataset.price)    || 0;
  const avgPrice = parseFloat(document.getElementById("sell-price").dataset.avgPrice) || 0;
  const qty      = parseInt(document.getElementById("sell-qty").value) || 0;
  const cur      = getCurrency();

  const returnTotal = qty * price;
  const pnl         = qty * (price - avgPrice);

  document.getElementById("sell-total-return").textContent = returnTotal > 0 ? formatAmount(returnTotal, cur) : "—";
  const pnlEl = document.getElementById("sell-pnl-est");
  
  if (qty > 0 && price > 0) {
    pnlEl.textContent = (pnl >= 0 ? "+" : "") + formatAmount(pnl, cur);
    pnlEl.style.color = pnl > 0 ? "var(--neon-green)" : pnl < 0 ? "var(--neon-red)" : "var(--text-muted)";
  } else { pnlEl.textContent = "—"; pnlEl.style.color = ""; }
}

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
  try { price = await fetchPrice(ticker); } catch (err) { showTradeMsg("sell", `✗ ${err.message}`, "error"); return; }

  const total = price * qty;
  const pnl   = (price - pos.avgPrice) * qty;
  const cur   = getCurrency();

  setBalance(getBalance() + total);
  const newQty = pos.qty - qty;
  if (newQty <= 0) delete port[ticker]; else port[ticker].qty = newQty;

  if (activeMarket === "ES") stats.totalPlEs += pnl; else stats.totalPlUs += pnl;
  if (!stats.bestOp  || pnl > stats.bestOp.pnl)  stats.bestOp  = { ticker, pnl, currency: cur, market: activeMarket };
  if (!stats.worstOp || pnl < stats.worstOp.pnl) stats.worstOp = { ticker, pnl, currency: cur, market: activeMarket };

  addHistory({ type: "sell", market: activeMarket, ticker, qty, price, total, pnl });
  saveToStorage();
  renderAll();
  populateSellSelect();

  const pnlStr = (pnl >= 0 ? "+" : "") + formatAmount(pnl, cur);
  showTradeMsg("sell", `✔ ${qty}x ${ticker} vendidas | P&L: ${pnlStr}`, "success");
  showToast(`${pnl >= 0 ? "📈" : "📉"} VENTA: ${qty}x ${ticker}`, pnl >= 0 ? "success" : "info");

  document.getElementById("sell-ticker").value = "";
  document.getElementById("sell-price").textContent = "—";
  document.getElementById("sell-qty").value = "";
  document.getElementById("sell-total-return").textContent = "—";
  document.getElementById("sell-pnl-est").textContent = "—";
  document.getElementById("sell-max").textContent = "0";

  updateGlobalNetWorth();
}

async function refreshPortfolio() {
  const port = getPortfolio();
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
  updateGlobalNetWorth();
}


// ─────────────────────────────────────────────────────────────
// RENDER GLOBAL
// ─────────────────────────────────────────────────────────────

function renderAll() {
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

  const plEs = stats.totalPlEs; const plUs = stats.totalPlUs;
  document.getElementById("header-pl").textContent = `${plEs >= 0 ? "+" : ""}${formatAmount(plEs,"EUR")} / ${plUs >= 0 ? "+" : ""}${formatAmount(plUs,"USD")}`;
  
  const pill = document.getElementById("header-pl-pill");
  const totalPl = plEs + plUs; 
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
    const pos = port[ticker];
    const currentPrice = prices[ticker] ?? null;
    const currentVal   = currentPrice !== null ? currentPrice * pos.qty : null;
    const pnl          = currentPrice !== null ? (currentPrice - pos.avgPrice) * pos.qty : null;
    const pnlClass     = pnl === null ? "td-neutral" : pnl >= 0 ? "td-pos" : "td-neg";
    const pnlStr       = pnl === null ? "—" : (pnl >= 0 ? "+" : "") + formatAmount(pnl, cur);

    return `<tr>
      <td><span class="ticker-chip">${ticker}</span></td>
      <td>${pos.qty}</td>
      <td>${formatAmount(pos.avgPrice, cur)}</td>
      <td>${currentPrice !== null ? formatAmount(currentPrice, cur) : '<span class="td-neutral">—</span>'}</td>
      <td>${currentVal  !== null ? formatAmount(currentVal, cur) : '<span class="td-neutral">—</span>'}</td>
      <td class="${pnlClass}">${pnlStr}</td>
    </tr>`;
  }).join("");
}

function renderPortfolioSummary(prices) {
  const port = getPortfolio();
  let portfolioValue = 0;
  Object.entries(port).forEach(([ticker, pos]) => {
    const p = prices[ticker] ?? pos.avgPrice;
    portfolioValue += p * pos.qty;
  });

  const cash = getBalance();
  const total = cash + portfolioValue;
  const cur = getCurrency();

  document.getElementById("portfolio-value").textContent = formatAmount(portfolioValue, cur);
  document.getElementById("portfolio-cash").textContent  = formatAmount(cash, cur);
  document.getElementById("portfolio-total").textContent = formatAmount(total, cur);
}

// ─────────────────────────────────────────────────────────────
// PATRIMONIO TOTAL (NUEVA FUNCIÓN)
// ─────────────────────────────────────────────────────────────
function updateGlobalNetWorth() {
  const el = document.getElementById("header-networth");
  if(!el) return;
  if(!exchangeRate) { el.textContent = "Cargando..."; return; }
  
  let eurPortVal = 0; let usdPortVal = 0;
  const portEs = getPortfolioFor("ES");
  const portUs = getPortfolioFor("US");
  
  Object.values(portEs).forEach(p => eurPortVal += p.qty * p.avgPrice);
  Object.values(portUs).forEach(p => usdPortVal += p.qty * p.avgPrice);

  // Todo convertido a EUR
  const totalEur = balanceEs + eurPortVal + ((balanceUs + usdPortVal) / exchangeRate);
  el.textContent = formatAmount(totalEur, "EUR");
}


function renderStats() {
  const buysEs  = history.filter(h => h.type === "buy"  && h.market === "ES").length;
  const buysUs  = history.filter(h => h.type === "buy"  && h.market === "US").length;
  const sellsEs = history.filter(h => h.type === "sell" && h.market === "ES").length;
  const sellsUs = history.filter(h => h.type === "sell" && h.market === "US").length;

  document.getElementById("stat-ops").textContent    = buysEs + buysUs + sellsEs + sellsUs;
  document.getElementById("stat-buys").textContent   = buysEs + buysUs;
  document.getElementById("stat-sells").textContent  = sellsEs + sellsUs;
  document.getElementById("stat-ops-es").textContent = buysEs + sellsEs;
  document.getElementById("stat-ops-us").textContent = buysUs + sellsUs;

  document.getElementById("stat-pl-es").textContent = (stats.totalPlEs >= 0 ? "+" : "") + formatAmount(stats.totalPlEs, "EUR");
  document.getElementById("stat-pl-us").textContent = (stats.totalPlUs >= 0 ? "+" : "") + formatAmount(stats.totalPlUs, "USD");

  if (stats.bestOp)  document.getElementById("stat-best").textContent = `${stats.bestOp.ticker} +${formatAmount(stats.bestOp.pnl, stats.bestOp.currency)}`;
  if (stats.worstOp) document.getElementById("stat-worst").textContent = `${stats.worstOp.ticker} ${formatAmount(stats.worstOp.pnl, stats.worstOp.currency)}`;
}

function renderHistory() {
  const container = document.getElementById("history-list");
  let filtered = history;
  if (historyFilter === "ES")   filtered = history.filter(h => h.market === "ES");
  if (historyFilter === "US")   filtered = history.filter(h => h.market === "US");
  if (historyFilter === "xfer") filtered = history.filter(h => h.type   === "xfer");

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-history">Sin operaciones</div>'; return;
  }

  container.innerHTML = filtered.map(op => {
    if (op.type === "xfer") {
      const isEsToUs = op.dir === "ES_TO_US";
      return `<div class="history-item xfer"><span class="history-badge xfer">TRASP.</span><div class="history-detail"><span class="history-market">${isEsToUs ? "🇪🇸→🇺🇸" : "🇺🇸→🇪🇸"}</span><div class="history-info">${formatAmount(op.amountFrom, isEsToUs?"EUR":"USD")} → ${formatAmount(op.amountTo, isEsToUs?"USD":"EUR")}</div><div class="history-date">${op.date}</div></div><div class="history-pnl neu">⇄</div></div>`;
    }
    const isBuy = op.type === "buy";
    const cur = op.market === "ES" ? "EUR" : "USD";
    let pnlHtml = op.pnl !== null ? `<div class="history-pnl ${op.pnl>0?"pos":op.pnl<0?"neg":"neu"}">${op.pnl>=0?"+":""}${formatAmount(op.pnl, cur)}</div>` : `<div class="history-pnl neu">—</div>`;

    return `<div class="history-item ${op.type}"><span class="history-badge ${op.type}">${isBuy ? "COMPRA" : "VENTA"}</span><div class="history-detail"><span class="history-ticker">${op.ticker}</span><div class="history-info">${op.qty}x ${formatAmount(op.price, cur)}</div><div class="history-date">${op.date}</div></div>${pnlHtml}</div>`;
  }).join("");
}

function filterHistory(filter) {
  historyFilter = filter;
  ["all","es","us","xfer"].forEach(id => document.getElementById(`hf-${id}`).classList.toggle("active", id === filter));
  renderHistory();
}

function updateXpBar() {
  const ops = history.filter(h => h.type !== "xfer").length;
  document.getElementById("xp-bar").style.width = (((ops % 5) / 5) * 100) + "%";
  document.getElementById("xp-label").textContent = `NIVEL ${Math.floor(ops / 5) + 1}`;
}

// ─────────────────────────────────────────────────────────────
// TRANSFERENCIA DE FONDOS
// ─────────────────────────────────────────────────────────────

async function openTransferModal() {
  document.getElementById("modal-transfer").classList.remove("hidden");
  document.getElementById("transfer-amount").value = "";
  document.getElementById("transfer-msg").textContent = "";
  document.getElementById("tp-from-val").textContent = "—"; document.getElementById("tp-to-val").textContent = "—";
  updateTransferBalances();
  await loadExchangeRate(false);
}

function closeTransferModal() { document.getElementById("modal-transfer").classList.add("hidden"); }

async function loadExchangeRate(silent = false) {
  const el = document.getElementById("er-value");
  if(el) el.textContent = "Cargando…";
  try {
    const res  = await fetch(EXCHANGE_API);
    const data = await res.json();
    exchangeRate = data.rates.USD;
    if(el) el.textContent = `1 EUR = ${exchangeRate.toFixed(4)} USD`;
    if(!silent) updateTransferPreview();
    updateGlobalNetWorth(); 
  } catch (err) {
    exchangeRate = 1.08;
    if(el) el.textContent = `~1 EUR = ${exchangeRate.toFixed(4)} USD (est.)`;
    if(!silent) showToast("TC en modo estimado", "info");
    updateGlobalNetWorth();
  }
}

function setTransferDir(dir) {
  transferDir = dir;
  document.getElementById("dir-es-us").classList.toggle("active", dir === "ES_TO_US");
  document.getElementById("dir-us-es").classList.toggle("active", dir === "US_TO_ES");
  const isEsToUs = dir === "ES_TO_US";
  document.getElementById("transfer-label").textContent = isEsToUs ? "IMPORTE EN EUR A ENVIAR" : "IMPORTE EN USD A ENVIAR";
  document.getElementById("tp-from-lbl").textContent = isEsToUs ? "Envías desde 🇪🇸" : "Envías desde 🇺🇸";
  document.getElementById("tp-to-lbl").textContent   = isEsToUs ? "Recibes en 🇺🇸"   : "Recibes en 🇪🇸";
  updateTransferPreview();
}

function updateTransferPreview() {
  if (!exchangeRate) return;
  const amount = parseFloat(document.getElementById("transfer-amount").value) || 0;
  const isEsToUs = transferDir === "ES_TO_US";
  const converted = isEsToUs ? amount * exchangeRate : amount / exchangeRate;
  document.getElementById("tp-from-val").textContent = amount > 0 ? formatAmount(amount, isEsToUs?"EUR":"USD") : "—";
  document.getElementById("tp-to-val").textContent   = amount > 0 ? formatAmount(converted, isEsToUs?"USD":"EUR") : "—";
}

function updateTransferBalances() {
  document.getElementById("transfer-balances").innerHTML = `
    <div class="tb-item"><span>🇪🇸 EUR</span><span class="tb-val" style="color:var(--es-color)">${formatAmount(balanceEs, "EUR")}</span></div>
    <div class="tb-item"><span>🇺🇸 USD</span><span class="tb-val" style="color:var(--us-color)">${formatAmount(balanceUs, "USD")}</span></div>
  `;
}

function executeTransfer() {
  const amount   = parseFloat(document.getElementById("transfer-amount").value);
  const msgEl    = document.getElementById("transfer-msg");
  if (!amount || amount <= 0 || !exchangeRate) { msgEl.textContent = "⚠ Revisa importe y conexión"; msgEl.className = "trade-msg error"; return; }

  const isEsToUs = transferDir === "ES_TO_US";
  if (isEsToUs) {
    if (amount > balanceEs) { msgEl.textContent = `✗ Saldo insuficiente`; msgEl.className = "trade-msg error"; return; }
    const converted = parseFloat((amount * exchangeRate).toFixed(2));
    balanceEs -= amount; balanceUs = parseFloat((balanceUs + converted).toFixed(2));
    addHistoryXfer({ dir: "ES_TO_US", amountFrom: amount, amountTo: converted, rate: exchangeRate });
  } else {
    if (amount > balanceUs) { msgEl.textContent = `✗ Saldo insuficiente`; msgEl.className = "trade-msg error"; return; }
    const converted = parseFloat((amount / exchangeRate).toFixed(2));
    balanceUs -= amount; balanceEs = parseFloat((balanceEs + converted).toFixed(2));
    addHistoryXfer({ dir: "US_TO_ES", amountFrom: amount, amountTo: converted, rate: exchangeRate });
  }

  saveToStorage(); renderAll(); updateTransferBalances(); updateGlobalNetWorth();
  document.getElementById("transfer-amount").value = "";
  document.getElementById("tp-from-val").textContent = "—"; document.getElementById("tp-to-val").textContent = "—";
  msgEl.textContent = "✔ Transferencia realizada"; msgEl.className = "trade-msg success";
  setTimeout(closeTransferModal, 1200);
}

// ─────────────────────────────────────────────────────────────
// HELPERS E HISTORIAL
// ─────────────────────────────────────────────────────────────
function addHistory(op) { op.date = nowDate(); history.unshift(op); if(history.length>300) history.pop(); }
function addHistoryXfer(op) { op.type = "xfer"; op.market = "XFER"; op.date = nowDate(); history.unshift(op); if(history.length>300) history.pop(); }
function nowDate() { return new Date().toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }

function openResetModal()  { document.getElementById("modal-reset").classList.remove("hidden"); }
function closeResetModal() { document.getElementById("modal-reset").classList.add("hidden"); }
function confirmReset() {
  Object.values(LS_KEYS).forEach(k => localStorage.removeItem(k));
  resetState(); saveToStorage(); closeResetModal(); renderAll(); renderTickerChips(); populateSellSelect(); resetBuyForm();
  showToast("✔ SIMULACIÓN REINICIADA", "success");
}

function resetBuyForm() {
  document.getElementById("buy-ticker").value = ""; document.getElementById("buy-qty").value = "";
  document.getElementById("buy-price").textContent = "—"; document.getElementById("buy-price").dataset.price = "";
  document.getElementById("buy-badge").textContent = ""; document.getElementById("buy-total-cost").textContent = "—";
  document.getElementById("buy-balance-hint").textContent = ""; document.getElementById("buy-msg").textContent = "";
}

function showTradeMsg(form, msg, type) { const el = document.getElementById(`${form}-msg`); el.textContent = msg; el.className = `trade-msg ${type}`; }

let toastTimer = null;
function showToast(msg, type = "info") {
  const el = document.getElementById("toast"); el.textContent = msg; el.className = `toast ${type} show`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3500);
}

function formatAmount(value, currency) {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "es-ES", {
    style: "currency", currency: currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}