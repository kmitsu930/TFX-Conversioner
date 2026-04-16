function isLikelyText(str) {
  if (!str) return false;
  const trimmed = str.trim();
  if (trimmed.length < 2) return false;
  if (/^[\x00-\x1F\x7F]+$/.test(trimmed)) return false;
  const printableRatio = (trimmed.match(/[\p{L}\p{N}\p{P}\p{Zs}]/gu) || []).length / trimmed.length;
  return printableRatio > 0.7;
}

function pushCandidate(target, value, encoding, offset, guessed = true) {
  if (!isLikelyText(value)) return;
  const normalized = value.replace(/\0/g, "").trim();
  if (!normalized) return;
  target.push({
    value: normalized,
    encoding,
    offset,
    guessed
  });
}

function extractAsciiUtf8(bytes) {
  const results = [];
  let start = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    const printable = b >= 0x20 && b <= 0x7e;
    if (printable) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      const len = i - start;
      if (len >= 3) {
        const slice = bytes.slice(start, i);
        pushCandidate(results, Buffer.from(slice).toString("utf8"), "utf8/ascii", start);
      }
      start = -1;
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
      if (high === 0 && low >= 0x20 && low <= 0x7e) {
        chars += 1;
        end += 2;
      } else if (high >= 0x30 && high <= 0x9f) {
        chars += 1;
        end += 2;
      } else {
        break;
      }
    }
    if (chars >= 2) {
      const buf = Buffer.from(bytes.slice(i, end));
      pushCandidate(results, buf.toString("utf16le"), "utf16le", i);
      i = end;
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
      if (high === 0 && low >= 0x20 && low <= 0x7e) {
        chars += 1;
        end += 2;
      } else if (high >= 0x30 && high <= 0x9f) {
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
      pushCandidate(results, Buffer.from(swapped).toString("utf16le"), "utf16be", i);
      i = end;
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

function pickMainText(candidates) {
  if (!candidates.length) return null;
  return [...candidates]
    .sort((a, b) => b.value.length - a.value.length)
    .find((c) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}A-Za-z0-9]/u.test(c.value)) || candidates[0];
}

function extractTextCandidates(bytes, logger) {
  const candidates = uniqByValue([
    ...extractAsciiUtf8(bytes),
    ...extractUtf16LE(bytes),
    ...extractUtf16BE(bytes)
  ]);

  const mainText = pickMainText(candidates);
  logger.info(`文字列候補: ${candidates.length}件`);

  return {
    mainText,
    candidates
  };
}

module.exports = {
  extractTextCandidates
};
