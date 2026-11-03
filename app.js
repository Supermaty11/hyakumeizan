const REGIONS = ["すべて", "北海道", "東北", "関東", "中部", "近畿", "中国", "四国", "九州"];
const ELEVATIONS = [
  { label: "指定なし", min: 0, max: 4000 },
  { label: "1500m未満", min: 0, max: 1499 },
  { label: "1500–2499m", min: 1500, max: 2499 },
  { label: "2500–2999m", min: 2500, max: 2999 },
  { label: "3000m以上", min: 3000, max: 4000 },
];
const DAY_OPTIONS = ["指定なし", "日帰り", "1泊まで", "2泊まで"];
const LEVEL_OPTIONS = ["指定なし", "初心者向け", "中級者向け", "上級者向け"];
const ACCESS_OPTIONS = [
  { id: "指定なし", label: "指定なし" },
  { id: "電車・バス可", label: "電車・バス可" },
  { id: "記載なし", label: "電車・バスの記載なし" },
];
const KEY = "hyakumeizan-records-v1";
const LAYOUT_KEY = "hyakumeizan-layout-v1";
const PHOTO_DB_NAME = "hyakumeizan-photos-v1";
const PHOTO_STORE = "photos";
const PHOTO_MAX = 5;
const PHOTO_MAX_EDGE = 1600;
const PHOTO = "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg";
const PALE = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png";

const state = {
  mountains: [],
  records: loadRecords(),
  filters: {
    query: "",
    regions: [],
    status: "すべて",
    elevMin: 0,
    elevMax: 4000,
    days: "指定なし",
    access: "指定なし",
    level: "指定なし",
  },
  selectedId: null,
  focusZoom: null,
  tab: "record",
  mobilePane: "map",
};

let map;
let photoLayer;
let paleLayer;
let mapMode = "photo";
let pins;
const layout = loadLayout();

function isNarrow() {
  return window.innerWidth < 980;
}

function defaultResultsH() {
  return isNarrow() ? 148 : 252;
}

function loadLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "{}");
    return {
      resultsH: Number(saved.resultsH) || defaultResultsH(),
      detailW: Number(saved.detailW) || 320,
      detailH: Number(saved.detailH) || 0,
    };
  } catch {
    return { resultsH: defaultResultsH(), detailW: 320, detailH: 0 };
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function layoutLimits() {
  const height = window.innerHeight;
  const width = window.innerWidth;
  const narrow = isNarrow();
  return {
    resultsMin: narrow ? 88 : 140,
    resultsMax: Math.max(narrow ? 100 : 160, Math.round(height * (narrow ? 0.4 : 0.55))),
    detailWMin: 260,
    detailWMax: Math.max(280, width - 80),
    detailHMin: 200,
    detailHMax: Math.max(220, height - layout.resultsH - 36),
  };
}

function mapPadding() {
  if (!isNarrow()) {
    return { paddingTopLeft: [430, 28], paddingBottomRight: [40, 28] };
  }
  const header = 72;
  if (state.mobilePane === "list" || state.mobilePane === "detail") {
    return { paddingTopLeft: [16, header], paddingBottomRight: [16, Math.round(window.innerHeight * 0.4) + 16] };
  }
  return { paddingTopLeft: [16, header], paddingBottomRight: [16, 16] };
}

function fitJapan() {
  if (!map) return;
  map.invalidateSize();
  map.fitBounds(
    [
      [30.2, 129.2],
      [45.5, 145.5],
    ],
    mapPadding(),
  );
}

function refreshMap() {
  if (map) map.invalidateSize();
}

function applyLayout() {
  const limits = layoutLimits();
  layout.resultsH = clamp(layout.resultsH, limits.resultsMin, limits.resultsMax);
  layout.detailW = clamp(layout.detailW, limits.detailWMin, limits.detailWMax);
  if (!layout.detailH) layout.detailH = Math.min(560, limits.detailHMax);
  layout.detailH = clamp(layout.detailH, limits.detailHMin, limits.detailHMax);
  const root = document.documentElement;
  root.style.setProperty("--results-h", `${layout.resultsH}px`);
  root.style.setProperty("--detail-w", `${layout.detailW}px`);
  root.style.setProperty("--detail-h", `${layout.detailH}px`);
  if (map) map.invalidateSize();
}

function saveLayout() {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}

function bindResize(element, onMove) {
  if (!element) return;
  element.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    document.body.classList.add("is-resizing");
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = { resultsH: layout.resultsH, detailW: layout.detailW, detailH: layout.detailH };
    const move = (next) => {
      onMove(next, origin, startX, startY);
      applyLayout();
    };
    const stop = () => {
      document.body.classList.remove("is-resizing");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      saveLayout();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  });
}

