const { decodeText } = require("../utils/binary");

const DEFAULT_GROUP_GAP = 16;
const CONTEXT_BYTES = 32;

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

function pickMainText(candidates, groups = []) {
  if (groups.length > 0) {
    return [...groups]
      .sort((a, b) => b.text.length - a.text.length || a.startOffset - b.startOffset)
      .map((g) => ({ value: g.text, encoding: "utf16-object-group", offset: g.startOffset, guessed: true }))[0];
  }

  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => scoreCandidate(b.value) - scoreCandidate(a.value))[0];
}

function buildMask(bytesLength, excludedRanges) {
  const mask = new Uint8Array(bytesLength);
  for (const range of excludedRanges) {
    const start = Math.max(0, range.start);
    const end = Math.min(bytesLength, range.end);
    for (let i = start; i < end; i += 1) {
      mask[i] = 1;
    }
  }
  return mask;
}

function isAllowedCodePoint(code) {
  const isAsciiAlnum =
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a);
  const isJapanese =
    (code >= 0x3040 && code <= 0x309f) ||
    (code >= 0x30a0 && code <= 0x30ff) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xff66 && code <= 0xff9d);
  const isFullWidthAlnum =
    (code >= 0xff10 && code <= 0xff19) ||
    (code >= 0xff21 && code <= 0xff3a) ||
    (code >= 0xff41 && code <= 0xff5a);

  return isAsciiAlnum || isJapanese || isFullWidthAlnum;
}

function toHex(value) {
  return value.toString(16).padStart(2, "0");
}

function buildContextDump(bytes, offset, contextBytes = CONTEXT_BYTES) {
  const from = Math.max(0, offset - contextBytes);
  const to = Math.min(bytes.length, offset + 2 + contextBytes);
  const parts = [];
  for (let i = from; i < to; i += 1) {
    parts.push(toHex(bytes[i]));
  }
  return {
    from,
    to,
    hex: parts.join(" ")
  };
}

function collectCharCandidates(bytes, excludedRanges = []) {
  const excludedMask = buildMask(bytes.length, excludedRanges);
  const results = [];

  for (let i = 0; i + 1 < bytes.length; i += 2) {
    if (excludedMask[i] || excludedMask[i + 1]) continue;

    const le = bytes[i] | (bytes[i + 1] << 8);
    if (isAllowedCodePoint(le)) {
      const char = String.fromCodePoint(le);
      const context = buildContextDump(bytes, i);
      results.push({
        char,
        offset: i,
        encoding: "utf16le",
        context
      });
    }

    const be = (bytes[i] << 8) | bytes[i + 1];
    if (isAllowedCodePoint(be)) {
      const char = String.fromCodePoint(be);
      const context = buildContextDump(bytes, i);
      results.push({
        char,
        offset: i,
        encoding: "utf16be",
        context
      });
    }
  }

  const uniq = [];
  const seen = new Set();
  for (const candidate of results) {
    const key = `${candidate.offset}:${candidate.char}:${candidate.encoding}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(candidate);
  }

  uniq.sort((a, b) => a.offset - b.offset || a.encoding.localeCompare(b.encoding));
  return uniq;
}

function groupCharCandidates(candidates, groupGap = DEFAULT_GROUP_GAP) {
  if (!candidates.length) return [];

  const groups = [];
  let current = {
    startOffset: candidates[0].offset,
    endOffset: candidates[0].offset,
    chars: [candidates[0]]
  };

  for (let i = 1; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (candidate.offset - current.endOffset <= groupGap) {
      current.chars.push(candidate);
      current.endOffset = candidate.offset;
      continue;
    }

    groups.push(current);
    current = {
      startOffset: candidate.offset,
      endOffset: candidate.offset,
      chars: [candidate]
    };
  }
  groups.push(current);

  return groups.map((group, idx) => ({
    id: idx + 1,
    startOffset: group.startOffset,
    endOffset: group.endOffset,
    text: group.chars.map((c) => c.char).join(""),
    chars: group.chars
  }));
}

function extractTextCandidates(bytes, logger, options = {}) {
  const excludedRanges = options.excludedRanges || [];
  const groupGap = Number.isInteger(options.groupGap) ? options.groupGap : DEFAULT_GROUP_GAP;

  const candidates = uniqByValue([
    ...extractAsciiUtf8(bytes),
    ...extractUtf16LE(bytes),
    ...extractUtf16BE(bytes)
  ]);

  const charCandidates = collectCharCandidates(bytes, excludedRanges);
  const groups = groupCharCandidates(charCandidates, groupGap);
  const mainText = pickMainText(candidates, groups);

  logger.info(`文字列候補: ${candidates.length}件`);
  logger.info(`1文字候補(UTF-16): ${charCandidates.length}件`);
  logger.info(`文字グループ: ${groups.length}件 (gap<=${groupGap} bytes)`);
  if (mainText) {
    logger.info(`TEXT_MAIN候補: ${mainText.value}`);
  } else {
    logger.warn("TEXT_MAIN候補が見つかりませんでした");
  }

  return {
    mainText,
    candidates,
    charCandidates,
    groups
  };
}

module.exports = {
  extractTextCandidates
};
