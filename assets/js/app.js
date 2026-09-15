(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const el = {
    landingView: $("landingView"), workspaceView: $("workspaceView"), dropzone: $("dropzone"), fileInput: $("fileInput"),
    selectFileBtn: $("selectFileBtn"), manualBtn: $("manualBtn"), sourceLabel: $("sourceLabel"), sourceMeta: $("sourceMeta"),
    countFound: $("countFound"), countNotFound: $("countNotFound"), countErrors: $("countErrors"), resetBtn: $("resetBtn"),
    fileConfig: $("fileConfig"), manualConfig: $("manualConfig"), sheetField: $("sheetField"), sheetSelect: $("sheetSelect"), columnSelect: $("columnSelect"),
    tokenInput: $("tokenInput"), manualTokenInput: $("manualTokenInput"), toggleTokenBtn: $("toggleTokenBtn"), toggleManualTokenBtn: $("toggleManualTokenBtn"),
    consultBtn: $("consultBtn"), manualConsultBtn: $("manualConsultBtn"), manualSpecies: $("manualSpecies"), progressBlock: $("progressBlock"),
    progressTitle: $("progressTitle"), progressText: $("progressText"), progressTrack: $("progressTrack"), progressBar: $("progressBar"),
    resultsDivider: $("resultsDivider"), resultsSection: $("resultsSection"), resultsMeta: $("resultsMeta"), tableSearch: $("tableSearch"),
    pageSizeSelect: $("pageSizeSelect"), resultsHead: $("resultsHead"), resultsBody: $("resultsBody"), paginationMeta: $("paginationMeta"),
    pagination: $("pagination"), downloadBtn: $("downloadBtn"), toast: $("toast"),
    connectorGate: $("connectorGate"), browserIcon: $("browserIcon"), browserRoute: $("browserRoute"), loadUnpackedLabel: $("loadUnpackedLabel"),
    connectorRetryBtn: $("connectorRetryBtn"),
    rememberTokenCheckbox: $("rememberTokenCheckbox"), manualRememberTokenCheckbox: $("manualRememberTokenCheckbox"),
    forgetTokenBtn: $("forgetTokenBtn"), manualForgetTokenBtn: $("manualForgetTokenBtn"),
    tokenStorageStatus: $("tokenStorageStatus"), manualTokenStorageStatus: $("manualTokenStorageStatus")
  };

  const state = {
    mode: null, file: null, fileType: null, workbook: null, rows: [], headers: [], results: [], sourceBaseName: "resultado",
    progressStartMs: 0, progressDone: 0, progressTotal: 0, progressTitleText: "Consultando IUCN", progressTimer: null,
    connectorReady: false, tokenSaved: false, savedToken: ""
  };

  const table = IUCNTable.createTableController({
    head: el.resultsHead, body: el.resultsBody, search: el.tableSearch, pageSizeSelect: el.pageSizeSelect,
    paginationMeta: el.paginationMeta, pagination: el.pagination,
    onFilteredCount: n => { el.resultsMeta.textContent = `${n} ${n === 1 ? "registro" : "registros"}`; }
  });

  function showToast(message, ms=3200) {
    el.toast.textContent = message; el.toast.classList.remove("hidden");
    clearTimeout(showToast._t); showToast._t=setTimeout(()=>el.toast.classList.add("hidden"),ms);
  }
  function setView(workspace) { el.landingView.classList.toggle("hidden", workspace); el.workspaceView.classList.toggle("hidden", !workspace); }
  function togglePassword(input) { input.type = input.type === "password" ? "text" : "password"; }
  function resetCounts() { el.countFound.textContent="0"; el.countNotFound.textContent="0"; el.countErrors.textContent="0"; }
  function updateCounts(counts) { el.countFound.textContent=String(counts.found||0); el.countNotFound.textContent=String(counts.notFound||0); el.countErrors.textContent=String(counts.error||0); }

  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms < 0) return "--:--";
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const sec = totalSec % 60;
    return h ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  }

  function refreshProgress() {
    const done = state.progressDone, total = state.progressTotal;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const elapsedMs = state.progressStartMs ? performance.now() - state.progressStartMs : 0;
    const etaMs = done > 0 && total > done ? (elapsedMs / done) * (total - done) : 0;
    const etaPart = done > 0 && total > done ? ` · ~${formatDuration(etaMs)} restante` : "";
    el.progressTitle.textContent = state.progressTitleText;
    el.progressText.textContent = `${done} / ${total} · ${pct}% · ${formatDuration(elapsedMs)} transcurrido${etaPart}`;
    el.progressBar.style.width = `${pct}%`;
    el.progressTrack.setAttribute("aria-valuenow", String(pct));
  }

  function setProgress(done,total,title="Consultando IUCN") {
    state.progressDone = done; state.progressTotal = total; state.progressTitleText = title; refreshProgress();
  }

  function startProgressClock(total, title="Consultando IUCN") {
    if (state.progressTimer) clearInterval(state.progressTimer);
    state.progressStartMs = performance.now(); state.progressDone = 0; state.progressTotal = total; state.progressTitleText = title;
    refreshProgress(); state.progressTimer = setInterval(refreshProgress, 1000);
  }

  function stopProgressClock() {
    if (state.progressTimer) clearInterval(state.progressTimer);
    state.progressTimer = null; refreshProgress();
  }

  function recommendedConcurrency() {
    const hc = Number(navigator.hardwareConcurrency) || 4;
    return Math.max(4, Math.min(10, Math.floor(hc)));
  }
  function setBusy(busy) { el.consultBtn.disabled=busy; el.manualConsultBtn.disabled=busy; el.resetBtn.disabled=busy; el.downloadBtn.disabled=busy || !state.results.length; }

  function detectedBrowser() {
    const ua = String(navigator.userAgent || "");
    return /Edg\//.test(ua)
      ? { name: "Edge", route: "edge://extensions", icon: "assets/icons/edge.svg", loadLabel: "Cargar desempaquetado" }
      : { name: "Chrome", route: "chrome://extensions", icon: "assets/icons/chrome.svg", loadLabel: "Cargar extensión sin empaquetar" };
  }

  function configureBrowserGuide() {
    const browser = detectedBrowser();
    if (el.browserRoute) el.browserRoute.textContent = browser.route;
    if (el.browserIcon) el.browserIcon.src = browser.icon;
    if (el.loadUnpackedLabel) el.loadUnpackedLabel.textContent = browser.loadLabel;
    return browser;
  }

  function setGateLocked(locked) {
    document.body.classList.toggle("connector-locked", locked);
    if (el.connectorGate) el.connectorGate.classList.toggle("hidden", !locked);
  }

  function renderTokenStorage() {
    const saved = !!state.tokenSaved;
    [el.rememberTokenCheckbox, el.manualRememberTokenCheckbox].forEach(x => { if (x) x.checked = saved; });
    [el.forgetTokenBtn, el.manualForgetTokenBtn].forEach(x => { if (x) x.classList.toggle("hidden", !saved); });
    [el.tokenStorageStatus, el.manualTokenStorageStatus].forEach(x => {
      if (!x) return;
      x.textContent = "";
      x.classList.toggle("is-saved", saved);
    });
  }

  async function loadRememberedToken() {
    if (!state.connectorReady || !globalThis.IUCNExtensionBridge) return;
    try {
      const token = await globalThis.IUCNExtensionBridge.getToken(1800);
      state.savedToken = String(token || "");
      state.tokenSaved = !!state.savedToken;
      if (state.tokenSaved) {
        el.tokenInput.value = state.savedToken;
        el.manualTokenInput.value = state.savedToken;
      }
      renderTokenStorage();
    } catch (err) {
      console.warn("No se pudo leer el token local:", err);
      state.savedToken = ""; state.tokenSaved = false; renderTokenStorage();
    }
  }

  async function persistTokenPreference(token) {
    if (!globalThis.IUCNExtensionBridge) return;
    const wantsSave = !!((el.rememberTokenCheckbox && el.rememberTokenCheckbox.checked) || (el.manualRememberTokenCheckbox && el.manualRememberTokenCheckbox.checked));
    const clean = String(token || "").trim();
    if (wantsSave && clean) {
      await globalThis.IUCNExtensionBridge.saveToken(clean, 1800);
      state.savedToken = clean; state.tokenSaved = true;
    } else if (!wantsSave && state.tokenSaved) {
      await globalThis.IUCNExtensionBridge.clearToken(1800);
      state.savedToken = ""; state.tokenSaved = false;
    }
    renderTokenStorage();
  }

  async function forgetSavedToken(clearInputs = true) {
    try {
      const currentToken = el.tokenInput.value || el.manualTokenInput.value || "";
      if (globalThis.IUCNExtensionBridge) await globalThis.IUCNExtensionBridge.clearToken(1800);
      state.savedToken = ""; state.tokenSaved = false;
      if (clearInputs) {
        el.tokenInput.value = ""; el.manualTokenInput.value = "";
      } else {
        el.tokenInput.value = currentToken; el.manualTokenInput.value = currentToken;
      }
      renderTokenStorage();
      showToast(clearInputs ? "Token olvidado de este navegador." : "El token ya no se recordará en este navegador.");
    } catch (err) {
      showToast("No se pudo borrar el token local.");
    }
  }

  async function refreshConnectorStatus() {
    configureBrowserGuide();
    const wasReady = state.connectorReady;
    const ok = !!(globalThis.IUCNExtensionBridge && await globalThis.IUCNExtensionBridge.ping(1400));
    state.connectorReady = ok;
    setGateLocked(!ok);
    if (ok && !wasReady) await loadRememberedToken();
    return ok;
  }

  function resetApp() {
    if (state.progressTimer) clearInterval(state.progressTimer);
    state.mode=null; state.file=null; state.fileType=null; state.workbook=null; state.rows=[]; state.headers=[]; state.results=[]; state.sourceBaseName="resultado";
    state.progressStartMs=0; state.progressDone=0; state.progressTotal=0; state.progressTitleText="Consultando IUCN"; state.progressTimer=null;
    el.fileInput.value=""; el.manualSpecies.value=""; el.sheetSelect.innerHTML=""; el.columnSelect.innerHTML="";
    el.tokenInput.value=state.tokenSaved ? state.savedToken : ""; el.manualTokenInput.value=state.tokenSaved ? state.savedToken : ""; renderTokenStorage();
    el.progressBlock.classList.add("hidden"); el.resultsDivider.classList.add("hidden"); el.resultsSection.classList.add("hidden"); el.downloadBtn.disabled=true;
    el.progressBar.style.width="0%"; resetCounts(); table.clear(); setBusy(false); setView(false); window.scrollTo({top:0,behavior:"smooth"});
  }

  function fillSelect(select, values, preferred) {
    select.innerHTML=""; values.forEach(v=>{const o=document.createElement("option");o.value=v;o.textContent=v;select.appendChild(o);});
    const preferredNorm=(preferred||[]).map(v=>v.toLowerCase().replace(/[^a-z0-9]/g,""));
    const match=values.find(v=>preferredNorm.includes(String(v).toLowerCase().replace(/[^a-z0-9]/g,"")));
    if(match) select.value=match;
  }

  function currentFileNameStats() {
    const col = el.columnSelect.value;
    const names = col ? state.rows.map(r => r[col]) : [];
    return IUCNCore.nameStats(names);
  }

  function updateSourceMeta() {
    if (state.mode === "file") {
      const stats = currentFileNameStats();
      el.sourceMeta.textContent = `· ${state.rows.length} registros · ${stats.valid} nombres válidos · ${stats.unique} únicos`;
    } else if (state.mode === "manual") {
      const stats = IUCNCore.nameStats(namesFromManual());
      el.sourceMeta.textContent = `· ${stats.valid} nombres · ${stats.unique} únicos`;
    }
  }

  function extractRowsFromSheet(sheetName) {
    const ws=state.workbook.Sheets[sheetName];
    const rows=XLSX.utils.sheet_to_json(ws,{defval:"",raw:false});
    state.rows=rows; state.headers=rows.length?Object.keys(rows[0]):[];
    fillSelect(el.columnSelect,state.headers,["scientific_name","scientificname","species","scientific name","nombre_cientifico","nombre científico"]);
    updateSourceMeta();
  }

  async function handleFile(file) {
    if (!state.connectorReady) { setGateLocked(true); return; }
    if (!file) return;
    if (!globalThis.XLSX) { showToast("No se pudo cargar el lector de Excel. Revisa tu conexión."); return; }
    const ext=(file.name.split(".").pop()||"").toLowerCase();
    if(!["xlsx","xls","csv"].includes(ext)){showToast("Formato no compatible. Usa Excel (.xlsx/.xls) o CSV.");return;}
    try {
      const buf=await file.arrayBuffer(); const wb=XLSX.read(buf,{type:"array"});
      state.mode="file"; state.file=file; state.fileType=ext==="csv"?"csv":"excel"; state.workbook=wb; state.sourceBaseName=file.name.replace(/\.[^.]+$/,"" )||"resultado";
      el.fileConfig.classList.remove("hidden"); el.manualConfig.classList.add("hidden"); resetCounts();
      el.sourceLabel.textContent=`Archivo cargado: ${file.name}`;
      fillSelect(el.sheetSelect,wb.SheetNames,[]);
      if(state.fileType==="csv") { el.sheetField.classList.add("hidden"); extractRowsFromSheet(wb.SheetNames[0]); }
      else { el.sheetField.classList.remove("hidden"); extractRowsFromSheet(el.sheetSelect.value); }
      setView(true); window.scrollTo({top:0,behavior:"smooth"});
    } catch(err){console.error(err);showToast("No pude leer el archivo. Verifica que no esté dañado.");}
  }

  function openManual() {
    if (!state.connectorReady) { setGateLocked(true); return; }
    state.mode="manual"; state.sourceBaseName="entrada_manual"; state.results=[]; resetCounts();
    el.sourceLabel.textContent="Entrada manual"; el.sourceMeta.textContent="· 0 nombres · 0 únicos";
    el.fileConfig.classList.add("hidden"); el.manualConfig.classList.remove("hidden"); setView(true); setTimeout(()=>el.manualSpecies.focus(),50);
  }

  function namesFromFile() {
    const col=el.columnSelect.value; if(!col) return [];
    return state.rows.map(r=>String(r[col]??"").trim()).filter(Boolean);
  }
  function namesFromManual() { return el.manualSpecies.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean); }

  function isLocalPythonMode() {
    const h = String(window.location.hostname || "").toLowerCase();
    return h === "127.0.0.1" || h === "localhost";
  }

  async function localPythonQuery(names, token, concurrency) {
    const create = await fetch("/local-api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ names, token, max_workers: concurrency })
    });
    const created = await create.json().catch(() => ({}));
    if (!create.ok) throw new Error(created.error || `No se pudo iniciar la consulta (HTTP ${create.status})`);

    const jobId = created.job_id;
    const total = Number(created.total) || 0;
    const workers = Number(created.max_workers) || concurrency;
    startProgressClock(total, `Consultando IUCN · motor Python · ${workers} consultas simultáneas`);

    try {
      while (true) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const r = await fetch(`/local-api/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
        const st = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(st.error || `No se pudo leer el progreso (HTTP ${r.status})`);

        const counts = st.counts || { found: 0, notFound: 0, error: 0 };
        updateCounts(counts);
        state.progressDone = Number(st.done) || 0;
        state.progressTotal = Number(st.total) || total;
        state.progressTitleText = `Consultando IUCN · motor Python · ${workers} consultas simultáneas`;
        refreshProgress();

        if (st.status === "error") throw new Error(st.error || "Consulta Python fallida");
        if (st.status === "done") break;
      }

      const rr = await fetch(`/local-api/jobs/${encodeURIComponent(jobId)}/result`, { cache: "no-store" });
      const payload = await rr.json().catch(() => ({}));
      if (!rr.ok) throw new Error(payload.error || `No se pudo obtener el resultado (HTTP ${rr.status})`);
      return payload.results || [];
    } finally {
      fetch(`/local-api/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE", cache: "no-store" }).catch(() => {});
    }
  }

  async function runQuery(names,token) {
    if(!token.trim()){showToast("Ingresa tu token IUCN.");return;}
    const stats = IUCNCore.nameStats(names);
    if(!stats.valid){showToast("No hay nombres científicos para consultar.");return;}

    state.results=[]; resetCounts(); table.clear(); setBusy(true); el.progressBlock.classList.remove("hidden");
    el.resultsDivider.classList.add("hidden"); el.resultsSection.classList.add("hidden");
    const running={found:0,notFound:0,error:0};
    const concurrency = recommendedConcurrency();

    try {
      let results;
      const extensionReady = !!(globalThis.IUCNExtensionBridge && await globalThis.IUCNExtensionBridge.ping(1800));
      if (!extensionReady) {
        state.connectorReady = false; setGateLocked(true);
        const err = new Error("Jocotoco IUCN Connector no está instalado o no tiene permiso para esta página.");
        err.code = "EXTENSION_NOT_FOUND";
        throw err;
      }
      state.connectorReady = true;

      startProgressClock(stats.unique, "Verificando acceso IUCN · conector local");
      const probe = await IUCNCore.queryOne("Panthera leo", token.trim(), {
        timeoutMs: 20000, maxTries: 2, allowSisFallback: false
      });
      if (probe && probe._fatalError) throw probe._fatalError;
      if (IUCNCore.classifyRecord(probe) !== "found") {
        const err = new Error(`IUCN no validó la especie de prueba (HTTP ${probe.httpStatus || "?"}: ${probe.note || "sin detalle"}).`);
        err.code = "IUCN_PROBE_FAILED";
        throw err;
      }
      await persistTokenPreference(token.trim());
      setProgress(0, stats.unique, `Consultando IUCN · conector local · ${concurrency} simultáneas`);
      results = await IUCNCore.queryMany(names,token.trim(),{
        concurrency, timeoutMs:30000, maxTries:4, allowSisFallback:true,
        onProgress:(done,total,rec)=>{
          const s=IUCNCore.classifyRecord(rec);
          if(s==="found")running.found++; else if(s==="error")running.error++; else running.notFound++;
          updateCounts(running); setProgress(done,total,`Consultando IUCN · conector local · ${concurrency} simultáneas`);
        }
      });
      state.results=results; const summary=IUCNCore.summarizeUnique(results); updateCounts(summary);
      state.progressDone = state.progressTotal || stats.unique; state.progressTotal = state.progressTotal || stats.unique; state.progressTitleText = "Consulta completada"; stopProgressClock();
      table.setRows(results); el.resultsDivider.classList.remove("hidden"); el.resultsSection.classList.remove("hidden"); el.downloadBtn.disabled=false;
      showToast(`Consulta completada: ${summary.found} encontradas, ${summary.notFound} no encontradas, ${summary.error} errores.`);
      el.resultsSection.scrollIntoView({behavior:"smooth",block:"start"});
    } catch(err) {
      console.error(err); state.progressTitleText="No se pudo completar la consulta"; stopProgressClock();
      if(err && err.code==="EXTENSION_NOT_FOUND") showToast("Falta Jocotoco IUCN Connector. Instala/activa la extensión y recarga esta página.",9000);
      else if(err && ["EXTENSION_TIMEOUT","EXTENSION_NO_RESPONSE"].includes(err.code)) showToast("La extensión IUCN está instalada pero no respondió. Recarga la extensión y esta página.",9000);
      else if(err && err.code==="NETWORK_OR_CORS") showToast("El conector no pudo comunicarse con IUCN. Revisa tu conexión.",7000);
      else if(err && err.code==="IUCN_PROBE_FAILED") showToast(err.message || "IUCN no respondió correctamente para la especie de prueba.",10000);
      else showToast(`Error: ${err && err.message ? err.message : "consulta fallida"}`,5000);
    } finally { setBusy(false); }
  }

  async function downloadExcel() {
    if(!state.results.length || !globalThis.XLSX) return;
    try {
      const ws=XLSX.utils.json_to_sheet(state.results,{skipHeader:false});
      const widths=Object.keys(state.results[0]||{}).map(k=>({wch:Math.min(42,Math.max(12,k.length+2))})); ws["!cols"]=widths;
      const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,"IUCN_results");
      const name=`${state.sourceBaseName}_IUCN.xlsx`;
      XLSX.writeFile(wb,name,{compression:true});
      showToast("Descarga iniciada. Volviendo al inicio…",1400);
      setTimeout(resetApp,1100);
    } catch(err){console.error(err);showToast("No se pudo generar el Excel.");}
  }

  el.selectFileBtn.addEventListener("click",()=>el.fileInput.click()); el.dropzone.addEventListener("click",()=>el.fileInput.click());
  el.dropzone.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();el.fileInput.click();}});
  el.fileInput.addEventListener("change",e=>handleFile(e.target.files[0])); el.manualBtn.addEventListener("click",openManual); el.resetBtn.addEventListener("click",resetApp);
  el.sheetSelect.addEventListener("change",()=>extractRowsFromSheet(el.sheetSelect.value));
  el.columnSelect.addEventListener("change",updateSourceMeta);
  el.manualSpecies.addEventListener("input",updateSourceMeta);
  el.toggleTokenBtn.addEventListener("click",()=>togglePassword(el.tokenInput)); el.toggleManualTokenBtn.addEventListener("click",()=>togglePassword(el.manualTokenInput));
  el.tokenInput.addEventListener("input",()=>{ el.manualTokenInput.value=el.tokenInput.value; });
  el.manualTokenInput.addEventListener("input",()=>{ el.tokenInput.value=el.manualTokenInput.value; });
  el.rememberTokenCheckbox.addEventListener("change",()=>{ el.manualRememberTokenCheckbox.checked=el.rememberTokenCheckbox.checked; if(!el.rememberTokenCheckbox.checked && state.tokenSaved) forgetSavedToken(false); });
  el.manualRememberTokenCheckbox.addEventListener("change",()=>{ el.rememberTokenCheckbox.checked=el.manualRememberTokenCheckbox.checked; if(!el.manualRememberTokenCheckbox.checked && state.tokenSaved) forgetSavedToken(false); });
  el.forgetTokenBtn.addEventListener("click",forgetSavedToken); el.manualForgetTokenBtn.addEventListener("click",forgetSavedToken);
  el.consultBtn.addEventListener("click",()=>runQuery(namesFromFile(),el.tokenInput.value)); el.manualConsultBtn.addEventListener("click",()=>runQuery(namesFromManual(),el.manualTokenInput.value));
  el.downloadBtn.addEventListener("click",downloadExcel);
  ["dragenter","dragover"].forEach(t=>el.dropzone.addEventListener(t,e=>{e.preventDefault();el.dropzone.classList.add("dragover");}));
  ["dragleave","drop"].forEach(t=>el.dropzone.addEventListener(t,e=>{e.preventDefault();el.dropzone.classList.remove("dragover");}));
  el.dropzone.addEventListener("drop",e=>handleFile(e.dataTransfer.files[0]));

  el.connectorRetryBtn.addEventListener("click", ()=>window.location.reload());

  resetApp();
  configureBrowserGuide();
  refreshConnectorStatus();
  window.addEventListener("focus", refreshConnectorStatus);
  setInterval(refreshConnectorStatus, 8000);
})();
