// C3.5S PWA — v1 (layout + check)
const MODEL = {
  name: "C3.5S",
  capacityKg: 3500,
  liftHmin: 100,
  liftHmax: 1970,
  armReachMin: 690,
  armReachMax: 1325,
  interasse: 2700,
  widthTotal: 3350,
  baseDepth: 620,
  power: "3+3 kW",
  voltage: "400/230 V"
};

function mmToPx(mm, scale){ return mm/scale; }

function drawPlan(){
  const scale = +document.getElementById('scale').value;
  const roomW = +document.getElementById('roomW').value;
  const roomH = +document.getElementById('roomH').value;
  const pos = document.getElementById('pos').value.match(/-?\d+(\.\d+)?/g).map(Number);
  const [ox, oy] = pos;

  const canvas = document.getElementById('plan');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // background grid
  const grid = 500; // mm grid
  ctx.strokeStyle = '#1d2a55';
  ctx.lineWidth = 1;
  for(let x=0;x<=roomW;x+=grid){
    const px = mmToPx(x,scale);
    ctx.beginPath(); ctx.moveTo(px,0); ctx.lineTo(px, canvas.height); ctx.stroke();
  }
  for(let y=0;y<=roomH;y+=grid){
    const py = mmToPx(y,scale);
    ctx.beginPath(); ctx.moveTo(0,py); ctx.lineTo(canvas.width, py); ctx.stroke();
  }

  ctx.save();
  ctx.translate(mmToPx(ox,scale), mmToPx(oy,scale));

  // compute column width from total width and interasse
  const colW = (MODEL.widthTotal - MODEL.interasse)/2; // mm
  const colDepth = MODEL.baseDepth; // mm

  // draw columns (plan)
  ctx.fillStyle = '#60a5fa';
  // left column
  ctx.fillRect(0, 0, mmToPx(colW,scale), mmToPx(colDepth,scale));
  // right column at interasse + left col width
  ctx.fillRect(mmToPx(colW + MODEL.interasse,scale), 0, mmToPx(colW,scale), mmToPx(colDepth,scale));

  // draw interasse line
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(mmToPx(colW,scale), mmToPx(colDepth/2,scale));
  ctx.lineTo(mmToPx(colW + MODEL.interasse,scale), mmToPx(colDepth/2,scale));
  ctx.stroke();

  // arms (min/max as rays from inner corners)
  function arm(x, y, angleDeg, length, color){
    const a = angleDeg*Math.PI/180;
    const x2 = x + mmToPx(length*Math.cos(a),scale);
    const y2 = y + mmToPx(length*Math.sin(a),scale);
    ctx.strokeStyle = color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x2,y2); ctx.stroke();
  }
  // approximate inner pivot points
  const leftPivot = [mmToPx(colW,scale), mmToPx(colDepth/2,scale)];
  const rightPivot = [mmToPx(colW + MODEL.interasse,scale), mmToPx(colDepth/2,scale)];

  // draw min/max envelopes (angles illustrative)
  ['#a78bfa','#a78bfa'].forEach((c,i)=>{
    const L = i===0?MODEL.armReachMin:MODEL.armReachMax;
    // four arms around pivot
    arm(leftPivot[0], leftPivot[1], -35, L, c);
    arm(leftPivot[0], leftPivot[1],  35, L, c);
    arm(rightPivot[0], rightPivot[1], 180-35, L, c);
    arm(rightPivot[0], rightPivot[1], 180+35, L, c);
  });

  // dimension texts
  ctx.fillStyle = '#e5e7eb';
  ctx.font = '12px system-ui';
  ctx.fillText(`Interasse ${MODEL.interasse} mm`, mmToPx(colW + MODEL.interasse/2 - 120, scale), mmToPx(colDepth/2 - 12, scale));
  ctx.fillText(`Larghezza totale ${MODEL.widthTotal} mm`, mmToPx(colW/2, scale), mmToPx(colDepth + 18, scale));

  ctx.restore();

  // border
  ctx.strokeStyle = '#334155'; ctx.lineWidth = 2;
  ctx.strokeRect(0,0,canvas.width,canvas.height);
}

function checkBasic(){
  const mass = +document.getElementById('mass').value;
  const clearance = +document.getElementById('clearance').value;
  const freeH = +document.getElementById('freeHeight').value;
  const slab = +document.getElementById('slab').value;
  const variant = document.getElementById('variant').value;
  const vehH = +document.getElementById('vehHeight').value;
  const desiredLift = +document.getElementById('desiredLift').value;
  const out = [];

  // Sotto-traversa
  if(freeH){ out.push(`ℹ️ H sotto traversa: ${freeH} mm (confermato).`); }
  if(vehH && desiredLift){
    const needed = vehH + desiredLift + 50; // 50mm margine
    out.push(`↳ Ingombro tetto sollevato: veicolo ${vehH} + lift ${desiredLift} + margine 50 = ${needed} mm`);
    if(freeH && freeH >= needed){
      out.push('✅ Clearance sotto traversa OK.');
    } else if(freeH){
      out.push('❌ Clearance insufficiente sotto traversa alla quota desiderata. Riduci il sollevamento o verifica altezze.');
    }
  }

  if(mass <= MODEL.capacityKg){
    out.push(`✅ Portata OK (${mass} ≤ ${MODEL.capacityKg} kg)`);
  } else {
    out.push(`❌ Portata superata (${mass} > ${MODEL.capacityKg} kg)`);
  }
  if(clearance >= MODEL.liftHmin){
    out.push(`✅ Altezza minima punti di presa OK (≥ ${MODEL.liftHmin} mm)`);
  } else {
    out.push(`⚠️ Altezza minima bassa: considera prolunghe/tamponi.`);
  }
  const slabMin = variant.includes("Senza") ? 180 : 160;
  out.push(slab >= slabMin
    ? `✅ Pavimento OK per "${variant}" (≥ ${slabMin} mm)`
    : `⚠️ Pavimento sottile (${slab} mm): valuta plinti/platea o variante con basamento.`
  );

  document.getElementById('out').textContent = out.join('\\n');
}

function exportPNG(){
  const canvas = document.getElementById('plan');
  const link = document.createElement('a');
  link.download = `C35S_pianta_${Date.now()}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

document.getElementById('draw').addEventListener('click', drawPlan);
document.getElementById('exportPNG').addEventListener('click', exportPNG);
document.getElementById('check').addEventListener('click', checkBasic);

// initial draw
drawPlan();

// PWA
if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js'); }
