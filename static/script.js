let charts = {};

// --- MAIN TAB SWITCHING ---
function switchTab(tabId) {
    // Hide all workspaces
    document.querySelectorAll('.workspace').forEach(el => {
        el.classList.remove('active-workspace');
    });
    
    // Deactivate all nav items
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
    });

    // Activate target workspace
    const target = document.getElementById(tabId + '-tab');
    if (target) {
        target.classList.add('active-workspace');
    }
    
    // Activate nav button
    const buttons = document.querySelectorAll('.nav-item');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(`'${tabId}'`)) {
            btn.classList.add('active');
        }
    });

    // Redraw canvases and resize charts
    setTimeout(() => {
        if (tabId === 'beam') {
            drawBeam();
            Object.values(charts).forEach(c => c.resize());
        }
        if (tabId === 'pillar') drawPillar();
        if (tabId === 'frame') drawFrame();
    }, 50);
}


// === BEAM LOGIC ===
// Debounce helper to avoid too many API calls
let beamCalcTimeout = null;
let pillarCalcTimeout = null;
let frameCalcTimeout = null;

function debounceBeamCalc() {
    drawBeam();
    clearTimeout(beamCalcTimeout);
    beamCalcTimeout = setTimeout(calculate, 300);
}

function debouncePillarCalc() {
    drawPillar();
    clearTimeout(pillarCalcTimeout);
    pillarCalcTimeout = setTimeout(calculatePillar, 300);
}

function debounceFrameCalc() {
    drawFrame();
    clearTimeout(frameCalcTimeout);
    frameCalcTimeout = setTimeout(calculateFrame, 300);
}

function addSupport() {
    const div = document.createElement('div');
    div.className = 'item-row';
    div.innerHTML = `
        <select class="support-type">
            <option value="pin">Pin</option>
            <option value="roller">Roller</option>
            <option value="fixed">Fixed</option>
        </select>
        <input type="number" class="support-pos" placeholder="m" value="0" step="0.1">
        <button class="remove-btn" onclick="this.parentElement.remove(); debounceBeamCalc();"><i class="fa-solid fa-xmark"></i></button>
    `;
    document.getElementById('supportsList').appendChild(div);
    div.querySelectorAll('input').forEach(el => el.addEventListener('input', debounceBeamCalc));
    div.querySelectorAll('select').forEach(el => el.addEventListener('change', debounceBeamCalc));
    debounceBeamCalc(); // Trigger immediate update
}

function addLoad() {
    const div = document.createElement('div');
    div.className = 'item-row';
    div.innerHTML = `
        <input type="number" class="load-mag" placeholder="kN" value="-10" step="0.1">
        <input type="number" class="load-pos" placeholder="m" value="5" step="0.1">
        <button class="remove-btn" onclick="this.parentElement.remove(); debounceBeamCalc();"><i class="fa-solid fa-xmark"></i></button>
    `;
    document.getElementById('loadsList').appendChild(div);
    div.querySelectorAll('input').forEach(el => el.addEventListener('input', debounceBeamCalc));
    debounceBeamCalc(); // Trigger immediate update
}

function addDistLoad() {
    const div = document.createElement('div');
    div.className = 'item-row';
    div.innerHTML = `
        <input type="number" class="dist-mag" placeholder="kN/m" value="-5" step="0.1">
        <input type="number" class="dist-start" placeholder="Start" value="0" step="0.1">
        <input type="number" class="dist-end" placeholder="End" value="5" step="0.1">
        <button class="remove-btn" onclick="this.parentElement.remove(); debounceBeamCalc();"><i class="fa-solid fa-xmark"></i></button>
    `;
    document.getElementById('distLoadsList').appendChild(div);
    div.querySelectorAll('input').forEach(el => el.addEventListener('input', debounceBeamCalc));
    debounceBeamCalc(); // Trigger immediate update
}

