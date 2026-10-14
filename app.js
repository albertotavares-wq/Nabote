(() => {
'use strict';

/* ───────────────────────── elementos e estado ───────────────────────── */
const $ = (s, r = document) => r.querySelector(s);
const main = $('#main'), over = $('#over');
const mctx = main.getContext('2d', { willReadFrequently: true });
const octx = over.getContext('2d');
const tmp = document.createElement('canvas');
const tctx = tmp.getContext('2d', { willReadFrequently: true });
const stage = $('#stage'), area = $('#area'), selbox = $('#selbox'), grid = $('#grid');
const handle = $('#handle'), resizeOutline = $('#resizeOutline');

const S = {
  tool: 'pencil', prevTool: 'pencil',
  fg: '#000000', bg: '#ffffff',
  zoom: 1, grid: false,
  brushShape: 'round', brushSize: 6,
  eraserSize: 8, airSize: 9,
  lineWidth: 1, fillMode: 0, transparent: false, magnify: 4,
  font: { family: 'Arial', size: 16, bold: false, italic: false, underline: false },
  name: 'Sem título', dirty: false,
};
const hist = { undo: [], redo: [] };
let sel = null;        // seleção flutuante
let textState = null;  // caixa de texto ativa
let drag = null;       // gesto do mouse em andamento
let curve = null;      // curva em construção
let poly = null;       // polígono em construção
let clipboard = null;  // área de transferência interna (canvas)

const PALETTE = [
  '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080', '#808040', '#004040', '#0080ff', '#004080', '#4000ff', '#804000',
  '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffff80', '#00ff80', '#80ffff', '#8080ff', '#ff0080', '#ff8040',
];

const svg = inner => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="#000">${inner}</svg>`;
const TOOLS = [
  ['lasso', 'Seleção livre', 'Seleciona uma parte da imagem com forma livre.', svg('<path d="M3 6 7 3 12 5 13 10 8 13 4 11Z" stroke-dasharray="2 1.5"/>')],
  ['select', 'Selecionar', 'Seleciona uma parte retangular da imagem.', svg('<rect x="2.5" y="3.5" width="11" height="9" stroke-dasharray="2 1.5"/>')],
  ['eraser', 'Borracha', 'Apaga uma parte da imagem usando a cor 2. Botão direito: troca a cor 1 pela cor 2.', svg('<path d="M3 11 9 3 14 7 9 13H5Z" fill="#f8a0b0"/>')],
  ['fill', 'Preencher com cor', 'Preenche uma área com a cor atual.', svg('<path d="M3 8 8 3 13 8 8 13Z" fill="#ccc"/><path d="M13 9q2 3 0 4-2-1 0-4" fill="#00f" stroke="#00f"/>')],
  ['picker', 'Selecionar cor', 'Seleciona uma cor da imagem. Botão direito: cor 2.', svg('<path d="M12 2l2 2-2 2-1-1-5 5-3 1 1-3 5-5-1-1z" fill="#ddd"/>')],
  ['magnifier', 'Lupa', 'Amplia a imagem.', svg('<circle cx="6.5" cy="6.5" r="4" fill="#cde"/><path d="M9.5 9.5 14 14" stroke-width="2"/>')],
  ['pencil', 'Lápis', 'Desenha uma linha de forma livre com 1 pixel de largura.', svg('<path d="M2 14 3 10 11 2 14 5 6 13Z" fill="#fd0"/>')],
  ['brush', 'Pincel', 'Desenha usando um pincel com forma e tamanho selecionáveis.', svg('<path d="M14 2 8 9" stroke-width="2"/><path d="M8 9Q4 9 3 14 8 13 9 10Z" fill="#c60"/>')],
  ['airbrush', 'Aerógrafo', 'Desenha usando um aerógrafo.', svg('<rect x="7" y="2" width="5" height="6" fill="#999"/><path d="M3 11h1M5 13h1M3 14h1M6 10h1M8 12h1M10 11h1M9 14h1" stroke-width="1.3"/>')],
  ['text', 'Texto', 'Insere texto na imagem.', '<svg viewBox="0 0 16 16" width="16" height="16"><text x="3" y="13" font-size="14" font-weight="bold" font-family="serif">A</text></svg>'],
  ['line', 'Linha', 'Desenha uma linha reta. Shift: ângulos de 45°.', svg('<path d="M2 14 14 2" stroke-width="1.5"/>')],
  ['curve', 'Curva', 'Desenha uma linha e depois a curva com dois cliques de arrasto.', svg('<path d="M2 12C2 2 14 14 14 4" stroke-width="1.5"/>')],
  ['rect', 'Retângulo', 'Desenha um retângulo. Shift: quadrado.', svg('<rect x="2.5" y="4.5" width="11" height="8"/>')],
  ['polygon', 'Polígono', 'Arraste a primeira aresta, clique nos vértices e dê duplo clique para fechar.', svg('<path d="M3 12 5 4 12 3 14 9 9 13Z"/>')],
  ['ellipse', 'Elipse', 'Desenha uma elipse. Shift: círculo.', svg('<ellipse cx="8" cy="8" rx="6" ry="4.5"/>')],
  ['roundrect', 'Retângulo arredondado', 'Desenha um retângulo com cantos arredondados.', svg('<rect x="2.5" y="4.5" width="11" height="8" rx="3"/>')],
];
const TOOL_BY_ID = Object.fromEntries(TOOLS.map(t => [t[0], t]));
const SHAPE_TOOLS = new Set(['line', 'curve', 'rect', 'ellipse', 'roundrect', 'polygon']);

/* ───────────────────────── utilidades ───────────────────────── */
const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb2hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function bresenham(x0, y0, x1, y1, fn) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

function setStatus(el, text) { $(el).textContent = text; }
function markDirty() { S.dirty = true; }

/* ───────────────────────── canvas, zoom, histórico ───────────────────────── */
function setSize(w, h) {
  main.width = over.width = w;
  main.height = over.height = h;
  applyZoom();
}

function applyZoom() {
  const w = main.width * S.zoom, h = main.height * S.zoom;
  for (const c of [main, over]) { c.style.width = w + 'px'; c.style.height = h + 'px'; }
  const showGrid = S.grid && S.zoom >= 4;
  grid.style.display = showGrid ? 'block' : 'none';
  if (showGrid) {
    const z = S.zoom + 'px';
    grid.style.backgroundImage = 'linear-gradient(to right, rgba(0,0,0,.28) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.28) 1px, transparent 1px)';
    grid.style.backgroundSize = `${z} ${z}`;
  }
  layoutSel();
  setStatus('#stSize', `${main.width} x ${main.height}px`);
}

function snapshot() {
  return { w: main.width, h: main.height, data: mctx.getImageData(0, 0, main.width, main.height) };
}
function restore(s) {
  if (main.width !== s.w || main.height !== s.h) setSize(s.w, s.h);
  mctx.putImageData(s.data, 0, 0);
}
function pushUndo() {
  hist.undo.push(snapshot());
  if (hist.undo.length > 40) hist.undo.shift();
  hist.redo.length = 0;
  markDirty();
}
function undo() {
  cancelGestures();
  if (sel) {
    const wasLifted = sel.lifted;
    dropSelection();
    if (!wasLifted) return;
  } else if (textState) { cancelText(); return; }
  if (!hist.undo.length) return;
  hist.redo.push(snapshot());
  restore(hist.undo.pop());
}
function redo() {
  cancelGestures();
  dropSelection();
  if (!hist.redo.length) return;
  hist.undo.push(snapshot());
  restore(hist.redo.pop());
}

function fillAll(color) { mctx.fillStyle = color; mctx.fillRect(0, 0, main.width, main.height); }

function resizeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = main.width; c.height = main.height;
  c.getContext('2d').drawImage(main, 0, 0);
  setSize(w, h);
  fillAll(S.bg);
  mctx.drawImage(c, 0, 0);
}

// diálogo próprio: confirm()/alert() do navegador não funcionam em contextos isolados
function askDialog(message, { cancel = true } = {}) {
  return new Promise(resolve => {
    const dlg = $('#dlgConfirm');
    $('#confirmText').textContent = message;
    $('#confirmCancel').hidden = !cancel;
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.returnValue = 'cancel';
    dlg.showModal();
  });
}

async function newImage(w = 800, h = 500) {
  if (S.dirty && !(await askDialog('Descartar as alterações da imagem atual?'))) return;
  cancelGestures(); dropSelection(); cancelText();
  hist.undo.length = 0; hist.redo.length = 0;
  setSize(w, h); fillAll('#ffffff');
  S.name = 'Sem título'; S.dirty = false; updateTitle();
}

function updateTitle() {
  $('#titletext').textContent = `${S.name} - Pintar Nabote`;
  document.title = `${S.name} - Pintar Nabote`;
}

/* ───────────────────────── ferramentas de pixel ───────────────────────── */
function stamp(ctx, x, y, shape, size, color) {
  ctx.fillStyle = color;
  if (size <= 1) { ctx.fillRect(x, y, 1, 1); return; }
  const x0 = Math.round(x - size / 2), y0 = Math.round(y - size / 2), r = size / 2;
  if (shape === 'square') ctx.fillRect(x0, y0, size, size);
  else if (shape === 'round') {
    for (let j = 0; j < size; j++) {
      const dy = j + 0.5 - r, half = Math.sqrt(Math.max(0, r * r - dy * dy));
      const w = Math.max(1, Math.round(half * 2));
      ctx.fillRect(Math.round(x0 + r - w / 2), y0 + j, w, 1);
    }
  } else if (shape === 'slash') for (let i = 0; i < size; i++) ctx.fillRect(x0 + i, y0 + size - 1 - i, 1, 1);
  else for (let i = 0; i < size; i++) ctx.fillRect(x0 + i, y0 + i, 1, 1);
}

function eraseAt(x, y, btn) {
  const s = S.eraserSize, x0 = x - (s >> 1), y0 = y - (s >> 1);
  if (btn === 2) { // borracha de cor: troca só a cor 1 pela cor 2
    const id = mctx.getImageData(x0, y0, s, s), d = id.data;
    const [fr, fg, fb] = hex2rgb(S.fg), [br, bgc, bb] = hex2rgb(S.bg);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] === fr && d[i + 1] === fg && d[i + 2] === fb) { d[i] = br; d[i + 1] = bgc; d[i + 2] = bb; d[i + 3] = 255; }
    }
    mctx.putImageData(id, x0, y0);
  } else { mctx.fillStyle = S.bg; mctx.fillRect(x0, y0, s, s); }
}

function spray(p, color) {
  const r = S.airSize, n = Math.round(r * r * 0.3);
  mctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = r * Math.sqrt(Math.random());
    mctx.fillRect(Math.round(p.x + Math.cos(a) * d), Math.round(p.y + Math.sin(a) * d), 1, 1);
  }
}

function floodFill(x, y, hex) {
  const w = main.width, h = main.height;
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const img = mctx.getImageData(0, 0, w, h), d = img.data;
  const [r, g, b] = hex2rgb(hex);
  const i0 = (y * w + x) * 4, tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2], ta = d[i0 + 3];
  if (tr === r && tg === g && tb === b && ta === 255) return;
  const match = i => d[i] === tr && d[i + 1] === tg && d[i + 2] === tb && d[i + 3] === ta;
  const st = [x, y];
  while (st.length) {
    const cy = st.pop(), cx = st.pop();
    if (!match((cy * w + cx) * 4)) continue;
    let lx = cx, rx = cx;
    while (lx > 0 && match((cy * w + lx - 1) * 4)) lx--;
    while (rx < w - 1 && match((cy * w + rx + 1) * 4)) rx++;
    for (let k = lx; k <= rx; k++) { const j = (cy * w + k) * 4; d[j] = r; d[j + 1] = g; d[j + 2] = b; d[j + 3] = 255; }
    for (const ny of [cy - 1, cy + 1]) {
      if (ny < 0 || ny >= h) continue;
      let inSpan = false;
      for (let k = lx; k <= rx; k++) {
        const m = match((ny * w + k) * 4);
        if (m && !inSpan) { st.push(k, ny); inSpan = true; } else if (!m) inSpan = false;
      }
    }
  }
  mctx.putImageData(img, 0, 0);
}

function pickColor(p, btn) {
  if (p.x < 0 || p.y < 0 || p.x >= main.width || p.y >= main.height) return;
  const d = mctx.getImageData(p.x, p.y, 1, 1).data;
  setColor(rgb2hex(d[0], d[1], d[2]), btn === 2);
}

/* ───────────────────────── formas ───────────────────────── */
function roundPath(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function boxOf(sh) {
  const x = Math.min(sh.p0.x, sh.p1.x), y = Math.min(sh.p0.y, sh.p1.y);
  const r = Math.max(sh.p0.x, sh.p1.x) + 1, b = Math.max(sh.p0.y, sh.p1.y) + 1;
  return { x, y, w: r - x, h: b - y };
}

function boxPath(ctx, t, b, inset) {
  const x = b.x + inset, y = b.y + inset, w = Math.max(b.w - 2 * inset, 0), h = Math.max(b.h - 2 * inset, 0);
  ctx.beginPath();
  if (t === 'rect') ctx.rect(x, y, w, h);
  else if (t === 'ellipse') ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  else roundPath(ctx, x, y, w, h, Math.min(clamp(Math.min(b.w, b.h) / 4, 3, 12), w / 2, h / 2));
}

function drawShape(ctx, sh) {
  const lw = sh.lw, half = (v) => v + 0.5;
  ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = sh.fg;
  if (sh.t === 'line') {
    ctx.beginPath(); ctx.moveTo(half(sh.p0.x), half(sh.p0.y)); ctx.lineTo(half(sh.p1.x), half(sh.p1.y)); ctx.stroke();
  } else if (sh.t === 'curve') {
    ctx.beginPath(); ctx.moveTo(half(sh.p0.x), half(sh.p0.y));
    ctx.bezierCurveTo(half(sh.c1.x), half(sh.c1.y), half(sh.c2.x), half(sh.c2.y), half(sh.p1.x), half(sh.p1.y));
    ctx.stroke();
  } else if (sh.t === 'polygon') {
    ctx.beginPath();
    sh.pts.forEach((p, i) => i ? ctx.lineTo(half(p.x), half(p.y)) : ctx.moveTo(half(p.x), half(p.y)));
    if (sh.closed) {
      ctx.closePath();
      if (sh.mode === 1) { ctx.fillStyle = sh.bg; ctx.fill(); }
      if (sh.mode === 2) { ctx.fillStyle = sh.fg; ctx.fill(); }
    }
    if (sh.mode !== 2 || !sh.closed) ctx.stroke();
  } else {
    const b = boxOf(sh);
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    if (sh.mode === 1) { ctx.fillStyle = sh.bg; boxPath(ctx, sh.t, b, 0); ctx.fill(); }
    if (sh.mode === 2) { ctx.fillStyle = sh.fg; boxPath(ctx, sh.t, b, 0); ctx.fill(); return; }
    boxPath(ctx, sh.t, b, lw / 2); ctx.stroke();
  }
}

function shapeBounds(sh) {
  const pts = sh.t === 'polygon' ? sh.pts : sh.t === 'curve' ? [sh.p0, sh.p1, sh.c1, sh.c2] : [sh.p0, sh.p1];
  const pad = sh.lw + 3;
  const x0 = clamp(Math.min(...pts.map(p => p.x)) - pad, 0, main.width), y0 = clamp(Math.min(...pts.map(p => p.y)) - pad, 0, main.height);
  const x1 = clamp(Math.max(...pts.map(p => p.x)) + pad, 0, main.width), y1 = clamp(Math.max(...pts.map(p => p.y)) + pad, 0, main.height);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// desenha a forma sem suavização (pixels duros), como no Paint clássico
function paintShape(target, sh) {
  const w = main.width, h = main.height;
  if (tmp.width !== w || tmp.height !== h) { tmp.width = w; tmp.height = h; } else tctx.clearRect(0, 0, w, h);
  drawShape(tctx, sh);
  const b = shapeBounds(sh);
  if (b.w > 0 && b.h > 0) {
    const id = tctx.getImageData(b.x, b.y, b.w, b.h), d = id.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 96 ? 255 : 0;
    tctx.putImageData(id, b.x, b.y);
  }
  target.drawImage(tmp, 0, 0);
}

const clearPreview = () => octx.clearRect(0, 0, over.width, over.height);
function preview(sh) { clearPreview(); paintShape(octx, sh); }
function commitShape(sh) { pushUndo(); paintShape(mctx, sh); clearPreview(); }

function constrain(t, p0, p, shift) {
  if (!shift) return p;
  const dx = p.x - p0.x, dy = p.y - p0.y;
  if (t === 'line' || t === 'curve') {
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy);
    return { x: Math.round(p0.x + Math.cos(a) * len), y: Math.round(p0.y + Math.sin(a) * len) };
  }
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: p0.x + (dx < 0 ? -d : d), y: p0.y + (dy < 0 ? -d : d) };
}

const colors = btn => btn === 2 ? { fg: S.bg, bg: S.fg } : { fg: S.fg, bg: S.bg };
function baseShape(t, btn) { return { t, lw: S.lineWidth, mode: S.fillMode, ...colors(btn) }; }

function finishPoly() {
  if (!poly) return;
  const pts = [];
  for (const p of poly.pts) if (!pts.length || pts[pts.length - 1].x !== p.x || pts[pts.length - 1].y !== p.y) pts.push(p);
  if (pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y) pts.pop();
  const base = baseShape('polygon', poly.btn);
  poly = null;
  if (pts.length < 2) { clearPreview(); return; }
  commitShape({ ...base, pts, closed: true });
}

function cancelGestures() {
  if (drag && drag.timer) clearInterval(drag.timer);
  drag = null; curve = null; poly = null; clearPreview();
}

/* ───────────────────────── seleção ───────────────────────── */
function makeTransparent(cv, hex) {
  const c = cv.getContext('2d'), id = c.getImageData(0, 0, cv.width, cv.height), d = id.data, [r, g, b] = hex2rgb(hex);
  for (let i = 0; i < d.length; i += 4) if (d[i] === r && d[i + 1] === g && d[i + 2] === b) d[i + 3] = 0;
  c.putImageData(id, 0, 0);
}

function createSelection(x, y, w, h, cv, opts = {}) {
  sel = { x, y, w, h, cv, lifted: !!opts.lifted, path: opts.path || null };
  selbox.replaceChildren(cv);
  layoutSel();
  setStatus('#stSel', `${w} x ${h}`);
}

function layoutSel() {
  if (!sel) { selbox.hidden = true; return; }
  selbox.hidden = false;
  selbox.style.left = sel.x * S.zoom + 'px'; selbox.style.top = sel.y * S.zoom + 'px';
  selbox.style.width = sel.w * S.zoom + 'px'; selbox.style.height = sel.h * S.zoom + 'px';
}

function dropSelection() {
  sel = null; selbox.hidden = true; selbox.replaceChildren(); setStatus('#stSel', '');
}

function commitSelection() {
  if (!sel) return;
  if (sel.lifted) { mctx.drawImage(sel.cv, sel.x, sel.y); markDirty(); }
  dropSelection();
}

function eraseSource() {
  mctx.fillStyle = S.bg; mctx.strokeStyle = S.bg; mctx.lineWidth = 1;
  if (sel.path) {
    mctx.beginPath();
    sel.path.forEach((p, i) => i ? mctx.lineTo(p.x, p.y) : mctx.moveTo(p.x, p.y));
    mctx.closePath(); mctx.fill(); mctx.stroke();
  } else mctx.fillRect(sel.x, sel.y, sel.w, sel.h);
}

function liftSelection(copy) {
  if (!sel || sel.lifted) return;
  pushUndo();
  if (!copy) eraseSource(); else mctx.drawImage(sel.cv, sel.x, sel.y);
  sel.lifted = true;
}

function deleteSelection() {
  if (!sel) return;
  if (!sel.lifted) { pushUndo(); eraseSource(); }
  dropSelection();
}

function copySelection() {
  if (!sel) return false;
  clipboard = document.createElement('canvas');
  clipboard.width = sel.w; clipboard.height = sel.h;
  clipboard.getContext('2d').drawImage(sel.cv, 0, 0);
  if (navigator.clipboard && window.ClipboardItem) {
    clipboard.toBlob(b => b && navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).catch(() => {}));
  }
  return true;
}

function pasteCanvas(src) {
  commitSelection(); cancelGestures(); cancelText();
  pushUndo();
  if (src.width > main.width || src.height > main.height) resizeCanvas(Math.max(main.width, src.width), Math.max(main.height, src.height));
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  cv.getContext('2d').drawImage(src, 0, 0);
  setTool('select', true);
  createSelection(Math.round(area.scrollLeft / S.zoom), Math.round(area.scrollTop / S.zoom), cv.width, cv.height, cv, { lifted: true });
}

function selectAll() {
  commitSelection(); cancelText();
  setTool('select', true);
  const cv = document.createElement('canvas');
  cv.width = main.width; cv.height = main.height;
  cv.getContext('2d').drawImage(main, 0, 0);
  if (S.transparent) makeTransparent(cv, S.bg);
  createSelection(0, 0, cv.width, cv.height, cv);
}

// arrastar a seleção flutuante
let sdrag = null;
selbox.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  selbox.setPointerCapture(e.pointerId);
  sdrag = { sx: e.clientX, sy: e.clientY, ox: sel.x, oy: sel.y, moved: false };
});
selbox.addEventListener('pointermove', e => {
  if (!sdrag || !sel) return;
  const dx = Math.round((e.clientX - sdrag.sx) / S.zoom), dy = Math.round((e.clientY - sdrag.sy) / S.zoom);
  if (!sdrag.moved && (dx || dy)) { sdrag.moved = true; liftSelection(e.ctrlKey); }
  if (!sdrag.moved) return;
  sel.x = sdrag.ox + dx; sel.y = sdrag.oy + dy; layoutSel();
});
const endSdrag = () => { sdrag = null; };
selbox.addEventListener('pointerup', endSdrag);
selbox.addEventListener('pointercancel', endSdrag);

/* ───────────────────────── texto ───────────────────────── */
const fontCss = (px) => `${S.font.italic ? 'italic ' : ''}${S.font.bold ? 'bold ' : ''}${px}px "${S.font.family}"`;

function styleText() {
  if (!textState) return;
  const ta = textState.ta;
  ta.style.font = fontCss(S.font.size * S.zoom);
  ta.style.lineHeight = '1.2';
  ta.style.textDecoration = S.font.underline ? 'underline' : 'none';
  ta.style.color = textState.fg;
  ta.style.background = S.transparent ? 'transparent' : textState.bg;
}

function startText(b) {
  const ta = document.createElement('textarea');
  ta.className = 'textbox'; ta.spellcheck = false;
  ta.style.left = b.x * S.zoom + 'px'; ta.style.top = b.y * S.zoom + 'px';
  ta.style.width = Math.max(b.w, 60) * S.zoom + 'px'; ta.style.height = Math.max(b.h, 24) * S.zoom + 'px';
  stage.appendChild(ta);
  textState = { ta, x: b.x, y: b.y, fg: S.fg, bg: S.bg };
  styleText();
  setTimeout(() => ta.focus(), 0);
}

function cancelText() { if (textState) { textState.ta.remove(); textState = null; } }

function commitText() {
  if (!textState) return;
  const { ta, x, y, fg, bg } = textState;
  const txt = ta.value, w = ta.clientWidth / S.zoom, h = ta.clientHeight / S.zoom;
  ta.remove(); textState = null;
  if (!txt.trim()) return;
  pushUndo();
  const size = S.font.size, lh = size * 1.2;
  mctx.save();
  mctx.font = fontCss(size); mctx.textBaseline = 'top';
  const lines = [];
  for (const para of txt.split('\n')) {
    let cur = '';
    for (const word of para.split(/(\s+)/)) {
      if (cur && mctx.measureText(cur + word).width > w) { lines.push(cur.trimEnd()); cur = word.trimStart(); } else cur += word;
    }
    lines.push(cur);
  }
  if (!S.transparent) { mctx.fillStyle = bg; mctx.fillRect(x, y, w, Math.max(h, lines.length * lh)); }
  mctx.fillStyle = fg;
  lines.forEach((ln, i) => {
    const ty = y + i * lh + size * 0.08;
    mctx.fillText(ln, x, ty);
    if (S.font.underline && ln) mctx.fillRect(x, Math.round(ty + size * 1.02), mctx.measureText(ln).width, Math.max(1, Math.round(size / 14)));
  });
  mctx.restore();
}

/* ───────────────────────── interface: ferramentas, opções, cores ───────────────────────── */
function setTool(t, silent) {
  if (drag) return;
  if (!silent || t !== S.tool) { commitSelection(); commitText(); }
  if (curve || poly) { curve = null; poly = null; clearPreview(); }
  if (t !== 'picker' && t !== 'magnifier') S.prevTool = t;
  S.tool = t;
  document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  $('#textbar').hidden = t !== 'text';
  over.style.cursor = t === 'magnifier' ? 'zoom-in' : 'crosshair';
  setStatus('#stHint', TOOL_BY_ID[t][2]);
  renderOptions();
}

function optBtn(inner, on, click, title) {
  const b = document.createElement('button');
  b.innerHTML = inner; b.className = on ? 'on' : ''; b.title = title || '';
  b.addEventListener('click', () => { click(); renderOptions(); });
  return b;
}

function renderOptions() {
  const o = $('#options'); o.replaceChildren(); o.className = 'sunken';
  const t = S.tool, add = b => o.appendChild(b);
  const sv = (w, h, inner) => `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="#000" stroke="#000">${inner}</svg>`;
  const widths = () => [1, 2, 3, 4, 5].forEach(w => add(optBtn(sv(40, 8, `<rect x="2" y="${4 - w / 2}" width="36" height="${w}" stroke="none"/>`), S.lineWidth === w, () => { S.lineWidth = w; }, w + 'px')));
  if (t === 'lasso' || t === 'select' || t === 'text') {
    o.classList.add('cols1');
    add(optBtn(sv(40, 22, '<rect x="4" y="3" width="32" height="16" fill="#fff" stroke="#000"/><rect x="9" y="8" width="14" height="8" fill="#08f" stroke="none"/>'), !S.transparent, () => { S.transparent = false; styleText(); }, 'Opaco'));
    add(optBtn(sv(40, 22, '<rect x="4" y="3" width="32" height="16" fill="none" stroke="#000" stroke-dasharray="2 2"/><rect x="9" y="8" width="14" height="8" fill="#08f" stroke="none"/>'), S.transparent, () => { S.transparent = true; styleText(); }, 'Transparente'));
  } else if (t === 'eraser') {
    o.classList.add('cols1');
    [4, 6, 8, 10].forEach(s => add(optBtn(sv(40, 12, `<rect x="${20 - s / 2}" y="${6 - s / 2}" width="${s}" height="${s}" stroke="none"/>`), S.eraserSize === s, () => { S.eraserSize = s; }, s + 'px')));
  } else if (t === 'magnifier') {
    o.classList.add('cols1');
    [1, 2, 4, 6, 8].forEach(z => add(optBtn(`<span style="font-size:10px;line-height:10px">${z}x</span>`, S.zoom === z, () => { if (z > 1) S.magnify = z; setZoom(z); }, z + 'x')));
  } else if (t === 'brush') {
    o.classList.add('cols3');
    for (const shape of ['round', 'square', 'slash', 'backslash']) for (const s of [3, 6, 10]) {
      const px = Math.min(s, 12);
      const g = shape === 'round' ? `<circle cx="7" cy="7" r="${px / 2}" stroke="none"/>`
        : shape === 'square' ? `<rect x="${7 - px / 2}" y="${7 - px / 2}" width="${px}" height="${px}" stroke="none"/>`
        : shape === 'slash' ? `<path d="M${7 - px / 2} ${7 + px / 2} L${7 + px / 2} ${7 - px / 2}" stroke-width="1.5"/>`
        : `<path d="M${7 - px / 2} ${7 - px / 2} L${7 + px / 2} ${7 + px / 2}" stroke-width="1.5"/>`;
      add(optBtn(sv(14, 14, g), S.brushShape === shape && S.brushSize === s, () => { S.brushShape = shape; S.brushSize = s; }, `${shape} ${s}px`));
    }
  } else if (t === 'airbrush') {
    o.classList.add('cols2');
    [5, 9, 13].forEach(s => add(optBtn(sv(20, 20, `<circle cx="10" cy="10" r="${s / 2 + 1}" fill="none" stroke-dasharray="1 2"/>`), S.airSize === s, () => { S.airSize = s; }, s + 'px')));
  } else if (t === 'line' || t === 'curve') {
    o.classList.add('cols1'); widths();
  } else if (SHAPE_TOOLS.has(t)) {
    o.classList.add('cols1'); o.style.height = '84px';
    [['outline', 'Só contorno', '<rect x="6" y="2" width="28" height="10" fill="none"/>'],
     ['both', 'Contorno e preenchimento', '<rect x="6" y="2" width="28" height="10" fill="#08f"/>'],
     ['fill', 'Só preenchimento', '<rect x="6" y="2" width="28" height="10" stroke="none"/>']].forEach(([, title, g], i) =>
      add(optBtn(sv(40, 14, g), S.fillMode === i, () => { S.fillMode = i; }, title)));
    widths();
    return;
  }
  o.style.height = '68px';
}

function renderTools() {
  const box = $('#tools');
  TOOLS.forEach(([id, title,, icon]) => {
    const b = document.createElement('button');
    b.dataset.tool = id; b.title = title; b.innerHTML = icon;
    b.addEventListener('click', () => setTool(id));
    box.appendChild(b);
  });
}

function setColor(hex, secondary) {
  if (secondary) S.bg = hex; else S.fg = hex;
  $('#fgbox').style.background = S.fg; $('#bgbox').style.background = S.bg;
}

function renderPalette() {
  const pal = $('#palette');
  PALETTE.forEach((c, i) => {
    const d = document.createElement('div');
    d.style.background = c; d.dataset.i = i; d.title = c;
    d.addEventListener('pointerdown', e => { if (e.button === 0 || e.button === 2) setColor(PALETTE[i], e.button === 2); });
    d.addEventListener('dblclick', () => editColor(i));
    d.addEventListener('contextmenu', e => e.preventDefault());
    pal.appendChild(d);
  });
  $('#fgbox').addEventListener('dblclick', () => editColor(-1, false));
  $('#bgbox').addEventListener('dblclick', () => editColor(-1, true));
}

function editColor(i, secondary = false) {
  const inp = $('#colorPicker');
  inp.value = i >= 0 ? PALETTE[i] : (secondary ? S.bg : S.fg);
  inp.oninput = () => {
    if (i >= 0) { PALETTE[i] = inp.value; $('#palette').children[i].style.background = inp.value; setColor(inp.value, false); }
    else setColor(inp.value, secondary);
  };
  inp.hidden = false; inp.click(); inp.hidden = true;
}

function setZoom(z, cx, cy) {
  commitText();
  S.zoom = z;
  applyZoom();
  if (cx !== undefined) {
    area.scrollLeft = cx * z - area.clientWidth / 2;
    area.scrollTop = cy * z - area.clientHeight / 2;
  }
  if (S.tool === 'magnifier') renderOptions();
}

/* ───────────────────────── mouse ───────────────────────── */
const pos = e => {
  const r = over.getBoundingClientRect();
  return { x: Math.floor((e.clientX - r.left) / S.zoom), y: Math.floor((e.clientY - r.top) / S.zoom) };
};

over.addEventListener('contextmenu', e => e.preventDefault());

over.addEventListener('pointerdown', e => {
  if (e.button !== 0 && e.button !== 2) return;
  e.preventDefault();
  const p = pos(e), btn = e.button, t = S.tool, col = colors(btn);
  if (sel) commitSelection();
  if (textState) commitText();
  over.setPointerCapture(e.pointerId);

  switch (t) {
    case 'pencil':
      pushUndo(); mctx.fillStyle = col.fg; mctx.fillRect(p.x, p.y, 1, 1);
      drag = { t, btn, last: p }; break;
    case 'brush':
      pushUndo(); stamp(mctx, p.x, p.y, S.brushShape, S.brushSize, col.fg);
      drag = { t, btn, last: p }; break;
    case 'eraser':
      pushUndo(); eraseAt(p.x, p.y, btn);
      drag = { t, btn, last: p }; break;
    case 'airbrush': {
      pushUndo(); spray(p, col.fg);
      drag = { t, btn, last: p };
      drag.timer = setInterval(() => spray(drag.last, col.fg), 20); break;
    }
    case 'fill': pushUndo(); floodFill(p.x, p.y, col.fg); break;
    case 'picker': pickColor(p, btn); drag = { t, btn }; break;
    case 'magnifier':
      if (S.zoom === 1) setZoom(S.magnify > 1 ? S.magnify : 4, p.x, p.y); else setZoom(1);
      break;
    case 'text': drag = { t, start: p, cur: p }; break;
    case 'select': case 'rect': case 'ellipse': case 'roundrect': case 'line':
      drag = { t, btn, start: p, cur: p }; break;
    case 'lasso': drag = { t, pts: [p] }; break;
    case 'curve':
      if (!curve) { curve = { p0: p, p1: p, c1: p, c2: p, stage: 0, btn }; drag = { t, mode: 'line' }; }
      else { drag = { t, mode: curve.stage === 1 ? 'bend1' : 'bend2', moved: false }; if (curve.stage === 1) { curve.c1 = curve.c2 = p; } else curve.c2 = p; }
      break;
    case 'polygon':
      if (!poly) { poly = { pts: [p, p], btn, fixed: false }; drag = { t, mode: 'first' }; }
      else {
        const s0 = poly.pts[0];
        if (poly.pts.length >= 3 && Math.hypot(p.x - s0.x, p.y - s0.y) <= 3 / Math.min(S.zoom, 1) ) { poly.pts.pop(); finishPoly(); break; }
        poly.pts[poly.pts.length - 1] = p; poly.pts.push(p); drag = { t, mode: 'vertex' };
      }
      break;
  }
});

over.addEventListener('pointermove', e => {
  const p = pos(e);
  const inside = p.x >= 0 && p.y >= 0 && p.x < main.width && p.y < main.height;
  setStatus('#stPos', inside ? `${p.x}, ${p.y}` : '');
  if (!drag) {
    if (poly && poly.fixed) { poly.pts[poly.pts.length - 1] = p; preview({ ...baseShape('polygon', poly.btn), pts: poly.pts, closed: S.fillMode !== 0 }); }
    return;
  }
  const d = drag, t = d.t, col = colors(d.btn);
  switch (t) {
    case 'pencil':
      mctx.fillStyle = col.fg;
      bresenham(d.last.x, d.last.y, p.x, p.y, (x, y) => mctx.fillRect(x, y, 1, 1)); d.last = p; break;
    case 'brush':
      bresenham(d.last.x, d.last.y, p.x, p.y, (x, y) => stamp(mctx, x, y, S.brushShape, S.brushSize, col.fg)); d.last = p; break;
    case 'eraser':
      bresenham(d.last.x, d.last.y, p.x, p.y, (x, y) => eraseAt(x, y, d.btn)); d.last = p; break;
    case 'airbrush': d.last = p; break;
    case 'picker': pickColor(p, d.btn); break;
    case 'text': case 'select': d.cur = p;
      if (t === 'select' || t === 'text') { clearPreview(); const b = dragRect(d); dashRect(b.x, b.y, b.w, b.h); }
      break;
    case 'lasso':
      d.pts.push(p); clearPreview();
      octx.save(); octx.beginPath(); d.pts.forEach((q, i) => i ? octx.lineTo(q.x + .5, q.y + .5) : octx.moveTo(q.x + .5, q.y + .5));
      octx.strokeStyle = '#000'; octx.setLineDash([3, 3]); octx.lineWidth = 1; octx.stroke(); octx.restore(); break;
    case 'line': case 'rect': case 'ellipse': case 'roundrect':
      d.cur = constrain(t, d.start, p, e.shiftKey);
      preview({ ...baseShape(t, d.btn), p0: d.start, p1: d.cur }); break;
    case 'curve':
      if (d.mode === 'line') curve.p1 = constrain('curve', curve.p0, p, e.shiftKey), curve.c1 = curve.p0, curve.c2 = curve.p1;
      else if (d.mode === 'bend1') { curve.c1 = curve.c2 = p; d.moved = true; }
      else { curve.c2 = p; d.moved = true; }
      preview({ ...baseShape('curve', curve.btn), ...curve }); break;
    case 'polygon':
      if (d.mode === 'first') poly.pts[1] = constrain('line', poly.pts[0], p, e.shiftKey);
      else poly.pts[poly.pts.length - 1] = p;
      preview({ ...baseShape('polygon', poly.btn), pts: poly.pts, closed: S.fillMode !== 0 }); break;
  }
});

function dragRect(d) {
  const w = main.width, h = main.height;
  const x0 = clamp(Math.min(d.start.x, d.cur.x), 0, w), y0 = clamp(Math.min(d.start.y, d.cur.y), 0, h);
  const x1 = clamp(Math.max(d.start.x, d.cur.x), 0, w), y1 = clamp(Math.max(d.start.y, d.cur.y), 0, h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function dashRect(x, y, w, h) {
  octx.save(); octx.lineWidth = 1;
  octx.strokeStyle = '#fff'; octx.strokeRect(x + .5, y + .5, Math.max(w - 1, 0), Math.max(h - 1, 0));
  octx.strokeStyle = '#000'; octx.setLineDash([3, 3]); octx.strokeRect(x + .5, y + .5, Math.max(w - 1, 0), Math.max(h - 1, 0));
  octx.restore();
}

function endGesture(e) {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.timer) clearInterval(d.timer);
  const t = d.t;
  switch (t) {
    case 'picker': setTool(S.prevTool, true); break;
    case 'select': {
      clearPreview();
      const b = dragRect(d);
      if (b.w < 1 || b.h < 1) break;
      const cv = document.createElement('canvas'); cv.width = b.w; cv.height = b.h;
      cv.getContext('2d').drawImage(main, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
      if (S.transparent) makeTransparent(cv, S.bg);
      createSelection(b.x, b.y, b.w, b.h, cv); break;
    }
    case 'lasso': {
      clearPreview();
      const w = main.width, h = main.height;
      const pts = d.pts.map(q => ({ x: clamp(q.x, 0, w), y: clamp(q.y, 0, h) }));
      const x0 = Math.min(...pts.map(q => q.x)), y0 = Math.min(...pts.map(q => q.y));
      const x1 = Math.max(...pts.map(q => q.x)), y1 = Math.max(...pts.map(q => q.y));
      const bw = x1 - x0, bh = y1 - y0;
      if (pts.length < 3 || bw < 1 || bh < 1) break;
      const cv = document.createElement('canvas'); cv.width = bw; cv.height = bh;
      const c = cv.getContext('2d');
      c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(q.x - x0, q.y - y0) : c.moveTo(q.x - x0, q.y - y0)); c.closePath(); c.clip();
      c.drawImage(main, x0, y0, bw, bh, 0, 0, bw, bh);
      if (S.transparent) makeTransparent(cv, S.bg);
      createSelection(x0, y0, bw, bh, cv, { path: pts }); break;
    }
    case 'text': {
      clearPreview();
      const b = dragRect(d);
      startText({ x: b.x, y: b.y, w: b.w, h: b.h }); break;
    }
    case 'line': case 'rect': case 'ellipse': case 'roundrect':
      if (d.cur) commitShape({ ...baseShape(t, d.btn), p0: d.start, p1: d.cur }); break;
    case 'curve':
      if (d.mode === 'line') {
        if (curve.p0.x === curve.p1.x && curve.p0.y === curve.p1.y) { curve = null; clearPreview(); }
        else curve.stage = 1;
      } else if (d.mode === 'bend1') {
        if (!d.moved) { curve.c1 = curve.p0; curve.c2 = curve.p1; commitCurve(); } else curve.stage = 2;
      } else commitCurve();
      break;
    case 'polygon':
      if (d.mode === 'first') {
        if (poly.pts[0].x === poly.pts[1].x && poly.pts[0].y === poly.pts[1].y) { poly = null; clearPreview(); }
        else { poly.fixed = true; poly.pts.push(poly.pts[1]); }
      }
      break;
  }
}
function commitCurve() { const c = curve; curve = null; commitShape({ ...baseShape('curve', c.btn), ...c }); }

over.addEventListener('pointerup', endGesture);
over.addEventListener('pointercancel', endGesture);
over.addEventListener('dblclick', () => {
  if (poly && poly.fixed) { poly.pts.pop(); finishPoly(); }
});

// redimensionar a imagem arrastando a alça
let rdrag = null;
handle.addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation();
  commitSelection(); commitText();
  handle.setPointerCapture(e.pointerId);
  rdrag = { sx: e.clientX, sy: e.clientY, w: main.width, h: main.height, nw: main.width, nh: main.height };
});
handle.addEventListener('pointermove', e => {
  if (!rdrag) return;
  rdrag.nw = Math.max(1, Math.round(rdrag.w + (e.clientX - rdrag.sx) / S.zoom));
  rdrag.nh = Math.max(1, Math.round(rdrag.h + (e.clientY - rdrag.sy) / S.zoom));
  resizeOutline.hidden = false;
  resizeOutline.style.width = rdrag.nw * S.zoom + 'px'; resizeOutline.style.height = rdrag.nh * S.zoom + 'px';
  setStatus('#stSize', `${rdrag.nw} x ${rdrag.nh}px`);
});
const endRdrag = () => {
  if (!rdrag) return;
  const r = rdrag; rdrag = null; resizeOutline.hidden = true;
  if (r.nw !== main.width || r.nh !== main.height) { pushUndo(); resizeCanvas(r.nw, r.nh); }
  else setStatus('#stSize', `${main.width} x ${main.height}px`);
};
handle.addEventListener('pointerup', endRdrag);
handle.addEventListener('pointercancel', endRdrag);

/* ───────────────────────── operações de imagem / arquivo ───────────────────────── */
function clearImage() { commitSelection(); cancelText(); pushUndo(); fillAll(S.bg); }

function invertColors() {
  commitSelection(); cancelText(); pushUndo();
  const id = mctx.getImageData(0, 0, main.width, main.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
  mctx.putImageData(id, 0, 0);
}

function transform(kind) {
  commitSelection(); cancelText(); pushUndo();
  const w = main.width, h = main.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(main, 0, 0);
  if (kind === 'r90' || kind === 'r270') setSize(h, w);
  mctx.save();
  if (kind === 'fh') { mctx.translate(w, 0); mctx.scale(-1, 1); }
  else if (kind === 'fv') { mctx.translate(0, h); mctx.scale(1, -1); }
  else if (kind === 'r90') { mctx.translate(h, 0); mctx.rotate(Math.PI / 2); }
  else if (kind === 'r180') { mctx.translate(w, h); mctx.rotate(Math.PI); }
  else if (kind === 'r270') { mctx.translate(0, w); mctx.rotate(-Math.PI / 2); }
  mctx.clearRect(0, 0, w, h);
  mctx.drawImage(c, 0, 0);
  mctx.restore();
}

function saveImage() {
  commitSelection(); commitText();
  main.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = S.name.replace(/\.[a-z0-9]+$/i, '') + '.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    S.dirty = false;
  }, 'image/png');
}

function openFile() { $('#fileInput').click(); }
$('#fileInput').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (S.dirty && !(await askDialog('Descartar as alterações da imagem atual?'))) return;
  const img = new Image();
  img.onload = () => {
    cancelGestures(); dropSelection(); cancelText();
    hist.undo.length = 0; hist.redo.length = 0;
    setSize(img.naturalWidth, img.naturalHeight); fillAll('#ffffff'); mctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(img.src);
    S.name = f.name; S.dirty = false; updateTitle();
  };
  img.onerror = () => askDialog('Não foi possível abrir este arquivo de imagem.', { cancel: false });
  img.src = URL.createObjectURL(f);
});

function openAttributes() {
  commitSelection(); commitText();
  $('#attrW').value = main.width; $('#attrH').value = main.height;
  $('#dlgAttr').showModal();
}
$('#dlgAttr').addEventListener('close', () => {
  if ($('#dlgAttr').returnValue !== 'ok') return;
  const w = clamp(parseInt($('#attrW').value) || main.width, 1, 4000), h = clamp(parseInt($('#attrH').value) || main.height, 1, 4000);
  if (w !== main.width || h !== main.height) { pushUndo(); resizeCanvas(w, h); }
});

document.addEventListener('paste', e => {
  if (e.target.matches('textarea, input')) return;
  const items = [...(e.clipboardData?.items || [])];
  const imgItem = items.find(i => i.type.startsWith('image/'));
  if (imgItem) {
    e.preventDefault();
    const img = new Image();
    img.onload = () => { pasteCanvas(img); URL.revokeObjectURL(img.src); };
    img.src = URL.createObjectURL(imgItem.getAsFile());
  } else if (clipboard) { e.preventDefault(); pasteCanvas(clipboard); }
});

/* ───────────────────────── menus ───────────────────────── */
const MENUS = {
  Arquivo: () => [
    ['Novo', 'Ctrl+N', () => newImage()],
    ['Abrir...', 'Ctrl+O', openFile],
    ['Salvar', 'Ctrl+S', saveImage],
  ],
  Editar: () => [
    ['Desfazer', 'Ctrl+Z', undo],
    ['Refazer', 'Ctrl+Y', redo],
    '-',
    ['Recortar', 'Ctrl+X', () => { if (copySelection()) deleteSelection(); }],
    ['Copiar', 'Ctrl+C', copySelection],
    ['Colar', 'Ctrl+V', () => { if (clipboard) pasteCanvas(clipboard); else if (navigator.clipboard?.read) pasteFromSystem(); }],
    ['Limpar seleção', 'Del', deleteSelection],
    ['Selecionar tudo', 'Ctrl+A', selectAll],
  ],
  Exibir: () => [
    ['Zoom normal', '', () => setZoom(1)],
    ['Zoom 200%', '', () => setZoom(2)],
    ['Zoom 400%', '', () => setZoom(4)],
    ['Zoom 800%', '', () => setZoom(8)],
    '-',
    [(S.grid ? '✓ ' : '') + 'Mostrar grade', 'Ctrl+G', () => { S.grid = !S.grid; applyZoom(); }],
  ],
  Imagem: () => [
    ['Inverter horizontalmente', '', () => transform('fh')],
    ['Inverter verticalmente', '', () => transform('fv')],
    ['Girar 90° à direita', '', () => transform('r90')],
    ['Girar 180°', '', () => transform('r180')],
    ['Girar 90° à esquerda', '', () => transform('r270')],
    '-',
    ['Inverter cores', 'Ctrl+I', invertColors],
    ['Atributos...', 'Ctrl+E', openAttributes],
    ['Limpar imagem', 'Ctrl+Shift+N', clearImage],
  ],
  Cores: () => [['Editar cores...', '', () => editColor(-1, false)]],
  Ajuda: () => [['Sobre o Pintar Nabote', '', () => $('#dlgAbout').showModal()]],
};

async function pasteFromSystem() {
  try {
    for (const it of await navigator.clipboard.read()) {
      const type = it.types.find(t => t.startsWith('image/'));
      if (!type) continue;
      const img = new Image();
      img.onload = () => pasteCanvas(img);
      img.src = URL.createObjectURL(await it.getType(type));
      return;
    }
  } catch { /* sem permissão: use Ctrl+V */ }
}

function renderMenus() {
  const bar = $('#menubar');
  for (const name of Object.keys(MENUS)) {
    const m = document.createElement('div'); m.className = 'menu';
    const b = document.createElement('button'); b.textContent = name; m.appendChild(b);
    const ul = document.createElement('ul'); m.appendChild(ul);
    const fill = () => {
      ul.replaceChildren();
      for (const it of MENUS[name]()) {
        const li = document.createElement('li');
        if (it === '-') { li.className = 'sep'; ul.appendChild(li); continue; }
        li.innerHTML = `<span></span><span class="acc"></span>`;
        li.firstChild.textContent = it[0]; li.lastChild.textContent = it[1];
        li.addEventListener('click', () => { closeMenus(); it[2](); });
        ul.appendChild(li);
      }
    };
    const open = () => { closeMenus(); fill(); m.classList.add('open'); };
    b.addEventListener('click', e => { e.stopPropagation(); m.classList.contains('open') ? closeMenus() : open(); });
    b.addEventListener('mouseenter', () => { if (bar.querySelector('.open') && !m.classList.contains('open')) open(); });
    bar.appendChild(m);
  }
}
const closeMenus = () => document.querySelectorAll('.menu.open').forEach(m => m.classList.remove('open'));
document.addEventListener('click', closeMenus);

/* ───────────────────────── teclado ───────────────────────── */
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) {
    if (e.target.matches('textarea.textbox') && e.key === 'Escape') cancelText();
    return;
  }
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (ctrl) {
    const map = {
      z: undo, y: redo, n: e.shiftKey ? clearImage : () => newImage(), o: openFile, s: saveImage,
      a: selectAll, c: copySelection, x: () => { if (copySelection()) deleteSelection(); },
      i: invertColors, e: openAttributes, g: () => { S.grid = !S.grid; applyZoom(); },
    };
    if (k === 'v') return; // tratado pelo evento "paste"
    if (map[k]) { e.preventDefault(); map[k](); }
    return;
  }
  if (k === 'delete' || k === 'backspace') { if (sel) { e.preventDefault(); deleteSelection(); } }
  else if (k === 'escape') { cancelGestures(); dropSelection(); cancelText(); }
  else if (k === 'enter' && poly && poly.fixed) { poly.pts.pop(); finishPoly(); }
});

window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ───────────────────────── barra de texto ───────────────────────── */
(() => {
  const sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];
  const fs = $('#fontSize');
  sizes.forEach(s => { const o = document.createElement('option'); o.value = o.textContent = s; fs.appendChild(o); });
  fs.value = S.font.size;
  $('#fontFamily').addEventListener('change', e => { S.font.family = e.target.value; styleText(); });
  fs.addEventListener('change', e => { S.font.size = +e.target.value; styleText(); });
  for (const [id, key] of [['#fontBold', 'bold'], ['#fontItalic', 'italic'], ['#fontUnderline', 'underline']]) {
    $(id).addEventListener('click', e => { S.font[key] = !S.font[key]; e.currentTarget.classList.toggle('on', S.font[key]); styleText(); });
  }
})();

/* ───────────────────────── início ───────────────────────── */
renderTools();
renderMenus();
renderPalette();
setSize(800, 500);
fillAll('#ffffff');
setColor(S.fg, false); setColor(S.bg, true);
setTool('pencil');
updateTitle();

// gancho para testes automatizados
window.__paint = { S, main, get sel() { return sel; }, hist };
})();
