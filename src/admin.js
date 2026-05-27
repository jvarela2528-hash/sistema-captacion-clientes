import { db, functions } from './firebase-config';
import { collection, query, onSnapshot, updateDoc, doc, deleteDoc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { CLIENTS } from './clients-config';
import QRCode from 'qrcode';

let currentClient = null;
let allLeads = [];
let chartStatus = null;
let chartProducts = null;

// ====== MOBILE SIDEBAR TOGGLE ======
const menuToggleBtn = document.getElementById('menu-toggle-btn');
const sidebar = document.querySelector('.sidebar');

if (menuToggleBtn && sidebar) {
    menuToggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 1024 && 
            !sidebar.contains(e.target) && 
            !menuToggleBtn.contains(e.target) && 
            sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
        }
    });

    // Close sidebar when clicking a link on mobile
    document.querySelectorAll('.nav-item, .nav-sub-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('open');
            }
        });
    });
}

// ====== AUTHENTICATION ======
const loginScreen = document.getElementById('login-screen');
const adminPanel = document.getElementById('admin-panel');
const loginBtn = document.getElementById('login-btn');
const adminPassInput = document.getElementById('admin-pass');

const checkLogin = () => {
    const pass = adminPassInput?.value.trim();
    const client = Object.values(CLIENTS).find(c => c.password === pass);

    if (client) {
        currentClient = client;
        if(loginScreen) loginScreen.style.display = 'none';
        if(adminPanel) adminPanel.style.display = 'flex';
        initDashboard();
        localStorage.setItem('crm_client_id', client.id);
    } else {
        alert('Contraseña incorrecta');
    }
};

if (loginBtn) loginBtn.addEventListener('click', checkLogin);
if (adminPassInput) adminPassInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') checkLogin(); });

// Auto-login
const savedClientId = localStorage.getItem('crm_client_id');
if (savedClientId && CLIENTS[savedClientId]) {
    currentClient = CLIENTS[savedClientId];
    if (loginScreen) loginScreen.style.display = 'none';
    if (adminPanel) adminPanel.style.display = 'flex';
    setTimeout(initDashboard, 100);
}

document.getElementById('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('crm_client_id');
    location.reload();
});

// ====== DASHBOARD INITIALIZATION ======
function initDashboard() {
    setupNavigation();
    loadLeads();
    initMarketing();
    initAcademy();
    initQRCode();
    syncWithHash();
    checkAIBudget();
    setupAICommModal();
}

function initAcademy() {
    const objGrid = document.getElementById('objection-library-grid');
    if (objGrid) {
        const objections = [
            { t: "Costo Inicial", d: "Muchos piensan que es caro, pero el financiamiento solar suele ser menor que la factura de LUMA.", r: "No es un gasto, es un intercambio de factura por propiedad." },
            { t: "Techo Viejo", d: "Si el techo necesita reparaciones, se pueden incluir en el proyecto solar.", r: "Evaluamos el techo y si es necesario, lo arreglamos antes de instalar." },
            { t: "Mudanza Próxima", d: "Los paneles aumentan el valor de reventa de la propiedad un 4-6%.", r: "La casa se vende más rápido si no tiene factura de luz alta." }
        ];
        objGrid.innerHTML = objections.map(o => `
            <div class="objection-card">
                <span class="tag">Objeción</span>
                <h3 style="margin-bottom:1rem; color:#d4af37;">${o.t}</h3>
                <p style="font-size:0.85rem; color:#888; margin-bottom:1.5rem;">${o.d}</p>
                <div style="background:rgba(212,175,55,0.05); padding:1rem; border-radius:12px; font-size:0.8rem; border-left:3px solid #d4af37;">
                    <strong>Respuesta:</strong> ${o.r}
                </div>
            </div>
        `).join('');
    }

    const painGrid = document.getElementById('pain-map-grid');
    if (painGrid) {
        const pains = [
            { i: "💸", t: "Inestabilidad de Precios", d: "El cliente odia que la luz suba cada mes sin previo aviso." },
            { i: "🌑", t: "Apagones Constantes", d: "La frustración de perder comida o no tener aire en el calor de PR." },
            { i: "🔌", t: "Dependencia de la Red", d: "Sentirse rehén de una infraestructura que no funciona." }
        ];
        painGrid.innerHTML = pains.map(p => `
            <div class="pain-item" style="padding:1.5rem; background:rgba(255,255,255,0.02); border-radius:16px;">
                <span style="font-size:2rem; display:block; margin-bottom:1rem;">${p.i}</span>
                <h4 style="margin-bottom:0.5rem; color:#fff;">${p.t}</h4>
                <p style="font-size:0.8rem; color:#666;">${p.d}</p>
            </div>
        `).join('');
    }
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-section]');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.getAttribute('data-section');
            if(sectionId) showSection(sectionId);
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
        });
    });
    window.addEventListener('hashchange', syncWithHash);
}

