/* app.js — v4.4
 * CASCOS PWA: ricerca+autofill + verifiche + viewer 3D robusto
 * (HiDPI, fit-to-view, ombre/riflessi, bracci specchiati, range dinamico)
 */
"use strict";

/* ---------------------- MODEL ---------------------- */
const MODEL = {
  capacityKg: 3500,
  liftHmin: 100,
  liftHmax: 1970,
  underBeam: 4248,
  interasse: 2700,
  widthTotal: 3350,
  baseDepth: 620,
  armReachMin: 690,
  armReachMax: 1325,
};

let LIFTS = [];

/* ---------------------- DATASET CASCOS ---------------------- */
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

/* ---- Arm range dinamico dal JSON (fallback MODEL) ---- */
function getArmRangeForLift(rec) {
  const minKeys = ["arm_min_mm", "braccio_min_mm", "bracci_min_mm", "est_min_mm"];
  const maxKeys = ["arm_max_mm", "braccio_max_mm", "bracci_max_mm", "est_max_mm"];
  const pick = (o, keys) => {
    for (const k of keys) {
      if (o && o[k] != null && o[k] !== "") {
        const v = Number(String(o[k]).replace(",", "."));
        if (!Number.isNaN(v) && v > 0) return v;
      }
    }
    return null;
  };
  let min = pick(rec, minKeys);
  let max = pick(rec, maxKeys);
  if (!min || !max || min >= max) {
    min = MODEL.armReachMin;
    max = MODEL.armReachMax;
  }
  return { min, max };
}
function setArmSlider(min, max, keepCurrent = true) {
  const s = document.getElementById("armLen");
  if (!s) return;
  const prev = Number(s.value || min);
  s.min = String(min);
  s.max = String(max);
  s.value = String(keepCurrent ? Math.min(Math.max(prev, min), max) : min);
  s.title = `Estensione bracci: ${s.value} mm (min ${min} – max ${max})`;
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

  // Range bracci dal modello selezionato
  const { min, max } = getArmRangeForLift(r);
  setArmSlider(min, max, true);

  const info = document.getElementById("liftInfo");
  if (info)
    info.textContent = `Applicato modello: ${r.modello} (${r.codice}) — portata impostata: ${MODEL.capacityKg} kg — bracci: ${min}–${max} mm`;
}

/* ---------------------- VERIFICHE ---------------------- */
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

/* ---------------------- VIEWER 3D ---------------------- */
let C, X;

