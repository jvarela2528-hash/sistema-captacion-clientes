const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall } = require("firebase-functions/v2/https");

// LAZY LOADERS PARA LIBRERÍAS PESADAS (Evita Timeouts en despliegue)
let _admin;
function getAdmin() {
    if (!_admin) {
        _admin = require("firebase-admin");
        _admin.initializeApp();
    }
    return _admin;
}

let twilioClient;
let openai;
function getTwilio() {
    if (!twilioClient) {
        const twilio = require("twilio");
        const accountSid = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
        const authToken = "your_twilio_auth_token_here";
        twilioClient = twilio(accountSid, authToken);
    }
    return twilioClient;
}

function getOpenAI() {
    if (!openai) {
        const { OpenAI } = require("openai");
        openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openai;
}

let genAI;
function getGenAI() {
    if (!genAI) {
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    return genAI;
}

async function callGeminiText(prompt, systemInstruction = null, isJson = false) {
    const ai = getGenAI();
    const modelOptions = { model: "gemini-2.5-flash" };
    if (systemInstruction) {
        modelOptions.systemInstruction = systemInstruction;
    }
    if (isJson) {
        modelOptions.generationConfig = {
            responseMimeType: "application/json"
        };
    }
    const model = ai.getGenerativeModel(modelOptions);
    const result = await model.generateContent(prompt);
    return result.response.text();
}

const TWILIO_WHATSAPP_NUMBER = "whatsapp:+14155238886"; 
const TWILIO_SMS_NUMBER = "+12182766940"; 

// CONFIGURACIÓN DE RUTAS (NÚMEROS DESTINO)
const CLIENT_PHONES = {
    'julio': '+1XXXXXXXXXX',   // TELÉFONO DE TU PADRE (Cámbialo aquí)
    'angel': '+17874596147',   // Tu número
    'default': '+17874596147'
};

const MASTER_MONITOR = '+17874596147'; // Angel siempre recibe copia de todo

exports.onNewLead = onDocumentCreated("leads/{leadId}", async (event) => {
    const lead = event.data.data();
    const leadId = event.params.leadId;
    const clientId = lead.clientId || 'julio';

    // Determinar nombre de la cabecera
    const headerName = clientId === 'julio' ? 'JULIO VARELA MARTINEZ' : 'ANGEL CURBELO SALES';
    
    // Determinar destinatarios (Número del cliente + Copia para Angel)
    const primaryPhone = CLIENT_PHONES[clientId] || CLIENT_PHONES['default'];
    const recipients = new Set([primaryPhone, MASTER_MONITOR]); 

    console.log(`🚀 [SISTEMA] Nuevo lead para ${headerName} (ID: ${leadId})`);

    const makeWebhookUrl = "https://hook.us2.make.com/g4lwws1zrh77x7vt44nf49rwuogjjrux";
    try {
        const payload = {
            nombre: lead.name || "N/A",
            telefono: lead.phone || "N/A",
            pueblo: lead.municipio || "N/A",
            servicio: lead.service || lead.product || "Solar",
            factura: lead.consumo || "N/A",
            techo: lead.roofType || "N/A",
            credito: lead.credit || "N/A",
            bateria: lead.battery || "N/A",
            calificacion: lead.scoreLabel || "Normal"
        };
        
        console.log(`📤 Enviando datos al webhook de Make para lead ${leadId}...`);
        const response = await fetch(makeWebhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            console.log(`✅ Webhook de Make notificado con éxito (Status: ${response.status})`);
        } else {
            console.error(`⚠️ Webhook de Make respondió con error (Status: ${response.status})`);
        }
    } catch (e) {
        console.error("❌ Error al llamar al webhook de Make:", e.message);
    }
});

// ====== NUEVO: GENERACIÓN DE IA CON CONTROL DE COSTOS ======
exports.generateAIAsset = onCall({ timeoutSeconds: 120 }, async (request) => {
    const { prompt, type, clientId, model } = request.data;
    
    if (!prompt) return { error: "No prompt provided" };

    try {
        const admin = getAdmin();
        // 1. Verificar consumo actual en Firestore
        const usageRef = admin.firestore().collection("usage").doc("stats");
        const usageDoc = await usageRef.get();
        let currentSpent = 0;
        
        if (usageDoc.exists) {
            currentSpent = usageDoc.data()[clientId] || 0;
        }

        // Límite de $5.00 por CRM
        if (currentSpent >= 5.00) {
            return { error: "Límite de presupuesto alcanzado ($5.00). Por favor recargue.", limitReached: true };
        }

        let result = "";
        let cost = 0;

        if (type === "image") {
            console.log(`🎨 Generando imagen con DALL-E-3 para el prompt: ${prompt}`);
            const ai = getOpenAI();
            const response = await ai.images.generate({
                model: "dall-e-3",
                prompt: `Anuncio publicitario profesional y premium de energía solar en Puerto Rico. Tema: ${prompt}. Estilo: Fotografía realista de alta gama, iluminación cinematográfica, colores vibrantes y modernos. Sin texto en la imagen.`,
                n: 1,
                size: "1024x1024",
                response_format: "b64_json"
            });
            
            const imgData = response.data[0];
            console.log("✅ Respuesta de OpenAI (Imagen) - keys:", Object.keys(imgData));
            
            if (imgData.url) {
                result = imgData.url;
                console.log("📎 Imagen recibida como URL");
            } else if (imgData.b64_json) {
                result = `data:image/png;base64,${imgData.b64_json}`;
                console.log("📎 Imagen recibida como base64, convertida a data URI");
            } else {
                console.error("❌ Formato de imagen desconocido:", JSON.stringify(imgData).substring(0, 200));
                return { error: "La IA generó la imagen pero en un formato no reconocido." };
            }
            cost = 0.04;
        } else {
            const systemInstruction = "Eres un experto en redactar anuncios virales. Tu tarea es entregar el texto del anuncio LISTO PARA PEGAR. NO incluyas etiquetas como 'Hook:', 'Texto corto:', ni introducciones. Solo el texto persuasivo con emojis. Al final incluye un llamado a la acción con el enlace proporcionado.";
            const userPrompt = `Redacta un anuncio irresistible para energía solar en Puerto Rico basado en: ${prompt}. Empieza con un hook potente y sigue con el cuerpo del mensaje. Al final pon: 👉 Cotiza gratis aquí: https://solar-leads-juliovmartinez.web.app/`;

            if (model === "gpt") {
                console.log(`✍️ Generando texto limpio con GPT-4o-mini para: ${prompt}`);
                try {
                    const ai = getOpenAI();
                    const response = await ai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: systemInstruction },
                            { role: "user", content: userPrompt }
                        ],
                    });
                    console.log("✅ Respuesta de OpenAI (Texto):", response.choices[0].message.content);
                    result = response.choices[0].message.content;
                    cost = 0.0005;
                } catch (openaiError) {
                    console.warn("⚠️ OpenAI falló. Intentando con Gemini como fallback...", openaiError);
                    try {
                        result = await callGeminiText(userPrompt, systemInstruction);
                        console.log("✅ Respuesta de Gemini (Fallback):", result);
                        cost = 0.00005;
                    } catch (geminiError) {
                        console.error("❌ Fallaron tanto OpenAI como Gemini:", geminiError);
                        throw openaiError;
                    }
                }
            } else {
                // Gemini por defecto
                console.log(`✍️ Generando texto limpio con Gemini-2.5-flash para: ${prompt}`);
                try {
                    result = await callGeminiText(userPrompt, systemInstruction);
                    console.log("✅ Respuesta de Gemini (Texto):", result);
                    cost = 0.00005;
                } catch (geminiError) {
                    console.warn("⚠️ Gemini falló. Intentando con OpenAI como fallback...", geminiError);
                    try {
                        const ai = getOpenAI();
                        const response = await ai.chat.completions.create({
                            model: "gpt-4o-mini",
                            messages: [
                                { role: "system", content: systemInstruction },
                                { role: "user", content: userPrompt }
                            ],
                        });
                        console.log("✅ Respuesta de OpenAI (Fallback):", response.choices[0].message.content);
                        result = response.choices[0].message.content;
                        cost = 0.0005;
                    } catch (openaiError) {
                        console.error("❌ Fallaron tanto Gemini como OpenAI:", openaiError);
                        throw geminiError;
                    }
                }
            }
        }

        // 2. Actualizar consumo
        const newTotal = currentSpent + cost;
        const targetId = clientId || 'default';
        await usageRef.set({
            [targetId]: newTotal,
            [`${targetId}_last_use`]: getAdmin().firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return { 
            result, 
            totalSpent: newTotal, 
            nearLimit: newTotal >= 4.50 
        };

    } catch (error) {
        console.error("❌ AI Error Detallado:", error);
        
        let extraInfo = "";
        try {
            const ai = getOpenAI();
            const models = await ai.models.list();
            const modelIds = models.data.map(m => m.id).join(", ");
            extraInfo = `\n\nModelos disponibles en tu cuenta: ${modelIds}`;
        } catch (e) {
            extraInfo = "\n\nNo se pudo listar los modelos.";
        }

        if (error.response) {
            console.error("OpenAI Error Data:", error.response.data);
            return { error: `OpenAI Error: ${error.response.data.error?.message || 'Error desconocido'}${extraInfo}` };
        }

        return { error: `Error de IA: ${error.message}${extraInfo}` };
    }
});

