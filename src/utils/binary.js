function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError(`Unsupported binary input: ${Object.prototype.toString.call(input)}`);
}

function toArrayBuffer(input) {
  const bytes = toUint8Array(input);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function decodeText(input, encoding = "utf-8", fatal = false) {
  const bytes = toUint8Array(input);
  return new TextDecoder(encoding, { fatal }).decode(bytes);
}

function encodeText(text) {
  return new TextEncoder().encode(text);
}

module.exports = {
  toUint8Array,
  toArrayBuffer,
  decodeText,
  encodeText
};
