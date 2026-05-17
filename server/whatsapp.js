const evolution = require('./providers/evolution');
const local = require('./providers/local');

const WHATSAPP_PROVIDER = (process.env.WHATSAPP_PROVIDER || 'local').toLowerCase();
const STUDIO_WHATSAPP = (process.env.STUDIO_WHATSAPP || '').replace(/\D/g, '');

const META_TOKEN = process.env.WHATSAPP_TOKEN || '';
const META_PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const TEMPLATE_CLIENT = process.env.WHATSAPP_TEMPLATE_CLIENT || '';
const TEMPLATE_STUDIO = process.env.WHATSAPP_TEMPLATE_STUDIO || '';
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR';
const META_API = 'https://graph.facebook.com/v21.0';

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
    `*Nome:* ${lead.nome}\n` +
    `*WhatsApp:* ${lead.telefone}\n` +
    `*E-mail:* ${lead.email || '—'}\n` +
    `*Interesse:* ${lead.servico || '—'}\n` +
    `*Mensagem:*\n${lead.mensagem || '—'}`
  );
}

async function sendMetaText(toDigits, text) {
  if (!META_TOKEN || !META_PHONE_ID) {
    return { ok: false, skipped: true, reason: 'Meta WhatsApp nao configurado' };
  }
  const res = await fetch(`${META_API}/${META_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${META_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toDigits,
      type: 'text',
      text: { body: text },
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data: res.ok ? data : { error: data } };
}

async function sendMetaTemplate(toDigits, name, params) {
  if (!META_TOKEN || !META_PHONE_ID) {
    return { ok: false, skipped: true };
  }
  const components = params.length
    ? [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) }]
    : [];
  const res = await fetch(`${META_API}/${META_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${META_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: toDigits,
      type: 'template',
      template: { name, language: { code: TEMPLATE_LANG }, components },
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

async function sendText(toDigits, text) {
  if (WHATSAPP_PROVIDER === 'meta') return sendMetaText(toDigits, text);
  if (WHATSAPP_PROVIDER === 'local') return local.sendText(toDigits, text);
  return evolution.sendText(toDigits, text);
}

async function notifyLead(lead) {
  const results = { client: null, studio: null, provider: WHATSAPP_PROVIDER };

  if (WHATSAPP_PROVIDER === 'meta' && TEMPLATE_CLIENT) {
    results.client = await sendMetaTemplate(lead.telefone, TEMPLATE_CLIENT, [
      lead.nome,
      lead.servico || 'seu interesse',
    ]);
  } else {
    results.client = await sendText(lead.telefone, clientMessage(lead));
  }

  if (STUDIO_WHATSAPP) {
    if (WHATSAPP_PROVIDER === 'meta' && TEMPLATE_STUDIO) {
      results.studio = await sendMetaTemplate(STUDIO_WHATSAPP, TEMPLATE_STUDIO, [
        lead.nome,
        lead.telefone,
        lead.servico || '—',
      ]);
    } else {
      results.studio = await sendText(STUDIO_WHATSAPP, studioMessage(lead));
    }
  }

  return results;
}

function isConfigured() {
  if (WHATSAPP_PROVIDER === 'meta') return Boolean(META_TOKEN && META_PHONE_ID);
  if (WHATSAPP_PROVIDER === 'local') return local.isConfigured();
  return evolution.isConfigured();
}

function startProvider() {
  if (WHATSAPP_PROVIDER === 'local') local.init();
}

module.exports = { notifyLead, isConfigured, startProvider };
