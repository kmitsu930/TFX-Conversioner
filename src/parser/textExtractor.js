const { decodeText } = require("../utils/binary");

function isLikelyText(str) {
  if (!str) return false;
  const trimmed = str.trim();
  if (trimmed.length < 2) return false;
  if (/^[\x00-\x1F\x7F]+$/.test(trimmed)) return false;
  const printableRatio =
    (trimmed.match(/[\p{L}\p{N}\p{P}\p{Zs}]/gu) || []).length / trimmed.length;
  return printableRatio > 0.5;
}

function pushCandidate(target, value, encoding, offset, guessed = true) {
  if (!value) return;
  const normalized = value.replace(/\0/g, "").replace(/\r/g, "").trim();
  if (!isLikelyText(normalized)) return;
  target.push({
    value: normalized,
    encoding,
    offset,
    guessed
  });
}

function safeDecode(bytes, encoding) {
  try {
    return decodeText(bytes, encoding, false);
  } catch (e) {
    return "";
  }
}

function extractAsciiUtf8(bytes) {
  const results = [];
  let start = -1;

  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    const printable = (b >= 0x20 && b <= 0x7e) || b >= 0x80;
    if (printable) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      const len = i - start;
      if (len >= 3) {
        const slice = bytes.slice(start, i);
        pushCandidate(results, safeDecode(slice, "utf-8"), "utf8/ascii", start);
      }
      start = -1;
    }
  }

  if (start >= 0) {
    const slice = bytes.slice(start);
    if (slice.length >= 3) {
      pushCandidate(results, safeDecode(slice, "utf-8"), "utf8/ascii", start);
    }
  }

  return results;
}

function extractUtf16LE(bytes) {
  const results = [];
  for (let i = 0; i < bytes.length - 4; i += 2) {
    let end = i;
    let chars = 0;

    while (end + 1 < bytes.length) {
      const low = bytes[end];
      const high = bytes[end + 1];
      const code = low | (high << 8);

      const isAscii = high === 0 && low >= 0x20 && low <= 0x7e;
      const isJapanese =
        (code >= 0x3000 && code <= 0x30ff) ||
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0xff01 && code <= 0xff5e);

      if (isAscii || isJapanese) {
        chars += 1;
        end += 2;
      } else {
        break;
      }
    }

    if (chars >= 2) {
      const slice = bytes.slice(i, end);
      pushCandidate(results, safeDecode(slice, "utf-16le"), "utf16le", i);
      i = end - 2;
    }
  }
  return results;
}

function extractUtf16BE(bytes) {
  const results = [];
  for (let i = 0; i < bytes.length - 4; i += 2) {
    let end = i;
    let chars = 0;

    while (end + 1 < bytes.length) {
      const high = bytes[end];
      const low = bytes[end + 1];
      const code = (high << 8) | low;

      const isAscii = high === 0 && low >= 0x20 && low <= 0x7e;
      const isJapanese =
        (code >= 0x3000 && code <= 0x30ff) ||
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0xff01 && code <= 0xff5e);

      if (isAscii || isJapanese) {
        chars += 1;
        end += 2;
      } else {
        break;
      }
    }

    if (chars >= 2) {
      const raw = bytes.slice(i, end);
      const swapped = new Uint8Array(raw.length);
      for (let k = 0; k < raw.length; k += 2) {
        swapped[k] = raw[k + 1];
        swapped[k + 1] = raw[k];
      }
      pushCandidate(results, safeDecode(swapped, "utf-16le"), "utf16be", i);
      i = end - 2;
    }
  }
  return results;
}

function uniqByValue(candidates) {
  const seen = new Set();
  const output = [];
  for (const c of candidates) {
    const key = c.value;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(c);
  }
  return output;
}

function scoreCandidate(value) {
  let score = value.length;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)) score += 20;
  if (/[A-Za-z0-9]/.test(value)) score += 5;
  if (/^(Background Layer|Regular|FKT_|V4_)/i.test(value)) score -= 100;
  if (/^[A-Za-z0-9_\-\.]+$/.test(value) && value.length < 8) score -= 20;
  return score;
}

function pickMainText(candidates) {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => scoreCandidate(b.value) - scoreCandidate(a.value))[0];
}

function extractTextCandidates(bytes, logger) {
  const candidates = uniqByValue([
    ...extractAsciiUtf8(bytes),
    ...extractUtf16LE(bytes),
    ...extractUtf16BE(bytes)
  ]);

  const mainText = pickMainText(candidates);
  logger.info(`文字列候補: ${candidates.length}件`);
  if (mainText) {
    logger.info(`TEXT_MAIN候補: ${mainText.value}`);
  } else {
    logger.warn("TEXT_MAIN候補が見つかりませんでした");
  }

  return {
    mainText,
    candidates
  };
}

module.exports = {
  extractTextCandidates
};