function setupLayout() {
  applyLayout();
  bindResize(document.getElementById("results-resize"), (event, origin, startX, startY) => {
    layout.resultsH = origin.resultsH - (event.clientY - startY);
  });
  bindResize(document.getElementById("detail-resize"), (event, origin, startX, startY) => {
    layout.detailW = origin.detailW - (event.clientX - startX);
    layout.detailH = origin.detailH + (event.clientY - startY);
  });
  window.addEventListener("resize", applyLayout);
}

function loadRecords() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function saveRecords() {
  localStorage.setItem(KEY, JSON.stringify(state.records));
}

function titleOf(name) {
  const angle = name.match(/^(.*?)<(.+)>$/);
  const paren = name.match(/^(.*?)（(.+)）$/);
  if (angle) return { title: angle[1], sub: angle[2] };
  if (paren) return { title: paren[1], sub: paren[2] };
  return { title: name, sub: "" };
}

function dayLabel(days) {
  if (days <= 1) return "日帰り";
  return `${days - 1}泊${days}日`;
}

function norm(value) {
  return value
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .toLowerCase();
}

function recordOf(id) {
  const records = state.records;
  return records[id] || records[String(id)] || { climbed: false, date: "", memo: "" };
}

function isClimbed(id) {
  const climbed = recordOf(id).climbed;
  return climbed === true || climbed === "true" || climbed === 1;
}

const photoCache = new Map();
let photoPreview = { mountainId: null, photoId: null };
let photoDbPromise = null;

