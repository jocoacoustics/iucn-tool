"use strict";

const API_ORIGIN = "https://api.iucnredlist.org";
const API_PREFIX = "/api/v4/";
const ALLOWED_WEB_ORIGINS = new Set([
  "https://jocoacoustics.github.io",
  "http://127.0.0.1",
  "http://localhost"
]);

function senderAllowed(sender) {
  try {
    const u = new URL(sender.url || sender.origin || "");
    return ALLOWED_WEB_ORIGINS.has(u.origin);
  } catch (_) {
    return false;
  }
}

function buildIucnUrl(pathAndQuery) {
  if (typeof pathAndQuery !== "string" || !pathAndQuery.startsWith("/api/v4/")) {
    throw new Error("Ruta IUCN no permitida");
  }
  const u = new URL(pathAndQuery, API_ORIGIN);
  if (u.origin !== API_ORIGIN || !u.pathname.startsWith(API_PREFIX)) {
    throw new Error("Destino no permitido");
  }
  return u.toString();
}

async function iucnRequest(message) {
  const token = typeof message.token === "string" ? message.token.trim() : "";
  if (!token) return { ok: false, status: 0, error: "Token IUCN vacío" };

  const url = buildIucnUrl(message.path);
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Math.min(60000, Number(message.timeoutMs) || 30000));
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Replica el mecanismo que ya funciona en APIv4_20260113151100.py:
    // Authorization: <token> (sin Bearer por defecto).
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Authorization": token
      },
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal
    });

    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; }
    catch (_) { body = { raw: text.slice(0, 2000) }; }

    return {
      ok: response.ok,
      status: response.status,
      body,
      headers: {
        "retry-after": response.headers.get("Retry-After"),
        "x-request-id": response.headers.get("x-request-id"),
        "content-type": response.headers.get("content-type")
      }
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err && err.name === "AbortError" ? "Tiempo de espera agotado" : (err && err.message ? err.message : String(err))
    };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!senderAllowed(sender)) {
    sendResponse({ ok: false, status: 0, error: "Origen web no autorizado" });
    return false;
  }

  if (!message || typeof message !== "object") {
    sendResponse({ ok: false, status: 0, error: "Mensaje inválido" });
    return false;
  }

  if (message.type === "IUCN_CONNECTOR_PING") {
    sendResponse({ ok: true, connector: "Jocotoco IUCN Connector", version: chrome.runtime.getManifest().version });
    return false;
  }

  if (message.type !== "IUCN_REQUEST") {
    sendResponse({ ok: false, status: 0, error: "Operación no permitida" });
    return false;
  }

  iucnRequest(message).then(sendResponse).catch(err => {
    sendResponse({ ok: false, status: 0, error: err && err.message ? err.message : String(err) });
  });
  return true;
});
