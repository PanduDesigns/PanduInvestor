/* ═══════════════════════════════════════════════════════════════
   PANDU INVESTOR — script.js
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

// ─────────────────────────────────────────────────────────────
// CÁLCULO DE COMISIONES Y FISCALIDAD REALISTA
// ─────────────────────────────────────────────────────────────

/**
 * Simula la ejecución parcial de una orden de compra en varios tramos.
 * Basado en la liquidez real del mercado:
 *  - Órdenes pequeñas (<500€/$): 1 tramo  (90% de los casos)
 *  - Órdenes medianas (500–5000): 1–2 tramos
 *  - Órdenes grandes (>5000):    1–3 tramos
 * La comisión se cobra POR TRAMO (mínimo 3€/$ por tramo, o 0.1% si es mayor).
 * Esto replica el modelo de brokers como DeGiro, ING, BBVA, Sabadell, etc.
 */
function calcBuyFees(totalCost, market) {
  const currency = market === "ES" ? "EUR" : "USD";
  const minFeePerTranche = market === "ES" ? 3.0 : 1.0;   // DeGiro ES: 3€/op; US: $1/op
  const pctFeePerTranche = 0.001;                           // 0.10% por tramo
  const fixedFeeBase     = market === "ES" ? 2.0 : 0.50;   // comisión fija adicional bolsa

  // Determinar número de tramos según tamaño de la orden
  let maxTranches;
  if (totalCost < 500)        maxTranches = 1;
  else if (totalCost < 2000)  maxTranches = 2;
  else if (totalCost < 8000)  maxTranches = 2;
  else                         maxTranches = 3;

  // Número real de tramos (aleatorio con sesgo hacia 1)
  const rand = Math.random();
  let tranches;
  if (maxTranches === 1) {
    tranches = 1;
  } else if (maxTranches === 2) {
    tranches = rand < 0.65 ? 1 : 2;
  } else {
    tranches = rand < 0.50 ? 1 : rand < 0.80 ? 2 : 3;
  }

  // Comisión por tramo = máx(mínimo, porcentaje) + fija bolsa (solo en ES)
  const feePerTranche = Math.max(minFeePerTranche, totalCost * pctFeePerTranche);
  let totalFee = feePerTranche * tranches;
  if (market === "ES") totalFee += fixedFeeBase; // Canon de bolsa española

  return { tranches, totalFee, feePerTranche, currency };
}

/**
 * Calcula impuestos y comisiones de venta según fiscalidad española.
 * Impuesto sobre plusvalías (IRPF España, Base del Ahorro 2024):
 *   - Hasta 6.000€ de ganancia:    19%
 *   - De 6.000 a 50.000€:          21%
 *   - Más de 50.000€:               23%
 * Comisión de venta: igual que compra (0.10% mín. 3€).
 * Para mercado US: misma retención (inversor español en el extranjero).
 */
function calcSellFees(grossReturn, costBasis, market) {
  const currency = market === "ES" ? "EUR" : "USD";
  const gain = grossReturn - costBasis;

  // Comisión del bróker (misma lógica que compra)
  const minFee = market === "ES" ? 3.0 : 1.0;
  const brokerFee = Math.max(minFee, grossReturn * 0.001) + (market === "ES" ? 2.0 : 0.50);

  // Impuesto sobre plusvalías (solo si hay ganancia)
  let taxAmount = 0;
  let taxBreakdown = [];
  if (gain > 0) {
    const tramos = [
      { limit: 6000,  rate: 0.19 },
      { limit: 44000, rate: 0.21 }, // 6k a 50k
      { limit: Infinity, rate: 0.23 }
    ];
    let remaining = gain;
    let prevLimit = 0;
    for (const tramo of tramos) {
      if (remaining <= 0) break;
      const chunkSize = Math.min(remaining, tramo.limit - prevLimit);
      if (chunkSize <= 0) { prevLimit = tramo.limit; continue; }
      const tax = chunkSize * tramo.rate;
      taxAmount += tax;
      taxBreakdown.push({ from: prevLimit, to: prevLimit + chunkSize, rate: tramo.rate, tax });
      remaining -= chunkSize;
      prevLimit = tramo.limit;
    }
  }

  const totalDeductions = brokerFee + taxAmount;
  const netReturn = grossReturn - totalDeductions;

  return { brokerFee, taxAmount, taxBreakdown, totalDeductions, netReturn, gain, currency };
}

