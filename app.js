const DATA_URL = "Data/nt-fire-history.geojson";
const DEFAULT_CENTER = [-19.0, 133.0];
const DEFAULT_ZOOM = 4.6;
const FIRE_TYPES = ["Bushfire", "Prescribed burn", "Unknown"];
const FIRE_COLORS = {
  Bushfire: "#b62e2e",
  "Prescribed burn": "#2a6f49",
  Unknown: "#8a5d20",
  default: "#5b6470",
};
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const state = {
  data: null,
  years: [],
  monthsByYear: new Map(),
  selectedYear: null,
  selectedMonth: null,
  activeFireTypes: new Set(FIRE_TYPES),
  monthPlaying: false,
  monthTimer: null,
};

const map = L.map("map", {
  zoomControl: true,
  preferCanvas: true,
}).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 18,
}).addTo(map);

const fireLayer = L.geoJSON(null, {
  style: styleFeature,
  onEachFeature: onEachFeature,
}).addTo(map);

const ui = {
  selectedYear: document.getElementById("selectedYear"),
  selectedSubtitle: document.getElementById("selectedSubtitle"),
  polygonCount: document.getElementById("polygonCount"),
  totalArea: document.getElementById("totalArea"),
  coverageRange: document.getElementById("coverageRange"),
  yearLabel: document.getElementById("yearLabel"),
  monthLabel: document.getElementById("monthLabel"),
  yearFilter: document.getElementById("yearFilter"),
  monthSlider: document.getElementById("monthSlider"),
  monthTicks: document.getElementById("monthTicks"),
  monthPrev: document.getElementById("monthPrev"),
  monthPlayPause: document.getElementById("monthPlayPause"),
  monthNext: document.getElementById("monthNext"),
  resetFilters: document.getElementById("resetFilters"),
  fitMap: document.getElementById("fitMap"),
  legend: document.getElementById("legend"),
};

buildLegend();
loadData();

ui.yearFilter.addEventListener("change", () => {
  stopMonthPlayback();
  setSelection(Number(ui.yearFilter.value), null, { fitBounds: true });
});

ui.monthSlider.addEventListener("input", () => {
  stopMonthPlayback();
  setSelection(
    state.selectedYear,
    getVisibleMonths(state.selectedYear)[Number(ui.monthSlider.value)],
    { fitBounds: true },
  );
});

ui.monthPlayPause.addEventListener("click", () => {
  if (state.monthPlaying) {
    stopMonthPlayback();
    return;
  }

  startMonthPlayback();
});

ui.monthPrev.addEventListener("click", () => {
  stopMonthPlayback();
  shiftMonth(-1);
});

ui.monthNext.addEventListener("click", () => {
  stopMonthPlayback();
  shiftMonth(1);
});

ui.resetFilters.addEventListener("click", () => {
  stopMonthPlayback();
  state.activeFireTypes = new Set(FIRE_TYPES);
  buildLegend();
  setSelection(state.years[state.years.length - 1], null, { fitBounds: true });
});

ui.fitMap.addEventListener("click", () => {
  map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
});

ui.legend.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-fire-type]");
  if (!target) {
    return;
  }

  toggleFireType(target.dataset.fireType);
});

function buildLegend() {
  const items = ["All types", ...FIRE_TYPES].map((label) => {
    const isAll = label === "All types";
    const color = isAll ? FIRE_COLORS.default : FIRE_COLORS[label] || FIRE_COLORS.default;
    const active = isAll ? state.activeFireTypes.size === FIRE_TYPES.length : state.activeFireTypes.has(label);

    return `
      <button
        type="button"
        class="legend-item ${active ? "is-active" : ""}"
        data-fire-type="${label}"
        aria-pressed="${active}"
      >
        <span class="legend-swatch" style="background:${color}"></span>
        <span>${label}</span>
      </button>
    `;
  });

  ui.legend.innerHTML = items.join("");
}

async function loadData() {
  const response = await fetch(DATA_URL);
  if (!response.ok) {
    throw new Error(`Failed to load fire data: ${response.status}`);
  }

  state.data = await response.json();
  const timeIndex = buildTimeIndex(state.data.features);
  state.years = timeIndex.years;
  state.monthsByYear = timeIndex.monthsByYear;

  renderYearFilter();
  setSelection(state.years[state.years.length - 1], null, { fitBounds: true });
}

