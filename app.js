/* app.js — v5.8 stable (CASCOS)
 * - Carica ./data/CASCOS_LIFTS.json (schema con *_mm come da tuo file)
 * - Ricerca + autocompilazione verifiche
 * - Viewer 3D (fit-to-view, HiDPI, bracci specchiati verso interno)
 * - Diagnostica a schermo se qualcosa non va
 */
"use strict";

/* ===================== Diagnostica a schermo ===================== */
function logInfo(msg){ const box=document.getElementById("liftInfo"); if(box){ box.textContent=(box.textContent?box.textContent+"\n":"")+`ℹ️ ${msg}`; } console.log(msg); }
function logErr(msg){  const box=document.getElementById("liftInfo"); if(box){ box.textContent=(box.textContent?box.textContent+"\n":"")+`⛔ ${msg}`; } console.error(msg); }
window.addEventListener("error", e => logErr(`JS: ${e.message}`));

/* ===================== MODEL (default) ===================== */
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

/* ===================== DATASET ===================== */
let LIFTS = [];
const DATA_URL = "./data/CASCOS_LIFTS.json"; // nome esatto richiesto

async function loadLifts() {
  try {
    const res = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text.trim().startsWith("<")) throw new Error("File non-JSON (forse 404 HTML)");
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("Root JSON non è un array");
    LIFTS = data;
    populateLiftSelect(LIFTS);
    logInfo(`✅ Dataset caricato: ${DATA_URL}`);
  } catch (e) {
    logErr(`Impossibile caricare ${DATA_URL}: ${e.message}`);
    // fallback minimale per non bloccare la UI
    LIFTS = [{
      modello:"C3.5", codice:"FALLBACK", categoria:"Con basamento",
      portata_kg:3500, interasse_mm:2700, larghezza_totale_mm:3350,
      altezza_sotto_traversa_mm:4248, base_profondita_mm:620,
      arm_min_mm:690, arm_max_mm:1325, basamento:"con"
    }];
    populateLiftSelect(LIFTS);
  }
}

