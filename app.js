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
const ROUTE_KEY = "hyakumeizan-route-v1";
const PLACES_KEY = "hyakumeizan-places-v1";
const PLACE_MAX = 12;
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
let routeForm = loadRouteForm();
let places = loadPlaces();

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
    return { paddingTopLeft: [16, header], paddingBottomRight: [16, Math.round(viewHeight() * 0.4) + 16] };
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

function viewHeight() {
  return Math.round(window.visualViewport?.height || window.innerHeight);
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
  if (isNarrow()) {
    root.style.setProperty("--mobile-sheet-h", `${Math.round(viewHeight() * 0.4)}px`);
  }
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
  if (window.visualViewport) window.visualViewport.addEventListener("resize", applyLayout);
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

function loadRouteForm() {
  try {
    const saved = JSON.parse(localStorage.getItem(ROUTE_KEY) || "{}");
    const waypoints = Array.isArray(saved.waypoints) ? saved.waypoints.map((item) => String(item ?? "")) : [];
    let date = String(saved.date || "");
    let hour = saved.hour === "" || saved.hour == null ? "" : String(saved.hour);
    let minute = saved.minute === "" || saved.minute == null ? "" : String(saved.minute);
    if (!date && saved.datetime) {
      const [day, clock = ""] = String(saved.datetime).split("T");
      date = day || "";
      const [h, m] = clock.split(":");
      if (h) hour = String(Number(h));
      if (m) minute = String(Math.round(Number(m) / 5) * 5);
    }
    return {
      origin: String(saved.origin || ""),
      waypoints,
      goalKind: saved.goalKind === "station" ? "station" : "trailhead",
      goal: String(saved.goal || ""),
      goalMountainId: saved.goalMountainId == null ? "" : String(saved.goalMountainId),
      timeMode: saved.timeMode === "arrive" ? "arrive" : "depart",
      date,
      hour,
      minute,
      tab: saved.tab === "driving" ? "driving" : "transit",
      people: saved.people === "" || saved.people == null ? "" : String(clamp(Math.round(Number(saved.people) || 1), 1, 99)),
      fare: String(saved.fare || ""),
      selectedPlaceId: String(saved.selectedPlaceId || ""),
      saving: Boolean(saved.saving),
      placeName: String(saved.placeName || ""),
      open: saved.open !== false,
    };
  } catch {
    return {
      origin: "",
      waypoints: [],
      goalKind: "trailhead",
      goal: "",
      goalMountainId: "",
      timeMode: "depart",
      date: "",
      hour: "",
      minute: "",
      tab: "transit",
      people: "",
      fare: "",
      selectedPlaceId: "",
      saving: false,
      placeName: "",
      open: true,
    };
  }
}

function persistRoute() {
  localStorage.setItem(ROUTE_KEY, JSON.stringify(routeForm));
}

function loadPlaces() {
  try {
    const saved = JSON.parse(localStorage.getItem(PLACES_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved
      .map((item) => ({
        id: String(item.id || ""),
        name: String(item.name || "").trim(),
        address: String(item.address || "").trim(),
      }))
      .filter((item) => item.id && item.name && item.address)
      .slice(0, PLACE_MAX);
  } catch {
    return [];
  }
}

function persistPlaces() {
  localStorage.setItem(PLACES_KEY, JSON.stringify(places));
}

function newPlaceId() {
  return `p-${Date.now().toString(36)}`;
}

function matchPlace(address) {
  const value = String(address || "").trim();
  return places.find((place) => place.address === value) || null;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function mountainTitle(mountain) {
  return titleOf(mountain.name).title;
}

function defaultGoal(mountain, kind) {
  const name = mountainTitle(mountain);
  return kind === "station" ? `${name} 最寄駅` : `${name} 登山口`;
}

function syncRouteGoal(mountain) {
  const id = String(mountain.id);
  if (routeForm.goalMountainId !== id) {
    routeForm.goal = defaultGoal(mountain, routeForm.goalKind);
    routeForm.goalMountainId = id;
  }
}

function routeGoal(mountain) {
  syncRouteGoal(mountain);
  return routeForm.goal.trim() || defaultGoal(mountain, routeForm.goalKind);
}

function routeUnix() {
  if (!routeForm.date) return NaN;
  const hour = routeForm.hour === "" ? 0 : Number(routeForm.hour);
  const minute = routeForm.minute === "" ? 0 : Number(routeForm.minute);
  const stamp = new Date(`${routeForm.date}T${pad2(hour)}:${pad2(minute)}:00`).getTime();
  return Number.isFinite(stamp) ? Math.floor(stamp / 1000) : NaN;
}

function mapsRouteUrl(mountain, mode) {
  const dest = routeGoal(mountain);
  const origin = routeForm.origin.trim();
  const vias = routeForm.waypoints.map((item) => item.trim()).filter(Boolean);
  const unix = routeUnix();
  if (Number.isFinite(unix) && unix > 0 && origin) {
    const points = [origin, ...vias, dest].map(encodeURIComponent).join("/");
    const leave = routeForm.timeMode === "arrive" ? 1 : 0;
    const travel = mode === "transit" ? 3 : 0;
    return `https://www.google.com/maps/dir/${points}/data=!4m6!4m5!2m3!6e${leave}!7e2!8j${unix}!3e${travel}`;
  }
  const params = new URLSearchParams({
    api: "1",
    destination: dest,
    travelmode: mode,
  });
  if (origin) params.set("origin", origin);
  if (vias.length) params.set("waypoints", vias.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function splitYen() {
  const raw = String(routeForm.fare).replace(/[^\d.]/g, "");
  const people = Number(routeForm.people);
  if (!raw || !routeForm.people) return null;
  const yen = Number(raw);
  if (!Number.isFinite(yen) || yen < 0 || !Number.isFinite(people) || people < 1) return null;
  return Math.ceil(yen / people);
}

function routeSelect(value, options, onChange) {
  const select = document.createElement("select");
  options.forEach(([id, label]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = label;
    if (String(id) === String(value)) option.selected = true;
    select.append(option);
  });
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function fillRouteSearch(mountain) {
  const host = document.getElementById("route-search");
  if (!host) return;
  syncRouteGoal(mountain);
  host.replaceChildren();
  const box = document.createElement("details");
  box.className = "route";
  box.open = routeForm.open;
  box.addEventListener("toggle", () => {
    routeForm.open = box.open;
    persistRoute();
  });
  const summary = document.createElement("summary");
  summary.textContent = "交通手段・ルートを検索する";
  const originLabel = document.createElement("label");
  originLabel.className = "route-field";
  originLabel.append("出発地");
  const origin = document.createElement("input");
  origin.type = "text";
  origin.placeholder = "自宅、最寄駅、住所";
  origin.value = routeForm.origin;
  origin.autocomplete = "off";
  origin.addEventListener("input", () => {
    routeForm.origin = origin.value;
    const matched = matchPlace(origin.value);
    routeForm.selectedPlaceId = matched ? matched.id : "";
    persistRoute();
    placeBlock.querySelectorAll("[data-place-id]").forEach((pick) => {
      pick.classList.toggle("is-on", pick.dataset.placeId === routeForm.selectedPlaceId);
    });
    const saveBtn = placeBlock.querySelector(".route-save");
    if (saveBtn) saveBtn.disabled = !routeForm.origin.trim() || places.length >= PLACE_MAX;
  });
  originLabel.append(origin);
  const placeBlock = document.createElement("div");
  placeBlock.className = "route-places";
  if (places.length) {
    const list = document.createElement("div");
    list.className = "route-choices";
    places.forEach((place) => {
      const chip = document.createElement("span");
      chip.className = "route-place";
      const pick = document.createElement("button");
      pick.type = "button";
      pick.dataset.placeId = place.id;
      pick.className = routeForm.selectedPlaceId === place.id ? "is-on" : "";
      pick.textContent = place.name;
      pick.addEventListener("click", () => {
        routeForm.origin = place.address;
        routeForm.selectedPlaceId = place.id;
        persistRoute();
        fillRouteSearch(mountain);
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "route-place-del";
      remove.setAttribute("aria-label", `${place.name}を削除`);
      remove.textContent = "×";
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        places = places.filter((item) => item.id !== place.id);
        if (routeForm.selectedPlaceId === place.id) routeForm.selectedPlaceId = "";
        persistPlaces();
        persistRoute();
        fillRouteSearch(mountain);
      });
      chip.append(pick, remove);
      list.append(chip);
    });
    placeBlock.append(list);
  }
  if (routeForm.saving) {
    const nameLabel = document.createElement("label");
    nameLabel.className = "route-field";
    nameLabel.append("登録名");
    const name = document.createElement("input");
    name.type = "text";
    name.placeholder = "自宅、最寄駅、〇〇の家";
    name.value = routeForm.placeName;
    name.autocomplete = "off";
    name.addEventListener("input", () => {
      routeForm.placeName = name.value;
      persistRoute();
    });
    nameLabel.append(name);
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "route-add";
    confirm.textContent = "マイ地図に登録";
    confirm.disabled = !routeForm.origin.trim() || !routeForm.placeName.trim() || places.length >= PLACE_MAX;
    confirm.addEventListener("click", () => {
      const address = routeForm.origin.trim();
      const label = routeForm.placeName.trim();
      if (!address || !label) return;
      const existing = places.find((item) => item.address === address || item.name === label);
      if (existing) {
        existing.name = label;
        existing.address = address;
        routeForm.selectedPlaceId = existing.id;
      } else if (places.length < PLACE_MAX) {
        const place = { id: newPlaceId(), name: label, address };
        places.push(place);
        routeForm.selectedPlaceId = place.id;
      }
      routeForm.saving = false;
      routeForm.placeName = "";
      persistPlaces();
      persistRoute();
      fillRouteSearch(mountain);
    });
    placeBlock.append(nameLabel, confirm);
  } else {
    const save = document.createElement("button");
    save.type = "button";
    save.className = "route-add route-save";
    save.textContent = places.length >= PLACE_MAX ? "登録の上限です" : "この出発地をマイ地図に登録";
    save.disabled = !routeForm.origin.trim() || places.length >= PLACE_MAX;
    save.addEventListener("click", () => {
      routeForm.saving = true;
      routeForm.placeName = routeForm.placeName || "自宅";
      persistRoute();
      fillRouteSearch(mountain);
    });
    placeBlock.append(save);
  }
  const vias = document.createElement("div");
  vias.className = "route-vias";
  routeForm.waypoints.forEach((value, index) => {
    const row = document.createElement("label");
    row.className = "route-field route-via";
    row.append(`中継地 ${index + 1}`);
    const line = document.createElement("div");
    line.className = "route-via-row";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "経由する駅・場所";
    input.value = value;
    input.autocomplete = "off";
    input.addEventListener("input", () => {
      routeForm.waypoints[index] = input.value;
      persistRoute();
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "route-remove";
    remove.textContent = "削除";
    remove.addEventListener("click", () => {
      routeForm.waypoints.splice(index, 1);
      persistRoute();
      fillRouteSearch(mountain);
    });
    line.append(input, remove);
    row.append(line);
    vias.append(row);
  });
  const addVia = document.createElement("button");
  addVia.type = "button";
  addVia.className = "route-add";
  addVia.textContent = "中継地を追加";
  addVia.disabled = routeForm.waypoints.length >= 8;
  addVia.addEventListener("click", () => {
    routeForm.waypoints.push("");
    routeForm.open = true;
    persistRoute();
    fillRouteSearch(mountain);
  });
  const goalKind = document.createElement("div");
  goalKind.className = "route-choices";
  [
    ["trailhead", "登山口"],
    ["station", "最寄駅"],
  ].forEach(([id, label]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = routeForm.goalKind === id ? "is-on" : "";
    chip.textContent = label;
    chip.addEventListener("click", () => {
      routeForm.goalKind = id;
      routeForm.goal = defaultGoal(mountain, id);
      persistRoute();
      fillRouteSearch(mountain);
    });
    goalKind.append(chip);
  });
  const goalLabel = document.createElement("label");
  goalLabel.className = "route-field";
  goalLabel.append("到着地");
  const goal = document.createElement("input");
  goal.type = "text";
  goal.placeholder = defaultGoal(mountain, routeForm.goalKind);
  goal.value = routeForm.goal;
  goal.autocomplete = "off";
  goal.addEventListener("input", () => {
    routeForm.goal = goal.value;
    persistRoute();
  });
  goalLabel.append(goal);
  const timeMode = document.createElement("div");
  timeMode.className = "route-choices";
  [
    ["depart", "出発"],
    ["arrive", "到着"],
  ].forEach(([id, label]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = routeForm.timeMode === id ? "is-on" : "";
    chip.textContent = label;
    chip.addEventListener("click", () => {
      routeForm.timeMode = id;
      persistRoute();
      fillRouteSearch(mountain);
    });
    timeMode.append(chip);
  });
  const dateLabel = document.createElement("label");
  dateLabel.className = "route-field";
  dateLabel.append(routeForm.timeMode === "arrive" ? "到着日" : "出発日");
  const date = document.createElement("input");
  date.type = "date";
  date.value = routeForm.date;
  date.addEventListener("input", () => {
    routeForm.date = date.value;
    persistRoute();
  });
  dateLabel.append(date);
  const clockLabel = document.createElement("label");
  clockLabel.className = "route-field";
  clockLabel.append("時間");
  const clock = document.createElement("div");
  clock.className = "route-time";
  const hours = [["", "指定なし"]];
  for (let h = 0; h < 24; h += 1) hours.push([String(h), `${h}時`]);
  const minutes = [["", "指定なし"]];
  for (let m = 0; m < 60; m += 5) minutes.push([String(m), `${pad2(m)}分`]);
  clock.append(
    routeSelect(routeForm.hour, hours, (value) => {
      routeForm.hour = value;
      persistRoute();
    }),
    routeSelect(routeForm.minute, minutes, (value) => {
      routeForm.minute = value;
      persistRoute();
    }),
  );
  clockLabel.append(clock);
  const tabs = document.createElement("div");
  tabs.className = "route-tabs";
  [
    ["transit", "公共交通"],
    ["driving", "車"],
  ].forEach(([id, label]) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = routeForm.tab === id ? "is-on" : "";
    tab.textContent = label;
    tab.addEventListener("click", () => {
      const nextKind = id === "transit" ? "station" : "trailhead";
      if (routeForm.goal === defaultGoal(mountain, routeForm.goalKind)) {
        routeForm.goalKind = nextKind;
        routeForm.goal = defaultGoal(mountain, nextKind);
      }
      routeForm.tab = id;
      persistRoute();
      fillRouteSearch(mountain);
    });
    tabs.append(tab);
  });
  const pane = document.createElement("div");
  pane.className = "route-pane";
  const buttons = document.createElement("div");
  buttons.className = "route-actions";
  if (routeForm.tab === "transit") {
    const transit = document.createElement("button");
    transit.type = "button";
    transit.textContent = "公共交通で検索";
    transit.addEventListener("click", () => openRoute(mountain, "transit"));
    buttons.append(transit);
    const note = document.createElement("p");
    note.className = "route-note";
    note.textContent = "到着は山頂ではなく、上の到着地（登山口または最寄駅）で検索します。違う場所なら到着地を書き換えてください。";
    pane.append(buttons, note);
  } else {
    const car = document.createElement("button");
    car.type = "button";
    car.textContent = "車で検索";
    car.addEventListener("click", () => openRoute(mountain, "driving"));
    buttons.append(car);
    const peopleLabel = document.createElement("label");
    peopleLabel.className = "route-field";
    peopleLabel.append("人数");
    const people = document.createElement("input");
    people.type = "number";
    people.min = "1";
    people.max = "99";
    people.inputMode = "numeric";
    people.placeholder = "何人で割るか";
    people.value = routeForm.people;
    people.addEventListener("input", () => {
      routeForm.people = people.value === "" ? "" : String(clamp(Math.round(Number(people.value) || 1), 1, 99));
      persistRoute();
      const out = document.getElementById("route-split");
      if (out) out.textContent = splitLine();
    });
    peopleLabel.append(people);
    const fareLabel = document.createElement("label");
    fareLabel.className = "route-field";
    fareLabel.append("高速代などの金額（円）");
    const fare = document.createElement("input");
    fare.type = "text";
    fare.inputMode = "numeric";
    fare.placeholder = "地図に出た金額";
    fare.value = routeForm.fare;
    fare.addEventListener("input", () => {
      routeForm.fare = fare.value;
      persistRoute();
      const out = document.getElementById("route-split");
      if (out) out.textContent = splitLine();
    });
    fareLabel.append(fare);
    const split = document.createElement("p");
    split.id = "route-split";
    split.className = "route-split";
    split.textContent = splitLine();
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "route-reset";
    reset.textContent = "人数と金額をリセット";
    reset.addEventListener("click", () => {
      routeForm.people = "";
      routeForm.fare = "";
      persistRoute();
      fillRouteSearch(mountain);
    });
    const note = document.createElement("p");
    note.className = "route-note";
    note.textContent = "高速代はこのアプリでは出せないので、開いた地図の金額を入れて人数で割ってください。到着は山頂ではなく登山口または最寄駅です。";
    pane.append(buttons, peopleLabel, fareLabel, split, reset, note);
  }
  box.append(summary, originLabel, placeBlock, vias, addVia, goalKind, goalLabel, timeMode, dateLabel, clockLabel, tabs, pane);
  host.append(box);
}

function splitLine() {
  const yen = splitYen();
  if (yen == null) return "人数と金額を入れると、1人あたりを表示します";
  return `1人あたり ${yen.toLocaleString("ja-JP")} 円（${routeForm.people}人）`;
}

function openRoute(mountain, mode) {
  const url = mapsRouteUrl(mountain, mode);
  window.open(url, "_blank", "noopener,noreferrer");
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
  const routeSearch = document.createElement("div");
  routeSearch.id = "route-search";
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent =
    "引くと衛星写真です。拡大すると淡色の地形図になります。行程の文章とルートの線は YAMAP で確認してください。";
  body.append(area, h2, subLine, elev, place, facts, routes, record, photos, actions, routeSearch, hint);
  fillRouteSearch(mountain);
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

const savedScroll = { aside: 0, filters: 0, sheet: 0, detail: 0 };

function panelShown(el) {
  const pane = el?.closest("#results, #detail, aside");
  return Boolean(el && pane && !pane.hidden);
}

function captureScroll() {
  const aside = document.getElementById("sidebar");
  const filters = document.querySelector(".filters");
  const sheet = document.querySelector(".sheet");
  const detail = document.getElementById("detail-body");
  if (panelShown(aside)) savedScroll.aside = aside.scrollTop;
  if (panelShown(filters)) savedScroll.filters = filters.scrollTop;
  if (panelShown(sheet)) savedScroll.sheet = sheet.scrollTop;
  if (panelShown(detail)) savedScroll.detail = detail.scrollTop;
}

function restoreScroll() {
  const aside = document.getElementById("sidebar");
  const filters = document.querySelector(".filters");
  const sheet = document.querySelector(".sheet");
  const detail = document.getElementById("detail-body");
  if (panelShown(aside)) aside.scrollTop = savedScroll.aside;
  if (panelShown(filters)) filters.scrollTop = savedScroll.filters;
  if (panelShown(sheet)) sheet.scrollTop = savedScroll.sheet;
  if (panelShown(detail)) detail.scrollTop = savedScroll.detail;
}

function syncMapDrag() {
  if (!map) return;
  if (isNarrow() && state.mobilePane === "detail") map.dragging.disable();
  else map.dragging.enable();
}

function render() {
  captureScroll();
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
  restoreScroll();
  syncMapDrag();
}

function select(id, zoom) {
  state.selectedId = id;
  state.focusZoom = zoom;
  if (isNarrow()) state.mobilePane = "detail";
  render();
  const mountain = state.mountains.find((item) => item.id === id);
  if (!map || !mountain) return;
  const nextZoom = Math.max(map.getZoom(), zoom);
  if (isNarrow()) map.setView([mountain.lat, mountain.lng], nextZoom, { animate: false });
  else map.flyTo([mountain.lat, mountain.lng], nextZoom, { duration: 0.7 });
}

function setupMap() {
  map = L.map("map", {
    zoomControl: false,
    minZoom: 5,
    maxZoom: 18,
    inertia: false,
    bounceAtZoomLimits: false,
  });
  L.control.zoom({ position: "bottomright" }).addTo(map);
  map.attributionControl.setPrefix("");
  map.attributionControl.setPosition("bottomleft");
  const attribution =
    "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank' rel='noopener'>国土地理院</a>";
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
