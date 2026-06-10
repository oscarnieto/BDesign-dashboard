const Y = "#FFDE00";
const N = ["#464a72","#4f547f","#585d8c","#616699","#6b709e","#7478a8","#7e82b1"];
let charts = {};
let lastData = null;
let lastData2025 = null;
let currentRenderData = null;
let currentCi = -1;

// ── Tooltip global defaults (mejora móvil) ────────────
Chart.defaults.plugins.tooltip.position = 'nearest';
Chart.defaults.plugins.tooltip.caretPadding = 8;
Chart.defaults.plugins.tooltip.padding = 10;


// ── Error display ──────────────────────────────
function showError(msg) {
  document.getElementById("errorMsg").textContent = msg;
  document.getElementById("errorCard").classList.add("visible");
  document.getElementById("pb").textContent = "Sin datos";
}
function hideError() {
  document.getElementById("errorCard").classList.remove("visible");
}

// ── Month filter ─────────────────────────────────
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
    render(lastData, -1);
  } else {
    render(sliceData(lastData, ci), ci);
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
function subYoY(v26, v25, lowerIsBetter = false) {
  if (v25 === null || v25 === undefined || v25 === 0) return "";
  const pct = Math.round((v26 - v25) / v25 * 100);
  const isGood = lowerIsBetter ? pct <= 0 : pct >= 0;
  const cls = isGood ? "up" : "dn";
  return `<span class="${cls}">${pct >= 0 ? "+" : ""}${pct}% vs 2025</span>`;
}
function subYoYAbs(cur, prev, u = "", label = "YTD 2025", lowerIsBetter = false) {
  if (prev === null || prev === undefined) return "";
  const d = cur - prev;
  if (d === 0) return "Sin cambios vs " + label;
  const isGood = lowerIsBetter ? d < 0 : d > 0;
  const cl = isGood ? "up" : "dn";
  const val = Number.isInteger(d) ? d : d.toFixed(1);
  return `<span class="${cl}">${d > 0 ? "▲" : "▼"} ${d > 0 ? "+" : ""}${val}${u}</span> vs ${label}`;
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
  const wm25 = lastData2025 ? ml.map((_, i) => lastData2025.tipologia.categories.reduce((s, c) => s + (c.monthly[i] || 0), 0)) : null;
  const hm25 = lastData2025 ? ml.map((_, i) => lastData2025.negHoras.categories.reduce((s, c) => s + (c.monthly[i] || 0), 0)) : null;
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
        },
        ...(wm25 ? [{
          type: "line", label: "Trabajos 2025", data: wm25,
          borderColor: "rgba(255,222,0,.45)", borderDash: [5, 4],
          pointRadius: 3, pointBackgroundColor: "rgba(255,222,0,.45)",
          tension: .35, fill: false, yAxisID: "y", order: 2
        }] : []),
        ...(hm25 ? [{
          type: "line", label: "Horas 2025", data: hm25,
          borderColor: "rgba(255,255,255,.3)", borderDash: [5, 4],
          pointRadius: 3, pointBackgroundColor: "rgba(255,255,255,.3)",
          tension: .35, fill: false, yAxisID: "y1", order: 0
        }] : [])
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

function vBar(canvasId, data, suf, onClickFn) {
  kill(canvasId);
  const mob = isMobile();
  const s = mob ? sorted(data).slice(0, 5) : sorted(data);
  const tot = sorted(data).reduce((a, c) => a + c.ytd, 0);
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
      ...(onClickFn ? { onClick: (evt, els) => { if (els.length) onClickFn(s[els[0].index]); } } : {}),
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
  if (onClickFn) document.getElementById(canvasId).style.cursor = "pointer";
}

function openNegModal(catName) {
  if (!currentRenderData) return;
  const d = currentRenderData;
  const ci = currentCi;
  const isSingle = ci >= 0;
  const negVolAll = mergeResidencial(renameCategories(d.negVol.categories));
  const negHorAll = mergeResidencial(renameCategories(d.negHoras.categories.filter(c => c.name.trim().toLowerCase() !== "brand design")));
  const vol = negVolAll.find(c => c.name === catName);
  const hor = negHorAll.find(c => c.name === catName);
  if (!vol) return;

  const totalVol = negVolAll.reduce((s, c) => s + c.ytd, 0);
  const totalHor = negHorAll.reduce((s, c) => s + c.ytd, 0);
  const pctVol   = totalVol > 0 ? Math.round(vol.ytd / totalVol * 100) : 0;
  const pctHor   = hor && totalHor > 0 ? Math.round(hor.ytd / totalHor * 100) : null;
  const ratio    = hor && vol.ytd > 0 ? (hor.ytd / vol.ytd).toFixed(1) : null;
  const lbl      = isSingle ? shortMonth(d.negVol.months[ci]) : "YTD";

  document.getElementById("nmTitle").textContent = catName;

  const kpis = [
    { val: vol.ytd.toLocaleString("es-ES"), lbl: "Trabajos " + lbl },
    { val: pctVol + "%", lbl: "% vol. total" },
    ...(hor ? [{ val: Math.round(hor.ytd).toLocaleString("es-ES") + " h", lbl: "Horas " + lbl }] : []),
    ...(pctHor !== null ? [{ val: pctHor + "%", lbl: "% horas totales" }] : []),
    ...(ratio ? [{ val: ratio + " h", lbl: "H / trabajo" }] : [])
  ];
  document.getElementById("nmKpis").innerHTML = kpis.map(k =>
    `<div class="nm-kpi"><div class="nmk-val">${k.val}</div><div class="nmk-lbl">${k.lbl}</div></div>`
  ).join("");

  function miniBar(containerId, months, monthly, color) {
    const max = Math.max(...monthly.map(v => v || 0), 1);
    document.getElementById(containerId).innerHTML = months.map((m, i) => {
      const v = monthly[i] || 0;
      return `<div class="nm-bar-row">
        <div class="nm-bar-name">${shortMonth(m)}</div>
        <div class="nm-bar-track"><div class="nm-bar-fill" style="width:${v/max*100}%;background:${color}"></div></div>
        <div class="nm-bar-val">${v.toLocaleString("es-ES")}</div>
      </div>`;
    }).join("");
  }
  miniBar("nmVolBars", d.negVol.months, vol.monthly, "var(--yellow)");

  const horSection = document.getElementById("nmHorSection");
  if (hor) {
    horSection.style.display = "";
    miniBar("nmHorBars", d.negHoras.months, hor.monthly, "var(--n4)");
  } else {
    horSection.style.display = "none";
  }

  const yoyEl = document.getElementById("nmYoY");
  if (lastData2025) {
    const nv25 = mergeResidencial(renameCategories(lastData2025.negVol.categories));
    const nh25 = mergeResidencial(renameCategories(lastData2025.negHoras.categories.filter(c => c.name.trim().toLowerCase() !== "brand design")));
    const vol25raw = nv25.find(c => c.name === catName);
    const hor25raw = nh25.find(c => c.name === catName);
    const get25 = (cat) => {
      if (!cat) return 0;
      if (isSingle) return cat.monthly[ci] || 0;
      return cat.monthly.slice(0, d.negVol.months.length).reduce((a, b) => a + b, 0);
    };
    const vol25ytd = get25(vol25raw);
    const hor25ytd = get25(hor25raw);
    const rows = [];
    if (vol25raw) rows.push({ lbl: `Trabajos 2025: ${vol25ytd.toLocaleString("es-ES")}`, v26: vol.ytd, v25: vol25ytd });
    if (hor && hor25raw) rows.push({ lbl: `Horas 2025: ${Math.round(hor25ytd).toLocaleString("es-ES")} h`, v26: hor.ytd, v25: hor25ytd });
    if (rows.length) {
      yoyEl.innerHTML = rows.map(r =>
        `<div class="nm-yoy-row"><span class="nm-yoy-lbl">${r.lbl}</span>${subYoY(r.v26, r.v25)}</div>`
      ).join("");
      yoyEl.style.display = "";
    } else {
      yoyEl.style.display = "none";
    }
  } else {
    yoyEl.style.display = "none";
  }

  document.getElementById("negModal").classList.add("open");
}

function openCiuModal(catName) {
  if (!currentRenderData) return;
  const d = currentRenderData;
  const ci = currentCi;
  const isSingle = ci >= 0;
  const cats = renameCategories(d.ciudad.categories);
  const city = cats.find(c => c.name === catName);
  if (!city) return;
  const total = cats.reduce((s, c) => s + c.ytd, 0);
  const pct   = total > 0 ? Math.round(city.ytd / total * 100) : 0;
  const lbl   = isSingle ? shortMonth(d.ciudad.months[ci]) : "YTD";

  document.getElementById("nmTitle").textContent = catName;
  document.getElementById("nmKpis").innerHTML = [
    { val: city.ytd.toLocaleString("es-ES"), lbl: "Trabajos " + lbl },
    { val: pct + "%", lbl: "% del total" }
  ].map(k => `<div class="nm-kpi"><div class="nmk-val">${k.val}</div><div class="nmk-lbl">${k.lbl}</div></div>`).join("");

  function miniBar(containerId, months, monthly, color) {
    const max = Math.max(...monthly.map(v => v || 0), 1);
    document.getElementById(containerId).innerHTML = months.map((m, i) => {
      const v = monthly[i] || 0;
      return `<div class="nm-bar-row">
        <div class="nm-bar-name">${shortMonth(m)}</div>
        <div class="nm-bar-track"><div class="nm-bar-fill" style="width:${v/max*100}%;background:${color}"></div></div>
        <div class="nm-bar-val">${v.toLocaleString("es-ES")}</div>
      </div>`;
    }).join("");
  }
  document.querySelector("#nmVolBars").previousElementSibling.textContent = "Evolución mensual — Trabajos";
  miniBar("nmVolBars", d.ciudad.months, city.monthly, "var(--yellow)");
  document.getElementById("nmHorSection").style.display = "none";

  const yoyEl = document.getElementById("nmYoY");
  if (lastData2025 && lastData2025.ciudad) {
    const cats25 = renameCategories(lastData2025.ciudad.categories);
    const city25 = cats25.find(c => c.name === catName);
    if (city25) {
      const city25ytd = isSingle
        ? (city25.monthly[ci] || 0)
        : city25.monthly.slice(0, d.ciudad.months.length).reduce((a, b) => a + b, 0);
      yoyEl.innerHTML = `<div class="nm-yoy-row"><span class="nm-yoy-lbl">Trabajos 2025: ${city25ytd.toLocaleString("es-ES")}</span>${subYoY(city.ytd, city25ytd)}</div>`;
      yoyEl.style.display = "";
    } else {
      yoyEl.style.display = "none";
    }
  } else {
    yoyEl.style.display = "none";
  }

  document.getElementById("negModal").classList.add("open");
}

function render(d, ci = -1) {
  currentRenderData = d;
  currentCi = ci;
  document.getElementById("pb").textContent = period(d.tipologia.months);
  const lm = d.tipologia.months.length - 1;
  const isSingle = ci >= 0;
  const periodLbl = isSingle ? d.tipologia.months[lm] : "YTD";
  const setHtml = (id, val) => { const e = document.getElementById(id); if (e) e.innerHTML = val; };
  document.querySelector("#k0 .kl").textContent = "Total trabajos " + periodLbl;
  document.querySelector("#k1 .kl").textContent = "Total horas " + periodLbl;

  function yoySum(sheetKey) {
    if (!lastData2025 || !lastData2025[sheetKey]) return null;
    const cats = lastData2025[sheetKey].categories;
    if (isSingle) return cats.reduce((s, c) => s + (c.monthly[ci] || 0), 0);
    return cats.reduce((s, c) => s + c.monthly.slice(0, lm + 1).reduce((a, b) => a + b, 0), 0);
  }

  const yoyLbl = isSingle ? d.tipologia.months[lm] + " 2025" : "YTD 2025";

  // KPI 0 — Total trabajos
  const tw = d.tipologia.categories.reduce((s, c) => s + c.ytd, 0);
  const tw25 = yoySum("tipologia");
  document.getElementById("kv0").textContent = tw.toLocaleString("es-ES");
  document.getElementById("ks0").innerHTML = subYoYAbs(tw, tw25, "", yoyLbl);
  setHtml("ks0y", subYoY(tw, tw25));

  // KPI 1 — Total horas
  const th = d.negHoras.categories.reduce((s, c) => s + c.ytd, 0);
  const th25 = yoySum("negHoras");
  document.getElementById("kv1").textContent = th.toLocaleString("es-ES");
  document.getElementById("ks1").innerHTML = subYoYAbs(th, th25, " h", yoyLbl);
  setHtml("ks1y", subYoY(th, th25));

  // KPI 2 — Entrega
  const em25 = lastData2025 && lastData2025.entrega
    ? (isSingle ? (lastData2025.entrega.values[ci] || null) : lastData2025.entrega.mediaYTD)
    : null;
  document.getElementById("kv2").textContent = d.entrega.mediaYTD.toFixed(1) + " d";
  document.getElementById("ks2").innerHTML = subYoYAbs(d.entrega.mediaYTD, em25, " d", yoyLbl, true);
  setHtml("ks2y", subYoY(d.entrega.mediaYTD, em25, true));

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

  const tipologiaMerged   = mergeResidencial(renameCategories(d.tipologia.categories));
  const negVolMerged      = mergeResidencial(renameCategories(d.negVol.categories));
  const negHorasMerged    = mergeResidencial(
    renameCategories(d.negHoras.categories.filter(c => c.name.trim().toLowerCase() !== "brand design"))
  );
  vBar("tc",  tipologiaMerged,  " trabajos");
  vBar("nc",  negVolMerged,     " trabajos", (cat) => openNegModal(cat.name));
  vBar("nhc", negHorasMerged,   " h", (cat) => openNegModal(cat.name));

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
      onClick: (evt, els) => { if (els.length) openCiuModal(cs[els[0].index].name); },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => " " + ctx.parsed.toLocaleString("es-ES") + " (" + Math.round(ctx.parsed / ctot * 100) + "%)" } }
      }
    }
  });
  document.getElementById("cc2").style.cursor = "pointer";
  document.getElementById("cc2leg").innerHTML = cs.map((c, i) =>
    `<div class="pie-li" style="cursor:pointer" onclick="openCiuModal('${c.name.replace(/'/g, "\\'")}')"><div class="pie-dot" style="background:${cc[i]}"></div><span class="pie-name">${c.name}</span><span class="pie-val">${c.ytd.toLocaleString("es-ES")}</span></div>`
  ).join("");

  renderCombo(d, isMobile());

  document.getElementById("rv").textContent = d.rrss.volYTD.toLocaleString("es-ES");
  document.getElementById("rh").textContent = d.rrss.horYTD.toLocaleString("es-ES") + " h";
  document.getElementById("rvl").textContent = "RRSS: Publicaciones " + periodLbl;
  document.getElementById("rhl").textContent = "RRSS: Horas dedicadas " + periodLbl;
  if (lastData2025 && lastData2025.rrss) {
    const nMo = d.rrss.months.length;
    const rv25 = isSingle
      ? (lastData2025.rrss.volMon[ci] || 0)
      : lastData2025.rrss.volMon.slice(0, nMo).reduce((a, b) => a + b, 0);
    const rh25 = isSingle
      ? (lastData2025.rrss.horMon[ci] || 0)
      : lastData2025.rrss.horMon.slice(0, nMo).reduce((a, b) => a + b, 0);
    setHtml("rvy", subYoYAbs(d.rrss.volYTD, rv25, "", yoyLbl) + " " + subYoY(d.rrss.volYTD, rv25));
    setHtml("rhy", subYoYAbs(d.rrss.horYTD, rh25, " h", yoyLbl) + " " + subYoY(d.rrss.horYTD, rh25));
  } else {
    setHtml("rvy", ""); setHtml("rhy", "");
  }
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

  kill("ratioChart");
  const negCommon = negVolMerged.filter(nv => {
    return negHorasMerged.find(nh => nh.name === nv.name);
  }).map(nv => {
    const nh = negHorasMerged.find(nh => nh.name === nv.name);
    return { name: nv.name, ytd: nv.ytd, ratio: nv.ytd > 0 ? parseFloat((nh.ytd / nv.ytd).toFixed(1)) : 0 };
  }).sort((a, b) => b.ratio - a.ratio);
  const ratioColors = cols(negCommon.length);
  charts.ratioChart = new Chart(document.getElementById("ratioChart"), {
    type: "bar",
    data: {
      labels: negCommon.map(c => c.name),
      datasets: [
        {
          type: "bar", label: "H / trabajo", data: negCommon.map(c => c.ratio),
          backgroundColor: ratioColors, borderRadius: 4, borderSkipped: false, yAxisID: "y", order: 1
        },
        {
          type: "line", label: "Proyectos", data: negCommon.map(c => c.ytd),
          borderColor: "rgba(255,222,0,.7)", backgroundColor: "rgba(255,222,0,.08)",
          pointBackgroundColor: "rgba(255,222,0,.9)", pointBorderColor: "#12152a", pointBorderWidth: 2,
          pointRadius: 5, tension: .35, fill: false, yAxisID: "y1", order: 0
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, position: "top", labels: { color: "#c2c5da", font: { family: "Montserrat", size: 11 }, boxWidth: 10, padding: 14 } },
        tooltip: { callbacks: { label: ctx => ctx.datasetIndex === 0
          ? " " + ctx.parsed.y.toFixed(1) + " h/trabajo"
          : " " + ctx.parsed.y.toLocaleString("es-ES") + " proyectos"
        }}
      },
      scales: {
        x: { ticks: { display: !isMobile(), color: "#c2c5da", font: { family: "Montserrat", size: 10 }, maxRotation: 35, minRotation: 25 }, grid: { display: false }, border: { display: false } },
        y: { position: "left", ticks: { color: "#9499c0", font: { family: "Montserrat", size: 10 } }, grid: { color: "rgba(255,255,255,.05)" }, border: { display: false } },
        y1: { position: "right", ticks: { color: "rgba(255,222,0,.6)", font: { family: "Montserrat", size: 10 } }, grid: { display: false }, border: { display: false } }
      }
    }
  });

  kill("radarChart");
  const radarCats = sorted(negVolMerged).slice(0, 6);
  const maxVol = Math.max(...radarCats.map(c => c.ytd));
  const radarHoras = radarCats.map(c => negHorasMerged.find(nh => nh.name === c.name) || { ytd: 0 });
  const maxHor = Math.max(...radarHoras.map(h => h.ytd), 1);
  charts.radarChart = new Chart(document.getElementById("radarChart"), {
    type: "radar",
    data: {
      labels: radarCats.map(c => c.name),
      datasets: [
        {
          label: "Volumen trabajos",
          data: radarCats.map(c => maxVol > 0 ? Math.round(c.ytd / maxVol * 100) : 0),
          borderColor: Y, backgroundColor: "rgba(255,222,0,.15)", pointBackgroundColor: Y, pointRadius: 4, borderWidth: 2
        },
        {
          label: "Horas",
          data: radarHoras.map(h => Math.round(h.ytd / maxHor * 100)),
          borderColor: "rgba(255,255,255,.7)", backgroundColor: "rgba(255,255,255,.07)",
          pointBackgroundColor: "rgba(255,255,255,.8)", pointRadius: 4, borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: "top", labels: { color: "#c2c5da", font: { family: "Montserrat", size: 11 }, boxWidth: 10, padding: 14 } },
        tooltip: { callbacks: { label: ctx => {
          if (ctx.datasetIndex === 0) return " " + radarCats[ctx.dataIndex].ytd.toLocaleString("es-ES") + " trabajos";
          return " " + Math.round(radarHoras[ctx.dataIndex].ytd).toLocaleString("es-ES") + " h";
        }}}
      },
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

  const er = wb.Sheets["Entrega"] ? XLSX.utils.sheet_to_json(wb.Sheets["Entrega"], { header: 1, defval: null }) : null;
  if (er) {
    const hIdx = er.findIndex(r => r && r.some(c => c && String(c).toLowerCase().includes("ene")));
    if (hIdx >= 0) {
      const h = er[hIdx];
      const ms = [];
      for (let c = 1; c < h.length; c++) {
        if (h[c] && !String(h[c]).toLowerCase().includes("total")) ms.push(String(h[c]));
      }
      const dataRows = er.slice(hIdx + 1).filter(r => r && r[0] &&
        !String(r[0]).toLowerCase().includes("total") &&
        !String(r[0]).toLowerCase().includes("media"));
      const vs = ms.map((_, i) => {
        const vals = dataRows.map(r => Number(r[i + 1]) || 0).filter(v => v > 0);
        return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      });
      const mediaRow = er.find(r => r && r[0] && String(r[0]).toLowerCase().includes("media"));
      const media = mediaRow ? (Number(mediaRow[1]) || 0) : (vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : 0);
      d.entrega = { months: ms, values: vs, mediaYTD: media };
    } else {
      d.entrega = { months: [], values: [], mediaYTD: 0 };
    }
  } else {
    d.entrega = { months: [], values: [], mediaYTD: 0 };
  }

  const rr = wb.Sheets["RRSS"] ? XLSX.utils.sheet_to_json(wb.Sheets["RRSS"], { header: 1, defval: null }) : null;
  if (rr) {
    const hIdx = rr.findIndex(row => row && row.some(c => c && String(c).toLowerCase().includes("ene")));
    if (hIdx >= 0) {
      const h = rr[hIdx], v = rr[hIdx + 1], hr = rr[hIdx + 2];
      const ms = [], vm = [], hm = [];
      let vY = 0, hY = 0;
      for (let c = 1; c < h.length; c++) {
        if (!h[c]) continue;
        if (String(h[c]).toLowerCase().includes("total")) {
          vY = Number(v[c]) || 0;
          hY = Number(hr ? hr[c] : 0) || 0;
        } else {
          ms.push(String(h[c]));
          vm.push(Number(v[c]) || 0);
          hm.push(Number(hr ? hr[c] : 0) || 0);
        }
      }
      d.rrss = { months: ms, volMon: vm, horMon: hm, volYTD: vY || vm.reduce((a, b) => a + b, 0), horYTD: hY || hm.reduce((a, b) => a + b, 0) };
    }
  }

  if (!d.tipologia) throw new Error("Estructura de Excel no reconocida. Asegúrate de que el archivo tiene la hoja 'Tipologia'.");
  return d;
}

async function fetchExcel() {
  try {
    const res25 = await fetch("datos2025.xlsx?t=" + Date.now());
    if (res25.ok) lastData2025 = parseExcel(await res25.arrayBuffer());
  } catch (e) { lastData2025 = null; }

  const errors = [];
  for (const name of ["datos.xlsx", "datos2.xlsx"]) {
    try {
      const res = await fetch(name + "?t=" + Date.now());
      if (!res.ok) { errors.push(`${name}: HTTP ${res.status}`); continue; }
      const buf = await res.arrayBuffer();
      lastData = parseExcel(buf);
      hideError();
      populateMonthFilter(lastData.tipologia.months);
      render(lastData, -1);
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

// ── Month filter change ────────────────────────────
document.getElementById("monthFilter").addEventListener("change", renderWithFilter);



// ── Tabla de datos ──────────────────────────────
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

// ── Exportar PNG ────────────────────────────────
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


// ── Export button ─────────────────────────────────
document.getElementById("exportBtn").addEventListener("click", exportDashboard);

// ── View data button ────────────────────────────
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

// ── Burger menu (móvil) ───────────────────────────────
const burgerBtn = document.getElementById("burgerBtn");
const burgerMenu = document.getElementById("burgerMenu");

burgerBtn.addEventListener("click", e => {
  e.stopPropagation();
  burgerMenu.classList.toggle("open");
});

document.addEventListener("click", () => burgerMenu.classList.remove("open"));
burgerMenu.addEventListener("click", e => e.stopPropagation());

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

// ── Modal negocio — cierre ────────────────────────────────────
document.getElementById("nmClose").addEventListener("click", () =>
  document.getElementById("negModal").classList.remove("open")
);
document.getElementById("negModal").addEventListener("click", e => {
  if (e.target === document.getElementById("negModal"))
    document.getElementById("negModal").classList.remove("open");
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") document.getElementById("negModal").classList.remove("open");
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