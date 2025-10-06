// PWA v4 — embedded CASCOS JSON + search/autofill + checks + simple 3D
const MODEL = {
  capacityKg: 3500, liftHmin: 100, liftHmax: 1970, underBeam: 4248,
  interasse: 2700, widthTotal: 3350, baseDepth: 620, armReachMin: 690, armReachMax: 1325
};

// ---- Load CASCOS dataset ----
let LIFTS = [];
async function loadLifts(){
  try{
    const res = await fetch('./data/CASCOS_LIFTS.json');
    LIFTS = await res.json();
    populateLiftSelect(LIFTS);
  }catch(e){ console.warn('Errore caricamento dataset', e); }
}
function populateLiftSelect(list){
  const sel = document.getElementById('liftSelect'); sel.innerHTML='';
  (list||[]).forEach((r,i)=>{
    const opt=document.createElement('option');
    opt.value=i; opt.textContent=`${r.modello} — ${r.codice} — ${r.categoria}`;
    sel.appendChild(opt);
  });
}
function filterLifts(q){
  q=(q||'').toLowerCase().trim(); if(!q) return LIFTS;
  return LIFTS.filter(r =>
    (r.modello||'').toLowerCase().includes(q) ||
    (r.codice||'').toLowerCase().includes(q) ||
    (r.categoria||'').toLowerCase().includes(q) ||
    (r.versione||'').toLowerCase().includes(q)
  );
}
function showLiftInfo(idx){
  const list = filterLifts(document.getElementById('liftSearch').value);
  const r = list[idx] || LIFTS[idx]; if(!r) return;
  document.getElementById('liftInfo').textContent = [
    `Modello: ${r.modello}  (codice: ${r.codice})`,
    `Categoria: ${r.categoria} — Basamento: ${r.basamento}`,
    `Portata: ${r.portata_kg||'—'} kg`,
    `Versione: ${r.versione||'—'}`,
    `Note: ${r.note_tecniche||'—'}`,
    `Fonte: ${r.pdf_source||'—'}`
  ].join('\n');
}
function applyLiftToChecks(idx){
  const list = filterLifts(document.getElementById('liftSearch').value);
  const r = list[idx] || LIFTS[idx]; if(!r) return;
  if(r.portata_kg){ MODEL.capacityKg = Number(r.portata_kg); document.getElementById('cap').textContent = MODEL.capacityKg; }
  const variant = document.getElementById('variant');
  if(r.basamento && variant){
    if(r.basamento.toLowerCase().includes('senza')) variant.value = 'Senza basamento';
    else if(r.basamento.toLowerCase().includes('con')) variant.value = 'Con basamento (trave/platea)';
  }
  if(r.altezza_min_mm) document.getElementById('clearance').value = Math.max(Number(r.altezza_min_mm), 100);
  if(r.altezza_max_mm) document.getElementById('desiredLift').value = Math.min(Number(r.altezza_max_mm), MODEL.liftHmax);
  document.getElementById('liftInfo').textContent =
    `Applicato modello: ${r.modello} (${r.codice}) — portata impostata: ${MODEL.capacityKg} kg`;
}
const liftSearch = document.getElementById('liftSearch');
const liftSelect = document.getElementById('liftSelect');
if(liftSearch && liftSelect){
  liftSearch.addEventListener('input', ()=>{ populateLiftSelect(filterLifts(liftSearch.value)); });
  liftSelect.addEventListener('change', ()=> showLiftInfo(liftSelect.selectedIndex));
  document.getElementById('showLift').addEventListener('click', ()=> showLiftInfo(liftSelect.selectedIndex));
  document.getElementById('applyLift').addEventListener('click', ()=> applyLiftToChecks(liftSelect.selectedIndex));
  loadLifts();
}