function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    if (id === 'qr-section') {
        initQRCode();
    }
}

function syncWithHash() {
    const hash = location.hash.replace('#', '') || 'leads-section';
    if (hash.startsWith('academia-')) {
        showSection('library-section');
        document.querySelectorAll('.lib-sub-section').forEach(s => s.style.display = 'none');
        document.querySelectorAll('.nav-pill').forEach(p => p.classList.remove('active'));
        const targetLib = hash.replace('academia-', 'lib-');
        const libEl = document.getElementById(targetLib);
        if (libEl) libEl.style.display = 'block';
        const pillEl = document.querySelector(`[data-pill="${targetLib}"]`);
        if (pillEl) pillEl.classList.add('active');
        if (hash === 'academia-simulador') showSection('simulator-section');
        return;
    }
    const section = document.getElementById(hash);
    if (section) {
        showSection(hash);
        document.querySelectorAll('.nav-item').forEach(n => {
            n.classList.toggle('active', n.getAttribute('data-section') === hash);
        });
    }
}

// ====== LEADS MANAGEMENT ======
function loadLeads() {
    try {
        const q = query(collection(db, "leads"));
        onSnapshot(q, (snapshot) => {
            allLeads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Sort by timestamp or createdAt (descending)
            allLeads.sort((a, b) => {
                const tA = a.timestamp || a.createdAt || { seconds: 0 };
                const tB = b.timestamp || b.createdAt || { seconds: 0 };
                const sA = (typeof tA === 'object' && tA.seconds) ? tA.seconds : 0;
                const sB = (typeof tB === 'object' && tB.seconds) ? tB.seconds : 0;
                return sB - sA;
            });

            // window.generateIdea('fb');
            // window.generateIdea('tiktok');
            renderLeads();
            updateStats();
        }, (error) => {
            console.error("Firestore Error:", error);
        });
    } catch (err) {
        console.error("Setup Error:", err);
    }
}

const getLeadProduct = (lead) => lead.product || 'Solar';
const getLeadStatus = (lead) => {
    let s = lead.status || 'Nuevo';
    if (s.toLowerCase() === 'nuevo') return 'Nuevo';
    if (s.toLowerCase() === 'seguimiento') return 'Cotización en Proceso';
    if (s.toLowerCase() === 'venta') return 'Venta/Seguimiento';
    if (s.toLowerCase().includes('apartamento') || s.toLowerCase().includes('renta')) return 'No Califica: Renta';
    if (s.toLowerCase().includes('credito')) return 'Denegado';
    return s;
};

function shouldShowLead(lead) {
    if (!currentClient) return false;
    const product = getLeadProduct(lead);
    
    if (currentClient.restrictedToProduct && product !== currentClient.restrictedToProduct) return false;
    
    const hash = location.hash;
    if (hash.includes('leads') || !hash || hash === '#leads-section') {
        if (product !== 'Solar') return false;
    }
    return true;
}

function calculateLeadScore(lead) {
    if (lead.creditScore) {
        const cs = parseInt(lead.creditScore, 10);
        if (cs >= 750) return { label: '🔥 Hot', class: 'score-hot', num: 90 };
        if (cs >= 651) return { label: '☀️ Warm', class: 'score-warm', num: 65 };
        return { label: '❄️ Cold', class: 'score-cold', num: 30 };
    }
    let score = 0;
    const isOwner = lead.isOwner || 'si';
    const consumo = (lead.factura || lead.consumo || '').toString();

    if (isOwner === 'si') score += 50;
    if (consumo.includes('$351')) score += 30;
    else if (consumo.includes('$201')) score += 15;
    
    if (lead.credit?.includes('Excelente') || lead.credit?.includes('750')) score += 20;
    if (lead.battery === 'Sí') score += 10;

    if (score >= 80) return { label: '🔥 Hot', class: 'score-hot', num: score };
    if (score >= 50) return { label: '☀️ Warm', class: 'score-warm', num: score };
    return { label: '❄️ Cold', class: 'score-cold', num: score };
}

