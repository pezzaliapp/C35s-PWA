// C3.5S PWA — v2
const MODEL = {
  name: "C3.5S",
  capacityKg: 3500,
  liftHmin: 100,
  liftHmax: 1970,
  underBeam: 4248,
  overall: 4250,
  armReachMin: 690,
  armReachMax: 1325,
  interasse: 2700,
  widthTotal: 3350,
  baseDepth: 620
};

// Tabs
document.getElementById('tabVer').onclick = () => { document.getElementById('paneVer').style.display='block'; document.getElementById('paneLay').style.display='none'; tabSel('tabVer'); };
document.getElementById('tabLay').onclick = () => { document.getElementById('paneVer').style.display='none'; document.getElementById('paneLay').style.display='block'; tabSel('tabLay'); };
function tabSel(id){ for (const t of document.querySelectorAll('.tab')) t.classList.remove('active'); document.getElementById(id).classList.add('active'); }

// ---------- Verifiche ----------
function runChecks(){
  const mass = +document.getElementById('mass').value;
  const clearance = +document.getElementById('clearance').value;
  const vehH = +document.getElementById('vehHeight').value;
  const desiredLift = +document.getElementById('desiredLift').value;
  const slab = +document.getElementById('slab').value;
  const concrete = document.getElementById('concrete').value;
  const variant = document.getElementById('variant').value;
  const freeH = +document.getElementById('freeHeight').value;

  const ancN = +document.getElementById('ancN').value;
  const ancType = document.getElementById('ancType').value;
  const ancDepth = +document.getElementById('ancDepth').value;
  const ancTorque = +document.getElementById('ancTorque').value;
  const ancNt = +document.getElementById('ancNt').value; // kN tension
  const ancVt = +document.getElementById('ancVt').value; // kN shear

  const out = [];

  // Portata
  out.push(mass <= MODEL.capacityKg ? `✅ Portata OK (${mass} ≤ ${MODEL.capacityKg} kg)` : `❌ Portata superata (${mass} > ${MODEL.capacityKg} kg)`);

  // Altezza minima appoggi
  out.push(clearance >= MODEL.liftHmin ? `✅ Altezza min punti di presa OK (≥ ${MODEL.liftHmin} mm)` : `⚠️ Altezza min bassa: usa prolunghe/tamponi.`);

  // Sotto traversa
  if(vehH && desiredLift){
    const need = vehH + desiredLift + 50;
    out.push(`↳ Ingombro sollevato: ${vehH} + ${desiredLift} + 50 = ${need} mm`);
    if(freeH >= need) out.push('✅ Clearance sotto traversa OK');
    else out.push('❌ Clearance sotto traversa insufficiente alla quota desiderata');
  }

  // Pavimento (regola prudenziale)
  const slabMin = variant.includes("Senza") ? 180 : 160;
  out.push(slab >= slabMin ? `✅ Pavimento OK per "${variant}" (≥ ${slabMin} mm)` : `⚠️ Pavimento sottile (${slab} mm): valuta plinti/platea o variante con basamento.`);
  out.push(`ℹ️ Classe calcestruzzo indicata: ${concrete}`);

  // Ancoranti (stima semplificata)
  // carico verticale per colonna (statico): metà massa * g; usiamo kN (1kN≈100kgf) e coeff prudenziale 1.2
  const colLoad_kN = (mass/2) / 100 * 1.2; // kN
  const perAnchor_tension = colLoad_kN / ancN; // kN
  const tensionOK = perAnchor_tension <= ancNt;
  out.push(`Anc. per colonna: ${ancN}×${ancType}, prof. ${ancDepth} mm, coppia ${ancTorque} Nm`);
  out.push(`↳ Stima trazione per ancorante: ${perAnchor_tension.toFixed(2)} kN vs amm. ${ancNt.toFixed(2)} kN — ${tensionOK?'OK ✅':'NO ❌'}`);

  // taglio: assumiamo 10% carico come componente orizzontale caratteristica (vento/urti leggeri) -> prudenziale
  const shear_kN = colLoad_kN*0.10 / ancN;
  const shearOK = shear_kN <= ancVt;
  out.push(`↳ Stima taglio per ancorante: ${shear_kN.toFixed(2)} kN vs amm. ${ancVt.toFixed(2)} kN — ${shearOK?'OK ✅':'NO ❌'}`);

  out.push('Nota: usare sempre valori certificati ETA del produttore e verifiche di calcolo strutturale in opera.');

  document.getElementById('out').textContent = out.join('\n');
}
document.getElementById('runChecks').onclick = runChecks;

function exportJSON(){
  const data = {
    model: MODEL,
    inputs: {
      mass: +document.getElementById('mass').value,
      clearance: +document.getElementById('clearance').value,
      vehH: +document.getElementById('vehHeight').value,
      desiredLift: +document.getElementById('desiredLift').value,
      slab: +document.getElementById('slab').value,
      concrete: document.getElementById('concrete').value,
      variant: document.getElementById('variant').value,
      freeH: +document.getElementById('freeHeight').value,
      ancN: +document.getElementById('ancN').value,
      ancType: document.getElementById('ancType').value,
      ancDepth: +document.getElementById('ancDepth').value,
      ancTorque: +document.getElementById('ancTorque').value,
      ancNt: +document.getElementById('ancNt').value,
      ancVt: +document.getElementById('ancVt').value,
      notes: document.getElementById('notes').value
    },
    ts: new Date().toISOString()
  };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'),{href:url,download:`report_C35S_${Date.now()}.json`});
  a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500);
}
document.getElementById('exportJSON').onclick = exportJSON;

