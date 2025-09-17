(function(){
  const constraintsDiv = document.getElementById('constraints');
  const addBtn = document.getElementById('addC');
  const clearBtn = document.getElementById('clearC');
  const solveBtn = document.getElementById('solve');
  const senseEl = document.getElementById('sense');
  const c1El = document.getElementById('c1');
  const c2El = document.getElementById('c2');
  const nonnegEl = document.getElementById('nonneg');
  const canvas = document.getElementById('plot');
  const ctx = canvas.getContext('2d');
  const tableBody = document.querySelector('#table tbody');
  const resultEl = document.getElementById('result');
  const statusEl = document.getElementById('status');
  const warnEl = document.getElementById('warn');
  const toggleViewBtn = document.getElementById('toggle-view');
  const toggleFormBtn = document.getElementById('toggle-form');
  const graphicSection = document.getElementById('graphic-section');
  const panelSection = document.getElementById('panel');

  function constraintRow(a1=1,a2=1,op='<=',b=10){
    const wrap = document.createElement('div');
    wrap.className = 'constraint';
    wrap.innerHTML = `
      <input type="number" step="any" value="${a1}" title="a1 (coef x1)" />
      <span class="mini">x₁+</span>
      <input type="number" step="any" value="${a2}" title="a2 (coef x2)" />
       <span class="mini">x₂</span>
      <select title="operador">
        <option value="<=" ${op==='<='?'selected':''}>≤</option>
        <option value=">=" ${op==='>='?'selected':''}>≥</option>
        <option value="=" ${op==='='?'selected':''}>=</option>
      </select>
      <input type="number" step="any" value="${b}" title="lado derecho (b)" />
      <button class="danger" title="Eliminar">×</button>
    `;
    const del = wrap.querySelector('button');
    del.addEventListener('click', ()=> wrap.remove());
    constraintsDiv.appendChild(wrap);
  }

  // Seed con 3 restricciones típicas
  constraintRow(1,1,'<=',12);
  constraintRow(1,0.5,'<=',8);
  constraintRow(0,1,'<=',7);

  addBtn.onclick = ()=> constraintRow(1,1,'<=',10);
  clearBtn.onclick = ()=> {constraintsDiv.innerHTML='';}

  if (toggleViewBtn && toggleFormBtn) {
    toggleViewBtn.addEventListener('click', function() {
      panelSection.style.display = 'none';
      graphicSection.classList.add('active');
    });
    
    toggleFormBtn.addEventListener('click', function() {
      graphicSection.classList.remove('active');
      panelSection.style.display = 'block';
      panelSection.scrollIntoView({ behavior: 'smooth' });
    });
  }

  function readConstraints(){
    const rows = [...constraintsDiv.querySelectorAll('.constraint')];
    return rows.map(r=>{
      const [a1El, a2El, opEl, bEl] = r.querySelectorAll('input, select');
      return {
        a1: parseFloat(a1El?.value || '0'),
        a2: parseFloat(a2El?.value || '0'),
        op: opEl?.value || '<=',
        b: parseFloat(bEl?.value || '0')
      };
    }).filter(c=> Number.isFinite(c.a1) && Number.isFinite(c.a2) && Number.isFinite(c.b));
  }

  function nearly(a,b,eps=1e-8){ return Math.abs(a-b) <= eps; }

  function solveSystem(a1,a2,b1,c1,c2,b2){
    const det = a1*c2 - a2*c1;
    if (Math.abs(det) < 1e-10) return null;
    const x = (b1*c2 - a2*b2)/det;
    const y = (a1*b2 - b1*c1)/det;
    return {x,y};
  }

  function feasible(point, cons, nonneg){
    const {x,y} = point;
    for(const c of cons){
      const lhs = c.a1*x + c.a2*y;
      if(c.op==='<='){ if(lhs - c.b > 1e-7) return false; }
      else if(c.op==='>='){ if(c.b - lhs > 1e-7) return false; }
      else { if(Math.abs(lhs - c.b) > 1e-7) return false; }
    }
    if(nonneg){ if(x < -1e-7 || y < -1e-7) return false; }
    return Number.isFinite(x) && Number.isFinite(y);
  }

  function uniquePoints(points){
    const seen = new Set();
    const res = [];
    for(const p of points){
      const key = `${Math.round(p.x*1e8)}_${Math.round(p.y*1e8)}`;
      if(!seen.has(key)) { seen.add(key); res.push(p); }
    }
    return res;
  }

  function computeVertices(cons, nonneg){
    const lines = cons.map(c=>({a1:c.a1, a2:c.a2, b:c.b}));
    if(nonneg){
      lines.push({a1:1,a2:0,b:0}); // x=0
      lines.push({a1:0,a2:1,b:0}); // y=0
    }
    const candidates = [];
    
    for(let i=0;i<lines.length;i++){
      for(let j=i+1;j<lines.length;j++){
        const p = solveSystem(lines[i].a1,lines[i].a2,lines[i].b, lines[j].a1,lines[j].a2,lines[j].b);
        if(p && Number.isFinite(p.x) && Number.isFinite(p.y)) candidates.push(p);
      }
    }

    candidates.push({x:0,y:0});
    const uniq = uniquePoints(candidates);
    return uniq.filter(pt=>feasible(pt,cons,nonneg));
  }

  function evaluateZ(pt,c1,c2){ return c1*pt.x + c2*pt.y; }

  function autoBounds(points){
    let xmin=0, xmax=10, ymin=0, ymax=10;
    if(points.length){
      xmin = Math.min(0, ...points.map(p=>p.x));
      xmax = Math.max(1, ...points.map(p=>p.x));
      ymin = Math.min(0, ...points.map(p=>p.y));
      ymax = Math.max(1, ...points.map(p=>p.y));
    }
  
    const padX = (xmax - xmin) * 0.15 || 1;
    const padY = (ymax - ymin) * 0.15 || 1;
    return { xmin: xmin - padX, xmax: xmax + padX, ymin: ymin - padY, ymax: ymax + padY };
  }

  function worldToCanvas(wx,wy,b){
    const {xmin,xmax,ymin,ymax} = b;
    const x = (wx - xmin)/(xmax - xmin) * canvas.width;
    const y = canvas.height - ( (wy - ymin)/(ymax - ymin) * canvas.height );
    return {x,y};
  }

  // Función mejorada para dibujar líneas de restricción
  function drawConstraintLine(a1, a2, b, bounds, op) {
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    
    // Caso especial: línea vertical (a2 = 0)
    if (Math.abs(a2) < 1e-10) {
      const x = b / a1;
      if (x >= bounds.xmin && x <= bounds.xmax) {
        const p1 = worldToCanvas(x, bounds.ymin, bounds);
        const p2 = worldToCanvas(x, bounds.ymax, bounds);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        
        // Añadir flecha para indicar dirección de la desigualdad
        if (op === '<=') {
          drawArrow(p2.x, p2.y, 0, -1, '#0ea5e9');
        } else if (op === '>=') {
          drawArrow(p1.x, p1.y, 0, 1, '#0ea5e9');
        }
      }
      return;
    }
    
    // Caso especial: línea horizontal (a1 = 0)
    if (Math.abs(a1) < 1e-10) {
      const y = b / a2;
      if (y >= bounds.ymin && y <= bounds.ymax) {
        const p1 = worldToCanvas(bounds.xmin, y, bounds);
        const p2 = worldToCanvas(bounds.xmax, y, bounds);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        
        // Añadir flecha para indicar dirección de la desigualdad
        if (op === '<=') {
          drawArrow(p2.x, p2.y, -1, 0, '#0ea5e9');
        } else if (op === '>=') {
          drawArrow(p1.x, p1.y, 1, 0, '#0ea5e9');
        }
      }
      return;
    }
    
    // Línea general: a1*x + a2*y = b
    // Encontrar intersecciones con los bordes del área visible
    const intersections = [];
    
    // Intersección con borde izquierdo (x = bounds.xmin)
    const yLeft = (b - a1 * bounds.xmin) / a2;
    if (yLeft >= bounds.ymin && yLeft <= bounds.ymax) {
      intersections.push({x: bounds.xmin, y: yLeft});
    }
    
    // Intersección con borde derecho (x = bounds.xmax)
    const yRight = (b - a1 * bounds.xmax) / a2;
    if (yRight >= bounds.ymin && yRight <= bounds.ymax) {
      intersections.push({x: bounds.xmax, y: yRight});
    }
    
    // Intersección con borde inferior (y = bounds.ymin)
    const xBottom = (b - a2 * bounds.ymin) / a1;
    if (xBottom >= bounds.xmin && xBottom <= bounds.xmax) {
      intersections.push({x: xBottom, y: bounds.ymin});
    }
    
    // Intersección con borde superior (y = bounds.ymax)
    const xTop = (b - a2 * bounds.ymax) / a1;
    if (xTop >= bounds.xmin && xTop <= bounds.xmax) {
      intersections.push({x: xTop, y: bounds.ymax});
    }
    
    // Eliminar duplicados (puntos que están en las esquinas)
    const uniqueIntersections = [];
    const seen = new Set();
    
    for (const point of intersections) {
      const key = `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueIntersections.push(point);
      }
    }
    
    // Dibujar la línea si tenemos al menos 2 puntos
    if (uniqueIntersections.length >= 2) {
      // Ordenar puntos por coordenada x para dibujar consistentemente
      uniqueIntersections.sort((a, b) => a.x - b.x);
      
      const p1 = worldToCanvas(uniqueIntersections[0].x, uniqueIntersections[0].y, bounds);
      const p2 = worldToCanvas(uniqueIntersections[1].x, uniqueIntersections[1].y, bounds);
      
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      
      // Añadir flecha para indicar dirección de la desigualdad
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const dirX = dx / length;
      const dirY = dy / length;
      
      if (op === '<=') {
        drawArrow(p2.x, p2.y, -dirX, -dirY, '#0ea5e9');
      } else if (op === '>=') {
        drawArrow(p1.x, p1.y, dirX, dirY, '#0ea5e9');
      }
    }
  }
  
  // Función para dibujar flechas
  function drawArrow(x, y, dx, dy, color) {
    const arrowLength = 10;
    const arrowWidth = 6;
    
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.moveTo(0, 0);
    ctx.lineTo(-arrowLength, arrowWidth / 2);
    ctx.lineTo(-arrowLength, -arrowWidth / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Función mejorada para dibujar ejes
  function drawAxes(bounds) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#334155';
    ctx.fillStyle = '#475569';
    ctx.font = '12px ui-sans-serif';
    
    // Calcular incrementos apropiados para las marcas de los ejes
    const xRange = bounds.xmax - bounds.xmin;
    const yRange = bounds.ymax - bounds.ymin;
    
    const xIncrement = calculateIncrement(xRange);
    const yIncrement = calculateIncrement(yRange);
    
    // Dibujar líneas de la grilla
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    
    // Líneas verticales
    for (let x = Math.floor(bounds.xmin / xIncrement) * xIncrement; x <= bounds.xmax; x += xIncrement) {
      if (Math.abs(x) < 1e-10) continue; // Saltar el eje Y (se dibujará después)
      const p1 = worldToCanvas(x, bounds.ymin, bounds);
      const p2 = worldToCanvas(x, bounds.ymax, bounds);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    
    // Líneas horizontales
    for (let y = Math.floor(bounds.ymin / yIncrement) * yIncrement; y <= bounds.ymax; y += yIncrement) {
      if (Math.abs(y) < 1e-10) continue; // Saltar el eje X (se dibujará después)
      const p1 = worldToCanvas(bounds.xmin, y, bounds);
      const p2 = worldToCanvas(bounds.xmax, y, bounds);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    
    ctx.stroke();
    
    // Dibujar ejes X e Y
    ctx.beginPath();
    ctx.strokeStyle = '#64748b';
    
    // Eje X
    const xAxisY = worldToCanvas(0, 0, bounds).y;
    if (xAxisY >= 0 && xAxisY <= canvas.height) {
      ctx.moveTo(0, xAxisY);
      ctx.lineTo(canvas.width, xAxisY);
    }
    
    // Eje Y
    const yAxisX = worldToCanvas(0, 0, bounds).x;
    if (yAxisX >= 0 && yAxisX <= canvas.width) {
      ctx.moveTo(yAxisX, 0);
      ctx.lineTo(yAxisX, canvas.height);
    }
    
    ctx.stroke();
    
    // Etiquetas de los ejes
    ctx.fillStyle = '#93a3b8';
    
    // Etiquetas del eje X
    for (let x = Math.floor(bounds.xmin / xIncrement) * xIncrement; x <= bounds.xmax; x += xIncrement) {
      if (Math.abs(x) < 1e-10) continue;
      const p = worldToCanvas(x, 0, bounds);
      if (p.x >= 0 && p.x <= canvas.width && p.y >= 0 && p.y <= canvas.height) {
        ctx.fillText(x.toFixed(xIncrement < 1 ? 1 : 0), p.x - 10, p.y + 15);
      }
    }
    
    // Etiquetas del eje Y
    for (let y = Math.floor(bounds.ymin / yIncrement) * yIncrement; y <= bounds.ymax; y += yIncrement) {
      if (Math.abs(y) < 1e-10) continue;
      const p = worldToCanvas(0, y, bounds);
      if (p.x >= 0 && p.x <= canvas.width && p.y >= 0 && p.y <= canvas.height) {
        ctx.fillText(y.toFixed(yIncrement < 1 ? 1 : 0), p.x + 5, p.y + 5);
      }
    }
    
    // Origen
    const origin = worldToCanvas(0, 0, bounds);
    if (origin.x >= 0 && origin.x <= canvas.width && origin.y >= 0 && origin.y <= canvas.height) {
      ctx.fillText('0', origin.x - 12, origin.y + 15);
    }
  }
  
  // Función auxiliar para calcular incrementos apropiados para los ejes
  function calculateIncrement(range) {
    const magnitude = Math.pow(10, Math.floor(Math.log10(range)));
    if (range / magnitude >= 5) return magnitude;
    if (range / magnitude >= 2) return magnitude / 2;
    return magnitude / 5;
  }

  function shadeFeasible(bounds, cons, nonneg){
    const step = 8; 
    ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
    for(let py=0; py<canvas.height; py+=step){
      for(let px=0; px<canvas.width; px+=step){
        const wx = bounds.xmin + (px/canvas.width)*(bounds.xmax - bounds.xmin);
        const wy = bounds.ymin + ((canvas.height - py)/canvas.height)*(bounds.ymax - bounds.ymin);
        if(feasible({x:wx,y:wy}, cons, nonneg)){
          ctx.fillRect(px-1, py-1, 2, 2);
        }
      }
    }
  }

  function drawOptimalLine(c1,c2,zVal, bounds){
    if(!Number.isFinite(zVal)) return;
    drawConstraintLine(c1,c2,zVal,bounds);
  }

  function run(){
    const c1 = parseFloat(c1El.value||'0');
    const c2 = parseFloat(c2El.value||'0');
    const sense = senseEl.value; 
    const nonneg = nonnegEl.checked;
    const cons = readConstraints();

    statusEl.innerHTML = `<span class="mini">c₁=${c1}, c₂=${c2} | ${cons.length} restricciones | ${nonneg? 'con':'sin'} no negatividad</span>`;

    const vertices = computeVertices(cons, nonneg);

    const allLines = cons.map(c=>({a1:c.a1,a2:c.a2,b:c.b}));
    if(nonneg){ allLines.push({a1:1,a2:0,b:0}); allLines.push({a1:0,a2:1,b:0}); }
    const allPts=[];
    for(let i=0;i<allLines.length;i++)for(let j=i+1;j<allLines.length;j++){
      const p=solveSystem(allLines[i].a1,allLines[i].a2,allLines[i].b, allLines[j].a1,allLines[j].a2,allLines[j].b);
      if(p) allPts.push(p);
    }
    const bounds = autoBounds(allPts.concat(vertices));

    drawAxes(bounds);

    shadeFeasible(bounds, cons, nonneg);

    for(const c of cons){ 
      drawConstraintLine(c.a1, c.a2, c.b, bounds, c.op); 
    }

    const rows = vertices.map((v,i)=>({ i:i+1, x:v.x, y:v.y, z:evaluateZ(v,c1,c2) }));
    const sorted = rows.sort((a,b)=> sense==='max'? b.z - a.z : a.z - b.z);

    tableBody.innerHTML = '';
    sorted.forEach((r,idx)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${idx+1}</td><td>${r.x.toFixed(2)}</td><td>${r.y.toFixed(2)}</td><td>${r.z.toFixed(2)}</td>`;
      tableBody.appendChild(tr);
    });

    warnEl.style.display = 'none';
    if(vertices.length===0){
      resultEl.className = 'pill';
      resultEl.textContent = 'Problema INFACTIBLE (no hay región común a todas las restricciones).';
      warnEl.style.display = 'block';
      warnEl.textContent = 'Tip: revisá signos/operadores o añadí x₁≥0, x₂≥0.';
      return;
    }

    const best = sorted[0];
    resultEl.className = 'pill';
    resultEl.textContent = `${sense==='max'?'Máximo':'Mínimo'} en (x₁, x₂) = (${best.x.toFixed(2)}, ${best.y.toFixed(2)}),  Z* = ${best.z.toFixed(2)}`;

    const pOpt = worldToCanvas(best.x, best.y, bounds);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(pOpt.x, pOpt.y, 5, 0, Math.PI*2);
    ctx.fill();

    drawConstraintLine(c1,c2,best.z,bounds, '=');

    const norm = Math.hypot(c1,c2) || 1;
    const dx = c1/norm, dy = c2/norm;
    let leOK=true, geOK=true;
    for(const c of cons){
      const ad = c.a1*dx + c.a2*dy;
      if(c.op==='<=') { if(ad>1e-9) leOK=false; }
      if(c.op==='>=') { if(ad<-1e-9) geOK=false; }
    }
    if(sense==='max' && leOK && geOK){
      warnEl.style.display='block';
      warnEl.textContent = 'Aviso: La región podría ser no acotada en la dirección de maximización; Z podría crecer indefinidamente. Verificá restricciones.';
    }
    if(sense==='min' && leOK && geOK){
      warnEl.style.display='block';
      warnEl.textContent = 'Aviso: La región podría ser no acotada en la dirección de minimización; Z podría disminuir sin cota inferior. Verificá restricciones.';
    }
    
    // En móviles, mostrar la sección de gráficos después de resolver
    if (window.innerWidth <= 768) {
      panelSection.style.display = 'none';
      graphicSection.classList.add('active');
      
      // Hacer scroll hasta los resultados
      graphicSection.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // Funcionalidad para mostrar/ocultar la sección de integrantes
  document.addEventListener('DOMContentLoaded', function() {
    const integrantesLink = document.getElementById('integrantes-link');
    const integrantesSection = document.getElementById('integrantes-section');
    const overlay = document.getElementById('overlay');
    const closeButton = document.getElementById('close-integrantes');
    
    integrantesLink.addEventListener('click', function(e) {
      e.preventDefault();
      integrantesSection.style.display = 'block';
      overlay.style.display = 'block';
      document.body.style.overflow = 'hidden';
    });
    
    function closeIntegrantes() {
      integrantesSection.style.display = 'none';
      overlay.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
    
    closeButton.addEventListener('click', closeIntegrantes);
    overlay.addEventListener('click', closeIntegrantes);
    
    // Cerrar con la tecla Escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeIntegrantes();
      }
    });
    
    // Funcionalidad para vista móvil
    const toggleViewBtn = document.getElementById('toggle-view');
    const toggleFormBtn = document.getElementById('toggle-form');
    const graphicSection = document.getElementById('graphic-section');
    const panelSection = document.getElementById('panel');
    
    if (toggleViewBtn && toggleFormBtn) {
      toggleViewBtn.addEventListener('click', function() {
        panelSection.style.display = 'none';
        graphicSection.classList.add('active');
      });
      
      toggleFormBtn.addEventListener('click', function() {
        graphicSection.classList.remove('active');
        panelSection.style.display = 'block';
      });
    }
  });
  
  solveBtn.onclick = run;
})();