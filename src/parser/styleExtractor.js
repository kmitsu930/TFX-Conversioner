function findFontCandidates(textCandidates) {
  const fontHints = [
    /(?:A-OTF|Hiragino|Yu Gothic|Meiryo|Noto|Helvetica|Arial|Times|Gothic|Mincho|ShinGo|UD)/i,
    /フォント|font/i
  ];

  return textCandidates
    .filter((c) => fontHints.some((r) => r.test(c.value)))
    .slice(0, 20)
    .map((c) => ({ ...c, guessed: true }));
}

function findSizeCandidates(bytes) {
  const sizes = [];
  for (let i = 0; i < bytes.length - 4; i += 1) {
    const v = bytes[i] + (bytes[i + 1] << 8) + (bytes[i + 2] << 16) + (bytes[i + 3] << 24);
    if (v >= 8 && v <= 400) {
      sizes.push({ value: v, offset: i, guessed: true });
    }
  }
  return sizes.slice(0, 40);
}

function findColorCandidates(bytes) {
  const colors = [];
  for (let i = 0; i < bytes.length - 4; i += 1) {
    const r = bytes[i];
    const g = bytes[i + 1];
    const b = bytes[i + 2];
    const a = bytes[i + 3];
    const looksLikeRGBA = (a > 0 && a <= 255) && (r + g + b > 30);
    if (looksLikeRGBA && (r === g && g === b || r > 200 || g > 200 || b > 200)) {
      colors.push({
        mode: "RGBA",
        value: `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase(),
        alpha: a,
        offset: i,
        guessed: true
      });
    }
  }
  return colors.slice(0, 60);
}

function findUnknownBlocks(bytes, knownOffsets) {
  const unknowns = [];
  const sorted = [...knownOffsets].sort((a, b) => a - b);
  const minGap = 64;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const start = sorted[i];
    const end = sorted[i + 1];
    const gap = end - start;
    if (gap > minGap) {
      unknowns.push({
        offset: start,
        length: gap,
        note: "suspected style/raw block",
        guessed: true
      });
    }
  }
  return unknowns.slice(0, 40);
}

function extractStyleInfo(bytes, textResult, pngResult, logger) {
  const fonts = findFontCandidates(textResult.candidates);
  const sizes = findSizeCandidates(bytes);
  const colors = findColorCandidates(bytes);

  const knownOffsets = [0, bytes.length];
  textResult.candidates.forEach((c) => knownOffsets.push(c.offset));
  pngResult.forEach((p) => {
    knownOffsets.push(p.offset);
    knownOffsets.push(p.end);
  });

  const unknowns = findUnknownBlocks(bytes, knownOffsets);

  logger.info(`スタイル候補: font=${fonts.length}, size=${sizes.length}, color=${colors.length}, unknown=${unknowns.length}`);

  return {
    fonts,
    sizes,
    colors,
    unknowns,
    edges: [],
    shadows: [],
    frames: []
  };
}

module.exports = {
  extractStyleInfo
};
