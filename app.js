const REGIONS = ["すべて", "北海道", "東北", "関東", "中部", "近畿", "中国", "四国", "九州"];
const ELEVATIONS = [
  { label: "指定なし", min: 0, max: 4000 },
  { label: "1500m未満", min: 0, max: 1499 },
  { label: "1500–2499m", min: 1500, max: 2499 },
  { label: "2500–2999m", min: 2500, max: 2999 },
  { label: "3000m以上", min: 3000, max: 4000 },
];
const DAY_OPTIONS = ["指定なし", "日帰り", "1泊まで", "2泊まで"];
const ACCESS_OPTIONS = [
  { id: "指定なし", label: "指定なし" },
  { id: "電車・バス可", label: "電車・バス可" },
  { id: "記載なし", label: "電車・バスの記載なし" },
];
const KEY = "hyakumeizan-records-v1";
const HILL = "https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png";
const PALE = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png";

const state = {
  mountains: [],
  records: loadRecords(),
  filters: {
    query: "",
    region: "すべて",
    status: "すべて",
    elevMin: 0,
    elevMax: 4000,
    days: "指定なし",
    access: "指定なし",
  },
  selectedId: null,
  focusZoom: null,
};

let map;
let hillLayer;
let paleLayer;
let mapMode = "hill";
let pins;

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
  return state.records[id] || { climbed: false, date: "", memo: "" };
}