let currentAICommLead = null;

function renderLeads() {
    const containers = {
        'nuevos': document.getElementById('body-nuevos'),
        'seguimiento': document.getElementById('body-seguimiento'),
        'venta': document.getElementById('body-venta'),
        'apartamento': document.getElementById('body-apartamento'),
        'credito': document.getElementById('body-credito')
    };

    Object.values(containers).forEach(c => { if(c) c.innerHTML = ''; });
    const counts = { nuevos: 0, seguimiento: 0, venta: 0, archivo: 0 };

    allLeads.filter(shouldShowLead).forEach(lead => {
        const status = getLeadStatus(lead);
        const name = lead.nombre || lead.name || 'N/A';
        const pueblo = lead.pueblo || lead.municipio || 'PR';
        const phoneRaw = lead.telefono || lead.phone || '';
        const phoneClean = phoneRaw.replace(/\D/g, '');
        const extraDetails = [
            lead.factura || lead.consumo || 'N/A',
            lead.propertyType ? `🏠 ${lead.propertyType}` : (lead.roofType ? `🏠 ${lead.roofType}` : null),
            lead.creditScore ? `💳 Puntuación: ${lead.creditScore}` : (lead.credit ? `💳 ${lead.credit}` : null),
            lead.battery ? `🔋 Bat: ${lead.battery}` : null
        ].filter(Boolean).join(' | ');

        const tr = document.createElement('tr');
        const scoreData = calculateLeadScore(lead);
        
        const waText = encodeURIComponent(`Hola ${name}, le asiste Julio Varela. Recibí su solicitud para evaluación solar y me gustaría orientarle brevemente...`);
        
        tr.innerHTML = `
            <td><span class="score-badge ${scoreData.class}">${scoreData.label}</span></td>
            <td class="font-semibold">${name}</td>
            <td><small>${pueblo}</small></td>
            <td>
                <div style="display:flex; gap:0.4rem; align-items:center;">
                    <a href="tel:${phoneClean}" class="btn-action-sm" style="background:#10b981; color:#fff; padding:4px 8px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-flex; align-items:center; gap:4px; font-size:0.75rem;" title="Llamar por teléfono">📞 Llamar</a>
                    <a href="https://wa.me/${phoneClean}?text=${waText}" target="_blank" class="btn-action-sm" style="background:#25d366; color:#000; padding:4px 8px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-flex; align-items:center; gap:4px; font-size:0.75rem;" title="Enviar WhatsApp directo">📱 WA</a>
                    <button class="btn-email-lead" data-id="${lead.id}" style="background:#3b82f6; color:#fff; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:4px; font-size:0.75rem;" title="Enviar Correo Electrónico">✉️ Email</button>
                    <button class="btn-ai-comm" data-id="${lead.id}" style="background:linear-gradient(135deg, #d4af37, #f3e5ab); color:#000; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; font-weight:700; display:inline-flex; align-items:center; gap:4px; font-size:0.75rem;" title="Redactar mensaje personalizado con IA">✨ IA</button>
                </div>
            </td>
            <td><small style="color:#666;">${extraDetails}</small></td>
            <td>
                <select class="status-select" onchange="updateLeadStatus('${lead.id}', this.value)">
                    <option value="Nuevo" ${status === 'Nuevo' ? 'selected' : ''}>📮 Nuevo</option>
                    <option value="Contactado" ${status === 'Contactado' ? 'selected' : ''}>📞 Contactado</option>
                    <option value="Cita" ${status === 'Cita' ? 'selected' : ''}>📅 Cita</option>
                    <option value="Cotización en Proceso" ${status === 'Cotización en Proceso' ? 'selected' : ''}>⏳ Cotización en Proceso</option>
                    <option value="Cotización Aprobada" ${status === 'Cotización Aprobada' ? 'selected' : ''}>⭐ Cotización Aprobada</option>
                    <option value="Venta/Seguimiento" ${status === 'Venta/Seguimiento' ? 'selected' : ''}>✅ Venta/Seguimiento</option>
                    <option value="Denegado" ${status === 'Denegado' ? 'selected' : ''}>❌ Denegado</option>
                    <option value="No Califica: Renta" ${status === 'No Califica: Renta' ? 'selected' : ''}>🚫 No Califica: Renta</option>
                    <option value="No Califica: Apartamento" ${status === 'No Califica: Apartamento' ? 'selected' : ''}>🏢 No Califica: Apartamento</option>
                </select>
            </td>
            <td class="action-btns">
                <button class="btn-mini" onclick="deleteLead('${lead.id}')">🗑️</button>
            </td>
        `;

        if (status === 'Nuevo') {
            containers.nuevos?.appendChild(tr);
            counts.nuevos++;
        } else if (['Contactado', 'Cita', 'Cotización en Proceso'].includes(status)) {
            containers.seguimiento?.appendChild(tr);
            counts.seguimiento++;
        } else if (['Cotización Aprobada', 'Venta/Seguimiento'].includes(status)) {
            containers.venta?.appendChild(tr);
            counts.venta++;
        } else if (['Denegado', 'No Califica: Renta', 'No Califica: Apartamento'].includes(status)) {
            containers.apartamento?.appendChild(tr);
            counts.archivo++;
        } else {
            containers.nuevos?.appendChild(tr);
            counts.nuevos++;
        }
    });

    if(document.getElementById('count-nuevos')) document.getElementById('count-nuevos').innerText = counts.nuevos;
    if(document.getElementById('count-seguimiento')) document.getElementById('count-seguimiento').innerText = counts.seguimiento;
    if(document.getElementById('count-venta')) document.getElementById('count-venta').innerText = counts.venta;
    if(document.getElementById('count-archivo')) document.getElementById('count-archivo').innerText = counts.archivo;

    // Attach event listeners for dynamic communication buttons
    document.querySelectorAll('.btn-email-lead').forEach(b => b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const lead = allLeads.find(l => l.id === id);
        if (!lead) return;
        let email = lead.email || lead.correo || '';
        if (!email) {
            email = prompt(`Ingrese el correo electrónico para ${lead.name || lead.nombre || 'el prospecto'}:`, '');
            if (!email) return;
        }
        const subject = encodeURIComponent(`Consulta sobre servicios de energía solar - Julio Varela`);
        const body = encodeURIComponent(`Hola ${lead.name || lead.nombre || 'estimado cliente'},\n\nGracias por su interés en nuestros sistemas solares. Me comunico con el fin de ofrecerle información detallada y responder sus dudas para coordinar una orientación personalizada.\n\nAtentamente,\nJulio Varela`);
        window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    }));

    document.querySelectorAll('.btn-ai-comm').forEach(b => b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const lead = allLeads.find(l => l.id === id);
        if (!lead) return;
        openAICommModal(lead);
    }));
}

