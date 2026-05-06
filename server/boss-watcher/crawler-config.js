const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'crawler-config.json');

const DEFAULTS = {
  cronMorning: '0 9 * * *',
  cronAfternoon: '0 14 * * *',
  pageSize: 30,
  maxPagesPerJob: 10,
  concurrency: 2,
  cityWhitelist: [],
  alertKeywords: []
};

function load() {
  if (!fs.existsSync(CONFIG_FILE)) return { ...DEFAULTS };
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return { ...DEFAULTS, ...raw };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(partial) {
  const next = { ...load(), ...partial };
  if (!Array.isArray(next.cityWhitelist)) next.cityWhitelist = [];
  if (!Array.isArray(next.alertKeywords)) next.alertKeywords = [];
  next.pageSize = clampInt(next.pageSize, 5, 50, DEFAULTS.pageSize);
  next.maxPagesPerJob = clampInt(next.maxPagesPerJob, 1, 50, DEFAULTS.maxPagesPerJob);
  next.concurrency = clampInt(next.concurrency, 1, 5, DEFAULTS.concurrency);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

module.exports = { load, save, DEFAULTS };
