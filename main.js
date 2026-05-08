const Y = "#FFDE00";
const N = ["#464a72","#4f547f","#585d8c","#616699","#6b709e","#7478a8","#7e82b1"];
let charts = {};
let lastData = null;

// ── Tooltip global defaults (mejora móvil) ────────────────
Chart.defaults.plugins.tooltip.position = 'nearest';
Chart.defaults.plugins.tooltip.caretPadding = 8;
Chart.defaults.plugins.tooltip.padding = 10;


// ── Error display ──────────────────────────────────────────
function showError(msg) {
  document.getElementById("errorMsg").textContent = msg;
  document.getElementById("errorCard").classList.add("visible");
  document.getElementById("pb").textContent = "Sin datos";
}
function hideError() {
  document.getElementById("errorCard").classList.remove("visible");
}

// ── Month filter ───────────────────────────────────────────
function populateMonthFilter(months) {
  const opts = '<option value="-1">YTD completo</option>' +
    months.map((m, i) => `<option value="${i}">${m}</option>`).join("");
  const sel = document.getElementById("monthFilter");
  sel.innerHTML = opts;
  sel.value = "-1";
  sel.style.display = "";
  const selM = document.getElementById("monthFilterM");
  selM.innerHTML = opts;
  selM.value = "-1";
}

function sliceData(d, ci) {
  function sc(cats) {
    return cats.map(c => {
      const monthly = c.monthly.slice(0, ci + 1);
      return { ...c, monthly, ytd: c.monthly[ci] || 0 };
    });
  }
  const evSlice = d.entrega.values.slice(0, ci + 1);
  const rrssVm  = (d.rrss && d.rrss.volMon) ? d.rrss.volMon.slice(0, ci + 1) : [];
  const rrssHm  = (d.rrss && d.rrss.horMon) ? d.rrss.horMon.slice(0, ci + 1) : [];
  return {
    tipologia: { months: d.tipologia.months.slice(0, ci + 1), categories: sc(d.tipologia.categories) },
    negVol:    { months: d.negVol.months.slice(0, ci + 1),    categories: sc(d.negVol.categories) },
    negHoras:  { months: d.negHoras.months.slice(0, ci + 1),  categories: sc(d.negHoras.categories) },
    ciudad:    { months: d.ciudad.months.slice(0, ci + 1),    categories: sc(d.ciudad.categories) },
    freelance: d.freelance ? { months: d.freelance.months.slice(0, ci + 1), categories: sc(d.freelance.categories) } : null,
    entrega: {
      months: d.entrega.months.slice(0, ci + 1),
      values: evSlice,
      mediaYTD: evSlice[ci] !== undefined ? evSlice[ci] : 0
    },
    rrss: d.rrss ? {
      months: d.rrss.months.slice(0, ci + 1),
      volMon: rrssVm, horMon: rrssHm,
      volYTD: rrssVm[ci] || 0,
      horYTD: rrssHm[ci] || 0
    } : d.rrss
  };
}

function renderWithFilter() {
  if (!lastData) return;
  const ci = parseInt(document.getElementById("monthFilter").value);
  if (ci === -1) {
    render(lastData);
  } else {
    render(sliceData(lastData, ci));
    document.getElementById("pb").textContent = shortMonth(lastData.tipologia.months[ci]);
  }
}


function isMobile() { return window.innerWidth <= 640; }

function cols(n) {
  return Array.from({length: n}, (_, i) => i === 0 ? Y : N[Math.min(i - 1, N.length - 1)]);
}
function sorted(cats) {
  return [...cats].sort((a, b) => b.ytd - a.ytd);
}
function sub(cur, prev, u = "") {
  if (prev === null) return "";
  const d = cur - prev;
  if (d === 0) return "Sin cambios";
  const cl = d > 0 ? "up" : "dn";
  return `<span class="${cl}">${d > 0 ? "▲" : "▼"} ${d > 0 ? "+" : ""}${Number.isInteger(d) ? d : d.toFixed(1)}${u}</span> vs mes anterior`;
}
function kill(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}
const MONTH_ABBR = {
  enero:'ENE',febrero:'FEB',marzo:'MAR',abril:'ABR',mayo:'MAY',junio:'JUN',
  julio:'JUL',agosto:'AGO',septiembre:'SEP',octubre:'OCT',noviembre:'NOV',diciembre:'DIC'
};
function shortMonth(m) {
  const [name, yr] = m.trim().split(/\s+/);
  const abbr = MONTH_ABBR[name.toLowerCase()] || name.slice(0, 3).toUpperCase();
  return yr ? abbr + " " + String(yr).slice(-2) : abbr;
}
function period(months) {
  if (!months || !months.length) return "";
  const s = shortMonth(months[0]);
  return months.length === 1 ? s : s + " – " + shortMonth(months[months.length - 1]);
}

