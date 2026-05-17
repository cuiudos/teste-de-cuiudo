const fs = require('fs');
const path = require('path');

const TOKEN_SECRETO = process.env.TOKEN_SECRETO || 'KM2025STUDIO';
const LIMITE_SEGUNDOS = Number(process.env.LIMITE_SEGUNDOS || 60);
const LIMITE_TENTATIVAS = Number(process.env.LIMITE_TENTATIVAS || 3);
const JANELA_MS = 3600000;
const MIN_FILL_MS = Number(process.env.MIN_FILL_MS || 3000);

const DATA_DIR = path.join(__dirname, 'data');
const RATE_FILE = path.join(DATA_DIR, 'rate-limits.json');
const BLACKLIST_FILE = path.join(DATA_DIR, 'blacklist.json');
const LOG_FILE = path.join(DATA_DIR, 'bloqueios.json');

function readJson(file, fallback) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {}
  return fallback;
}

function writeJson(file, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function getClientIp(req) {
  return (
    req.headers['cf-connecting-ip'] ||
    String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

function normalizePhoneBR(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : '55' + digits;
}

function validateSubmission(body, ip) {
  const blacklist = readJson(BLACKLIST_FILE, []);
  const rateLimits = readJson(RATE_FILE, {});
  const bloqueiosLog = readJson(LOG_FILE, []);
  const agora = Date.now();

  function logBloqueio(motivo, extra = {}) {
    const entrada = { ip, motivo, hora: new Date().toISOString(), ...extra };
    bloqueiosLog.unshift(entrada);
    if (bloqueiosLog.length > 100) bloqueiosLog.length = 100;
    writeJson(LOG_FILE, bloqueiosLog);
    return { blocked: true, motivo, status: 403, ip, ...extra };
  }

  const token = body._token || '';
  if (token !== TOKEN_SECRETO) {
    return logBloqueio('Token invalido', { token_recebido: token ? '[redacted]' : '' });
  }

  if (blacklist.includes(ip)) {
    return logBloqueio('IP na blacklist permanente');
  }

  const honeypot = String(body.website || '').trim();
  if (honeypot !== '') {
    return { blocked: true, honeypot: true, silent: true, status: 200, ip };
  }

  const elapsed = Number(body.elapsed_ms || 9999);
  if (elapsed < MIN_FILL_MS) {
    return logBloqueio('Preenchimento rapido demais', { elapsed_ms: elapsed });
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
      writeJson(RATE_FILE, rateLimits);
      return logBloqueio(`Envio rapido demais — aguarde ${aguardar}s`, { aguardar_s: aguardar });
    }

    if (dentroJanela && reg.tentativas >= LIMITE_TENTATIVAS) {
      writeJson(RATE_FILE, rateLimits);
      return logBloqueio(`Limite de ${LIMITE_TENTATIVAS} envios por hora excedido`, {
        tentativas: reg.tentativas,
      });
    }

    reg.ultimoEnvio = agora;
    reg.tentativas = dentroJanela ? reg.tentativas + 1 : 1;
    if (!dentroJanela) reg.primeiroEnvio = agora;
  }

  writeJson(RATE_FILE, rateLimits);

  const nome = String(body.nome || body.name || '').trim();
  const email = String(body.email || '').trim();
  const telefone = normalizePhoneBR(body.telefone || body.phone || '');
  const servico = String(body.servico || body.interest || '').trim();
  const mensagem = String(body.mensagem || body.message || '').trim();

  if (telefone.length < 12 || telefone.length > 13) {
    return logBloqueio('Telefone invalido', {
      telefone_recebido: telefone,
      tamanho: telefone.length,
    });
  }

  return {
    blocked: false,
    data: {
      nome,
      email,
      telefone,
      servico,
      mensagem,
      _ip: ip,
      _tentativas: rateLimits[ip]?.tentativas || 1,
    },
  };
}

module.exports = {
  TOKEN_SECRETO,
  getClientIp,
  validateSubmission,
};
