const { storage } = require("uxp");
const fs = storage.localFileSystem;
const { parseTfxFile } = require("./parser/tfxParser");
const { writeToPhotoshop } = require("./writer/photoshopWriter");

let selectedFile = null;

const elements = {
  selectFileBtn: document.getElementById("selectFileBtn"),
  runBtn: document.getElementById("runBtn"),
  selectedFile: document.getElementById("selectedFile"),
  logArea: document.getElementById("logArea"),
  dropZone: document.getElementById("dropZone"),
  optPng: document.getElementById("optPng"),
  optText: document.getElementById("optText"),
  optInfo: document.getElementById("optInfo"),
  optUnknown: document.getElementById("optUnknown")
};

function appendLog(message) {
  elements.logArea.textContent += `${message}\n`;
  elements.logArea.scrollTop = elements.logArea.scrollHeight;
}

function setSelectedFile(file) {
  selectedFile = file;
  elements.selectedFile.textContent = file ? file.name : "未選択";
  elements.runBtn.disabled = !file;
}

function getOptions() {
  return {
    extractPng: elements.optPng.checked,
    createText: elements.optText.checked,
    createInfo: elements.optInfo.checked,
    outputUnknown: elements.optUnknown.checked
  };
}

async function chooseFile() {
  try {
    const file = await fs.getFileForOpening({ types: ["tfx"] });
    if (file) {
      setSelectedFile(file);
      appendLog(`[UI] ファイル選択: ${file.name}`);
    }
  } catch (error) {
    appendLog(`[UI][ERROR] ファイル選択失敗: ${error.message}`);
  }
}

async function runParseAndWrite() {
  if (!selectedFile) {
    appendLog("[UI][WARN] TFXファイルを選択してください。");
    return;
  }

  elements.runBtn.disabled = true;
  appendLog("[UI] 解析開始");

  try {
    const options = getOptions();
    const parseResult = await parseTfxFile(selectedFile, options, appendLog);
    await writeToPhotoshop(parseResult, options, appendLog);
    appendLog("[UI] 完了: 部分解析でも出力を作成しました。");
  } catch (error) {
    appendLog(`[UI][ERROR] 処理失敗: ${error.message}`);
  } finally {
    elements.runBtn.disabled = false;
  }
}

function setupDragAndDrop() {
  const zone = elements.dropZone;

  ["dragenter", "dragover"].forEach((type) => {
    zone.addEventListener(type, (e) => {
      e.preventDefault();
      zone.classList.add("over");
    });
  });

  ["dragleave", "drop"].forEach((type) => {
    zone.addEventListener(type, (e) => {
      e.preventDefault();
      zone.classList.remove("over");
    });
  });

  zone.addEventListener("drop", async (e) => {
    try {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || files.length === 0) {
        appendLog("[UI][WARN] ドロップファイル取得不可。ファイル選択ボタンを使用してください。");
        return;
      }
      appendLog("[UI][WARN] UXP制約によりドロップ経由ファイルは直接利用できない場合があります。再選択を案内します。");
      await chooseFile();
    } catch (error) {
      appendLog(`[UI][WARN] ドロップ処理失敗: ${error.message}`);
    }
  });
}

function bootstrap() {
  elements.selectFileBtn.addEventListener("click", chooseFile);
  elements.runBtn.addEventListener("click", runParseAndWrite);
  setupDragAndDrop();
  appendLog("TFX Conversioner ready.");
}

bootstrap();
