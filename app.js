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

const state = {
  data: null,
  years: [],
  selectedIndex: 0,
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
  timelineLabel: document.getElementById("timelineLabel"),
  yearFilter: document.getElementById("yearFilter"),
  legend: document.getElementById("legend"),
};

buildLegend();
loadData();

ui.yearFilter.addEventListener("change", () => {
  setYearByValue(Number(ui.yearFilter.value), { fitBounds: true });
});

function buildLegend() {
  const items = [
    ...FIRE_TYPES,
    "Other",
  ].map((label) => {
    const color = FIRE_COLORS[label] || FIRE_COLORS.default;
    return `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${color}"></span>
        <span>${label}</span>
      </div>
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
  state.years = buildYearRange(state.data.features);

  renderYearFilter();
  setYearByValue(state.years[state.years.length - 1], { fitBounds: true });
}

function buildYearRange(features) {
  const years = features
    .map((feature) => Number(feature.properties?.season_year))
    .filter((year) => Number.isFinite(year));

  if (!years.length) {
    return [new Date().getFullYear()];
  }

  return [...new Set(years)].sort((left, right) => left - right);
}

function renderYearFilter() {
  ui.yearFilter.innerHTML = state.years
    .map((year) => `<option value="${year}">${year}</option>`)
    .join("");
}

function setYearByValue(year, options = {}) {
  if (!state.years.length) {
    return;
  }

  const selectedYear = state.years.includes(year) ? year : state.years[state.years.length - 1];
  state.selectedIndex = state.years.indexOf(selectedYear);

  ui.yearFilter.value = String(selectedYear);
  ui.selectedYear.textContent = String(selectedYear);
  ui.timelineLabel.textContent = String(selectedYear);

  const matching = state.data.features.filter((feature) => {
    return Number(feature.properties?.season_year) === selectedYear;
  });

  fireLayer.clearLayers();
  fireLayer.addData({ type: "FeatureCollection", features: matching });

  updateSummary(selectedYear, matching);

  if (options.fitBounds && matching.length) {
    const bounds = fireLayer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.12));
    }
  }
}

function updateSummary(selectedYear, features) {
  const count = features.length;
  const totalArea = features.reduce((sum, feature) => {
    const area = Number(feature.properties?.area_ha);
    return sum + (Number.isFinite(area) ? area : 0);
  }, 0);

  ui.polygonCount.textContent = count.toLocaleString();
  ui.totalArea.textContent = `${formatArea(totalArea)}`;
  ui.coverageRange.textContent = `${state.years[0]}-${state.years[state.years.length - 1]}`;

  const availableYears = features.length ? `(${count} polygon${count === 1 ? "" : "s"})` : "(no polygons)";
  ui.selectedSubtitle.textContent = `Fire polygons for ${selectedYear} ${availableYears}.`;
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