// ====== OCR: EXTRAER LEADS DESDE FOTO ======
exports.extractLeadsFromImage = onCall({ timeoutSeconds: 120 }, async (request) => {
    const { imageBase64 } = request.data;
    if (!imageBase64) return { error: "No se proporcionó imagen" };

    try {
        const ai = getOpenAI();
        const response = await ai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `Eres un experto en extraer datos de prospectos/leads de imágenes. Extrae TODOS los prospectos que encuentres. Responde SOLO con un JSON array válido, sin markdown ni texto extra. Cada objeto debe tener estos campos (usa null si no hay dato):
{"name":"nombre","phone":"teléfono","municipio":"ciudad","service":"solar","credit":"750+|651-749|Menos de 650","consumo":"factura","roofType":"Concreto|Zinc","notes":"info extra"}`
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Extrae todos los prospectos/leads de esta imagen. Si no hay datos, devuelve []." },
                        { type: "image_url", image_url: { url: imageBase64 } }
                    ]
                }
            ],
            max_tokens: 4000
        });

        const content = response.choices[0].message.content;
        console.log("📸 OCR Response:", content.substring(0, 300));
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const leads = JSON.parse(jsonMatch[0]);
            return { leads };
        }
        return { leads: [], message: "No se encontraron leads en la imagen." };
    } catch (error) {
        console.error("❌ OCR Error:", error);
        return { error: `Error al procesar imagen: ${error.message}` };
    }
});