// Estado Global
let state = {
  market: "ES", 
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

// Variables para la Gráfica Interactiva
let currentChartData = [];
let currentChartTicker = "";
let chartZoom = 1;
let chartPanX = 0;

// ─────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────

window.addEventListener("load", () => {
  loadFromLS();
  updateUI();
  renderTickerChips();
  setupChartInteractions();
  
  setInterval(refreshPortfolio, 30000);
  refreshPortfolio(); // Carga inicial de precios al abrir
});

function loadFromLS() {
  state.balanceEs   = parseFloat(localStorage.getItem(LS_KEYS.balanceEs));
  if (isNaN(state.balanceEs)) state.balanceEs = INITIAL_BALANCE_ES;
  
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
      fetchBuyPrice(); 
    };
    container.appendChild(div);
  });
  container.style.display = "block";
}

// ─────────────────────────────────────────────────────────────
// GRÁFICA: RENDERIZADO (INLINE + FULLSCREEN)
// ─────────────────────────────────────────────────────────────

async function loadInlineChart(ticker) {
  const container = document.getElementById("inline-chart-container");
  const canvas = document.getElementById("inline-chart");
  const ctx = canvas.getContext("2d");
  
  currentChartTicker = ticker;
  currentChartData = [];
  chartZoom = 1;
  chartPanX = 0;

  // Forzar cálculo de layout en móvil antes de coger medidas
  container.classList.add("active");
  void container.offsetWidth; 
  
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = 220; 
  
  ctx.clearRect(0,0, canvas.width, canvas.height);
  ctx.fillStyle = "#5a7a9a";
  ctx.font = "12px 'Share Tech Mono'";
  ctx.textAlign = "center";
  ctx.fillText("Cargando análisis técnico avanzado...", canvas.width/2, canvas.height/2);

  try {
    const targetUrl = `${YF_URL}${encodeURIComponent(ticker)}?interval=1d&range=6mo`;
    const res = await fetch(CORS_PROXY + encodeURIComponent(targetUrl));
    const data = await res.json();
    
    const result = data.chart.result[0];
    const quote = result.indicators.quote[0];
    const timestamps = result.timestamp;
    
    for (let i = 0; i < quote.close.length; i++) {
        if (quote.close[i] && quote.open[i]) {
            const dateObj = new Date(timestamps[i] * 1000);
            const dateStr = dateObj.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
            
            currentChartData.push({ 
                o: quote.open[i], h: quote.high[i], l: quote.low[i], c: quote.close[i], dateStr: dateStr
            });
        }
    }
    if(currentChartData.length > 0) {
        drawCandlesticks(canvas, currentChartData, 1, 0);
    }
  } catch(e) {
    ctx.clearRect(0,0, canvas.width, canvas.height);
    ctx.fillText("Gráfica no disponible", canvas.width/2, canvas.height/2);
  }
}

function drawCandlesticks(canvas, data, zoom, panX) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  
  if(rect.width === 0) return;

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { t: 20, b: 25, l: 10, r: 45 }; 
  const drawW = w - pad.l - pad.r;
  const drawH = h - pad.t - pad.b;

  ctx.clearRect(0, 0, w, h);

  if (!data || data.length === 0) return;

  const baseSpacing = drawW / data.length;
  const spacing = baseSpacing * zoom;
  const candleW = Math.max(1, spacing * 0.7);

  let visibleCandles = data.filter((d, i) => {
      const reverseIdx = data.length - 1 - i;
      const x = (w - pad.r) - (reverseIdx * spacing) - (spacing / 2) + panX;
      return x >= pad.l && x <= w - pad.r;
  });
  
  if(visibleCandles.length === 0) visibleCandles = data;

  const maxH = Math.max(...visibleCandles.map(d => d.h));
  const minL = Math.min(...visibleCandles.map(d => d.l));
  const range = (maxH - minL) || 1;

  ctx.font = "10px 'Share Tech Mono'";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const gridSteps = 4;

  for(let i=0; i<=gridSteps; i++) {
    const y = pad.t + (i/gridSteps) * drawH;
    const price = maxH - (i/gridSteps) * range;
    
    ctx.strokeStyle = "rgba(0, 229, 255, 0.08)"; 
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillStyle = "#a8c0d8";
    ctx.fillText(price.toFixed(2), w - pad.r + 5, y);
  }

  data.forEach((d, i) => {
    const reverseIdx = data.length - 1 - i;
    const x = (w - pad.r) - (reverseIdx * spacing) - (spacing / 2) + panX;

    if (x < pad.l - candleW || x > w - pad.r + candleW) return;

    const yO = pad.t + (1 - (d.o - minL) / range) * drawH;
    const yC = pad.t + (1 - (d.c - minL) / range) * drawH;
    const yH = pad.t + (1 - (d.h - minL) / range) * drawH;
    const yL = pad.t + (1 - (d.l - minL) / range) * drawH;

    const color = d.c >= d.o ? "#00ff88" : "#ff3a5c"; 
    
    ctx.strokeStyle = color; 
    ctx.fillStyle = color;
    
    ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke();
    
    const bodyTop = Math.min(yO, yC);
    const bodyHeight = Math.max(1, Math.abs(yO - yC));
    ctx.fillRect(x - candleW/2, bodyTop, candleW, bodyHeight);

    const showEvery = Math.max(1, Math.floor(data.length / (5 * zoom)));
    if (i % showEvery === 0 || i === data.length - 1) {
        ctx.fillStyle = "#5a7a9a";
        ctx.textAlign = "center";
        ctx.fillText(d.dateStr, x, h - 5);
        ctx.strokeStyle = "rgba(255,255,255,0.05)";
        ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b + 5); ctx.stroke();
    }
  });
}

