'use strict';
// ---------------------------------------------------------------------------
// nbt-out.js - Elle NBT/paket yazici
//
// Neden gerekli?
//   minecraft-data kutuphanesi "custom_click_action" paketini yanlis tanimliyor
//   (payload alanini "option + NBT" olarak yaziyor). Gercek bicim:
//
//     1.21.6 - 1.21.8 : Identifier + NBT            (bos ise tek bayt 0 = TAG_END)
//     1.21.9 ve sonra : Identifier + VarInt uzunluk + NBT
//
//   Kutuphane yanlis yazdigi icin sunucu paketi cozemiyor ve
//   "DecoderException: Failed to decode packet" hatasiyla atiyor.
//   Bu yuzden paketi kendimiz bayt bayt uretip client.writeRaw ile yolluyoruz.
// ---------------------------------------------------------------------------

const TAGS = ['end', 'byte', 'short', 'int', 'long', 'float', 'double',
  'byteArray', 'string', 'list', 'compound', 'intArray', 'longArray'];

function tagId(name) {
  const n = String(name === undefined || name === null ? '' : name);
  const i = TAGS.indexOf(n);
  if (i >= 0) return i;
  // bazi surumler alt cizgili yazar (byte_array gibi)
  const alt = n.replace(/_([a-z])/g, (m, c) => c.toUpperCase());
  return TAGS.indexOf(alt);
}

function clampInt(v, lo, hi) {
  let n = Number(v);
  if (!isFinite(n)) n = 0;
  n = Math.trunc(n);
  return n < lo ? lo : (n > hi ? hi : n);
}

function varint(num) {
  const out = [];
  let v = Number(num) >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return Buffer.from(out);
}

function utf(text) {
  const body = Buffer.from(String(text === undefined || text === null ? '' : text), 'utf8');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(body.length, 0);
  return Buffer.concat([len, body]);
}

function writeLong(v) {
  const b = Buffer.alloc(8);
  if (Array.isArray(v)) { b.writeInt32BE(v[0] | 0, 0); b.writeInt32BE(v[1] | 0, 4); return b; }
  try {
    b.writeBigInt64BE(typeof v === 'bigint' ? v : BigInt(Math.trunc(Number(v) || 0)));
  } catch (_) { b.fill(0); }
  return b;
}

// Duz JS degerini NBT dugumune cevirir ({type, value})
function nodeFor(value) {
  if (value === null || value === undefined) return { type: 'string', value: '' };
  if (typeof value === 'boolean') return { type: 'byte', value: value ? 1 : 0 };
  if (typeof value === 'bigint') return { type: 'long', value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { type: 'int', value } : { type: 'double', value };
  }
  if (typeof value === 'string') return { type: 'string', value };
  if (Array.isArray(value)) return { type: 'list', value: { type: 'string', value: value.map(String) } };
  if (typeof value === 'object') {
    if (typeof value.type === 'string' && value.value !== undefined && tagId(value.type) > 0) return value; // hazir NBT
    return { type: 'compound', value };
  }
  return { type: 'string', value: String(value) };
}

function listItems(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && value.value !== undefined) {
    return Array.isArray(value.value) ? value.value : [value.value];
  }
  return [value];
}

function writeBody(parts, type, value) {
  let b;
  switch (type) {
    case 1: b = Buffer.alloc(1); b.writeInt8(clampInt(value, -128, 127), 0); parts.push(b); break;
    case 2: b = Buffer.alloc(2); b.writeInt16BE(clampInt(value, -32768, 32767), 0); parts.push(b); break;
    case 3: b = Buffer.alloc(4); b.writeInt32BE(clampInt(value, -2147483648, 2147483647), 0); parts.push(b); break;
    case 4: parts.push(writeLong(value)); break;
    case 5: b = Buffer.alloc(4); b.writeFloatBE(Number(value) || 0, 0); parts.push(b); break;
    case 6: b = Buffer.alloc(8); b.writeDoubleBE(Number(value) || 0, 0); parts.push(b); break;
    case 7: {
      const arr = listItems(value);
      b = Buffer.alloc(4 + arr.length);
      b.writeInt32BE(arr.length, 0);
      arr.forEach((n, i) => b.writeInt8(clampInt(n, -128, 127), 4 + i));
      parts.push(b);
      break;
    }
    case 8: parts.push(utf(value)); break;
    case 9: {
      const items = listItems(value);
      let et = value && typeof value === 'object' && value.type !== undefined ? tagId(value.type) : -1;
      if (et < 0) et = items.length ? tagId(nodeFor(items[0]).type) : 0;
      if (!items.length) et = 0;
      const head = Buffer.alloc(5);
      head.writeInt8(et < 0 ? 0 : et, 0);
      head.writeInt32BE(items.length, 1);
      parts.push(head);
      if (et > 0) items.forEach((it) => writeBody(parts, et, it));
      break;
    }
    case 10: writeCompound(parts, value); break;
    case 11: {
      const arr = listItems(value);
      b = Buffer.alloc(4 + arr.length * 4);
      b.writeInt32BE(arr.length, 0);
      arr.forEach((n, i) => b.writeInt32BE(clampInt(n, -2147483648, 2147483647), 4 + i * 4));
      parts.push(b);
      break;
    }
    case 12: {
      const arr = listItems(value);
      b = Buffer.alloc(4);
      b.writeInt32BE(arr.length, 0);
      parts.push(b);
      arr.forEach((n) => parts.push(writeLong(n)));
      break;
    }
    default: break;
  }
}

function writeCompound(parts, value) {
  let map = value;
  if (map && typeof map === 'object' && map.type === 'compound' && map.value !== undefined) map = map.value;
  if (!map || typeof map !== 'object') map = {};
  for (const key of Object.keys(map)) {
    const node = nodeFor(map[key]);
    const t = tagId(node.type);
    if (t <= 0) continue;
    parts.push(Buffer.from([t]));
    parts.push(utf(key));
    writeBody(parts, t, node.value);
  }
  parts.push(Buffer.from([0]));
}

// Isimsiz (anonim) NBT: tip bayti + govde. 1.20.2 ve sonrasi tum paketlerde boyle.
function writeAnonNbt(root) {
  const node = nodeFor(root === undefined ? {} : root);
  const t = tagId(node.type);
  if (t <= 0) return Buffer.from([0]);
  const parts = [Buffer.from([t])];
  writeBody(parts, t, node.value);
  return Buffer.concat(parts);
}

// custom_click_action paketinin tamami (paket kimligi dahil, uzunluk oneki haric)
function buildCustomClick(packetId, id, nbtRoot, withLengthPrefix) {
  const nbt = (nbtRoot === undefined || nbtRoot === null) ? Buffer.from([0]) : writeAnonNbt(nbtRoot);
  const idBuf = Buffer.from(String(id), 'utf8');
  const parts = [varint(packetId), varint(idBuf.length), idBuf];
  if (withLengthPrefix) parts.push(varint(nbt.length));
  parts.push(nbt);
  return Buffer.concat(parts);
}

module.exports = { writeAnonNbt, buildCustomClick, nodeFor, varint, tagId };
