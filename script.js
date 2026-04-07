/* ═══════════════════════════════════════════════════════════════
   PANDU INVESTOR — script.js  (Gamificación XP + Tienda v4)
   Motor Pixel Art 16-bit completo
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
  xp:          "sq_xp_v2",
  activeTitle: "sq_active_title",
  unlockedTitles: "sq_unlocked_titles",
  panducoins:  "sq_panducoins",
  avatar:      "sq_avatar",
  inventory:   "sq_inventory"
};

const CORS_PROXY = "https://corsproxy.io/?";
const YF_URL     = "https://query1.finance.yahoo.com/v8/finance/chart/";
const YF_SEARCH  = "https://query1.finance.yahoo.com/v1/finance/search?q=";

// ─────────────────────────────────────────────────────────────
// MOTOR PIXEL ART 16-BIT
// ─────────────────────────────────────────────────────────────
// El personaje se dibuja sobre un canvas de 64x96 píxeles.
// Luego se escala con CSS (image-rendering: pixelated).
// Cada capa es una función que pinta directamente en el ctx.

const PX = 1; // unidad pixel base

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return {r,g,b};
}

function darken(hex, amt=40) {
  const {r,g,b} = hexToRgb(hex);
  return `rgb(${Math.max(0,r-amt)},${Math.max(0,g-amt)},${Math.max(0,b-amt)})`;
}

function lighten(hex, amt=40) {
  const {r,g,b} = hexToRgb(hex);
  return `rgb(${Math.min(255,r+amt)},${Math.min(255,g+amt)},${Math.min(255,b+amt)})`;
}

/**
 * Dibuja el personaje completo en el canvas dado.
 * @param {HTMLCanvasElement} canvas
 * @param {Object} av  - state.avatar
 * @param {number} scale - escala de renderizado (1 = 64x96, 2 = 128x192...)
 */
function drawCharacter(canvas, av, scale = 1) {
  const W = 64, H = 96;
  canvas.width  = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false;

  const skin    = av.skin    || '#ffdbac';
  const eyes    = av.eyes    || '#000000';
  const hairCol = av.hairColor || '#000000';
  const hairStyle = av.hairStyle || 'short';
  const gender  = av.gender  || 'male';
  const clothId = av.clothes || 'shirt_basic';
  const accId   = av.accessory || 'none';

  // Buscar datos de ropa actual
  const clothItem = SHOP_ITEMS.clothes.find(c => c.id === clothId) || SHOP_ITEMS.clothes[0];

  // ── PIERNAS (colores según pantalón) ──
  const pantsCol = (clothItem.pantsColor || (gender === 'female' ? '#e8a0b0' : '#2a3a5c'));
  const shoeCol  = (clothItem.shoeColor  || '#1a1a2e');
  drawLegs(ctx, pantsCol, shoeCol, gender);

  // ── CUERPO / ROPA ──
  drawBody(ctx, clothItem, gender, skin);

  // ── CABEZA ──
  drawHead(ctx, skin, eyes);

  // ── PELO ──
  drawHair(ctx, hairStyle, hairCol, gender);

  // ── ACCESORIO ──
  const accItem = SHOP_ITEMS.accessories.find(a => a.id === accId);
  if (accItem && accItem.id !== 'none') {
    drawAccessory(ctx, accItem);
  }
}

function drawLegs(ctx, pantsCol, shoeCol, gender) {
  const W = 64;
  // Muslos
  ctx.fillStyle = pantsCol;
  ctx.fillRect(20, 64, 10, 16);
  ctx.fillRect(34, 64, 10, 16);
  // Sombra interior pierna
  ctx.fillStyle = darken(pantsCol, 20);
  ctx.fillRect(29, 64, 5, 16);
  // Zapatos
  ctx.fillStyle = shoeCol;
  ctx.fillRect(18, 80, 14, 8);
  ctx.fillRect(32, 80, 14, 8);
  // Brillo zapato
  ctx.fillStyle = lighten(shoeCol, 30);
  ctx.fillRect(19, 81, 4, 2);
  ctx.fillRect(33, 81, 4, 2);
}

function drawBody(ctx, clothItem, gender, skin) {
  const bodyCol = clothItem.color || '#5a7a9a';
  const bodyDark = darken(bodyCol, 30);
  const bodyLight = lighten(bodyCol, 30);

  // Cuerpo principal
  ctx.fillStyle = bodyCol;
  ctx.fillRect(16, 44, 32, 22);

  // Sombra lateral derecha
  ctx.fillStyle = bodyDark;
  ctx.fillRect(40, 44, 8, 22);

  // Cuello (piel)
  ctx.fillStyle = skin;
  ctx.fillRect(28, 40, 8, 6);

  // Decoración específica por tipo de ropa
  if (clothItem.id === 'suit' || clothItem.id === 'suit_deluxe') {
    // Corbata
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(30, 44, 4, 14);
    ctx.fillRect(29, 52, 6, 4);
    // Solapas
    ctx.fillStyle = bodyDark;
    ctx.fillRect(16, 44, 6, 16);
    ctx.fillRect(42, 44, 6, 16);
    // Botones
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(31, 48, 2, 2);
    ctx.fillRect(31, 53, 2, 2);

  } else if (clothItem.id === 'hoodie') {
    // Canguro
    ctx.fillStyle = bodyLight;
    ctx.fillRect(22, 54, 12, 10); // bolsillo
    ctx.fillStyle = bodyDark;
    ctx.fillRect(22, 54, 12, 1);  // borde bolsillo
    // Cordones capucha
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(29, 44, 2, 8);
    ctx.fillRect(33, 44, 2, 8);

  } else if (clothItem.id === 'king') {
    // Manto real con ornamentos dorados
    ctx.fillStyle = '#8B0000';
    ctx.fillRect(12, 42, 40, 26);
    ctx.fillStyle = '#FFD700';
    // Borde dorado top
    ctx.fillRect(12, 42, 40, 3);
    // Motivos
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(14 + i*10, 48, 4, 4);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(16, 46, 2, 2);
    ctx.fillRect(28, 46, 2, 2);
    ctx.fillRect(40, 46, 2, 2);

  } else if (clothItem.id === 'astronaut') {
    // Traje espacial
    ctx.fillStyle = '#d0d8e8';
    ctx.fillRect(12, 40, 40, 26);
    ctx.fillStyle = '#aab8cc';
    ctx.fillRect(12, 40, 6, 26);
    ctx.fillRect(46, 40, 6, 26);
    // Visor / placa pecho
    ctx.fillStyle = '#00aaff';
    ctx.fillRect(24, 48, 16, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(25, 49, 5, 3);
    // Brazos
    ctx.fillStyle = '#d0d8e8';
    ctx.fillRect(6, 44, 8, 18);
    ctx.fillRect(50, 44, 8, 18);

  } else if (clothItem.id === 'ninja') {
    // Traje ninja
    ctx.fillStyle = '#111111';
    ctx.fillRect(12, 40, 40, 28);
    ctx.fillStyle = '#222222';
    ctx.fillRect(12, 40, 6, 28);
    ctx.fillRect(46, 40, 6, 28);
    // Faja
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(12, 56, 40, 4);
    // Brazos
    ctx.fillStyle = '#111111';
    ctx.fillRect(6, 44, 8, 18);
    ctx.fillRect(50, 44, 8, 18);

  } else {
    // Camiseta básica / default — brazos con piel
    ctx.fillStyle = skin;
    ctx.fillRect(6, 44, 10, 16);
    ctx.fillRect(48, 44, 10, 16);
    // Sombra brazo
    ctx.fillStyle = darken(skin, 20);
    ctx.fillRect(6, 52, 10, 8);
    ctx.fillRect(48, 52, 10, 8);
    // Mangas de camiseta
    ctx.fillStyle = bodyCol;
    ctx.fillRect(6, 44, 10, 6);
    ctx.fillRect(48, 44, 10, 6);
  }

  // Línea de luz en el hombro
  ctx.fillStyle = bodyLight;
  ctx.fillRect(16, 44, 24, 2);
}

function drawHead(ctx, skin, eyeCol) {
  const W = 64;
  const headX = 20, headY = 16, headW = 24, headH = 24;

  // Cabeza
  ctx.fillStyle = skin;
  ctx.fillRect(headX, headY, headW, headH);

  // Sombra inferior de cabeza
  ctx.fillStyle = darken(skin, 15);
  ctx.fillRect(headX, headY + headH - 4, headW, 4);

  // Mejillas
  ctx.fillStyle = `rgba(220,130,100,0.3)`;
  ctx.fillRect(headX + 1, headY + 14, 4, 4);
  ctx.fillRect(headX + headW - 5, headY + 14, 4, 4);

  // Ojos
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(headX + 4, headY + 8, 7, 7);
  ctx.fillRect(headX + 13, headY + 8, 7, 7);
  ctx.fillStyle = eyeCol;
  ctx.fillRect(headX + 5, headY + 9, 5, 5);
  ctx.fillRect(headX + 14, headY + 9, 5, 5);
  // Pupila
  ctx.fillStyle = '#000000';
  ctx.fillRect(headX + 7, headY + 11, 2, 2);
  ctx.fillRect(headX + 16, headY + 11, 2, 2);
  // Brillo ojo
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(headX + 6, headY + 10, 1, 1);
  ctx.fillRect(headX + 15, headY + 10, 1, 1);

  // Nariz
  ctx.fillStyle = darken(skin, 25);
  ctx.fillRect(headX + 11, headY + 15, 2, 2);

  // Boca / sonrisa
  ctx.fillStyle = darken(skin, 35);
  ctx.fillRect(headX + 7, headY + 19, 10, 2);
  ctx.fillRect(headX + 6, headY + 18, 2, 2);
  ctx.fillRect(headX + 16, headY + 18, 2, 2);
}

function drawHair(ctx, style, hairCol, gender) {
  if (style === 'none') return;

  const hairDark = darken(hairCol, 30);
  const hairLight = lighten(hairCol, 20);

  if (style === 'short') {
    // Pelo corto
    ctx.fillStyle = hairCol;
    ctx.fillRect(19, 12, 26, 8);
    ctx.fillRect(17, 14, 4, 12);
    ctx.fillRect(43, 14, 4, 12);
    ctx.fillStyle = hairDark;
    ctx.fillRect(19, 18, 26, 2);
    ctx.fillStyle = hairLight;
    ctx.fillRect(22, 12, 10, 3);

  } else if (style === 'long') {
    // Pelo largo (cae por los lados)
    ctx.fillStyle = hairCol;
    ctx.fillRect(16, 12, 32, 10);
    // Caída lateral
    ctx.fillRect(13, 14, 6, 36);
    ctx.fillRect(45, 14, 6, 36);
    // Mechones
    ctx.fillStyle = hairDark;
    ctx.fillRect(13, 36, 3, 14);
    ctx.fillRect(48, 36, 3, 14);
    ctx.fillRect(16, 20, 32, 2);
    ctx.fillStyle = hairLight;
    ctx.fillRect(20, 12, 14, 3);
    // Flequillo
    ctx.fillStyle = hairCol;
    ctx.fillRect(20, 16, 24, 4);

  } else if (style === 'spiky') {
    // Pinchos hacia arriba
    ctx.fillStyle = hairCol;
    // Base
    ctx.fillRect(19, 14, 26, 6);
    ctx.fillRect(17, 14, 4, 10);
    ctx.fillRect(43, 14, 4, 10);
    // Pinchos
    ctx.fillRect(21, 6, 4, 10);
    ctx.fillRect(28, 4, 4, 12);
    ctx.fillRect(35, 6, 4, 10);
    ctx.fillStyle = hairLight;
    ctx.fillRect(22, 6, 2, 5);
    ctx.fillRect(29, 4, 2, 5);
    ctx.fillRect(36, 6, 2, 5);

  } else if (style === 'afro') {
    // Afro circular
    ctx.fillStyle = hairCol;
    // Gran masa de pelo
    ctx.fillRect(12, 8, 40, 24);
    ctx.fillRect(10, 14, 44, 14);
    ctx.fillRect(14, 6, 36, 6);
    ctx.fillStyle = hairDark;
    // Textura rizada
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(12 + i*8, 10, 4, 4);
      ctx.fillRect(16 + i*8, 16, 4, 4);
    }
    ctx.fillStyle = hairLight;
    ctx.fillRect(22, 8, 8, 3);
  }
}

