(function (global) {
  "use strict";

  const API_ORIGIN = "https://api.iucnredlist.org";
  const PAGE_CHANNEL = "JOCOTOCO_IUCN_PAGE";
  const EXT_CHANNEL = "JOCOTOCO_IUCN_CONNECTOR";
  const pending = new Map();

  function requestId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") return global.crypto.randomUUID();
    return `iucn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  global.addEventListener("message", event => {
    if (event.source !== global) return;
    const msg = event.data;
    if (!msg || msg.channel !== EXT_CHANNEL || !msg.requestId) return;
    const p = pending.get(msg.requestId);
    if (!p) return;
    pending.delete(msg.requestId);
    clearTimeout(p.timer);
    p.resolve(msg.response || { ok: false, status: 0, error: "Respuesta vacía del conector" });
  });

  function send(message, timeoutMs) {
    return new Promise((resolve, reject) => {
      const id = requestId();
      const timer = setTimeout(() => {
        pending.delete(id);
        const err = new Error("Jocotoco IUCN Connector no está instalado, está desactivado o no tiene acceso a esta página.");
        err.code = "EXTENSION_NOT_FOUND";
        reject(err);
      }, Math.max(500, Number(timeoutMs) || 1800));
      pending.set(id, { resolve, reject, timer });
      global.postMessage({ channel: PAGE_CHANNEL, requestId: id, ...message }, global.location.origin);
    });
  }

  async function ping(timeoutMs = 1800) {
    try {
      const r = await send({ type: "IUCN_CONNECTOR_PING" }, timeoutMs);
      return !!(r && r.ok);
    } catch (_) {
      return false;
    }
  }

  async function getToken(timeoutMs = 1800) {
    const r = await send({ type: "IUCN_TOKEN_GET" }, timeoutMs);
    if (!r || !r.ok) throw new Error((r && r.error) || "No se pudo leer el token local.");
    return typeof r.token === "string" ? r.token : "";
  }

  async function saveToken(token, timeoutMs = 1800) {
    const clean = String(token || "").trim();
    if (!clean) throw new Error("Token IUCN vacío");
    const r = await send({ type: "IUCN_TOKEN_SET", token: clean }, timeoutMs);
    if (!r || !r.ok) throw new Error((r && r.error) || "No se pudo guardar el token localmente.");
    return true;
  }

  async function clearToken(timeoutMs = 1800) {
    const r = await send({ type: "IUCN_TOKEN_CLEAR" }, timeoutMs);
    if (!r || !r.ok) throw new Error((r && r.error) || "No se pudo olvidar el token local.");
    return true;
  }

  async function request(url, token, options = {}) {
    const u = new URL(url);
    if (u.origin !== API_ORIGIN || !u.pathname.startsWith("/api/v4/")) {
      const err = new Error("Destino no permitido por Jocotoco IUCN Connector.");
      err.code = "EXTENSION_TARGET_REJECTED";
      throw err;
    }
    const timeoutMs = Math.max(1000, Math.min(60000, Number(options.timeoutMs) || 30000));
    const r = await send({
      type: "IUCN_REQUEST",
      path: `${u.pathname}${u.search}`,
      token: String(token || ""),
      timeoutMs
    }, timeoutMs + 2500);
    if (!r || (Number(r.status) === 0 && !r.ok)) {
      const err = new Error((r && r.error) || "El conector no pudo comunicarse con IUCN.");
      err.code = "EXTENSION_NETWORK_ERROR";
      throw err;
    }
    return r;
  }

  global.IUCNExtensionBridge = Object.freeze({ ping, getToken, saveToken, clearToken, request });
})(globalThis);