function openPhotoDb() {
  if (photoDbPromise) return photoDbPromise;
  photoDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
        store.createIndex("mountainId", "mountainId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return photoDbPromise;
}

function photoRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function listPhotoRecords(mountainId) {
  const db = await openPhotoDb();
  const tx = db.transaction(PHOTO_STORE, "readonly");
  const index = tx.objectStore(PHOTO_STORE).index("mountainId");
  const rows = await photoRequest(index.getAll(String(mountainId)));
  return (rows || []).sort((a, b) => a.created - b.created);
}

function revokePhotoCache(mountainId) {
  const cached = photoCache.get(String(mountainId));
  if (!cached) return;
  cached.items.forEach((item) => URL.revokeObjectURL(item.url));
}

function setPhotoCache(mountainId, records) {
  revokePhotoCache(mountainId);
  const items = records.map((row) => ({
    id: row.id,
    url: URL.createObjectURL(row.blob),
  }));
  photoCache.set(String(mountainId), { items, status: "ready" });
  return items;
}

function ensurePhotos(mountainId) {
  const key = String(mountainId);
  const cached = photoCache.get(key);
  if (cached) return cached;
  const pending = { items: [], status: "loading" };
  photoCache.set(key, pending);
  listPhotoRecords(key)
    .then((rows) => {
      setPhotoCache(key, rows);
      if (String(state.selectedId) === key) fillPhotos(key);
    })
    .catch(() => {
      photoCache.set(key, { items: [], status: "error" });
      if (String(state.selectedId) === key) fillPhotos(key);
    });
  return pending;
}

async function resizePhoto(file) {
  let source = file;
  try {
    source = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0, width, height);
  if (source.close) source.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  return blob || file;
}

async function addPhotos(mountainId, files) {
  const key = String(mountainId);
  const existing = await listPhotoRecords(key);
  const room = PHOTO_MAX - existing.length;
  const picked = [...files].filter((file) => file.type.startsWith("image/")).slice(0, room);
  if (!picked.length) return;
  const rows = [];
  for (const file of picked) {
    rows.push({
      id: crypto.randomUUID(),
      mountainId: key,
      blob: await resizePhoto(file),
      created: Date.now(),
    });
  }
  const db = await openPhotoDb();
  const tx = db.transaction(PHOTO_STORE, "readwrite");
  const store = tx.objectStore(PHOTO_STORE);
  rows.forEach((row) => store.put(row));
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  setPhotoCache(key, await listPhotoRecords(key));
}

async function removePhoto(mountainId, photoId) {
  const key = String(mountainId);
  const db = await openPhotoDb();
  const tx = db.transaction(PHOTO_STORE, "readwrite");
  tx.objectStore(PHOTO_STORE).delete(photoId);
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  if (photoPreview.photoId === photoId) photoPreview.photoId = null;
  setPhotoCache(key, await listPhotoRecords(key));
}

function representativeRoute(mountain) {
  const routes = mountain.routes || [];
  if (!routes.length || mountain.days == null) return null;
  const same = routes.filter((route) => route.stays === mountain.days);
  const pool = same.length ? same : routes;
  return pool.reduce((best, route) => {
    const up = route.up || 0;
    const seconds = route.seconds || 0;
    if (up < (best.up || 0)) return route;
    if (up === (best.up || 0) && seconds < (best.seconds || 0)) return route;
    return best;
  });
}

function levelOf(mountain) {
  const route = representativeRoute(mountain);
  if (!route) return null;
  const hours = (route.seconds || 0) / 3600;
  const up = route.up || 0;
  if (route.stays >= 3 || hours >= 10 || up >= 1600) return "上級者向け";
  if (route.stays === 1 && hours <= 5 && up < 800) return "初心者向け";
  return "中級者向け";
}

function levelShort(mountain) {
  const level = levelOf(mountain);
  if (level === "初心者向け") return "初心者";
  if (level === "中級者向け") return "中級";
  if (level === "上級者向け") return "上級";
  return "未取得";
}

function matches(mountain, filters) {
  if (filters.regions.length && !filters.regions.includes(mountain.region)) return false;
  if (filters.level !== "指定なし" && levelOf(mountain) !== filters.level) return false;
  if (filters.status === "登頂済み" && !isClimbed(mountain.id)) return false;
  if (filters.status === "未踏" && isClimbed(mountain.id)) return false;
  if (mountain.elev < filters.elevMin || mountain.elev > filters.elevMax) return false;
  if (filters.days !== "指定なし") {
    if (mountain.days == null) return false;
    if (filters.days === "日帰り" && mountain.days !== 1) return false;
    if (filters.days === "1泊まで" && mountain.days > 2) return false;
    if (filters.days === "2泊まで" && mountain.days > 3) return false;
  }
  if (filters.access === "電車・バス可" && mountain.transit !== true) return false;
  if (filters.access === "記載なし" && mountain.transit !== false) return false;
  const query = norm(filters.query.trim());
  if (!query) return true;
  const { title, sub } = titleOf(mountain.name);
  const routeNames = (mountain.routes || []).map((route) => route.name).join(" ");
  const blob = norm([title, sub, mountain.kana, mountain.area, mountain.region, routeNames, ...mountain.prefs].join(" "));
  return blob.includes(query);
}

function visibleMountains() {
  return state.mountains.filter((mountain) => matches(mountain, state.filters));
}

function hiddenForMissing() {
  const filters = state.filters;
  if (filters.days === "指定なし" && filters.access === "指定なし") return 0;
  const relaxed = { ...filters, days: "指定なし", access: "指定なし" };
  return state.mountains.filter((mountain) => {
    if (!matches(mountain, relaxed)) return false;
    const missingDays = filters.days !== "指定なし" && mountain.days == null;
    const missingAccess = filters.access !== "指定なし" && mountain.transit == null;
    return missingDays || missingAccess;
  }).length;
}

function timeLabel(seconds) {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (!minutes) return `${hours}時間`;
  return `${hours}時間${minutes}分`;
}

function routeFacts(route) {
  const bits = [dayLabel(route.stays)];
  const time = timeLabel(route.seconds);
  if (time) bits.push(time);
  if (route.meters) bits.push(`${(route.meters / 1000).toFixed(1)}km`);
  if (route.up) bits.push(`上り${route.up.toLocaleString("ja-JP")}m`);
  return bits.join(" · ");
}

function searchFilters() {
  return { ...state.filters, status: "すべて" };
}

function textMatch(mountain) {
  const filters = {
    ...state.filters,
    regions: [],
    status: "すべて",
    elevMin: 0,
    elevMax: 4000,
    days: "指定なし",
    access: "指定なし",
    level: "指定なし",
  };
  return matches(mountain, filters);
}

function recordMountains() {
  return state.mountains.filter((mountain) => {
    if (state.filters.regions.length && !state.filters.regions.includes(mountain.region)) return false;
    const climbed = isClimbed(mountain.id);
    if (state.filters.status === "登頂済み" && !climbed) return false;
    if (state.filters.status === "未踏" && climbed) return false;
    return textMatch(mountain);
  });
}

function searchDisplay() {
  const filters = searchFilters();
  const strict = state.mountains.filter((mountain) => matches(mountain, filters));
  if (strict.length) return { mountains: strict, note: "" };
  const relaxations = [
    { patch: { access: "指定なし" }, label: "交通", active: filters.access !== "指定なし" },
    { patch: { days: "指定なし" }, label: "日数", active: filters.days !== "指定なし" },
    {
      patch: { elevMin: 0, elevMax: 4000 },
      label: "標高",
      active: filters.elevMin !== 0 || filters.elevMax !== 4000,
    },
    { patch: { regions: [] }, label: "地方", active: filters.regions.length > 0 },
    { patch: { level: "指定なし" }, label: "難易度", active: filters.level !== "指定なし" },
    { patch: { query: "" }, label: "キーワード", active: filters.query.trim() !== "" },
  ].filter((step) => step.active);
  let best = null;
  relaxations.forEach((step) => {
    const mountains = state.mountains.filter((mountain) => matches(mountain, { ...filters, ...step.patch }));
    if (!mountains.length) return;
    if (!best || mountains.length < best.mountains.length) best = { mountains, label: step.label };
  });
  if (!best) return { mountains: [], note: "条件に合う山がありません。条件を外してみてください。" };
  return {
    mountains: best.mountains,
    note: `この条件では 0 座です。${best.label}だけ外すと ${best.mountains.length} 座あります。`,
  };
}

function displayedMountains() {
  if (state.tab === "search") return searchDisplay().mountains;
  return recordMountains();
}

function yamapUrl(mountain) {
  const { title } = titleOf(mountain.name);
  if (mountain.yamapId) return `https://yamap.com/mountains/${mountain.yamapId}`;
  return `https://yamap.com/search/mountains?keyword=${encodeURIComponent(title)}`;
}

function buttonRow(parent, items, isOn, onClick) {
  const wrap = document.createElement("div");
  wrap.className = "choices";
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label;
    if (isOn(item)) button.classList.add("is-on");
    button.addEventListener("click", () => onClick(item));
    wrap.append(button);
  });
  parent.append(wrap);
  return wrap;
}