function mergeResidencial(cats) {
  const residKey = cats.filter(c => /residencial/i.test(c.name));
  const others   = cats.filter(c => !/residencial/i.test(c.name));
  if (residKey.length === 0) return cats;
  const merged = {
    name: "Residencial total",
    ytd: residKey.reduce((s, c) => s + c.ytd, 0),
    monthly: residKey[0].monthly.map((_, i) => residKey.reduce((s, c) => s + (c.monthly[i] || 0), 0))
  };
  return [...others, merged];
}

// Renombrar categorías del Excel
const RENAMES = { "MKT": "Corporativo" };
function renameCategories(cats) {
  return cats.map(c => ({ ...c, name: RENAMES[c.name.trim()] || c.name }));
}

function renderCombo(d, mob) {
  kill("combo");
  const ml = d.tipologia.months;
  const wm = ml.map((_, i) => d.tipologia.categories.reduce((s, c) => s + (c.monthly[i] || 0), 0));
  const hm = ml.map((_, i) => d.negHoras.categories.reduce((s, c) => s + (c.monthly[i] || 0), 0));
  const mxi = wm.indexOf(Math.max(...wm));
  charts.combo = new Chart(document.getElementById("combo"), {
    type: "bar",
    data: {
      labels: ml,
      datasets: [
        {
          type: "line", label: "Total horas", data: hm,
          borderColor: "#ffffff", backgroundColor: "rgba(255,255,255,.08)",
          pointBackgroundColor: "#ffffff", pointBorderColor: "#12152a", pointBorderWidth: 2,
          pointRadius: 5, tension: .35, fill: true, yAxisID: "y1", order: 0
        },
        {
          type: "bar", label: "Total trabajos", data: wm,
          backgroundColor: wm.map((_, i) => i === mxi ? Y : "#464a72"),
          borderRadius: 4, yAxisID: "y", order: 1
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: !mob, position: "top", labels: { color: "#c2c5da", font: { family: "Montserrat", size: 11 }, boxWidth: 10, padding: 14 } }
      },
      scales: {
        x: { ticks: { color: "#c2c5da", font: { family: "Montserrat", size: 10 } }, grid: { color: "rgba(255,255,255,.04)" }, border: { display: false } },
        y: { position: "left", ticks: { color: "#c2c5da", font: { family: "Montserrat", size: 10 } }, grid: { color: "rgba(255,255,255,.04)" }, border: { display: false } },
        y1: { position: "right", ticks: { color: "rgba(255,255,255,.5)", font: { family: "Montserrat", size: 10 } }, grid: { display: false }, border: { display: false } }
      }
    }
  });
}

function vBar(canvasId, data, suf) {
  kill(canvasId);
  const mob = isMobile();
  const s = sorted(mob ? data.slice(0, 5) : data);
  const tot = sorted(data).reduce((a, c) => a + c.ytd, 0); // always full total for %
  const c = cols(s.length);
  charts[canvasId] = new Chart(document.getElementById(canvasId), {
    type: "bar",
    data: {
      labels: s.map(c => c.name),
      datasets: [{
        data: s.map(c => c.ytd),
        backgroundColor: c,
        borderRadius: 4,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => " " + ctx.parsed.y.toLocaleString("es-ES") + suf + " (" + Math.round(ctx.parsed.y / tot * 100) + "%)" } }
      },
      scales: {
        x: { ticks: { display: !mob, color: "#c2c5da", font: { family: "Montserrat", size: 10 }, maxRotation: 35, minRotation: 25 }, grid: { display: false }, border: { display: false } },
        y: { ticks: { color: "#9499c0", font: { family: "Montserrat", size: 10 } }, grid: { color: "rgba(255,255,255,.05)" }, border: { display: false } }
      }
    }
  });
}

