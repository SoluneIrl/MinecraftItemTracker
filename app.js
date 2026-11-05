const CSV_FILE = "data.csv", IMG_DIR = "Assets/Items/", KEY = "mc-site-v1";
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

let items = [], csvItems = [];
let st = { acq: {}, view: "table" };
try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
let filter = "all", query = "";
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
const has = i => Object.prototype.hasOwnProperty.call(st.acq, i.name) ? st.acq[i.name] : i.acquired;

const nameFromImage = f => f.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().replace(/(^|\s)(\S)/g, (m, sp, c) => sp + c.toUpperCase());
const titleFromImage = f => f.replace(/\.[^.]+$/, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim().replace(/^./, c => c.toUpperCase());

function splitCSV(text) {
    const rows = [];
    let row = [], cell = "", q = false;
    for (let k = 0; k < text.length; k++) {
        const ch = text[k];
        if (q) {
            if (ch === '"') { if (text[k + 1] === '"') { cell += '"'; k++; } else q = false; }
            else cell += ch;
        } else if (ch === '"') q = true;
        else if (ch === ",") { row.push(cell); cell = ""; }
        else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && text[k + 1] === "\n") k++;
            row.push(cell); cell = "";
            if (row.some(c => c.trim())) rows.push(row);
            row = [];
        } else cell += ch;
    }
    row.push(cell);
    if (row.some(c => c.trim())) rows.push(row);
    return rows;
}

function parseCSV(text) {
    const lines = splitCSV(text.replace(/^\uFEFF/, ""));
    if (!lines.length) return [];
    const head = lines.shift().map(h => h.trim().toLowerCase());
    return lines.map(c => {
        const r = {};
        head.forEach((h, i) => r[h] = (c[i] || "").trim());
        r.name = r.name || nameFromImage(r.image || "");
        r.title = titleFromImage(r.image || "") || r.name;
        r.number = Number(r.number) || 0;
        r.acquired = ["yes", "y", "true", "1"].includes(r.acquired.toLowerCase());
        return r;
    });
}
const csvCell = v => /[",\n\r]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);

const syncMeta = () => {
    const c = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    if (c) $("#themeColor").content = c;
};

let toastTimer;
function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3800);
}

const TIERS = [null, "Iron", "Gold", "Diamond", "Emerald"];
const tierOf = (got, total) => !total ? 0 : got === total ? 4 : Math.min(3, Math.floor(got * 4 / total));
let tier = null, quiet = false, tierTimer = 0;

function setTier(t) {
    const root = document.documentElement;
    const animate = tier !== null && !reduceMotion();
    if (animate) {
        root.classList.add("tiering");
        clearTimeout(tierTimer);
        tierTimer = setTimeout(() => { root.classList.remove("tiering"); syncMeta(); }, 900);
    }
    if (t) root.dataset.tier = t; else delete root.dataset.tier;
    st.tier = t; save();
    if (!animate) syncMeta();
}

