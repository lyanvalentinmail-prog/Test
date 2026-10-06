# AI WhatsApp Bot

Bot de WhatsApp hecho con **Baileys**, con autenticación por código QR o código de vinculación. Incluye el menú solicitado y cuatro funciones: chat, preguntas, corrección gramatical y generación de imágenes.

## Requisitos

- Node.js 20 o superior
- Una cuenta de WhatsApp para vincular el bot
- `OPENAI_API_KEY` para activar las funciones de IA

## Instalación

```bash
npm install
cp .env.example .env
npm start
```

Edita `.env` antes de iniciar. `OWNER_NUMBERS` debe incluir el número con código de país, sin `+`, espacios ni guiones.

## Formas de vinculación

### QR

Es la opción predeterminada:

```env
AUTH_METHOD=qr
```

Ejecuta `npm start` y escanea el QR que aparece en la terminal desde WhatsApp → Dispositivos vinculados → Vincular un dispositivo.

### Código de vinculación

```env
AUTH_METHOD=pairing-code
PAIRING_NUMBER=5215555555555
```

El número debe escribirse con código de país, sin `+` ni espacios. Ejecuta el bot y escribe el código mostrado en WhatsApp → Dispositivos vinculados → Vincular con número de teléfono.

La sesión queda guardada en `auth_info/`; no compartas esa carpeta.

## Comandos

- `.menu` — muestra el menú.
- `.chat <mensaje>` — conversa con la IA.
- `.ask <pregunta>` — responde una pregunta.
- `.grammar <texto>` — corrige ortografía y gramática.
- `.imagine <prompt>` — genera una imagen; disponible para el dueño.

Puedes cambiar el prefijo con `PREFIX`. Los comandos `chat` y `ask` tienen el límite diario definido en `USER_DAILY_LIMIT`; el dueño no tiene límite.

Sin `OPENAI_API_KEY`, el bot seguirá conectándose y mostrando el menú, pero responderá indicando que falta configurar la clave.
