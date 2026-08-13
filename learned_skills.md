# Patrones de Desarrollo: Sistema de Captación de Clientes

Este archivo resume los conocimientos y patrones técnicos implementados en este proyecto, diseñados para ser reutilizables en otros sistemas de CRM y captación de leads.

## 1. Arquitectura de Multi-Cliente (Role-Based Access)
Hemos implementado un sistema de configuración centralizado en `src/clients-config.js` que permite:
- Definir múltiples clientes con credenciales únicas.
- Restringir el acceso a secciones específicas (Leads, Marketing, Stats).
- Filtrar datos por producto o fuente de origen de forma dinámica.

**Uso:**
- El login busca la contraseña en el objeto `CLIENTS`.
- Si coincide, se guarda el `client_id` en `localStorage`.
- El dashboard filtra todos los datos basándose en las propiedades del cliente activo.

## 2. Pipeline de Leads con Prioridad Vertical
En lugar de un tablero Kanban horizontal tradicional (que puede ser difícil de leer en pantallas pequeñas), implementamos un "Vertical Priority Layout":
- Las columnas son secciones verticales expandibles.
- Prioridad visual a los leads "Nuevos".
- Tablas compactas con acciones rápidas (WhatsApp directo, cambio de estado, eliminar).

## 3. Integración Segura con Firebase (V3 Modular)
Patrón de inicialización modular en `src/firebase-config.js` para evitar duplicidad de código:
- Exportación única de la instancia `db`.
- Uso de `onSnapshot` para actualizaciones en tiempo real sin recargar la página.
- Gestión de campos inconsistentes (ej: `nombre` vs `name`) mediante funciones de normalización como `getLeadStatus()` y `getLeadProduct()`.

## 4. Generador de Creativos Publicitarios (Mockups)
Un sistema de previsualización de anuncios en tiempo real:
- Sincronización de branding (nombre del agente) en múltiples mockups (Facebook, TikTok).
- Rotación de "Hooks" y "Guiones" persuasivos para facilitar la creación de contenido.
- Descarga/Copia rápida de textos optimizados para anuncios.

## 5. Simulador de Ventas con IA (Voz y Feedback)
Estructura para entrenamiento de ventas:
- Simulación de estados de ánimo del cliente (Escéptico, Ocupado, Enojado).
- Medidores de "Confianza" y "Empatía" basados en la interacción.
- Log de transcripción para revisión de feedback inmediato.

## 6. Integración con Make (Webhooks y Cuenta)
- **Cuenta de Make asociada:** `iavarelaj@gmail.com`
- **Webhook activo en producción (`functions/index.js`):** `https://hook.us2.make.com/g4lwws1zrh77x7vt44nf49rwuogjjrux`
- Cuando se consulte sobre el webhook de Make para este proyecto, señalar siempre que el escenario está bajo la cuenta `iavarelaj@gmail.com`.

---
*Este archivo sirve como base de conocimiento para replicar estas funcionalidades en nuevos proyectos de CRM.*