function burst(n, p) {
    if (reduceMotion()) return;
    const bar = $(".bar").getBoundingClientRect();
    let x = bar.left + bar.width * p, y = bar.top + bar.height / 2;
    if (bar.bottom < 0 || bar.top > innerHeight) { x = innerWidth / 2; y = innerHeight * 0.3; }
    const layer = document.createElement("div");
    layer.className = "burst";
    const vars = ["--wood", "--caramel", "--wood-d", "--caramel"];
    for (let k = 0; k < n; k++) {
        const el = document.createElement("i"), s = 5 + Math.random() * 6;
        el.style.cssText = `left:${x}px;top:${y}px;width:${s}px;height:${s}px;--c:var(${vars[k % 4]})`;
        const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * (n > 40 ? 230 : 150);
        el.animate([
            { transform: "translate(0,0) rotate(0deg) scale(1)", opacity: 1 },
            { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d + 90}px) rotate(${Math.random() * 540 - 270}deg) scale(.6)`, opacity: 0 }
        ], { duration: 900 + Math.random() * 600, easing: "cubic-bezier(.15,.7,.3,1)", fill: "forwards" });
        layer.appendChild(el);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 1700);
}

function celebrate(t, p) {
    toast(t === 4 ? `100% · Collection complete! ${TIERS[t]} theme unlocked` : `${t * 25}% reached · ${TIERS[t]} theme unlocked`);
    const xp = $(".xp");
    xp.classList.remove("milestone"); void xp.offsetWidth; xp.classList.add("milestone");
    setTimeout(() => xp.classList.remove("milestone"), 1000);
    burst(t === 4 ? 70 : 32, p);
}

function visible() {
    return items.filter(i => {
        if (filter === "got" && !has(i)) return false;
        if (filter === "missing" && has(i)) return false;
        return i.lc.includes(query);
    });
}

let listView = [];
const src = i => IMG_DIR + encodeURIComponent(i.image);
const img = i => `<div class="slot" data-i="${i.idx}">${i.image
    ? `<img src="${esc(src(i))}" alt="" decoding="async" width="40" height="40" onerror="this.style.opacity=0">`
    : `<span class="ph">${esc((i.title[0] || "?").toUpperCase())}</span>`}</div>`;

function merge() {
    items = csvItems.slice().sort((a, b) => a.number - b.number);
    items.forEach((i, n) => { i.idx = n; i.lc = i.title.toLowerCase(); });
}

const cardHTML = (i, n, late) => `
      <div class="cell${late ? " late" : ""}" style="--i:${n}"><button class="card ${has(i) ? "got" : "miss"}" data-name="${esc(i.name)}" aria-pressed="${has(i)}" aria-label="${esc(i.title)}, ${has(i) ? "acquired" : "not acquired"}">
        <span class="num">#${i.number}</span>
        <span class="stage">${img(i)}</span>
        <b class="cn">${esc(i.title)}</b>
        <span class="tag">${has(i) ? "Acquired" : "Missing"}</span>
      </button></div>`;
const rowHTML = (i, n, late) => `<tr class="${has(i) ? "got" : "miss"}${late ? " late" : ""}" data-name="${esc(i.name)}" style="--i:${n}">
        <td class="n">${i.number}</td><td>${img(i)}</td>
        <td class="nm"><span class="nmt">${esc(i.title)}</span></td>
        <td class="ac"><button class="sw" role="switch" aria-checked="${has(i)}" data-name="${esc(i.name)}" aria-label="Acquired: ${esc(i.title)}"><span class="knob"></span><span class="lbl">${has(i) ? "Yes" : "No"}</span></button></td>
      </tr>`;

const BUF = 6;
let host = null, topSp = null, botSp = null;
let nodes = [], cs = 0, ce = 0;
let cols = 1, pitch = 88, totalRows = 0;

const cssNum = n => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) || 0;

function measure() {
    if (st.view === "grid") {
        const cstyle = getComputedStyle(host), t = cstyle.gridTemplateColumns;
        cols = t && t !== "none" ? t.split(" ").filter(Boolean).length : 1;
        pitch = cssNum("--ch") + (parseFloat(cstyle.rowGap) || 0);
    } else {
        cols = 1;
        pitch = cssNum("--rh");
    }
    totalRows = Math.ceil(listView.length / cols);
}

function build(from, to, late) {
    const fn = st.view === "grid" ? cardHTML : rowHTML;
    let html = "";
    for (let k = from; k < to; k++) html += fn(listView[k], k, late);
    const t = document.createElement("template");
    t.innerHTML = html;
    return [...t.content.children];
}

function sync(ns, ne, late) {
    const mark = st.view === "grid" ? null : botSp;
    if (!nodes.length || ns >= ce || ne <= cs) {
        nodes.forEach(e => e.remove());
        nodes = []; cs = ce = ns;
    } else {
        while (cs < ns) { nodes.shift().remove(); cs++; }
        while (ce > ne) { nodes.pop().remove(); ce--; }
    }
    if (ns < cs) {
        const els = build(ns, cs, late), f = document.createDocumentFragment();
        els.forEach(e => f.appendChild(e));
        host.insertBefore(f, nodes[0] || mark);
        nodes = els.concat(nodes); cs = ns;
    }
    if (ne > ce) {
        const els = build(ce, ne, late), f = document.createDocumentFragment();
        els.forEach(e => f.appendChild(e));
        host.insertBefore(f, mark);
        nodes = nodes.concat(els); ce = ne;
    }
}

function update(force, late = true) {
    if (!host) return;
    const n = listView.length;
    const rel = -host.getBoundingClientRect().top;
    const first = Math.min(Math.max(0, Math.floor(rel / pitch)), Math.max(0, totalRows - 1));
    const needS = first, needE = Math.min(totalRows, first + Math.ceil(innerHeight / pitch) + 1);
    if (!force && needS >= Math.floor(cs / cols) && needE <= Math.ceil(ce / cols)) return;
    const rs = Math.max(0, needS - BUF), re = Math.min(totalRows, needE + BUF);
    sync(rs * cols, Math.min(n, re * cols), late);
    const top = rs * pitch + "px", bot = (totalRows - re) * pitch + "px";
    if (st.view === "grid") { host.style.paddingTop = top; host.style.paddingBottom = bot; }
    else { topSp.style.height = top; botSp.style.height = bot; }
}

function renderList(anim = false) {
    listView = visible();
    const el = $("#list");
    el.style.minHeight = el.offsetHeight + "px";
    el.classList.toggle("enter", anim);
    $("#empty").hidden = listView.length > 0;
    nodes = []; cs = ce = 0;
    const grid = st.view === "grid";
    const sp = '<tr class="sp"><td colspan="4"></td></tr>';
    el.innerHTML = grid
        ? '<div class="grid"></div>'
        : `<div class="tablewrap"><table><thead><tr><th>#</th><th>Item</th><th>Name</th><th class="ac">Acquired</th></tr></thead><tbody>${sp}${sp}</tbody></table></div>`;
    host = grid ? el.firstElementChild : el.querySelector("tbody");
    if (!grid) { topSp = host.children[0]; botSp = host.children[1]; }
    measure();
    update(true, false);
    el.style.minHeight = "";
}

let ticking = false;
const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(false); });
};
let resizeRaf = 0;
addEventListener("resize", () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => { if (host) { measure(); update(true); } });
});