// ─────────────────────────────────────────────────────────────
// INTERACTIVIDAD Y MODAL DE LA GRÁFICA
// ─────────────────────────────────────────────────────────────

// Esta función es llamada desde el HTML ahora (onclick="openChartModal()")
function openChartModal() {
    if (currentChartData.length > 0) {
         document.getElementById("modal-chart-fs").classList.remove("hidden");
         document.getElementById("fs-chart-title").textContent = `${currentChartTicker} - ANÁLISIS`;
         setTimeout(() => {
            const fsCanvas = document.getElementById("fullscreen-chart");
            drawCandlesticks(fsCanvas, currentChartData, chartZoom, chartPanX);
         }, 50);
     }
}

function setupChartInteractions() {
  const fsCanvas = document.getElementById("fullscreen-chart");
  
  let isDragging = false;
  let startClientX = 0;

  fsCanvas.addEventListener('pointerdown', (e) => {
      isDragging = true;
      startClientX = e.clientX;
      fsCanvas.setPointerCapture(e.pointerId);
  });
  
  fsCanvas.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startClientX;
      chartPanX += deltaX; 
      startClientX = e.clientX;
      
      const rect = fsCanvas.getBoundingClientRect();
      const drawW = rect.width - 10 - 45; 
      const totalGraphW = (drawW / currentChartData.length) * chartZoom * currentChartData.length;
      
      const maxPanX = Math.max(0, totalGraphW - drawW);
      chartPanX = Math.max(0, Math.min(chartPanX, maxPanX));
      
      drawCandlesticks(fsCanvas, currentChartData, chartZoom, chartPanX);
  });
  
  fsCanvas.addEventListener('pointerup', () => isDragging = false);
  fsCanvas.addEventListener('pointercancel', () => isDragging = false);

  fsCanvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY * -0.005;
      chartZoom += zoomDelta;
      chartZoom = Math.max(1, Math.min(chartZoom, 20)); 
      drawCandlesticks(fsCanvas, currentChartData, chartZoom, chartPanX);
  });

  let initialPinchDist = null;
  fsCanvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
          initialPinchDist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
          );
      }
  }, {passive: false});
  
  fsCanvas.addEventListener('touchmove', (e) => {
      e.preventDefault(); 
      if (e.touches.length === 2 && initialPinchDist) {
          const currentDist = Math.hypot(
              e.touches[0].clientX - e.touches[1].clientX,
              e.touches[0].clientY - e.touches[1].clientY
          );
          const zoomDelta = (currentDist - initialPinchDist) * 0.02;
          chartZoom += zoomDelta;
          chartZoom = Math.max(1, Math.min(chartZoom, 20));
          initialPinchDist = currentDist;
          drawCandlesticks(fsCanvas, currentChartData, chartZoom, chartPanX);
      }
  }, {passive: false});
  
  fsCanvas.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) initialPinchDist = null;
  });

  window.addEventListener('resize', () => {
      if (!document.getElementById("modal-chart-fs").classList.contains("hidden")) {
         drawCandlesticks(fsCanvas, currentChartData, chartZoom, chartPanX);
      }
  });
}

function closeChartModal() {
    document.getElementById("modal-chart-fs").classList.add("hidden");
    drawCandlesticks(document.getElementById("inline-chart"), currentChartData, chartZoom, chartPanX);
}

