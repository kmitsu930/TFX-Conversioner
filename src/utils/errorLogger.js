function extractErrorLocation(error) {
  if (!error || !error.stack) return null;

  const lines = String(error.stack).split("\n");
  for (const line of lines) {
    const match = line.match(/\(?([^()\s]+\.js):(\d+):(\d+)\)?/);
    if (match) {
      return {
        file: match[1],
        line: Number(match[2]),
        column: Number(match[3])
      };
    }
  }

  return null;
}

function formatErrorDetails(error, context = "ERROR") {
  const message = error && error.message ? error.message : String(error);
  const location = extractErrorLocation(error);
  const locationText = location
    ? `${location.file}:${location.line}:${location.column}`
    : "unknown";
  const stackText = error && error.stack ? String(error.stack) : "(stack unavailable)";

  return {
    summary: `[${context}] ${message} @ ${locationText}`,
    stack: `[${context}][STACK] ${stackText}`,
    location
  };
}

module.exports = {
  extractErrorLocation,
  formatErrorDetails
};
