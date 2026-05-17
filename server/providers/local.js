const fs = require('fs');
const path = require('path');

let client = null;
let ready = false;
let initStarted = false;

const WEB_VERSION =
  process.env.WWEB_VERSION_URL ||
  'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.3000.1014590669-alpha.html';

function onlyDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

async function resolveChatId(digits) {
  const number = onlyDigits(digits);
  if (!number) throw new Error('Numero de WhatsApp vazio');

  // API nova: resolve LID / JID corretamente (evita erro "No LID for user")
  if (typeof client.getNumberId === 'function') {
    const id = await client.getNumberId(number);
    if (id && id._serialized) return id._serialized;
  }

  if (typeof client.onWhatsApp === 'function') {
    const list = await client.onWhatsApp(`${number}@c.us`);
    const hit = Array.isArray(list) ? list.find((x) => x.exists) : list;
    if (hit && hit.jid) return hit.jid;
  }

  const legacy = `${number}@c.us`;
  if (typeof client.isRegisteredUser === 'function') {
    const reg = await client.isRegisteredUser(legacy);
    if (!reg) {
      throw new Error(
        'Este numero nao tem WhatsApp ou esta incorreto. Use DDD + 9 digitos (ex: 31 99222-6115).'
      );
    }
  }

  return legacy;
}

function init() {
  if (initStarted) return;
  initStarted = true;

  const { Client, LocalAuth } = require('whatsapp-web.js');
  const qrcode = require('qrcode-terminal');

  const sessionPath = path.join(__dirname, '..', 'data', 'wweb-session');

  const chromePaths = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA &&
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  ].filter(Boolean);

  const puppeteerOpts = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };

  for (const p of chromePaths) {
    if (p && fs.existsSync(p)) {
      puppeteerOpts.executablePath = p;
      console.log('Usando Chrome:', p);
      break;
    }
  }

  if (!puppeteerOpts.executablePath) {
    console.warn('Instale o Google Chrome: https://www.google.com/chrome/');
  }

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: sessionPath }),
    puppeteer: puppeteerOpts,
    webVersionCache: { type: 'remote', remotePath: WEB_VERSION },
  });

  client.on('qr', (qr) => {
    console.log('\n=== ESCANEIE COM O WHATSAPP DA RECEPCAO ===\n');
    qrcode.generate(qr, { small: true });
    console.log('\nWhatsApp → Aparelhos conectados → Conectar aparelho\n');
  });

  client.on('ready', () => {
    ready = true;
    console.log('✅ WhatsApp conectado! Teste em http://localhost:3000/contato.html');
  });

  client.on('auth_failure', () => {
    console.error('❌ Falha na autenticacao. Apague server/data/wweb-session e reinicie.');
  });

  client.on('disconnected', () => {
    ready = false;
    console.warn('⚠️ WhatsApp desconectado. Reinicie e escaneie o QR de novo.');
  });

  client.initialize().catch((err) => {
    console.error('Erro ao iniciar WhatsApp:', err.message);
  });
}

async function sendText(toDigits, text) {
  if (!client) init();
  if (!ready) {
    return {
      ok: false,
      skipped: true,
      reason: 'Aguarde "WhatsApp conectado" no terminal antes de enviar.',
    };
  }

  try {
    const chatId = await resolveChatId(toDigits);
    await client.sendMessage(chatId, text);
    console.log('[WhatsApp] Enviado para', onlyDigits(toDigits));
    return { ok: true };
  } catch (err) {
    const msg = err.message || String(err);
    console.error('[WhatsApp local]', msg);
    if (/no lid/i.test(msg)) {
      return {
        ok: false,
        error:
          'Erro LID do WhatsApp. Feche o servidor, apague a pasta server/data/wweb-session, rode iniciar-teste.bat e escaneie o QR de novo.',
      };
    }
    return { ok: false, error: msg };
  }
}

function isConfigured() {
  return ready;
}

function isLocalMode() {
  return (process.env.WHATSAPP_PROVIDER || 'local').toLowerCase() === 'local';
}

module.exports = { init, sendText, isConfigured, isLocalMode };