// ─────────────────────────────────────────────────────────────
// LÓGICA DE TRADING Y ESTADO
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

  if (total > 0) {
    const fees = calcBuyFees(total, state.market);
    const totalWithFees = total + fees.totalFee;
    document.getElementById("buy-total-cost").innerHTML =
      `${formatAmount(totalWithFees, getCurrency())} <span style="font-size:0.75em;color:var(--text-muted);">(+${formatAmount(fees.totalFee, getCurrency())} comis.)</span>`;
    const hint = document.getElementById("buy-balance-hint");
    hint.textContent = `SALDO DISPONIBLE: ${formatAmount(balance, getCurrency())}`;
    hint.style.color = totalWithFees > balance ? "var(--neon-red)" : "var(--text-muted)";
  } else {
    document.getElementById("buy-total-cost").textContent = "—";
    const hint = document.getElementById("buy-balance-hint");
    hint.textContent = `SALDO DISPONIBLE: ${formatAmount(balance, getCurrency())}`;
    hint.style.color = "var(--text-muted)";
  }
}

function executeBuy() {
  const ticker = document.getElementById("buy-price").dataset.ticker;
  const price = parseFloat(document.getElementById("buy-price").dataset.price);
  const qty = parseInt(document.getElementById("buy-qty").value);
  
  if(!ticker || !price || qty <= 0) { showToast("Datos de compra inválidos", "error"); return; }
  
  const cost = price * qty;
  const fees = calcBuyFees(cost, state.market);
  const totalWithFees = cost + fees.totalFee;
  const balanceKey = state.market === "ES" ? "balanceEs" : "balanceUs";
  
  if(state[balanceKey] < totalWithFees) { showToast("Saldo insuficiente (incluyendo comisiones)", "error"); return; }
  
  state[balanceKey] -= totalWithFees;
  
  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs;
  const pos = portfolio.find(p => p.ticker === ticker);
  if(pos) {
    pos.price = ((pos.price * pos.qty) + (price * qty)) / (pos.qty + qty);
    pos.qty += qty;
  } else {
    portfolio.push({ ticker, qty, price });
  }
  
  addHistory("COMPRA", ticker, qty, price, state.market);
  updateStats("buy", cost, state.market);
  
  saveToLS();
  updateUI();
  resetBuyForm();
  showBuyFeeModal(ticker, qty, price, cost, fees);
}

function addHistory(type, ticker, qty, price, market) {
  state.history.unshift({ type, ticker, qty, price, market, date: new Date().toISOString() });
}

function updateStats(type, amount, market) {
  state.stats.ops++;
  if(type === 'buy') state.stats.buys++;
  if(type === 'sell') state.stats.sells++;
  if(market === 'ES') state.stats.opsEs++; else state.stats.opsUs++;
}

// ─────────────────────────────────────────────────────────────
// INTERFAZ, UTILIDADES Y FUNCIONES QUE FALTABAN
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
  populateSellSelect();
  updateNetWorth();
  renderHistory();
  renderStats();
}

