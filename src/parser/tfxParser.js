const { storage } = require("uxp");
const { extractPngBlocks } = require("./pngExtractor");
const { extractTextCandidates } = require("./textExtractor");
const { extractStyleInfo } = require("./styleExtractor");

function createLogger(onLog) {
  const push = (level, message) => {
    const line = `[${new Date().toISOString()}] [${level}] ${message}`;
    if (onLog) onLog(line);
  };
  return {
    info: (m) => push("INFO", m),
    warn: (m) => push("WARN", m),
    error: (m) => push("ERROR", m)
  };
}

async function readFileAsUint8Array(file, logger) {
  logger.info(`ファイル読込開始: ${file.name}`);
  const binary = await file.read({ format: storage.formats.binary });
  const bytes = binary instanceof Uint8Array ? binary : new Uint8Array(binary);
  logger.info(`ファイル読込完了: ${bytes.length} bytes`);
  return bytes;
}

function buildInfoLines({ sourceName, textResult, pngs, styleInfo, includeUnknown }) {
  const linesMain = [];
  const linesStyle = [];
  const linesUnknown = [];

  linesMain.push(`SOURCE: ${sourceName}`);
  linesMain.push(`TEXT_MAIN: ${textResult.mainText ? textResult.mainText.value : "(not found)"}`);

  if (styleInfo.fonts[0]) {
    linesMain.push(`FONT: ${styleInfo.fonts[0].value} guessed=${styleInfo.fonts[0].guessed}`);
  }
  if (styleInfo.sizes[0]) {
    linesMain.push(`SIZE: ${styleInfo.sizes[0].value} guessed=${styleInfo.sizes[0].guessed} offset=0x${styleInfo.sizes[0].offset.toString(16)}`);
  }
  if (styleInfo.colors[0]) {
    linesMain.push(`COLOR: ${styleInfo.colors[0].value} alpha=${styleInfo.colors[0].alpha} guessed=${styleInfo.colors[0].guessed} offset=0x${styleInfo.colors[0].offset.toString(16)}`);
  }

  textResult.candidates.slice(0, 40).forEach((c, idx) => {
    linesStyle.push(`TEXT_CANDIDATE[${idx + 1}]: ${c.value} encoding=${c.encoding} guessed=${c.guessed} offset=0x${c.offset.toString(16)}`);
  });

  pngs.forEach((p, idx) => {
    linesStyle.push(`PNG[${idx + 1}]: ${p.width || "?"}x${p.height || "?"} length=${p.length} offset=0x${p.offset.toString(16)} guessed=${p.width ? "false" : "true"}`);
  });

  styleInfo.fonts.forEach((f, idx) => {
    linesStyle.push(`FONT_CANDIDATE[${idx + 1}]: ${f.value} guessed=${f.guessed} offset=0x${f.offset.toString(16)}`);
  });

  styleInfo.sizes.slice(0, 20).forEach((s, idx) => {
    linesStyle.push(`SIZE_CANDIDATE[${idx + 1}]: ${s.value} guessed=${s.guessed} offset=0x${s.offset.toString(16)}`);
  });

  styleInfo.colors.slice(0, 30).forEach((c, idx) => {
    linesStyle.push(`COLOR_CANDIDATE[${idx + 1}]: ${c.value} alpha=${c.alpha} mode=${c.mode} guessed=${c.guessed} offset=0x${c.offset.toString(16)}`);
  });

  if (includeUnknown) {
    styleInfo.unknowns.forEach((u, idx) => {
      linesUnknown.push(`UNKNOWN[${idx + 1}]: offset=0x${u.offset.toString(16)} length=${u.length} note=${u.note} guessed=${u.guessed}`);
    });
  }

  return {
    main: linesMain.join("\n"),
    style: linesStyle.join("\n"),
    unknown: linesUnknown.join("\n")
  };
}

async function parseTfxFile(file, options = {}, onLog) {
  const logger = createLogger(onLog);

  const result = {
    sourceName: file.name,
    text: { mainText: null, candidates: [] },
    pngs: [],
    style: { fonts: [], sizes: [], colors: [], unknowns: [], edges: [], shadows: [], frames: [] },
    infoText: { main: "", style: "", unknown: "" },
    logs: []
  };

  const captureLog = (line) => {
    result.logs.push(line);
    if (onLog) onLog(line);
  };
  const log = createLogger(captureLog);

  try {
    const bytes = await readFileAsUint8Array(file, log);
    result.text = extractTextCandidates(bytes, log);
    if (options.extractPng !== false) {
      result.pngs = extractPngBlocks(bytes, log);
    }
    result.style = extractStyleInfo(bytes, result.text, result.pngs, log);
    result.infoText = buildInfoLines({
      sourceName: file.name,
      textResult: result.text,
      pngs: result.pngs,
      styleInfo: result.style,
      includeUnknown: options.outputUnknown !== false
    });
    log.info("解析完了（部分成功含む）");
  } catch (error) {
    log.error(`解析エラー: ${error.message}`);
    result.infoText.main += `\nERROR: ${error.message}`;
  }

  return result;
}

module.exports = {
  parseTfxFile
};
