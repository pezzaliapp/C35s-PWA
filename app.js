/* app.js — v5.2
 * CASCOS PWA: ricerca + autofill + verifiche + viewer 3D (fit-to-view, HiDPI, bracci specchiati)
 */
"use strict";

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
const DATA_URLS = [
  "./data/CASCOS_LIFTS.json", // preferito
  "./CASCOS_LIFTS.json"       // fallback
];

async function loadLifts() {
  const infoBox = document.getElementById("liftInfo");

  async function tryFetch(url) {
    const res = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
    const text = await res.text();
    if (text.trim().startsWith("<")) throw new Error(`Non-JSON @ ${url}`);
    return JSON.parse(text);
  }

  let lastErr;
  for (const url of DATA_URLS) {
    try {
      const data = await tryFetch(url);
      if (!Array.isArray(data)) throw new Error("Root non-array");
      LIFTS = data;
      populateLiftSelect(LIFTS);
      infoBox && (infoBox.textContent = `✅ Dataset caricato: ${url.replace(/\?.*$/,"")}`);
      return;
    } catch (e) { lastErr = e; }
  }
  console.warn("Dataset non disponibile", lastErr);
  infoBox && (infoBox.textContent = "⚠️ CASCOS_LIFTS.json non trovato. Uso dati di prova.");
  LIFTS = [{
    modello: "C3.5", codice: "TEST", categoria: "Prova",
    portata_kg: 3500, basamento: "Senza basamento",
    interasse_mm: 2700, larghezza_totale_mm: 3350, base_profondita_mm: 620,
    altezza_sotto_traversa_mm: 4248, arm_min_mm: 690, arm_max_mm: 1325
  }];
  populateLiftSelect(LIFTS);
}

/* ===================== LISTA / FILTRO ===================== */
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
    `Versione: ${r.versione ?? "—"}`,
    `Note: ${r.note_tecniche ?? "—"}`,
    `Fonte: ${r.pdf_source ?? "—"}`
  ].join("\n");
}

/* ===================== Helper numerici & portate ===================== */
const num = (v, fb) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : fb;
};

const CAPACITY_MAP = [
  { re: /C7(\D|$)/i,     kg: 7000 },
  { re: /C5\.5(\D|$)/i,  kg: 5500 },
  { re: /C5(\D|$)/i,     kg: 5000 },
  { re: /C4(\D|$)/i,     kg: 4000 },
  { re: /C3\.5(\D|$)/i,  kg: 3500 },
  { re: /C3\.2(\D|$)/i,  kg: 3200 }
];

function capacityFromModelName(name = "", fallback = MODEL.capacityKg) {
  const m = String(name || "");
  for (const { re, kg } of CAPACITY_MAP) if (re.test(m)) return kg;
  return fallback;
}

function getArmRangeForLift(rec) {
  const pick = (o, keys) => {
    for (const k of keys) {
      const v = num(o?.[k], NaN);
      if (Number.isFinite(v)) return v;
    }
    return null;
  };
  const min = pick(rec, ["arm_min_mm","braccio_min_mm","bracci_min_mm","est_min_mm"]) ?? MODEL.armReachMin;
  const max = pick(rec, ["arm_max_mm","braccio_max_mm","bracci_max_mm","est_max_mm"]) ?? MODEL.armReachMax;
  return (min < max) ? { min, max } : { min: MODEL.armReachMin, max: MODEL.armReachMax };
}

function setArmSlider(min, max, keepCurrent = true) {
  const s = document.getElementById("armLen");
  if (!s) return;
  const prev = num(s.value, min);
  s.min = String(min);
  s.max = String(max);
  s.value = String(keepCurrent ? Math.min(Math.max(prev, min), max) : min);
  s.title = `Estensione bracci: ${s.value} mm (min ${min} – max ${max})`;
}

