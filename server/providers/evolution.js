function config() {
  return {
    base: (process.env.EVOLUTION_API_URL || '').replace(/\/$/, ''),
    instance: process.env.EVOLUTION_INSTANCE || '',
    key: process.env.EVOLUTION_API_KEY || '',
  };
}

function formatNumber(digits) {
  const n = String(digits || '').replace(/\D/g, '');
  if (!n) return '';
  const suffix = process.env.EVOLUTION_NUMBER_SUFFIX || '@s.whatsapp.net';
  if (n.includes('@')) return n;
  return suffix.startsWith('@') ? `${n}${suffix}` : n;
}

async function sendText(toDigits, text) {
  const { base, instance, key } = config();
  if (!base || !instance || !key) {
    return { ok: false, skipped: true, reason: 'Evolution API nao configurada' };
  }

  const number = formatNumber(toDigits);
  const url = `${base}/message/sendText/${encodeURIComponent(instance)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
    },
    body: JSON.stringify({ number, text }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[Evolution]', data);
    return { ok: false, error: data };
  }
  return { ok: true, data };
}

function isConfigured() {
  const { base, instance, key } = config();
  return Boolean(base && instance && key);
}

module.exports = { sendText, isConfigured, formatNumber };
