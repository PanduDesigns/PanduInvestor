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
  profile:     "sq_profile_v2"
};

const CORS_PROXY = "https://corsproxy.io/?";
const YF_URL     = "https://query1.finance.yahoo.com/v8/finance/chart/";
const YF_SEARCH  = "https://query1.finance.yahoo.com/v1/finance/search?q=";

// ─────────────────────────────────────────────────────────────
// GAMIFICACIÓN: SISTEMA DE NIVELES
// ─────────────────────────────────────────────────────────────
const LEVEL_SYSTEM = [
  { level: 1, xp: 0, title: "Novato del Ahorro", icon: "🌱" },
  { level: 2, xp: 500, title: "Manos de Papel", icon: "🧻" },
  { level: 3, xp: 1500, title: "Aprendiz de Trader", icon: "📘" },
  { level: 4, xp: 3000, title: "CryptoBro", icon: "💎" },
  { level: 5, xp: 6000, title: "Tiburón Financiero", icon: "🦈" },
  { level: 6, xp: 10000, title: "Lobo de Wall Street", icon: "🐺" },
  { level: 7, xp: 20000, title: "El Rey del Mercado", icon: "👑" },
  { level: 8, xp: 50000, title: "Pandu Legend", icon: "🚀" }
];

// ─────────────────────────────────────────────────────────────
// CÁLCULO DE COMISIONES Y FISCALIDAD REALISTA
// ─────────────────────────────────────────────────────────────

function calcBuyFees(totalCost, market) {
  const currency = market === "ES" ? "EUR" : "USD";
  const minFeePerTranche = market === "ES" ? 3.0 : 1.0; 
  const pctFeePerTranche = 0.001;                       
  const fixedFeeBase     = market === "ES" ? 2.0 : 0.50; 

  let maxTranches;
  if (totalCost < 500)        maxTranches = 1;
  else if (totalCost < 2000)  maxTranches = 2;
  else if (totalCost < 8000)  maxTranches = 2;
  else                         maxTranches = 3;

  const rand = Math.random();
  let tranches;
  if (maxTranches === 1) {
    tranches = 1;
  } else if (maxTranches === 2) {
    tranches = rand < 0.65 ? 1 : 2;
  } else {
    tranches = rand < 0.50 ? 1 : rand < 0.80 ? 2 : 3;
  }

  const feePerTranche = Math.max(minFeePerTranche, totalCost * pctFeePerTranche);
  let totalFee = feePerTranche * tranches;
  if (market === "ES") totalFee += fixedFeeBase; 

  return { tranches, totalFee, feePerTranche, currency };
}

