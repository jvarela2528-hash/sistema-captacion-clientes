const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

// Cargar variables de entorno locales si existen
require('dotenv').config();

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

// Inicializar cliente de WhatsApp con persistencia de sesión local
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "antigravity-crm-bridge"
    }),
    puppeteer: {
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
let latestQRDataURL = null;

// Escuchar y guardar el código QR como imagen y en memoria
client.on('qr', async (qr) => {
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

// Endpoint público para ver el QR directamente en el navegador
app.get('/qr', (req, res) => {
    if (!latestQRDataURL) {
        return res.send('<h2>El puente de WhatsApp ya está autenticado o cargando el código QR... Refresca en unos segundos.</h2>');
    }
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Código QR WhatsApp Bot</title>
            <meta http-equiv="refresh" content="15">
            <style>
                body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: white; margin: 0; }
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

// Servidor escuchando en el puerto 3001
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🚀 Servidor API de WhatsApp protegido escuchando en http://localhost:${PORT}`);
});