function fieldset(legend, node) {
  const box = document.createElement("fieldset");
  const title = document.createElement("legend");
  title.textContent = legend;
  box.append(title, node);
  return box;
}

function renderHeader() {
  const header = document.createElement("header");
  const row = document.createElement("div");
  row.className = "title-row";
  const h1 = document.createElement("h1");
  h1.textContent = "百名山";
  const tabs = document.createElement("div");
  tabs.className = "tabs";
  [
    ["record", "記録"],
    ["search", "検索"],
  ].forEach(([id, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (state.tab === id) button.classList.add("is-on");
    button.addEventListener("click", () => {
      if (state.tab === id) return;
      state.tab = id;
      state.selectedId = null;
      if (isNarrow()) state.mobilePane = "list";
      render();
      requestAnimationFrame(refreshMap);
    });
    tabs.append(button);
  });
  if (isNarrow()) {
    const mapToggle = document.createElement("button");
    mapToggle.type = "button";
    mapToggle.className = "map-toggle";
    mapToggle.textContent = state.mobilePane === "map" ? "一覧" : "地図";
    mapToggle.addEventListener("click", () => {
      state.mobilePane = state.mobilePane === "map" ? "list" : "map";
      render();
      requestAnimationFrame(refreshMap);
    });
    row.append(h1, tabs, mapToggle);
  } else {
    row.append(h1, tabs);
  }
  header.append(row);
  if (!isNarrow()) {
    const lede = document.createElement("p");
    lede.textContent = "登った山の記録と、次に登る山の検索です。";
    header.append(lede);
    if (state.tab === "record") header.append(renderCount());
  }
  return header;
}

function renderCount() {
  const wrap = document.createElement("div");
  wrap.className = "count-block";
  const count = document.createElement("p");
  count.className = "count";
  const strong = document.createElement("strong");
  const climbed = state.mountains.filter((mountain) => isClimbed(mountain.id)).length;
  strong.textContent = String(climbed);
  const span = document.createElement("span");
  span.textContent = "/100";
  count.append(strong, span);
  const bar = document.createElement("div");
  bar.className = "bar";
  const fill = document.createElement("i");
  fill.style.width = `${climbed}%`;
  bar.append(fill);
  wrap.append(count, bar);
  return wrap;
}

function renderSidebar() {
  const aside = document.getElementById("sidebar");
  aside.replaceChildren();
  const header = renderHeader();
  if (isNarrow()) {
    aside.append(header);
    return;
  }
  aside.append(header, buildFilters());
}

function buildFilters() {
  const query = state.filters.query;
  const search = document.createElement("label");
  search.className = "search";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "山名、読み、山域";
  input.value = query;
  let composing = false;
  const commitQuery = () => {
    const caret = input.selectionStart;
    state.filters.query = input.value;
    render();
    const next = document.querySelector(".search input");
    if (!(next instanceof HTMLInputElement)) return;
    next.focus();
    if (caret != null) next.setSelectionRange(caret, caret);
  };
  input.addEventListener("compositionstart", () => {
    composing = true;
  });
  input.addEventListener("compositionend", () => {
    composing = false;
    commitQuery();
  });
  input.addEventListener("input", (event) => {
    if (composing || event.isComposing || !input.isConnected) return;
    commitQuery();
  });
  search.append(input);

  const elev = document.createElement("div");
  buttonRow(
    elev,
    ELEVATIONS,
    (item) => state.filters.elevMin === item.min && state.filters.elevMax === item.max,
    (item) => {
      state.filters.elevMin = item.min;
      state.filters.elevMax = item.max;
      render();
    },
  );
  const days = document.createElement("div");
  buttonRow(
    days,
    DAY_OPTIONS.map((label) => ({ label, id: label })),
    (item) => state.filters.days === item.id,
    (item) => {
      state.filters.days = item.id;
      render();
    },
  );
  const access = document.createElement("div");
  buttonRow(
    access,
    ACCESS_OPTIONS,
    (item) => state.filters.access === item.id,
    (item) => {
      state.filters.access = item.id;
      render();
    },
  );

  const regions = document.createElement("div");
  regions.className = "choices regions pad";
  REGIONS.forEach((region) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = region;
    const selected = region === "すべて" ? state.filters.regions.length === 0 : state.filters.regions.includes(region);
    if (selected) button.classList.add("is-on");
    button.addEventListener("click", () => {
      if (region === "すべて") state.filters.regions = [];
      else if (state.filters.regions.includes(region)) {
        state.filters.regions = state.filters.regions.filter((item) => item !== region);
      } else state.filters.regions = [...state.filters.regions, region];
      render();
    });
    regions.append(button);
  });
  const level = document.createElement("div");
  buttonRow(
    level,
    LEVEL_OPTIONS.map((label) => ({ label, id: label })),
    (item) => state.filters.level === item.id,
    (item) => {
      state.filters.level = item.id;
      render();
    },
  );
  const levelNote = document.createElement("p");
  levelNote.className = "field-note";
  levelNote.textContent = "標準的なモデルコースの時間と上りからの目安です。";
  level.append(levelNote);

  const status = document.createElement("div");
  status.className = "choices pad";
  ["すべて", "登頂済み", "未踏"].forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item;
    if (state.filters.status === item) button.classList.add("is-on");
    button.addEventListener("click", () => {
      state.filters.status = item;
      render();
    });
    status.append(button);
  });

  const searching = state.tab === "search";
  const filtersBox = document.createElement("div");
  filtersBox.className = "filters";
  if (searching) {
    filtersBox.append(
      search,
      fieldset("標高", elev.firstChild),
      fieldset("日数の目安", days.firstChild),
      fieldset("難易度", level),
      fieldset("交通", access.firstChild),
      regions,
    );
  } else {
    filtersBox.append(search, regions, status);
  }
  return filtersBox;
}