const VT_MAX = 48;
function nameVisible() {
    let n = 0;
    const h = innerHeight;
    document.querySelectorAll("#list .slot").forEach(s => {
        const r = s.getBoundingClientRect();
        s.style.viewTransitionName = (r.bottom > 0 && r.top < h && n++ < VT_MAX) ? "s" + s.dataset.i : "";
    });
}
function morph(fn) {
    if (!document.startViewTransition || reduceMotion()) return fn();
    nameVisible();
    const vt = document.startViewTransition(() => { fn(); nameVisible(); });
    vt.finished.finally(() => document.querySelectorAll("#list .slot").forEach(s => s.style.viewTransitionName = ""));
    return vt;
}
function place(seg) {
    const b = seg.querySelector('[aria-pressed="true"]');
    if (!b) return;
    seg.style.setProperty("--x", b.offsetLeft + "px");
    seg.style.setProperty("--w", b.offsetWidth + "px");
    if (!seg.classList.contains("ready")) requestAnimationFrame(() => seg.classList.add("ready"));
}
const placeAll = () => { place($("#filters")); place($("#views")); };
window.addEventListener("resize", placeAll);
if (document.fonts) document.fonts.ready.then(placeAll);

let shown = 0, tween = 0;
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function setProgress(got, total) {
    $("#fill").style.setProperty("--p", total ? got / total : 0);
    const from = shown, t0 = performance.now();
    cancelAnimationFrame(tween);
    const step = now => {
        const k = reduceMotion() ? 1 : Math.min(1, (now - t0) / 650), e = 1 - Math.pow(1 - k, 3);
        const g = Math.round(from + (got - from) * e);
        $("#xpText").textContent = total && g === total ? "Collection complete!" : `${g} of ${total} items acquired`;
        $("#xpPct").textContent = +(total ? g / total * 100 : 0).toFixed(1) + "%";           $(".xp").classList.toggle("done", !!total && g === total);
        shown = g;
        if (k < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
}

function renderStats() {
    const got = items.filter(has).length, total = items.length, pct = total ? Math.round(got / total * 100) : 0;
    setProgress(got, total);
    const t = tierOf(got, total);
    if (t !== tier) {
        const up = tier !== null && t > tier;
        setTier(t); tier = t;
        if (up && !quiet) celebrate(t, got / total);
    }
    const counts = { all: total, got, missing: total - got };
    const box = $("#filters");
    if (!box.children.length) box.innerHTML = [["all", "All"], ["got", "Acquired"], ["missing", "Missing"]].map(([k, l]) =>
        `<button data-filter="${k}"><span>${l}</span><small></small></button>`).join("");
    box.querySelectorAll("button").forEach(b => {
        b.querySelector("small").textContent = counts[b.dataset.filter];
        b.setAttribute("aria-pressed", b.dataset.filter === filter);
    });
    document.querySelectorAll("#views button").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === st.view));
    placeAll();
}

const render = (anim = false) => { renderStats(); renderList(anim); };

