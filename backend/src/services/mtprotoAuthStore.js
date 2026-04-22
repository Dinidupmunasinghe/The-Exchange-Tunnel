const TTL_MS = 10 * 60 * 1000;
const store = new Map();

function key(userId, phone) {
  return `${String(userId)}::${String(phone).trim()}`;
}

function setPhoneCodeHash(userId, phone, phoneCodeHash) {
  const k = key(userId, phone);
  store.set(k, {
    phoneCodeHash: String(phoneCodeHash || ""),
    expiresAt: Date.now() + TTL_MS
  });
}

function getPhoneCodeHash(userId, phone) {
  const k = key(userId, phone);
  const row = store.get(k);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    store.delete(k);
    return null;
  }
  return row.phoneCodeHash || null;
}

function clearPhoneCodeHash(userId, phone) {
  store.delete(key(userId, phone));
}

module.exports = {
  setPhoneCodeHash,
  getPhoneCodeHash,
  clearPhoneCodeHash
};
