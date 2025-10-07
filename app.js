/* app.js — v4.8 DEBUG + FALLBACK JSON
 * Caricamento sicuro con messaggio di errore visibile
 */

"use strict";

const MODEL = {
  capacityKg: 3500, liftHmin: 100, liftHmax: 1970,
  underBeam: 4248, interasse: 2700, widthTotal: 3350,
  baseDepth: 620, armReachMin: 690, armReachMax: 1325
};

let LIFTS = [
  { modello:"C3.5", codice:"TEST", categoria:"Prova", portata_kg:3500, basamento:"Con basamento" }
];

async function loadLifts() {
  const infoBox = document.getElementById("liftInfo");
  try {
    const res = await fetch("./data/CASCOS_LIFTS.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txt = await res.text();
    LIFTS = JSON.parse(txt);
    populateLiftSelect(LIFTS);
    if (infoBox) infoBox.textContent = "✅ Dataset CASCOS caricato correttamente.";
  } catch (e) {
    console.warn("⚠️ Errore caricamento dataset", e);
    if (infoBox)
      infoBox.textContent = "⚠️ Dataset non caricato. Uso dati di prova.";
    populateLiftSelect(LIFTS); // usa record di fallback
  }
}

function populateLiftSelect(list) {
  const sel = document.getElementById("liftSelect");
  if (!sel) return;
  sel.innerHTML = "";
  list.forEach((r, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${r.modello} — ${r.codice ?? "—"} — ${r.categoria ?? "—"}`;
    sel.appendChild(opt);
  });
}

function showLiftInfo(idx) {
  const r = LIFTS[idx];
  if (!r) return;
  const box = document.getElementById("liftInfo");
  box.textContent = `Modello: ${r.modello} (codice: ${r.codice}) — Portata: ${r.portata_kg || "—"} kg`;
  MODEL.capacityKg = Number(r.portata_kg) || MODEL.capacityKg;
}

function applyLiftToChecks(idx) {
  const r = LIFTS[idx];
  if (!r) return;
  MODEL.capacityKg = Number(r.portata_kg) || MODEL.capacityKg;
  document.getElementById("cap").textContent = MODEL.capacityKg;
  document.getElementById("liftInfo").textContent =
    `Applicato modello: ${r.modello} (${r.codice}) — ${MODEL.capacityKg} kg`;
}

/* ---- runChecks minimale per test ---- */
function runChecks() {
  document.getElementById("out").textContent =
    `Verifica eseguita — Portata massima: ${MODEL.capacityKg} kg`;
}

/* ---- Viewer 3D test minimal ---- */
function render3D() {
  const C = document.getElementById("iso3d");
  const X = C.getContext("2d");
  const w = C.width = C.clientWidth;
  const h = C.height = C.clientHeight;
  X.fillStyle = "#0b1022";
  X.fillRect(0, 0, w, h);
  X.fillStyle = "#22c55e";
  X.font = "20px system-ui";
  X.fillText("CASCOS PWA 3D Viewer", 20, 40);
}

function initUIBindings() {
  document.getElementById("runChecks").addEventListener("click", runChecks);
  document.getElementById("applyLift").addEventListener("click", () => applyLiftToChecks(document.getElementById("liftSelect").selectedIndex));
  document.getElementById("showLift").addEventListener("click", () => showLiftInfo(document.getElementById("liftSelect").selectedIndex));
  loadLifts();
  render3D();
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", initUIBindings);
else
  initUIBindings();
