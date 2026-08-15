import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    proto,
    initAuthCreds,
    BufferJSON
} from '@whiskeysockets/baileys';
import pino from 'pino';
import express from 'express';
import QRCode from 'qrcode';
import dotenv from 'dotenv';

// Firebase Client SDK (no requiere cuenta de servicio)
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

// ─── Configuración ────────────────────────────────────────────────────────────
dotenv.config();

// Manejadores globales para prevenir colapso del proceso
process.on('uncaughtException', (error) => {
    console.error('❌ Excepción no capturada:', error.message || error);
});
process.on('unhandledRejection', (reason) => {
    console.error('❌ Promesa rechazada no manejada:', reason);
});

// Validar BRIDGE_SECRET
if (!process.env.BRIDGE_SECRET) {
    console.error("❌ ERROR CRÍTICO: La variable de entorno 'BRIDGE_SECRET' no está definida.");
    process.exit(1);
}
const BRIDGE_SECRET = process.env.BRIDGE_SECRET;

// ─── Firebase Client SDK ──────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyC6_3IMkH93iIc4f9Uo6kXq7fTYMFeDzoQ",
    authDomain: "solar-leads-juliovmartinez.firebaseapp.com",
    projectId: "solar-leads-juliovmartinez",
    storageBucket: "solar-leads-juliovmartinez.firebasestorage.app",
    messagingSenderId: "718683807078",
    appId: "1:718683807078:web:aa0a27d831de633e957ca7"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const AUTH_COLLECTION = 'whatsapp_auth';

// ─── Firestore Auth State (persistencia de sesión en la nube) ─────────────────
async function useFirestoreAuthState() {
    const writeData = async (id, data) => {
        const serialized = JSON.stringify(data, BufferJSON.replacer);
        await setDoc(doc(db, AUTH_COLLECTION, id), { data: serialized, updatedAt: new Date().toISOString() });
    };

    const readData = async (id) => {
        const docSnap = await getDoc(doc(db, AUTH_COLLECTION, id));
        if (!docSnap.exists()) return null;
        return JSON.parse(docSnap.data().data, BufferJSON.reviver);
    };

    const removeData = async (id) => {
        await deleteDoc(doc(db, AUTH_COLLECTION, id));
    };

    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const docId = `${category}-${id}`;
                            tasks.push(value ? writeData(docId, value) : removeData(docId));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData('creds', creds)
    };
}

// ─── Express Server ───────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Middleware de autenticación
const verifyBridgeToken = (req, res, next) => {
    const token = req.headers['x-bridge-secret'];
    if (!token || token !== BRIDGE_SECRET) {
        console.warn(`⚠️ [RECHAZADO] Intento de acceso no autorizado desde: ${req.ip}`);
        return res.status(403).json({ success: false, error: 'Forbidden: Invalid or missing token.' });
    }
    next();
};

// Enlaces de invitación de grupos
const GRUPO_JULIO_LINK = process.env.GRUPO_JULIO_LINK || 'https://chat.whatsapp.com/E8HqDkHqpCXDd4OcPhhpiR';
const GRUPO_ANGEL_LINK = process.env.GRUPO_ANGEL_LINK || 'https://chat.whatsapp.com/Geh9ryPRoZ4KXPh5KiQ0Iy';

let groupsMap = { julio: null, angel: null };
let sock = null;
let isReady = false;
let latestQRDataURL = null;

// ─── Rutas Express ────────────────────────────────────────────────────────────

// Ruta raíz redirige a /qr
app.get('/', (req, res) => {
    res.redirect('/qr');
});

// POST a raíz — orientación de URL correcta
app.post('/', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Ruta no encontrada. La URL completa del webhook debe terminar en /api/send-message',
        exampleUrl: `${req.protocol}://${req.get('host')}/api/send-message`
    });
});

// Endpoint público para ver QR o estado del bot
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
                            <span>Motor:</span>
                            <span class="success">Baileys (WebSocket)</span>
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
                    <p>Conectando vía Baileys (WebSocket directo). Esta página se actualizará automáticamente.</p>
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

// Helper para extraer código de invitación de un enlace de grupo
function extractInviteCode(link) {
    if (!link || !link.includes('chat.whatsapp.com/')) return null;
    return link.replace('https://chat.whatsapp.com/', '').split('?')[0];
}

// Helper para resolver enlace de grupo → JID
async function resolveGroupLink(link) {
    const inviteCode = extractInviteCode(link);
    if (!inviteCode) return null;

    try {
        // Intentar unirse primero (si ya está, retorna el JID del grupo)
        try {
            const groupId = await sock.groupAcceptInvite(inviteCode);
            if (groupId) return groupId;
        } catch (e) {
            // Ya está en el grupo o error menor — continuar con getInviteInfo
        }

        // Obtener info del grupo para extraer el JID
        const groupInfo = await sock.groupGetInviteInfo(inviteCode);
        return groupInfo.id;
    } catch (err) {
        console.error(`⚠️ No se pudo resolver enlace ${link}:`, err.message);
        return null;
    }
}

