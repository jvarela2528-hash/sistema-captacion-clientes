const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

// Cargar variables de entorno locales si existen
require('dotenv').config();

// Garantizar directorio de caché de Puppeteer para Render
process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer';

// [HALLAZGO-BRIDGE-03] Manejadores globales para prevenir el colapso del proceso por errores de Puppeteer
process.on('uncaughtException', (error) => {
    console.error('❌ Excepción no capturada (uncaughtException):', error.message || error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promesa rechazada no manejada (unhandledRejection):', reason);
});

// [HALLAZGO-BRIDGE-01] Validar que exista BRIDGE_SECRET antes de iniciar el servidor
if (!process.env.BRIDGE_SECRET) {
    console.error("❌ ERROR CRÍTICO DE SEGURIDAD: La variable de entorno 'BRIDGE_SECRET' no está definida.");
    console.error("   Defina BRIDGE_SECRET en su archivo .env antes de iniciar la aplicación.");
    process.exit(1);
}

const BRIDGE_SECRET = process.env.BRIDGE_SECRET;

const app = express();
app.use(express.json());

// Middleware para registrar peticiones entrantes
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Middleware de Autenticación del Puente
const verifyBridgeToken = (req, res, next) => {
    const token = req.headers['x-bridge-secret'];
    if (!token || token !== BRIDGE_SECRET) {
        console.warn(`⚠️ [RECHAZADO] Intento de acceso no autorizado desde: ${req.ip}`);
        return res.status(403).json({ success: false, error: 'Forbidden: Invalid or missing token.' });
    }
    next();
};

// Enlaces de invitación de grupos (pueden ser configurados en .env)
const GRUPO_JULIO_LINK = process.env.GRUPO_JULIO_LINK || 'https://chat.whatsapp.com/E8HqDkHqpCXDd4OcPhhpiR';
const GRUPO_ANGEL_LINK = process.env.GRUPO_ANGEL_LINK || '';

let groupsMap = {
    julio: null,
    angel: null
};

const fs = require('fs');
const puppeteer = require('puppeteer');

process.env.PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || '/opt/render/.cache/puppeteer';

let puppeteerExecPath = process.env.PUPPETEER_EXECUTABLE_PATH;

if (!puppeteerExecPath || !fs.existsSync(puppeteerExecPath)) {
    try {
        const defaultPath = puppeteer.executablePath();
        if (fs.existsSync(defaultPath)) {
            puppeteerExecPath = defaultPath;
            console.log('📌 Executable Chrome Path (Puppeteer):', puppeteerExecPath);
        }
    } catch (e) {
        console.warn('⚠️ Standard puppeteer executablePath not found:', e.message);
    }
}

if (!puppeteerExecPath || !fs.existsSync(puppeteerExecPath)) {
    try {
        const chromium = require('@sparticuz/chromium');
        puppeteerExecPath = chromium.executablePath();
        console.log('📌 Executable Chrome Path (@sparticuz/chromium):', puppeteerExecPath);
    } catch (e) {
        console.warn('⚠️ @sparticuz/chromium fallback failed:', e.message);
    }
}

// Inicializar cliente de WhatsApp con persistencia de sesión local
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "antigravity-crm-bridge"
    }),
    puppeteer: {
        executablePath: puppeteerExecPath || undefined,
        handleSIGINT: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

const QRCode = require('qrcode');
const path = require('path');
let isReady = false;
let isAuthenticating = false;

// Escuchar y guardar el código QR como imagen y en memoria
client.on('qr', async (qr) => {
    isReady = false;
    console.clear();
    qrcode.generate(qr, { small: true });
    console.log('\n==================================================');
    console.log(' Escanea este código QR con el WhatsApp del Bot');
    console.log('==================================================\n');

    try {
        latestQRDataURL = await QRCode.toDataURL(qr);
        await QRCode.toFile(path.join(__dirname, 'qr.png'), qr);
        console.log('📸 Código QR guardado como "qr.png" y disponible en http://localhost:3001/qr');
    } catch (err) {
        console.error('Error guardando imagen QR:', err.message);
    }
});

// Ruta raíz pública que redirige directamente a /qr para GET
app.get('/', (req, res) => {
    res.redirect('/qr');
});

// Manejador para POST a la raíz (orientación de URL correcta)
app.post('/', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Ruta no encontrada. La URL completa del webhook debe terminar en /api/send-message',
        exampleUrl: `${req.protocol}://${req.get('host')}/api/send-message`
    });
});

