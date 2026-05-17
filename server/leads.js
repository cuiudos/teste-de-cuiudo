const fs = require('fs');
const path = require('path');

const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');

function saveLead(lead) {
  const dir = path.dirname(LEADS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const leads = fs.existsSync(LEADS_FILE)
    ? JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'))
    : [];

  const entry = {
    ...lead,
    id: `lead_${Date.now()}`,
    recebidoEm: new Date().toISOString(),
  };

  leads.unshift(entry);
  if (leads.length > 500) leads.length = 500;
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
  return entry;
}

module.exports = { saveLead };