// Endpoint POST para recibir leads desde Make o CRM
app.post('/api/send-message', verifyBridgeToken, async (req, res) => {
    const { mensaje, clientId } = req.body;

    if (!mensaje || typeof mensaje !== 'string' || mensaje.trim() === '') {
        return res.status(400).json({
            success: false,
            error: 'El parámetro obligatorio "mensaje" debe ser una cadena de texto no vacía.'
        });
    }

    // Determinar grupo destino
    const targetKey = (clientId && (clientId.toLowerCase() === 'angel' || clientId.toLowerCase() === 'curbelo')) ? 'angel' : 'julio';
    const targetGroupId = groupsMap[targetKey] || groupsMap.julio || groupsMap.angel;

    if (!targetGroupId) {
        console.warn(`⚠️ [SERVICE UNAVAILABLE] ID de grupo destino no resuelto para cliente: ${targetKey}`);
        return res.status(503).json({
            success: false,
            error: `No hay grupo de WhatsApp asignado para el cliente '${targetKey}'.`
        });
    }

    if (!sock || !isReady) {
        return res.status(503).json({
            success: false,
            error: 'El bot de WhatsApp no está conectado. Espere a que se reconecte.'
        });
    }

    try {
        await sock.sendMessage(targetGroupId, { text: mensaje });
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

// ─── Servidor Express ─────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Servidor API de WhatsApp protegido escuchando en el puerto ${PORT}`);
});

// ─── Conexión Baileys ─────────────────────────────────────────────────────────
async function connectToWhatsApp() {
    const { state, saveCreds } = await useFirestoreAuthState();
    const { version } = await fetchLatestBaileysVersion();

    console.log(`📡 Conectando a WhatsApp con Baileys v${version.join('.')}...`);

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        printQRInTerminal: true,
        browser: ['Sistema Captación', 'Chrome', '120.0.0'],
        generateHighQualityLinkPreview: false,
        // Deshabilitar sync de historial para ahorrar memoria en Render Free
        syncFullHistory: false,
    });

    // Guardar credenciales cuando se actualizan
    sock.ev.on('creds.update', saveCreds);

    // Manejar actualizaciones de conexión
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Generar QR para la página web
        if (qr) {
            isReady = false;
            console.log('📱 Nuevo código QR generado. Escanea en /qr');
            try {
                latestQRDataURL = await QRCode.toDataURL(qr);
            } catch (err) {
                console.error('Error generando QR data URL:', err.message);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

            console.warn(`⚠️ Conexión cerrada (código: ${statusCode}). Reconectar: ${shouldReconnect}`);

            isReady = false;
            groupsMap = { julio: null, angel: null };

            if (shouldReconnect) {
                // Esperar un poco antes de reconectar para evitar loops rápidos
                const delay = statusCode === DisconnectReason.restartRequired ? 1000 : 5000;
                setTimeout(connectToWhatsApp, delay);
            } else {
                console.error('🔴 Sesión cerrada por el usuario. Eliminando credenciales de Firestore...');
                latestQRDataURL = null;
                // Limpiar la colección de auth en Firestore
                try {
                    const authDocs = await getDocs(collection(db, AUTH_COLLECTION));
                    const deletePromises = [];
                    authDocs.forEach((docSnap) => {
                        deletePromises.push(deleteDoc(doc(db, AUTH_COLLECTION, docSnap.id)));
                    });
                    await Promise.all(deletePromises);
                    console.log('🗑️ Credenciales eliminadas. Reconectando para mostrar QR nuevo...');
                } catch (e) {
                    console.error('Error limpiando credenciales:', e.message);
                }
                // Reconectar para mostrar QR nuevo
                setTimeout(connectToWhatsApp, 3000);
            }
        }

        if (connection === 'open') {
            isReady = true;
            latestQRDataURL = null;
            console.log('==================================================');
            console.log(' ¡Puente de WhatsApp EN LÍNEA y listo! (Baileys)');
            console.log('==================================================\n');

            // Resolver grupos
            try {
                if (!groupsMap.julio && GRUPO_JULIO_LINK) {
                    console.log('🔍 Resolviendo enlace de grupo Julio...');
                    groupsMap.julio = await resolveGroupLink(GRUPO_JULIO_LINK);
                }
                if (!groupsMap.angel && GRUPO_ANGEL_LINK) {
                    console.log('🔍 Resolviendo enlace de grupo Angel...');
                    groupsMap.angel = await resolveGroupLink(GRUPO_ANGEL_LINK);
                }
                console.log('📌 Grupos configurados:', groupsMap);
            } catch (e) {
                console.error('⚠️ Error al configurar grupos:', e.message);
            }
        }
    });
}

// Iniciar conexión
connectToWhatsApp().catch(err => {
    console.error('❌ Error fatal al iniciar Baileys:', err.message);
});