// ---- Checks ----
function runChecks(){
  const mass=+document.getElementById('mass').value;
  const clearance=+document.getElementById('clearance').value;
  const vehH=+document.getElementById('vehHeight').value;
  const desiredLift=+document.getElementById('desiredLift').value;
  const slab=+document.getElementById('slab').value;
  const variant=document.getElementById('variant').value;
  const out=[];

  out.push(mass <= MODEL.capacityKg ? `✅ Portata OK (${mass} ≤ ${MODEL.capacityKg} kg)` : `❌ Portata superata (${mass} > ${MODEL.capacityKg} kg)`);
  out.push(clearance >= MODEL.liftHmin ? `✅ Altezza min punti di presa OK (≥ ${MODEL.liftHmin} mm)` : `⚠️ Altezza min bassa: usa prolunghe/tamponi.`);
  const need = vehH + desiredLift + 50;
  out.push(`↳ Ingombro sollevato: ${vehH} + ${desiredLift} + 50 = ${need} mm`);
  out.push(need <= MODEL.underBeam ? '✅ Clearance sotto traversa OK' : '❌ Clearance sotto traversa insufficiente');
  const slabMin = variant.includes('Senza') ? 180 : 160;
  out.push(slab >= slabMin ? `✅ Pavimento OK per "${variant}" (≥ ${slabMin} mm)` : `⚠️ Pavimento sottile (${slab} mm): valuta plinti/platea.`);
  document.getElementById('out').textContent = out.join('\n');
}
document.getElementById('runChecks').addEventListener('click', runChecks);

// ---- Simple isometric 3D viewer ----
const C = document.getElementById('iso3d'); const X = C.getContext('2d');
function proj(p, mode='iso'){ const s=0.6, ang=Math.PI/6;
  if(mode==='top') return {x:p.x*s+360, y:p.z*s+220};
  if(mode==='front') return {x:p.x*s+360,y:p.y*s+260};
  const x=(p.x-p.z)*Math.cos(ang); const y=p.y+(p.x+p.z)*Math.sin(ang); return {x:x*s+360,y:y*s+260}; }
function box(x,y,z,w,h,d,c,mode){
  const P = [{x:x,y:y,z:z},{x:x+w,y:y,z:z},{x:x+w,y:y+h,z:z},{x:x,y:y+h,z:z},{x:x,y:y,z:z+d},{x:x+w,y:y,z:z+d},{x:x+w,y:y+h,z:z+d},{x:x,y:y+h,z:z+d}]
    .map(p=>proj(p,mode)); X.fillStyle=c; X.strokeStyle='#0b1022';
  const F=[[3,2,6,7],[1,2,6,5],[0,1,2,3]]; F.forEach(face=>{ X.beginPath(); face.forEach((i,j)=> j?X.lineTo(P[i].x,P[i].y):X.moveTo(P[i].x,P[i].y)); X.closePath(); X.fill(); X.stroke(); });
}
function line3d(x1,y1,z1,x2,y2,z2,c,w,mode){ const p1=proj({x:x1,y:y1,z:z1},mode), p2=proj({x:x2,y:y2,z:z2},mode); X.strokeStyle=c; X.lineWidth=w; X.beginPath(); X.moveTo(p1.x,p1.y); X.lineTo(p2.x,p2.y); X.stroke(); }
function circle3d(x,y,z,r,c,mode){ const p=proj({x,y,z},mode); X.fillStyle=c; X.beginPath(); X.arc(p.x,p.y,r,0,Math.PI*2); X.fill(); }
function render3D(){
  const mode=document.getElementById('viewMode').value;
  const H=+document.getElementById('hLift').value;
  const L=+document.getElementById('armLen').value;
  const A=(+document.getElementById('armRot').value)*Math.PI/180;
  X.clearRect(0,0,C.width,C.height);
  const inter=MODEL.interasse, colW=(MODEL.widthTotal-inter)/2, baseD=MODEL.baseDepth, colH=4250, y0=0, z=0, leftX=-inter/2-colW, rightX=inter/2;
  box(-3500,y0,-2000,7000,20,4000,'#0f1733',mode);
  box(leftX,y0,z,colW,colH,baseD,'#3b82f6',mode);
  box(rightX,y0,z,colW,colH,baseD,'#3b82f6',mode);
  box(leftX+colW,colH-120,z,inter,120,baseD,'#2563eb',mode);
  const py=y0+200+H, pz=z+baseD/2;
  function arm(px,sg){ const x2=px+Math.cos(A*sg)*L, z2=pz+Math.sin(A*sg)*L; line3d(px,py,pz,x2,py,z2,'#a78bfa',5,mode); circle3d(x2,py,z2,5,'#22c55e',mode); }
  arm(leftX+colW,+1); arm(leftX+colW,-1); arm(rightX,+1); arm(rightX,-1);
}
['hLift','armLen','armRot','viewMode'].forEach(id=>document.getElementById(id).addEventListener('input', render3D));
render3D();

// PWA SW
if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js'); }
