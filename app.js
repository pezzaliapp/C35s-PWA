/* app.js — v4.4
 * CASCOS PWA: ricerca+autofill + verifiche + viewer 3D robusto (HiDPI, fit-to-view, ombre/riflessi, bracci specchiati)
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
  const H    = +(document.getElementById("hLift")?.value ?? 600);
  const L    = +(document.getElementById("armLen")?.value ?? 900);
  const Adeg = +(document.getElementById("armRot")?.value ?? 20);
  const A    = (Adeg * Math.PI) / 180;

  const inter = MODEL.interasse;
  const colW  = (MODEL.widthTotal - inter) / 2;
  const baseD = MODEL.baseDepth;
  const colH  = 4250;
  const w = C.clientWidth || 720, h = C.clientHeight || 360;
  const s = Math.min(w / (MODEL.widthTotal*1.3), h / (colH*1.2));
  const cx = w/2, cy = h*0.8;

  function Praw(x,y,z){
    if(mode==="top")return {X:x,Y:z};
    if(mode==="front")return {X:x,Y:-y};
    const ang=Math.PI/6;
    const xi=(x-z)*Math.cos(ang);
    const yi=-y+(x+z)*Math.sin(ang);
    return {X:xi,Y:yi};
  }
  function P(pt){const t=Praw(pt.x,pt.y,pt.z);return{x:cx+t.X*s,y:cy+t.Y*s};}

  X.clearRect(0,0,w,h);

  // Pavimento
  const g = X.createLinearGradient(0,h*0.55,0,h);
  g.addColorStop(0,"#0c1735"); g.addColorStop(1,"#060a18");
  X.fillStyle=g; X.fillRect(0,h*0.55,w,h*0.45);

  const halfInter=inter/2;

  // Colonne
  const col=[{x:-halfInter-colW,color:"#3b82f6"},{x:halfInter,color:"#3b82f6"}];
  col.forEach(c=>{
    const f=[P({x:c.x,y:0,z:0}),P({x:c.x+colW,y:0,z:0}),P({x:c.x+colW,y:colH,z:0}),P({x:c.x,y:colH,z:0})];
    const grad=X.createLinearGradient(f[0].x,f[0].y,f[1].x,f[1].y);
    grad.addColorStop(0,"#1d4ed8"); grad.addColorStop(0.45,c.color); grad.addColorStop(1,"#60a5fa");
    X.fillStyle=grad; X.strokeStyle="#0b1022";
    X.beginPath(); f.forEach((p,i)=>i?X.lineTo(p.x,p.y):X.moveTo(p.x,p.y)); X.closePath(); X.fill(); X.stroke();
    // riflesso
    X.save(); X.globalAlpha=0.2;
    const mid=(f[0].x+f[1].x)/2; X.fillStyle="#fff";
    X.fillRect(mid-2,f[0].y+12,4,(f[2].y-f[1].y)-24);
    X.restore();
  });

  // Trave
  const tr=[P({x:-halfInter,y:colH-120,z:0}),P({x:halfInter+colW,y:colH-120,z:0}),
            P({x:halfInter+colW,y:colH,z:0}),P({x:-halfInter,y:colH,z:0})];
  X.fillStyle="#2563eb"; X.strokeStyle="#0b1022";
  X.beginPath(); tr.forEach((p,i)=>i?X.lineTo(p.x,p.y):X.moveTo(p.x,p.y)); X.closePath(); X.fill(); X.stroke();

  // Basamenti
  function boxP(x,y,z,w,h,d,col){
    const pts=[{x,y,z},{x:x+w,y,z},{x:x+w,y:y+h,z},{x,y:y+h,z},{x,y,z:z+d},{x:x+w,y,z:z+d},{x:x+w,y:y+h,z:z+d},{x,y:y+h,z:z+d}].map(P);
    [["#0e1533",[3,2,6,7]],["#0d1430",[1,2,6,5]],[col,[0,1,2,3]]].forEach(([c,idx])=>{
      X.fillStyle=c; X.strokeStyle="#0b1022"; X.lineWidth=1;
      X.beginPath(); idx.forEach((i,k)=>k?X.lineTo(pts[i].x,pts[i].y):X.moveTo(pts[i].x,pts[i].y)); X.closePath(); X.fill(); X.stroke();
    });
  }
  boxP(-halfInter-colW,0,0,colW,20,baseD,"#0f1733");
  boxP( halfInter,0,0,colW,20,baseD,"#0f1733");

  // Bracci specchiati + ombre
  const pivotY=200+H,pivotZ=baseD/2;
  function drawArm(pivotX,sign,isRight){
    const side=isRight?-1:+1; // specchia destra
    const x1=pivotX,y1=pivotY,z1=pivotZ;
    const x2=x1+Math.cos(A*sign*side)*L;
    const z2=z1+Math.sin(A*sign*side)*L;
    const a=P({x:x1,y:y1,z:z1}), b=P({x:x2,y:y1,z:z2});
    X.strokeStyle="#a78bfa"; X.lineWidth=4;
    X.beginPath(); X.moveTo(a.x,a.y); X.lineTo(b.x,b.y); X.stroke();
    X.fillStyle="#22c55e"; X.beginPath(); X.arc(b.x,b.y,5,0,Math.PI*2); X.fill();
    const g=P({x:x2,y:0,z:z2});
    X.save(); X.globalAlpha=0.22; X.fillStyle="#000";
    X.beginPath(); X.ellipse(g.x,g.y,12,4,0,Math.PI*2); X.fill(); X.restore();
  }
  // sinistra
  drawArm(-halfInter,+1,false);
  drawArm(-halfInter,-1,false);
  // destra (specchiata)
  drawArm(halfInter+colW,+1,true);
  drawArm(halfInter+colW,-1,true);
}

// ---------------------- INIT ----------------------
function initUIBindings(){
  const runBtn=document.getElementById("runChecks");
  if(runBtn)runBtn.addEventListener("click",runChecks);
  const liftSearch=document.getElementById("liftSearch");
  const liftSelect=document.getElementById("liftSelect");
  if(liftSearch&&liftSelect){
    liftSearch.addEventListener("input",()=>populateLiftSelect(filterLifts(liftSearch.value)));
    liftSelect.addEventListener("change",()=>showLiftInfo(liftSelect.selectedIndex));
    document.getElementById("showLift")?.addEventListener("click",()=>showLiftInfo(liftSelect.selectedIndex));
    document.getElementById("applyLift")?.addEventListener("click",()=>applyLiftToChecks(liftSelect.selectedIndex));
    loadLifts();
  }

  C=document.getElementById("iso3d");
  if(!C)return;
  if(!C.hasAttribute("width"))C.setAttribute("width","720");
  if(!C.hasAttribute("height"))C.setAttribute("height","360");
  X=C.getContext("2d");

  ["hLift","armLen","armRot","viewMode"].forEach(id=>{
    const el=document.getElementById(id);
    if(el){el.addEventListener("input",render3D);el.addEventListener("change",render3D);}
  });

  window.addEventListener("resize",render3D);
  requestAnimationFrame(render3D);
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initUIBindings);
else initUIBindings();

// ---------------------- PWA ----------------------
if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js");
