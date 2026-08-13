import './style.css'
import { db } from './firebase-config'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

let currentLeadData = {
    name: '',
    phone: '',
    email: '',
    direccion: '',
    municipio: '',
    consumo: '',
    isOwner: 'si',
    propertyType: '',
    roofType: '',
    credit: '',
    battery: '',
    status: 'Nuevo',
    clientId: new URLSearchParams(window.location.search).get('cid') || 'julio',
    source: new URLSearchParams(window.location.search).get('src') || 'direct',
    product: 'Solar'
};

window.nextStep = (current, next) => {
    document.getElementById(`step-${current}`).classList.remove('active');
    document.getElementById(`step-${next}`).classList.add('active');
    let stepNum = typeof next === 'number' ? next : (next === 'renter-warning' || next === 'type' ? 2 : 7);
    updateProgress((stepNum / 7) * 100);
}

window.setDueno = (val) => { currentLeadData.isOwner = val; }
window.setConsumo = (val) => { currentLeadData.consumo = val; }
window.setField = (field, val) => { currentLeadData[field] = val; }

function updateProgress(percent) {
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = `${percent}%`;
}

async function submitLead() {
    const btn = document.getElementById('submit-btn');
    if (!btn) return;
    btn.disabled = true;
    btn.innerText = 'Enviando...';

    try {
        currentLeadData.name = document.getElementById('full-name')?.value?.trim() || '';
        currentLeadData.phone = document.getElementById('phone')?.value?.trim() || '';
        currentLeadData.email = document.getElementById('email')?.value?.trim() || '';
        currentLeadData.direccion = document.getElementById('address')?.value?.trim() || '';
        currentLeadData.municipio = document.getElementById('municipio')?.value?.trim() || '';

        if (!currentLeadData.name || !currentLeadData.phone) {
            alert('Por favor completa tu nombre y teléfono.');
            btn.disabled = false;
            btn.innerText = 'Obtener Mi Análisis Gratis';
            return;
        }

        // Si es renta, establecer el status inicial
        if (currentLeadData.isOwner === 'no') {
            currentLeadData.status = 'No Califica: Renta';
        }

        // LÓGICA DE CALIDAD (SCORE) BASADA EN CRÉDITO
        // Hot = 750+, Warm = 651-749, Cold = Menos de 650
        let score = 50;
        let scoreLabel = '☀️ Warm';

        if (currentLeadData.credit === '750+') {
            score = 90;
            scoreLabel = '🔥 Hot';
        } else if (currentLeadData.credit === '651-749') {
            score = 65;
            scoreLabel = '☀️ Warm';
        } else if (currentLeadData.credit === 'Menos de 650') {
            score = 30;
            scoreLabel = '❄️ Cold';
        }

        console.log("📤 Guardando lead en Firestore...", currentLeadData);

        const docRef = await addDoc(collection(db, 'leads'), {
            ...currentLeadData,
            score: score,
            scoreLabel: scoreLabel,
            createdAt: serverTimestamp()
        });

        console.log("✅ Lead guardado exitosamente con ID:", docRef.id);

        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        const successStep = document.getElementById('step-success');
        if (successStep) successStep.classList.add('active');
        updateProgress(100);

    } catch (error) {
        console.error("❌ Error al enviar el lead a Firestore:", error);
        alert('Error al enviar el formulario. Por favor verifica tu conexión e intenta de nuevo.');
        btn.disabled = false;
        btn.innerText = 'Obtener Mi Análisis Gratis';
    }
}

document.getElementById('submit-btn')?.addEventListener('click', () => submitLead());