function render(d) {
  document.getElementById("pb").textContent = period(d.tipologia.months);
  const lm = d.tipologia.months.length - 1;

  // KPI 0 — Total trabajos
  const tw = d.tipologia.categories.reduce((s, c) => s + c.ytd, 0);
  const wl = d.tipologia.categories.reduce((s, c) => s + (c.monthly[lm] || 0), 0);
  const wp = lm > 0 ? d.tipologia.categories.reduce((s, c) => s + (c.monthly[lm - 1] || 0), 0) : null;
  document.getElementById("kv0").textContent = tw.toLocaleString("es-ES");
  document.getElementById("ks0").innerHTML = sub(wl, wp);

  // KPI 1 — Total horas
  const th = d.negHoras.categories.reduce((s, c) => s + c.ytd, 0);
  const hl = d.negHoras.categories.reduce((s, c) => s + (c.monthly[lm] || 0), 0);
  const hp = lm > 0 ? d.negHoras.categories.reduce((s, c) => s + (c.monthly[lm - 1] || 0), 0) : null;
  document.getElementById("kv1").textContent = th.toLocaleString("es-ES");
  document.getElementById("ks1").innerHTML = sub(hl, hp, " h");

  // KPI 2 — Entrega
  const ev = d.entrega.values;
  const el = ev.length > 0 ? ev[Math.min(lm, ev.length - 1)] : 0;
  const ep = lm > 0 && ev.length > 1 ? ev[Math.min(lm - 1, ev.length - 1)] : null;
  document.getElementById("kv2").textContent = d.entrega.mediaYTD.toFixed(1) + " d";
  document.getElementById("ks2").innerHTML = sub(el, ep, " d");

  // KPI 3 — Trabajos externalizados
  const fl = d.freelance ? d.freelance.categories.reduce((s, c) => s + c.ytd, 0) : 0;
  const flPct = tw > 0 ? Math.round(fl / tw * 100) : 0;
  document.getElementById("kv3").textContent = fl.toLocaleString("es-ES");
  document.getElementById("ks3").textContent = flPct + "% del total de trabajos";

  // Fade-in KPIs
  [0, 1, 2, 3].forEach(i => {
    const e = document.getElementById("k" + i);
    e.classList.remove("in");
    setTimeout(() => e.classList.add("in"), 80 + i * 70);
  });

  // Barras verticales — filtrar "Brand Design" de negHoras, fusionar Residencial, renombrar
  const tipologiaMerged   = mergeResidencial(renameCategories(d.tipologia.categories));
  const negVolMerged      = mergeResidencial(renameCategories(d.negVol.categories));
  const negHorasMerged    = mergeResidencial(
    renameCategories(d.negHoras.categories.filter(c => c.name.trim().toLowerCase() !== "brand design"))
  );
  vBar("tc",  tipologiaMerged,  " trabajos");
  vBar("nc",  negVolMerged,     " trabajos");
  vBar("nhc", negHorasMerged,   " h");

  // Ciudad — tarta
  kill("cc2");
  const cs = sorted(renameCategories(d.ciudad.categories));
  const cc = cols(cs.length);
  const ctot = cs.reduce((s, c) => s + c.ytd, 0);
  charts["cc2"] = new Chart(document.getElementById("cc2"), {
    type: "pie",
    data: {
      labels: cs.map(c => c.name),
      datasets: [{ data: cs.map(c => c.ytd), backgroundColor: cc, borderWidth: 0, hoverOffset: 5 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => " " + ctx.parsed.toLocaleString("es-ES") + " (" + Math.round(ctx.parsed / ctot * 100) + "%)" } }
      }
    }
  });
  document.getElementById("cc2leg").innerHTML = cs.map((c, i) =>
    `<div class="pie-li"><div class="pie-dot" style="background:${cc[i]}"></div><span class="pie-name">${c.name}</span><span class="pie-val">${c.ytd.toLocaleString("es-ES")}</span></div>`
  ).join("");

  // Combo
  renderCombo(d, isMobile());

  // RRSS
  document.getElementById("rv").textContent = d.rrss.volYTD.toLocaleString("es-ES");
  document.getElementById("rh").textContent = d.rrss.horYTD.toLocaleString("es-ES") + " h";
  function mb(id, vals, months) {
    const mx = Math.max(...vals);
    const mxi = vals.indexOf(mx);
    document.getElementById(id).innerHTML = months.map((m, i) => {
      const p = mx > 0 ? vals[i] / mx * 100 : 0;
      const cl = i === mxi ? Y : "#464a72";
      return `<div class="mrow"><div class="mm">${m}</div><div class="mbw"><div class="mbf" style="width:${p}%;background:${cl}"></div></div><div class="mv">${vals[i]}</div></div>`;
    }).join("");
  }
  mb("rvb", d.rrss.volMon, d.rrss.months);
  mb("rhb", d.rrss.horMon, d.rrss.months);

  // ── Ratio horas/trabajo por negocio ──
  kill("ratioChart");
  const negCommon = negVolMerged.filter(nv => {
    return negHorasMerged.find(nh => nh.name === nv.name);
  }).map(nv => {
    const nh = negHorasMerged.find(nh => nh.name === nv.name);
    return { name: nv.name, ratio: nv.ytd > 0 ? parseFloat((nh.ytd / nv.ytd).toFixed(1)) : 0 };
  }).sort((a, b) => b.ratio - a.ratio);
  const ratioColors = cols(negCommon.length);
  charts.ratioChart = new Chart(document.getElementById("ratioChart"), {
    type: "bar",
    data: {
      labels: negCommon.map(c => c.name),
      datasets: [{ data: negCommon.map(c => c.ratio), backgroundColor: ratioColors, borderRadius: 4, borderSkipped: false }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => " " + ctx.parsed.y.toFixed(1) + " h/trabajo" } }
      },
      scales: {
        x: { ticks: { display: !isMobile(), color: "#c2c5da", font: { family: "Montserrat", size: 10 }, maxRotation: 35, minRotation: 25 }, grid: { display: false }, border: { display: false } },
        y: { ticks: { color: "#9499c0", font: { family: "Montserrat", size: 10 } }, grid: { color: "rgba(255,255,255,.05)" }, border: { display: false } }
      }
    }
  });

  // ── Radar — volumen por negocio (normalizado) ──
  kill("radarChart");
  const radarCats = sorted(negVolMerged).slice(0, 6);
  const maxVol = Math.max(...radarCats.map(c => c.ytd));
  charts.radarChart = new Chart(document.getElementById("radarChart"), {
    type: "radar",
    data: {
      labels: radarCats.map(c => c.name),
      datasets: [
        {
          label: "Volumen trabajos",
          data: radarCats.map(c => maxVol > 0 ? Math.round(c.ytd / maxVol * 100) : 0),
          borderColor: Y, backgroundColor: "rgba(255,222,0,.15)", pointBackgroundColor: Y, pointRadius: 4, borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        r: {
          ticks: { display: false },
          grid: { color: "rgba(255,255,255,.08)" },
          angleLines: { color: "rgba(255,255,255,.08)" },
          pointLabels: { color: "#c2c5da", font: { family: "Montserrat", size: 10 } }
        }
      }
    }
  });
}

