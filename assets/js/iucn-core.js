(function (global, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  global.IUCNCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DIRECT_API_BASE = "https://api.iucnredlist.org/api/v4";

  function configuredApiBase() {
    const injected = globalThis.__IUCN_PROXY_BASE__;
    const configured = injected || (globalThis.IUCN_TOOL_CONFIG && globalThis.IUCN_TOOL_CONFIG.proxyBase);
    const value = String(configured || "").trim().replace(/\/$/, "");
    if (!value || value === "__IUCN_PROXY_BASE__") return null;
    return value;
  }

  function apiUrl(pathAndQuery) {
    // En GitHub Pages la extensión hace la llamada real. El URL sigue siendo
    // el oficial de IUCN; la página nunca necesita un proxy remoto.
    if (globalThis.IUCNExtensionBridge) {
      return `${DIRECT_API_BASE}${pathAndQuery.startsWith("/") ? "" : "/"}${pathAndQuery}`;
    }
    const base = configuredApiBase();
    if (base) return `${base}${pathAndQuery.startsWith("/") ? "" : "/"}${pathAndQuery}`;
    const err = new Error("Jocotoco IUCN Connector no está disponible.");
    err.code = "EXTENSION_NOT_FOUND";
    throw err;
  }
  const IUCN_CAT_DESC_EN = {
    EX: "Extinct", EW: "Extinct in the Wild", CR: "Critically Endangered",
    EN: "Endangered", VU: "Vulnerable", NT: "Near Threatened",
    LC: "Least Concern", DD: "Data Deficient", NE: "Not Evaluated",
    RE: "Regionally Extinct", NA: "Not Applicable"
  };
  const TAXON_KEYS = {
    kingdom: ["kingdom_name", "kingdom"], phylum: ["phylum_name", "phylum"],
    class: ["class_name", "class"], order: ["order_name", "order"],
    family: ["family_name", "family"], genus: ["genus_name", "genus"],
    species: ["species_name", "species"],
    infra: ["infra_name", "infraspecies_name", "subspecies_name", "infra"]
  };
  const TAXON_LIST_KEYS = ["taxonomy", "classification", "classifications", "lineage", "ancestors", "taxonomic_hierarchy", "taxonomicHierarchy"];

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const noneIfBlank = (v) => (v === null || v === undefined || (typeof v === "string" && !v.trim())) ? null : v;
  const asText = (v) => noneIfBlank(v) === null ? null : String(v).trim();

  function normalizeScientificName(name) {
    return String(name ?? "").replace(/\s+/g, " ").trim();
  }

  function canonicalNameKey(name) {
    return normalizeScientificName(name).toLocaleLowerCase("en-US");
  }

  function splitBinomial(name) {
    const clean = normalizeScientificName(name);
    if (!clean) return [null, null, null];
    const parts = clean.match(/[A-Za-z\-.’'×]+/g) || [];
    if (parts.length < 2) return [null, null, null];

    const genus = parts[0];
    const species = parts[1];
    let infra = null;
    if (parts.length >= 3) {
      const third = parts[2].replace(/\.$/, "");
      const rank = third.toLowerCase();
      const rankMarkers = new Set(["subsp", "ssp", "var", "forma", "f"]);
      if (rankMarkers.has(rank) && parts[3]) infra = parts[3];
      else if (/^[a-z][a-z\-]+$/.test(parts[2])) infra = parts[2];
    }
    return [genus, species, infra];
  }

  function nameStats(names) {
    const normalized = (names || []).map(normalizeScientificName);
    const valid = normalized.filter(Boolean);
    const uniqueKeys = new Set(valid.map(canonicalNameKey));
    return { rows: normalized.length, valid: valid.length, unique: uniqueKeys.size };
  }

  function firstListOfDicts(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
    for (const key of ["assessments", "results", "data"]) {
      const v = payload[key];
      if (Array.isArray(v) && v.length && v[0] && typeof v[0] === "object" && !Array.isArray(v[0])) return v;
    }
    for (const v of Object.values(payload)) {
      if (Array.isArray(v) && v.length && v[0] && typeof v[0] === "object" && !Array.isArray(v[0])) {
        if (v.some(d => d && typeof d === "object" && ("assessment_id" in d || "latest" in d || "red_list_category_code" in d))) return v;
      }
    }
    return [];
  }

  function extractSisId(obj) {
    if (!obj || typeof obj !== "object") return null;
    for (const key of ["sis_taxon_id", "taxon_id", "id", "sis_id"]) {
      const v = obj[key];
      if (v === null || v === undefined) continue;
      const n = Number(v);
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    return null;
  }

  function yearFromItem(item) {
    if (!item || typeof item !== "object") return -1e9;
    for (const key of ["year_published", "year"]) {
      const y = Number(item[key]);
      if (Number.isFinite(y)) return Math.trunc(y);
    }
    const d = item.assessment_date;
    if (typeof d === "string" && /^\d{4}/.test(d)) return Number(d.slice(0, 4));
    return -1e9;
  }

  function isGlobalAssessment(ass) {
    if (!ass || typeof ass !== "object") return false;
    const scopes = ass.scopes;
    if (!Array.isArray(scopes) || !scopes.length) return true;
    return scopes.some(sc => sc && typeof sc === "object" && String(sc.code || "").trim() === "1");
  }

  function pickLatest(assessments) {
    if (!Array.isArray(assessments) || !assessments.length) return null;
    const isLatest = a => a && (a.latest === true || String(a.latest || "").toLowerCase() === "true");
    let pool = assessments.filter(a => isLatest(a) && isGlobalAssessment(a));
    if (!pool.length) pool = assessments.filter(isLatest);
    if (!pool.length) {
      const globalOnly = assessments.filter(isGlobalAssessment);
      pool = globalOnly.length ? globalOnly : assessments.slice();
    }
    return pool.slice().sort((a, b) => yearFromItem(b) - yearFromItem(a))[0] || null;
  }

  function normRank(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().toLowerCase().replace(/\s+/g, "_");
    if (s === "classis") return "class";
    if (["infraspecies", "infraspecific", "subspecies", "sub_specie"].includes(s)) return "infra";
    return s;
  }

  function taxonomyFromTaxon(taxon) {
    const out = Object.fromEntries(Object.keys(TAXON_KEYS).map(k => [k, null]));
    const meta = { taxonRank: null, authority: null, scientificNameTaxon: null, taxonId: null };
    if (!taxon || typeof taxon !== "object" || Array.isArray(taxon)) return { ...out, ...meta };

    meta.taxonRank = asText(taxon.rank || taxon.taxon_rank || taxon.taxonRank);
    meta.authority = asText(taxon.authority || taxon.scientific_name_authority);
    meta.scientificNameTaxon = asText(taxon.scientific_name || taxon.taxon_scientific_name);
    meta.taxonId = extractSisId(taxon);

    for (const [rank, keys] of Object.entries(TAXON_KEYS)) {
      for (const key of keys) {
        const v = asText(taxon[key]);
        if (v) { out[rank] = v; break; }
      }
    }
    for (const listKey of TAXON_LIST_KEYS) {
      const list = taxon[listKey];
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const rank = normRank(item.rank || item.taxon_rank || item.level || item.code);
        const name = asText(item.scientific_name || item.name || item.taxon_name);
        if (rank in out && !out[rank] && name) out[rank] = name;
      }
    }
    if (meta.scientificNameTaxon) {
      const [g, s, infra] = splitBinomial(meta.scientificNameTaxon);
      out.genus = out.genus || g;
      out.species = out.species || s;
      out.infra = out.infra || infra;
    }
    return { ...out, ...meta };
  }

  function retryAfterMs(response, attempt, baseSleepMs) {
    const raw = response.headers.get("Retry-After");
    if (raw) {
      const sec = Number(raw);
      if (Number.isFinite(sec)) return Math.min(10000, Math.max(0, sec * 1000));
      const date = Date.parse(raw);
      if (Number.isFinite(date)) return Math.min(10000, Math.max(0, date - Date.now()));
    }
    return Math.min(10000, baseSleepMs * (2 ** Math.max(0, attempt - 1)));
  }

  async function requestJson(url, token, options = {}) {
    const maxTries = options.maxTries || 4;
    const timeoutMs = options.timeoutMs || 30000;
    const baseSleepMs = options.baseSleepMs || 600;
    let lastError = null;

    for (let attempt = 1; attempt <= maxTries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let response;
        if (globalThis.IUCNExtensionBridge) {
          const ext = await globalThis.IUCNExtensionBridge.request(url, token, { timeoutMs });
          response = {
            status: Number(ext.status) || 0,
            ok: !!ext.ok,
            headers: { get: key => (ext.headers || {})[String(key).toLowerCase()] ?? null },
            json: async () => ext.body
          };
        } else {
          response = await fetch(url, {
            method: "GET",
            headers: { "Accept": "application/json", "X-IUCN-Token": token },
            cache: "no-store", credentials: "omit", mode: "cors",
            referrerPolicy: "no-referrer", signal: controller.signal
          });
        }
        clearTimeout(timer);

        if (response.status === 429) {
          await sleep(retryAfterMs(response, attempt, baseSleepMs));
          continue;
        }
        if (response.status >= 500) {
          await sleep(baseSleepMs * (2 ** (attempt - 1)));
          continue;
        }
        if (!response.ok) {
          const err = new Error(`HTTP ${response.status}`);
          err.status = response.status;
          err.requestId = response.headers.get("x-request-id") || null;
          throw err;
        }
        return { json: await response.json(), status: response.status };
      } catch (err) {
        clearTimeout(timer);
        lastError = err;
        if (err && ["EXTENSION_NOT_FOUND", "EXTENSION_TIMEOUT", "EXTENSION_NO_RESPONSE", "EXTENSION_TARGET_REJECTED"].includes(err.code)) throw err;
        if (err && typeof err.status === "number" && err.status >= 400 && err.status < 500 && ![408,429].includes(err.status)) throw err;
        if (attempt === maxTries) {
          if (err && (err.code === "EXTENSION_NETWORK_ERROR" || err.name === "TypeError" || /fetch/i.test(String(err.message || "")))) {
            const network = new Error("No se pudo comunicar con IUCN desde el conector local.");
            network.code = "NETWORK_OR_CORS";
            network.cause = err;
            throw network;
          }
          throw err;
        }
        await sleep(baseSleepMs * (2 ** (attempt - 1)));
      }
    }
    throw lastError || new Error("Error de red desconocido");
  }

  async function taxaScientificNameOneCall(name, token, options = {}) {
    const [genus, species, infra] = splitBinomial(name);
    if (genus && species) {
      const params = new URLSearchParams({ genus_name: genus, species_name: species });
      if (infra) params.set("infra_name", infra);
      const url = apiUrl(`/taxa/scientific_name?${params.toString()}`);
      const { json, status } = await requestJson(url, token, options);
      let items = firstListOfDicts(json);
      let taxon = json && typeof json === "object" ? json.taxon : null;
      const sisId = extractSisId(taxon || {}) || extractSisId(json) || (items[0] ? extractSisId(items[0]) : null);
      let apiSciName = taxon && typeof taxon === "object" ? noneIfBlank(taxon.scientific_name) : null;

      if (options.allowSisFallback !== false && !items.length && sisId) {
        const fallback = await requestJson(apiUrl(`/taxa/sis/${encodeURIComponent(sisId)}`), token, options);
        const json2 = fallback.json;
        const items2 = firstListOfDicts(json2);
        const taxon2 = json2 && typeof json2 === "object" ? json2.taxon : null;
        items = items2;
        taxon = taxon || taxon2;
        if (!apiSciName && taxon2 && typeof taxon2 === "object") apiSciName = noneIfBlank(taxon2.scientific_name);
      }
      return { items, taxon, sisId, apiSciName, httpStatus: status };
    }

    try {
      const { json, status } = await requestJson(apiUrl(`/taxa/scientific_name/${encodeURIComponent(name)}`), token, options);
      const items = firstListOfDicts(json);
      const taxon = json && typeof json === "object" ? json.taxon : null;
      const sisId = extractSisId(taxon || {}) || extractSisId(json) || (items[0] ? extractSisId(items[0]) : null);
      const apiSciName = taxon && typeof taxon === "object" ? noneIfBlank(taxon.scientific_name) : null;
      return { items, taxon, sisId, apiSciName, httpStatus: status };
    } catch (err) {
      if (err && [400,404].includes(err.status)) return { items: [], taxon: null, sisId: null, apiSciName: null, httpStatus: err.status };
      throw err;
    }
  }

  function emptyRecord(name) {
    return {
      scientificNameConsulted: name,
      scientificNameApiFound: "Not found",
      sisTaxonId: null,
      kingdom: null, phylum: null, class: null, order: null, family: null,
      genus: null, species: null, infra: null, taxonRank: null, authority: null,
      taxonId: null, scientificNameTaxon: null,
      lastAssessmentYear: null, lastAssessmentCode: null, lastAssessmentDesc: null,
      lastAssessmentId: null, lastAssessmentUrl: null,
      httpStatus: null, note: null, _yearMap: {}
    };
  }

  async function queryOne(name, token, options = {}) {
    const nm = String(name || "").trim();
    const rec = emptyRecord(nm);
    if (!nm) { rec.note = "empty name"; return rec; }

    try {
      const payload = await taxaScientificNameOneCall(nm, token, options);
      rec.httpStatus = payload.httpStatus || 200;
      const items = payload.items || [];
      const taxon = payload.taxon;
      const tx = taxonomyFromTaxon(taxon && typeof taxon === "object" ? taxon : null);
      Object.assign(rec, {
        kingdom: tx.kingdom, phylum: tx.phylum, class: tx.class, order: tx.order,
        family: tx.family, genus: tx.genus, species: tx.species, infra: tx.infra,
        taxonRank: tx.taxonRank, authority: tx.authority, taxonId: tx.taxonId,
        scientificNameTaxon: tx.scientificNameTaxon,
        scientificNameApiFound: noneIfBlank(payload.apiSciName) || noneIfBlank(tx.scientificNameTaxon) || "Not found",
        sisTaxonId: payload.sisId
      });

      if (!items.length) {
        rec.note = rec.httpStatus === 404 ? "HTTP 404" : "no assessments found for this name";
        return rec;
      }
      const itemsUse = items.filter(isGlobalAssessment);
      const chosen = itemsUse.length ? itemsUse : items;
      const yearMap = {};
      for (const ass of chosen) {
        const y = yearFromItem(ass);
        if (y < -1e8) continue;
        const code = noneIfBlank(ass.red_list_category_code);
        if (code) yearMap[y] = String(code).trim();
      }
      rec._yearMap = yearMap;
      const best = pickLatest(chosen);
      if (!best) return rec;
      const code = noneIfBlank(best.red_list_category_code);
      const year = yearFromItem(best);
      const aidRaw = best.assessment_id ?? best.id;
      const aid = Number(aidRaw);
      rec.lastAssessmentYear = year > -1e8 ? year : null;
      rec.lastAssessmentCode = code;
      rec.lastAssessmentDesc = code ? (IUCN_CAT_DESC_EN[String(code).trim()] || null) : null;
      rec.lastAssessmentId = Number.isFinite(aid) ? Math.trunc(aid) : null;
      rec.lastAssessmentUrl = noneIfBlank(best.url);
      return rec;
    } catch (err) {
      if (err && typeof err.status === "number") {
        rec.httpStatus = err.status;
        rec.note = `HTTP ${err.status}`;
        return rec;
      }
      rec.note = err && err.code === "NETWORK_OR_CORS" ? "network/CORS error" : `exception: ${err && err.message ? err.message : String(err)}`;
      rec._fatalError = err;
      return rec;
    }
  }

  function classifyRecord(rec) {
    const status = Number(rec && rec.httpStatus);
    const foundName = rec && rec.scientificNameApiFound && rec.scientificNameApiFound !== "Not found";
    if (status === 404 || (!foundName && (status === 200 || !status))) return "notFound";
    if (rec && rec._fatalError) return "error";
    if (status && status !== 200) return "error";
    if (rec && rec.note && /^exception:|network\/CORS/i.test(rec.note)) return "error";
    return foundName ? "found" : "notFound";
  }

  function finalizeRecords(records) {
    const allYears = new Set();
    for (const rec of records) {
      for (const y of Object.keys(rec._yearMap || {})) allYears.add(Number(y));
    }
    const years = [...allYears].filter(Number.isFinite).sort((a,b) => b-a);
    return records.map(rec => {
      const out = {
        scientificNameConsulted: rec.scientificNameConsulted,
        scientificNameApiFound: rec.scientificNameApiFound,
        sisTaxonId: rec.sisTaxonId,
        kingdom: rec.kingdom, phylum: rec.phylum, class: rec.class, order: rec.order,
        family: rec.family, genus: rec.genus, species: rec.species, infra: rec.infra,
        taxonRank: rec.taxonRank, authority: rec.authority, taxonId: rec.taxonId,
        scientificNameTaxon: rec.scientificNameTaxon,
        lastAssessmentYear: rec.lastAssessmentYear,
        lastAssessmentCode: rec.lastAssessmentCode,
        lastAssessmentDesc: rec.lastAssessmentDesc,
        lastAssessmentId: rec.lastAssessmentId,
        lastAssessmentUrl: rec.lastAssessmentUrl,
        httpStatus: rec.httpStatus,
        note: rec.note
      };
      for (const y of years) out[`assessment${y}`] = (rec._yearMap || {})[y] || null;
      Object.defineProperty(out, "__status", { value: classifyRecord(rec), enumerable: false, configurable: true });
      return out;
    });
  }

  async function mapWithConcurrency(items, limit, worker, onProgress) {
    const out = new Array(items.length);
    let cursor = 0, done = 0;
    async function runner() {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) return;
        out[idx] = await worker(items[idx], idx);
        done++;
        if (typeof onProgress === "function") onProgress(done, items.length, out[idx], idx);
      }
    }
    const n = Math.max(1, Math.min(Number(limit) || 1, items.length || 1));
    await Promise.all(Array.from({ length: n }, runner));
    return out;
  }

  async function queryMany(names, token, options = {}) {
    const normalized = (names || []).map(normalizeScientificName);
    const representativeByKey = new Map();
    for (const name of normalized) {
      if (!name) continue;
      const key = canonicalNameKey(name);
      if (!representativeByKey.has(key)) representativeByKey.set(key, name);
    }
    const unique = [...representativeByKey.values()];
    const byKey = new Map();
    let fatalCorsError = null;

    await mapWithConcurrency(unique, options.concurrency || 4, async name => {
      const rec = await queryOne(name, token, options);
      byKey.set(canonicalNameKey(name), rec);
      if (rec._fatalError && rec._fatalError.code === "NETWORK_OR_CORS") fatalCorsError = rec._fatalError;
      return rec;
    }, (done, total, rec) => {
      if (typeof options.onProgress === "function") options.onProgress(done, total, rec);
    });

    if (fatalCorsError && [...byKey.values()].every(r => r._fatalError && r._fatalError.code === "NETWORK_OR_CORS")) throw fatalCorsError;
    const ordered = normalized.map(name => {
      if (!name) return emptyRecord(name);
      const base = byKey.get(canonicalNameKey(name));
      if (!base) return emptyRecord(name);
      return { ...base, scientificNameConsulted: name, _yearMap: { ...(base._yearMap || {}) } };
    });
    return finalizeRecords(ordered);
  }

  function summarize(records) {
    const counts = { found: 0, notFound: 0, error: 0 };
    for (const rec of records || []) {
      const s = rec.__status || classifyRecord(rec);
      if (s === "found") counts.found++;
      else if (s === "error") counts.error++;
      else counts.notFound++;
    }
    return counts;
  }

  function summarizeUnique(records) {
    const seen = new Set();
    const uniqueRecords = [];
    for (const rec of records || []) {
      const key = canonicalNameKey(rec && rec.scientificNameConsulted);
      if (!key || seen.has(key)) continue;
      seen.add(key); uniqueRecords.push(rec);
    }
    return summarize(uniqueRecords);
  }

  return {
    API_BASE: configuredApiBase(), DIRECT_API_BASE, configuredApiBase, apiUrl, IUCN_CAT_DESC_EN, normalizeScientificName, canonicalNameKey, nameStats, splitBinomial, firstListOfDicts, extractSisId,
    yearFromItem, isGlobalAssessment, pickLatest, taxonomyFromTaxon,
    classifyRecord, finalizeRecords, queryOne, queryMany, summarize, summarizeUnique
  };
});