// ---------- Layout drag&drop ----------
const plan = document.getElementById('plan');
const ctx = plan.getContext('2d');
let tools = []; // {id,type,x,y,w,h,rot}
let sel = null;
let dragging = false;
let dragOff = {x:0,y:0};

function mmToPx(mm){ const scale = +document.getElementById('scale').value; return mm/scale; }
function pxToMm(px){ const scale = +document.getElementById('scale').value; return px*scale; }

function addTool(){
  const type = document.getElementById('toolType').value;
  let w=1000,h=600; // defaults
  if(type==='lift'){ w = MODEL.widthTotal; h = MODEL.baseDepth + 800; } // footprint indicativa
  if(type==='bench'){ w = 2000; h = 800; }
  if(type==='lane'){ w = 1000; h = 6000; }
  if(type==='comp'){ w = 800; h = 800; }
  tools.push({id:Date.now(), type, x:100, y:100, w, h, rot:0});
  drawLayout();
}
document.getElementById('addTool').onclick = addTool;

function drawLayout(){
  const roomW = +document.getElementById('roomW').value;
  const roomH = +document.getElementById('roomH').value;
  plan.width = mmToPx(roomW);
  plan.height = mmToPx(roomH);
  ctx.clearRect(0,0,plan.width,plan.height);

  // background grid 500 mm
  ctx.strokeStyle = '#1d2a55'; ctx.lineWidth = 1;
  const grid=500;
  for(let x=0;x<=roomW;x+=grid){ ctx.beginPath(); ctx.moveTo(mmToPx(x),0); ctx.lineTo(mmToPx(x), plan.height); ctx.stroke(); }
  for(let y=0;y<=roomH;y+=grid){ ctx.beginPath(); ctx.moveTo(0,mmToPx(y)); ctx.lineTo(plan.width, mmToPx(y)); ctx.stroke(); }

  // draw tools
  tools.forEach(t=>{
    ctx.save();
    ctx.translate(mmToPx(t.x), mmToPx(t.y));
    ctx.rotate(t.rot*Math.PI/180);
    // color per tipo
    ctx.fillStyle = t.type==='lift' ? '#60a5fa' : t.type==='bench' ? '#a78bfa' : t.type==='lane' ? '#22c55e' : '#f59e0b';
    ctx.fillRect(0,0, mmToPx(t.w), mmToPx(t.h));
    ctx.strokeStyle = '#e5e7eb'; ctx.strokeRect(0,0, mmToPx(t.w), mmToPx(t.h));
    ctx.fillStyle = '#e5e7eb'; ctx.font='12px system-ui';
    ctx.fillText(t.type, 6, 14);
    ctx.restore();
  });

  // selection box
  if(sel){
    ctx.save();
    ctx.translate(mmToPx(sel.x), mmToPx(sel.y));
    ctx.rotate(sel.rot*Math.PI/180);
    ctx.strokeStyle = '#fef08a'; ctx.lineWidth = 2;
    ctx.strokeRect(0,0, mmToPx(sel.w), mmToPx(sel.h));
    ctx.restore();
  }
}
drawLayout();
['roomW','roomH','scale'].forEach(id=>document.getElementById(id).addEventListener('change', drawLayout));

function hitTest(px,py){
  // reverse iterate (topmost)
  for(let i=tools.length-1;i>=0;i--){
    const t=tools[i];
    // quick AABB ignoring rotation for simplicity
    const x=mmToPx(t.x), y=mmToPx(t.y), w=mmToPx(t.w), h=mmToPx(t.h);
    if(px>=x && px<=x+w && py>=y && py<=y+h) return t;
  }
  return null;
}

plan.addEventListener('mousedown', e=>{
  const rect = plan.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  const t = hitTest(x,y);
  if(t){ sel=t; dragging=true; dragOff={x:x-mmToPx(t.x), y:y-mmToPx(t.y)}; drawLayout(); }
  else { sel=null; drawLayout(); }
});
plan.addEventListener('mousemove', e=>{
  if(!dragging || !sel) return;
  const rect = plan.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  sel.x = pxToMm(x - dragOff.x);
  sel.y = pxToMm(y - dragOff.y);
  drawLayout();
});
window.addEventListener('mouseup', ()=>{ dragging=false; });

window.addEventListener('keydown', e=>{
  if(!sel) return;
  if(e.key==='r' || e.key==='R'){ sel.rot=(sel.rot+90)%360; drawLayout(); }
  if(e.key==='Delete'){ tools = tools.filter(t=>t!==sel); sel=null; drawLayout(); }
});

function exportPNG(){
  const link = document.createElement('a');
  link.download = `layout_${Date.now()}.png`;
  link.href = plan.toDataURL('image/png');
  link.click();
}
document.getElementById('exportPNG').onclick = exportPNG;

function saveLayout(){
  const data = { roomW:+document.getElementById('roomW').value, roomH:+document.getElementById('roomH').value, scale:+document.getElementById('scale').value, tools };
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'),{href:url,download:`layout_${Date.now()}.json`});
  a.click(); setTimeout(()=>URL.revokeObjectURL(url),1500);
}
document.getElementById('saveLayout').onclick = saveLayout;

document.getElementById('loadLayout').onclick = ()=> document.getElementById('layoutFile').click();
document.getElementById('layoutFile').addEventListener('change', e=>{
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader(); r.onload=()=>{
    try{
      const data = JSON.parse(r.result);
      document.getElementById('roomW').value = data.roomW;
      document.getElementById('roomH').value = data.roomH;
      document.getElementById('scale').value = data.scale;
      tools = data.tools||[]; drawLayout();
    }catch(err){ alert('File non valido'); }
  }; r.readAsText(f);
});

// Bind buttons
document.getElementById('exportJSON').onclick = exportJSON;

// PWA
if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js'); }