function init() {
    // Beam Init
    addSupport(); 
    const s1 = document.querySelector('#supportsList .item-row:last-child');
    if(s1) {
        s1.querySelector('.support-pos').value = 0;
        s1.querySelector('.support-type').value = 'pin';
    }
    
    addSupport(); 
    const s2 = document.querySelector('#supportsList .item-row:last-child');
    if(s2) {
        s2.querySelector('.support-pos').value = 10;
        s2.querySelector('.support-type').value = 'roller';
    }

    addLoad();
    const l1 = document.querySelector('#loadsList .item-row:last-child');
    if(l1) l1.querySelector('.load-pos').value = 5;
    
    // Frame Init (Default Simple Frame)
    addFrameNode(1, 0, 0);
    addFrameNode(2, 0, 5);
    addFrameNode(3, 5, 5);
    addFrameNode(4, 5, 0);
    
    addFrameElem(1, 1, 2);
    addFrameElem(2, 2, 3);
    addFrameElem(3, 3, 4);
    
    addFrameSupport(1, 'fixed');
    addFrameSupport(4, 'fixed');
    
    addFrameLoad(2, 10, 0, 0); // 10 kN horizontal load

    // Add listeners to beam property inputs (use 'input' for real-time updates)
    document.getElementById('beamLength').addEventListener('input', debounceBeamCalc);
    document.getElementById('beamE').addEventListener('input', debounceBeamCalc);
    document.getElementById('beamI').addEventListener('input', debounceBeamCalc);
    
    // Add listeners to pillar inputs
    document.getElementById('pillarL').addEventListener('input', debouncePillarCalc);
    document.getElementById('pillarE').addEventListener('input', debouncePillarCalc);
    document.getElementById('pillarI').addEventListener('input', debouncePillarCalc);
    document.getElementById('pillarA').addEventListener('input', debouncePillarCalc);
    document.getElementById('pillarP').addEventListener('input', debouncePillarCalc);
    document.getElementById('pillarK').addEventListener('change', debouncePillarCalc);

    // Initial draws and calculations
    setTimeout(() => {
        drawBeam();
        drawPillar();
        drawFrame();
        // Run initial calculations
        calculate();
        calculatePillar();
        calculateFrame();
    }, 300);
    
    window.addEventListener('resize', () => {
        drawBeam();
        drawPillar();
        drawFrame();
        Object.values(charts).forEach(c => c.resize());
    });
}

async function calculate() {
    const length = parseFloat(document.getElementById('beamLength').value);
    const E = parseFloat(document.getElementById('beamE').value) * 1e9; // Convert GPa to Pa
    const I = parseFloat(document.getElementById('beamI').value);

    const supports = [];
    document.querySelectorAll('#supportsList .item-row').forEach(row => {
        supports.push({
            type: row.querySelector('.support-type').value,
            pos: parseFloat(row.querySelector('.support-pos').value)
        });
    });

    const loads = [];
    document.querySelectorAll('#loadsList .item-row').forEach(row => {
        loads.push({
            magnitude: parseFloat(row.querySelector('.load-mag').value) * 1000, // Convert kN to N
            pos: parseFloat(row.querySelector('.load-pos').value)
        });
    });

    const distLoads = [];
    document.querySelectorAll('#distLoadsList .item-row').forEach(row => {
        distLoads.push({
            magnitude: parseFloat(row.querySelector('.dist-mag').value) * 1000, // Convert kN/m to N/m
            start: parseFloat(row.querySelector('.dist-start').value),
            end: parseFloat(row.querySelector('.dist-end').value)
        });
    });

    const payload = { length, E, I, supports, loads, dist_loads: distLoads };

    try {
        const response = await fetch('/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            displayReactions(result.data.reactions);
            renderCharts(result.data);
            drawBeam(); 
        }
    } catch (e) {
        console.error(e);
    }
}