/* ===================== Applica modello ai controlli + viewer ===================== */
function applyLiftToChecks(idx) {
  const search = document.getElementById("liftSearch");
  const list = filterLifts(search ? search.value : "");
  const r = list[idx] || LIFTS[idx];
  if (!r) return;

  // Portata: JSON → dedotta → default
  const cap = num(r.portata_kg, capacityFromModelName(r.modello, MODEL.capacityKg));
  MODEL.capacityKg = cap;
  document.getElementById("cap")?.textContent = cap;

  // Variante installazione
  const variant = document.getElementById("variant");
  if (variant) {
    const b = String(r.basamento || "").toLowerCase();
    variant.value = b.includes("senza") ? "Senza basamento" : "Con basamento (trave/platea)";
  }

  // Quote min/max altezze
  const clear = document.getElementById("clearance");
  if (clear) clear.value = num(r.altezza_min_mm, MODEL.liftHmin);
  const des = document.getElementById("desiredLift");
  if (des) des.value = Math.min(num(r.altezza_max_mm, MODEL.liftHmax), MODEL.liftHmax);

  // Geometrie
  MODEL.interasse  = num(r.interasse_mm ?? r.interasse ?? r.interasse_colonne_mm, MODEL.interasse);
  MODEL.widthTotal = num(r.larghezza_totale_mm ?? r.larghezza_totale ?? r.width_total_mm, MODEL.widthTotal);
  MODEL.baseDepth  = num(r.base_profondita_mm ?? r.base_profondita ?? r.base_depth_mm, MODEL.baseDepth);
  MODEL.underBeam  = num(r.altezza_sotto_traversa_mm ?? r.altezza_sotto_traversa ?? r.under_beam_mm, MODEL.underBeam);

  // Range bracci
  const { min, max } = getArmRangeForLift(r);
  setArmSlider(min, max, true);

  // Info
  const info = document.getElementById("liftInfo");
  if (info) info.textContent =
    `Applicato modello: ${r.modello ?? "—"} (${r.codice ?? "—"}) — portata impostata: ${MODEL.capacityKg} kg`;

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

  document.getElementById("out").textContent = out.join("\n");
}

/* ===================== Viewer 3D ===================== */
let C, X;

function setupCanvas() {
  if (!C || !X) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = C.getBoundingClientRect();
  const cssW = Math.max(320, Math.floor(rect.width));
  const cssH = Math.max(220, Math.floor(rect.height));
  const needW = Math.round(cssW * dpr);
  const needH = Math.round(cssH * dpr);
  if (C.width !== needW || C.height !== needH) {
    C.width = needW;
    C.height = needH;
    X.setTransform(dpr, 0, 0, dpr, 0, 0); // disegno in px CSS
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
  X.beginPath(); tr.forEach((p,i)=> i?X.lineTo(p.x,p.y):X.moveTo(p.x,p,y)); // typo fix
  X.closePath(); X.fill(); X.stroke();

  // Basamenti
  const drawBase=(x,y,z,w_,h_,d_,col_)=>{
    const pts=[{x,y,z},{x:x+w_,y,z},{x:x+w_,y:y+h_,z},{x,y:y+h_,z}].map(P);
    X.fillStyle=col_; X.strokeStyle="#0b1022";
    X.beginPath(); pts.forEach((p,i)=> i?X.lineTo(p.x,p.y):X.moveTo(p.x,p.y)); X.closePath(); X.fill(); X.stroke();
  };
  drawBase(-halfInter - colW, 0, 0, colW, 20, baseD, "#0f1733");
  drawBase( halfInter,        0, 0, colW, 20, baseD, "#0f1733");

  // Bracci (pivot interni, specchiati)
  const pivotY = 200 + H, pivotZ = baseD/2;
  function drawArm(pivotX, sign, isRight){
    const baseAngle = isRight ? Math.PI : 0; // dx verso interno
    const angle = baseAngle + sign * A;
    const x1=pivotX, y1=pivotY, z1=pivotZ;
    const x2=x1 + Math.cos(angle)*L;
    const z2=z1 + Math.sin(angle)*L;
    const a=P({x:x1,y:y1,z:z1}), b=P({x:x2,y:y1,z:z2});
    X.strokeStyle="#a78bfa"; X.lineWidth=5;
    X.beginPath(); X.moveTo(a.x,a.y); X.lineTo(b.x,b.y); X.stroke();
    X.fillStyle="#22c55e"; X.beginPath(); X.arc(b.x,b.y,6,0,Math.PI*2); X.fill();
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
  document.getElementById("runChecks")?.addEventListener("click", runChecks);

  const liftSearch = document.getElementById("liftSearch");
  const liftSelect = document.getElementById("liftSelect");
  if (liftSearch && liftSelect) {
    liftSearch.addEventListener("input", () => populateLiftSelect(filterLifts(liftSearch.value)));
    liftSelect.addEventListener("change", () => showLiftInfo(liftSelect.selectedIndex));
    document.getElementById("showLift")?.addEventListener("click", () => showLiftInfo(liftSelect.selectedIndex));
    document.getElementById("applyLift")?.addEventListener("click", () => applyLiftToChecks(liftSelect.selectedIndex));
    loadLifts();
  }

  C = document.getElementById("iso3d");
  if (!C) return;
  if (!C.hasAttribute("width"))  C.setAttribute("width","720");
  if (!C.hasAttribute("height")) C.setAttribute("height","360");
  X = C.getContext("2d");

  setArmSlider(MODEL.armReachMin, MODEL.armReachMax, false);

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
  navigator.serviceWorker.register("./sw.js");
}