function parseExcel(buf) {
  const wb = XLSX.read(buf, { type: "array" });

  function parseSheet(ws) {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const h = rows[2];
    if (!h) return null;
    const yc = h.findIndex(c => c && String(c).toLowerCase().includes("total ytd"));
    const mc = [];
    for (let c = 1; c < (yc > 0 ? yc : h.length); c++) {
      if (h[c]) mc.push({ i: c, n: String(h[c]) });
    }
    const cats = [];
    for (let r = 3; r < rows.length; r++) {
      const row = rows[r];
      const cat = row && row[0] ? String(row[0]).trim() : "";
      if (!cat || cat.toUpperCase() === "TOTAL") break;
      cats.push({
        name: cat,
        monthly: mc.map(m => Number(row[m.i]) || 0),
        ytd: yc >= 0 ? Number(row[yc]) || 0 : mc.reduce((s, m) => s + (Number(row[m.i]) || 0), 0)
      });
    }
    return { months: mc.map(m => m.n), categories: cats };
  }

  const d = {};
  ["Tipologia", "Negocio_Volumen", "Negocio_Horas", "Ciudad", "Freelance"].forEach(s => {
    if (wb.Sheets[s]) {
      const key = { Tipologia: "tipologia", Negocio_Volumen: "negVol", Negocio_Horas: "negHoras", Ciudad: "ciudad", Freelance: "freelance" }[s];
      d[key] = parseSheet(wb.Sheets[s]);
    }
  });

  // Entrega
  const er = wb.Sheets["Entrega"] ? XLSX.utils.sheet_to_json(wb.Sheets["Entrega"], { header: 1, defval: null }) : null;
  if (er) {
    const h = er[2], dv = er[3], mv = er[4];
    const ms = [], vs = [];
    for (let c = 1; c < h.length; c++) {
      if (h[c] && !String(h[c]).toLowerCase().includes("total")) {
        ms.push(String(h[c]));
        vs.push(Number(dv[c]) || 0);
      }
    }
    const media = mv ? (Number(mv[1]) || 0) : (vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0);
    d.entrega = { months: ms, values: vs, mediaYTD: media };
  } else {
    d.entrega = { months: [], values: [], mediaYTD: 0 };
  }

  // RRSS
  const rr = wb.Sheets["RRSS"] ? XLSX.utils.sheet_to_json(wb.Sheets["RRSS"], { header: 1, defval: null }) : null;
  if (rr) {
    const h = rr[2], v = rr[3], hr = rr[4];
    const ms = [], vm = [], hm = [];
    let vY = 0, hY = 0;
    for (let c = 1; c < h.length; c++) {
      if (!h[c]) continue;
      if (String(h[c]).toLowerCase().includes("total")) {
        vY = Number(v[c]) || 0;
        hY = Number(hr[c]) || 0;
      } else {
        ms.push(String(h[c]));
        vm.push(Number(v[c]) || 0);
        hm.push(Number(hr[c]) || 0);
      }
    }
    d.rrss = { months: ms, volMon: vm, horMon: hm, volYTD: vY || vm.reduce((a, b) => a + b, 0), horYTD: hY || hm.reduce((a, b) => a + b, 0) };
  }

  if (!d.tipologia) throw new Error("Estructura de Excel no reconocida. Asegúrate de que el archivo tiene la hoja 'Tipologia'.");
  return d;
}

