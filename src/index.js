import 'dotenv/config'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState
} from '@whiskeysockets/baileys'
import P from 'pino'
import qrcode from 'qrcode-terminal'
import OpenAI from 'openai'
import fs from 'node:fs/promises'
import path from 'node:path'

const PREFIX = process.env.PREFIX || '.'
const AUTH_METHOD = (process.env.AUTH_METHOD || 'qr').toLowerCase()
const owners = new Set((process.env.OWNER_NUMBERS || '').split(',').map(cleanNumber).filter(Boolean))
const limit = Number(process.env.USER_DAILY_LIMIT || 20)
const usage = new Map()
const authDir = path.resolve('auth_info')
const logger = P({ level: process.env.LOG_LEVEL || 'info' })
const ai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null

function cleanNumber(value = '') { return value.replace(/[^0-9]/g, '') }
function jidNumber(jid = '') { return cleanNumber(jid.split('@')[0].split(':')[0]) }
function isOwner(jid) { return owners.has(jidNumber(jid)) }
function today() { return new Date().toISOString().slice(0, 10) }

function menu() {
  return `୨୧ ❏ ◇ ᴀɪ

┊ ✿ ${PREFIX}ᴄʜᴀᴛ <ᴍᴇɴꜱᴀᴊᴇ> Ⓛ

┊ ✿ ${PREFIX}ᴀꜱᴋ <ᴘʀᴇɢᴜɴᴛᴀ> Ⓛ

┊ ✿ ${PREFIX}ɢʀᴀᴍᴍᴀʀ <ᴛᴇxᴛᴏ>

┊ ✿ ${PREFIX}ɪᴍᴀɢɪɴᴇ <ᴘʀᴏᴍᴘᴛ> Ⓟ

୨୧

ᴛᴏᴛᴀʟ : 4 ꜰɪᴛᴜʀ

Ⓟ ᴘʀᴇᴍɪᴜᴍ Ⓛ ʟɪᴍɪᴛ Ⓞ ᴏᴡɴᴇʀ Ⓐ ᴀᴅᴍɪɴ`
}

function normalizeCommand(command) {
  return command.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[ᴄc]/g, 'c').replace(/[ʜh]/g, 'h').replace(/[ᴀa]/g, 'a')
    .replace(/[ᴛt]/g, 't').replace(/[ɢg]/g, 'g').replace(/[ʀr]/g, 'r')
    .replace(/[ᴀa]/g, 'a').replace(/[ᴍm]/g, 'm').replace(/[ᴇe]/g, 'e')
    .replace(/[ɪi]/g, 'i').replace(/[ɴn]/g, 'n').replace(/[ᴇe]/g, 'e')
}

function parseMessage(text) {
  if (!text?.startsWith(PREFIX)) return null
  const body = text.slice(PREFIX.length).trim()
  const [raw, ...rest] = body.split(/\s+/)
  return { command: normalizeCommand(raw || ''), args: rest.join(' ').trim() }
}

function useLimit(jid) {
  const key = `${jidNumber(jid)}:${today()}`
  const current = usage.get(key) || 0
  if (isOwner(jid) || current < limit) { usage.set(key, current + 1); return true }
  return false
}

async function askAI(prompt, instruction) {
  if (!ai) return 'Configura OPENAI_API_KEY en tu archivo .env para activar esta función.'
  const completion = await ai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    temperature: 0.7,
    messages: [
      { role: 'system', content: instruction },
      { role: 'user', content: prompt }
    ]
  })
  return completion.choices[0]?.message?.content?.trim() || 'No pude generar una respuesta.'
}

async function imagine(prompt) {
  if (!ai) return null
  const result = await ai.images.generate({ model: process.env.IMAGE_MODEL || 'gpt-image-1', prompt, size: '1024x1024' })
  const image = result.data?.[0]
  if (image?.url) return { url: image.url }
  if (image?.b64_json) return { buffer: Buffer.from(image.b64_json, 'base64') }
  return null
}

