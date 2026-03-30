"use strict";

const INITIAL_BALANCE_ES = 5000;
const INITIAL_BALANCE_US = 0;

const LS_KEYS = {
  balanceEs: "sq_balance_es",
  balanceUs: "sq_balance_us",
  portfolioEs: "sq_portfolio_es",
  portfolioUs: "sq_portfolio_us",
  history: "sq_history_v2",
  stats: "sq_stats_v2",
  market: "sq_market",
  profile: "sq_profile_v3"
};

const LEVEL_SYSTEM = [
  { level: 1, xp: 0, title: "Novato del Ahorro", icon: "🌱" },
  { level: 2, xp: 500, title: "Pequeño Inversor", icon: "🏦" },
  { level: 3, xp: 1500, title: "Trader de Barrio", icon: "🏙️" },
  { level: 4, xp: 4000, title: "Lobo del IBEX", icon: "🐺" },
  { level: 5, xp: 10000, title: "Ballena de Wall St", icon: "🐋" }
];

let state = {
  market: "ES",
  balanceEs: INITIAL_BALANCE_ES,
  balanceUs: INITIAL_BALANCE_US,
  portfolioEs: [],
  portfolioUs: [],
  history: [],
  stats: { ops: 0, buys: 0, sells: 0 },
  profile: { xp: 0, level: 1 },
  currentStock: null
};

// --- INICIO ---
window.addEventListener("load", () => {
  loadData();
  updateUI();
  setMarket(state.market);
});

function loadData() {
  state.balanceEs = parseFloat(localStorage.getItem(LS_KEYS.balanceEs)) || INITIAL_BALANCE_ES;
  state.balanceUs = parseFloat(localStorage.getItem(LS_KEYS.balanceUs)) || 0;
  state.portfolioEs = JSON.parse(localStorage.getItem(LS_KEYS.portfolioEs)) || [];
  state.portfolioUs = JSON.parse(localStorage.getItem(LS_KEYS.portfolioUs)) || [];
  state.history = JSON.parse(localStorage.getItem(LS_KEYS.history)) || [];
  state.stats = JSON.parse(localStorage.getItem(LS_KEYS.stats)) || state.stats;
  state.profile = JSON.parse(localStorage.getItem(LS_KEYS.profile)) || { xp: 0, level: 1 };
  state.market = localStorage.getItem(LS_KEYS.market) || "ES";
}

function saveData() {
  localStorage.setItem(LS_KEYS.balanceEs, state.balanceEs);
  localStorage.setItem(LS_KEYS.balanceUs, state.balanceUs);
  localStorage.setItem(LS_KEYS.portfolioEs, JSON.stringify(state.portfolioEs));
  localStorage.setItem(LS_KEYS.portfolioUs, JSON.stringify(state.portfolioUs));
  localStorage.setItem(LS_KEYS.history, JSON.stringify(state.history));
  localStorage.setItem(LS_KEYS.stats, JSON.stringify(state.stats));
  localStorage.setItem(LS_KEYS.profile, JSON.stringify(state.profile));
  localStorage.setItem(LS_KEYS.market, state.market);
}

// --- MERCADOS Y CAMBIO ---
function setMarket(m) {
  state.market = m;
  document.body.className = m === "ES" ? "market-es" : "market-us";
  document.getElementById("mkt-es").classList.toggle("active", m === "ES");
  document.getElementById("mkt-us").classList.toggle("active", m === "US");
  document.getElementById("trade-title").textContent = m === "ES" ? "Operar en España" : "Operar en USA";
  document.getElementById("portfolio-mkt-label").textContent = m;
  updateUI();
  saveData();
}

// --- GAMIFICACIÓN ---
function addXP(amount) {
  state.profile.xp += amount;
  let newLevel = 1;
  LEVEL_SYSTEM.forEach(l => { if(state.profile.xp >= l.xp) newLevel = l.level; });
  
  if(newLevel > state.profile.level) {
    alert(`¡FELICIDADES! Has subido al Nivel ${newLevel}: ${LEVEL_SYSTEM.find(x=>x.level===newLevel).title}`);
  }
  state.profile.level = newLevel;
  updateUI();
  saveData();
}

// --- COMISIONES REALISTAS ---
function calculateBuyFees(amount, market) {
  if(market === "US") return { brokerFee: 1.50, taxAmount: 0, total: 1.50 };
  
  // España: Canon Bolsa + Comisión Bróker variable
  let broker = amount * 0.001; 
  if(broker < 2) broker = 2;
  let canon = 2.0; 
  if(amount > 1000) canon = 4.0;
  return { brokerFee: broker + canon, taxAmount: 0, total: broker + canon };
}