function buildTimeIndex(features) {
  const years = new Set();
  const monthsByYear = new Map();

  features.forEach((feature) => {
    const props = feature.properties || {};
    const year = Number(props.season_year);
    const ignitionDate = String(props.ignition_date || "");
    const month = Number(ignitionDate.slice(5, 7));

    if (!Number.isFinite(year)) {
      return;
    }

    years.add(year);
    if (!monthsByYear.has(year)) {
      monthsByYear.set(year, new Set());
    }

    if (Number.isFinite(month)) {
      monthsByYear.get(year).add(month);
    }
  });

  if (!years.size) {
    const currentYear = new Date().getFullYear();
    return {
      years: [currentYear],
      monthsByYear: new Map([[currentYear, new Set([new Date().getMonth() + 1])]]),
    };
  }

  const sortedYears = [...years].sort((left, right) => left - right);
  const normalizedMonthsByYear = new Map(
    [...monthsByYear.entries()].map(([year, months]) => [year, [...months].sort((left, right) => left - right)]),
  );

  return {
    years: sortedYears,
    monthsByYear: normalizedMonthsByYear,
  };
}

function renderYearFilter() {
  ui.yearFilter.innerHTML = state.years
    .map((year) => `<option value="${year}">${year}</option>`)
    .join("");
}

function getVisibleMonths(year) {
  return state.monthsByYear.get(year) || [];
}

function renderMonthFilter(year, selectedMonth) {
  const months = getVisibleMonths(year);

  ui.monthSlider.min = "0";
  ui.monthSlider.max = String(Math.max(0, months.length - 1));
  ui.monthSlider.step = "1";
  ui.monthSlider.value = String(Math.max(0, months.indexOf(selectedMonth)));
  ui.monthSlider.disabled = months.length <= 1;
  ui.monthPlayPause.disabled = months.length <= 1;
  ui.monthTicks.innerHTML = months
    .map((month) => `<span>${monthNamesShort(month)}</span>`)
    .join("");
}

function setSelection(year, month, options = {}) {
  if (!state.years.length) {
    return;
  }

  const selectedYear = state.years.includes(year) ? year : state.years[state.years.length - 1];
  const visibleMonths = getVisibleMonths(selectedYear);
  const fallbackMonth = visibleMonths[visibleMonths.length - 1] || 1;
  const selectedMonth = visibleMonths.includes(month) ? month : fallbackMonth;

  state.selectedYear = selectedYear;
  state.selectedMonth = selectedMonth;

  ui.yearFilter.value = String(selectedYear);
  ui.yearLabel.textContent = String(selectedYear);
  ui.selectedYear.textContent = `${monthNamesShort(selectedMonth)} ${selectedYear}`;

  renderMonthFilter(selectedYear, selectedMonth);
  ui.monthLabel.textContent = `${monthNamesShort(selectedMonth)} ${selectedYear}`;
  updateMonthPlaybackButton();

  const matching = state.data.features.filter((feature) => {
    const props = feature.properties || {};
    const featureYear = Number(props.season_year);
    const featureMonth = Number(String(props.ignition_date || "").slice(5, 7));
    const featureType = props.fire_type || "Unknown";
    return featureYear === selectedYear && featureMonth === selectedMonth && state.activeFireTypes.has(featureType);
  });

  fireLayer.clearLayers();
  fireLayer.addData({ type: "FeatureCollection", features: matching });

  updateSummary(selectedYear, selectedMonth, matching);

  if (options.fitBounds && matching.length) {
    const bounds = fireLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.12));
    }
  }
}

function updateSummary(selectedYear, selectedMonth, features) {
  const count = features.length;
  const totalArea = features.reduce((sum, feature) => {
    const area = Number(feature.properties?.area_ha);
    return sum + (Number.isFinite(area) ? area : 0);
  }, 0);

  ui.polygonCount.textContent = count.toLocaleString();
  ui.totalArea.textContent = `${formatArea(totalArea)}`;
  ui.coverageRange.textContent = `${state.years[0]}-${state.years[state.years.length - 1]}`;

  const availableYears = features.length ? `(${count} polygon${count === 1 ? "" : "s"})` : "(no polygons)";
  ui.selectedSubtitle.textContent = `Fire polygons for ${monthNamesShort(selectedMonth)} ${selectedYear} ${availableYears}.`;
}