// ====== IA ASISTENTE DE COMUNICACIÓN MODAL LOGIC ======
function openAICommModal(lead) {
    currentAICommLead = lead;
    const modal = document.getElementById('ai-comm-modal');
    const subtitle = document.getElementById('ai-comm-lead-subtitle');
    const resultBox = document.getElementById('ai-comm-result-box');
    const statusBox = document.getElementById('ai-comm-status');
    const textarea = document.getElementById('ai-comm-message-text');

    if (subtitle) {
        subtitle.innerText = `Generando mensaje para: ${lead.name || lead.nombre || 'Prospecto'} (${lead.service || lead.product || 'Solar'})`;
    }
    
    if (resultBox) resultBox.style.display = 'none';
    if (statusBox) statusBox.style.display = 'none';
    if (textarea) textarea.value = '';

    if (modal) modal.classList.add('active');
}

function setupAICommModal() {
    const modal = document.getElementById('ai-comm-modal');
    const closeBtn = document.getElementById('ai-comm-close');
    const generateBtn = document.getElementById('btn-generate-ai');
    const sendWaBtn = document.getElementById('btn-send-wa');
    const callBtn = document.getElementById('btn-call-comm');
    const sendEmailBtn = document.getElementById('btn-send-email');
    const copyBtn = document.getElementById('btn-copy-comm');

    if (!modal) return;

    closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    generateBtn?.addEventListener('click', async () => {
        if (!currentAICommLead) return;
        const objective = document.getElementById('ai-comm-objective')?.value || '';
        const tone = document.getElementById('ai-comm-tone')?.value || '';
        const modelSelect = document.getElementById('ai-comm-model');
        const selectedModel = modelSelect ? modelSelect.value : 'gemini';

        const statusBox = document.getElementById('ai-comm-status');
        const resultBox = document.getElementById('ai-comm-result-box');
        const textarea = document.getElementById('ai-comm-message-text');

        if (statusBox) statusBox.style.display = 'block';
        if (resultBox) resultBox.style.display = 'none';
        generateBtn.disabled = true;
        generateBtn.style.opacity = '0.7';

        try {
            const generateMsgFn = httpsCallable(functions, 'generateLeadMessage');
            const res = await generateMsgFn({ lead: currentAICommLead, objective, tone, model: selectedModel });
            
            if (res.data?.error) {
                alert(`Error: ${res.data.error}`);
            } else if (res.data?.message) {
                if (textarea) textarea.value = res.data.message;
                if (resultBox) resultBox.style.display = 'block';
            }
        } catch (err) {
            console.error("Error AI Comm:", err);
            alert(`Error de conexión con el servidor: ${err.message}`);
        } finally {
            if (statusBox) statusBox.style.display = 'none';
            generateBtn.disabled = false;
            generateBtn.style.opacity = '1';
        }
    });

    sendWaBtn?.addEventListener('click', () => {
        if (!currentAICommLead) return;
        const phoneRaw = currentAICommLead.telefono || currentAICommLead.phone || '';
        const phone = phoneRaw.replace(/\D/g, '');
        if (!phone) {
            alert("El prospecto no tiene un número de teléfono registrado.");
            return;
        }
        const text = encodeURIComponent(document.getElementById('ai-comm-message-text')?.value || '');
        window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
    });

    callBtn?.addEventListener('click', () => {
        if (!currentAICommLead) return;
        const phoneRaw = currentAICommLead.telefono || currentAICommLead.phone || '';
        const phone = phoneRaw.replace(/\D/g, '');
        if (!phone) {
            alert("El prospecto no tiene un número de teléfono registrado.");
            return;
        }
        window.open(`tel:${phone}`, '_self');
    });

    sendEmailBtn?.addEventListener('click', () => {
        if (!currentAICommLead) return;
        let email = currentAICommLead.email || currentAICommLead.correo || '';
        const name = currentAICommLead.name || currentAICommLead.nombre || 'Prospecto';
        if (!email) {
            email = prompt(`Ingrese el correo para ${name}:`, '');
            if (!email) return;
        }
        const subject = encodeURIComponent(`Mensaje de orientación para ${name} - Energía Solar`);
        const body = encodeURIComponent(document.getElementById('ai-comm-message-text')?.value || '');
        window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    });

    copyBtn?.addEventListener('click', () => {
        const text = document.getElementById('ai-comm-message-text')?.value || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
            copyBtn.innerHTML = '<span>✅ Copiado</span>';
            setTimeout(() => { copyBtn.innerHTML = '<span>📋 Copiar</span>'; }, 2000);
        } else {
            alert("Tu navegador no soporta el copiado automático. Selecciona y copia el texto.");
        }
    });
}

