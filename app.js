/* app.js — v4.7.2
 * CASCOS PWA: ricerca + autofill + verifiche + viewer 3D (fit-to-view, ombre, riflessi, bracci specchiati)
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
    const codice = (r.codice ?? "—");
    const cat = (r.categoria ?? "—");
    const mod = (r.modello ?? "—");
    opt.textContent = `${mod} — ${codice} — ${cat}`;
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
    `Modello: ${r.modello ?? "—"}  (codice: ${r.codice ?? "—"})`,
    `Categoria: ${r.categoria ?? "—"} — Basamento: ${r.basamento ?? "—"}`,
    `Portata: ${r.portata_kg ?? "—"} kg`,
    `Versione: ${r.versione ?? "—"}`,
    `Note: ${r.note_tecniche ?? "—"}`,
    `Fonte: ${r.pdf_source ?? "—"}`
  ].join("\n");
}

// ---------------------- HELPER ----------------------
const num = (v, fb) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fb;
};

function inferCapacityFromModel(name = "") {
  const m = String(name).toUpperCase();
  if (/C7(\D|$)/.test(m)) return 7000;
  if (/C5\.5(\D|$)/.test(m)) return 5500;
  if (/C5(\D|$)/.test(m)) return 5000;
  if (/C4(\D|$)/.test(m)) return 4000;
  if (/C3\.5(\D|$)/.test(m)) return 3500;
  if (/C3\.2(\D|$)/.test(m)) return 3200;
  return null;
}

function getArmRangeForLift(rec) {
  const pick = (o, keys) => {
    for (const k of keys) {
      if (o && o[k] != null && o[k] !== "") {
        const v = num(o[k], NaN);
        if (Number.isFinite(v) && v > 0) return v;
      }
    }
    return null;
  };
  const min =
    pick(rec, ["arm_min_mm", "braccio_min_mm", "bracci_min_mm", "est_min_mm"]) ??
    MODEL.armReachMin;
  const max =
    pick(rec, ["arm_max_mm", "braccio_max_mm", "bracci_max_mm", "est_max_mm"]) ??
    MODEL.armReachMax;
  return min < max ? { min, max } : { min: MODEL.armReachMin, max: MODEL.armReachMax };
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

// ---------------------- APPLY MODEL ----------------------
function applyLiftToChecks(idx) {
  const search = document.getElementById("liftSearch");
  const list = filterLifts(search ? search.value : "");
  const r = list[idx] || LIFTS[idx];
  if (!r) return;

  // Portata
  const inferred = inferCapacityFromModel(r.modello);
  const cap = num(r.portata_kg, inferred ?? MODEL.capacityKg);
  MODEL.capacityKg = cap;
  const capEl = document.getElementById("cap");
  if (capEl) capEl.textContent = cap;

  // Variante installazione
  const variant = document.getElementById("variant");
  if (r.basamento && variant) {
    const b = String(r.basamento).toLowerCase();
    variant.value = b.includes("senza")
      ? "Senza basamento"
      : "Con basamento (trave/platea)";
  }

  // Altezze
  const clear = document.getElementById("clearance");
  if (r.altezza_min_mm && clear)
    clear.value = Math.max(num(r.altezza_min_mm, 100), 80);
  const des = document.getElementById("desiredLift");
  if (r.altezza_max_mm && des)
    des.value = Math.min(num(r.altezza_max_mm, MODEL.liftHmax), MODEL.liftHmax);

  // Geometrie
  MODEL.interasse = num(
    r.interasse ?? r.interasse_mm ?? r.interasse_colonne_mm,
    MODEL.interasse
  );
  MODEL.widthTotal = num(
    r.larghezza_totale ?? r.width_total_mm ?? r.larghezza_totale_mm,
    MODEL.widthTotal
  );
  MODEL.baseDepth = num(r.base_profondita ?? r.base_depth_mm, MODEL.baseDepth);
  MODEL.underBeam = num(
    r.altezza_sotto_traversa ?? r.under_beam_mm,
    MODEL.underBeam
  );

  // Bracci
  const { min, max } = getArmRangeForLift(r);
  setArmSlider(min, max, true);

  const info = document.getElementById("liftInfo");
  if (info)
    info.textContent = `Applicato modello: ${r.modello ?? "—"} (${r.codice ??
      "—"}) — portata impostata: ${MODEL.capacityKg} kg`;

  render3D();
  runChecks();
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

function render3D() {
  if (!C || !X) return;
  setupCanvas();

  const mode = document.getElementById("viewMode")?.value || "iso";
  const H = +(document.getElementById("hLift")?.value ?? 600);
  const sArm = document.getElementById("armLen");
  const Lraw = +(sArm?.value ?? MODEL.armReachMin);
  const L = Math.min(
    Math.max(Lraw, +(sArm?.min ?? MODEL.armReachMin)),
    +(sArm?.max ?? MODEL.armReachMax)
  );
  const Adeg = +(document.getElementById("armRot")?.value ?? 20);
  const A = (Adeg * Math.PI) / 180;

  const inter = MODEL.interasse;
  const colW = (MODEL.widthTotal - inter) / 2;
  const baseD = MODEL.baseDepth;
  const colH = 4250;

  const w = C.clientWidth || 380;
  const h = C.clientHeight || 360;
  const Wspan = (MODEL.widthTotal || 3350) * 1.28;
  const Hspan = colH * 1.18;
  const s = Math.min(w / Wspan, h / Hspan);
  const cx = w / 2;
  const cy = h * 0.82;

  function Praw(x, y, z) {
    if (mode === "top") return { X: x, Y: z };
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

  X.clearRect(0, 0, w, h);

  const floorGrad = X.createLinearGradient(0, h * 0.55, 0, h);
  floorGrad.addColorStop(0, "#0c1735");
  floorGrad.addColorStop(1, "#060a18");
  X.fillStyle = floorGrad;
  X.fillRect(0, h * 0.55, w, h * 0.45);

  const halfInter = inter / 2;
  const colBases = [
    { x: -halfInter - colW, color: "#3b82f6" },
    { x: +halfInter, color: "#3b82f6" }
  ];
  colBases.forEach(c => {
    const front = [
      P({ x: c.x, y: 0, z: 0 }),
      P({ x: c.x + colW, y: 0, z: 0 }),
      P({ x: c.x + colW, y: colH, z: 0 }),
      P({ x: c.x, y: colH, z: 0 })
    ];
    const grad = X.createLinearGradient(front[0].x, front[0].y, front[1].x, front[1].y);
    grad.addColorStop(0.0, "#1d4ed8");
    grad.addColorStop(0.45, c.color);
    grad.addColorStop(1.0, "#60a5fa");
    X.fillStyle = grad;
    X.strokeStyle = "#0b1022";
    X.beginPath();
    front.forEach((pt, i) => (i ? X.lineTo(pt.x, pt.y) : X.moveTo(pt.x, pt.y)));
    X.closePath();
    X.fill();
    X.stroke();

    X.save();
    X.globalAlpha = 0.2;
    const mid = (front[0].x + front[1].x) / 2;
    X.fillStyle = "#ffffff";
    X.fillRect(mid - 2, front[0].y + 12, 4, (front[2].y - front[1].y) - 24);
    X.restore();
  });

  // Trave superiore
  const tr = [
    P({ x: -halfInter, y: colH - 120, z: 0 }),
    P({ x: halfInter + colW, y: colH - 120, z: 0 }),
    P({ x: halfInter + colW, y: colH, z: 0 }),
    P({ x: -halfInter, y: colH, z: 0 })
  ];
  X.fillStyle = "#2563eb";
  X.strokeStyle = "#0b1022";
  X.beginPath();
  tr.forEach((pt, i) => (i ? X.lineTo(pt.x, pt.y) : X.moveTo(pt.x, pt.y)));
  X.closePath();
  X.fill();
  X.stroke();

  // Basamenti
  const box = (x, y, z, w, h, d, col) => {
    const pts = [
      { x, y, z },
      { x: x + w, y, z },
      { x: x + w, y: y + h, z },
      { x, y: y + h, z },
      { x, y, z: z + d },
      { x: x + w, y, z: z + d },
      { x: x + w, y: y + h, z: z + d },
      { x, y: y + h, z: z + d }
    ].map(P);
    X.fillStyle = col;
    X.strokeStyle = "#0b1022";
    X.beginPath();
    [0, 1, 2, 3].forEach((i, k) => (k ? X.lineTo(pts[i].x, pts[i].y) : X.moveTo(pts[i].x, pts[i].y)));
    X.closePath();
    X.fill();
    X.stroke();
  };
  box(-halfInter - colW, 0, 0, colW, 20, baseD, "#0f1733");
  box(halfInter, 0, 0, colW, 20, baseD, "#0f1733");

  // Bracci
  const pivotY = 200 + H;
  const pivotZ = baseD / 2;

  function drawArm(pivotX, sign, isRight) {
    const baseAngle = isRight ? Math.PI : 0;
    const angle = baseAngle + sign * A;

    const x1 = pivotX, y1 = pivotY, z1 = pivotZ;
    const x2 = x1 + Math.cos(angle) * L;
    const z2 = z1 + Math.sin(angle) * L;

    const a = P({ x: x1, y: y1, z: z1 });
    const b = P({ x: x2, y: y1, z: z2 });

    X.strokeStyle = "#a78bfa";
    X.lineWidth = 5;
    X.beginPath();
    X.moveTo(a.x, a.y);
    X.lineTo(b.x, b.y);
    X.stroke();

    X.fillStyle = "#22c55e";
    X.beginPath();
    X.arc(b.x, b.y, 6, 0, Math.PI * 2);
    X.fill();

    const g = P({ x: x2, y: 0, z: z2 });
    X.save();
    X.globalAlpha = 0.22;
    X.fillStyle = "#000";
    X.beginPath();
    X.ellipse(g.x, g.y, 12, 4, 0, 0, Math.PI * 2);
    X.fill();
    X.restore();
  }

  drawArm(-halfInter, +1, false);
 