// HiDPI safe
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

  const mode = (document.getElementById("viewMode")?.value) || "iso";
  const HVal = +(document.getElementById("hLift")?.value ?? 600);
  const armSlider = document.getElementById("armLen");
  const Lraw = +(armSlider?.value ?? MODEL.armReachMin);
  const L = Math.min(
    Math.max(Lraw, +(armSlider?.min ?? MODEL.armReachMin)),
    +(armSlider?.max ?? MODEL.armReachMax)
  );
  const Adeg = +(document.getElementById("armRot")?.value ?? 20);
  const A = (Adeg * Math.PI) / 180;

  const inter = MODEL.interasse;
  const colW = (MODEL.widthTotal - inter) / 2;
  const baseD = MODEL.baseDepth;
  const colH = 4250;

  // Fit-to-view & centraggio
  const w = C.clientWidth || 720;
  const h = C.clientHeight || 360;
  const s = Math.min(w / (MODEL.widthTotal * 1.28), h / (colH * 1.18));
  const cx = w / 2;
  const cy = h * (mode === "top" ? 0.60 : 0.80); // pianta un po' più alta

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

  // pulizia
  X.clearRect(0, 0, w, h);

  // pavimento + ombra ambiente
  const floorGrad = X.createLinearGradient(0, h * 0.55, 0, h);
  floorGrad.addColorStop(0, "#0c1735");
  floorGrad.addColorStop(1, "#060a18");
  X.fillStyle = floorGrad;
  X.fillRect(0, h * 0.55, w, h * 0.45);

  const halfInter = inter / 2;

  // colonne con riflesso
  const cols = [
    { x: -halfInter - colW, color: "#3b82f6" },
    { x: +halfInter,        color: "#3b82f6" }
  ];
  cols.forEach(c => {
    const f = [
      P({ x: c.x,        y: 0,    z: 0 }),
      P({ x: c.x + colW, y: 0,    z: 0 }),
      P({ x: c.x + colW, y: colH, z: 0 }),
      P({ x: c.x,        y: colH, z: 0 })
    ];
    const grad = X.createLinearGradient(f[0].x, f[0].y, f[1].x, f[1].y);
    grad.addColorStop(0.00, "#1d4ed8");
    grad.addColorStop(0.45, c.color);
    grad.addColorStop(1.00, "#60a5fa");
    X.fillStyle = grad; X.strokeStyle = "#0b1022";
    X.beginPath(); f.forEach((p,i)=> i?X.lineTo(p.x,p.y):X.moveTo(p.x,p.y)); X.closePath(); X.fill(); X.stroke();

    // riflesso verticale
    X.save(); X.globalAlpha = 0.20; X.fillStyle = "#ffffff";
    const mid = (f[0].x + f[1].x) / 2;
    X.fillRect(mid-2, f[0].y+12, 4, (f[2].y - f[1].y) - 24);
    X.restore();
  });

  // trave superiore
  const tr = [
    P({ x: -halfInter,      y: colH-120, z: 0 }),
    P({ x: +halfInter+colW, y: colH-120, z: 0 }),
    P({ x: +halfInter+colW, y: colH,     z: 0 }),
    P({ x: -halfInter,      y: colH,     z: 0 })
  ];
  X.fillStyle = "#2563eb"; X.strokeStyle = "#0b1022";
  X.beginPath(); tr.forEach((p,i)=> i?X.lineTo(p.x,p.y):X.moveTo(p.x,p.y)); X.closePath(); X.fill(); X.stroke();

  // basamenti
  function boxP(x,y,z,w2,h2,d2,col){
    const pts = [
      {x,y,z},{x:x+w2,y,z},{x:x+w2,y:y+h2,z},{x,y:y+h2,z},
      {x,y,z:z+d2},{x:x+w2,y,z:z+d2},{x:x+w2,y:y+h2,z:z+d2},{x,y:y+h2,z:z+d2}
    ].map(P);
    [["#0e1533",[3,2,6,7]],["#0d1430",[1,2,6,5]],[col,[0,1,2,3]]].forEach(([c,idx])=>{
      X.fillStyle=c; X.strokeStyle="#0b1022"; X.lineWidth=1;
      X.beginPath(); idx.forEach((i,k)=>k?X.lineTo(pts[i].x,pts[i].y):X.moveTo(pts[i].x,pts[i].y)); X.closePath(); X.fill(); X.stroke();
    });
  }
  boxP(-halfInter-colW, 0, 0, colW, 20, baseD, "#0f1733");
  boxP(+halfInter,      0, 0, colW, 20, baseD, "#0f1733");

  // ---- BRACCI (specchiati e ben visibili anche in Pianta) ----
  const pivotY = 200 + HVal;       // quota pivot dal pavimento
  const pivotZ = baseD / 2;        // al centro della base
  const armWidthPx = 5;            // più spesso per visibilità
  const padRadiusPx = 6;

  function drawArm(pivotX, sign, isRight) {
    // specchia la direzione sul lato destro
    const side = isRight ? -1 : +1;

    const x1 = pivotX, y1 = pivotY, z1 = pivotZ;
    const x2 = x1 + Math.cos(A * sign * side) * L;
    const z2 = z1 + Math.sin(A * sign * side) * L;

    const a = P({ x:x1, y:y1, z:z1 });
    const b = P({ x:x2, y:y1, z:z2 });

    X.strokeStyle = "#a78bfa";
    X.lineWidth = armWidthPx;
    X.beginPath(); X.moveTo(a.x, a.y); X.lineTo(b.x, b.y); X.stroke();

    // tampone (verde) + ombra a terra
    X.fillStyle = "#22c55e";
    X.beginPath(); X.arc(b.x, b.y, padRadiusPx, 0, Math.PI * 2); X.fill();

    const g = P({ x:x2, y:0, z:z2 });
    X.save(); X.globalAlpha = 0.22; X.fillStyle = "#000";
    X.beginPath(); X.ellipse(g.x, g.y, 12, 4, 0, 0, Math.PI * 2); X.fill();
    X.restore();
  }

  // NB: pivot sulle facce **interne** delle colonne (−inter/2 e +inter/2)
  drawArm(-halfInter, +1, false);
  drawArm(-halfInter, -1, false);
  drawArm(+halfInter, +1, true);   // destra specchiata
  drawArm(+halfInter, -1, true);
}

/* ---------------------- BIND & INIT ---------------------- */
function initUIBindings() {
  // verifiche
  document.getElementById("runChecks")?.addEventListener("click", runChecks);

  // ricerca/applica
  const liftSearch = document.getElementById("liftSearch");
  const liftSelect = document.getElementById("liftSelect");
  if (liftSearch && liftSelect) {
    liftSearch.addEventListener("input", () =>
      populateLiftSelect(filterLifts(liftSearch.value))
    );
    liftSelect.addEventListener("change", () =>
      showLiftInfo(liftSelect.selectedIndex)
    );
    document.getElementById("showLift")?.addEventListener("click", () =>
      showLiftInfo(liftSelect.selectedIndex)
    );
    document.getElementById("applyLift")?.addEventListener("click", () =>
      applyLiftToChecks(liftSelect.selectedIndex)
    );
    // opzionale: aggiorna range bracci già al cambio selezione
    liftSelect.addEventListener("change", () => {
      const list = filterLifts(liftSearch ? liftSearch.value : "");
      const r = list[liftSelect.selectedIndex] || LIFTS[liftSelect.selectedIndex];
      if (r) {
        const { min, max } = getArmRangeForLift(r);
        setArmSlider(min, max, true);
      }
    });
    loadLifts();
  }

  // viewer 3D
  C = document.getElementById("iso3d");
  if (!C) return;
  if (!C.hasAttribute("width"))  C.setAttribute("width", "720");
  if (!C.hasAttribute("height")) C.setAttribute("height", "360");
  X = C.getContext("2d");

  // range iniziale bracci (fallback se non è stato applicato un modello)
  setArmSlider(MODEL.armReachMin, MODEL.armReachMax, false);

  ["hLift", "armLen", "armRot", "viewMode"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", render3D);
      el.addEventListener("change", render3D);
    }
  });

  window.addEventListener("resize", render3D);
  requestAnimationFrame(render3D);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initUIBindings);
} else {
  initUIBindings();
}

/* ---------------------- PWA ---------------------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
