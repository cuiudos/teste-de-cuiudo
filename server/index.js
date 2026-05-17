const http = require('http');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const { getClientIp, validateSubmission, TOKEN_SECRETO } = require('./anti-spam');
const { notifyLead, isConfigured, startProvider } = require('./whatsapp');
const { saveLead } = require('./leads');

const PORT = Number(process.env.PORT || 3000);
const SITE_ROOT = path.join(__dirname, '..');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function corsHeaders(origin) {
  const allowed =
    !ALLOWED_ORIGINS.length ||
    ALLOWED_ORIGINS.includes('*') ||
    ALLOWED_ORIGINS.includes(origin);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Secret-Token',
  };
  if (allowed && origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else if (ALLOWED_ORIGINS.includes('*')) {
    headers['Access-Control-Allow-Origin'] = '*';
  }
  return headers;
}

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON invalido'));
      }
    });
    req.on('error', reject);
  });
}

function getToken(body, req) {
  return body._token || req.headers['x-secret-token'] || '';
}

async function handleContact(req, res, origin) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { ok: false, erro: 'Corpo da requisicao invalido' }, corsHeaders(origin));
  }

  const ip = getClientIp(req);
  body._token = getToken(body, req);

  const result = validateSubmission(body, ip);

  if (result.blocked) {
    if (result.silent) {
      return sendJson(res, 200, { ok: true }, corsHeaders(origin));
    }
    const status = result.status || 403;
    const msg = result.motivo || 'Bloqueado';
    if (result.aguardar_s) {
      return sendJson(
        res,
        429,
        { ok: false, erro: msg, aguardar_s: result.aguardar_s },
        corsHeaders(origin)
      );
    }
    return sendJson(res, status, { ok: false, erro: msg }, corsHeaders(origin));
  }

  const lead = result.data;
  const saved = saveLead(lead);

  const provider = (process.env.WHATSAPP_PROVIDER || 'local').toLowerCase();
  let whatsapp = { enviado: false, motivo: '' };

  try {
    const wa = await notifyLead(lead);
    whatsapp.enviado = Boolean(wa.client?.ok);
    if (!whatsapp.enviado) {
      whatsapp.motivo =
        wa.client?.reason || wa.client?.error || 'Nao foi possivel enviar pelo WhatsApp da recepcao';
    }
  } catch (err) {
    console.error('[notifyLead]', err);
    whatsapp.motivo = err.message;
  }

  if (provider === 'local' && !whatsapp.enviado) {
    return sendJson(
      res,
      503,
      {
        ok: false,
        erro:
          whatsapp.motivo ||
          'WhatsApp da recepcao offline. No terminal: escaneie o QR Code e aguarde "WhatsApp conectado".',
        id: saved.id,
      },
      corsHeaders(origin)
    );
  }

  return sendJson(
    res,
    200,
    {
      ok: true,
      id: saved.id,
      whatsapp_enviado: whatsapp.enviado,
      mensagem: whatsapp.enviado
        ? 'Pronto! A recepcao enviou uma mensagem no seu WhatsApp. Confira o celular.'
        : 'Recebemos seu contato! Nossa equipe entrara em contato em breve.',
    },
    corsHeaders(origin)
  );
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.normalize(path.join(SITE_ROOT, urlPath));
  if (!filePath.startsWith(SITE_ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    return res.end('Not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const data = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(data);
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin || '';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(origin));
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/api/health') {
    const provider = (process.env.WHATSAPP_PROVIDER || 'local').toLowerCase();
    return sendJson(
      res,
      200,
      {
        ok: true,
        provider,
        whatsapp_conectado: isConfigured(),
        token_configurado: Boolean(TOKEN_SECRETO),
      },
      corsHeaders(origin)
    );
  }

  if (req.method === 'POST' && req.url === '/api/contato') {
    return handleContact(req, res, origin);
  }

  if (req.method === 'GET') {
    return serveStatic(req, res);
  }

  sendJson(res, 404, { ok: false, erro: 'Rota nao encontrada' }, corsHeaders(origin));
});

startProvider();

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Porta ${PORT} ja esta em uso.`);
    console.error('   Feche a outra janela do servidor ou rode iniciar-teste.bat de novo.\n');
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '0.0.0.0', () => {
  const provider = (process.env.WHATSAPP_PROVIDER || 'local').toLowerCase();
  console.log(`KM Studio — http://localhost:${PORT}`);
  console.log(`  Site:    http://localhost:${PORT}/contato.html`);
  console.log(`  API:     POST http://localhost:${PORT}/api/contato`);
  console.log(`  WhatsApp: modo "${provider}" (gratis para teste = local + QR Code)`);
  if (provider === 'local') {
    console.log('  Aguarde o QR Code abaixo e escaneie com o celular da recepcao.');
  }
});
