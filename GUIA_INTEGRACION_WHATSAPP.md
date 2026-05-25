# 🚀 Guía de Integración WhatsApp (Sent.dm + Firebase)

Este documento detalla los pasos para replicar el sistema de alertas automáticas por WhatsApp para nuevos leads.

## 1. Configuración en Sent.dm
1. **Crear Plantilla:** En el panel de `Templates`, crear una nueva plantilla (Categoría: `UTILITY`).
2. **Cuerpo del Mensaje:** Usar texto estático al inicio y al final para evitar rechazos de WhatsApp. 
   *Ejemplo:* "Hola, tienes un nuevo lead: {{name}}. Por favor contáctalo."
3. **Variables:** Definir las variables necesarias (`name`, `phone`, `municipio`, `consumo`, `isOwner`).
4. **Nombre Técnico:** Una vez creada, anotar el nombre que genera WhatsApp (ej: `nuevo_prospecto_solar_g7k9s2v1pq`).

## 2. Configuración en Firebase (Cloud Functions)
1. **Instalar SDK:** Dentro de la carpeta `functions`, ejecutar:
   `npm install @sentdm/sentdm`
2. **Variable de Entorno:** Crear o editar `functions/.env` y añadir la API Key:
   `SENT_DM_API_KEY=tu_api_key_aqui`
3. **Código de la Función:** Asegurarse de que `functions/index.js` tenga el trigger correcto:
   - `onDocumentCreated("leads/{leadId}", ...)`
   - El campo `channel` debe ser un array: `channel: ["whatsapp"]`.
   - El nombre de la plantilla debe coincidir exactamente con el del paso 1.

## 3. Requisitos de Cumplimiento (Legal)
WhatsApp requiere que la landing page donde se captan los leads tenga:
- Enlace visible a **Política de Privacidad**.
- Enlace visible a **Términos y Condiciones**.
- Sin estos enlaces, la plantilla podría ser rechazada o el número bloqueado.

## 4. Despliegue
Para subir los cambios al servidor de Firebase:
```bash
firebase deploy --only functions
```

---
*Guía generada para el proyecto: solar-leads-juliovmartinez*