function matches(mountain, filters) {
  const record = recordOf(mountain.id);
  if (filters.region !== "すべて" && mountain.region !== filters.region) return false;
  if (filters.status === "登頂済み" && !record.climbed) return false;
  if (filters.status === "未踏" && record.climbed) return false;
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
  const blob = norm([title, sub, mountain.kana, mountain.area, mountain.region, ...mountain.prefs].join(" "));
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

function renderSidebar() {
  const aside = document.getElementById("sidebar");
  const query = state.filters.query;
  aside.replaceChildren();
  const header = document.createElement("header");
  const h1 = document.createElement("h1");
  h1.textContent = "百名山";
  const lede = document.createElement("p");
  lede.textContent = "登った山の記録と、次に登る山の検索です。";
  const count = document.createElement("p");
  count.className = "count";
  const strong = document.createElement("strong");
  const climbed = state.mountains.filter((mountain) => recordOf(mountain.id).climbed).length;
  strong.textContent = String(climbed);
  const span = document.createElement("span");
  span.textContent = "/100";
  count.append(strong, span);
  const bar = document.createElement("div");
  bar.className = "bar";
  const fill = document.createElement("i");
  fill.style.width = `${climbed}%`;
  bar.append(fill);
  header.append(h1, lede, count, bar);

  const search = document.createElement("label");
  search.className = "search";
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "山名、読み、山域";
  input.value = query;
  input.addEventListener("input", () => {
    const caret = input.selectionStart;
    state.filters.query = input.value;
    render();
    const next = document.querySelector(".search input");
    if (next) {
      next.focus();
      next.setSelectionRange(caret, caret);
    }
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
    if (state.filters.region === region) button.classList.add("is-on");
    button.addEventListener("click", () => {
      state.filters.region = region;
      render();
    });
    regions.append(button);
  });

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

  const shown = visibleMountains();
  const meta = document.createElement("p");
  meta.className = "meta";
  const missing = hiddenForMissing();
  meta.textContent = `表示 ${shown.length} 座${missing ? ` · 日数か交通が未取得の ${missing} 座は除いています` : ""}`;

  const list = document.createElement("div");
  list.className = "list";
  shown.forEach((mountain) => {
    const { title, sub } = titleOf(mountain.name);
    const button = document.createElement("button");
    button.type = "button";
    button.className = mountain.id === state.selectedId ? "row is-on" : "row";
    const dot = document.createElement("i");
    dot.className = recordOf(mountain.id).climbed ? "dot is-climbed" : "dot";
    const text = document.createElement("span");
    const name = document.createElement("b");
    name.textContent = title;
    const small = document.createElement("small");
    const bits = [sub, mountain.area].filter(Boolean);
    if (mountain.days != null) bits.push(dayLabel(mountain.days));
    if (mountain.transit === true) bits.push("電車バス可");
    small.textContent = bits.join(" · ");
    text.append(name, small);
    const elevText = document.createElement("em");
    elevText.textContent = `${mountain.elev.toLocaleString("ja-JP")} m`;
    button.append(dot, text, elevText);
    button.addEventListener("click", () => select(mountain.id, 8));
    list.append(button);
  });

  const foot = document.createElement("p");
  foot.className = "foot";
  foot.textContent =
    "日数は、YAMAPのモデルコースのうち負担の大きいもの（コース定数25以上）の中央値です。交通は、そのコースに「電車・バス」タグがあるかどうかです。ルート本文は保存していません。";

  aside.append(
    header,
    search,
    fieldset("標高", elev.firstChild),
    fieldset("日数の目安", days.firstChild),
    fieldset("交通", access.firstChild),
    regions,
    status,
    meta,
    list,
    foot,
  );
}

function renderDetail() {
  const pane = document.getElementById("detail");
  const mountain = state.mountains.find((item) => item.id === state.selectedId);
  if (!mountain) {
    pane.hidden = true;
    pane.replaceChildren();
    return;
  }
  pane.hidden = false;
  const current = recordOf(mountain.id);
  const { title, sub } = titleOf(mountain.name);
  pane.replaceChildren();
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
    [
      "交通",
      mountain.transit == null ? "未取得" : mountain.transit ? "電車・バスの記載あり" : "電車・バスの記載なし",
    ],
  ].forEach(([label, value]) => {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    wrap.append(dt, dd);
    facts.append(wrap);
  });
  const record = document.createElement("div");
  record.className = "record";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = current.climbed ? "switch is-on" : "switch";
  const knob = document.createElement("i");
  toggle.append(knob, document.createTextNode(current.climbed ? "登頂済み" : "まだ登っていない"));
  toggle.addEventListener("click", () => {
    state.records[mountain.id] = { ...current, climbed: !current.climbed };
    saveRecords();
    render();
  });
  const dateLabel = document.createElement("label");
  dateLabel.append(document.createTextNode("登った日"));
  const date = document.createElement("input");
  date.type = "date";
  date.value = current.date;
  date.addEventListener("change", () => {
    state.records[mountain.id] = {
      ...recordOf(mountain.id),
      date: date.value,
      climbed: date.value ? true : recordOf(mountain.id).climbed,
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
    state.records[mountain.id] = { ...recordOf(mountain.id), memo: memo.value };
    saveRecords();
  });
  memoLabel.append(memo);
  record.append(toggle, dateLabel, memoLabel);

  const actions = document.createElement("div");
  actions.className = "actions";
  const zoom = document.createElement("button");
  zoom.type = "button";
  zoom.textContent = "この山を拡大する";
  zoom.addEventListener("click", () => select(mountain.id, 14));
  const gsi = document.createElement("a");
  gsi.href = mountain.gsi;
  gsi.target = "_blank";
  gsi.rel = "noopener";
  gsi.textContent = "地理院地図で開く";
  const yamap = document.createElement("a");
  yamap.href = yamapUrl(mountain);
  yamap.target = "_blank";
  yamap.rel = "noopener";
  yamap.textContent = "YAMAPでこの山を見る";
  actions.append(zoom, gsi, yamap);
  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent =
    "引くと陰影で山の位置が分かり、拡大すると淡色の地形図になります。高速道路の色分けは出していません。行程の詳細はYAMAP側で確認してください。";
  pane.append(area, h2, subLine, elev, place, facts, record, actions, hint);
}

function drawPins() {
  pins.clearLayers();
  visibleMountains().forEach((mountain) => {
    const climbed = recordOf(mountain.id).climbed;
    const selected = mountain.id === state.selectedId;
    const marker = L.marker([mountain.lat, mountain.lng], {
      icon: L.divIcon({
        className: "pin-wrap",
        html: `<span class="pin${climbed ? " is-climbed" : ""}${selected ? " is-selected" : ""}"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      title: titleOf(mountain.name).title,
      zIndexOffset: selected ? 800 : climbed ? 400 : 0,
    });
    marker.on("click", (event) => {
      L.DomEvent.stopPropagation(event);
      select(mountain.id, 8);
    });
    marker.addTo(pins);
  });
}

function render() {
  renderSidebar();
  renderDetail();
  if (pins) drawPins();
}

function select(id, zoom) {
  state.selectedId = id;
  state.focusZoom = zoom;
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
  hillLayer = L.tileLayer(HILL, { attribution, maxZoom: 15, minZoom: 5 });
  paleLayer = L.tileLayer(PALE, { attribution, maxZoom: 18, minZoom: 5 });
  hillLayer.addTo(map);
  pins = L.layerGroup().addTo(map);
  map.fitBounds(
    [
      [30.2, 129.2],
      [45.5, 145.5],
    ],
    { paddingTopLeft: [380, 28], paddingBottomRight: [40, 28] },
  );
  map.on("zoomend", () => {
    const next = map.getZoom() >= 11 ? "pale" : "hill";
    if (next === mapMode) return;
    if (next === "pale") {
      map.removeLayer(hillLayer);
      paleLayer.addTo(map);
    } else {
      map.removeLayer(paleLayer);
      hillLayer.addTo(map);
    }
    mapMode = next;
    pins.remove();
    pins.addTo(map);
  });
}

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
