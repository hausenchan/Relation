const path = require('path');
const Database = require('better-sqlite3');
const {
  ensureAiSuggestionTables,
  getCurrentAiSuggestionFeed,
  syncBundledAiSuggestionSeeds,
  syncDistillationAiSuggestionFeed,
} = require('../lib/aiSuggestionStore');

const businessLine = process.argv[2] || 'zhixiao';
const dbPath = process.env.RELATION_DB_PATH || path.join(__dirname, '../data.db');
const seedFilePath = path.join(__dirname, '../seeds/ai_suggestions', `${businessLine}.json`);

const db = new Database(dbPath);

try {
  ensureAiSuggestionTables(db);

  let result = null;
  try {
    result = syncDistillationAiSuggestionFeed(db, {
      businessLine,
      seedFilePath,
      sourceLabel: 'distillation_script',
    });
  } catch (error) {
    console.error(`蒸馏同步失败(${businessLine}):`, error.message);
  }

  if (!result) {
    const bundledResults = syncBundledAiSuggestionSeeds(db, { seedFiles: [seedFilePath] });
    result = bundledResults[0] || null;
  }

  const currentFeed = getCurrentAiSuggestionFeed(db, businessLine);
  if (!currentFeed) {
    throw new Error(`未找到 ${businessLine} 的 AI 建议快照`);
  }

  console.log(JSON.stringify({
    ok: true,
    business_line: businessLine,
    snapshot_key: currentFeed.meta?.snapshot_key || result?.snapshot_key || null,
    suggestion_count: currentFeed.meta?.suggestion_count || currentFeed.suggestions?.length || 0,
    seed_file: seedFilePath,
    data_source: result ? 'distillation_or_seed' : 'seed_only',
  }, null, 2));
} finally {
  db.close();
}