window.updateLeadStatus = async (id, newStatus) => {
    try { await updateDoc(doc(db, "leads", id), { status: newStatus }); } catch (e) { console.error(e); }
};

window.deleteLead = async (id) => {
    if (confirm("¿Eliminar prospecto?")) { try { await deleteDoc(doc(db, "leads", id)); } catch(e) { console.error(e); } }
};

// ====== MARKETING & STATS ======
function updateStats() {
    const solarLeads = allLeads.filter(l => getLeadProduct(l) === 'Solar');
    if(document.getElementById('stat-total')) document.getElementById('stat-total').innerText = solarLeads.length;
    
    const sales = solarLeads.filter(l => getLeadStatus(l).includes('venta')).length;
    const rate = solarLeads.length > 0 ? ((sales / solarLeads.length) * 100).toFixed(1) : 0;
    if(document.getElementById('stat-conv')) document.getElementById('stat-conv').innerText = `${rate}%`;

    const pueblos = {};
    solarLeads.forEach(l => { const p = l.pueblo || l.municipio; if(p) pueblos[p] = (pueblos[p] || 0) + 1; });
    const top = Object.entries(pueblos).sort((a,b) => b[1] - a[1])[0];
    if(document.getElementById('stat-top')) document.getElementById('stat-top').innerText = top ? top[0] : '-';

    renderCharts(solarLeads);
}