// Endpoint público para ver el QR o Estado del Bot en el navegador
app.get('/qr', (req, res) => {
    if (isReady) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Estado WhatsApp Bot</title>
                <meta http-equiv="refresh" content="30">
                <style>
                    body { font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: #0f172a; color: white; margin: 0; padding: 20px; box-sizing: border-box; }
                    .card { background: #1e293b; padding: 2.5rem; border-radius: 1.25rem; box-shadow: 0 20px 30px rgba(0,0,0,0.5); text-align: center; max-width: 480px; width: 100%; border: 1px solid #334155; }
                    .badge { background: #166534; color: #4ade80; font-weight: 700; padding: 6px 14px; border-radius: 9999px; display: inline-block; font-size: 0.875rem; margin-bottom: 1rem; }
                    h2 { margin: 0 0 0.5rem 0; color: #f8fafc; font-size: 1.5rem; }
                    p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; margin: 0.5rem 0 1.5rem 0; }
                    .status-box { background: #0f172a; padding: 1.25rem; border-radius: 0.75rem; text-align: left; border: 1px solid #1e293b; }
                    .status-item { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #334155; font-size: 0.9rem; }
                    .status-item:last-child { border-bottom: none; }
                    .success { color: #4ade80; font-weight: 600; }
                    .pending { color: #fbbf24; font-weight: 600; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="badge">🟢 BOT EN LÍNEA</div>
                    <h2>¡WhatsApp Conectado!</h2>
                    <p>El bot ya está autenticado con tu sesión de WhatsApp. No requiere escanear el código QR.</p>
                    <div class="status-box">
                        <div class="status-item">
                            <span>Estado del Servidor:</span>
                            <span class="success">Activo (Ready)</span>
                        </div>
                        <div class="status-item">
                            <span>Grupo Julio Varela:</span>
                            <span class="${groupsMap.julio ? 'success' : 'pending'}">${groupsMap.julio ? '✅ Conectado' : '⚠️ Pendiente'}</span>
                        </div>
                        <div class="status-item">
                            <span>Grupo Angel Curbelo:</span>
                            <span class="${groupsMap.angel ? 'success' : 'pending'}">${groupsMap.angel ? '✅ Conectado' : '⚠️ Pendiente'}</span>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `);
    }

    if (!latestQRDataURL) {
        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Cargando Bot WhatsApp</title>
                <meta http-equiv="refresh" content="5">
                <style>
                    body { font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white; margin: 0; }
                    .card { background: #1e293b; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; max-width: 400px; }
                    .spinner { border: 4px solid rgba(255,255,255,0.1); width: 40px; height: 40px; border-radius: 50%; border-left-color: #3b82f6; animation: spin 1s linear infinite; margin: 0 auto 1.5rem auto; }
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    p { color: #94a3b8; font-size: 0.9rem; margin-top: 0.5rem; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="spinner"></div>
                    <h2>Inicializando cliente de WhatsApp...</h2>
                    <p>Cargando sesión o preparando código QR. Esta página se actualizará automáticamente en unos segundos.</p>
                </div>
            </body>
            </html>
        `);
    }

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Código QR WhatsApp Bot</title>
            <meta http-equiv="refresh" content="15">
            <style>
                body { font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white; margin: 0; }
                .card { background: #1e293b; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; }
                img { width: 280px; height: 280px; border-radius: 8px; background: white; padding: 10px; }
                p { color: #94a3b8; font-size: 0.9rem; margin-top: 1rem; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>Escanea este código QR con WhatsApp</h2>
                <img src="${latestQRDataURL}" alt="Código QR WhatsApp" />
                <p>La página se actualiza automáticamente cada 15 segundos.</p>
            </div>
        </body>
        </html>
    `);
});

// Helper para resolver enlace de grupo
async function resolveGroupLink(link) {
    if (!link || !link.includes('chat.whatsapp.com/')) return null;
    try {
        const inviteCode = link.replace('https://chat.whatsapp.com/', '').split('?')[0];
        try {
            const joinedId = await client.acceptInvite(inviteCode);
            if (joinedId) return typeof joinedId === 'string' ? joinedId : joinedId._serialized;
        } catch (e) {
            // Ya está en el grupo
        }
        const groupChat = await client.getInviteInfo(inviteCode);
        return groupChat.id._serialized;
    } catch (err) {
        console.error(`⚠️ No se pudo resolver enlace ${link}:`, err.message);
        return null;
    }
}

// Al estar listo, resolver grupos
client.on('ready', async () => {
    isReady = true;
    console.clear();
    console.log('==================================================');
    console.log(' ¡Puente de WhatsApp EN LÍNEA y listo! ');
    console.log('==================================================\n');

    // 1. Escanear chats existentes para detectar grupos por nombre
    try {
        const chats = await client.getChats();
        const groups = chats.filter(c => c.isGroup);
        console.log(`📋 Grupos detectados en WhatsApp (${groups.length}):`);
        groups.forEach(g => {
            console.log(` - Group: "${g.name}" | ID: ${g.id._serialized}`);
            const nameLower = g.name.toLowerCase();
            if (nameLower.includes('angel') || nameLower.includes('curbelo')) {
                groupsMap.angel = g.id._serialized;
                console.log(`   👉 Asignado a proyecto ANGEL`);
            } else if (nameLower.includes('julio') || nameLower.includes('captacion') || nameLower.includes('solar')) {
                groupsMap.julio = g.id._serialized;
                console.log(`   👉 Asignado a proyecto JULIO`);
            }
        });
    } catch (e) {
        console.error('Error escaneando grupos:', e.message);
    }

    // 2. Resolver por enlaces si aún no están asignados
    if (!groupsMap.julio && GRUPO_JULIO_LINK) {
        groupsMap.julio = await resolveGroupLink(GRUPO_JULIO_LINK);
    }
    if (!groupsMap.angel && GRUPO_ANGEL_LINK) {
        groupsMap.angel = await resolveGroupLink(GRUPO_ANGEL_LINK);
    }

    console.log('\n📌 Mapeo final de Grupos:');
    console.log(' - Julio / Captación:', groupsMap.julio || 'Pendiente de enlace/nombre');
    console.log(' - Angel Curbelo:', groupsMap.angel || 'Pendiente de enlace/nombre\n');
});

// Manejo de desconexión
client.on('disconnected', (reason) => {
    console.warn('⚠️ Cliente de WhatsApp desconectado. Razón:', reason);
    groupsMap = { julio: null, angel: null };
    client.initialize().catch(err => console.error('Error re-inicializando:', err.message));
});

// Endpoint POST blindado para recibir leads desde Make o CRM
app.post('/api/send-message', verifyBridgeToken, async (req, res) => {
    const { mensaje, clientId } = req.body;

    if (!mensaje || typeof mensaje !== 'string' || mensaje.trim() === '') {
        return res.status(400).json({ 
            success: false, 
            error: 'El parámetro obligatorio "mensaje" debe ser una cadena de texto no vacía.' 
        });
    }

    // Determinar grupo destino
    const targetKey = (clientId && clientId.toLowerCase() === 'angel') ? 'angel' : 'julio';
    const targetGroupId = groupsMap[targetKey] || groupsMap.julio || groupsMap.angel;

    if (!targetGroupId) {
        console.warn(`⚠️ [SERVICE UNAVAILABLE] ID de grupo destino no resuelto para cliente: ${targetKey}`);
        return res.status(503).json({ 
            success: false, 
            error: `No hay grupo de WhatsApp asignado para el cliente '${targetKey}'.` 
        });
    }

    try {
        await client.sendMessage(targetGroupId, mensaje);
        console.log(`✅ Lead enviado con éxito al grupo (${targetKey}): ${targetGroupId}`);
        return res.status(200).json({ 
            success: true, 
            message: `Mensaje enviado al grupo de ${targetKey} con éxito.` 
        });
    } catch (error) {
        console.warn('⚠️ Advertencia al intentar enviar mensaje vía WhatsApp:', error.message || error);
        return res.status(503).json({ 
            success: false, 
            error: 'No se pudo enviar el mensaje al grupo de WhatsApp.',
            details: error.message 
        });
    }
});

// Inicializar el cliente de WhatsApp Web
client.initialize().catch(err => console.error("❌ Error al arrancar WhatsApp:", err.message));

// Servidor escuchando en el puerto dinámico de Render (process.env.PORT) o 3001 por defecto localmente
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Servidor API de WhatsApp protegido escuchando en el puerto ${PORT}`);
});