function toggleItem(name) {
    const it = items.find(i => i.name === name);
    if (!it) return;
    const on = !has(it);
    st.acq[name] = on; save();
    const q = `#list [data-name="${CSS.escape(name)}"]`, els = document.querySelectorAll(q);
    const holder = els[0] && els[0].closest("tr, .cell");
    renderStats();
    if (filter !== "all") {
        morph(() => renderList());
        return;
    }
    els.forEach(el => {
        const row = el.closest("tr") || el;
        row.classList.toggle("got", on); row.classList.toggle("miss", !on);
        if (el.classList.contains("sw")) { el.setAttribute("aria-checked", on); el.querySelector(".lbl").textContent = on ? "Yes" : "No"; }
        if (el.classList.contains("card")) {
            el.setAttribute("aria-pressed", on);
            el.setAttribute("aria-label", `${it.title}, ${on ? "acquired" : "not acquired"}`);
            el.querySelector(".tag").textContent = on ? "Acquired" : "Missing";
        }
    });
    const slot = holder && holder.querySelector(".slot");
    if (on && slot) {
        slot.classList.remove("pop"); void slot.offsetWidth; slot.classList.add("pop");
        slot.addEventListener("animationend", () => slot.classList.remove("pop"), { once: true });
    }
}

$("#list").addEventListener("click", e => {
    const b = e.target.closest("[data-name]");
    if (b) toggleItem(b.dataset.name);
});
$("#filters").addEventListener("click", e => { const b = e.target.closest("[data-filter]"); if (b) { morph(() => { filter = b.dataset.filter; jumpTop(); render(); }); } });
$("#views").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) { morph(() => { st.view = b.dataset.view; save(); render(); }); } });
const jumpTop = () => {
    const top = $("#list").getBoundingClientRect().top + scrollY - $(".toolbar").offsetHeight;
    if (scrollY > top) scrollTo(0, Math.max(0, top));
};
let searchTimer;
$("#q").addEventListener("input", e => {
    const v = e.target.value.trim().toLowerCase();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { query = v; jumpTop(); renderList(); }, 120);
});
$("#q").addEventListener("keydown", e => {
    if (e.key === "Escape") { clearTimeout(searchTimer); e.target.value = ""; query = ""; jumpTop(); renderList(); e.target.blur(); }
    if (e.key === "Enter") e.target.blur();
});
$("#reset").onclick = () => {
    if (!confirm("Reset all progress? Export a backup first if you want to keep it.")) return;
    st.acq = {}; save(); merge(); render(true);
};
const download = (href, name) => { const a = document.createElement("a"); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(href), 4000); };
$("#export").onclick = async () => {
    const derived = items.every(i => i.image && nameFromImage(i.image) === i.name);
    const rows = [derived ? "number,image,acquired" : "number,image,name,acquired"].concat(items.map(i =>
        (derived ? [i.number, i.image, has(i) ? "yes" : "no"] : [i.number, i.image, i.name, has(i) ? "yes" : "no"]).map(csvCell).join(",")));
    const blob = new Blob([rows.join("\n") + "\n"], { type: "text/csv" });
    try {
        const file = new File([blob], "data.csv", { type: "text/csv" });
        if (matchMedia("(pointer:coarse)").matches && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: "Minecraft Item Tracker progress" });
            return;
        }
    } catch (e) {
        if (e && e.name === "AbortError") return;
    }
    download(URL.createObjectURL(blob), "data.csv");
};
document.addEventListener("keydown", e => {
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && document.activeElement !== $("#q")) { e.preventDefault(); $("#q").focus(); }
});

const fileInput = $("#importFile");
$("#import").onclick = () => fileInput.click();
fileInput.onchange = async () => {
    const f = fileInput.files[0];
    fileInput.value = "";
    if (!f) return;
    try {
        const rows = parseCSV(await f.text());
        const byImg = new Map(items.map(i => [(i.image || "").toLowerCase(), i]));
        const byName = new Map(items.map(i => [i.name.toLowerCase(), i]));
        let hit = 0, miss = 0;
        for (const r of rows) {
            const it = byImg.get((r.image || "").toLowerCase()) || byName.get(r.name.toLowerCase());
            if (it) { st.acq[it.name] = r.acquired; hit++; } else miss++;
        }
        if (!hit) throw 0;
        save();
        quiet = true; render(); quiet = false;
        toast(`Imported ${hit.toLocaleString()} items` + (miss ? ` (${miss.toLocaleString()} not found)` : ""));
    } catch (e) {
        toast("That file doesn't look like a progress CSV");
    }
};

