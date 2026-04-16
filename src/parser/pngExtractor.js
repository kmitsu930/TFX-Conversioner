const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const IEND_CHUNK = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];

function matchAt(bytes, offset, signature) {
  if (offset + signature.length > bytes.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

function readUInt32BE(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function parseIHDR(pngBytes) {
  if (pngBytes.length < 33) return null;
  if (!matchAt(pngBytes, 12, [0x49, 0x48, 0x44, 0x52])) return null;
  return {
    width: readUInt32BE(pngBytes, 16),
    height: readUInt32BE(pngBytes, 20)
  };
}

function scorePng(meta) {
  if (!meta) return 0;
  const hdPresets = [
    [1920, 1080],
    [1440, 1080],
    [1280, 720]
  ];
  let score = meta.width * meta.height;
  for (const [w, h] of hdPresets) {
    if (meta.width === w && meta.height === h) score += 100000000;
  }
  return score;
}

function extractPngBlocks(bytes, logger) {
  const pngs = [];
  for (let i = 0; i < bytes.length - PNG_SIGNATURE.length; i += 1) {
    if (!matchAt(bytes, i, PNG_SIGNATURE)) continue;
    let end = -1;
    for (let j = i + PNG_SIGNATURE.length; j < bytes.length - IEND_CHUNK.length; j += 1) {
      if (matchAt(bytes, j, IEND_CHUNK)) {
        end = j + IEND_CHUNK.length;
        break;
      }
    }
    if (end < 0) {
      logger.warn(`PNG候補を検出したがIEND未検出: offset=0x${i.toString(16)}`);
      continue;
    }

    const data = bytes.slice(i, end);
    const ihdr = parseIHDR(data);
    pngs.push({
      offset: i,
      end,
      length: data.length,
      data,
      width: ihdr ? ihdr.width : null,
      height: ihdr ? ihdr.height : null,
      score: scorePng(ihdr)
    });
    i = end - 1;
  }

  pngs.sort((a, b) => b.score - a.score || b.length - a.length);

  if (pngs.length > 0) {
    const main = pngs[0];
    logger.info(`PNG抽出: ${pngs.length}件 / MAIN=${main.width || "?"}x${main.height || "?"} offset=0x${main.offset.toString(16)}`);
  } else {
    logger.info("PNG抽出: 0件");
  }

  return pngs;
}

module.exports = {
  extractPngBlocks
};