async function fetchExcel() {
  const errors = [];
  for (const name of ["datos.xlsx", "datos2.xlsx"]) {
    try {
      const res = await fetch(name + "?t=" + Date.now());
      if (!res.ok) { errors.push(`${name}: HTTP ${res.status}`); continue; }
      const buf = await res.arrayBuffer();
      lastData = parseExcel(buf);
      hideError();
      populateMonthFilter(lastData.tipologia.months);
      render(lastData);
      return;
    } catch (e) {
      errors.push(e.message || name);
    }
  }
  showError(
    "No se encontró ningún archivo de datos válido. " +
    (errors.length ? "(" + errors.join(" / ") + ")" : "")
  );
}

// Auto-refresh
let autoRefreshInterval = null;

function enableAutoRefresh(intervalMs = 15000) {
  if (autoRefreshInterval) return;
  document.getElementById("pb").style.opacity = "0.6";
  document.getElementById("pb").style.animation = "pulse 1s infinite";
  autoRefreshInterval = setInterval(() => fetchExcel(), intervalMs);
  console.log(`Auto-refresh activado cada ${intervalMs / 1000}s`);
}

function disableAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
  document.getElementById("pb").style.opacity = "1";
  document.getElementById("pb").style.animation = "";
  console.log("Auto-refresh desactivado");
}

// Activar auto-refresh si está en la URL (?refresh=15)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has("refresh")) {
  const ms = parseInt(urlParams.get("refresh")) * 1000 || 15000;
  enableAutoRefresh(ms);
}

// Re-render combo legend when crossing mobile breakpoint
let wasMobile = isMobile();
window.addEventListener("resize", () => {
  const nowMobile = isMobile();
  if (nowMobile !== wasMobile && lastData) {
    wasMobile = nowMobile;
    const ci = parseInt(document.getElementById("monthFilter").value);
    const d = ci === -1 ? lastData : sliceData(lastData, ci);
    renderCombo(d, nowMobile);
  }
});

fetchExcel();

// ── Month filter change ────────────────────────────────────
document.getElementById("monthFilter").addEventListener("change", renderWithFilter);