async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid
  if (!jid || jid === 'status@broadcast' || msg.key.fromMe) return
  const message = msg.message
  const text = message?.conversation || message?.extendedTextMessage?.text || message?.imageMessage?.caption || ''
  const parsed = parseMessage(text)
  if (!parsed) return
  const { command, args } = parsed

  if (['menu', 'help', 'ayuda'].includes(command)) return sock.sendMessage(jid, { text: menu() })
  if (!args && ['chat', 'ask', 'grammar', 'imagine'].includes(command)) {
    return sock.sendMessage(jid, { text: `Uso: ${PREFIX}${command} <texto>` })
  }
  if (['chat', 'ask'].includes(command) && !useLimit(jid)) {
    return sock.sendMessage(jid, { text: 'Has alcanzado tu límite diario. Inténtalo mañana.' })
  }
  try {
    if (command === 'chat') {
      await sock.sendPresenceUpdate('composing', jid)
      const answer = await askAI(args, 'Responde en español de forma útil, natural y concisa. Eres un asistente de WhatsApp.')
      return sock.sendMessage(jid, { text: answer })
    }
    if (command === 'ask') {
      await sock.sendPresenceUpdate('composing', jid)
      const answer = await askAI(args, 'Contesta preguntas en español. Si no tienes certeza, dilo claramente y no inventes datos.')
      return sock.sendMessage(jid, { text: answer })
    }
    if (command === 'grammar') {
      const answer = await askAI(args, 'Corrige la gramática y ortografía del texto. Devuelve primero el texto corregido y después una explicación breve de los cambios.')
      return sock.sendMessage(jid, { text: answer })
    }
    if (command === 'imagine') {
      if (!isOwner(jid)) return sock.sendMessage(jid, { text: 'Ⓟ Este comando es exclusivo para usuarios premium.' })
      await sock.sendPresenceUpdate('composing', jid)
      const url = await imagine(args)
      if (!url) return sock.sendMessage(jid, { text: 'Configura OPENAI_API_KEY para activar la generación de imágenes.' })
      return sock.sendMessage(jid, { image: url.buffer || { url: url.url }, caption: `✦ Imagen creada para: ${args}` })
    }
    if (command === 'owner') return sock.sendMessage(jid, { text: isOwner(jid) ? 'Ⓞ Eres el dueño del bot.' : 'Este comando es solo para el dueño.' })
    return sock.sendMessage(jid, { text: `Comando no encontrado. Escribe ${PREFIX}menu para ver las funciones.` })
  } catch (error) {
    logger.error(error, 'Error ejecutando comando')
    return sock.sendMessage(jid, { text: 'Ocurrió un error al procesar tu solicitud. Revisa la configuración e inténtalo de nuevo.' })
  } finally {
    await sock.sendPresenceUpdate('paused', jid).catch(() => {})
  }
}

let pairingRequested = false
async function connect() {
  await fs.mkdir(authDir, { recursive: true })
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.ubuntu('AI WhatsApp Bot'),
    printQRInTerminal: false,
    logger: P({ level: 'silent' }),
    generateHighQualityLinkPreview: false
  })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('messages.upsert', ({ messages }) => messages.forEach(message => handleMessage(sock, message).catch(error => logger.error(error))))
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr && AUTH_METHOD !== 'pairing-code') {
      console.log('\nEscanea este QR con WhatsApp > Dispositivos vinculados:\n')
      qrcode.generate(qr, { small: true })
    }
    if (AUTH_METHOD === 'pairing-code' && !sock.authState?.creds?.registered && !state.creds.registered && !pairingRequested) {
      const number = cleanNumber(process.env.PAIRING_NUMBER)
      if (!number) return logger.error('Falta PAIRING_NUMBER para usar pairing-code')
      pairingRequested = true
      const code = await sock.requestPairingCode(number)
      console.log(`\nCódigo de vinculación: ${code}\n`)
    }
    if (connection === 'open') console.log(`✅ ${process.env.BOT_NAME || 'AI'} conectado. Escribe ${PREFIX}menu`)
    if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode
      if (status !== DisconnectReason.loggedOut) { pairingRequested = false; console.log('Conexión cerrada; reconectando...'); connect() }
      else console.error('Sesión cerrada. Borra auth_info y vuelve a vincular el bot.')
    }
  })
}

connect().catch(error => { logger.error(error); process.exitCode = 1 })
