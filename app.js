// PWA v4 — embedded CASCOS JSON + search/autofill + checks + 3D responsivo
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

/* =========================
   DATI CASCOS (JSON locale)
   ========================= */
let LIFTS = [];

async function loadLifts() {
  try {
    const res = await fetch("./data/CASCOS_LIFTS.json");
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
  const list = filterLifts(document.getElementById("liftSearch").value);
  const r = list[idx] || LIFTS[idx];
  if (!r) return;
  document.getElementById("liftInfo").textContent = [
    `Modello: ${r.modello}  (codice: ${r.codice})`,
    `Categoria: ${r.categoria} — Basamento: ${r.basamento}`,
    `Portata: ${r.portata_kg || "—"} kg`,
    `Versione: ${r.versione || "—"}`,
    `Note: ${r.note_tecniche || "—"}`,
    `Fonte: ${r.pdf_source || "—"}`
  ].join("\n");
}

function applyLiftToChecks(idx) {
  const list = filterLifts(document.getElementById("liftSearch").value);
  const r = list[idx] || LIFTS[idx];
  if (!r) return;

  if (r.portata_kg) {
    MODEL.capacityKg = Number(r.portata_kg);
    document.getElementById("cap").textContent = MODEL.capacityKg;
  }

  const variant = document.getElementById("variant");
  if (r.basamento && variant) {
    if (r.basamento.toLowerCase().includes("senza"))
      variant.value = "Senza basamento";
    else if (r.basamento.toLowerCase().includes("con"))
      variant.value = "Con basamento (trave/platea)";
  }

  if (r.altezza_min_mm)
    document.getElementById("clearance").value = Math.max(
      Number(r.altezza_min_mm),
      100
    );
  if (r.altezza_max_mm)
    document.getElementById("desiredLift").value = Math.min(
      Number(r.altezza_max_mm),
      MODEL.liftHmax
    );

  document.getElementById(
    "liftInfo"
  ).textContent = `Applicato modello: ${r.modello} (${r.codice}) — portata impostata: ${MODEL.capacityKg} kg`;
}

/* =================
   VERIFICHE RAPIDE
   ================= */
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
document.getElementById("runChecks").addEventListener("click", runChecks);

/* ==========================
   VIEWER 3D (CANVAS HiDPI)
   ========================== */
const C = document.getElementById("iso3d");
const X = C.getContext("2d");

// scala il canvas al devicePixelRatio mantenendo coordinate in px CSS
function setupCanvas() {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const cssW = C.clientWidth || 720;
  const cssH = C.clientHeight || 360;
  const needW = Math.round(cssW * dpr);
  const needH = Math.round(cssH * dpr);
  if (C.width !== needW || C.height !== needH) {
    C.width = needW;
    C.height = needH;
    X.setTransform(dpr, 0, 0, dpr, 0, 0); // tutte le draw-call in px CSS
  }
}

// proiezione centrata e scalata sulle dimensioni effettive del canvas
function proj(p, mode = "iso") {
  const w = C.clientWidth || 720;
  const h = C.clientHeight || 360;
  const cx = w / 2;
  const cy = h / 2;
  const s = Math.min(w, h) / 900; // 1px ≈ 1mm su viewport ~900

  if (mode === "top") return { x: p.x * s + cx, y: p.z * s + cy * 0.7 };
  if (mode === "front") return { x: p.x * s + cx, y: p.y * s + cy };

  // isometrica (30°)
  const ang = Math.PI / 6;
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

  // top, side, front con toni scuri + faccia frontale colorata
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
  setupCanvas();

  const mode = document.getElementById("viewMode").value;
  const H = +document.getElementById("hLift").value;
  const L = +document.getElementById("armLen").value;
  const A = (+document.getElementById("armRot").value) * Math.PI / 180;

  // Pulisci (usiamo clearRect con coord CSS grazie a setTransform)
  X.clearRect(0, 0, C.clientWidth || 720, C.clientHeight || 360);

  // Geometria base (mm)
  const inter = MODEL.interasse; // 2700
  const colW = (MODEL.widthTotal - inter) / 2; // 325
  const baseD = MODEL.baseDepth; // 620
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

  // Trave superiore (portale)
  box(leftX + colW, colH - 120, z, inter, 120, baseD, "#2563eb", mode);

  // Bracci (4 segmenti semplificati) — pivot a 200 mm da terra + H
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
    dot3d(x2, y1, z2, 5, "#22c55e", mode); // tampone
  }
  drawArm(leftPivotX, +1);
  drawArm(leftPivotX, -1);
  drawArm(rightPivotX, +1);
  drawArm(rightPivotX, -1);
}

// Ridisegna al variare dei controlli e al resize
["hLift", "armLen", "armRot", "viewMode"].forEach((id) =>
  document.getElementById(id).addEventListener("input", render3D)
);
window.addEventListener("resize", render3D);
render3D();

/* =============
   BIND RICERCA
   ============= */
const liftSearch = document.getElementById("liftSearch");
const liftSelect = document.getElementById("liftSelect");
if (liftSearch && liftSelect) {
  liftSearch.addEventListener("input", () => {
    populateLiftSelect(filterLifts(liftSearch.value));
  });
  liftSelect.addEventListener("change", () =>
    showLiftInfo(liftSelect.selectedIndex)
  );
  document
    .getElementById("showLift")
    .addEventListener("click", () => showLiftInfo(liftSelect.selectedIndex));
  document
    .getElementById("applyLift")
    .addEventListener("click", () =>
      applyLiftToChecks(liftSelect.selectedIndex)
    );
  loadLifts();
}

/* =====
   PWA
   ===== */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