// ── Tabla de datos ────────────────────────────────────────
function buildDataPanel(d) {
  const sections = [
    { key: "tipologia", label: "Tipología",       suffix: "trabajos" },
    { key: "negVol",    label: "Negocio Vol.",     suffix: "trabajos" },
    { key: "negHoras",  label: "Negocio Horas",   suffix: "h"        },
    { key: "ciudad",    label: "Ciudad",           suffix: "trabajos" },
  ];
  const tabsEl = document.getElementById("dpTabs");
  const bodyEl = document.getElementById("dpBody");

  tabsEl.innerHTML = sections.map((s, i) =>
    `<button class="dp-tab${i === 0 ? " active" : ""}" data-idx="${i}">${s.label}</button>`
  ).join("");

  function renderTable(idx) {
    const s = sections[idx];
    const data = d[s.key];
    if (!data || !data.categories.length) {
      bodyEl.innerHTML = '<p style="color:var(--gray);padding:16px">Sin datos para esta sección.</p>';
      return;
    }
    const months = data.months;
    const cats   = data.categories;
    const mTotals = months.map((_, mi) => cats.reduce((sum, c) => sum + (c.monthly[mi] || 0), 0));
    const ytdTot  = cats.reduce((sum, c) => sum + c.ytd, 0);
    bodyEl.innerHTML = `<table class="dp-table">
      <thead><tr>
        <th>Categoría</th>
        ${months.map(m => `<th>${m}</th>`).join("")}
        <th class="ytd-col">YTD</th>
      </tr></thead>
      <tbody>
        ${cats.map(c => `<tr>
          <td>${c.name}</td>
          ${c.monthly.map(v => `<td>${v.toLocaleString("es-ES")}</td>`).join("")}
          <td class="ytd-col">${c.ytd.toLocaleString("es-ES")}</td>
        </tr>`).join("")}
      </tbody>
      <tfoot><tr>
        <td>Total</td>
        ${mTotals.map(t => `<td>${t.toLocaleString("es-ES")}</td>`).join("")}
        <td class="ytd-col">${ytdTot.toLocaleString("es-ES")}</td>
      </tr></tfoot>
    </table>`;
  }

  renderTable(0);
  tabsEl.onclick = e => {
    const tab = e.target.closest(".dp-tab");
    if (!tab) return;
    tabsEl.querySelectorAll(".dp-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    renderTable(parseInt(tab.dataset.idx));
  };
}

// ── Exportar PNG ──────────────────────────────────────────
async function exportDashboard() {
  const btn = document.getElementById("exportBtn");
  const originalHTML = btn.innerHTML;
  btn.innerHTML = "<span>Generando...</span>";
  btn.disabled = true;
  try {
    const canvas = await html2canvas(document.querySelector("main"), {
      backgroundColor: "#12152a",
      scale: 2,
      useCORS: true,
      logging: false,
      ignoreElements: el => el.id === "errorCard"
    });
    const link = document.createElement("a");
    const period = document.getElementById("pb").textContent.replace(/[^a-zA-Z0-9\-]/g, "_");
    link.download = `dashboard-${period || new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (e) {
    alert("Error al exportar: " + e.message);
  }
  btn.innerHTML = originalHTML;
  btn.disabled = false;
}


// ── Export button ─────────────────────────────────────────
document.getElementById("exportBtn").addEventListener("click", exportDashboard);

// ── View data button ──────────────────────────────────────
document.getElementById("viewDataBtn").addEventListener("click", () => {
  if (!lastData) return;
  buildDataPanel(lastData);
  document.getElementById("dataPanel").classList.add("open");
});
document.getElementById("dpClose").addEventListener("click", () => {
  document.getElementById("dataPanel").classList.remove("open");
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") document.getElementById("dataPanel").classList.remove("open");
});

// ── Burger menu (móvil) ───────────────────────────────────
const burgerBtn = document.getElementById("burgerBtn");
const burgerMenu = document.getElementById("burgerMenu");

burgerBtn.addEventListener("click", e => {
  e.stopPropagation();
  burgerMenu.classList.toggle("open");
});

// Cerrar al hacer clic fuera
document.addEventListener("click", () => burgerMenu.classList.remove("open"));
burgerMenu.addEventListener("click", e => e.stopPropagation());

// Acciones del menú móvil
document.getElementById("exportBtnM").addEventListener("click", () => {
  burgerMenu.classList.remove("open");
  exportDashboard();
});

document.getElementById("viewDataBtnM").addEventListener("click", () => {
  burgerMenu.classList.remove("open");
  if (!lastData) return;
  buildDataPanel(lastData);
  document.getElementById("dataPanel").classList.add("open");
});

// Sincronizar filtro de mes móvil ↔ escritorio
document.getElementById("monthFilterM").addEventListener("change", e => {
  document.getElementById("monthFilter").value = e.target.value;
  renderWithFilter();
  burgerMenu.classList.remove("open");
});
document.getElementById("monthFilter").addEventListener("change", () => {
  document.getElementById("monthFilterM").value = document.getElementById("monthFilter").value;
});