function calcSellFees(grossReturn, costBasis, market) {
  const currency = market === "ES" ? "EUR" : "USD";
  const gain = grossReturn - costBasis;

  const minFee = market === "ES" ? 3.0 : 1.0;
  const brokerFee = Math.max(minFee, grossReturn * 0.001) + (market === "ES" ? 2.0 : 0.50);

  let taxAmount = 0;
  let taxBreakdown = [];
  if (gain > 0) {
    const tramos = [
      { limit: 6000,  rate: 0.19 },
      { limit: 44000, rate: 0.21 }, 
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
  transferDir: "ES_TO_US",
  profile: {
    xp: 0,
    level: 1,
    equippedTitle: "Novato del Ahorro",
    equippedIcon: "🌱"
  }
};

// Variables para la Gráfica Interactiva
let currentChartData = [];
let currentChartTicker = "";
let chartZoom = 1;
let chartPanX = 0;

// ─────────────────────────────────────────────────────────────
// INICIALIZACIÓN Y PERFIL
// ─────────────────────────────────────────────────────────────

window.addEventListener("load", () => {
  loadFromLS();
  updateUI();
  updateProfileUI();
  renderTickerChips();
  setupChartInteractions();
  
  setInterval(refreshPortfolio, 30000);
  refreshPortfolio(); 
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
  state.profile     = JSON.parse(localStorage.getItem(LS_KEYS.profile)) || state.profile;
}

function saveToLS() {
  localStorage.setItem(LS_KEYS.balanceEs, state.balanceEs);
  localStorage.setItem(LS_KEYS.balanceUs, state.balanceUs);
  localStorage.setItem(LS_KEYS.portfolioEs, JSON.stringify(state.portfolioEs));
  localStorage.setItem(LS_KEYS.portfolioUs, JSON.stringify(state.portfolioUs));
  localStorage.setItem(LS_KEYS.history, JSON.stringify(state.history));
  localStorage.setItem(LS_KEYS.stats, JSON.stringify(state.stats));
  localStorage.setItem(LS_KEYS.market, state.market);
  localStorage.setItem(LS_KEYS.profile, JSON.stringify(state.profile));
}

// ─────────────────────────────────────────────────────────────
// LOGICA DE EXPERIENCIA (XP)
// ─────────────────────────────────────────────────────────────

function addXP(amount) {
  state.profile.xp += amount;
  
  let newLevel = 1;
  for (let i = LEVEL_SYSTEM.length - 1; i >= 0; i--) {
    if (state.profile.xp >= LEVEL_SYSTEM[i].xp) {
      newLevel = LEVEL_SYSTEM[i].level;
      break;
    }
  }

  if (newLevel > state.profile.level) {
    state.profile.level = newLevel;
    showToast(`¡NIVEL UP! Has alcanzado el Nivel ${newLevel} 🚀`, "success");
  }
  
  saveToLS();
  updateProfileUI();
}

function updateProfileUI() {
  document.getElementById("hdr-icon").innerText = state.profile.equippedIcon;
  document.getElementById("hdr-title").innerText = state.profile.equippedTitle;
  document.getElementById("hdr-level-num").innerText = state.profile.level;

  let currentLvlData = LEVEL_SYSTEM.find(l => l.level === state.profile.level);
  let nextLvlData = LEVEL_SYSTEM.find(l => l.level === state.profile.level + 1);
  
  let fillPercentage = 100;
  if (nextLvlData) {
    let xpIntoLevel = state.profile.xp - currentLvlData.xp;
    let xpNeeded = nextLvlData.xp - currentLvlData.xp;
    fillPercentage = Math.min(100, Math.max(0, (xpIntoLevel / xpNeeded) * 100));
  }
  
  document.getElementById("hdr-xp-fill").style.width = `${fillPercentage}%`;
}

function openProfileModal() {
  document.getElementById("modal-profile").classList.remove("hidden");
  
  document.getElementById("prof-lvl").innerText = state.profile.level;
  document.getElementById("prof-xp").innerText = state.profile.xp;
  
  let nextLvlData = LEVEL_SYSTEM.find(l => l.level === state.profile.level + 1);
  if(nextLvlData) {
    let faltan = nextLvlData.xp - state.profile.xp;
    document.getElementById("prof-xp-next").innerText = `Faltan ${faltan} XP para el nivel ${nextLvlData.level}`;
  } else {
    document.getElementById("prof-xp-next").innerText = `¡Nivel Máximo alcanzado!`;
  }

  renderGamifyGrids();
}

function closeProfileModal() {
  document.getElementById("modal-profile").classList.add("hidden");
}

function renderGamifyGrids() {
  const titlesGrid = document.getElementById("titles-grid");
  const iconsGrid = document.getElementById("icons-grid");
  
  titlesGrid.innerHTML = "";
  iconsGrid.innerHTML = "";

  LEVEL_SYSTEM.forEach(lvl => {
    let isUnlocked = state.profile.level >= lvl.level;
    
    // Título
    let titleDiv = document.createElement("div");
    titleDiv.className = `gamify-item ${isUnlocked ? 'unlocked' : 'locked'} ${state.profile.equippedTitle === lvl.title ? 'active' : ''}`;
    titleDiv.innerHTML = `${lvl.title} ${isUnlocked ? '' : `<span class="locked-req">Nivel ${lvl.level}</span>`}`;
    if(isUnlocked) {
      titleDiv.onclick = () => { state.profile.equippedTitle = lvl.title; saveToLS(); renderGamifyGrids(); updateProfileUI(); };
    }
    titlesGrid.appendChild(titleDiv);

    // Icono
    let iconDiv = document.createElement("div");
    iconDiv.className = `gamify-item ${isUnlocked ? 'unlocked' : 'locked'} ${state.profile.equippedIcon === lvl.icon ? 'active' : ''}`;
    iconDiv.innerHTML = `<span style="font-size:1.5rem">${lvl.icon}</span> ${isUnlocked ? '' : `<span class="locked-req">Nivel ${lvl.level}</span>`}`;
    if(isUnlocked) {
      iconDiv.onclick = () => { state.profile.equippedIcon = lvl.icon; saveToLS(); renderGamifyGrids(); updateProfileUI(); };
    }
    iconsGrid.appendChild(iconDiv);
  });
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
  
  addXP(20); // Recompensa base por animarse a comprar

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
// INTERFAZ Y UTILIDADES
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
  document.getElementById("portfolio-total").textContent = formatAmount(totalValue + (state.market === "ES" ?