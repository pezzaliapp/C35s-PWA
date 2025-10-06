/* app.js — v4.2
 * CASCOS PWA: ricerca+autofill + verifiche + viewer 3D robusto (HiDPI)
 * Note: se usi un service worker, ricorda di bumpare la cache in sw.js.
 */

"use strict";

// ---------------------- MODEL ----------------------
const MODEL = {
  capacityKg: 3500,
  liftHmin: 100,
  liftHmax: 1970,
  underBeam: 4248,
  interasse: 2700,
  widthTotal: 3350,
  baseDepth: 620,
  armReachMin: 690,
  armReachMax: 1325
};

// ---------------------- DATASET CASCOS ----------------------
let LIFTS = [];

async function loadLifts() {
  try {
    const res = await fetch("./data/CASCOS_LIFTS.json", { cache: "reload" });
    LIFTS = await res.json();
    populateLiftSelect(LIFTS);
  } catch (e) {
    console.warn("Errore caricamento dataset", e);
  }
}

function populateLiftSelect(list) {
  const sel = document.getElementById("liftSelect");
  if (!sel) return;
  sel.innerHTML = "";
  (list || []).forEach((r, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${r.modello} — ${r.codice} — ${r.categoria}`;
    sel.appendChild(opt);
  });
}

function filterLifts(q) {
  q = (q || "").toLowerCase().trim();
  if (!q) return LIFTS;
  return LIFTS.filter(
    (r) =>
      (r.modello || "").toLowerCase().includes(q) ||
      (r.codice || "").toLowerCase().includes(q) ||
      (r.categoria || "").toLowerCase().includes(q) ||
      (r.versione || "").toLowerCase().includes(q)
  );
}

function showLiftInfo(idx) {
  const search = document.getElementById("liftSearch");
  const list = filterLifts(search ? search.value : "");
  const r = list[idx] || LIFTS[idx];
  if (!r) return;
  const box = document.getElementById("liftInfo");
  if (!box) return;
  box.textContent = [
    `Modello: ${r.modello}  (codice: ${r.codice})`,
    `Categoria: ${r.categoria} — Basamento: ${r.basamento}`,
    `Portata: ${r.portata_kg || "—"} kg`,
    `Versione: ${r.versione || "—"}`,
    `Note: ${r.note_tecniche || "—"}`,
    `Fonte: ${r.pdf_source || "—"}`
  ].join("\n");
}

function applyLiftToChecks(idx) {
  const search = document.getElementById("liftSearch");
  const list = filterLifts(search ? search.value : "");
  const r = list[idx] || LIFTS[idx];
  if (!r) return;

  if (r.portata_kg) {
    MODEL.capacityKg = Number(r.portata_kg);
    const cap = document.getElementById("cap");
    if (cap) cap.textContent = MODEL.capacityKg;
  }

  const variant = document.getElementById("variant");
  if (r.basamento && variant) {
    const b = r.basamento.toLowerCase();
    if (b.includes("senza")) variant.value = "Senza basamento";
    else if (b.includes("con")) variant.value = "Con basamento (trave/platea)";
  }

  const clear = document.getElementById("clearance");
  if (r.altezza_min_mm && clear) clear.value = Math.max(+r.altezza_min_mm, 100);

  const des = document.getElementById("desiredLift");
  if (r.altezza_max_mm && des)
    des.value = Math.min(+r.altezza_max_mm, MODEL.liftHmax);

  const info = document.getElementById("liftInfo");
  if (info)
    info.textContent = `Applicato modello: ${r.modello} (${r.codice}) — portata impostata: ${MODEL.capacityKg} kg`;
}

// ---------------------- VERIFICHE ----------------------
function runChecks() {
  const mass = +document.getElementById("mass").value;
  const clearance = +document.getElementById("clearance").value;
  const vehH = +document.getElementById("vehHeight").value;
  const desiredLift = +document.getElementById("desiredLift").value;
  const slab = +document.getElementById("slab").value;
  const variant = document.getElementById("variant").value;

  const out = [];
  out.push(
    mass <= MODEL.capacityKg
      ? `✅ Portata OK (${mass} ≤ ${MODEL.capacityKg} kg)`
      : `❌ Portata superata (${mass} > ${MODEL.capacityKg} kg)`
  );
  out.push(
    clearance >= MODEL.liftHmin
      ? `✅ Altezza min punti di presa OK (≥ ${MODEL.liftHmin} mm)`
      : `⚠️ Altezza min bassa: usa prolunghe/tamponi.`
  );

  const need = vehH + desiredLift + 50;
  out.push(`↳ Ingombro sollevato: ${vehH} + ${desiredLift} + 50 = ${need} mm`);
  out.push(
    need <= MODEL.underBeam
      ? "✅ Clearance sotto traversa OK"
      : "❌ Clearance sotto traversa insufficiente"
  );

  const slabMin = variant.includes("Senza") ? 180 : 160;
  out.push(
    slab >= slabMin
      ? `✅ Pavimento OK per "${variant}" (≥ ${slabMin} mm)`
      : `⚠️ Pavimento sottile (${slab} mm): valuta plinti/platea.`
  );

  document.getElementById("out").textContent = out.join("\n");
}

// ---------------------- VIEWER 3D ----------------------
let C, X, viewSel, hLift, armLen, armRot;

// Setup DPR: coord in px CSS
function setupCanvas() {
  if (!C || !X) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = C.clientWidth || 720;
  const cssH = C.clientHeight || 360;
  const needW = Math.round(cssW * dpr);
  const needH = Math.round(cssH * dpr);
  if (C.width !== needW || C.height !== needH) {
    C.width = needW;
    C.height = needH;
    X.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
}

// Proiezione centrata dinamica
function proj(p, mode = "iso") {
  const w = C ? C.clientWidth : 720;
  const h = C ? C.clientHeight : 360;
  const cx = w / 2;
  const cy = h / 2;
  const s = Math.min(w, h) / 700; // zoom “comodo”
  if (mode === "top") return { x: p.x * s + cx, y: p.z * s + cy * 0.65 };
  if (mode === "front") return { x: p.x * s + cx, y: p.y * s + cy };
  const ang = Math.PI / 6; // 30°
  const x = (p.x - p.z) * Math.cos(ang);
  const y = p.y + (p.x + p.z) * Math.sin(ang);
  return { x: x * s + cx, y: y * s + cy };
}

function facePath(P, idx) {
  X.beginPath();
  idx.forEach((i, k) => (k ? X.lineTo(P[i].x, P[i].y) : X.moveTo(P[i].x, P[i].y)));
  X.closePath();
}

function box(x, y, z, w, h, d, color, mode) {
  const pts = [
    { x: x, y: y, z: z },
    { x: x + w, y: y, z: z },
    { x: x + w, y: y + h, z: z },
    { x: x, y: y + h, z: z },
    { x: x, y: y, z: z + d },
    { x: x + w, y: y, z: z + d },
    { x: x + w, y: y + h, z: z + d },
    { x: x, y: y + h, z: z + d }
  ].map((p) => proj(p, mode));

  [["#0e1533", [3, 2, 6, 7]], ["#0d1430", [1, 2, 6, 5]], [color, [0, 1, 2, 3]]].forEach(
    ([c, idx]) => {
      X.fillStyle = c;
      X.strokeStyle = "#0b1022";
      X.lineWidth = 1;
      facePath(pts, idx);
      X.fill();
      X.stroke();
    }
  );
}

function line3d(x1, y1, z1, x2, y2, z2, c, w, mode) {
  const p1 = proj({ x: x1, y: y1, z: z1 }, mode);
  const p2 = proj({ x: x2, y: y2, z: z2 }, mode);
  X.strokeStyle = c;
  X.lineWidth = w;
  X.beginPath();
  X.moveTo(p1.x, p1.y);
  X.lineTo(p2.x, p2.y);
  X.stroke();
}

function dot3d(x, y, z, r, c, mode) {
  const p = proj({ x, y, z }, mode);
  X.fillStyle = c;
  X.beginPath();
  X.arc(p.x, p.y, r, 0, Math.PI * 2);
  X.fill();
}

function render3D() {
  if (!C || !X || !viewSel) return;

  setupCanvas();

  const mode = viewSel.value || "iso";
  const H = hLift ? +hLift.value : 600;
  const L = armLen ? +armLen.value : 900;
  const A = ((armRot ? +armRot.value : 20) * Math.PI) / 180;

  // pulizia in px CSS grazie a setTransform
  X.clearRect(0, 0, C.clientWidth || 720, C.clientHeight || 360);

  // dimensioni principali (mm)
  const inter = MODEL.interasse;
  const colW = (MODEL.widthTotal - inter) / 2;
  const baseD = MODEL.baseDepth;
  const colH = 4250;
  const y0 = 0;
  const z = 0;
  const leftX = -inter / 2 - colW;
  const rightX = inter / 2;

  // Pavimento
  box(-3500, y0, -2000, 7000, 20, 4000, "#0f1733", mode);

  // Colonne
  box(leftX, y0, z, colW, colH, baseD, "#3b82f6", mode);
  box(rightX, y0, z, colW, colH, baseD, "#3b82f6", mode);

  // Trave superiore
  box(leftX + colW, colH - 120, z, inter, 120, baseD, "#2563eb", mode);

  // Bracci
  const pivotY = y0 + 200 + H;
  const pivotZ = z + baseD / 2;
  const leftPivotX = leftX + colW;
  const rightPivotX = rightX;

  function drawArm(pivotX, sign) {
    const x1 = pivotX,
      y1 = pivotY,
      z1 = pivotZ;
    const x2 = x1 + Math.cos(A * sign) * L;
    const z2 = z1 + Math.sin(A * sign) * L;
    line3d(x1, y1, z1, x2, y1, z2, "#a78bfa", 5, mode);
    dot3d(x2, y1, z2, 5, "#22c55e", mode);
  }
  drawArm(leftPivotX, +1);
  drawArm(leftPivotX, -1);
  drawArm(rightPivotX, +1);
  drawArm(rightPivotX, -1);
}

// ---------------------- BIND & INIT ----------------------
function initUIBindings() {
  // Verifiche
  const runBtn = document.getElementById("runChecks");
  if (runBtn) runBtn.addEventListener("click", runChecks);

  // Ricerca/Autofill
  const liftSearch = document.getElementById("liftSearch");
  const liftSelect = document.getElementById("liftSelect");
  if (liftSearch && liftSelect) {
    liftSearch.addEventListener("input", () =>
      populateLiftSelect(filterLifts(liftSearch.value))
    );
    liftSelect.addEventListener("change", () =>
      showLiftInfo(liftSelect.selectedIndex)
    );
    const showBtn = document.getElementById("showLift");
    if (showBtn)
      showBtn.addEventListener("click", () =>
        showLiftInfo(liftSelect.selectedIndex)
      );
    const applyBtn = document.getElementById("applyLift");
    if (applyBtn)
      applyBtn.addEventListener("click", () =>
        applyLiftToChecks(liftSelect.selectedIndex)
      );
    loadLifts();
  }

  // Viewer 3D controls
  C = document.getElementById("iso3d");
  if (!C) return;
  // se il canvas non ha dimensioni, assegna fallback
  if (!C.hasAttribute("width")) C.setAttribute("width", "720");
  if (!C.hasAttribute("height")) C.setAttribute("height", "360");

  X = C.getContext("2d");
  viewSel = document.getElementById("viewMode");
  hLift = document.getElementById("hLift");
  armLen = document.getElementById("armLen");
  armRot = document.getElementById("armRot");

  ["input", "change"].forEach((ev) => {
    if (hLift) hLift.addEventListener(ev, render3D);
    if (armLen) armLen.addEventListener(ev, render3D);
    if (armRot) armRot.addEventListener(ev, render3D);
    if (viewSel) viewSel.addEventListener(ev, render3D);
  });

  window.addEventListener("resize", render3D);

  // primo render quando tutto è pronto
  requestAnimationFrame(render3D);
}

// avvia quando il DOM è pronto
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initUIBindings);
} else {
  initUIBindings();
}

// ---------------------- PWA ----------------------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
