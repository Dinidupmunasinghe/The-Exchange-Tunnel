const TTL_MS = 10 * 60 * 1000;
const store = new Map();

function key(userId, phone) {
  const p = String(phone || "").trim();
  const normalized = p.startsWith("+") ? `+${p.replace(/[^\d]/g, "")}` : `+${p.replace(/[^\d]/g, "")}`;
  return `${String(userId)}::${normalized}`;
}

function setAuthState(userId, phone, phoneCodeHash, sessionString) {
  const k = key(userId, phone);
  store.set(k, {
    phoneCodeHash: String(phoneCodeHash || ""),
    sessionString: sessionString ? String(sessionString) : null,
    expiresAt: Date.now() + TTL_MS
  });
}

function getAuthState(userId, phone) {
  const k = key(userId, phone);
  const row = store.get(k);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    store.delete(k);
    return null;
  }
  return {
    phoneCodeHash: row.phoneCodeHash || null,
    sessionString: row.sessionString || null
  };
}

function clearPhoneCodeHash(userId, phone) {
  store.delete(key(userId, phone));
}

module.exports = {
  setAuthState,
  getAuthState,
  clearPhoneCodeHash
};
