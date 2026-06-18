// ISO 8583 encoder for the Flossx83 java-switch.
//
// Wire format expected by Iso8583Parser (ASCII string, HTTP POST body):
//   MTI(4) + primaryBitmap(16 hex) + [secondaryBitmap(16 hex) if any field>64] + data elements
// Fixed fields are written at their exact max length; numeric ('n'/'xn') are
// right-justified zero-filled, others left-justified space-filled. Variable
// fields (LLVAR/LLLVAR) are prefixed by their length (2 digits if max<=99, else
// 3) then the value. This mirrors the parser so a message we encode is exactly
// what it decodes.

// field -> [maxLength, variable, type]  (from Iso8583Field.java)
export const FIELD_DEFS = {
  2: [19, true, "n"], 3: [6, false, "n"], 4: [12, false, "n"], 5: [12, false, "n"],
  6: [12, false, "n"], 7: [10, false, "n"], 9: [8, false, "n"], 10: [8, false, "n"],
  11: [6, false, "n"], 12: [6, false, "n"], 13: [4, false, "n"], 14: [4, false, "n"],
  15: [4, false, "n"], 16: [4, false, "n"], 17: [4, false, "n"], 18: [4, false, "n"],
  19: [3, false, "n"], 20: [3, false, "n"], 21: [3, false, "n"], 22: [3, false, "n"],
  23: [3, false, "n"], 24: [4, false, "n"], 25: [2, false, "n"], 26: [2, false, "n"],
  27: [1, false, "n"], 28: [9, false, "xn"], 29: [9, false, "xn"], 30: [9, false, "xn"],
  31: [9, false, "xn"], 32: [11, true, "n"], 33: [11, true, "n"], 34: [28, true, "z"],
  35: [37, true, "z"], 36: [104, true, "z"], 37: [12, false, "an"], 38: [6, false, "an"],
  39: [2, false, "an"], 40: [3, false, "n"], 41: [8, false, "ans"], 42: [15, false, "ans"],
  43: [40, false, "ans"], 44: [25, true, "an"], 45: [76, true, "ans"], 46: [999, true, "an"],
  47: [999, true, "an"], 48: [999, true, "an"], 49: [3, false, "n"], 50: [3, false, "n"],
  51: [3, false, "n"], 52: [16, false, "b"], 53: [48, false, "an"], 54: [120, true, "an"],
  55: [255, true, "b"], 56: [255, true, "an"], 57: [255, true, "an"], 58: [6, false, "an"],
  59: [999, true, "an"], 60: [999, true, "an"], 61: [999, true, "an"], 62: [999, true, "an"],
  63: [999, true, "an"], 64: [16, false, "b"],
};

const isNumericType = (t) => t === "n" || t === "xn";

function padFixed(value, len, type) {
  let v = String(value ?? "");
  if (v.length > len) v = v.slice(0, len); // never overflow the fixed slot
  return isNumericType(type)
    ? v.padStart(len, "0")
    : v.padEnd(len, " ");
}

function encodeField(field, rawValue) {
  const def = FIELD_DEFS[field];
  if (!def) throw new Error(`Unsupported field ${field}`);
  const [maxLen, variable, type] = def;
  const value = String(rawValue ?? "");
  if (!variable) return padFixed(value, maxLen, type);

  if (value.length > maxLen) {
    throw new Error(`Field ${field} length ${value.length} exceeds max ${maxLen}`);
  }
  const lengthDigits = maxLen > 99 ? 3 : 2;
  return String(value.length).padStart(lengthDigits, "0") + value;
}