function renderCharts(leads) {
    if (typeof Chart === 'undefined') return;
    const ctxS = document.getElementById('chart-status')?.getContext('2d');
    const ctxP = document.getElementById('chart-products')?.getContext('2d');
    if (!ctxS || !ctxP) return;

    if (chartStatus) chartStatus.destroy();
    if (chartProducts) chartProducts.destroy();

    const s = {
        'Nuevo': leads.filter(l => getLeadStatus(l).includes('nuevo')).length,
        'Seguimiento': leads.filter(l => getLeadStatus(l).includes('seguimiento')).length,
        'Venta': leads.filter(l => getLeadStatus(l).includes('venta')).length,
        'Archivo': leads.filter(l => ['apartamento','renta','credito'].some(v => getLeadStatus(l).includes(v))).length
    };

    chartStatus = new Chart(ctxS, {
        type: 'doughnut',
        data: { labels: Object.keys(s), datasets: [{ data: Object.values(s), backgroundColor: ['#d4af37','#3498db','#2ecc71','#444'] }] },
        options: { plugins: { legend: { display: false } } }
    });

    const src = { 'Directo': leads.filter(l => l.source === 'direct').length, 'Web': leads.filter(l => l.source === 'cuestionario-web').length };
    chartProducts = new Chart(ctxP, {
        type: 'bar',
        data: { labels: Object.keys(src), datasets: [{ data: Object.values(src), backgroundColor: '#d4af37' }] },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
}

function initMarketing() {
    const bInput = document.getElementById('branding-name');
    if (bInput) {
        bInput.addEventListener('input', (e) => {
            const v = e.target.value;
            document.querySelectorAll('.mock-name-display').forEach(el => el.innerText = v);
            document.querySelectorAll('.mock-name-display-handle').forEach(el => el.innerText = v.toLowerCase().replace(/\s/g,''));
        });
        // Initial trigger
        bInput.dispatchEvent(new Event('input'));
    }
}

// ====== NEW: QR CODE GENERATOR ======
let isQRCodeGenerated = false;

function initQRCode() {
    const imgDisplay = document.getElementById('qr-img-display');
    if (!imgDisplay) return;
    const cid = currentClient ? currentClient.id : 'julio';
    const url = `https://solar-leads-juliovmartinez.web.app/?cid=${cid}&src=qr`;
    
    if (!isQRCodeGenerated) {
        QRCode.toDataURL(url, {
            width: 300,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
        }, (err, dataUrl) => {
            if (err) {
                console.error("Error QR:", err);
            } else {
                imgDisplay.src = dataUrl;
                isQRCodeGenerated = true;
            }
        });
    }

    const btnOnly = document.getElementById('btn-download-qr-only');
    if (btnOnly) {
        btnOnly.onclick = () => {
            if (!imgDisplay.src || imgDisplay.src.endsWith('#')) return;
            const a = document.createElement('a');
            a.href = imgDisplay.src;
            a.download = `QR_TuPlanta_JulioVarela_${new Date().toISOString().split('T')[0]}.png`;
            a.click();
        };
    }

    const btnFlyer = document.getElementById('btn-download-qr-flyer');
    if (btnFlyer) {
        btnFlyer.onclick = () => {
            generateAndDownloadFlyer(url);
        };
    }
}

function generateAndDownloadFlyer(url) {
    const flyerCanvas = document.createElement('canvas');
    flyerCanvas.width = 1080;
    flyerCanvas.height = 1080;
    const ctx = flyerCanvas.getContext('2d');

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, 1080, 1080);

    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 8;
    ctx.strokeRect(30, 30, 1020, 1020);

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 42, 996, 996);

    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 54px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EVALUACIÓN ENERGÉTICA GRATIS', 540, 140);

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 36px "Inter", sans-serif';
    ctx.fillText('Descubre cuánto puedes ahorrar con Energía Solar', 540, 210);

    const repName = currentClient ? currentClient.name : 'Julio Varela Martinez';
    ctx.fillStyle = '#aaaaaa';
    ctx.font = '30px "Inter", sans-serif';
    ctx.fillText(`Representante TuPlanta.com: ${repName}`, 540, 270);

    QRCode.toDataURL(url, {
        width: 440,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
    }, (err, qrDataUrl) => {
        if (err) {
            console.error(err);
            alert("Error al generar flyer.");
            return;
        }

        const qrImg = new Image();
        qrImg.src = qrDataUrl;
        qrImg.onload = () => {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(300, 340, 480, 480);
            ctx.drawImage(qrImg, 320, 360, 440, 440);

            ctx.fillStyle = '#d4af37';
            ctx.font = 'bold 34px "Inter", sans-serif';
            ctx.fillText('ESCANEA EL CÓDIGO CON TU CELULAR', 540, 890);

            ctx.fillStyle = '#dddddd';
            ctx.font = '26px "Inter", sans-serif';
            ctx.fillText('Accede de inmediato a nuestro cotizador interactivo en Puerto Rico', 540, 945);

            ctx.fillStyle = '#777777';
            ctx.font = '22px "Inter", sans-serif';
            ctx.fillText('TuPlanta.com | Sin compromisos ni cargos ocultos', 540, 1000);

            const dataUrl = flyerCanvas.toDataURL("image/png");
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `Flyer_QR_JulioVarela_${new Date().toISOString().split('T')[0]}.png`;
            a.click();
        };
    });
}

