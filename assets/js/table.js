(function (global) {
  "use strict";

  function createTableController(opts) {
    const state = { rows: [], filtered: [], columns: [], query: "", sortKey: null, sortDir: 1, page: 1, pageSize: Number(opts.pageSizeSelect.value) || 25 };

    function cellText(v) { return v === null || v === undefined || v === "" ? "" : String(v); }
    function searchable(row) { return state.columns.map(c => cellText(row[c])).join(" ").toLowerCase(); }
    function compare(a,b,key) {
      const av = a[key], bv = b[key];
      if (av === bv) return 0;
      if (av === null || av === undefined || av === "") return 1;
      if (bv === null || bv === undefined || bv === "") return -1;
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    }

    function badgeForCategory(value) {
      const code = String(value || "").trim().toUpperCase();
      if (!code) return null;
      const cls = ["CR","EN","VU","NT","LC","DD","NE"].includes(code) ? `badge-${code.toLowerCase()}` : "badge-default";
      const span = document.createElement("span"); span.className = `badge ${cls}`; span.textContent = code; return span;
    }

    function renderCell(td, key, value) {
      if ((key === "lastAssessmentCode" || /^assessment\d{4}$/.test(key)) && value) {
        const badge = badgeForCategory(value); if (badge) { td.appendChild(badge); return; }
      }
      if (value === null || value === undefined || value === "") { td.textContent = "—"; td.classList.add("cell-muted"); return; }
      if (key === "lastAssessmentUrl" && /^https?:\/\//.test(String(value))) {
        const a = document.createElement("a"); a.href = String(value); a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = "Abrir"; td.appendChild(a); return;
      }
      td.textContent = String(value);
    }

    function recalc() {
      const q = state.query.trim().toLowerCase();
      state.filtered = q ? state.rows.filter(r => searchable(r).includes(q)) : state.rows.slice();
      if (state.sortKey) state.filtered.sort((a,b) => state.sortDir * compare(a,b,state.sortKey));
      const maxPage = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
      if (state.page > maxPage) state.page = maxPage;
    }

    function renderHead() {
      opts.head.innerHTML = "";
      const tr = document.createElement("tr");
      for (const key of state.columns) {
        const th = document.createElement("th"); th.className = "sortable"; th.scope = "col";
        const label = document.createElement("span"); label.textContent = key;
        const mark = document.createElement("span"); mark.className = "sort-mark";
        mark.textContent = state.sortKey === key ? (state.sortDir > 0 ? "▲" : "▼") : "↕";
        th.append(label, mark);
        th.addEventListener("click", () => { if (state.sortKey === key) state.sortDir *= -1; else { state.sortKey = key; state.sortDir = 1; } state.page = 1; render(); });
        tr.appendChild(th);
      }
      opts.head.appendChild(tr);
    }

    function renderPagination(totalPages) {
      opts.pagination.innerHTML = "";
      const addBtn = (label, page, disabled=false, active=false) => {
        const b = document.createElement("button"); b.type="button"; b.className=`page-btn${active?" active":""}`; b.textContent=label; b.disabled=disabled;
        b.addEventListener("click",()=>{state.page=page; render();}); opts.pagination.appendChild(b);
      };
      addBtn("‹", Math.max(1,state.page-1), state.page===1);
      const pages = new Set([1,totalPages,state.page-1,state.page,state.page+1].filter(p=>p>=1&&p<=totalPages));
      let prev = 0;
      for (const p of [...pages].sort((a,b)=>a-b)) {
        if (prev && p-prev>1) { const s=document.createElement("span"); s.className="page-ellipsis"; s.textContent="…"; opts.pagination.appendChild(s); }
        addBtn(String(p),p,false,p===state.page); prev=p;
      }
      addBtn("›", Math.min(totalPages,state.page+1), state.page===totalPages);
    }

    function render() {
      recalc(); renderHead(); opts.body.innerHTML = "";
      const total = state.filtered.length;
      const start = total ? (state.page-1)*state.pageSize : 0;
      const end = Math.min(start+state.pageSize,total);
      for (const row of state.filtered.slice(start,end)) {
        const tr=document.createElement("tr");
        for (const key of state.columns) { const td=document.createElement("td"); renderCell(td,key,row[key]); tr.appendChild(td); }
        opts.body.appendChild(tr);
      }
      opts.paginationMeta.textContent = total ? `Mostrando ${start+1}–${end} de ${total}` : "Mostrando 0–0 de 0";
      renderPagination(Math.max(1,Math.ceil(total/state.pageSize)));
      if (opts.onFilteredCount) opts.onFilteredCount(total);
    }

    opts.search.addEventListener("input", e=>{state.query=e.target.value||"";state.page=1;render();});
    opts.pageSizeSelect.addEventListener("change", e=>{state.pageSize=Number(e.target.value)||25;state.page=1;render();});

    return {
      setRows(rows) { state.rows=Array.isArray(rows)?rows:[]; state.columns=state.rows.length?Object.keys(state.rows[0]):[]; state.page=1; render(); },
      clear() { state.rows=[]; state.filtered=[]; state.columns=[]; state.query=""; state.sortKey=null; state.sortDir=1; state.page=1; opts.search.value=""; render(); },
      render, state
    };
  }
  global.IUCNTable = { createTableController };
})(globalThis);