function renderPortfolio() {
  const container = document.getElementById("portfolio-body");
  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs;
  const currency = getCurrency();
  
  container.innerHTML = "";
  if(portfolio.length === 0) {
    container.innerHTML = '<tr><td colspan="6" class="empty-row">No hay posiciones</td></tr>';
    document.getElementById("portfolio-value").textContent = formatAmount(0, currency);
    document.getElementById("portfolio-total").textContent = formatAmount(state.market === "ES" ? state.balanceEs : state.balanceUs, currency);
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

function updateNetWorth() {
  let totalPortfolioEs = 0;
  let totalPortfolioUs = 0;
  
  state.portfolioEs.forEach(pos => {
      totalPortfolioEs += (pos.currentPrice || pos.price) * pos.qty;
  });
  state.portfolioUs.forEach(pos => {
      totalPortfolioUs += (pos.currentPrice || pos.price) * pos.qty;
  });

  // Cálculo en Euros sumando todo (usando exchange rate para convertir USD a EUR)
  const totalEur = state.balanceEs + totalPortfolioEs + ((state.balanceUs + totalPortfolioUs) / state.exchangeRate);
  const totalCostEur = INITIAL_BALANCE_ES + (INITIAL_BALANCE_US / state.exchangeRate);

  document.getElementById("header-networth").textContent = formatAmount(totalEur, "EUR");

  const pl = totalEur - totalCostEur;
  const plEl = document.getElementById("header-pl");
  plEl.textContent = `${pl >= 0 ? '+' : ''}${formatAmount(pl, "EUR")}`;
  
  const headerPlPill = document.getElementById("header-pl-pill");
  if (pl >= 0) {
     headerPlPill.classList.add("gain");
     headerPlPill.classList.remove("loss");
  } else {
     headerPlPill.classList.add("loss");
     headerPlPill.classList.remove("gain");
  }
}

function renderStats() {
  document.getElementById("stat-ops").textContent = state.stats.ops;
  document.getElementById("stat-buys").textContent = state.stats.buys;
  document.getElementById("stat-sells").textContent = state.stats.sells;
  document.getElementById("stat-ops-es").textContent = state.stats.opsEs;
  document.getElementById("stat-ops-us").textContent = state.stats.opsUs;
  
  const plEsEl = document.getElementById("stat-pl-es");
  plEsEl.textContent = formatAmount(state.stats.plEs, "EUR");
  plEsEl.className = `stat-card-val ${state.stats.plEs >= 0 ? 'green' : 'red'}`;
  
  const plUsEl = document.getElementById("stat-pl-us");
  plUsEl.textContent = formatAmount(state.stats.plUs, "USD");
  plUsEl.className = `stat-card-val ${state.stats.plUs >= 0 ? 'green' : 'red'}`;

  document.getElementById("stat-best").textContent = state.stats.best ? `${state.stats.best.ticker} (+${(state.stats.best.pct*100).toFixed(2)}%)` : "—";
  document.getElementById("stat-worst").textContent = state.stats.worst ? `${state.stats.worst.ticker} (${(state.stats.worst.pct*100).toFixed(2)}%)` : "—";
}

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
  document.getElementById("tab-buy").classList.toggle("active", tab === 'buy');
  document.getElementById("tab-sell").classList.toggle("active", tab === 'sell');
  document.getElementById("form-buy").classList.toggle("hidden", tab !== 'buy');
  document.getElementById("form-sell").classList.toggle("hidden", tab !== 'sell');
  if (tab === 'sell') populateSellSelect();
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

// ─────────────────────────────────────────────────────────────
// IMPLEMENTACIÓN DE LAS FUNCIONES RESTANTES
// ─────────────────────────────────────────────────────────────

async function refreshPortfolio() {
  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs;
  if (portfolio.length === 0) return;
  
  const btn = document.querySelector(".btn-refresh");
  if (btn) btn.textContent = "↻ Cargando...";
  
  for(let pos of portfolio) {
    try {
      const price = await fetchPrice(pos.ticker);
      pos.currentPrice = price;
    } catch(e) {}
  }
  
  updateUI();
  if (btn) btn.textContent = "↻ ACTUALIZAR";
}

function populateSellSelect() {
  const select = document.getElementById("sell-ticker");
  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs;
  select.innerHTML = '<option value="">— Selecciona —</option>';
  portfolio.forEach(p => {
    select.innerHTML += `<option value="${p.ticker}">${p.ticker} (${p.qty} accs)</option>`;
  });
}

async function onSellTickerChange() {
  const ticker = document.getElementById("sell-ticker").value;
  if(!ticker) {
    document.getElementById("sell-price").textContent = "—";
    document.getElementById("sell-max").textContent = "0";
    return;
  }
  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs;
  const pos = portfolio.find(p => p.ticker === ticker);
  document.getElementById("sell-max").textContent = pos ? pos.qty : 0;
  document.getElementById("sell-price").textContent = "Cargando...";
  
  try {
    const price = await fetchPrice(ticker);
    document.getElementById("sell-price").dataset.price = price;
    document.getElementById("sell-price").textContent = formatAmount(price, getCurrency());
    if(pos) pos.currentPrice = price; 
    updateSellReturn();
  } catch(e) {
    document.getElementById("sell-price").textContent = "Error";
  }
}

function updateSellReturn() {
  const price = parseFloat(document.getElementById("sell-price").dataset.price) || 0;
  const qty = parseInt(document.getElementById("sell-qty").value) || 0;
  const ticker = document.getElementById("sell-ticker").value;
  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs;
  const pos = portfolio.find(p => p.ticker === ticker);

  if(pos && qty > 0) {
    const grossReturn = price * qty;
    const costBasis = pos.price * qty;
    const fees = calcSellFees(grossReturn, costBasis, state.market);
    
    document.getElementById("sell-total-return").innerHTML =
      `${formatAmount(fees.netReturn, getCurrency())} <span style="font-size:0.75em;color:var(--text-muted);">(−${formatAmount(fees.totalDeductions, getCurrency())} tasas)</span>`;
    
    const pnlNet = fees.netReturn - costBasis;
    const pnlEl = document.getElementById("sell-pnl-est");
    pnlEl.textContent = formatAmount(pnlNet, getCurrency());
    pnlEl.className = pnlNet >= 0 ? "green" : "red";
  } else {
    document.getElementById("sell-total-return").textContent = "—";
    document.getElementById("sell-pnl-est").textContent = "—";
    document.getElementById("sell-pnl-est").className = "";
  }
}

function executeSell() {
  const ticker = document.getElementById("sell-ticker").value;
  const price = parseFloat(document.getElementById("sell-price").dataset.price);
  const qty = parseInt(document.getElementById("sell-qty").value);
  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs;
  const pos = portfolio.find(p => p.ticker === ticker);

  if(!pos || qty <= 0 || qty > pos.qty) return showToast("Cantidad inválida", "error");

  const grossReturn = price * qty;
  const costBasis   = pos.price * qty;
  const sellFees    = calcSellFees(grossReturn, costBasis, state.market);
  const pnlAfterFees = grossReturn - costBasis - sellFees.totalDeductions;

  if(state.market === "ES") {
    state.balanceEs += sellFees.netReturn;
    state.stats.plEs += pnlAfterFees;
  } else {
    state.balanceUs += sellFees.netReturn;
    state.stats.plUs += pnlAfterFees;
  }

  const pnlPct = (price / pos.price) - 1;
  if(!state.stats.best || pnlPct > state.stats.best.pct) state.stats.best = { ticker, pct: pnlPct };
  if(!state.stats.worst || pnlPct < state.stats.worst.pct) state.stats.worst = { ticker, pct: pnlPct };

  pos.qty -= qty;
  if(pos.qty === 0) {
    const idx = portfolio.indexOf(pos);
    portfolio.splice(idx, 1);
  }

  addHistory("VENTA", ticker, qty, price, state.market);
  updateStats("sell", grossReturn, state.market);
  
  saveToLS();
  updateUI();
  
  document.getElementById("sell-qty").value = "";
  document.getElementById("sell-ticker").value = "";
  onSellTickerChange();

  showSellFeeModal(ticker, qty, price, grossReturn, costBasis, sellFees);
}

function renderHistory(filter = 'all') {
  const container = document.getElementById("history-list");
  container.innerHTML = "";
  let filtered = state.history;
  
  if(filter !== 'all') {
    filtered = state.history.filter(h => h.market === filter || (filter === 'xfer' && h.type === 'TRASP.'));
  }
  
  if(filtered.length === 0) {
    container.innerHTML = '<div class="empty-history">Aún no hay operaciones</div>';
    return;
  }
  
  filtered.forEach(h => {
    const isEs = h.market === 'ES';
    const curr = isEs ? 'EUR' : 'USD';
    const val = h.type === 'TRASP.' ? `Tipo: ${h.price.toFixed(4)}` : formatAmount(h.price * h.qty, curr);
    
    container.innerHTML += `
      <div class="history-item ${h.type.toLowerCase() === 'venta' ? 'sell' : (h.type === 'TRASP.' ? 'xfer' : 'buy')}">
        <span class="history-badge" style="background:${h.type === 'COMPRA' ? 'rgba(0,255,136,0.1)' : (h.type === 'VENTA' ? 'rgba(255,58,92,0.1)' : 'rgba(0,229,255,0.1)')}; color:${h.type === 'COMPRA' ? 'var(--neon-green)' : (h.type === 'VENTA' ? 'var(--neon-red)' : 'var(--neon-cyan)')}">${h.type}</span>
        <div class="history-detail">
          <span class="history-ticker">${h.ticker}</span>
          ${h.qty > 0 ? `<br/><span style="color:var(--text-muted)">${h.qty} @ ${formatAmount(h.price, curr)}</span>` : ''}
        </div>
        <span class="history-pnl">${val}</span>
      </div>
    `;
  });
}

function filterHistory(f) {
  document.querySelectorAll(".hf-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(`hf-${f}`).classList.add("active");
  renderHistory(f);
}

function openTransferModal() {
  document.getElementById("modal-transfer").classList.remove("hidden");
  loadExchangeRate();
}
function closeTransferModal() { 
  document.getElementById("modal-transfer").classList.add("hidden"); 
}

function openResetModal() {
  document.getElementById("modal-reset").classList.remove("hidden");
}
function closeResetModal() { 
  document.getElementById("modal-reset").classList.add("hidden"); 
}

function confirmReset() {
  localStorage.clear();
  state.balanceEs = INITIAL_BALANCE_ES;
  state.balanceUs = INITIAL_BALANCE_US;
  state.portfolioEs = [];
  state.portfolioUs = [];
  state.history = [];
  state.stats = { ops: 0, buys: 0, sells: 0, opsEs: 0, opsUs: 0, plEs: 0, plUs: 0, best: null, worst: null };
  saveToLS();
  updateUI();
  closeResetModal();
  showToast("Juego reiniciado por completo", "success");
}

async function loadExchangeRate() {
  try {
    const res = await fetch(CORS_PROXY + encodeURIComponent(YF_URL + "EURUSD=X?interval=1d&range=1d"));
    const data = await res.json();
    state.exchangeRate = data.chart.result[0].meta.regularMarketPrice;
  } catch(e) {
    state.exchangeRate = 1.08; // Valor de respaldo por si falla Yahoo
  }
  document.getElementById("er-value").textContent = `1 EUR = ${state.exchangeRate.toFixed(4)} USD`;
  updateTransferPreview();
}

function setTransferDir(dir) {
  state.transferDir = dir;
  document.getElementById("dir-es-us").classList.toggle("active", dir === "ES_TO_US");
  document.getElementById("dir-us-es").classList.toggle("active", dir === "US_TO_ES");
  document.getElementById("transfer-amount").value = "";
  updateTransferPreview();
}

function updateTransferPreview() {
  const amt = parseFloat(document.getElementById("transfer-amount").value) || 0;
  const isEsToUs = state.transferDir === "ES_TO_US";
  
  document.getElementById("transfer-label").textContent = isEsToUs ? "IMPORTE EN EUR A ENVIAR" : "IMPORTE EN USD A ENVIAR";
  document.getElementById("tp-from-lbl").textContent = isEsToUs ? "Envías desde 🇪🇸" : "Envías desde 🇺🇸";
  document.getElementById("tp-to-lbl").textContent = isEsToUs ? "Recibes en 🇺🇸" : "Recibes en 🇪🇸";
  
  document.getElementById("tp-from-val").textContent = formatAmount(amt, isEsToUs ? "EUR" : "USD");
  
  let received = isEsToUs ? amt * state.exchangeRate : amt / state.exchangeRate;
  document.getElementById("tp-to-val").textContent = formatAmount(received, isEsToUs ? "USD" : "EUR");

  document.getElementById("transfer-balances").innerHTML = `
    <span>Saldo Disp: ${formatAmount(isEsToUs ? state.balanceEs : state.balanceUs, isEsToUs ? 'EUR' : 'USD')}</span>
  `;
}

function executeTransfer() {
  const amt = parseFloat(document.getElementById("transfer-amount").value);
  if(!amt || amt <= 0) return showToast("Importe inválido", "error");

  const isEsToUs = state.transferDir === "ES_TO_US";
  if(isEsToUs && state.balanceEs < amt) return showToast("Saldo EUR insuficiente", "error");
  if(!isEsToUs && state.balanceUs < amt) return showToast("Saldo USD insuficiente", "error");

  let received = isEsToUs ? amt * state.exchangeRate : amt / state.exchangeRate;
  
  if(isEsToUs) {
    state.balanceEs -= amt;
    state.balanceUs += received;
  } else {
    state.balanceUs -= amt;
    state.balanceEs += received;
  }

  addHistory("TRASP.", isEsToUs ? "EUR->USD" : "USD->EUR", 0, state.exchangeRate, isEsToUs ? "ES" : "US");
  saveToLS();
  updateUI();
  closeTransferModal();
  showToast("Transferencia completada", "success");
}
// ─────────────────────────────────────────────────────────────
// MODALES DE DESGLOSE DE COMISIONES Y FISCALIDAD
// ─────────────────────────────────────────────────────────────

function showBuyFeeModal(ticker, qty, price, cost, fees) {
  const curr = fees.currency;
  const fmt = (v) => formatAmount(v, curr);
  const trancheWord = fees.tranches === 1 ? "tramo" : "tramos";

  document.getElementById("fee-modal-title").textContent = "✅ COMPRA EJECUTADA";
  document.getElementById("fee-modal-icon").textContent = "🟢";
  document.getElementById("fee-modal-body").innerHTML = `
    <div class="fee-row fee-highlight">
      <span>${qty} × ${ticker}</span>
      <span>${fmt(price)} / acción</span>
    </div>
    <div class="fee-divider"></div>
    <div class="fee-row">
      <span>Valor de la orden</span>
      <span>${fmt(cost)}</span>
    </div>
    <div class="fee-row fee-tranche">
      <span>⚡ Ejecución en <strong>${fees.tranches} ${trancheWord}</strong></span>
      <span class="fee-badge-tranche">${fees.tranches === 1 ? 'Orden completa de una vez' : `Dividida en ${fees.tranches} ejecuciones parciales`}</span>
    </div>
    <div class="fee-row">
      <span>Comisión bróker (${fees.tranches} × ${fmt(fees.feePerTranche.toFixed(2))})</span>
      <span class="red">−${fmt(fees.totalFee)}</span>
    </div>
    ${curr === 'EUR' ? `<div class="fee-row fee-small"><span>Incluye canon bolsa española</span><span class="red">−${fmt(2.0)}</span></div>` : ''}
    <div class="fee-divider"></div>
    <div class="fee-row fee-total">
      <span>TOTAL DESEMBOLSADO</span>
      <span class="red">${fmt(cost + fees.totalFee)}</span>
    </div>
    <div class="fee-row fee-pct">
      <span>Coste efectivo de comisiones</span>
      <span>${((fees.totalFee / cost) * 100).toFixed(3)}% de la orden</span>
    </div>
  `;
  document.getElementById("modal-fees").classList.remove("hidden");
}

function showSellFeeModal(ticker, qty, price, grossReturn, costBasis, fees) {
  const curr = fees.currency;
  const fmt = (v) => formatAmount(v, curr);
  const hasGain = fees.gain > 0;
  const hasLoss = fees.gain < 0;

  let taxHtml = '';
  if (hasGain && fees.taxBreakdown.length > 0) {
    taxHtml = fees.taxBreakdown.map(t =>
      `<div class="fee-row fee-small"><span>  ${(t.rate*100).toFixed(0)}% sobre ${fmt(t.to - t.from)}</span><span class="red">−${fmt(t.tax)}</span></div>`
    ).join('');
  }

  const gainLabel = hasGain ? `<span class="green">+${fmt(fees.gain)}</span>` : hasLoss ? `<span class="red">${fmt(fees.gain)}</span>` : `<span>${fmt(0)}</span>`;

  document.getElementById("fee-modal-title").textContent = "💥 VENTA EJECUTADA";
  document.getElementById("fee-modal-icon").textContent = "🔴";
  document.getElementById("fee-modal-body").innerHTML = `
    <div class="fee-row fee-highlight">
      <span>${qty} × ${ticker}</span>
      <span>${fmt(price)} / acción</span>
    </div>
    <div class="fee-divider"></div>
    <div class="fee-row">
      <span>Retorno bruto</span>
      <span>${fmt(grossReturn)}</span>
    </div>
    <div class="fee-row">
      <span>Coste base (precio medio)</span>
      <span>${fmt(costBasis)}</span>
    </div>
    <div class="fee-row">
      <span>Plusvalía / Minusvalía</span>
      <span>${gainLabel}</span>
    </div>
    <div class="fee-divider"></div>
    <div class="fee-row">
      <span>Comisión bróker</span>
      <span class="red">−${fmt(fees.brokerFee)}</span>
    </div>
    ${curr === 'EUR' ? `<div class="fee-row fee-small"><span>Incluye canon bolsa española</span><span class="red">−${fmt(2.0)}</span></div>` : ''}
    ${hasGain ? `
    <div class="fee-row fee-tax-header">
      <span>🏛️ IRPF — Base del Ahorro (España)</span>
      <span class="red">−${fmt(fees.taxAmount)}</span>
    </div>
    ${taxHtml}
    ` : hasLoss ? `
    <div class="fee-row fee-tax-header">
      <span>🏛️ IRPF — Sin impuesto (minusvalía)</span>
      <span class="green">€0.00</span>
    </div>
    ` : ''}
    <div class="fee-divider"></div>
    <div class="fee-row fee-total">
      <span>TOTAL DEDUCCIONES</span>
      <span class="red">−${fmt(fees.totalDeductions)}</span>
    </div>
    <div class="fee-row fee-total-net">
      <span>NETO RECIBIDO EN CUENTA</span>
      <span class="${fees.netReturn >= costBasis ? 'green' : 'red'}">${fmt(fees.netReturn)}</span>
    </div>
  `;
  document.getElementById("modal-fees").classList.remove("hidden");
}

function closeFeeModal() {
  document.getElementById("modal-fees").classList.add("hidden");
}
