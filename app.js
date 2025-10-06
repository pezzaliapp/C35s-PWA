/* app.js — v4.3
 * CASCOS PWA: ricerca+autofill + verifiche + viewer 3D robusto (HiDPI, fit-to-view, ombre/riflessi)
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
let C, X;

// HiDPI safe: coord in px CSS
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

// Helper: path faccia
function facePath(P, idx) {
  X.beginPath();
  idx.forEach((i, k) => (k ? X.lineTo(P[i].x, P[i].y) : X.moveTo(P[i].x, P[i].y)));
  X.closePath();
}

// Disegna un parallelepipedo stilizzato (usa proiezione locale P() dentro render)
function boxP(P, x, y, z, w, h, d, color) {
  const pts = [
    { x: x, y: y, z: z },
    { x: x + w, y: y, z: z },
    { x: x + w, y: y + h, z: z },
    { x: x, y: y + h, z: z },
    { x: x, y: y, z: z + d },
    { x: x + w, y: y, z: z + d },
    { x: x + w, y: y + h, z: z + d },
    { x: x, y: y + h, z: z + d }
  ].map(P);

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

function render3D() {
  if (!C || !X) return;
  setupCanvas();

  // Leggi controlli direttamente (no globali)
  const mode = (document.getElementById("viewMode")?.value) || "iso";
  const H    = +(document.getElementById("hLift")?.value ?? 600);
  const L    = +(document.getElementById("armLen")?.value ?? 900);
  const A    = (((document.getElementById("armRot")?.value) ?? 20) * Math.PI) / 180;

  // Misure principali (mm)
  const inter = MODEL.interasse;
  const colW  = (MODEL.widthTotal - inter) / 2;
  const baseD = MODEL.baseDepth;
  const colH  = 4250;

  // Fit-to-view: calcolo scala/centro per il canvas attuale
  const w = C.clientWidth || 380;
  const h = C.clientHeight || 360;
  const Wspan = (MODEL.widthTotal || 3350) * 1.35;
  const Hspan = colH * 1.25;
  const s  = Math.min(w / Wspan, h / Hspan);
  const cx = w / 2;
  const cy = h * 0.82; // più basso per dare “peso” a terra

  // Proiezione locale (top/front/iso, centrata e scalata)
  function Praw(x, y, z) {
    if (mode === "top")   return { X: x, Y: z };
    if (mode === "front") return { X: x, Y: -y };
    const ang = Math.PI / 6;
    const xi = (x - z) * Math.cos(ang);
    const yi = -y + (x + z) * Math.sin(ang);
    return { X: xi, Y: yi };
  }
  function P(pt) {
    const t = Praw(pt.x, pt.y, pt.z);
    return { x: cx + t.X * s, y: cy + t.Y * s };
  }

  // Pulizia
  X.clearRect(0, 0, w, h);

  // Pavimento + ombra ambiente
  const floorGrad = X.createLinearGradient(0, h * 0.55, 0, h);
  floorGrad.addColorStop(0, "#0c1735");
  floorGrad.addColorStop(1, "#060a18");
  X.fillStyle = floorGrad;
  X.fillRect(0, h * 0.55, w, h * 0.45);

  // Colonne con riflesso
  const halfInter = inter / 2;
  const colBases = [
    { x: -halfInter - colW, color: "#3b82f6" },
    { x:  halfInter,        color: "#3b82f6" }
  ];
  colBases.forEach(c => {
    const front = [ P({x:c.x,y:0,z:0}), P({x:c.x+colW,y:0,z:0}), P({x:c.x+colW,y:colH,z:0}), P({x:c.x,y:colH,z:0}) ];
    const grad = X.createLinearGradient(front[0].x, front[0].y, front[1].x, front[1].y);
    grad.addColorStop(0.00,"#1d4ed8");
    grad.addColorStop(0.45,c.color);
    grad.addColorStop(1.00,"#60a5fa");
    // rettangolo frontale
    X.fillStyle = grad;
    X.strokeStyle = "#0b1022";
    X.lineWidth = 1;
    X.beginPath(); front.forEach((pt,i)=> i?X.lineTo(pt.x,pt.y):X.moveTo(pt.x,pt.y)); X.closePath(); X.fill(); X.stroke();
    // riflesso centrale
    X.save();
    X.globalAlpha = 0.2;
    const midX = (front[0].x + front[1].x) / 2;
    X.fillStyle = "#ffffff";
    X.fillRect(midX - 2, front[0].y + 12, 4, (front[2].y - front[1].y) - 24);
    X.restore();
  });

  // Trave superiore (portale)
  const tr = [
    P({x:-halfInter,      y:colH-120, z:0}),
    P({x: halfInter+colW, y:colH-120, z:0}),
    P({x: halfInter+colW, y:colH,     z:0}),
    P({x:-halfInter,      y:colH,     z:0})
  ];
  X.fillStyle = "#2563eb";
  X.strokeStyle = "#0b1022";
  X.beginPath(); tr.forEach((pt,i)=> i?X.lineTo(pt.x,pt.y):X.moveTo(pt.x,pt.y)); X.closePath(); X.fill(); X.stroke();

  // Basamenti (vista top/front/iso con box semplificati)
  boxP(P, -halfInter - colW, 0, 0, colW, 20, baseD, "#0f1733");
  boxP(P,  halfInter,        0, 0, colW, 20, baseD, "#0f1733");

  // Bracci + ombre al suolo
  const pivotY = 200 + H;
  const pivotZ = baseD / 2;

  function drawArm(pivotX, sign){
    const x1 = pivotX, y1 = pivotY, z1 = pivotZ;
    const x2 = x1 + Math.cos(A * sign) * L;
    const z2 = z1 + Math.sin(A * sign) * L;
    const a = P({x:x1,y:y1,z:z1}), b = P({x:x2,y:y1,z:z2});

    // braccio
    X.strokeStyle = "#a78bfa";
    X.lineWidth = 4;
    X.beginPath(); X.moveTo(a.x,a.y); X.lineTo(b.x,b.y); X.stroke();

    // tampone
    X.fillStyle = "#22c55e";
    X.beginPath(); X.arc(b.x,b.y,5,0,Math.PI*2); X.fill();

    // ombra ellittica “al suolo”
    const g = P({x:x2, y:0, z:z2});
    X.save();
    X.globalAlpha = 0.22;
    X.fillStyle = "#000";
    X.beginPath();
    X.ellipse(g.x, g.y, 12, 4, 0, 0, Math.PI*2);
    X.fill();
    X.restore();
  }
  drawArm(-halfInter, +1);
  drawArm(-halfInter, -1);
  drawArm( halfInter + colW, +1);
  drawArm( halfInter + colW, -1);
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

  // Viewer 3D
  C = document.getElementById("iso3d");
  if (!C) return;
  if (!C.hasAttribute("width"))  C.setAttribute("width", "720");
  if (!C.hasAttribute("height")) C.setAttribute("height", "360");
  X = C.getContext("2d");

  // Input -> render
  ["hLift","armLen","armRot","viewMode"].forEach(id=>{
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", render3D);
      el.addEventListener("change", render3D);
    }
  });

  window.addEventListener("resize", render3D);
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