function formatArea(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  if (value >= 1000) {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ha`;
  }

  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ha`;
}

function monthNamesShort(month) {
  return MONTH_NAMES[Math.max(1, Math.min(12, month)) - 1].slice(0, 3);
}

function toggleFireType(label) {
  if (label === "All types") {
    state.activeFireTypes = new Set(FIRE_TYPES);
  } else if (state.activeFireTypes.has(label)) {
    state.activeFireTypes.delete(label);
    if (!state.activeFireTypes.size) {
      state.activeFireTypes = new Set(FIRE_TYPES);
    }
  } else {
    state.activeFireTypes.add(label);
  }

  buildLegend();
  setSelection(state.selectedYear, state.selectedMonth, { fitBounds: false });
}

function updateMonthPlaybackButton() {
  ui.monthPlayPause.textContent = state.monthPlaying ? "Pause" : "Auto-scroll";
}

function shiftMonth(delta) {
  const months = getVisibleMonths(state.selectedYear);
  if (!months.length) {
    return;
  }

  const currentIndex = Math.max(0, months.indexOf(state.selectedMonth));
  const nextIndex = (currentIndex + delta + months.length) % months.length;
  setSelection(state.selectedYear, months[nextIndex], { fitBounds: true });
}

function startMonthPlayback() {
  const months = getVisibleMonths(state.selectedYear);
  if (months.length <= 1) {
    return;
  }

  stopMonthPlayback();
  state.monthPlaying = true;
  updateMonthPlaybackButton();

  state.monthTimer = window.setInterval(() => {
    const currentMonths = getVisibleMonths(state.selectedYear);
    if (currentMonths.length <= 1) {
      stopMonthPlayback();
      return;
    }

    const currentIndex = Math.max(0, currentMonths.indexOf(state.selectedMonth));
    const nextIndex = (currentIndex + 1) % currentMonths.length;
    setSelection(state.selectedYear, currentMonths[nextIndex], { fitBounds: true });
  }, 1500);
}

function stopMonthPlayback() {
  if (state.monthTimer) {
    clearInterval(state.monthTimer);
    state.monthTimer = null;
  }

  state.monthPlaying = false;
  updateMonthPlaybackButton();
}

function styleFeature(feature) {
  const fireType = feature.properties?.fire_type;
  const color = FIRE_COLORS[fireType] || FIRE_COLORS.default;

  return {
    color,
    weight: 1.2,
    opacity: 0.75,
    fillColor: color,
    fillOpacity: 0.36,
    lineCap: "round",
    lineJoin: "round",
  };
}

function onEachFeature(feature, layer) {
  layer.on({
    mouseover: (event) => {
      event.target.setStyle({ weight: 2.5, fillOpacity: 0.55, opacity: 1 });
      if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        event.target.bringToFront();
      }
    },
    mouseout: (event) => {
      fireLayer.resetStyle(event.target);
    },
  });

  layer.bindPopup(renderPopup(feature), { maxWidth: 280, closeButton: true });
}

function renderPopup(feature) {
  const props = feature.properties || {};
  const title = props.fire_name || props.fire_id || "Fire polygon";
  const seasonYear = props.season_year ?? "Unknown";
  const area = Number(props.area_ha);
  const areaText = Number.isFinite(area) ? `${area.toLocaleString(undefined, { maximumFractionDigits: 1 })} ha` : "n/a";

  return `
    <div class="fire-popup">
      <h3>${escapeHtml(title)}</h3>
      <dl>
        <dt>Year</dt><dd>${escapeHtml(String(seasonYear))}</dd>
        <dt>Type</dt><dd>${escapeHtml(props.fire_type || "Unknown")}</dd>
        <dt>Area</dt><dd>${escapeHtml(areaText)}</dd>
        <dt>Ignition</dt><dd>${escapeHtml(formatDate(props.ignition_date))}</dd>
        <dt>Extinguish</dt><dd>${escapeHtml(formatDate(props.extinguish_date))}</dd>
      </dl>
    </div>
  `;
}

function formatDate(value) {
  if (!value) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
