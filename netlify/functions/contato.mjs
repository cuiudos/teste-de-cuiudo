const TOKEN_SECRETO = process.env.TOKEN_SECRETO || 'KM2025STUDIO';
const LIMITE_SEGUNDOS = Number(process.env.LIMITE_SEGUNDOS || 60);
const LIMITE_TENTATIVAS = Number(process.env.LIMITE_TENTATIVAS || 3);
const JANELA_MS = 3600000;
const MIN_FILL_MS = Number(process.env.MIN_FILL_MS || 3000);

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
    headers.get('client-ip') ||
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

  const token = body._token || '';
  if (token !== TOKEN_SECRETO) {
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

const WHATSAPP_PROVIDER = (process.env.WHATSAPP_PROVIDER || 'evolution').toLowerCase();

function clientMessage(lead) {
  return (
    `Olá, ${lead.nome}! 👋\n\n` +
    `Recebemos seu contato no *Kleber Mendes Studio*.\n` +
    `Sobre: ${lead.servico || 'seu interesse'}\n\n` +
    `Nossa recepção retorna em breve. Obrigado!\n\n— Equipe KM Studio`
  );
}

function studioMessage(lead) {
  return (
    `🆕 *Novo lead — site*\n\n` +
    `*Nome:* ${lead.nome}\n*WhatsApp:* ${lead.telefone}\n` +
    `*E-mail:* ${lead.email || '—'}\n*Interesse:* ${lead.servico || '—'}\n` +
    `*Mensagem:*\n${lead.mensagem || '—'}`
  );
}

function formatEvolutionNumber(digits) {
  const n = String(digits || '').replace(/\D/g, '');
  const suffix = process.env.EVOLUTION_NUMBER_SUFFIX || '@s.whatsapp.net';
  if (!n) return '';
  return suffix.startsWith('@') ? `${n}${suffix}` : n;
}

async function sendEvolutionText(toDigits, text) {
  const base = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const instance = process.env.EVOLUTION_INSTANCE || '';
  const key = process.env.EVOLUTION_API_KEY || '';
  if (!base || !instance || !key) {
    return { ok: false, skipped: true, reason: 'Evolution nao configurada' };
  }

  const res = await fetch(`${base}/message/sendText/${encodeURIComponent(instance)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify({ number: formatEvolutionNumber(toDigits), text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error('[Evolution]', data);
  return { ok: res.ok, data };
}

async function sendMetaText(toDigits, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return { ok: false, skipped: true };

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toDigits,
      type: 'text',
      text: { body: text },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) console.error('[Meta]', data);
  return { ok: res.ok, data };
}

async function sendText(toDigits, text) {
  if (WHATSAPP_PROVIDER === 'meta') return sendMetaText(toDigits, text);
  return sendEvolutionText(toDigits, text);
}

function isWhatsAppConfigured() {
  if (WHATSAPP_PROVIDER === 'meta') {
    return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
  }
  return Boolean(
    process.env.EVOLUTION_API_URL &&
      process.env.EVOLUTION_INSTANCE &&
      process.env.EVOLUTION_API_KEY
  );
}

async function notifyLead(lead) {
  const studio = (process.env.STUDIO_WHATSAPP || '').replace(/\D/g, '');
  const client = await sendText(lead.telefone, clientMessage(lead));
  const studioResult = studio ? await sendText(studio, studioMessage(lead)) : null;
  return { client, studio: studioResult, provider: WHATSAPP_PROVIDER };
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

  const lead = result.data;
  const id = `lead_${Date.now()}`;
  console.log('[LEAD]', JSON.stringify({ id, ...lead, recebidoEm: new Date().toISOString() }));

  let whatsappEnviado = false;
  try {
    const wa = await notifyLead(lead);
    whatsappEnviado = Boolean(wa.client?.ok || wa.studio?.ok);
  } catch (err) {
    console.error('[WhatsApp]', err);
  }

  const studio = (process.env.STUDIO_WHATSAPP || '5531999999999').replace(/\D/g, '');
  const waText = encodeURIComponent(
    `Ola! Sou ${lead.nome}. Vim pelo site KM Studio.\nInteresse: ${lead.servico || '-'}\nTel: ${lead.telefone}`
  );
  const wa_link = !whatsappEnviado && studio ? `https://wa.me/${studio}?text=${waText}` : null;

  return json(200, {
    ok: true,
    id,
    mensagem: whatsappEnviado
      ? 'Recebemos seu contato! Voce recebera uma mensagem no WhatsApp em instantes.'
      : 'Recebemos seu contato! Clique abaixo para falar com a recepcao no WhatsApp.',
    wa_link,
  });
};