if (matchMedia("(hover:hover) and (pointer:fine)").matches) $("#q").placeholder = "Search items  ( press / )";

const toTop = $("#toTop");
addEventListener("scroll", () => {
    const on = scrollY >= 700 && scrollY < document.documentElement.scrollHeight - innerHeight - 120;
    toTop.classList.toggle("show", on);
    toTop.tabIndex = on ? 0 : -1;
}, { passive: true });
addEventListener("scroll", onScroll, { passive: true });
toTop.onclick = () => scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });

const bar = $(".toolbar"), narrow = matchMedia("(max-width:600px)");
let lastY = scrollY;
addEventListener("scroll", () => {
    const y = scrollY, d = y - lastY;
    if (y <= 0) { bar.classList.remove("away"); lastY = 0; return; }
    if (Math.abs(d) < 8) return;
    const atEnd = y >= document.documentElement.scrollHeight - innerHeight - 2;
    if (!atEnd) bar.classList.toggle("away", narrow.matches && d > 0 && y > 200 && document.activeElement !== $("#q"));
    lastY = y;
}, { passive: true });
addEventListener("touchmove", () => { if (document.activeElement === $("#q")) $("#q").blur(); }, { passive: true });
const saveScroll = () => { st.scroll = Math.round(scrollY); save(); };
addEventListener("pagehide", saveScroll);
document.addEventListener("visibilitychange", () => { if (document.hidden) saveScroll(); });

const scrub = $("#scrub"), thumb = $("#thumb"), tip = $("#tip"), THUMB_H = 56;
let scrubHide = 0, scrubRaf = 0, dragging = false, grab = 0;
const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
const range = () => Math.max(1, scrub.clientHeight - THUMB_H);

function placeThumb() {
    scrubRaf = 0;
    const ratio = Math.min(1, Math.max(0, scrollY / maxScroll())), y = ratio * range();
    thumb.style.transform = `translateY(${y}px)`;
    tip.style.top = y + "px";
    if (!dragging || !listView.length || !host) return;
    let idx = listView.length - 1;
    if (ratio < 0.995) {
        const rel = Math.max(0, -host.getBoundingClientRect().top + 60);
        idx = Math.min(listView.length - 1, Math.floor(rel / pitch) * cols);
    }
    const it = listView[idx];
    if (it) tip.innerHTML = `<b>${esc(it.title)}</b><small>#${it.number}</small>`;
}

function wake() {
    if (document.documentElement.scrollHeight < innerHeight * 2.5) return;
    scrub.classList.add("show");
    clearTimeout(scrubHide);
    if (!dragging) scrubHide = setTimeout(() => scrub.classList.remove("show"), 1500);
}

addEventListener("scroll", () => { wake(); if (!scrubRaf) scrubRaf = requestAnimationFrame(placeThumb); }, { passive: true });
addEventListener("resize", placeThumb);
thumb.addEventListener("pointerdown", e => {
    dragging = true;
    grab = e.clientY - thumb.getBoundingClientRect().top;
    thumb.setPointerCapture(e.pointerId);
    scrub.classList.add("drag", "show");
    clearTimeout(scrubHide);
    placeThumb();
    e.preventDefault();
});
thumb.addEventListener("pointermove", e => {
    if (!dragging) return;
    const r = (e.clientY - grab - scrub.getBoundingClientRect().top) / range();
    scrollTo(0, Math.min(1, Math.max(0, r)) * maxScroll());
});
const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    scrub.classList.remove("drag");
    wake();
};
thumb.addEventListener("pointerup", endDrag);
thumb.addEventListener("pointercancel", endDrag);

if ("serviceWorker" in navigator) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

syncMeta();
fetch(CSV_FILE)
    .then(r => { if (!r.ok) throw 0; return r.text(); })
    .then(t => { csvItems = parseCSV(t); }, () => { throw 0; })
    .then(() => {
        merge(); render(true);
        if (st.scroll > 0) { scrollTo(0, st.scroll); lastY = scrollY; }
    })
    .catch(() => {
        $("#list").innerHTML = "";
        $("#error").innerHTML = '<div class="err">Could not load data.csv. Browsers block this when the page is opened by double-clicking. Run <b>python -m http.server</b> in this folder and open <b>http://localhost:8000</b>.</div>';
    });