function populateLiftSelect(list) {
  const sel = document.getElementById("liftSelect");
  if (!sel) return;
  sel.innerHTML = "";
  (list || []).forEach((r, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${r.modello ?? "—"} — ${r.codice ?? "—"} — ${r.categoria ?? "—"}`;
    sel.appendChild(opt);
  });
}

function filterLifts(q) {
  q = (q || "").toLowerCase().trim();
  if (!q) return LIFTS;
  return LIFTS.filter((r) =>
    (r.modello || "").toLowerCase().includes(q) ||
    (r.codice || "").toLowerCase().includes(q)  ||
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
    `Modello: ${r.modello ?? "—"} (codice: ${r.codice ?? "—"})`,
    `Categoria: ${r.categoria ?? "—"} — Basamento: ${r.basamento ?? "—"}`,
    `Portata: ${r.portata_kg ?? "—"} kg`,
    `Interasse: ${r.interasse_mm ?? "—"} mm — Larghezza totale: ${r.larghezza_totale_mm ?? "—"} mm`,
    `H sotto traversa: ${r.altezza_sotto_traversa_mm ?? "—"} mm — Base: ${r.base_profondita_mm ?? "—"} mm`,
    `Bracci: ${r.arm_min_mm ?? "—"}–${r.arm_max_mm ?? "—"} mm`,
    `Versione: ${r.versione ?? "—"}`,
    `Note: ${r.note_tecniche ?? "—"}`,
    `Fonte: ${r.pdf_source ?? "—"}`
  ].join("\n");
}

/* ===================== Helpers ===================== */
const num = (v, fb) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fb;
};

function setArmSlider(min, max, keep=true){
  const s = document.getElementById("armLen");
  if(!s) return;
  const prev = num(s.value, min);
  s.min = String(min);
  s.max = String(max);
  s.value = String(keep ? Math.min(Math.max(prev, min), max) : min);
  s.title = `Estensione bracci: ${s.value} mm (min ${min} – max ${max})`;
}

/* ===================== Applica modello ai controlli + viewer ===================== */
function applyLiftToChecks(idx) {
  const search = document.getElementById("liftSearch");
  const list = filterLifts(search ? search.value : "");
  const r = list[idx] || LIFTS[idx];
  if (!r) return;

  // Portata: prendi SOLO dal JSON (niente inferenze automatiche)
  MODEL.capacityKg = num(r.portata_kg, MODEL.capacityKg);
  const cap = document.getElementById("cap"); if (cap) cap.textContent = MODEL.capacityKg;

  // Geometrie: usa i campi *_mm che hai definito nel JSON
  MODEL.interasse  = num(r.interasse_mm, MODEL.interasse);
  MODEL.widthTotal = num(r.larghezza_totale_mm, MODEL.widthTotal);
  MODEL.baseDepth  = num(r.base_profondita_mm, MODEL.baseDepth);
  MODEL.underBeam  = num(r.altezza_sotto_traversa_mm, MODEL.underBeam);

  // Variante installazione
  const variant = document.getElementById("variant");
  if (variant) {
    const b = String(r.basamento || "").toLowerCase();
    variant.value = b.includes("senza") ? "Senza basamento" : "Con basamento (trave/platea)";
  }

  // Limiti altezze (se non presenti in JSON, lascio i default)
  const clear = document.getElementById("clearance");
  if (clear) clear.value = num(r.altezza_min_mm, MODEL.liftHmin);
  const des = document.getElementById("desiredLift");
  if (des) des.value = Math.min(num(r.altezza_max_mm, MODEL.liftHmax), MODEL.liftHmax);

  // Range bracci dinamico
  MODEL.armReachMin = num(r.arm_min_mm, MODEL.armReachMin);
  MODEL.armReachMax = num(r.arm_max_mm, MODEL.armReachMax);
  setArmSlider(MODEL.armReachMin, MODEL.armReachMax, true);

  // Info
  const info = document.getElementById("liftInfo");
  if (info) info.textContent = `Applicato: ${r.modello ?? "—"} — Portata: ${MODEL.capacityKg} kg — Bracci ${MODEL.armReachMin}–${MODEL.armReachMax} mm`;

  render3D();
  runChecks();
}

/* ===================== Verifiche ===================== */
function runChecks() {
  const mass = +document.getElementById("mass").value;
  const clearance = +document.getElementById("clearance").value;
  const vehH = +document.getElementById("vehHeight").value;
  const desiredLift = +document.getElementById("desiredLift").value;
  const slab = +document.getElementById("slab").value;
  const variant = document.getElementById("variant").value;

  const out = [];
  out.push(mass <= MODEL.capacityKg
    ? `✅ Portata OK (${mass} ≤ ${MODEL.capacityKg} kg)`
    : `❌ Portata superata (${mass} > ${MODEL.capacityKg} kg)`);
  out.push(clearance >= MODEL.liftHmin
    ? `✅ Altezza min punti di presa OK (≥ ${MODEL.liftHmin} mm)`
    : `⚠️ Altezza min bassa: usa prolunghe/tamponi.`);

  const need = vehH + desiredLift + 50;
  out.push(`↳ Ingombro sollevato: ${vehH} + ${desiredLift} + 50 = ${need} mm`);
  out.push(need <= MODEL.underBeam ? "✅ Clearance sotto traversa OK" : "❌ Clearance sotto traversa insufficiente");

  const slabMin = variant.includes("Senza") ? 180 : 160;
  out.push(slab >= slabMin
    ? `✅ Pavimento OK per "${variant}" (≥ ${slabMin} mm)`
    : `⚠️ Pavimento sottile (${slab} mm): valuta plinti/platea.`);

  const box = document.getElementById("out");
  if (box) box.textContent = out.join("\n");
}

/* ===================== Viewer 3D ===================== */
let C, X;

function setupCanvas() {
  if (!C || !X) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = C.getBoundingClientRect();
  const cssW = Math.max(320, Math.floor(rect.width || C.clientWidth || 720));
  const cssH = Math.max(220, Math.floor(rect.height || C.clientHeight || 360));
  const needW = Math.round(cssW * dpr);
  const needH = Math.round(cssH * dpr);
  if (C.width !== needW || C.height !== needH) {
    C.width = needW; C.height = needH;
    X.setTransform(dpr, 0, 0, dpr, 0, 0); // coord in px CSS
  }
}

function render3D() {
  if (!C || !X) return;
  setupCanvas();

  const mode = (document.getElementById("viewMode")?.value) || "iso";
  const H = +(document.getElementById("hLift")?.value ?? 600);

  const sArm = document.getElementById("armLen");
  const Lraw = +(sArm?.value ?? MODEL.armReachMin);
  const L = Math.min(Math.max(Lraw, +(sArm?.min ?? MODEL.armReachMin)), +(sArm?.max ?? MODEL.armReachMax));

  const Adeg = +(document.getElementById("armRot")?.value ?? 20);
  const A = (Adeg * Math.PI) / 180;

  const inter = MODEL.interasse;
  const colW = (MODEL.widthTotal - inter) / 2;
  const baseD = MODEL.baseDepth;
  const colH = 4250;

  const w = C.clientWidth || 720;
  const h = C.clientHeight || 360;
  const Wspan = (MODEL.widthTotal || 3350) * 1.28;
  const Hspan = colH * 1.18;
  const s = Math.min(w / Wspan, h / Hspan);
  const cx = w / 2;
  const cy = h * 0.82;

  function Praw(x, y, z) {
    if (mode === "top")   return { X: x, Y: z };
    if (mode === "front") return { X: x, Y: -y };
    const ang = Math.PI / 6;
    const xi = (x - z) * Math.cos(ang);
    const yi = -y + (x + z) * Math.sin(ang);
    return { X: xi, Y: yi };
  }
  function P(pt) { const t = Praw(pt.x, pt.y, pt.z); return { x: cx + t.X * s, y: cy + t.Y * s }; }

  X.clearRect(0, 0, w, h);

  // Pavimento
  const floorGrad = X.createLinearGradient(0, h * 0.55, 0, h);
  floorGrad.addColorStop(0, "#0c1735"); floorGrad.addColorStop(1, "#060a18");
  X.fillStyle = floorGrad; X.fillRect(0, h * 0.55, w, h * 0.45);

  // Colonne + riflesso
  const halfInter = inter / 2;
  const cols = [
    { x: -halfInter - colW, color: "#3b82f6" },
    { x: +halfInter,        color: "#3b82f6" }
  ];
  cols.forEach(c => {
    const f = [P({x:c.x,y:0,z:0}), P({x:c.x+colW,y:0,z:0}), P({x:c.x+colW,y:colH,z:0}), P({x:c.x,y:colH,z:0})];
    const g = X.createLinearGradient(f[0].x, f[0].y, f[1].x, f[1].y);
    g.addColorStop(0,"#1d4ed8"); g.addColorStop(0.45,c.color); g.addColorStop(1,"#60a5fa");
    X.fillStyle=g; X.strokeStyle="#0b1022";
    X.beginPath(); f.forEach((p,i)=> i?X.lineTo(p.x,p.y):X.moveTo(p.x,p.y)); X.closePath(); X.fill(); X.stroke();
    // riflesso centrale
    X.save(); X.globalAlpha=0.2; const mid=(f[0].x+f[1].x)/2; X.fillStyle="#fff";
    X.fillRect(mid-2, f[0].y+12, 4, (f[2].y-f[1].y)-24); X.restore();
  });

  // Trave
  const tr = [
    P({x:-halfInter,      y:colH-120, z:0}),
    P({x: halfInter+colW, y:colH-120, z:0}),
    P({x: halfInter+colW, y:colH,     z:0}),
    P({x:-halfInter,      y:colH,     z:0})
  ];
  X.fillStyle="#2563eb"; X.strokeStyle="#0b1022";
  X.beginPath(); tr.forEach((p,i)=> i?X.lineTo(p.x,p.y):X.moveTo(p.x,p.y)); X.closePath(); X.fill(); X.stroke();

  // Basamenti (front)
  const drawBase=(x,y,z,w_,h_,d_,col_)=>{
    const pts=[{x,y,z},{x:x+w_,y,z},{x:x+w_,y:y+h_,z},{x,y:y+h_,z}].map(P);
    X.fillStyle=col_; X.strokeStyle="#0b1022";
    X.beginPath(); pts.forEach((p,i)=> i?X.lineTo(p.x,p.y):X.moveTo(p.x,p.y)); X.closePath(); X.fill(); X.stroke();
  };
  drawBase(-halfInter - colW, 0, 0, colW, 20, baseD, "#0f1733");
  drawBase( halfInter,        0, 0, colW, 20, baseD, "#0f1733");

  // Bracci (pivot interni, specchiati verso interno)
  const pivotY = 200 + H, pivotZ = baseD/2;
  function drawArm(pivotX, sign, isRight){
    const baseAngle = isRight ? Math.PI : 0; // destra punta verso sinistra
    const angle = baseAngle + sign * A;
    const x1=pivotX, y1=pivotY, z1=pivotZ;
    const x2=x1 + Math.cos(angle)*L;
    const z2=z1 + Math.sin(angle)*L;
    const a=P({x:x1,y:y1,z:z1}), b=P({x:x2,y:y1,z:z2});
    X.strokeStyle="#a78bfa"; X.lineWidth=5;
    X.beginPath(); X.moveTo(a.x,a.y); X.lineTo(b.x,b.y); X.stroke();
    // tampone sempre lato interno
    X.fillStyle="#22c55e"; X.beginPath(); X.arc(b.x,b.y,6,0,Math.PI*2); X.fill();
    // ombra
    const g=P({x:x2,y:0,z:z2});
    X.save(); X.globalAlpha=0.22; X.fillStyle="#000";
    X.beginPath(); X.ellipse(g.x,g.y,12,4,0,0,Math.PI*2); X.fill(); X.restore();
  }
  drawArm(-halfInter, +1, false);
  drawArm(-halfInter, -1, false);
  drawArm(+halfInter, +1, true);
  drawArm(+halfInter, -1, true);
}

/* ===================== INIT ===================== */
function initUIBindings() {
  // Verifiche
  document.getElementById("runChecks")?.addEventListener("click", runChecks);

  // Ricerca / selezione / applica
  const liftSearch = document.getElementById("liftSearch");
  const liftSelect = document.getElementById("liftSelect");
  if (liftSearch && liftSelect) {
    liftSearch.addEventListener("input", () => populateLiftSelect(filterLifts(liftSearch.value)));
    liftSelect.addEventListener("change", () => showLiftInfo(liftSelect.selectedIndex));
    document.getElementById("showLift")?.addEventListener("click", () => showLiftInfo(liftSelect.selectedIndex));
    document.getElementById("applyLift")?.addEventListener("click", () => applyLiftToChecks(liftSelect.selectedIndex));
    loadLifts();
  } else {
    logErr("Elementi ricerca/selezione non trovati nel DOM.");
  }

  // Viewer 3D
  C = document.getElementById("iso3d");
  if (!C) { logErr("Canvas #iso3d non trovato"); return; }
  if (!C.hasAttribute("width"))  C.setAttribute("width","720");
  if (!C.hasAttribute("height")) C.setAttribute("height","360");
  X = C.getContext("2d");

  // Slider bracci default
  setArmSlider(MODEL.armReachMin, MODEL.armReachMax, false);

  // Re-render su input
  ["hLift","armLen","armRot","viewMode"].forEach(id=>{
    const el=document.getElementById(id);
    if(el){ el.addEventListener("input",render3D); el.addEventListener("change",render3D); }
  });
  window.addEventListener("resize", render3D);

  requestAnimationFrame(render3D);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initUIBindings);
} else {
  initUIBindings();
}

/* ===================== PWA ===================== */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(e=>logErr(`SW: ${e.message}`));
}