function accessLabel(mountain) {
  if (mountain.transit == null) return "未取得";
  return mountain.transit ? "電車・バス可" : "記載なし";
}

function accessShort(mountain) {
  if (mountain.transit == null) return "未取得";
  return mountain.transit ? "電車・バス" : "記載なし";
}

function renderResults() {
  const pane = document.getElementById("results");
  if (isNarrow() && state.mobilePane !== "list") {
    pane.hidden = true;
    return;
  }
  const searching = state.tab === "search";
  const result = searching ? searchDisplay() : { mountains: displayedMountains(), note: recordNote() };
  pane.hidden = false;
  const body = document.getElementById("results-body") || pane;
  body.replaceChildren();
  if (isNarrow()) {
    if (state.tab === "record") body.append(renderCount());
    body.append(buildFilters());
  }
  const head = document.createElement("div");
  head.className = "results-head";
  const title = document.createElement("strong");
  title.textContent = `${searching ? "検索結果" : "記録"} ${result.mountains.length} 座`;
  head.append(title);
  if (result.note) {
    const note = document.createElement("span");
    note.textContent = result.note;
    head.append(note);
  }
  const sheet = document.createElement("div");
  sheet.className = "sheet";
  const columns = searching ? ["山", "標高", "山域", "日数", "交通", "難易度"] : ["山", "標高", "山域", "記録", "登った日"];
  const labels = document.createElement("div");
  labels.className = searching ? "sheet-row sheet-labels" : "sheet-row sheet-labels is-record";
  columns.forEach((column) => {
    const cell = document.createElement("span");
    cell.textContent = column;
    labels.append(cell);
  });
  sheet.append(labels);
  result.mountains.forEach((mountain) => sheet.append(searching ? resultRow(mountain) : recordSheetRow(mountain)));
  const foot = document.createElement("p");
  foot.className = "foot";
  foot.textContent = searching
    ? isNarrow()
      ? "山を選ぶと行程の詳細が出ます。時間・距離・上りは YAMAP のモデルコースの数値です。"
      : "山を選ぶと、右側に行程の詳細が出ます。時間・距離・上りは YAMAP のモデルコースの数値です。"
    : isNarrow()
      ? "山を選ぶと記録の入力が出ます。登頂日とメモは、このブラウザの中だけに残ります。"
      : "山を選ぶと、右側に記録の入力が出ます。登頂日とメモは、このブラウザの中だけに残ります。";
  body.append(head, sheet, foot);
}