// Build a 64-bit bitmap (fields lo..lo+63) as 16 hex chars.
function bitmapHex(presentFields, lo) {
  const bytes = new Array(8).fill(0);
  for (const f of presentFields) {
    const g = f - lo; // 0-based bit index within this map
    if (g < 0 || g > 63) continue;
    const byteIdx = Math.floor(g / 8);
    const bitInByte = 7 - (g % 8); // bit 0 of field => MSB
    bytes[byteIdx] |= 1 << bitInByte;
  }
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Encode an ISO 8583 message.
 * @param {Object} msg { mti: "1200", fields: { 2:"4111...", 4:"000000001550", ... } }
 * @returns {string} the ASCII wire message
 */
export function encode({ mti, fields }) {
  if (!/^\d{4}$/.test(mti || "")) throw new Error("MTI must be 4 digits");

  const present = Object.keys(fields)
    .map(Number)
    .filter((f) => fields[f] !== undefined && fields[f] !== null && fields[f] !== "")
    .sort((a, b) => a - b);

  const hasSecondary = present.some((f) => f >= 65);
  const primaryFields = present.slice();
  if (hasSecondary) primaryFields.push(1); // bit 1 signals secondary bitmap

  let out = mti + bitmapHex(primaryFields, 1);
  if (hasSecondary) out += bitmapHex(present.filter((f) => f >= 65), 65);

  for (const f of present) out += encodeField(f, fields[f]);
  return out;
}

/**
 * Like encode(), but returns labelled segments so the UI can colour-code the
 * wire: [{kind:'mti'|'bitmap'|'field', label, text, field?}].
 */
export function encodeSegments({ mti, fields }) {
  const present = Object.keys(fields)
    .map(Number)
    .filter((f) => fields[f] !== undefined && fields[f] !== null && fields[f] !== "")
    .sort((a, b) => a - b);
  const hasSecondary = present.some((f) => f >= 65);
  const primaryFields = present.slice();
  if (hasSecondary) primaryFields.push(1);

  const segs = [{ kind: "mti", label: "MTI", text: mti }];
  segs.push({ kind: "bitmap", label: "Bitmap", text: bitmapHex(primaryFields, 1) });
  if (hasSecondary) {
    segs.push({ kind: "bitmap", label: "Bitmap 2", text: bitmapHex(present.filter((f) => f >= 65), 65) });
  }
  for (const f of present) {
    segs.push({ kind: "field", field: f, label: `DE${f}`, text: encodeField(f, fields[f]) });
  }
  return segs;
}

// --- public decoder (robust, never throws) ---

function hexToBits(hex) {
  const bits = [];
  for (let i = 0; i < 16; i++) {
    const val = parseInt(hex[i], 16);
    for (let bit = 0; bit < 4; bit++) bits[i * 4 + bit] = (val & (1 << (3 - bit))) !== 0;
  }
  return bits;
}

/**
 * Decode an ISO 8583 ASCII message without throwing.
 * Returns as much info as possible even on errors.
 */
export function decodeMessage(raw) {
  const errors = [];
  const segments = [];
  const fields = [];

  const msg = raw.trim();

  for (let i = 0; i < msg.length; i++) {
    const code = msg.charCodeAt(i);
    if (code < 32 || code > 126) {
      errors.push(`caractère non conforme à la position ${i + 1}`);
      return { ok: false, mti: null, bitmapHex: null, secondaryHex: null, presentFields: [], segments, fields, errors };
    }
  }

  if (msg.length < 20) {
    errors.push(`message trop court (${msg.length} caractères, min 20)`);
    return { ok: false, mti: null, bitmapHex: null, secondaryHex: null, presentFields: [], segments, fields, errors };
  }

  let cursor = 0;

  const mti = msg.slice(0, 4);
  if (!/^\d{4}$/.test(mti)) {
    errors.push(`MTI invalide : "${mti}" n'est pas 4 chiffres`);
    return { ok: false, mti: null, bitmapHex: null, secondaryHex: null, presentFields: [], segments, fields, errors };
  }
  segments.push({ kind: "mti", label: "MTI", text: mti });
  cursor = 4;

  const primaryHex = msg.slice(cursor, cursor + 16);
  if (!/^[0-9A-Fa-f]{16}$/.test(primaryHex)) {
    errors.push(`bitmap primaire invalide : "${primaryHex}" n'est pas 16 caractères hexadécimaux`);
    return { ok: false, mti, bitmapHex: null, secondaryHex: null, presentFields: [], segments, fields, errors };
  }
  segments.push({ kind: "bitmap", label: "Bitmap", text: primaryHex });
  cursor += 16;

  const primaryBits = hexToBits(primaryHex);
  let combined = primaryBits.slice();
  let secondaryHex = null;

  if (primaryBits[0]) {
    if (cursor + 16 > msg.length) {
      errors.push("bitmap secondaire manquant (bit 1 du primaire positionné mais message trop court)");
    } else {
      secondaryHex = msg.slice(cursor, cursor + 16);
      if (!/^[0-9A-Fa-f]{16}$/.test(secondaryHex)) {
        errors.push(`bitmap secondaire invalide : "${secondaryHex}" n'est pas 16 caractères hexadécimaux`);
        secondaryHex = null;
      }
    }
    if (secondaryHex) {
      segments.push({ kind: "bitmap", label: "Bitmap 2", text: secondaryHex });
      const secondaryBits = hexToBits(secondaryHex);
      for (let i = 0; i < 64; i++) combined[i + 64] = secondaryBits[i];
      cursor += 16;
    }
  }

  const presentFields = [];
  for (let f = 2; f <= 128; f++) {
    if (combined[f - 1]) presentFields.push(f);
  }

  let fieldError = false;
  for (const f of presentFields) {
    if (fieldError) {
      fields.push({ field: f, label: "", error: "décodage arrêté après une erreur précédente" });
      continue;
    }

    const def = FIELD_DEFS[f];
    if (!def) {
      errors.push(`DE${f} non supporté`);
      fields.push({ field: f, label: "", error: "non supporté" });
      continue;
    }

    const [maxLen, variable, type] = def;

    if (variable) {
      const ld = maxLen > 99 ? 3 : 2;
      if (cursor + ld > msg.length) {
        errors.push(`DE${f}: préfixe de longueur manquant, message tronqué`);
        fieldError = true;
        continue;
      }
      const lenStr = msg.slice(cursor, cursor + ld);
      if (!/^\d+$/.test(lenStr)) {
        errors.push(`DE${f}: préfixe de longueur "${lenStr}" non numérique à la position ${cursor + 1}`);
        fieldError = true;
        continue;
      }
      const declaredLen = parseInt(lenStr, 10);
      cursor += ld;

      if (declaredLen > maxLen) {
        errors.push(`DE${f}: longueur déclarée ${declaredLen} dépasse le max ${maxLen}`);
      }
      if (cursor + declaredLen > msg.length) {
        errors.push(`DE${f}: message tronqué, attendu ${declaredLen} caractères, il en reste ${msg.length - cursor}`);
        fieldError = true;
        continue;
      }
      const value = msg.slice(cursor, cursor + declaredLen);

      if ((f === 2 || f === 3 || f === 4 || f === 11) && !/^\d+$/.test(value)) {
        errors.push(`DE${f} doit être numérique, reçu "${value}"`);
      }

      segments.push({ kind: "field", field: f, label: `DE${f}`, text: lenStr + value });
      fields.push({ field: f, type, variable: true, declaredLength: declaredLen, value });
      cursor += declaredLen;
    } else {
      if (cursor + maxLen > msg.length) {
        errors.push(`DE${f} (fixe ${maxLen}): message tronqué, attendu ${maxLen} caractères, il en reste ${msg.length - cursor}`);
        fieldError = true;
        continue;
      }
      const value = msg.slice(cursor, cursor + maxLen);

      if ((f === 3 || f === 4 || f === 11) && !/^\d+$/.test(value)) {
        errors.push(`DE${f} doit être numérique, reçu "${value}"`);
      }

      segments.push({ kind: "field", field: f, label: `DE${f}`, text: value });
      fields.push({ field: f, type, variable: false, declaredLength: maxLen, value });
      cursor += maxLen;
    }
  }

  if (cursor < msg.length) {
    errors.push(`longueur incohérente : ${msg.length - cursor} caractère(s) en trop après le dernier champ`);
  }

  return {
    ok: errors.length === 0,
    mti,
    bitmapHex: primaryHex,
    secondaryHex,
    presentFields,
    segments,
    fields,
    errors,
  };
}

// --- MTI breakdown helper ---

const _VER = {0:"ISO 8583:1987",1:"1993",2:"2003",8:"National",9:"Privé"};
const _CLA = {1:"Autorisation",2:"Financière",3:"Action fichier",4:"Extourne/reversal",5:"Réconciliation",6:"Administrative",7:"Frais",8:"Gestion réseau",9:"Réservé"};
const _FCT = {0:"Demande",1:"Réponse à demande",2:"Avis",3:"Réponse à avis",4:"Notification",5:"Acquittement notification",6:"Instruction",7:"Acquittement instruction"};
const _ORI = {0:"Acquéreur",1:"Acquéreur (répétition)",2:"Émetteur",3:"Émetteur (répétition)",4:"Autre",5:"Autre (répétition)"};
const _FMT = {n:"Numérique",a:"Alphabétique",an:"Alphanumérique",ans:"Alphanumérique+spéciaux",b:"Binaire",z:"Piste (track)",xn:"Numérique signé"};

export function MTI_INFO(mti) {
  if (!mti || mti.length !== 4) return null;
  const d = mti.split("").map(Number);
  return {
    version: _VER[d[0]] || "réservé/inconnu",
    classe: _CLA[d[1]] || "réservé/inconnu",
    fonction: _FCT[d[2]] || "réservé/inconnu",
    origine: _ORI[d[3]] || "réservé/inconnu",
  };
}

export function formatInfo(field) {
  const def = FIELD_DEFS[field];
  if (!def) return null;
  const [maxLen, variable, type] = def;
  const longueur = variable
    ? (maxLen > 99 ? `LLLVAR (max ${maxLen})` : `LLVAR (max ${maxLen})`)
    : `fixe ${maxLen}`;
  return { code: type, libelle: _FMT[type] || type, longueur };
}

// --- framed decoder (length-prefixed stream) ---

export function decodeFramed(raw, prefixWidth = 4) {
  const errors = [];
  const messages = [];
  const cleaned = raw.replace(/[\r\n]/g, "").trim();
  let cursor = 0;

  while (cursor < cleaned.length) {
    if (cursor + prefixWidth > cleaned.length) {
      errors.push(`préfixe incomplet en fin de flux (${cleaned.length - cursor} caractères orphelins)`);
      break;
    }
    const prefix = cleaned.slice(cursor, cursor + prefixWidth);
    if (!/^\d{4}$/.test(prefix)) {
      errors.push(`transaction ${messages.length + 1}: préfixe de longueur non numérique "${prefix}"`);
      break;
    }
    const declaredLen = parseInt(prefix, 10);
    cursor += prefixWidth;
    if (declaredLen === 0) {
      errors.push(`transaction ${messages.length + 1}: longueur nulle`);
      break;
    }
    if (cursor + declaredLen > cleaned.length) {
      const available = cleaned.length - cursor;
      const partial = cleaned.slice(cursor);
      errors.push(`transaction ${messages.length + 1} tronquée: longueur déclarée ${declaredLen} mais seulement ${available} caractères disponibles`);
      messages.push({
        index: messages.length + 1,
        declaredLength: declaredLen,
        raw: partial,
        decoded: decodeMessage(partial),
        truncated: true,
      });
      break;
    }
    const slice = cleaned.slice(cursor, cursor + declaredLen);
    messages.push({
      index: messages.length + 1,
      declaredLength: declaredLen,
      raw: slice,
      decoded: decodeMessage(slice),
    });
    cursor += declaredLen;
  }

  return {
    ok: errors.length === 0 && messages.every((m) => m.decoded.ok),
    count: messages.length,
    messages,
    errors,
  };
}

// --- decoder that mirrors Iso8583Parser, for self-tests only ---
export function decode(message) {
  const hexToBits = (hex) => {
    const bits = [];
    for (let i = 0; i < 16; i++) {
      const val = parseInt(hex[i], 16);
      for (let bit = 0; bit < 4; bit++) bits[i * 4 + bit] = (val & (1 << (3 - bit))) !== 0;
    }
    return bits;
  };
  const mti = message.slice(0, 4);
  const primary = hexToBits(message.slice(4, 20));
  let cursor = 20;
  let combined = primary.slice();
  if (primary[0]) {
    const secondary = hexToBits(message.slice(cursor, cursor + 16));
    cursor += 16;
    for (let i = 0; i < 64; i++) combined[i + 64] = secondary[i];
  }
  const fields = {};
  for (let f = 2; f <= 128; f++) {
    if (!combined[f - 1]) continue;
    const def = FIELD_DEFS[f];
    if (!def) throw new Error(`Unsupported field ${f}`);
    const [maxLen, variable] = def;
    let len;
    if (variable) {
      const ld = maxLen > 99 ? 3 : 2;
      len = parseInt(message.slice(cursor, cursor + ld), 10);
      cursor += ld;
    } else len = maxLen;
    fields[f] = message.slice(cursor, cursor + len);
    cursor += len;
  }
  return { mti, fields };
}
