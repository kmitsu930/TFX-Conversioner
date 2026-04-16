const photoshop = require("photoshop");
const { app, core, action } = photoshop;
const fs = require("uxp").storage.localFileSystem;
const { storage } = require("uxp");
const { toArrayBuffer } = require("../utils/binary");
const { formatErrorDetails } = require("../utils/errorLogger");

async function createNewDocument(width, height, name) {
  const doc = await app.createDocument({
    width,
    height,
    resolution: 72,
    mode: "RGBColorMode",
    fill: "transparent",
    name
  });
  return doc;
}

async function createTextLayer(doc, layerName, contents, options = {}) {
  const layer = await doc.createTextLayer();
  layer.name = layerName;
  layer.textItem.contents = contents || "";
  if (options.size && Number.isFinite(options.size)) {
    layer.textItem.size = options.size;
  }
  if (options.position && Number.isFinite(options.position.x) && Number.isFinite(options.position.y)) {
    layer.textItem.position = [options.position.x, options.position.y];
  }
  if (options.color) {
    try {
      layer.textItem.color = {
        red: options.color.r,
        green: options.color.g,
        blue: options.color.b
      };
    } catch (error) {
      // ignore color apply failures
    }
  }
  return layer;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || "");
  if (!m) return null;
  return {
    r: parseInt(m[1].slice(0, 2), 16),
    g: parseInt(m[1].slice(2, 4), 16),
    b: parseInt(m[1].slice(4, 6), 16)
  };
}

async function savePngToTemp(png, idx) {
  const temp = await fs.getTemporaryFolder();
  const file = await temp.createFile(`tfx_extract_${idx + 1}.png`, { overwrite: true });
  const binary = toArrayBuffer(png.data);
  await file.write(binary, { format: storage.formats.binary });
  return file;
}

async function placePngFile(file, layerName) {
  const token = fs.createSessionToken(file);
  await action.batchPlay(
    [
      {
        _obj: "placeEvent",
        null: {
          _path: token,
          _kind: "local"
        },
        linked: false,
        _options: {
          dialogOptions: "dontDisplay"
        }
      }
    ],
    {}
  );
  app.activeDocument.activeLayers[0].name = layerName;
}

function pickDocSize(parseResult) {
  const mainPng = parseResult.pngs[0];
  if (mainPng && mainPng.width && mainPng.height) {
    return { width: mainPng.width, height: mainPng.height };
  }
  return { width: 1920, height: 1080 };
}

async function writeToPhotoshop(parseResult, options, onLog) {
  const log = (m) => onLog && onLog(`[PS] ${m}`);

  await core.executeAsModal(async () => {
    const size = pickDocSize(parseResult);
    const doc = await createNewDocument(size.width, size.height, `TFX_${parseResult.sourceName}`);
    log(`新規ドキュメント: ${size.width}x${size.height}`);

    if (options.createInfo !== false) {
      await createTextLayer(doc, "INFO_MAIN", parseResult.infoText.main, { size: 18, position: { x: 60, y: 80 } });
      if (parseResult.infoText.style) {
        await createTextLayer(doc, "INFO_STYLE", parseResult.infoText.style, { size: 14, position: { x: 60, y: 220 } });
      }
      if (options.outputUnknown !== false && parseResult.infoText.unknown) {
        await createTextLayer(doc, "INFO_UNKNOWN", parseResult.infoText.unknown, { size: 12, position: { x: 60, y: 420 } });
      }
      log("INFOレイヤー作成");
    }

    if (options.createText !== false) {
      const font = parseResult.style.fonts[0] ? parseResult.style.fonts[0].value : null;
      const sizeValue = parseResult.style.sizes[0] ? parseResult.style.sizes[0].value : 72;
      const colorHex = parseResult.style.colors[0] ? parseResult.style.colors[0].value : null;
      const rgb = colorHex ? hexToRgb(colorHex) : null;

      const mainLayer = await createTextLayer(doc, "TEXT_MAIN", parseResult.text.mainText ? parseResult.text.mainText.value : "(TEXT_MAIN not found)", {
        size: sizeValue,
        position: { x: Math.round(size.width * 0.3), y: Math.round(size.height * 0.5) },
        color: rgb || undefined
      });

      if (font) {
        try {
          mainLayer.textItem.font = font;
          log(`フォント適用: ${font}`);
        } catch (error) {
          log(`フォント適用失敗（フォールバック）: ${font}`);
        }
      }

      const candidatesText = parseResult.text.candidates.slice(0, 20).map((c, i) => `${i + 1}. ${c.value} (${c.encoding})`).join("\n");
      if (candidatesText) {
        await createTextLayer(doc, "TEXT_CANDIDATES", candidatesText, { size: 18, position: { x: 60, y: Math.round(size.height * 0.75) } });
      }
      log("TEXTレイヤー作成");
    }

    if (options.extractPng !== false && parseResult.pngs.length > 0) {
      for (let i = 0; i < parseResult.pngs.length; i += 1) {
        const png = parseResult.pngs[i];
        try {
          const file = await savePngToTemp(png, i);
          const layerName = i === 0 ? "PNG_MAIN" : `PNG_OTHERS_${i}`;
          await placePngFile(file, layerName);
          log(`PNG配置: ${layerName} (${png.width || "?"}x${png.height || "?"})`);
        } catch (error) {
          const details = formatErrorDetails(error, `PNG配置失敗 index=${i}`);
          log(details.summary);
          log(details.stack);
        }
      }
    }
  }, { commandName: "TFX Conversioner - Generate PSD" });
}

module.exports = {
  writeToPhotoshop
};