function recordSheetRow(mountain) {
  const { title } = titleOf(mountain.name);
  const record = recordOf(mountain.id);
  const button = document.createElement("button");
  button.type = "button";
  button.className = mountain.id === state.selectedId ? "sheet-row is-record is-on" : "sheet-row is-record";
  [title, `${mountain.elev.toLocaleString("ja-JP")} m`, mountain.area, isClimbed(mountain.id) ? "登頂済み" : "未踏", record.date || "—"].forEach(
    (value) => {
      const cell = document.createElement("span");
      cell.textContent = value;
      button.append(cell);
    },
  );
  button.addEventListener("click", () => select(mountain.id, 8));
  return button;
}

function resultRow(mountain) {
  const { title } = titleOf(mountain.name);
  const button = document.createElement("button");
  button.type = "button";
  button.className = mountain.id === state.selectedId ? "sheet-row is-on" : "sheet-row";
  [
    title,
    `${mountain.elev.toLocaleString("ja-JP")} m`,
    mountain.area,
    mountain.days == null ? "未取得" : dayLabel(mountain.days),
    accessShort(mountain),
    levelShort(mountain),
  ].forEach(
    (value) => {
      const cell = document.createElement("span");
      cell.textContent = value;
      button.append(cell);
    },
  );
  button.addEventListener("click", () => select(mountain.id, 8));
  return button;
}

function recordNote() {
  if (recordMountains().length) return "";
  if (state.filters.status === "登頂済み" && state.filters.regions.length) {
    return "この地方には登頂の記録がありません。";
  }
  if (state.filters.status === "登頂済み") return "まだ登頂の記録がありません。";
  if (state.filters.status === "未踏") return "この条件に合う未踏の山はありません。";
  return "";
}

