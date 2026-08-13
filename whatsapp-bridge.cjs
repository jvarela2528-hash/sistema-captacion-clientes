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

// Al estar listo, resolver el enlace y unirse al grupo automáticamente
client.on('ready', async () => {
    console.clear();
    console.log('==================================================');
    console.log(' ¡Puente de WhatsApp EN LÍNEA y listo! ');
    console.log('==================================================\n');

    try {
        const inviteCode = GRUPO_INVITE_LINK.replace('https://chat.whatsapp.com/', '').split('?')[0];
        
        try {
            // Unir el bot al grupo usando el código de invitación
            const joinedId = await client.acceptInvite(inviteCode);
            if (joinedId) {
                targetGroupId = typeof joinedId === 'string' ? joinedId : joinedId._serialized;
                console.log(`✅ El Bot se ha unido al grupo automáticamente.`);
            }
        } catch (joinError) {
            console.log(`ℹ️ Verificando estado en el grupo... (${joinError.message || joinError})`);
        }

        if (!targetGroupId) {
            const groupChat = await client.getInviteInfo(inviteCode);
            targetGroupId = groupChat.id._serialized;
            console.log(`📌 Grupo Enlazado Exitosamente: ${groupChat.subject}`);
        }

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

    // [HALLAZGO-BRIDGE-03] Validación de string no vacío en req.body.mensaje
    if (!mensaje || typeof mensaje !== 'string' || mensaje.trim() === '') {
        console.warn(`⚠️ [BAD REQUEST] Parámetro "mensaje" ausente, no-string o vacío desde: ${req.ip}`);
        return res.status(400).json({ 
            success: false, 
            error: 'El parámetro obligatorio "mensaje" debe ser una cadena de texto (string) no vacía.' 
        });
    }

    // [HALLAZGO-BRIDGE-02] Verificación de estado de sesión de WhatsApp / Puppeteer
    if (!targetGroupId) {
        console.warn(`⚠️ [SERVICE UNAVAILABLE] Sesión de WhatsApp desconectada o ID de grupo destino no resuelto.`);
        return res.status(503).json({ 
            success: false, 
            error: 'El puente de WhatsApp no está disponible en este momento (sesión desconectada o degradada).' 
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
        // [HALLAZGO-BRIDGE-02] Loguear advertencia sin colgar la petición en errores de Puppeteer/envío
        console.warn('⚠️ Advertencia al intentar despachar mensaje vía Puppeteer:', error.message || error);
        return res.status(503).json({ 
            success: false, 
            error: 'No se pudo enviar el mensaje debido a un problema con la sesión de WhatsApp.',
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