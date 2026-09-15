"use strict";

const PAGE_CHANNEL = "JOCOTOCO_IUCN_PAGE";
const EXT_CHANNEL = "JOCOTOCO_IUCN_CONNECTOR";

window.addEventListener("message", event => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.channel !== PAGE_CHANNEL || typeof msg.requestId !== "string") return;
  if (!["IUCN_CONNECTOR_PING", "IUCN_REQUEST"].includes(msg.type)) return;

  chrome.runtime.sendMessage({
    type: msg.type,
    requestId: msg.requestId,
    path: msg.path,
    token: msg.token,
    timeoutMs: msg.timeoutMs
  }, response => {
    const lastError = chrome.runtime.lastError;
    window.postMessage({
      channel: EXT_CHANNEL,
      requestId: msg.requestId,
      response: lastError ? { ok: false, status: 0, error: lastError.message || "Error del conector" } : response
    }, window.location.origin);
  });
});

// Aviso pasivo de disponibilidad, útil si la página cargó después del content script.
window.postMessage({ channel: EXT_CHANNEL, type: "IUCN_CONNECTOR_READY" }, window.location.origin);