function renderDetail() {
  const pane = document.getElementById("detail");
  const body = document.getElementById("detail-body") || pane;
  const mountain = state.mountains.find((item) => item.id === state.selectedId);
  if (!mountain || (isNarrow() && state.mobilePane !== "detail")) {
    pane.hidden = true;
    body.replaceChildren();
    return;
  }
  pane.hidden = false;
  const current = recordOf(mountain.id);
  const { title, sub } = titleOf(mountain.name);
  body.replaceChildren();
  if (isNarrow()) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "detail-back";
    back.textContent = "一覧に戻る";
    back.addEventListener("click", () => {
      state.mobilePane = "list";
      render();
      requestAnimationFrame(refreshMap);
    });
    body.append(back);
  }
  const area = document.createElement("p");
  area.className = "area";
  area.textContent = mountain.area;
  const h2 = document.createElement("h2");
  h2.textContent = title;
  const subLine = document.createElement("p");
  subLine.className = "sub";
  subLine.textContent = [mountain.kana, sub && `山頂 ${sub}`].filter(Boolean).join(" · ");
  const elev = document.createElement("p");
  elev.className = "elev";
  elev.textContent = `${mountain.elev.toLocaleString("ja-JP")} m`;
  const place = document.createElement("p");
  place.className = "place";
  place.textContent = `${mountain.prefs.join("・")} / ${mountain.region}`;
  const facts = document.createElement("dl");
  [
    ["日数の目安", mountain.days == null ? "未取得" : dayLabel(mountain.days)],
    ["難易度", levelOf(mountain) || "未取得"],
    ["交通", accessLabel(mountain)],
  ].forEach(([label, value]) => {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    wrap.append(dt, dd);
    facts.append(wrap);
  });
  const routes = document.createElement("ul");
  routes.className = "routes";
  (mountain.routes || []).forEach((route) => {
    const item = document.createElement("li");
    const label = document.createElement("strong");
    label.textContent = route.name || "モデルコース";
    item.append(label, document.createTextNode(routeFacts(route)));
    routes.append(item);
  });
  const record = document.createElement("div");
  record.className = "record";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = isClimbed(mountain.id) ? "switch is-on" : "switch";
  const knob = document.createElement("i");
  toggle.append(knob, document.createTextNode(isClimbed(mountain.id) ? "登頂済み" : "まだ登っていない"));
  toggle.addEventListener("click", () => {
    state.records[String(mountain.id)] = { ...current, climbed: !isClimbed(mountain.id) };
    saveRecords();
    render();
  });
  const dateLabel = document.createElement("label");
  dateLabel.append(document.createTextNode("登った日"));
  const date = document.createElement("input");
  date.type = "date";
  date.value = current.date;
  date.addEventListener("change", () => {
    state.records[String(mountain.id)] = {
      ...recordOf(mountain.id),
      date: date.value,
      climbed: date.value ? true : isClimbed(mountain.id),
    };
    saveRecords();
    render();
  });
  dateLabel.append(date);
  const memoLabel = document.createElement("label");
  memoLabel.append(document.createTextNode("メモ"));
  const memo = document.createElement("textarea");
  memo.value = current.memo;
  memo.placeholder = "天気、ルート、一緒に行った人";
  memo.addEventListener("input", () => {
    state.records[String(mountain.id)] = { ...recordOf(mountain.id), memo: memo.value };
    saveRecords();
  });
  memoLabel.append(memo);
  record.append(toggle, dateLabel, memoLabel);
  const photos = document.createElement("div");
  photos.id = "photos";
  photos.className = "photos";

  const actions = document.createElement("div");
  actions.className = "actions";
  const zoom = document.createElement("button");
  zoom.type = "button";
  zoom.textContent = "この山を拡大する";
  zoom.addEventListener("click", () => select(mountain.id, 14));
  const yamap = document.createElement("a");
  yamap.href = yamapUrl(mountain);
  yamap.target = "_blank";
  yamap.rel = "noopener";
  yamap.textContent = "YAMAPでこの山を見る";
  actions.append(zoom, yamap);
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent =
    "引くと衛星写真です。拡大すると淡色の地形図になります。行程の文章とルートの線は YAMAP で確認してください。";
  body.append(area, h2, subLine, elev, place, facts, routes, record, photos, actions, hint);
  if (photoPreview.mountainId !== String(mountain.id)) {
    photoPreview = { mountainId: String(mountain.id), photoId: null };
  }
  if (isClimbed(mountain.id)) fillPhotos(mountain.id);
}

function fillPhotos(mountainId) {
  const host = document.getElementById("photos");
  if (!host || String(state.selectedId) !== String(mountainId)) return;
  host.replaceChildren();
  const cached = ensurePhotos(mountainId);
  const head = document.createElement("div");
  head.className = "photos-head";
  const label = document.createElement("span");
  label.textContent = "写真";
  const count = document.createElement("span");
  count.textContent = cached.status === "loading" ? "読み込み中" : `${cached.items.length} / ${PHOTO_MAX}`;
  head.append(label, count);
  const row = document.createElement("div");
  row.className = "photos-row";
  cached.items.forEach((item) => {
    const wrap = document.createElement("div");
    wrap.className = photoPreview.photoId === item.id ? "photo-item is-on" : "photo-item";
    const open = document.createElement("button");
    open.type = "button";
    open.className = "photo-open";
    const image = document.createElement("img");
    image.src = item.url;
    image.alt = "";
    open.append(image);
    open.addEventListener("click", () => {
      photoPreview = { mountainId: String(mountainId), photoId: item.id };
      fillPhotos(mountainId);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "photo-remove";
    remove.setAttribute("aria-label", "写真を削除");
    remove.textContent = "×";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      removePhoto(mountainId, item.id).then(() => fillPhotos(mountainId));
    });
    wrap.append(open, remove);
    row.append(wrap);
  });
  const add = document.createElement("button");
  add.type = "button";
  add.className = "photos-add";
  add.disabled = cached.items.length >= PHOTO_MAX;
  add.textContent = cached.items.length >= PHOTO_MAX ? "上限です" : "写真を追加";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.multiple = true;
  input.hidden = true;
  add.addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    addPhotos(mountainId, input.files).then(() => fillPhotos(mountainId));
  });
  row.append(add, input);
  host.append(head, row);
  const preview = cached.items.find((item) => item.id === photoPreview.photoId);
  if (preview) {
    const view = document.createElement("div");
    view.className = "photo-view";
    const image = document.createElement("img");
    image.src = preview.url;
    image.alt = "";
    view.append(image);
    host.append(view);
  }
  const note = document.createElement("p");
  note.className = "photos-note";
  note.textContent = "写真はこのブラウザの中だけに残ります。";
  host.append(note);
}