// ====== NEW: EXPORT LOGIC ======
window.exportLeads = (type) => {
    const solarLeads = allLeads.filter(shouldShowLead);
    if (type === 'excel' || type === 'sheets') {
        const headers = ["Nombre", "Pueblo", "Telefono", "Consumo", "Status"];
        const rows = solarLeads.map(l => [
            l.nombre || l.name || '',
            l.pueblo || l.municipio || '',
            l.telefono || l.phone || '',
            l.factura || l.consumo || '',
            l.status || ''
        ]);
        const content = [headers, ...rows].map(r => r.join("\t")).join("\n");
        
        if (type === 'sheets') {
            navigator.clipboard.writeText(content).then(() => {
                alert("📋 ¡Datos Copiados! \n\nA continuación se abrirá una nueva hoja de Google Sheets. \n\nCuando cargue, solo haz clic en la primera celda y presiona Ctrl+V para pegar.");
                window.open('https://sheets.new', '_blank');
            });
        } else {
            const blob = new Blob([content], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `leads_solar_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        }
    } else if (type === 'pdf') {
        window.print();
    }
};

// ====== NEW: MARKETING GENERATOR ======
const HOOKS = [
    "¿Cansado de pagar facturas de luz de $300? ⚡",
    "Puerto Rico se queda a oscuras, pero tu casa no tiene por qué. 🏠",
    "El subsidio solar que LUMA no quiere que conozcas. 💰",
    "Instalación en 15 días. Sin pronto. Sin complicaciones. ✅"
];

window.generateIdea = async (platform) => {
    const hook = HOOKS[Math.floor(Math.random() * HOOKS.length)];
    const textEl = document.getElementById(`text-${platform}`);
    const imgEl = document.getElementById(`img-preview-${platform}`);
    
    if (textEl) {
        textEl.style.opacity = '0';
        setTimeout(() => {
            textEl.innerText = `${hook}\n\nEscríbeme hoy mismo para una evaluación gratis.`;
            textEl.style.opacity = '1';
        }, 200);
    }
    
    if (imgEl) {
        imgEl.style.opacity = '0.5';
        setTimeout(() => {
            imgEl.src = `/ads/${platform}_${Math.floor(Math.random() * 3) + 1}.png`;
            imgEl.style.opacity = '1';
        }, 200);
    }
};

window.generateAIIdea = async (platform) => {
    const userPrompt = window.prompt("¿Sobre qué quieres el anuncio? (Ej: Ahorro con baterías, Instalación rápida, Cero pronto)");
    if (!userPrompt) return;
    
    if (typeof showVisualAlert === 'function') showVisualAlert("Generando contenido con IA...", "Procesando");
    await useAI('text', userPrompt, platform);
    await useAI('image', userPrompt, platform);
};

async function useAI(type, prompt, platform) {
    const textEl = document.getElementById(`text-${platform}`);
    const imgEl = document.getElementById(`img-preview-${platform}`);
    
    if (textEl && type === 'text') {
        textEl.innerText = "✨ La IA está redactando tu anuncio...";
        textEl.classList.add('ai-pulse');
    }
    if (imgEl && type === 'image') {
        imgEl.classList.add('shimmer');
        imgEl.style.opacity = "0.5";
    }

    try {
        const modelSelect = document.getElementById('ai-model-select');
        const selectedModel = modelSelect ? modelSelect.value : 'gemini';

        const generateAI = httpsCallable(functions, 'generateAIAsset');
        console.log(`📡 Llamando a IA (${type}) con prompt: "${prompt}" usando modelo: ${selectedModel}...`);
        const res = await generateAI({ prompt, type, clientId: currentClient.id, model: selectedModel });
        console.log(`🤖 IA Response (${type}):`, res.data);
        
        if (res.data.error) {
            console.error(`❌ Error en IA (${type}):`, res.data.error);
            alert(`Error en ${type}: ${res.data.error}`);
            if (textEl && type === 'text') {
                textEl.innerText = "Error al generar texto.";
                textEl.classList.remove('ai-pulse');
            }
            if (imgEl && type === 'image') {
                imgEl.classList.remove('shimmer');
                imgEl.style.opacity = "1";
            }
            return;
        }

        const result = res.data.result;

        if (type === 'text' && textEl) {
            console.log("✍️ Texto recibido con éxito");
            // Enmascarar URLs con texto amigable
            const linkified = result.replace(
                /(https?:\/\/[^\s]+)/g,
                '<a href="$1" target="_blank" style="color:#d4af37; font-weight:bold; text-decoration:underline; display:inline-block; margin-top:6px;">🔗 Cotiza Gratis Aquí</a>'
            );
            textEl.innerHTML = linkified;
            textEl.classList.remove('ai-pulse');
        } else if (type === 'image' && imgEl) {
            console.log("🎨 Imagen recibida con éxito. URL:", result);
            imgEl.src = result;
            imgEl.onload = () => {
                console.log("✅ Imagen cargada visualmente");
                imgEl.classList.remove('shimmer');
                imgEl.style.opacity = "1";
            };
            imgEl.onerror = () => {
                console.error("❌ La URL de la imagen no es válida o está bloqueada por CORS:", result);
                imgEl.classList.remove('shimmer');
                imgEl.style.opacity = "1";
                // Añadir enlace de rescate al texto si la imagen falla
                if (textEl) {
                    textEl.innerHTML += `<br><br>🖼️ <a href="${result}" target="_blank" style="color:var(--primary); font-weight:bold; text-decoration:underline;">Ver Imagen Generada</a>`;
                }
            };
        }

        if (res.data.nearLimit) {
            const alertEl = document.getElementById('ai-budget-alert');
            if (alertEl) alertEl.style.display = 'block';
        }
    } catch (e) {
        console.error(`❌ Fallo crítico en llamada a IA (${type}):`, e);
        if (textEl) {
            textEl.innerText = "Error de conexión.";
            textEl.classList.remove('ai-pulse');
        }
        if (imgEl) imgEl.classList.remove('shimmer');
        alert(`Error de conexión (${type}): ${e.message}`);
    }
}

async function checkAIBudget() {
    if (!currentClient) return;
    try {
        const usageDoc = await getDoc(doc(db, "usage", "stats"));
        if (usageDoc.exists()) {
            const spent = usageDoc.data()[currentClient.id] || 0;
            if (spent >= 4.50) {
                document.getElementById('ai-budget-alert').style.display = 'block';
            }
        }
    } catch (e) { console.error("Budget check error:", e); }
}

window.prepareAd = (platform) => {
    const text = document.getElementById(`text-${platform}`)?.innerText;
    navigator.clipboard.writeText(text).then(() => alert("Texto publicitario copiado. ¡Listo para publicar!"));
};

// ====== NEW: AI SIMULATOR LOGIC ======
let simInterval = null;
let trustScore = 50;

document.getElementById('start-sim-btn')?.addEventListener('click', () => {
    const btn = document.getElementById('start-sim-btn');
    const statusText = document.getElementById('sim-status-text');
    const voiceIndicator = document.getElementById('voice-indicator');
    const log = document.getElementById('sim-log');

    if (btn.innerText === 'Iniciar Sesión') {
        btn.innerText = 'Detener';
        btn.style.background = '#ff4d4d';
        statusText.innerText = 'Cliente conectado... Escuchando';
        voiceIndicator.classList.add('active');
        log.innerHTML = '<div class="log-client">Cliente: ¿Aló? ¿Quién habla? Me pillas ocupado...</div>';
        
        simInterval = setInterval(() => {
            trustScore += (Math.random() * 4 - 2);
            trustScore = Math.max(0, Math.min(100, trustScore));
            const fill = document.getElementById('trust-fill');
            if (fill) fill.style.width = `${trustScore}%`;
            document.getElementById('trust-value').innerText = `${Math.round(trustScore)}%`;
        }, 2000);
    } else {
        btn.innerText = 'Iniciar Sesión';
        btn.style.background = '#d4af37';
        statusText.innerText = 'Sesión terminada';
        voiceIndicator.classList.remove('active');
        clearInterval(simInterval);
    }
});
