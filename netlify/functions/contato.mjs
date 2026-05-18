const TOKEN_SECRETO = process.env.TOKEN_SECRETO || 'KM2025STUDIO';
const LIMITE_SEGUNDOS = Number(process.env.LIMITE_SEGUNDOS || 60);
const LIMITE_TENTATIVAS = Number(process.env.LIMITE_TENTATIVAS || 3);
const JANELA_MS = 3600000;
const MIN_FILL_MS = Number(process.env.MIN_FILL_MS || 3000);
const BRIDGE = (process.env.WHATSAPP_BRIDGE_URL || '').replace(/\/$/, '');

if (!globalThis.kmSpam) globalThis.kmSpam = {};
if (!globalThis.kmBlacklist) globalThis.kmBlacklist = [];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Secret-Token',
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

function getClientIp(headers) {
  return (
    headers.get('cf-connecting-ip') ||
    String(headers.get('x-forwarded-for') || '')
      .split(',')[0]
      .trim() ||
    headers.get('x-nf-client-connection-ip') ||
    'unknown'
  );
}

function normalizePhoneBR(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : '55' + digits;
}

function validateSubmission(body, ip) {
  const rateLimits = globalThis.kmSpam;
  const agora = Date.now();

  function bloquear(motivo, extra = {}, status = 403) {
    return { blocked: true, motivo, status, ip, ...extra };
  }

  if ((body._token || '') !== TOKEN_SECRETO) {
    return bloquear('Token invalido');
  }

  if (globalThis.kmBlacklist.includes(ip)) {
    return bloquear('IP na blacklist permanente');
  }

  if (String(body.website || '').trim() !== '') {
    return { blocked: true, silent: true, status: 200, ip };
  }

  if (Number(body.elapsed_ms || 9999) < MIN_FILL_MS) {
    return bloquear('Preenchimento rapido demais', { elapsed_ms: body.elapsed_ms });
  }

  for (const key of Object.keys(rateLimits)) {
    if (agora - rateLimits[key].primeiroEnvio > JANELA_MS * 2) {
      delete rateLimits[key];
    }
  }

  if (!rateLimits[ip]) {
    rateLimits[ip] = { ultimoEnvio: agora, tentativas: 1, primeiroEnvio: agora };
  } else {
    const reg = rateLimits[ip];
    const dentroJanela = agora - reg.primeiroEnvio < JANELA_MS;

    if (agora - reg.ultimoEnvio < LIMITE_SEGUNDOS * 1000) {
      const aguardar = Math.ceil(
        (LIMITE_SEGUNDOS * 1000 - (agora - reg.ultimoEnvio)) / 1000
      );
      return bloquear(`Envio rapido demais — aguarde ${aguardar}s`, { aguardar_s: aguardar }, 429);
    }

    if (dentroJanela && reg.tentativas >= LIMITE_TENTATIVAS) {
      return bloquear(`Limite de ${LIMITE_TENTATIVAS} envios por hora excedido`, {
        tentativas: reg.tentativas,
      });
    }

    reg.ultimoEnvio = agora;
    reg.tentativas = dentroJanela ? reg.tentativas + 1 : 1;
    if (!dentroJanela) reg.primeiroEnvio = agora;
  }

  const nome = String(body.nome || body.name || '').trim();
  const email = String(body.email || '').trim();
  const telefone = normalizePhoneBR(body.telefone || body.phone || '');
  const servico = String(body.servico || body.interest || '').trim();
  const mensagem = String(body.mensagem || body.message || '').trim();

  if (telefone.length < 12 || telefone.length > 13) {
    return bloquear('Telefone invalido', { tamanho: telefone.length });
  }

  return {
    blocked: false,
    data: { nome, email, telefone, servico, mensagem, _ip: ip },
  };
}

async function forwardToBridge(body, headerToken) {
  const res = await fetch(`${BRIDGE}/api/contato`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Secret-Token': headerToken || body._token || TOKEN_SECRETO,
      'X-Bridge-Proxy': 'netlify',
      'ngrok-skip-browser-warning': 'true',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== 'POST') {
    return json(405, { ok: false, erro: 'Metodo nao permitido' });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, erro: 'JSON invalido' });
  }

  const headerToken = req.headers.get('x-secret-token');
  if (headerToken) body._token = body._token || headerToken;

  const ip = getClientIp(req.headers);
  const result = validateSubmission(body, ip);

  if (result.blocked) {
    if (result.silent) return json(200, { ok: true });
    return json(result.status || 403, {
      ok: false,
      erro: result.motivo,
      ...(result.aguardar_s ? { aguardar_s: result.aguardar_s } : {}),
    });
  }

  console.log('[LEAD]', JSON.stringify({ ...result.data, recebidoEm: new Date().toISOString() }));

  if (!BRIDGE) {
    return json(503, {
      ok: false,
      erro:
        'Configure WHATSAPP_BRIDGE_URL no Netlify (URL do abrir-tunel.bat + iniciar-teste.bat no PC).',
    });
  }

  try {
    return await forwardToBridge(body, headerToken);
  } catch (err) {
    console.error('[Bridge]', err);
    return json(503, {
      ok: false,
      erro:
        'Servidor da recepcao offline. No PC: rode iniciar-teste.bat e abrir-tunel.bat (cloudflare) e confira a URL no Netlify.',
    });
  }
};