// ====== IA ASISTENTE DE COMUNICACIÓN ======
exports.generateLeadMessage = onCall({ timeoutSeconds: 60 }, async (request) => {
    const { lead, objective, tone, model } = request.data;
    if (!lead) return { error: "Datos del prospecto incompletos." };

    try {
        const promptText = `Actúa como un asesor de ventas premium experto (Julio Varela / TuPlanta.com). Redacta un mensaje directo de comunicación para el siguiente prospecto:

Datos del Prospecto:
- Nombre: ${lead.name || lead.nombre || 'Cliente'}
- Servicio de interés: ${lead.service || lead.product || 'Solar'}
- Ubicación: ${lead.municipio || lead.pueblo || 'No especificada'}
- Calidad de crédito: ${lead.credit || lead.creditScore || 'No especificada'}
- Notas o detalles: ${lead.notes || lead.consumo || lead.factura || lead.detalles || 'Ninguno'}

Objetivo del mensaje: ${objective || 'Contacto inicial'}
Tono del mensaje: ${tone || 'Profesional y Humano'}

REGLAS DE ORO (CRÍTICO PARA NO SONAR COMO ROBOT):
1. El mensaje debe sentirse 100% humano, cercano, empático y muy natural. Evita frases cliché de call center o lenguaje robótico.
2. Saluda cálidamente por su nombre. Demuestra que entiendes su necesidad de ahorro en energía solar y frustración con apagones/LUMA.
3. Termina siempre con una pregunta o llamado a la acción suave (ej: confirmar si le viene bien hablar unos minutos hoy o agendar una breve llamada).
4. Firma de forma profesional y amigable: "Julio Varela - Asesor Solar Premium (TuPlanta.com)".
5. Nunca incluyas corchetes ni placeholders [como este], todo debe estar listo para copiar y enviar.`;

        let message = "";

        if (model === "gpt") {
            console.log("✍️ Generando mensaje de lead con GPT-4o-mini...");
            try {
                const ai = getOpenAI();
                const response = await ai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [{ role: "user", content: promptText }],
                    max_tokens: 500,
                    temperature: 0.7
                });
                message = response.choices[0].message.content;
            } catch (openaiError) {
                console.warn("⚠️ OpenAI falló al generar mensaje. Intentando con Gemini como fallback...", openaiError);
                try {
                    message = await callGeminiText(promptText);
                } catch (geminiError) {
                    console.error("❌ Fallaron tanto OpenAI como Gemini:", geminiError);
                    throw openaiError;
                }
            }
        } else {
            console.log("✍️ Generando mensaje de lead con Gemini-2.5-flash...");
            try {
                message = await callGeminiText(promptText);
            } catch (geminiError) {
                console.warn("⚠️ Gemini falló al generar mensaje. Intentando con OpenAI como fallback...", geminiError);
                try {
                    const ai = getOpenAI();
                    const response = await ai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [{ role: "user", content: promptText }],
                        max_tokens: 500,
                        temperature: 0.7
                    });
                    message = response.choices[0].message.content;
                } catch (openaiError) {
                    console.error("❌ Fallaron tanto Gemini como OpenAI:", openaiError);
                    throw geminiError;
                }
            }
        }

        return { message };
    } catch (error) {
        console.error("❌ AI Comm Error:", error);
        return { error: `Error al generar mensaje: ${error.message}` };
    }
});