function displayReactions(reactions) {
    const tbody = document.querySelector('#reactionsTable tbody');
    tbody.innerHTML = '';
    reactions.forEach(r => {
        const row = `<tr>
            <td>${r.pos}</td>
            <td>${r.type}</td>
            <td>${(r.Fy / 1000).toFixed(2)}</td>
            <td>${(r.Mz / 1000).toFixed(2)}</td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

function renderCharts(data) {
    const shearColor = '#ef4444';
    const shearFill = 'rgba(239, 68, 68, 0.1)';
    const momentColor = '#3b82f6';
    const momentFill = 'rgba(59, 130, 246, 0.1)';
    const deflectionColor = '#10b981';
    const deflectionFill = 'rgba(16, 185, 129, 0.1)';

    // Convert N to kN and N·m to kN·m for display
    const shearKN = data.shear.map(v => v / 1000);
    const momentKNm = data.moment.map(v => v / 1000);
    // Convert m to mm for deflection
    const deflectionMM = data.deflection.map(v => v * 1000);

    createChart('shearChart', 'Shear (kN)', data.x, shearKN, shearColor, shearFill);
    createChart('momentChart', 'Moment (kN·m)', data.x, momentKNm, momentColor, momentFill);
    createChart('deflectionChart', 'Deflection (mm)', data.x, deflectionMM, deflectionColor, deflectionFill);
}

function createChart(canvasId, label, labels, dataPoints, color, fillColor) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (charts[canvasId]) charts[canvasId].destroy();

    charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(v => v.toFixed(1)),
            datasets: [{
                label: label,
                data: dataPoints,
                borderColor: color,
                backgroundColor: fillColor,
                fill: 'origin',
                tension: 0.1,
                pointRadius: 0,
                borderWidth: 1.5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: { 
                    enabled: true,
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    titleColor: '#f8fafc',
                    bodyColor: '#f8fafc',
                    padding: 8,
                    cornerRadius: 4,
                    titleFont: { size: 10 },
                    bodyFont: { size: 10 }
                }
            },
            scales: { 
                x: { 
                    display: true,
                    ticks: { font: { size: 9 }, maxTicksLimit: 6 },
                    grid: { color: '#f1f5f9' }
                },
                y: {
                    display: true,
                    ticks: { font: { size: 9 }, maxTicksLimit: 5 },
                    grid: { color: '#f1f5f9' }
                }
            }
        }
    });
}

function drawBeam() {
    const canvas = document.getElementById('beamCanvas');
    if (!canvas || canvas.offsetParent === null) return;
    
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    canvas.width = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);
    
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    
    const length = parseFloat(document.getElementById('beamLength').value) || 10;
    const padding = 30;
    const beamY = H / 2;
    const beamLengthPx = W - 2 * padding;
    const scale = beamLengthPx / length;
    
    function toPx(m) { return padding + m * scale; }
    
    // Grid lines
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0; i<=length; i++) {
        const x = toPx(i);
        if (x <= W) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
        }
    }
    ctx.stroke();

    // Beam
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(padding, beamY);
    ctx.lineTo(W - padding, beamY);
    ctx.stroke();
    
    // Supports
    document.querySelectorAll('#supportsList .item-row').forEach(row => {
        const pos = parseFloat(row.querySelector('.support-pos').value);
        const type = row.querySelector('.support-type').value;
        const x = toPx(pos);
        if (x < -100 || x > W + 100) return;

        ctx.fillStyle = '#2563eb';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        
        const triSize = 10;
        const yBase = beamY + 3;

        if (type === 'pin' || type === 'roller') {
            ctx.moveTo(x, yBase);
            ctx.lineTo(x - triSize, yBase + triSize*1.4);
            ctx.lineTo(x + triSize, yBase + triSize*1.4);
            ctx.closePath();
            ctx.stroke();
            if (type === 'pin') ctx.fill();
            
            if (type === 'roller') {
                const r = 4, yC = yBase + triSize*1.4 + r;
                ctx.beginPath(); ctx.arc(x - triSize + r, yC, r, 0, 2*Math.PI); ctx.stroke();
                ctx.beginPath(); ctx.arc(x + triSize - r, yC, r, 0, 2*Math.PI); ctx.stroke();
            } else {
                const yG = yBase + triSize*1.4;
                ctx.beginPath(); ctx.moveTo(x - triSize - 3, yG); ctx.lineTo(x + triSize + 3, yG); ctx.stroke();
            }
        } else if (type === 'fixed') {
            const h = 35;
            ctx.beginPath(); ctx.moveTo(x, beamY - h/2); ctx.lineTo(x, beamY + h/2); ctx.stroke();
            const hatchDir = (x < W/2) ? -1 : 1;
            for (let i = -h/2; i < h/2; i += 6) {
                ctx.beginPath(); ctx.moveTo(x, beamY + i); ctx.lineTo(x + hatchDir * 6, beamY + i + 6); ctx.stroke();
            }
        }
    });
    
    // Loads
    document.querySelectorAll('#loadsList .item-row').forEach(row => {
        const mag = parseFloat(row.querySelector('.load-mag').value); // Already in kN
        const pos = parseFloat(row.querySelector('.load-pos').value);
        const x = toPx(pos);
        if (x < -100 || x > W + 100) return;

        ctx.strokeStyle = '#ef4444'; ctx.fillStyle = '#ef4444'; ctx.lineWidth = 2;
        const arrowLen = 35, dir = mag < 0 ? 1 : -1;
        const yStart = beamY - dir * 4;
        const yEnd = beamY - dir * (arrowLen + 4);
        
        ctx.beginPath(); ctx.moveTo(x, yStart); ctx.lineTo(x, yEnd); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, yStart); ctx.lineTo(x - 4, yStart - dir * 8); ctx.lineTo(x + 4, yStart - dir * 8); ctx.closePath(); ctx.fill();
        
        ctx.font = 'bold 9px Inter'; ctx.textAlign = 'center';
        ctx.fillText(`${Math.abs(mag)} kN`, x, yEnd - dir * 8);
    });

    // Distributed Loads
    document.querySelectorAll('#distLoadsList .item-row').forEach(row => {
        const mag = parseFloat(row.querySelector('.dist-mag').value); // Already in kN/m
        const start = parseFloat(row.querySelector('.dist-start').value);
        const end = parseFloat(row.querySelector('.dist-end').value);
        const x1 = toPx(start), x2 = toPx(end);
        const startPx = Math.max(padding, Math.min(W-padding, x1));
        const endPx = Math.max(padding, Math.min(W-padding, x2));
        const w = endPx - startPx;
        if (w <= 0) return;
        
        ctx.fillStyle = 'rgba(239, 68, 68, 0.1)'; ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1;
        const h = 20, yBase = beamY - 4, dir = mag < 0 ? 1 : -1, yTop = yBase - dir * h;
        
        ctx.beginPath(); ctx.rect(startPx, Math.min(yBase, yTop), w, Math.abs(yBase - yTop)); ctx.fill(); ctx.stroke();
        
        const numArrows = Math.max(2, Math.floor(w / 12));
        ctx.strokeStyle = '#ef4444'; ctx.fillStyle = '#ef4444';
        if (w > 10) {
             for (let i = 0; i <= numArrows; i++) {
                const ax = startPx + i * (w / numArrows);
                ctx.beginPath(); ctx.moveTo(ax, yTop); ctx.lineTo(ax, yBase); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(ax, yBase); ctx.lineTo(ax - 2, yBase - dir * 4); ctx.lineTo(ax + 2, yBase - dir * 4); ctx.fill();
            }
        }
        const cx = startPx + w/2;
        if (cx > padding && cx < W - padding) {
             ctx.font = '9px Inter';
             ctx.fillStyle = '#ef4444'; ctx.textAlign = 'center'; ctx.fillText(`${Math.abs(mag)} kN/m`, cx, yTop - dir * 8);
        }
    });
}

// === PILLAR LOGIC ===
async function calculatePillar() {
    const appliedP = parseFloat(document.getElementById('pillarP').value) * 1000; // Convert kN to N
    
    const payload = {
        length: parseFloat(document.getElementById('pillarL').value),
        E: parseFloat(document.getElementById('pillarE').value) * 1e9, // Convert GPa to Pa
        I: parseFloat(document.getElementById('pillarI').value),
        A: parseFloat(document.getElementById('pillarA').value),
        k_type: document.getElementById('pillarK').value
    };

    try {
        const response = await fetch('/calculate_pillar', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.status === 'success') {
            const d = result.data;
            const Pcr = d.P_cr;
            const SF = Pcr / appliedP;
            
            // Format Pcr nicely
            let pcrText = Pcr >= 1e6 ? (Pcr / 1e6).toFixed(2) + ' MN' : 
                          Pcr >= 1e3 ? (Pcr / 1e3).toFixed(2) + ' kN' : 
                          Pcr.toFixed(2) + ' N';
            
            document.getElementById('resPcr').innerText = pcrText;
            document.getElementById('resP').innerText = (appliedP / 1000).toFixed(1) + ' kN';
            
            // Color code safety factor
            const sfEl = document.getElementById('resSF');
            sfEl.innerText = SF.toFixed(2);
            sfEl.style.color = SF >= 3 ? '#10b981' : SF >= 1.5 ? '#f59e0b' : '#ef4444';
            
            // Format sigma nicely
            let sigmaText = d.sigma_cr >= 1e6 ? (d.sigma_cr / 1e6).toFixed(2) + ' MPa' : 
                            d.sigma_cr >= 1e3 ? (d.sigma_cr / 1e3).toFixed(2) + ' kPa' : 
                            d.sigma_cr.toFixed(2) + ' Pa';
            document.getElementById('resSigma').innerText = sigmaText;
            document.getElementById('resLambda').innerText = d.slenderness.toFixed(2);
            drawPillar(d.K);
        }
    } catch (e) {
        console.error(e);
    }
}

function drawPillar(K = 1.0) {
    const canvas = document.getElementById('pillarCanvas');
    if (!canvas || canvas.offsetParent === null) return;
    
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    canvas.width = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);
    
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    
    const pH = H * 0.75;
    const pW = 16;
    const xC = W / 2;
    const yTop = (H - pH) / 2;
    const yBot = yTop + pH;
    
    // Original Pillar
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(xC - pW/2, yTop, pW, pH);
    ctx.setLineDash([]);
    
    // Buckled Shape
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let y = 0; y <= pH; y++) {
        let u = 0;
        const relY = y / pH; 
        
        const type = document.getElementById('pillarK').value;
        
        if (type === 'pin-pin') {
            u = Math.sin(Math.PI * relY);
        } else if (type === 'fixed-free') {
            u = 1 - Math.cos(Math.PI * (1-relY) / 2);
        } else if (type === 'fixed-fixed') {
            u = 0.5 * (1 - Math.cos(2 * Math.PI * relY));
        } else if (type === 'fixed-pin') {
            u = Math.sin(Math.PI * relY) * (1 - relY*0.5);
        }
        
        const deflection = u * 30; 
        ctx.lineTo(xC + deflection, yTop + y);
    }
    ctx.stroke();
    
    // Supports
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(xC - 20, yBot, 40, 5);
    
    if (document.getElementById('pillarK').value !== 'fixed-free') {
        ctx.fillRect(xC - 20, yTop - 5, 40, 5);
        ctx.strokeStyle = '#ef4444'; ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.moveTo(xC, yTop - 25); ctx.lineTo(xC, yTop - 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xC, yTop - 5); ctx.lineTo(xC - 3, yTop - 12); ctx.lineTo(xC + 3, yTop - 12); ctx.fill();
    } else {
        ctx.strokeStyle = '#ef4444'; ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.moveTo(xC + 30, yTop - 25); ctx.lineTo(xC + 30, yTop); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(xC + 30, yTop); ctx.lineTo(xC + 27, yTop - 7); ctx.lineTo(xC + 33, yTop - 7); ctx.fill();
    }
}

// === FRAME LOGIC ===
let frameNodes = [];
let frameElems = [];
let frameSupports = [];
let frameLoads = [];
let frameResults = null;

function addFrameNode(id, x, y) {
    const nextId = id || (frameNodes.length > 0 ? Math.max(...frameNodes.map(n => n.id)) + 1 : 1);
    frameNodes.push({ id: nextId, x: x||0, y: y||0 });
    renderFrameUI();
    debounceFrameCalc();
}

function addFrameElem(id, n1, n2) {
    const nextId = id || (frameElems.length > 0 ? Math.max(...frameElems.map(e => e.id)) + 1 : 1);
    frameElems.push({ id: nextId, n1: n1||1, n2: n2||2, E: 200e9, A: 0.01, I: 0.0001 });
    renderFrameUI();
    debounceFrameCalc();
}

function addFrameSupport(node, type) {
    frameSupports.push({ node: node||1, type: type||'pin' });
    renderFrameUI();
    debounceFrameCalc();
}

function addFrameLoad(node, fx, fy, m) {
    // Store in kN (fx, fy default to kN, m in kN·m)
    frameLoads.push({ node: node||1, fx: fx||0, fy: fy||-10, m: m||0 });
    renderFrameUI();
    debounceFrameCalc();
}

function renderFrameUI() {
    const nList = document.getElementById('frameNodesList');
    nList.innerHTML = '';
    frameNodes.forEach(n => {
        const div = document.createElement('div');
        div.className = 'item-row';
        div.innerHTML = `
            <span style="font-weight:600; font-size:0.7rem; color:#64748b">N${n.id}</span>
            <input type="number" value="${n.x}" oninput="updateNode(${n.id}, 'x', this.value)" placeholder="X">
            <input type="number" value="${n.y}" oninput="updateNode(${n.id}, 'y', this.value)" placeholder="Y">
            <button class="remove-btn" onclick="removeFrameNode(${n.id})"><i class="fa-solid fa-xmark"></i></button>
        `;
        nList.appendChild(div);
    });

    const eList = document.getElementById('frameElemsList');
    eList.innerHTML = '';
    frameElems.forEach(e => {
        const div = document.createElement('div');
        div.className = 'item-row';
        div.innerHTML = `
            <span style="font-weight:600; font-size:0.7rem; color:#64748b">E${e.id}</span>
            <input type="number" value="${e.n1}" placeholder="N1" oninput="updateElem(${e.id}, 'n1', this.value)">
            <input type="number" value="${e.n2}" placeholder="N2" oninput="updateElem(${e.id}, 'n2', this.value)">
            <button class="remove-btn" onclick="removeFrameElem(${e.id})"><i class="fa-solid fa-xmark"></i></button>
        `;
        eList.appendChild(div);
    });
    
    const sList = document.getElementById('frameSupportsList');
    sList.innerHTML = '';
    frameSupports.forEach((s, idx) => {
        const div = document.createElement('div');
        div.className = 'item-row';
        div.innerHTML = `
            <span><i class="fa-solid fa-anchor" style="color:#64748b; font-size:0.65rem"></i></span>
            <input type="number" value="${s.node}" oninput="frameSupports[${idx}].node=parseInt(this.value); debounceFrameCalc()">
            <select onchange="frameSupports[${idx}].type=this.value; debounceFrameCalc()">
                <option value="pin" ${s.type=='pin'?'selected':''}>Pin</option>
                <option value="fixed" ${s.type=='fixed'?'selected':''}>Fixed</option>
                <option value="roller" ${s.type=='roller'?'selected':''}>Roller</option>
            </select>
            <button class="remove-btn" onclick="frameSupports.splice(${idx},1); renderFrameUI(); debounceFrameCalc();"><i class="fa-solid fa-xmark"></i></button>
        `;
        sList.appendChild(div);
    });

    const lList = document.getElementById('frameLoadsList');
    lList.innerHTML = '';
    frameLoads.forEach((l, idx) => {
        const div = document.createElement('div');
        div.className = 'item-row';
        div.innerHTML = `
            <span><i class="fa-solid fa-arrow-down" style="color:#64748b; font-size:0.65rem"></i></span>
            <input type="number" value="${l.node}" oninput="frameLoads[${idx}].node=parseInt(this.value); debounceFrameCalc()">
            <input type="number" value="${l.fx}" placeholder="Fx" oninput="frameLoads[${idx}].fx=parseFloat(this.value); debounceFrameCalc()">
            <input type="number" value="${l.fy}" placeholder="Fy" oninput="frameLoads[${idx}].fy=parseFloat(this.value); debounceFrameCalc()">
            <button class="remove-btn" onclick="frameLoads.splice(${idx},1); renderFrameUI(); debounceFrameCalc();"><i class="fa-solid fa-xmark"></i></button>
        `;
        lList.appendChild(div);
    });
}

function updateNode(id, prop, val) {
    const n = frameNodes.find(x => x.id === id);
    if(n) { n[prop] = parseFloat(val); debounceFrameCalc(); }
}
function updateElem(id, prop, val) {
    const e = frameElems.find(x => x.id === id);
    if(e) { e[prop] = parseInt(val); debounceFrameCalc(); }
}
function removeFrameNode(id) { frameNodes = frameNodes.filter(n => n.id !== id); renderFrameUI(); debounceFrameCalc(); }
function removeFrameElem(id) { frameElems = frameElems.filter(e => e.id !== id); renderFrameUI(); debounceFrameCalc(); }

async function calculateFrame() {
    // Convert loads from kN to N for backend
    const loadsInN = frameLoads.map(l => ({
        node: l.node,
        fx: l.fx * 1000,  // kN to N
        fy: l.fy * 1000,  // kN to N
        m: l.m * 1000     // kN·m to N·m
    }));
    
    const payload = {
        nodes: frameNodes,
        elements: frameElems,
        supports: frameSupports,
        loads: loadsInN
    };
    
    try {
        const response = await fetch('/calculate_frame', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.status === 'success') {
            frameResults = result.data;
            drawFrame(true);
            displayFrameResults(frameResults);
        }
    } catch (e) {
        console.error(e);
    }
}

function displayFrameResults(data) {
    const rBody = document.querySelector('#frameReactions tbody');
    rBody.innerHTML = '';
    data.reactions.forEach(r => {
        // Convert N to kN for display
        rBody.innerHTML += `<tr><td>${r.node}</td><td>${(r.Rx/1000).toFixed(2)}</td><td>${(r.Ry/1000).toFixed(2)}</td><td>${(r.Mz/1000).toFixed(2)}</td></tr>`;
    });
    
    const dBody = document.querySelector('#frameDisplacements tbody');
    dBody.innerHTML = '';
    data.nodes.forEach(n => {
        dBody.innerHTML += `<tr><td>${n.id}</td><td>${n.u.toExponential(2)}</td><td>${n.v.toExponential(2)}</td><td>${n.theta.toExponential(2)}</td></tr>`;
    });
}

function drawFrame(showDeformed = false) {
    const canvas = document.getElementById('frameCanvas');
    if (!canvas || canvas.offsetParent === null) return;
    
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    canvas.width = Math.floor(rect.width);
    canvas.height = Math.floor(rect.height);

    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    
    if (frameNodes.length === 0) return;
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    frameNodes.forEach(n => {
        minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
        minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
    });
    
    if (showDeformed && frameResults) {
        let maxDisp = 0;
        frameResults.nodes.forEach(n => {
            maxDisp = Math.max(maxDisp, Math.abs(n.u), Math.abs(n.v));
        });
        const scaleFac = (maxDisp > 1e-9) ? (Math.max(maxX-minX, maxY-minY) * 0.1) / maxDisp : 1;
        window.frameScaleFac = scaleFac;
    }
    
    const padding = 30;
    const rangeX = Math.max(1, maxX - minX);
    const rangeY = Math.max(1, maxY - minY);
    const scaleX = (W - 2*padding) / rangeX;
    const scaleY = (H - 2*padding) / rangeY;
    const scale = Math.min(scaleX, scaleY);
    
    const midX = (minX + maxX)/2;
    const midY = (minY + maxY)/2;
    
    function toScreen(x, y) {
        return {
            x: W/2 + (x - midX) * scale,
            y: H/2 - (y - midY) * scale 
        };
    }

    // Elements
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    frameElems.forEach(e => {
        const n1 = frameNodes.find(n => n.id === e.n1);
        const n2 = frameNodes.find(n => n.id === e.n2);
        if (n1 && n2) {
            const p1 = toScreen(n1.x, n1.y);
            const p2 = toScreen(n2.x, n2.y);
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
        }
    });
    ctx.stroke();
    
    // Deformed
    if (showDeformed && frameResults) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        const sf = window.frameScaleFac || 100;
        
        frameElems.forEach(e => {
            const n1Res = frameResults.nodes.find(n => n.id === e.n1);
            const n2Res = frameResults.nodes.find(n => n.id === e.n2);
            if (n1Res && n2Res) {
                const p1 = toScreen(n1Res.x + n1Res.u*sf, n1Res.y + n1Res.v*sf);
                const p2 = toScreen(n2Res.x + n2Res.u*sf, n2Res.y + n2Res.v*sf);
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
            }
        });
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // Nodes & Supports
    frameNodes.forEach(n => {
        const p = toScreen(n.x, n.y);
        
        const sup = frameSupports.find(s => s.node === n.id);
        if (sup) {
            ctx.fillStyle = '#10b981';
            ctx.fillRect(p.x - 6, p.y - 6, 12, 12);
        }
        
        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, 2*Math.PI);
        ctx.fill();
        
        ctx.fillStyle = '#64748b';
        ctx.font = '9px Inter';
        ctx.fillText(`N${n.id}`, p.x + 6, p.y - 6);
    });
    
    // Loads
    frameLoads.forEach(l => {
        const n = frameNodes.find(node => node.id === l.node);
        if (n) {
            const p = toScreen(n.x, n.y);
            ctx.strokeStyle = '#ef4444';
            ctx.fillStyle = '#ef4444';
            ctx.lineWidth = 1.5;
            
            const mag = Math.sqrt(l.fx*l.fx + l.fy*l.fy);
            if (mag > 0) {
                const nx = l.fx / mag;
                const ny = l.fy / mag;
                const len = 30;
                
                const startX = p.x - nx * len;
                const startY = p.y + ny * len; 
                
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
                
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2, 0, 2*Math.PI);
                ctx.fill();
            }
        }
    });
}

init();