function drawAccessory(ctx, accItem) {
  if (!accItem || accItem.id === 'none') return;

  if (accItem.id === 'glasses' || accItem.id === 'reading_glasses') {
    // Gafas de lectura
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(21, 23, 7, 5);
    ctx.fillRect(36, 23, 7, 5);
    ctx.fillRect(28, 24, 8, 2);
    ctx.fillStyle = 'rgba(200,230,255,0.5)';
    ctx.fillRect(22, 24, 5, 3);
    ctx.fillRect(37, 24, 5, 3);

  } else if (accItem.id === 'sunglasses') {
    // Gafas de sol
    ctx.fillStyle = '#111';
    ctx.fillRect(20, 22, 9, 7);
    ctx.fillRect(35, 22, 9, 7);
    ctx.fillRect(29, 23, 6, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(21, 23, 7, 5);
    ctx.fillRect(36, 23, 7, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(21, 23, 3, 2);
    ctx.fillRect(36, 23, 3, 2);

  } else if (accItem.id === 'chain') {
    // Cadena de oro al cuello
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(24, 44, 16, 2);
    ctx.fillRect(22, 46, 20, 2);
    ctx.fillRect(28, 48, 8, 4);
    ctx.fillStyle = '#FFA500';
    ctx.fillRect(29, 49, 6, 2);
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(26, 45, 2, 1);

  } else if (accItem.id === 'crown') {
    // Corona encima del pelo
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(20, 8, 24, 6);
    // Puntas de corona
    ctx.fillRect(20, 4, 4, 6);
    ctx.fillRect(28, 2, 4, 8);
    ctx.fillRect(36, 4, 4, 6);
    ctx.fillStyle = '#FFA500';
    ctx.fillRect(20, 12, 24, 2);
    // Joyas
    ctx.fillStyle = '#ff3a5c';
    ctx.fillRect(21, 6, 2, 2);
    ctx.fillStyle = '#00e5ff';
    ctx.fillRect(29, 4, 2, 2);
    ctx.fillStyle = '#ff3a5c';
    ctx.fillRect(37, 6, 2, 2);
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(22, 9, 4, 2);
    ctx.fillRect(30, 9, 4, 2);
    ctx.fillRect(38, 9, 4, 2);

  } else if (accItem.id === 'top_hat') {
    // Sombrero de copa
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(18, 2, 28, 14);
    ctx.fillRect(14, 14, 36, 4);
    ctx.fillStyle = '#333';
    ctx.fillRect(19, 2, 26, 2);
    ctx.fillStyle = '#f0d000';
    ctx.fillRect(18, 12, 28, 2);

  } else if (accItem.id === 'monocle') {
    // Monóculo
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(200,230,255,0.3)';
    ctx.fillRect(35, 22, 9, 9);
    ctx.strokeRect(35, 22, 9, 9);
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(44, 22, 2, 1);
    ctx.fillRect(44, 30, 2, 6);
  }
}

/**
 * Dibuja el coche en el canvas dado.
 * @param {HTMLCanvasElement} canvas
 * @param {string} carId - ID del coche
 */
function drawCar(canvas, carId) {
  canvas.width  = 120;
  canvas.height = 70;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 120, 70);

  if (!carId || carId === 'none') return;

  const carDef = SHOP_ITEMS.cars.find(c => c.id === carId);
  if (!carDef) return;

  drawCarPixelArt(ctx, carDef);
}

function drawCarPixelArt(ctx, carDef) {
  const col   = carDef.bodyColor || '#cc0000';
  const dark  = darken(col, 40);
  const light = lighten(col, 40);
  const type  = carDef.carType || 'sedan';

  if (type === 'sedan') {
    // Carrocería principal
    ctx.fillStyle = col;
    ctx.fillRect(6, 30, 108, 26);
    // Techo
    ctx.fillStyle = col;
    ctx.fillRect(26, 14, 68, 18);
    ctx.fillStyle = dark;
    ctx.fillRect(26, 14, 68, 3);
    // Ventanas
    ctx.fillStyle = '#a0d8ef';
    ctx.fillRect(30, 18, 28, 12);
    ctx.fillRect(62, 18, 28, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(31, 19, 8, 4);
    ctx.fillRect(63, 19, 8, 4);
    // Pilares
    ctx.fillStyle = dark;
    ctx.fillRect(58, 18, 4, 12);
    // Maletero y capó
    ctx.fillStyle = light;
    ctx.fillRect(6, 30, 20, 4);
    ctx.fillRect(94, 30, 20, 4);
    // Ruedas
    drawWheel(ctx, 26, 54, carDef.wheelColor);
    drawWheel(ctx, 88, 54, carDef.wheelColor);
    // Faros
    ctx.fillStyle = '#ffffc0';
    ctx.fillRect(6, 36, 10, 6);
    ctx.fillRect(104, 36, 10, 6);
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(6, 44, 8, 4);
    ctx.fillRect(106, 44, 8, 4);
    // Sombra bajo coche
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(16, 58, 88, 6);

  } else if (type === 'sports') {
    // Deportivo bajo y aerodinámico
    ctx.fillStyle = col;
    ctx.fillRect(4, 34, 112, 20);
    // Techo bajo inclinado
    ctx.fillStyle = col;
    ctx.fillRect(32, 20, 56, 16);
    ctx.fillStyle = dark;
    ctx.fillRect(32, 20, 56, 2);
    // Alerón trasero
    ctx.fillStyle = dark;
    ctx.fillRect(4, 30, 16, 4);
    ctx.fillRect(4, 28, 4, 6);
    // Ventanas
    ctx.fillStyle = '#7ec8e3';
    ctx.fillRect(36, 22, 48, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(37, 23, 12, 4);
    // Entrada de aire
    ctx.fillStyle = dark;
    ctx.fillRect(10, 38, 16, 6);
    ctx.fillRect(100, 38, 10, 6);
    // Falda lateral
    ctx.fillStyle = dark;
    ctx.fillRect(4, 48, 112, 6);
    // Ruedas deportivas
    drawSportsWheel(ctx, 26, 54, carDef.wheelColor);
    drawSportsWheel(ctx, 90, 54, carDef.wheelColor);
    // Faros LED
    ctx.fillStyle = '#e0e0ff';
    ctx.fillRect(4, 36, 14, 4);
    ctx.fillRect(102, 36, 14, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(5, 37, 4, 2);
    // Escape
    ctx.fillStyle = '#888';
    ctx.fillRect(4, 52, 6, 3);
    ctx.fillRect(12, 52, 6, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(16, 58, 88, 6);

  } else if (type === 'suv') {
    // SUV alto y robusto
    ctx.fillStyle = col;
    ctx.fillRect(4, 22, 112, 32);
    // Techo plano grande
    ctx.fillStyle = light;
    ctx.fillRect(4, 22, 112, 4);
    // Parabrisas grande
    ctx.fillStyle = '#a0d8ef';
    ctx.fillRect(24, 24, 40, 18);
    ctx.fillRect(70, 24, 40, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(25, 25, 12, 6);
    ctx.fillRect(71, 25, 12, 6);
    // Pilares gruesos
    ctx.fillStyle = dark;
    ctx.fillRect(20, 22, 6, 22);
    ctx.fillRect(64, 22, 6, 22);
    ctx.fillRect(110, 22, 6, 22);
    // Estribos
    ctx.fillStyle = dark;
    ctx.fillRect(4, 52, 112, 4);
    // Ruedas grandes
    drawBigWheel(ctx, 28, 56, carDef.wheelColor);
    drawBigWheel(ctx, 88, 56, carDef.wheelColor);
    // Parachoques
    ctx.fillStyle = dark;
    ctx.fillRect(4, 22, 112, 4);
    ctx.fillRect(4, 50, 112, 4);
    ctx.fillStyle = '#ffffc0';
    ctx.fillRect(4, 34, 14, 8);
    ctx.fillRect(102, 34, 14, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(16, 60, 88, 6);

  } else if (type === 'hypercar') {
    // Hypercar futurista
    ctx.fillStyle = col;
    ctx.fillRect(8, 38, 104, 16);
    // Carrocería aerodinámica muy baja
    ctx.fillStyle = col;
    ctx.fillRect(20, 28, 80, 12);
    // Cabina de cristal
    ctx.fillStyle = '#5dc8e8';
    ctx.fillRect(38, 20, 44, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(40, 21, 12, 4);
    // Alerón trasero grande
    ctx.fillStyle = dark;
    ctx.fillRect(8, 24, 18, 6);
    ctx.fillRect(8, 20, 6, 10);
    ctx.fillRect(14, 18, 6, 6);
    // Difusor delantero
    ctx.fillStyle = dark;
    ctx.fillRect(94, 36, 18, 8);
    // Bandas de carbono
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(20 + i*16, 30, 8, 10);
    }
    // Tiras LED
    ctx.fillStyle = '#00ffff';
    ctx.fillRect(8, 38, 104, 2);
    // Ruedas con llanta estrella
    drawHyperWheel(ctx, 26, 54, carDef.wheelColor);
    drawHyperWheel(ctx, 90, 54, carDef.wheelColor);
    // Faros de tira
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(8, 40, 14, 2);
    ctx.fillRect(98, 40, 14, 2);
    // Escapes cuádruples
    ctx.fillStyle = '#888';
    ctx.fillRect(8, 52, 5, 3);
    ctx.fillRect(14, 52, 5, 3);
    ctx.fillStyle = 'rgba(255,150,0,0.3)';
    ctx.fillRect(9, 54, 3, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(16, 58, 88, 6);
  }
}

function drawWheel(ctx, cx, cy, col = '#222') {
  const r = 12;
  ctx.fillStyle = '#111';
  ctx.fillRect(cx - r, cy - r, r*2, r*2);
  ctx.fillStyle = col || '#888';
  ctx.fillRect(cx - r + 3, cy - r + 3, (r-3)*2, (r-3)*2);
  ctx.fillStyle = '#444';
  ctx.fillRect(cx - 4, cy - r + 3, 8, (r-3)*2);
  ctx.fillRect(cx - r + 3, cy - 4, (r-3)*2, 8);
  ctx.fillStyle = '#aaa';
  ctx.fillRect(cx - 3, cy - 3, 6, 6);
}

function drawSportsWheel(ctx, cx, cy, col = '#888') {
  const r = 11;
  ctx.fillStyle = '#111';
  ctx.fillRect(cx - r, cy - r, r*2, r*2);
  ctx.fillStyle = col || '#aaa';
  // Rayos de estrella
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const x1 = cx + Math.cos(angle) * 3;
    const y1 = cy + Math.sin(angle) * 3;
    const x2 = cx + Math.cos(angle) * (r - 2);
    const y2 = cy + Math.sin(angle) * (r - 2);
    ctx.fillStyle = col || '#aaa';
    ctx.fillRect(Math.min(x1,x2), Math.min(y1,y2), Math.abs(x2-x1)+2, Math.abs(y2-y1)+2);
  }
  ctx.fillStyle = '#cccccc';
  ctx.fillRect(cx - 3, cy - 3, 6, 6);
}

function drawBigWheel(ctx, cx, cy, col = '#555') {
  const r = 14;
  ctx.fillStyle = '#111';
  ctx.fillRect(cx - r, cy - r, r*2, r*2);
  ctx.fillStyle = col || '#888';
  ctx.fillRect(cx - r + 3, cy - r + 3, (r-3)*2, (r-3)*2);
  ctx.fillStyle = '#333';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(cx - r + 5, cy - 2 + i * 4 - 6, (r-5)*2, 2);
    ctx.fillRect(cx - 2 + i * 4 - 6, cy - r + 5, 2, (r-5)*2);
  }
  ctx.fillStyle = '#aaa';
  ctx.fillRect(cx - 4, cy - 4, 8, 8);
}

function drawHyperWheel(ctx, cx, cy, col = '#ccc') {
  const r = 12;
  ctx.fillStyle = '#000';
  ctx.fillRect(cx - r, cy - r, r*2, r*2);
  const rays = 6;
  for (let i = 0; i < rays; i++) {
    const angle = (i / rays) * Math.PI * 2;
    const ax = cx + Math.cos(angle) * 2;
    const ay = cy + Math.sin(angle) * 2;
    const bx = cx + Math.cos(angle) * (r - 1);
    const by = cy + Math.sin(angle) * (r - 1);
    ctx.fillStyle = col || '#ccc';
    ctx.fillRect(Math.min(ax,bx), Math.min(ay,by), Math.abs(bx-ax)+2, Math.abs(by-ay)+2);
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(cx - 3, cy - 3, 6, 6);
  ctx.fillStyle = '#00ffff';
  ctx.fillRect(cx - 1, cy - 1, 2, 2);
}

// ─────────────────────────────────────────────────────────────
// DATOS TIENDA Y AVATAR
// ─────────────────────────────────────────────────────────────

const SHOP_ITEMS = {
  clothes: [
    { id: 'shirt_basic',  name: 'Camiseta Básica', price: 0,    color: '#5a7a9a', pantsColor: '#2a3a5c', shoeColor: '#1a1a2e', icon: '👕' },
    { id: 'suit',         name: 'Traje Wall St.',  price: 100,  color: '#1a1a2e', pantsColor: '#111124', shoeColor: '#0a0a14', icon: '👔' },
    { id: 'suit_deluxe',  name: 'Traje de Lujo',   price: 500,  color: '#2a0060', pantsColor: '#1a0040', shoeColor: '#0a0020', icon: '🤵' },
    { id: 'hoodie',       name: 'Sudadera Cripto',  price: 250,  color: '#b44aff', pantsColor: '#2a1050', shoeColor: '#0f0825', icon: '🧥' },
    { id: 'astronaut',    name: 'Traje Espacial',   price: 2000, color: '#d0d8e8', pantsColor: '#d0d8e8', shoeColor: '#606878', icon: '👨‍🚀' },
    { id: 'ninja',        name: 'Traje Ninja',      price: 3000, color: '#111111', pantsColor: '#0a0a0a', shoeColor: '#050505', icon: '🥷' },
    { id: 'king',         name: 'Manto Real',       price: 1000, color: '#8B0000', pantsColor: '#5c0000', shoeColor: '#2a0000', icon: '👘' }
  ],
  accessories: [
    { id: 'none',          name: 'Ninguno',           price: 0,    icon: '—' },
    { id: 'glasses',       name: 'Gafas Lectura',     price: 50,   icon: '👓' },
    { id: 'sunglasses',    name: 'Gafas de Sol',       price: 150,  icon: '🕶️' },
    { id: 'chain',         name: 'Cadena de Oro',      price: 500,  icon: '⛓️' },
    { id: 'crown',         name: 'Corona Real',        price: 2000, icon: '👑' },
    { id: 'top_hat',       name: 'Sombrero de Copa',   price: 800,  icon: '🎩' },
    { id: 'monocle',       name: 'Monóculo de Oro',    price: 1200, icon: '🧐' }
  ],
  pets: [
    { id: 'none',    name: 'Ninguna',    price: 0,    icon: '' },
    { id: 'dog',     name: 'Perro',      price: 300,  icon: '🐕' },
    { id: 'cat',     name: 'Gato',       price: 300,  icon: '🐈' },
    { id: 'monkey',  name: 'Mono NFT',   price: 800,  icon: '🐒' },
    { id: 'fox',     name: 'Zorro',      price: 600,  icon: '🦊' },
    { id: 'dragon',  name: 'Dragón',     price: 5000, icon: '🐉' },
    { id: 'robot',   name: 'Robot IA',   price: 4000, icon: '🤖' }
  ],
  cars: [
    { id: 'none',       name: 'Sin coche',          price: 0,     carType: 'none',     bodyColor: '#000',    wheelColor: '#222', icon: '—' },
    { id: 'old_car',    name: 'Fiat Rojo',           price: 200,   carType: 'sedan',    bodyColor: '#cc3333', wheelColor: '#444', icon: '🚗' },
    { id: 'golf',       name: 'Hatchback Azul',      price: 500,   carType: 'sedan',    bodyColor: '#2255cc', wheelColor: '#555', icon: '🚙' },
    { id: 'bmw',        name: 'Berlina Premium',     price: 1500,  carType: 'sedan',    bodyColor: '#223355', wheelColor: '#888', icon: '🚘' },
    { id: 'suv',        name: 'SUV Todo Terreno',    price: 2500,  carType: 'suv',      bodyColor: '#334422', wheelColor: '#666', icon: '🚐' },
    { id: 'ferrari',    name: 'Deportivo Rojo',      price: 5000,  carType: 'sports',   bodyColor: '#cc1111', wheelColor: '#aaa', icon: '🏎️' },
    { id: 'lambo',      name: 'Deportivo Amarillo',  price: 8000,  carType: 'sports',   bodyColor: '#ccaa00', wheelColor: '#ccc', icon: '🏎️' },
    { id: 'hypercar',   name: 'Hypercar Cripto',     price: 20000, carType: 'hypercar', bodyColor: '#00aaff', wheelColor: '#fff', icon: '🚀' }
  ]
};

const PALETTES = {
  skin: ['#ffdbac', '#f1c27d', '#e0ac69', '#8d5524', '#3d2c23'],
  eyes: ['#000000', '#2e536f', '#3d671d', '#5c3a21', '#8b2525'],
  hair: ['#000000', '#4a3123', '#e6cea8', '#b55239', '#ff3a5c', '#00aaff', '#7b2d8b']
};

// ─────────────────────────────────────────────────────────────
// SISTEMA DE NIVELES Y RECOMPENSAS
// ─────────────────────────────────────────────────────────────

const LEVELS = [
  { level: 1,  xpRequired: 0,    title: "Novato Bursátil",  icon: "🌱", color: "#5a7a9a",  desc: "Bienvenido al mercado. ¡Todo empieza aquí!" },
  { level: 2,  xpRequired: 100,  title: "Aprendiz",         icon: "📚", color: "#4a9a7a",  desc: "Ya sabes abrir una orden. ¡Eso es algo!" },
  { level: 3,  xpRequired: 250,  title: "Trader Junior",    icon: "💼", color: "#3a8fff",  desc: "Empiezas a entender el mercado." },
  { level: 4,  xpRequired: 500,  title: "Analista",         icon: "🔍", color: "#00e5ff",  desc: "Lees gráficas como un pro." },
  { level: 5,  xpRequired: 900,  title: "Crypto Bro",       icon: "🚀", color: "#b44aff",  desc: "HODL, Buy the dip, To the moon! 🌙" },
  { level: 6,  xpRequired: 1500, title: "Day Trader",       icon: "⚡", color: "#ffe600",  desc: "Compra y vende en el mismo día como si nada." },
  { level: 7,  xpRequired: 2500, title: "Lobo de Wall St.", icon: "🐺", color: "#ff7a00",  desc: "Gordon Gekko tiene competencia." },
  { level: 8,  xpRequired: 4000, title: "Tiburón Bursátil", icon: "🦈", color: "#00ff88",  desc: "El mercado te teme a ti." },
  { level: 9,  xpRequired: 6000, title: "Magnate",          icon: "💎", color: "#ff3a5c",  desc: "Tu cartera hace sombra a muchos fondos." },
  { level: 10, xpRequired: 9000, title: "Warren Pandufett", icon: "🏆", color: "#ffe600",  desc: "Omaha te llama. La cima del análisis." },
  { level: 11, xpRequired: 13000, title: "Leyenda",         icon: "👑", color: "#ffffff",  desc: "Tu nombre se murmura en los parqués del mundo." },
  { level: 12, xpRequired: 18000, title: "El Oráculo",      icon: "🔮", color: "#b44aff",  desc: "Predices el mercado antes de que ocurra." },
  { level: 13, xpRequired: 25000, title: "Dios del Ibex",   icon: "🌟", color: "#ffcc00",  desc: "IBEX 35 es tu patio de recreo." },
  { level: 14, xpRequired: 35000, title: "S&P Mythic",      icon: "🦅", color: "#3a8fff",  desc: "500 empresas, todas tuyas." },
  { level: 15, xpRequired: 50000, title: "El Definitivo",   icon: "💫", color: "#00e5ff",  desc: "No hay nivel más alto. Eres la bolsa." },
];

function getLevelData(xp) {
  let current = LEVELS[0];
  let next = LEVELS[1];
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xpRequired) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || null;
      break;
    }
  }
  const xpInLevel = xp - current.xpRequired;
  const xpToNext = next ? next.xpRequired - current.xpRequired : 1;
  const pct = next ? Math.min(100, (xpInLevel / xpToNext) * 100) : 100;
  return { current, next, xpInLevel, xpToNext, pct };
}

function getUnlockedLevels(xp) { return LEVELS.filter(l => xp >= l.xpRequired); }

function calcXP(action, params) {
  switch(action) {
    case 'buy': {
      const base = 5; const bonus = Math.floor((params.cost || 0) / 100);
      return base + Math.min(bonus, 50); 
    }
    case 'sell_profit': {
      if (params.netGain <= 0) return 5;
      const base = 10; const profitBonus = Math.floor(params.netGain / 10) * 3;
      const pctBonus = params.pct > 0.1 ? 20 : (params.pct > 0.05 ? 10 : 0);
      return base + Math.min(profitBonus, 200) + pctBonus;
    }
    case 'transfer': return 3;
    case 'daily_login': return 10;
    case 'first_buy_es': return 25;
    case 'first_buy_us': return 25;
    case 'diversification': return 15;
    default: return 0;
  }
}

// ─────────────────────────────────────────────────────────────
// CÁLCULO DE COMISIONES
// ─────────────────────────────────────────────────────────────

function calcBuyFees(totalCost, market) {
  const currency = market === "ES" ? "EUR" : "USD";
  const minFeePerTranche = market === "ES" ? 3.0 : 1.0;
  const pctFeePerTranche = 0.001;
  const fixedFeeBase     = market === "ES" ? 2.0 : 0.50;

  let maxTranches;
  if (totalCost < 500) maxTranches = 1;
  else if (totalCost < 2000) maxTranches = 2;
  else if (totalCost < 8000) maxTranches = 2;
  else maxTranches = 3;

  const rand = Math.random();
  let tranches = maxTranches === 1 ? 1 : (maxTranches === 2 ? (rand < 0.65 ? 1 : 2) : (rand < 0.50 ? 1 : rand < 0.80 ? 2 : 3));

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

  let taxAmount = 0; let taxBreakdown = [];
  if (gain > 0) {
    const tramos = [{ limit: 6000, rate: 0.19 }, { limit: 44000, rate: 0.21 }, { limit: Infinity, rate: 0.23 }];
    let remaining = gain; let prevLimit = 0;
    for (const tramo of tramos) {
      if (remaining <= 0) break;
      const chunkSize = Math.min(remaining, tramo.limit - prevLimit);
      if (chunkSize <= 0) { prevLimit = tramo.limit; continue; }
      const tax = chunkSize * tramo.rate;
      taxAmount += tax;
      taxBreakdown.push({ from: prevLimit, to: prevLimit + chunkSize, rate: tramo.rate, tax });
      remaining -= chunkSize; prevLimit = tramo.limit;
    }
  }
  const totalDeductions = brokerFee + taxAmount;
  const netReturn = grossReturn - totalDeductions;
  return { brokerFee, taxAmount, taxBreakdown, totalDeductions, netReturn, gain, currency };
}

// ─────────────────────────────────────────────────────────────
// ESTADO GLOBAL
// ─────────────────────────────────────────────────────────────

let state = {
  market: "ES",
  balanceEs: INITIAL_BALANCE_ES, balanceUs: INITIAL_BALANCE_US,
  portfolioEs: [], portfolioUs: [], history: [],
  stats: { ops: 0, buys: 0, sells: 0, opsEs: 0, opsUs: 0, plEs: 0, plUs: 0, best: null, worst: null },
  exchangeRate: 1.08, transferDir: "ES_TO_US", xp: 0, activeTitle: null, unlockedTitles: [],
  panducoins: 0,
  avatar: {
    gender: 'male', skin: '#ffdbac', eyes: '#000000',
    hairStyle: 'short', hairColor: '#000000',
    clothes: 'shirt_basic', accessory: 'none', pet: 'none', car: 'none'
  },
  inventory: {
    clothes: ['shirt_basic'], accessories: ['none'],
    pets: ['none'], cars: ['none']
  }
};

let currentChartData = []; let currentChartTicker = ""; let chartZoom = 1; let chartPanX = 0;

// ─────────────────────────────────────────────────────────────
// INICIALIZACIÓN
// ─────────────────────────────────────────────────────────────

window.addEventListener("load", () => {
  loadFromLS(); updateUI(); renderTickerChips(); setupChartInteractions();
  updateXPBar(); checkDailyLogin(); updatePanducoinsUI();
  setInterval(refreshPortfolio, 30000); refreshPortfolio();
  // Dibujar mini avatar en cabecera tras carga
  refreshHeaderAvatar();
});

function checkDailyLogin() {
  const lastLogin = localStorage.getItem("sq_last_login");
  const today = new Date().toDateString();
  if (lastLogin !== today) {
    localStorage.setItem("sq_last_login", today);
    if (state.xp > 0) awardXP('daily_login', {});
  }
}

function loadFromLS() {
  state.balanceEs = parseFloat(localStorage.getItem(LS_KEYS.balanceEs));
  if (isNaN(state.balanceEs)) state.balanceEs = INITIAL_BALANCE_ES;
  state.balanceUs = parseFloat(localStorage.getItem(LS_KEYS.balanceUs)) || INITIAL_BALANCE_US;
  state.portfolioEs = JSON.parse(localStorage.getItem(LS_KEYS.portfolioEs)) || [];
  state.portfolioUs = JSON.parse(localStorage.getItem(LS_KEYS.portfolioUs)) || [];
  state.history = JSON.parse(localStorage.getItem(LS_KEYS.history)) || [];
  state.stats = JSON.parse(localStorage.getItem(LS_KEYS.stats)) || state.stats;
  state.market = localStorage.getItem(LS_KEYS.market) || "ES";
  state.xp = parseInt(localStorage.getItem(LS_KEYS.xp)) || 0;
  state.activeTitle = localStorage.getItem(LS_KEYS.activeTitle) || null;
  state.unlockedTitles = JSON.parse(localStorage.getItem(LS_KEYS.unlockedTitles)) || [];
  state.panducoins = parseInt(localStorage.getItem(LS_KEYS.panducoins)) || 0;
  
  const savedAvatar = JSON.parse(localStorage.getItem(LS_KEYS.avatar));
  if (savedAvatar) state.avatar = { ...state.avatar, ...savedAvatar };
  
  const savedInv = JSON.parse(localStorage.getItem(LS_KEYS.inventory));
  if (savedInv) {
    state.inventory = { ...state.inventory, ...savedInv };
    // Compatibilidad: asegurarse de que la categoría "cars" existe
    if (!state.inventory.cars) state.inventory.cars = ['none'];
    if (!Array.isArray(state.inventory.cars)) state.inventory.cars = ['none'];
  }

  // Compatibilidad: si no tiene car en avatar
  if (!state.avatar.car) state.avatar.car = 'none';

  const unlocked = getUnlockedLevels(state.xp);
  state.unlockedTitles = unlocked.map(l => l.level);
  if (!state.activeTitle && state.unlockedTitles.length > 0) state.activeTitle = Math.max(...state.unlockedTitles);
}

function saveToLS() {
  localStorage.setItem(LS_KEYS.balanceEs, state.balanceEs);
  localStorage.setItem(LS_KEYS.balanceUs, state.balanceUs);
  localStorage.setItem(LS_KEYS.portfolioEs, JSON.stringify(state.portfolioEs));
  localStorage.setItem(LS_KEYS.portfolioUs, JSON.stringify(state.portfolioUs));
  localStorage.setItem(LS_KEYS.history, JSON.stringify(state.history));
  localStorage.setItem(LS_KEYS.stats, JSON.stringify(state.stats));
  localStorage.setItem(LS_KEYS.market, state.market);
  localStorage.setItem(LS_KEYS.xp, state.xp);
  localStorage.setItem(LS_KEYS.activeTitle, state.activeTitle);
  localStorage.setItem(LS_KEYS.unlockedTitles, JSON.stringify(state.unlockedTitles));
  localStorage.setItem(LS_KEYS.panducoins, state.panducoins);
  localStorage.setItem(LS_KEYS.avatar, JSON.stringify(state.avatar));
  localStorage.setItem(LS_KEYS.inventory, JSON.stringify(state.inventory));
}

// ─────────────────────────────────────────────────────────────
// SISTEMAS XP & PANDUCOINS
// ─────────────────────────────────────────────────────────────

function awardXP(action, params) {
  const xpGained = calcXP(action, params);
  if (xpGained <= 0) return;
  const prevLevel = getLevelData(state.xp).current.level;
  state.xp += xpGained;
  const newLevelData = getLevelData(state.xp);
  const newLevel = newLevelData.current.level;
  state.unlockedTitles = getUnlockedLevels(state.xp).map(l => l.level);

  saveToLS(); updateXPBar(); showFloatingText(`+${xpGained} XP`, 'floating-xp');

  if (newLevel > prevLevel) {
    for (let lvl = prevLevel + 1; lvl <= newLevel; lvl++) {
      setTimeout(() => showLevelUpModal(lvl), lvl === prevLevel + 1 ? 600 : 1200 * (lvl - prevLevel));
    }
  }
}

function awardPanducoins(netGainEur) {
  if(netGainEur <= 0) return;
  const coins = Math.floor(netGainEur);
  if(coins > 0) {
    state.panducoins += coins;
    saveToLS();
    updatePanducoinsUI();
    showFloatingText(`+${coins} 🪙`, 'floating-xp floating-coin');
  }
}

function showFloatingText(text, extraClass) {
  const el = document.createElement("div");
  el.className = extraClass;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

function updatePanducoinsUI() {
  document.getElementById("header-coins").textContent = state.panducoins;
  const shopCoins = document.getElementById("shop-coins-display");
  if(shopCoins) shopCoins.textContent = `${state.panducoins} 🪙`;
}

function updateXPBar() {
  const ld = getLevelData(state.xp);
  const bar = document.getElementById("xp-bar");
  const label = document.getElementById("xp-label");
  if (bar) bar.style.width = ld.pct + "%";
  const activeLevelData = LEVELS.find(l => l.level === (state.activeTitle ? parseInt(state.activeTitle) : ld.current.level)) || ld.current;
  if (label) label.textContent = `NIV.${ld.current.level} — ${state.xp} XP`;

  const badgeEl = document.getElementById("header-player-badge");
  if (!badgeEl) return;
  badgeEl.innerHTML = `<span class="badge-icon" style="color:${activeLevelData.color}">${activeLevelData.icon}</span><span class="badge-title" style="color:${activeLevelData.color}">${activeLevelData.title}</span>`;
  badgeEl.style.borderColor = activeLevelData.color + "55";
  badgeEl.style.background = activeLevelData.color + "11";
}

// ─────────────────────────────────────────────────────────────
// MINI AVATAR EN CABECERA
// ─────────────────────────────────────────────────────────────

function refreshHeaderAvatar() {
  const canvas = document.getElementById("header-avatar-canvas");
  if (!canvas) return;
  drawCharacter(canvas, state.avatar, 1);
}

// ─────────────────────────────────────────────────────────────
// MODAL AVATAR & TIENDA
// ─────────────────────────────────────────────────────────────

function openAvatarModal() {
  document.getElementById("modal-avatar").classList.remove("hidden");
  switchAvatarTab('avatar');
}
function closeAvatarModal() { document.getElementById("modal-avatar").classList.add("hidden"); }

function switchAvatarTab(tab) {
  document.getElementById("tab-btn-avatar").classList.toggle("active", tab === 'avatar');
  document.getElementById("tab-btn-shop").classList.toggle("active", tab === 'shop');
  document.getElementById("view-avatar").classList.toggle("hidden", tab !== 'avatar');
  document.getElementById("view-shop").classList.toggle("hidden", tab !== 'shop');

  if(tab === 'avatar') { renderAvatarEditor(); renderAvatarVisual(); }
  if(tab === 'shop')   { renderShopItems(); updatePanducoinsUI(); }
}

function renderAvatarVisual() {
  // Canvas principal en modal
  const mainCanvas = document.getElementById("avatar-canvas");
  if (mainCanvas) drawCharacter(mainCanvas, state.avatar, 1);

  // Coche
  const carCanvas = document.getElementById("car-canvas");
  if (carCanvas) drawCar(carCanvas, state.avatar.car);

  // Mascota
  const petDisplay = document.getElementById("avatar-pet-display");
  if (petDisplay) {
    const petItem = SHOP_ITEMS.pets.find(p => p.id === state.avatar.pet);
    petDisplay.textContent = (petItem && petItem.id !== 'none') ? petItem.icon : '';
  }

  // Mini avatar en cabecera
  refreshHeaderAvatar();

  // Avatar en modal rewards (si está abierto)
  const rewardsCanvas = document.getElementById("rewards-avatar-canvas");
  if (rewardsCanvas && !document.getElementById("modal-rewards").classList.contains("hidden")) {
    drawCharacter(rewardsCanvas, state.avatar, 1);
  }

  // Items equipados
  renderEquippedGrid();
}

function renderEquippedGrid() {
  const grid = document.getElementById("av-equipped-grid");
  if (!grid) return;

  const clothItem = SHOP_ITEMS.clothes.find(c => c.id === state.avatar.clothes) || SHOP_ITEMS.clothes[0];
  const accItem   = SHOP_ITEMS.accessories.find(a => a.id === state.avatar.accessory) || { name: 'Ninguno', icon: '—' };
  const petItem   = SHOP_ITEMS.pets.find(p => p.id === state.avatar.pet) || { name: 'Ninguna', icon: '' };
  const carItem   = SHOP_ITEMS.cars.find(c => c.id === state.avatar.car) || SHOP_ITEMS.cars[0];

  const slots = [
    { cat: 'clothes',     label: 'ROPA',      icon: clothItem.icon,    name: clothItem.name },
    { cat: 'accessories', label: 'ACCESORIO',  icon: accItem.icon || '—', name: accItem.name },
    { cat: 'pets',        label: 'MASCOTA',    icon: petItem.icon || '—', name: petItem.name },
    { cat: 'cars',        label: 'COCHE',      icon: carItem.icon || '—', name: carItem.name }
  ];

  grid.innerHTML = slots.map(s => `
    <div class="av-equipped-item active-slot">
      <span class="av-equipped-icon">${s.icon}</span>
      <span class="av-equipped-label">${s.name}</span>
      <span class="av-equipped-cat">${s.label}</span>
    </div>
  `).join('');
}

function renderAvatarEditor() {
  document.getElementById("av-gender").value    = state.avatar.gender;
  document.getElementById("av-hair-style").value = state.avatar.hairStyle;

  renderColorPickers('skin', PALETTES.skin);
  renderColorPickers('eyes', PALETTES.eyes);
  renderColorPickers('hair', PALETTES.hair);
}

function renderColorPickers(type, colors) {
  const container = document.getElementById(`picker-${type}`);
  if (!container) return;
  container.innerHTML = "";
  const prop = type === 'hair' ? 'hairColor' : type;
  
  colors.forEach(col => {
    const swatch = document.createElement("div");
    swatch.className = `color-swatch ${state.avatar[prop] === col ? 'active' : ''}`;
    swatch.style.background = col;
    swatch.onclick = () => {
      state.avatar[prop] = col;
      saveToLS();
      renderAvatarEditor();
      renderAvatarVisual();
    };
    container.appendChild(swatch);
  });
}

function updateAvatarBase() {
  state.avatar.gender    = document.getElementById("av-gender").value;
  state.avatar.hairStyle = document.getElementById("av-hair-style").value;
  saveToLS();
  renderAvatarVisual();
}

function renderShopItems() {
  const container = document.getElementById("shop-list");
  container.innerHTML = "";

  const renderCat = (key, title) => {
    let html = `<div><div class="shop-cat-title">${title}</div><div class="shop-grid">`;
    SHOP_ITEMS[key].forEach(item => {
      if (item.id === 'none') return;
      const isOwned    = state.inventory[key] && state.inventory[key].includes(item.id);
      const canAfford  = state.panducoins >= item.price;
      const isEquipped = (key === 'clothes' && state.avatar.clothes === item.id) ||
                         (key === 'accessories' && state.avatar.accessory === item.id) ||
                         (key === 'pets' && state.avatar.pet === item.id) ||
                         (key === 'cars' && state.avatar.car === item.id);

      let btnHtml = '';
      if (!isOwned) {
        btnHtml = `<button class="shop-item-btn ${!canAfford ? '' : ''}"
                    ${!canAfford ? 'disabled' : ''}
                    onclick="buyItem('${key}','${item.id}',${item.price})">
                    ${item.price} 🪙 COMPRAR
                  </button>`;
      } else if (isEquipped) {
        btnHtml = `<button class="shop-item-btn equipped-btn" disabled>✔ EQUIPADO</button>`;
      } else {
        btnHtml = `<button class="shop-item-btn equip-btn"
                    onclick="equipItemDirect('${key}','${item.id}')">
                    EQUIPAR
                  </button>`;
      }

      html += `
        <div class="shop-item ${isOwned ? 'item-owned' : ''}">
          <div class="shop-item-preview">
            <span class="${key === 'cars' ? 'preview-car-emoji' : 'preview-emoji'}">${item.icon || '?'}</span>
          </div>
          <span class="shop-item-name">${item.name}</span>
          ${!isOwned ? `<span class="shop-item-price">${item.price} 🪙</span>` : ''}
          ${btnHtml}
        </div>
      `;
    });
    html += `</div></div>`;
    container.innerHTML += html;
  };

  renderCat('clothes',     '👕 ROPA & ESTILOS');
  renderCat('accessories', '💎 ACCESORIOS');
  renderCat('pets',        '🐾 MASCOTAS');
  renderCat('cars',        '🚗 GARAJE');
}

function buyItem(category, id, price) {
  if (!state.inventory[category]) state.inventory[category] = ['none'];
  if (state.panducoins >= price && !state.inventory[category].includes(id)) {
    state.panducoins -= price;
    state.inventory[category].push(id);
    // Auto-equipar al comprar
    equipItemDirect(category, id, false);
    saveToLS();
    updatePanducoinsUI();
    renderShopItems();
    renderAvatarVisual();
    refreshHeaderAvatar();
    showToast("¡Artículo comprado y equipado!", "success");
    launchConfetti("#ffcc00");
  }
}

function equipItemDirect(category, id, showMsg = true) {
  if (category === 'clothes')     state.avatar.clothes   = id;
  if (category === 'accessories') state.avatar.accessory = id;
  if (category === 'pets')        state.avatar.pet       = id;
  if (category === 'cars')        state.avatar.car       = id;
  saveToLS();
  renderAvatarVisual();
  refreshHeaderAvatar();
  renderShopItems();
  if (showMsg) showToast("¡Equipado!", "success");
}

// Función de compatibilidad con inventario antiguo
function equipItem(category) {
  const catMap = { clothes: 'clothes', accessories: 'accessories', pets: 'pets' };
  const selectId = `inv-${category}`;
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const val = sel.value;
  equipItemDirect(catMap[category] || category, val);
}

// ─────────────────────────────────────────────────────────────
// BÚSQUEDA Y GRÁFICAS
// ─────────────────────────────────────────────────────────────

let searchTimeout;
document.getElementById("buy-ticker").addEventListener("input", (e) => {
  clearTimeout(searchTimeout); const q = e.target.value.trim();
  if(q.length < 2) { document.getElementById("search-suggestions").style.display = "none"; return; }
  searchTimeout = setTimeout(() => fetchSuggestions(q), 400);
});

async function fetchSuggestions(query) {
  try {
    const res = await fetch(CORS_PROXY + encodeURIComponent(`${YF_SEARCH}${encodeURIComponent(query)}&quotesCount=5`));
    const data = await res.json(); renderSuggestions(data.quotes || []);
  } catch (err) {}
}

function renderSuggestions(quotes) {
  const container = document.getElementById("search-suggestions"); container.innerHTML = "";
  if (quotes.length === 0) { container.style.display = "none"; return; }
  quotes.forEach(q => {
    if(!q.symbol) return;
    const div = document.createElement("div"); div.className = "suggestion-item";
    div.innerHTML = `<span class="sugg-ticker">${q.symbol}</span><span class="sugg-name">${q.shortname || q.symbol}</span>`;
    div.onclick = () => { document.getElementById("buy-ticker").value = q.symbol; container.style.display = "none"; fetchBuyPrice(); };
    container.appendChild(div);
  });
  container.style.display = "block";
}

async function loadInlineChart(ticker) {
  const container = document.getElementById("inline-chart-container");
  const canvas = document.getElementById("inline-chart"); const ctx = canvas.getContext("2d");
  currentChartTicker = ticker; currentChartData = []; chartZoom = 1; chartPanX = 0;
  container.classList.add("active"); void container.offsetWidth;
  const rect = canvas.getBoundingClientRect(); canvas.width = rect.width; canvas.height = 220;
  ctx.clearRect(0,0, canvas.width, canvas.height); ctx.fillStyle = "#5a7a9a"; ctx.font = "12px 'Share Tech Mono'"; ctx.textAlign = "center";
  ctx.fillText("Cargando análisis técnico...", canvas.width/2, canvas.height/2);
  try {
    const res = await fetch(CORS_PROXY + encodeURIComponent(`${YF_URL}${encodeURIComponent(ticker)}?interval=1d&range=6mo`));
    const data = await res.json(); const result = data.chart.result[0]; const quote = result.indicators.quote[0]; const timestamps = result.timestamp;
    for (let i = 0; i < quote.close.length; i++) {
      if (quote.close[i] && quote.open[i]) {
        const dateStr = new Date(timestamps[i] * 1000).toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
        currentChartData.push({ o: quote.open[i], h: quote.high[i], l: quote.low[i], c: quote.close[i], dateStr });
      }
    }
    if (currentChartData.length > 0) drawCandlesticks(canvas, currentChartData, 1, 0);
  } catch(e) { ctx.clearRect(0,0, canvas.width, canvas.height); ctx.fillText("Gráfica no disponible", canvas.width/2, canvas.height/2); }
}

function drawCandlesticks(canvas, data, zoom, panX) {
  const ctx = canvas.getContext("2d"); const dpr = window.devicePixelRatio || 1; const rect = canvas.getBoundingClientRect();
  if(rect.width === 0) return; canvas.width = rect.width * dpr; canvas.height = rect.height * dpr; ctx.scale(dpr, dpr);
  const w = rect.width; const h = rect.height; const pad = { t: 20, b: 25, l: 10, r: 45 }; const drawW = w - pad.l - pad.r; const drawH = h - pad.t - pad.b;
  ctx.clearRect(0, 0, w, h); if (!data || data.length === 0) return;
  const spacing = (drawW / data.length) * zoom; const candleW = Math.max(1, spacing * 0.7);
  let vis = data.filter((d, i) => { const x = (w - pad.r) - ((data.length - 1 - i) * spacing) - (spacing/2) + panX; return x >= pad.l && x <= w - pad.r; });
  if(vis.length === 0) vis = data;
  const maxH = Math.max(...vis.map(d => d.h)); const minL = Math.min(...vis.map(d => d.l)); const range = (maxH - minL) || 1;
  ctx.font = "10px 'Share Tech Mono'"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  for(let i=0; i<=4; i++) {
    const y = pad.t + (i/4) * drawH; const price = maxH - (i/4) * range;
    ctx.strokeStyle = "rgba(0, 229, 255, 0.08)"; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.fillStyle = "#a8c0d8"; ctx.fillText(price.toFixed(2), w - pad.r + 5, y);
  }
  data.forEach((d, i) => {
    const x = (w - pad.r) - ((data.length - 1 - i) * spacing) - (spacing/2) + panX;
    if (x < pad.l - candleW || x > w - pad.r + candleW) return;
    const yO = pad.t + (1 - (d.o - minL) / range) * drawH; const yC = pad.t + (1 - (d.c - minL) / range) * drawH;
    const yH = pad.t + (1 - (d.h - minL) / range) * drawH; const yL = pad.t + (1 - (d.l - minL) / range) * drawH;
    const color = d.c >= d.o ? "#00ff88" : "#ff3a5c"; ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke();
    ctx.fillRect(x - candleW/2, Math.min(yO, yC), candleW, Math.max(1, Math.abs(yO - yC)));
    if (i % Math.max(1, Math.floor(data.length / (5 * zoom))) === 0 || i === data.length - 1) {
      ctx.fillStyle = "#5a7a9a"; ctx.textAlign = "center"; ctx.fillText(d.dateStr, x, h - 5);
      ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, h - pad.b + 5); ctx.stroke();
    }
  });
}

function openChartModal() {
  if (currentChartData.length > 0) {
    document.getElementById("modal-chart-fs").classList.remove("hidden");
    document.getElementById("fs-chart-title").textContent = `${currentChartTicker} - ANÁLISIS`;
    setTimeout(() => drawCandlesticks(document.getElementById("fullscreen-chart"), currentChartData, chartZoom, chartPanX), 50);
  }
}

function setupChartInteractions() {
  const fs = document.getElementById("fullscreen-chart"); let drag = false; let startX = 0;
  fs.addEventListener('pointerdown', e => { drag = true; startX = e.clientX; fs.setPointerCapture(e.pointerId); });
  fs.addEventListener('pointermove', e => {
    if (!drag) return; chartPanX = Math.max(0, Math.min(chartPanX + e.clientX - startX, Math.max(0, ((fs.getBoundingClientRect().width - 55) / currentChartData.length) * chartZoom * currentChartData.length - (fs.getBoundingClientRect().width - 55))));
    startX = e.clientX; drawCandlesticks(fs, currentChartData, chartZoom, chartPanX);
  });
  fs.addEventListener('pointerup', () => drag = false); fs.addEventListener('pointercancel', () => drag = false);
  fs.addEventListener('wheel', e => { e.preventDefault(); chartZoom = Math.max(1, Math.min(chartZoom + e.deltaY * -0.005, 20)); drawCandlesticks(fs, currentChartData, chartZoom, chartPanX); });
  let pDist = null;
  fs.addEventListener('touchstart', e => { if(e.touches.length===2) pDist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY); }, {passive:false});
  fs.addEventListener('touchmove', e => {
    e.preventDefault(); if(e.touches.length===2 && pDist) {
      const cDist = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      chartZoom = Math.max(1, Math.min(chartZoom + (cDist-pDist)*0.02, 20)); pDist = cDist; drawCandlesticks(fs, currentChartData, chartZoom, chartPanX);
    }
  }, {passive:false});
  fs.addEventListener('touchend', e => { if(e.touches.length<2) pDist=null; });
  window.addEventListener('resize', () => { if(!document.getElementById("modal-chart-fs").classList.contains("hidden")) drawCandlesticks(fs, currentChartData, chartZoom, chartPanX); });
}

function closeChartModal() { document.getElementById("modal-chart-fs").classList.add("hidden"); drawCandlesticks(document.getElementById("inline-chart"), currentChartData, chartZoom, chartPanX); }

// ─────────────────────────────────────────────────────────────
// TRADING
// ─────────────────────────────────────────────────────────────

async function fetchPrice(ticker) {
  const res = await fetch(CORS_PROXY + encodeURIComponent(`${YF_URL}${encodeURIComponent(ticker)}?interval=1m&range=1d`));
  if(!res.ok) throw new Error(); const data = await res.json(); return data.chart.result[0].meta.regularMarketPrice;
}

async function fetchBuyPrice() {
  const ticker = document.getElementById("buy-ticker").value.trim().toUpperCase(); if (!ticker) return;
  const priceEl = document.getElementById("buy-price"); priceEl.textContent = "Cargando...";
  try {
    const price = await fetchPrice(ticker); priceEl.dataset.price = price; priceEl.dataset.ticker = ticker;
    priceEl.textContent = formatAmount(price, getCurrency()); updateBuyCost(); loadInlineChart(ticker);
  } catch (err) { priceEl.textContent = "Error"; showToast("Ticker no encontrado", "error"); }
}

function updateBuyCost() {
  const price = parseFloat(document.getElementById("buy-price").dataset.price) || 0; const qty = parseInt(document.getElementById("buy-qty").value) || 0;
  const total = price * qty; const balance = state.market === "ES" ? state.balanceEs : state.balanceUs;
  if (total > 0) {
    const fees = calcBuyFees(total, state.market); const totalWithFees = total + fees.totalFee;
    document.getElementById("buy-total-cost").innerHTML = `${formatAmount(totalWithFees, getCurrency())} <span style="font-size:0.75em;color:var(--text-muted);">(+${formatAmount(fees.totalFee, getCurrency())} comis.)</span>`;
    const hint = document.getElementById("buy-balance-hint"); hint.textContent = `SALDO DISP: ${formatAmount(balance, getCurrency())}`;
    hint.style.color = totalWithFees > balance ? "var(--neon-red)" : "var(--text-muted)";
  } else {
    document.getElementById("buy-total-cost").textContent = "—"; document.getElementById("buy-balance-hint").textContent = `SALDO DISP: ${formatAmount(balance, getCurrency())}`; document.getElementById("buy-balance-hint").style.color = "var(--text-muted)";
  }
}

function executeBuy() {
  const ticker = document.getElementById("buy-price").dataset.ticker; const price = parseFloat(document.getElementById("buy-price").dataset.price); const qty = parseInt(document.getElementById("buy-qty").value);
  if(!ticker || !price || qty <= 0) return showToast("Datos inválidos", "error");
  const cost = price * qty; const fees = calcBuyFees(cost, state.market); const totalWithFees = cost + fees.totalFee; const balanceKey = state.market === "ES" ? "balanceEs" : "balanceUs";
  if(state[balanceKey] < totalWithFees) return showToast("Saldo insuficiente", "error");
  state[balanceKey] -= totalWithFees;
  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs;
  const pos = portfolio.find(p => p.ticker === ticker);
  if(pos) { pos.price = ((pos.price * pos.qty) + (price * qty)) / (pos.qty + qty); pos.qty += qty; } else { portfolio.push({ ticker, qty, price }); }
  addHistory("COMPRA", ticker, qty, price, state.market); updateStats("buy", cost, state.market);
  awardXP('buy', { cost });
  if (state.market === "ES" && state.stats.opsEs === 1) awardXP('first_buy_es', {}); if (state.market === "US" && state.stats.opsUs === 1) awardXP('first_buy_us', {});
  if ([...state.portfolioEs, ...state.portfolioUs].length >= 3) awardXP('diversification', {});
  saveToLS(); updateUI(); resetBuyForm(); showBuyFeeModal(ticker, qty, price, cost, fees);
}

function executeSell() {
  const ticker = document.getElementById("sell-ticker").value; const price = parseFloat(document.getElementById("sell-price").dataset.price); const qty = parseInt(document.getElementById("sell-qty").value);
  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs; const pos = portfolio.find(p => p.ticker === ticker);
  if(!pos || qty <= 0 || qty > pos.qty) return showToast("Cantidad inválida", "error");
  if(!price) return showToast("Obtén el precio primero", "error");
  const grossReturn = price * qty; const costBasis = pos.price * qty; const sellFees = calcSellFees(grossReturn, costBasis, state.market); const pnlAfterFees = grossReturn - costBasis - sellFees.totalDeductions;
  
  if(state.market === "ES") { state.balanceEs += sellFees.netReturn; state.stats.plEs += pnlAfterFees; } else { state.balanceUs += sellFees.netReturn; state.stats.plUs += pnlAfterFees; }
  const pnlPct = (price / pos.price) - 1;
  if(!state.stats.best || pnlPct > state.stats.best.pct) state.stats.best = { ticker, pct: pnlPct }; if(!state.stats.worst || pnlPct < state.stats.worst.pct) state.stats.worst = { ticker, pct: pnlPct };
  pos.qty -= qty; if(pos.qty === 0) portfolio.splice(portfolio.indexOf(pos), 1);
  addHistory("VENTA", ticker, qty, price, state.market); updateStats("sell", grossReturn, state.market);
  
  awardXP('sell_profit', { netGain: pnlAfterFees, pct: pnlPct });
  
  if (pnlAfterFees > 0) {
    const netGainEur = state.market === "ES" ? pnlAfterFees : (pnlAfterFees / state.exchangeRate);
    awardPanducoins(netGainEur);
  }

  saveToLS(); updateUI(); document.getElementById("sell-qty").value = ""; document.getElementById("sell-ticker").value = ""; onSellTickerChange(); showSellFeeModal(ticker, qty, price, grossReturn, costBasis, sellFees);
}

function updateSellReturn() {
  const price = parseFloat(document.getElementById("sell-price").dataset.price) || 0; const qty = parseInt(document.getElementById("sell-qty").value) || 0; const ticker = document.getElementById("sell-ticker").value;
  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs; const pos = portfolio.find(p => p.ticker === ticker);
  if(pos && qty > 0) {
    const gross = price * qty; const cost = pos.price * qty; const fees = calcSellFees(gross, cost, state.market);
    document.getElementById("sell-total-return").innerHTML = `${formatAmount(fees.netReturn, getCurrency())} <span style="font-size:0.75em;color:var(--text-muted);">(−${formatAmount(fees.totalDeductions, getCurrency())} tasas)</span>`;
    const pnlNet = fees.netReturn - cost; const pnlEl = document.getElementById("sell-pnl-est");
    pnlEl.textContent = formatAmount(pnlNet, getCurrency()); pnlEl.className = pnlNet >= 0 ? "green" : "red";
  } else { document.getElementById("sell-total-return").textContent = "—"; document.getElementById("sell-pnl-est").textContent = "—"; document.getElementById("sell-pnl-est").className = ""; }
}

async function onSellTickerChange() {
  const ticker = document.getElementById("sell-ticker").value;
  if(!ticker) { document.getElementById("sell-price").textContent = "—"; document.getElementById("sell-max").textContent = "0"; return; }
  const pos = (state.market === "ES" ? state.portfolioEs : state.portfolioUs).find(p => p.ticker === ticker);
  document.getElementById("sell-max").textContent = pos ? pos.qty : 0; document.getElementById("sell-price").textContent = "Cargando...";
  try {
    const price = await fetchPrice(ticker); document.getElementById("sell-price").dataset.price = price;
    document.getElementById("sell-price").textContent = formatAmount(price, getCurrency()); if(pos) pos.currentPrice = price; updateSellReturn();
  } catch(e) { document.getElementById("sell-price").textContent = "Error"; }
}

// ─────────────────────────────────────────────────────────────
// UI BASE
// ─────────────────────────────────────────────────────────────

function updateUI() {
  const isEs = state.market === "ES"; const currency = getCurrency(); const balance = isEs ? state.balanceEs : state.balanceUs;
  document.getElementById("header-saldo-es").textContent = formatAmount(state.balanceEs, "EUR");
  document.getElementById("header-saldo-us").textContent = formatAmount(state.balanceUs, "USD");
  document.getElementById("portfolio-panel-title").textContent = isEs ? "🎮 CARTERA ESPAÑOLA" : "🎮 CARTERA USA";
  document.getElementById("portfolio-cash").textContent = formatAmount(balance, currency);
  document.getElementById("mkt-es").classList.toggle("active", isEs); document.getElementById("mkt-us").classList.toggle("active", !isEs);
  document.body.classList.toggle("market-es", isEs); document.body.classList.toggle("market-us", !isEs);
  renderPortfolio(); populateSellSelect(); updateNetWorth(); renderHistory(); renderStats(); updateXPBar(); updatePanducoinsUI();
  refreshHeaderAvatar();
}

function renderPortfolio() {
  const container = document.getElementById("portfolio-body"); const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs; const currency = getCurrency();
  container.innerHTML = "";
  if(portfolio.length === 0) {
    container.innerHTML = '<tr><td colspan="6" class="empty-row">No hay posiciones</td></tr>'; document.getElementById("portfolio-value").textContent = formatAmount(0, currency); document.getElementById("portfolio-total").textContent = formatAmount(state.market === "ES" ? state.balanceEs : state.balanceUs, currency); return;
  }
  let totalValue = 0;
  portfolio.forEach(pos => {
    const cp = pos.currentPrice || pos.price; const val = cp * pos.qty; const pnl = (cp - pos.price) * pos.qty; const pnlPct = ((cp / pos.price) - 1) * 100; totalValue += val;
    container.innerHTML += `<tr><td class="bold">${pos.ticker}</td><td>${pos.qty}</td><td>${formatAmount(pos.price, currency)}</td><td class="price-cell">${formatAmount(cp, currency)}</td><td>${formatAmount(val, currency)}</td><td class="${pnl >= 0 ? 'green' : 'red'}">${pnl >= 0 ? '+' : ''}${formatAmount(pnl, currency)} (${pnlPct.toFixed(2)}%)</td></tr>`;
  });
  document.getElementById("portfolio-value").textContent = formatAmount(totalValue, currency); document.getElementById("portfolio-total").textContent = formatAmount(totalValue + (state.market === "ES" ? state.balanceEs : state.balanceUs), currency);
}

function updateNetWorth() {
  let totEs = 0; let totUs = 0; state.portfolioEs.forEach(p => totEs += (p.currentPrice || p.price) * p.qty); state.portfolioUs.forEach(p => totUs += (p.currentPrice || p.price) * p.qty);
  const totalEur = state.balanceEs + totEs + ((state.balanceUs + totUs) / state.exchangeRate); const costEur = INITIAL_BALANCE_ES + (INITIAL_BALANCE_US / state.exchangeRate);
  document.getElementById("header-networth").textContent = formatAmount(totalEur, "EUR");
  const pl = totalEur - costEur; const plEl = document.getElementById("header-pl"); plEl.textContent = `${pl >= 0 ? '+' : ''}${formatAmount(pl, "EUR")}`;
  document.getElementById("header-pl-pill").classList.toggle("gain", pl >= 0); document.getElementById("header-pl-pill").classList.toggle("loss", pl < 0);
}

function renderStats() {
  document.getElementById("stat-ops").textContent = state.stats.ops; document.getElementById("stat-buys").textContent = state.stats.buys; document.getElementById("stat-sells").textContent = state.stats.sells; document.getElementById("stat-ops-es").textContent = state.stats.opsEs; document.getElementById("stat-ops-us").textContent = state.stats.opsUs;
  const plEsEl = document.getElementById("stat-pl-es"); plEsEl.textContent = formatAmount(state.stats.plEs, "EUR"); plEsEl.className = `stat-card-val ${state.stats.plEs >= 0 ? 'green' : 'red'}`;
  const plUsEl = document.getElementById("stat-pl-us"); plUsEl.textContent = formatAmount(state.stats.plUs, "USD"); plUsEl.className = `stat-card-val ${state.stats.plUs >= 0 ? 'green' : 'red'}`;
  document.getElementById("stat-best").textContent = state.stats.best ? `${state.stats.best.ticker} (+${(state.stats.best.pct*100).toFixed(2)}%)` : "—"; document.getElementById("stat-worst").textContent = state.stats.worst ? `${state.stats.worst.ticker} (${(state.stats.worst.pct*100).toFixed(2)}%)` : "—";
}

function addHistory(type, ticker, qty, price, market) { state.history.unshift({ type, ticker, qty, price, market, date: new Date().toISOString() }); }
function updateStats(type, amount, market) { state.stats.ops++; if(type==='buy') state.stats.buys++; if(type==='sell') state.stats.sells++; if(market==='ES') state.stats.opsEs++; else state.stats.opsUs++; }
function getCurrency() { return state.market === "ES" ? "EUR" : "USD"; }
function formatAmount(val, curr) { return new Intl.NumberFormat(curr === "EUR" ? "es-ES" : "en-US", { style: "currency", currency: curr }).format(val); }

function setMarket(m) {
  state.market = m; saveToLS(); updateUI(); resetBuyForm(); document.getElementById("inline-chart-container").classList.remove("active"); renderTickerChips();
  document.getElementById("mb-flag").textContent = m === "ES" ? "🇪🇸" : "🇺🇸";
  document.getElementById("mb-name").textContent = m === "ES" ? "MERCADO ESPAÑOL — IBEX 35 & BME" : "MERCADO USA — NYSE & NASDAQ";
  document.getElementById("mb-hint").textContent = m === "ES" ? "IBE.MC · BBVA.MC · SAN.MC · ITX.MC · REP.MC · AMS.MC · TEF.MC · ACX.MC" : "AAPL · TSLA · NVDA · MSFT · AMZN · META · BTC-USD · GOOGL";
}

function resetBuyForm() { document.getElementById("buy-ticker").value = ""; document.getElementById("buy-qty").value = ""; document.getElementById("buy-price").textContent = "—"; document.getElementById("buy-price").dataset.price = ""; document.getElementById("buy-total-cost").textContent = "—"; document.getElementById("buy-balance-hint").textContent = ""; }
function switchTab(tab) { document.getElementById("tab-buy").classList.toggle("active", tab === 'buy'); document.getElementById("tab-sell").classList.toggle("active", tab === 'sell'); document.getElementById("form-buy").classList.toggle("hidden", tab !== 'buy'); document.getElementById("form-sell").classList.toggle("hidden", tab !== 'sell'); if (tab === 'sell') populateSellSelect(); }
function showToast(msg, type) { const t = document.getElementById("toast"); t.textContent = msg; t.className = `toast ${type} show`; setTimeout(() => t.classList.remove("show"), 3000); }
function renderTickerChips() {
  const container = document.getElementById("ticker-chips"); const tickers = state.market === "ES" ? ["IBE.MC", "SAN.MC", "ITX.MC", "REP.MC"] : ["AAPL", "TSLA", "NVDA", "BTC-USD"];
  container.innerHTML = ""; tickers.forEach(t => { const btn = document.createElement("button"); btn.className = "ticker-chip-btn"; btn.textContent = t; btn.onclick = () => { document.getElementById("buy-ticker").value = t; fetchBuyPrice(); }; container.appendChild(btn); });
}

async function refreshPortfolio() {
  const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs; if (portfolio.length === 0) return;
  const btn = document.querySelector(".btn-refresh"); if (btn) btn.textContent = "↻ Cargando...";
  for(let pos of portfolio) { try { pos.currentPrice = await fetchPrice(pos.ticker); } catch(e) {} }
  updateUI(); if (btn) btn.textContent = "↻ ACTUALIZAR";
}

function populateSellSelect() {
  const select = document.getElementById("sell-ticker"); const portfolio = state.market === "ES" ? state.portfolioEs : state.portfolioUs;
  select.innerHTML = '<option value="">— Selecciona —</option>'; portfolio.forEach(p => select.innerHTML += `<option value="${p.ticker}">${p.ticker} (${p.qty} accs)</option>`);
}

function renderHistory(filter = 'all') {
  const container = document.getElementById("history-list"); container.innerHTML = ""; let filtered = state.history;
  if(filter !== 'all') filtered = state.history.filter(h => h.market === filter || (filter === 'xfer' && h.type === 'TRASP.'));
  if(filtered.length === 0) { container.innerHTML = '<div class="empty-history">Aún no hay operaciones</div>'; return; }
  filtered.forEach(h => {
    const curr = h.market === 'ES' ? 'EUR' : 'USD'; const val = h.type === 'TRASP.' ? `Tipo: ${h.price.toFixed(4)}` : formatAmount(h.price * h.qty, curr);
    container.innerHTML += `<div class="history-item ${h.type.toLowerCase() === 'venta' ? 'sell' : (h.type === 'TRASP.' ? 'xfer' : 'buy')}"><span class="history-badge" style="background:${h.type === 'COMPRA' ? 'rgba(0,255,136,0.1)' : (h.type === 'VENTA' ? 'rgba(255,58,92,0.1)' : 'rgba(0,229,255,0.1)')}; color:${h.type === 'COMPRA' ? 'var(--neon-green)' : (h.type === 'VENTA' ? 'var(--neon-red)' : 'var(--neon-cyan)')}">${h.type}</span><div class="history-detail"><span class="history-ticker">${h.ticker}</span>${h.qty > 0 ? `<br/><span style="color:var(--text-muted)">${h.qty} @ ${formatAmount(h.price, curr)}</span>` : ''}</div><span class="history-pnl">${val}</span></div>`;
  });
}
function filterHistory(f) { document.querySelectorAll(".hf-btn").forEach(b => b.classList.remove("active")); document.getElementById(`hf-${f}`).classList.add("active"); renderHistory(f); }

// ─────────────────────────────────────────────────────────────
// MODALES (Transfer, Reset, Comisiones, Confetti)
// ─────────────────────────────────────────────────────────────

function openTransferModal() { document.getElementById("modal-transfer").classList.remove("hidden"); loadExchangeRate(); }
function closeTransferModal() { document.getElementById("modal-transfer").classList.add("hidden"); }
function openResetModal() { document.getElementById("modal-reset").classList.remove("hidden"); }
function closeResetModal() { document.getElementById("modal-reset").classList.add("hidden"); }
function confirmReset() {
  localStorage.clear();
  state = { market: "ES", balanceEs: INITIAL_BALANCE_ES, balanceUs: INITIAL_BALANCE_US, portfolioEs: [], portfolioUs: [], history: [], stats: { ops: 0, buys: 0, sells: 0, opsEs: 0, opsUs: 0, plEs: 0, plUs: 0, best: null, worst: null }, exchangeRate: 1.08, transferDir: "ES_TO_US", xp: 0, activeTitle: null, unlockedTitles: [], panducoins: 0, avatar: { gender: 'male', skin: '#ffdbac', eyes: '#000000', hairStyle: 'short', hairColor: '#000000', clothes: 'shirt_basic', accessory: 'none', pet: 'none', car: 'none' }, inventory: { clothes: ['shirt_basic'], accessories: ['none'], pets: ['none'], cars: ['none'] } };
  saveToLS(); updateUI(); closeResetModal(); showToast("Juego reiniciado por completo", "success"); refreshHeaderAvatar();
}

async function loadExchangeRate() {
  try { const res = await fetch(CORS_PROXY + encodeURIComponent(YF_URL + "EURUSD=X?interval=1d&range=1d")); const data = await res.json(); state.exchangeRate = data.chart.result[0].meta.regularMarketPrice; } catch(e) { state.exchangeRate = 1.08; }
  document.getElementById("er-value").textContent = `1 EUR = ${state.exchangeRate.toFixed(4)} USD`; updateTransferPreview();
}
function setTransferDir(dir) { state.transferDir = dir; document.getElementById("dir-es-us").classList.toggle("active", dir === "ES_TO_US"); document.getElementById("dir-us-es").classList.toggle("active", dir === "US_TO_ES"); document.getElementById("transfer-amount").value = ""; updateTransferPreview(); }
function updateTransferPreview() {
  const amt = parseFloat(document.getElementById("transfer-amount").value) || 0; const isEsToUs = state.transferDir === "ES_TO_US";
  document.getElementById("transfer-label").textContent = isEsToUs ? "IMPORTE EN EUR A ENVIAR" : "IMPORTE EN USD A ENVIAR"; document.getElementById("tp-from-lbl").textContent = isEsToUs ? "Envías desde 🇪🇸" : "Envías desde 🇺🇸"; document.getElementById("tp-to-lbl").textContent = isEsToUs ? "Recibes en 🇺🇸" : "Recibes en 🇪🇸";
  document.getElementById("tp-from-val").textContent = formatAmount(amt, isEsToUs ? "EUR" : "USD"); let received = isEsToUs ? amt * state.exchangeRate : amt / state.exchangeRate; document.getElementById("tp-to-val").textContent = formatAmount(received, isEsToUs ? "USD" : "EUR");
  document.getElementById("transfer-balances").innerHTML = `<span>Saldo Disp: ${formatAmount(isEsToUs ? state.balanceEs : state.balanceUs, isEsToUs ? 'EUR' : 'USD')}</span>`;
}
function executeTransfer() {
  const amt = parseFloat(document.getElementById("transfer-amount").value); if(!amt || amt <= 0) return showToast("Importe inválido", "error");
  const isEsToUs = state.transferDir === "ES_TO_US"; if(isEsToUs && state.balanceEs < amt) return showToast("Saldo EUR insuficiente", "error"); if(!isEsToUs && state.balanceUs < amt) return showToast("Saldo USD insuficiente", "error");
  let received = isEsToUs ? amt * state.exchangeRate : amt / state.exchangeRate;
  if(isEsToUs) { state.balanceEs -= amt; state.balanceUs += received; } else { state.balanceUs -= amt; state.balanceEs += received; }
  addHistory("TRASP.", isEsToUs ? "EUR->USD" : "USD->EUR", 0, state.exchangeRate, isEsToUs ? "ES" : "US"); awardXP('transfer', {}); saveToLS(); updateUI(); closeTransferModal(); showToast("Transferencia completada", "success");
}

function showBuyFeeModal(ticker, qty, price, cost, fees) {
  const fmt = (v) => formatAmount(v, fees.currency); const tw = fees.tranches === 1 ? "tramo" : "tramos";
  document.getElementById("fee-modal-title").textContent = "✅ COMPRA EJECUTADA"; document.getElementById("fee-modal-icon").textContent = "🟢";
  document.getElementById("fee-modal-body").innerHTML = `<div class="fee-row fee-highlight"><span>${qty} × ${ticker}</span><span>${fmt(price)} / acc.</span></div><div class="fee-divider"></div><div class="fee-row"><span>Valor de la orden</span><span>${fmt(cost)}</span></div><div class="fee-row fee-tranche"><span>⚡ Ejecución en <strong>${fees.tranches} ${tw}</strong></span><span class="fee-badge-tranche">${fees.tranches === 1 ? 'Completa' : 'Parcial'}</span></div><div class="fee-row"><span>Comisión bróker</span><span class="red">−${fmt(fees.totalFee)}</span></div><div class="fee-divider"></div><div class="fee-row fee-total"><span>TOTAL DESEMBOLSADO</span><span class="red">${fmt(cost + fees.totalFee)}</span></div>`;
  document.getElementById("modal-fees").classList.remove("hidden");
}
function showSellFeeModal(ticker, qty, price, gross, cost, fees) {
  const fmt = (v) => formatAmount(v, fees.currency); const gainLabel = fees.gain > 0 ? `<span class="green">+${fmt(fees.gain)}</span>` : `<span class="red">${fmt(fees.gain)}</span>`;
  document.getElementById("fee-modal-title").textContent = "💥 VENTA EJECUTADA"; document.getElementById("fee-modal-icon").textContent = "🔴";
  document.getElementById("fee-modal-body").innerHTML = `<div class="fee-row fee-highlight"><span>${qty} × ${ticker}</span><span>${fmt(price)} / acc.</span></div><div class="fee-divider"></div><div class="fee-row"><span>Retorno bruto</span><span>${fmt(gross)}</span></div><div class="fee-row"><span>Plusvalía</span><span>${gainLabel}</span></div><div class="fee-divider"></div><div class="fee-row"><span>Comisiones</span><span class="red">−${fmt(fees.brokerFee)}</span></div>${fees.gain > 0 ? `<div class="fee-row fee-tax-header"><span>🏛️ IRPF</span><span class="red">−${fmt(fees.taxAmount)}</span></div>` : ''}<div class="fee-divider"></div><div class="fee-row fee-total-net"><span>NETO RECIBIDO</span><span class="${fees.netReturn >= cost ? 'green' : 'red'}">${fmt(fees.netReturn)}</span></div>`;
  document.getElementById("modal-fees").classList.remove("hidden");
}
function closeFeeModal() { document.getElementById("modal-fees").classList.add("hidden"); }

function showLevelUpModal(level) {
  const ld = LEVELS.find(l => l.level === level); if (!ld) return;
  document.getElementById("lu-level-num").textContent = level; document.getElementById("lu-icon").textContent = ld.icon; document.getElementById("lu-title").textContent = ld.title; document.getElementById("lu-title").style.color = ld.color; document.getElementById("lu-desc").textContent = ld.desc; document.getElementById("lu-xp-total").textContent = state.xp + " XP";
  launchConfetti(ld.color); document.getElementById("modal-levelup").classList.remove("hidden");
  if (!state.activeTitle || level > parseInt(state.activeTitle)) { state.activeTitle = level; saveToLS(); updateXPBar(); }
}
function closeLevelUpModal() { document.getElementById("modal-levelup").classList.add("hidden"); }
function launchConfetti(color) {
  const container = document.getElementById("confetti-container"); if (!container) return; container.innerHTML = "";
  for (let i = 0; i < 60; i++) { const p = document.createElement("div"); p.className = "confetti-piece"; p.style.cssText = `background: ${["#00ff88", "#ffe600", "#00e5ff", "#ff3a5c", color][Math.floor(Math.random() * 5)]}; left: ${Math.random() * 100}%; width: ${4 + Math.random() * 8}px; height: ${4 + Math.random() * 8}px; animation-delay: ${Math.random() * 0.5}s; animation-duration: ${1.5 + Math.random() * 1.5}s; border-radius: ${Math.random() > 0.5 ? "50%" : "2px"};`; container.appendChild(p); }
  setTimeout(() => { if (container) container.innerHTML = ""; }, 4000);
}

function openRewardsModal() {
  renderRewardsPanel();
  document.getElementById("modal-rewards").classList.remove("hidden");
  // Dibujar avatar en rewards
  setTimeout(() => {
    const rewardsCanvas = document.getElementById("rewards-avatar-canvas");
    if (rewardsCanvas) drawCharacter(rewardsCanvas, state.avatar, 1);
  }, 50);
}
function closeRewardsModal() { document.getElementById("modal-rewards").classList.add("hidden"); }
function renderRewardsPanel() {
  const ld = getLevelData(state.xp); const c = document.getElementById("rewards-levels-list"); c.innerHTML = "";
  document.getElementById("rw-level").textContent = `NIVEL ${ld.current.level}`; document.getElementById("rw-xp").textContent = `${state.xp} XP`; document.getElementById("rw-next-xp").textContent = ld.next ? `Próximo: ${ld.next.xpRequired} XP` : "Nivel máximo! 🏆";
  const activeLevel = state.activeTitle ? parseInt(state.activeTitle) : ld.current.level;
  const ad = LEVELS.find(l => l.level === activeLevel) || ld.current;
  document.getElementById("rw-active-title").textContent = ad.title; document.getElementById("rw-active-title").style.color = ad.color;
  LEVELS.forEach(lvl => {
    const unl = state.xp >= lvl.xpRequired; const act = parseInt(state.activeTitle) === lvl.level;
    c.innerHTML += `<div class="reward-item ${unl ? "unlocked" : "locked"} ${act ? "active-title" : ""}" style="--lvl-color:${lvl.color}"><div class="ri-left"><span class="ri-icon" style="color:${unl ? lvl.color : "#333"}">${unl ? lvl.icon : "🔒"}</span><div class="ri-info"><span class="ri-level-tag">NIV. ${lvl.level}</span><span class="ri-title" style="color:${unl ? lvl.color : "#333"}">${lvl.title}</span><span class="ri-desc">${unl ? lvl.desc : `Requiere ${lvl.xpRequired} XP`}</span></div></div><div class="ri-right">${unl ? (act ? `<span class="ri-badge-active">✔ ACTIVO</span>` : `<button class="ri-btn-equip" onclick="equipTitle(${lvl.level})">EQUIPAR</button>`) : `<span class="ri-badge-locked">${lvl.xpRequired} XP</span>`}</div></div>`;
  });
}
function equipTitle(level) { state.activeTitle = level; saveToLS(); updateXPBar(); renderRewardsPanel(); const lvl = LEVELS.find(l => l.level === level); showToast(`Título "${lvl.title}" equipado ${lvl.icon}`, "success"); }