function drawPins() {
  pins.clearLayers();
  displayedMountains().forEach((mountain) => {
    const climbed = isClimbed(mountain.id);
    const selected = mountain.id === state.selectedId;
    const classes = ["pin"];
    if (selected) classes.push("is-selected");
    else if (climbed) classes.push("is-climbed");
    const marker = L.marker([mountain.lat, mountain.lng], {
      icon: L.divIcon({
        className: "pin-wrap",
        html: `<span class="${classes.join(" ")}"></span>`,
        iconSize: selected ? [22, 22] : [18, 18],
        iconAnchor: selected ? [11, 11] : [9, 9],
      }),
      title: titleOf(mountain.name).title,
      zIndexOffset: selected ? 900 : climbed ? 400 : 0,
    });
    marker.on("click", (event) => {
      L.DomEvent.stopPropagation(event);
      select(mountain.id, 8);
    });
    marker.addTo(pins);
  });
}

function render() {
  const visible = new Set(displayedMountains().map((mountain) => mountain.id));
  if (state.selectedId != null && !visible.has(state.selectedId)) state.selectedId = null;
  document.body.classList.toggle("is-search", state.tab === "search");
  document.body.classList.toggle("is-narrow", isNarrow());
  document.body.classList.toggle("is-mobile-map", isNarrow() && state.mobilePane === "map");
  document.body.classList.toggle("is-mobile-list", isNarrow() && state.mobilePane === "list");
  document.body.classList.toggle("is-mobile-detail", isNarrow() && state.mobilePane === "detail");
  renderSidebar();
  renderResults();
  renderDetail();
  if (pins) drawPins();
}

function select(id, zoom) {
  state.selectedId = id;
  state.focusZoom = zoom;
  if (isNarrow()) state.mobilePane = "detail";
  render();
  const mountain = state.mountains.find((item) => item.id === id);
  if (!map || !mountain) return;
  map.flyTo([mountain.lat, mountain.lng], Math.max(map.getZoom(), zoom), { duration: 0.7 });
}

function setupMap() {
  map = L.map("map", { zoomControl: false, minZoom: 5, maxZoom: 18 });
  L.control.zoom({ position: "bottomright" }).addTo(map);
  const attribution =
    "出典：<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank' rel='noopener'>国土地理院</a>";
  photoLayer = L.tileLayer(PHOTO, { attribution, maxZoom: 18, minZoom: 5 });
  paleLayer = L.tileLayer(PALE, { attribution, maxZoom: 18, minZoom: 5 });
  photoLayer.addTo(map);
  pins = L.layerGroup().addTo(map);
  fitJapan();
  requestAnimationFrame(() => {
    refreshMap();
    if (!state.selectedId) fitJapan();
  });
  window.addEventListener("resize", refreshMap);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", refreshMap);
  map.on("zoomend", () => {
    const next = map.getZoom() >= 12 ? "pale" : "photo";
    if (next === mapMode) return;
    if (next === "pale") {
      map.removeLayer(photoLayer);
      paleLayer.addTo(map);
    } else {
      map.removeLayer(paleLayer);
      photoLayer.addTo(map);
    }
    mapMode = next;
    pins.remove();
    pins.addTo(map);
  });
}

function registerOffline() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register(new URL("sw.js", document.baseURI)).catch(() => {});
}

setupLayout();
registerOffline();
fetch("data/mountains.json")
  .then((response) => {
    if (!response.ok) throw new Error("data");
    return response.json();
  })
  .then((mountains) => {
    state.mountains = mountains;
    setupMap();
    render();
  })
  .catch(() => {
    document.getElementById("sidebar").textContent = "山データを読み込めませんでした。";
  });
