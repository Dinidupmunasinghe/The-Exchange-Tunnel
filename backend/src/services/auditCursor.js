const { Op } = require("sequelize");
const db = require("../models");

/**
 * Persistent cursor so periodic audits walk through ALL rows over time (newest -> oldest,
 * then wrap around) instead of only ever re-checking the newest batch.
 * Stored in app_settings as "auditCursor:<name>" = last scanned id.
 */
const BATCH_SIZE = Math.max(1, Number(process.env.AUDIT_BATCH_SIZE || 25));

function settingKey(name) {
  return `auditCursor:${name}`;
}

async function get(name) {
  const row = await db.AppSetting.findOne({ where: { key: settingKey(name) } }).catch(() => null);
  const n = Number(row?.value || 0);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Extra `where` fragment for the next batch. */
function where(cursor) {
  return cursor ? { id: { [Op.lt]: cursor } } : {};
}

/** Save progress; a short batch means we reached the oldest row, so start over next time. */
async function advance(name, rows) {
  const next = rows.length >= BATCH_SIZE ? Number(rows[rows.length - 1].id) : 0;
  const key = settingKey(name);
  try {
    const [row, created] = await db.AppSetting.findOrCreate({
      where: { key },
      defaults: { key, value: String(next) }
    });
    if (!created) await row.update({ value: String(next) });
  } catch {
    // best effort; worst case the audit restarts from the newest rows
  }
}

module.exports = { get, where, advance, BATCH_SIZE };