function calculateSellFees(gross, costBasis, market) {
  let broker = market === "US" ? 1.50 : (Math.max(2, gross * 0.001) + (gross > 1000 ? 4 : 2));
  let profit = gross - costBasis - broker;
  let tax = 0;
  
  if(profit > 0) {
    // Tramos IRPF España 2024
    if(profit <= 6000) tax = profit * 0.19;
    else if(profit <= 50000) tax = (6000 * 0.19) + (profit - 6000) * 0.21;
    else tax = (6000 * 0.19) + (44000 * 0.21) + (profit - 50000) * 0.23;
  }
  
  return { brokerFee: broker, taxAmount: tax, total: broker + tax, profitNet: profit - tax };
}

// --- BÚSQUEDA ---
async function searchStock() {
  const ticker = document.getElementById("search-input").value.toUpperCase().trim();
  if(!ticker) return;
  const msg = document.getElementById("search-msg");
  msg.textContent = "Buscando...";
  
  try {
    const proxy = "https://corsproxy.io/?";
    const url = `${proxy}${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`)}`;
    const res = await fetch(url);
    const data = await res.json();
    const quote = data.chart.result[0].meta;
    
    state.currentStock = {
      ticker: quote.symbol,
      price: quote.regularMarketPrice,
      currency: quote.currency
    };
    
    document.getElementById("stock-symbol").textContent = state.currentStock.ticker;
    document.getElementById("stock-price").textContent = state.currentStock.price.toFixed(2);
    document.getElementById("stock-currency").textContent = state.currentStock.currency;
    document.getElementById("stock-info").classList.remove("hidden");
    msg.textContent = "";
  } catch (e) {
    msg.textContent = "No se encontró el ticker.";
  }
}

// --- COMPRA / VENTA ---
function executeBuy() {
  const qty = parseInt(document.getElementById("trade-qty").value);
  const totalRaw = state.currentStock.price * qty;
  const fees = calculateBuyFees(totalRaw, state.market);
  const totalWithFees = totalRaw + fees.total;
  
  const balance = state.market === "ES" ? state.balanceEs : state.balanceUs;
  if(balance < totalWithFees) return alert("Saldo insuficiente (incluyendo comisiones)");

  if(state.market === "ES") state.balanceEs -= totalWithFees;
  else state.balanceUs -= totalWithFees;

  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs;
  const existing = portfolio.find(p => p.ticker === state.currentStock.ticker);
  
  if(existing) {
    existing.price = ((existing.price * existing.qty) + (state.currentStock.price * qty)) / (existing.qty + qty);
    existing.qty += qty;
  } else {
    portfolio.push({ ticker: state.currentStock.ticker, qty, price: state.currentStock.price });
  }

  state.history.unshift({
    date: new Date().toLocaleTimeString(),
    type: "COMPRA",
    ticker: state.currentStock.ticker,
    qty,
    price: state.currentStock.price,
    total: totalWithFees
  });

  state.stats.ops++;
  addXP(100);
  updateUI();
  saveData();
  showFeeModal("Compra Exitosa", fees, totalRaw, "BUY");
}

function executeSell() {
  const ticker = state.currentStock.ticker;
  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs;
  const idx = portfolio.findIndex(p => p.ticker === ticker);
  
  if(idx === -1) return alert("No tienes esta acción");
  const qty = parseInt(document.getElementById("trade-qty").value);
  if(portfolio[idx].qty < qty) return alert("No tienes suficientes acciones");

  const gross = state.currentStock.price * qty;
  const costBasis = portfolio[idx].price * qty;
  const fees = calculateSellFees(gross, costBasis, state.market);
  
  if(state.market === "ES") state.balanceEs += (gross - fees.total);
  else state.balanceUs += (gross - fees.total);

  portfolio[idx].qty -= qty;
  if(portfolio[idx].qty === 0) portfolio.splice(idx, 1);

  state.history.unshift({
    date: new Date().toLocaleTimeString(),
    type: "VENTA",
    ticker,
    qty,
    price: state.currentStock.price,
    total: gross - fees.total,
    pnl: (gross - costBasis) - fees.total
  });

  state.stats.ops++;
  addXP(150);
  updateUI();
  saveData();
  showFeeModal("Venta Exitosa", fees, gross, "SELL");
}

// --- UI HELPERS ---
function updateUI() {
  const cur = state.market === "ES" ? "€" : "$";
  document.getElementById("header-saldo-es").textContent = `€${state.balanceEs.toLocaleString()}`;
  document.getElementById("header-saldo-us").textContent = `$${state.balanceUs.toLocaleString()}`;
  
  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs;
  const body = document.getElementById("portfolio-body");
  body.innerHTML = "";
  
  let pValue = 0;
  portfolio.forEach(p => {
    const val = p.qty * p.price; // En una versión real aquí llamaríamos a precio actual
    pValue += val;
    body.innerHTML += `<tr>
      <td>${p.ticker}</td>
      <td>${p.qty}</td>
      <td>${p.price.toFixed(2)}</td>
      <td>${p.price.toFixed(2)}</td>
      <td>${val.toFixed(2)}</td>
      <td class="green">0.00%</td>
    </tr>`;
  });

  document.getElementById("portfolio-value").textContent = `${cur}${pValue.toFixed(2)}`;
  document.getElementById("portfolio-total").textContent = `${cur}${(pValue + (state.market === "ES" ? state.balanceEs : state.balanceUs)).toFixed(2)}`;

  // Historial
  const hBody = document.getElementById("history-body");
  hBody.innerHTML = "";
  state.history.slice(0,10).forEach(h => {
    hBody.innerHTML += `<tr>
      <td>${h.date}</td>
      <td class="${h.type==='COMPRA'?'blue':'orange'}">${h.type}</td>
      <td>${h.ticker}</td>
      <td>${h.qty}</td>
      <td>${h.price.toFixed(2)}</td>
      <td>${h.total.toFixed(2)}</td>
      <td class="${h.pnl >=0 ? 'green':'red'}">${h.pnl ? h.pnl.toFixed(2) : '-'}</td>
    </tr>`;
  });

  // Header XP
  const lvl = LEVEL_SYSTEM.find(l => l.level === state.profile.level);
  const next = LEVEL_SYSTEM.find(l => l.level === state.profile.level + 1);
  document.getElementById("hdr-title").textContent = lvl.title;
  document.getElementById("hdr-icon").textContent = lvl.icon;
  document.getElementById("hdr-level-num").textContent = state.profile.level;
  if(next) {
    const pct = ((state.profile.xp - lvl.xp) / (next.xp - lvl.xp)) * 100;
    document.getElementById("hdr-xp-fill").style.width = pct + "%";
  }
}

// --- MODALES ---
function openProfileModal() {
  const p = state.profile;
  const lvl = LEVEL_SYSTEM.find(l => l.level === p.level);
  const next = LEVEL_SYSTEM.find(l => l.level === p.level + 1);
  
  document.getElementById("prof-icon").textContent = lvl.icon;
  document.getElementById("prof-title").textContent = lvl.title;
  document.getElementById("prof-level-num").textContent = p.level;
  document.getElementById("prof-xp").textContent = p.xp;
  document.getElementById("prof-ops").textContent = state.stats.ops;
  
  if(next) {
    document.getElementById("prof-xp-needed").textContent = `${next.xp - p.xp} XP para nivel ${p.level+1}`;
    document.getElementById("prof-xp-fill").style.width = (((p.xp - lvl.xp) / (next.xp - lvl.xp)) * 100) + "%";
  } else {
    document.getElementById("prof-xp-needed").textContent = "NIVEL MÁXIMO";
    document.getElementById("prof-xp-fill").style.width = "100%";
  }
  document.getElementById("modal-profile").classList.remove("hidden");
}

function closeProfileModal() { document.getElementById("modal-profile").classList.add("hidden"); }
function openResetModal() { document.getElementById("modal-reset").classList.remove("hidden"); }
function closeResetModal() { document.getElementById("modal-reset").classList.add("hidden"); }
function confirmReset() { localStorage.clear(); location.reload(); }

function showFeeModal(title, fees, gross, type) {
  const body = document.getElementById("fee-modal-body");
  const cur = state.market === "ES" ? "€" : "$";
  body.innerHTML = `
    <div class="fee-row"><span>Importe Bruto:</span><span>${cur}${gross.toFixed(2)}</span></div>
    <div class="fee-row"><span>Comisión Bróker:</span><span class="red">-${cur}${fees.brokerFee.toFixed(2)}</span></div>
    ${fees.taxAmount > 0 ? `<div class="fee-row"><span>Impuestos (IRPF):</span><span class="red">-${cur}${fees.taxAmount.toFixed(2)}</span></div>` : ''}
    <hr>
    <div class="fee-row"><strong>Total Final:</strong><strong>${cur}${type==='BUY'?(gross+fees.total).toFixed(2):(gross-fees.total).toFixed(2)}</strong></div>
  `;
  document.getElementById("fee-modal-title").textContent = title;
  document.getElementById("modal-fees").classList.remove("hidden");
}
function closeFeeModal() { document.getElementById("modal-fees").classList.add("hidden"); }

function openTransferModal() { document.getElementById("modal-transfer").classList.remove("hidden"); }
function closeTransferModal() { document.getElementById("modal-transfer").classList.add("hidden"); }

function executeTransfer(type) {
  const rate = 1.08; // Cambio fijo simulación
  if(type === 'ES_TO_US') {
    const amt = prompt("¿Cuántos Euros quieres cambiar a Dólares?");
    if(amt && state.balanceEs >= amt) {
      state.balanceEs -= parseFloat(amt);
      state.balanceUs += amt * rate;
    }
  } else {
    const amt = prompt("¿Cuántos Dólares quieres cambiar a Euros?");
    if(amt && state.balanceUs >= amt) {
      state.balanceUs -= parseFloat(amt);
      state.balanceEs += amt / rate;
    }
  }
  updateUI();
  saveData();
  closeTransferModal();
}