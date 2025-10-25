const crypto = require('crypto');

const ALG = 'aes-256-gcm';

function getKey() {
  const raw = process.env.ENC_SECRET || '';
  if (!raw || raw.length < 16) throw new Error('ENC_SECRET is required');
  return crypto.createHash('sha256').update(String(raw)).digest();
}

function enc(obj) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const data = Buffer.from(JSON.stringify(obj || {}), 'utf8');
  const ct = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { alg: ALG, iv: iv.toString('base64'), tag: tag.toString('base64'), ct: ct.toString('base64') };
}

function dec(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const key = getKey();
  const iv = Buffer.from(String(payload.iv || ''), 'base64');
  const tag = Buffer.from(String(payload.tag || ''), 'base64');
  const ct = Buffer.from(String(payload.ct || ''), 'base64');
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(ct), decipher.final()]);
  try { return JSON.parse(out.toString('utf8')); } catch { return null; }
}

module.exports = { enc, dec };