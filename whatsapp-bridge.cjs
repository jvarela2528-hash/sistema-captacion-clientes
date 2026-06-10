const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');

// Cargar variables de entorno locales si existen
require('dotenv').config();

const app = express();
app.use(express.json());

// Token de seguridad requerido (Mover a tu archivo .env local)
const BRIDGE_SECRET = process.env.BRIDGE_SECRET || 'CambiarEsteTokenUrgente2026';

// Middleware para registrar peticiones entrantes
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Middleware de Autenticación del Puente (Mitigación HIGH-04)
const verifyBridgeToken = (req, res, next) => {
    const token = req.headers['x-bridge-secret'];
    if (!token || token !== BRIDGE_SECRET) {
        console.warn(`⚠️ [RECHAZADO] Intento de acceso no autorizado desde: ${req.ip}`);
        return res.status(403).json({ success: false, error: 'Forbidden: Invalid or missing token.' });
    }
    next();
};

// Enlace de invitación del grupo
const GRUPO_INVITE_LINK = 'https://chat.whatsapp.com/E8HqDkHqpCXDd4OcPhhpiR';
let targetGroupId = null;

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

// Escuchar y pintar el código QR en la terminal
client.on('qr', (qr) => {
    console.clear();
    qrcode.generate(qr, { small: true });
    console.log('\n==================================================');
    console.log(' Escanea este código QR con el WhatsApp del Bot');
    console.log('==================================================\n');
});

// Al estar listo, resolver el enlace del grupo automáticamente
client.on('ready', async () => {
    console.clear();
    console.log('==================================================');
    console.log(' ¡Puente de WhatsApp EN LÍNEA y listo! ');
    console.log('==================================================\n');

    try {
        const inviteCode = GRUPO_INVITE_LINK.replace('https://chat.whatsapp.com/', '');
        const groupChat = await client.getInviteInfo(inviteCode);
        
        targetGroupId = groupChat.id._serialized;
        console.log(`📌 Grupo Enlazado Exitosamente: ${groupChat.subject}`);
        console.log(`🆔 ID de Destino Guardado en Memoria: ${targetGroupId}\n`);
    } catch (error) {
        console.error('❌ Error crítico al resolver el enlace del grupo:', error.message);
    }
});

// Manejo de desconexión para re-autenticación limpia
client.on('disconnected', (reason) => {
    console.warn('⚠️ Cliente de WhatsApp desconectado. Razón:', reason);
    targetGroupId = null;
    // Forzar reinicio del cliente si es necesario
    client.initialize().catch(err => console.error('Error re-inicializando:', err.message));
});

// Endpoint POST blindado para recibir leads desde Make o tu CRM interno
app.post('/api/send-message', verifyBridgeToken, async (req, res) => {
    const { mensaje } = req.body;

    if (!mensaje) {
        return res.status(400).json({ 
            success: false, 
            error: 'Falta el parámetro obligatorio: "mensaje".' 
        });
    }

    if (!targetGroupId) {
        return res.status(503).json({ 
            success: false, 
            error: 'El puente de WhatsApp aún no ha resuelto el ID del grupo destino o el bot está desconectado.' 
        });
    }

    try {
        // Enviar el lead directamente al grupo de forma atómica
        await client.sendMessage(targetGroupId, mensaje);
        console.log(`✅ Lead enviado con éxito al grupo.`);
        return res.status(200).json({ 
            success: true, 
            message: 'Mensaje enviado al grupo con éxito.' 
        });
    } catch (error) {
        console.error('❌ Error al despachar el mensaje al grupo:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
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