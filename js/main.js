/* Differential Dialogue: House M.D. Character Intelligence Console
   D3 v7 + vanilla JS. No framework. Designed for static deployment. */

const MAIN_CAST = [
  "House", "Foreman", "Chase", "Wilson", "Cuddy", "Cameron", "Taub",
  "Thirteen", "Kutner", "Adams", "Masters", "Park", "Amber", "Stacy"
];

const CAST_COLORS = new Map(MAIN_CAST.map((name, i) => [
  name,
  d3.interpolateTurbo(0.08 + i * (0.78 / (MAIN_CAST.length - 1)))
]));

const state = {
  season: "All",
  character: "House",
  metric: "line_count",
  networkMode: "force",
  popout: null
};

let DATA = {};

const FILES = {
  major: "data/major_characters.csv",
  characterSummary: "data/character_summary.csv",
  characterSeason: "data/character_season_summary.csv",
  characterEpisode: "data/character_episode_summary.csv",
  episodeSummary: "data/episode_summary.csv",
  edgesMajor: "data/speaker_edges_major.csv",
  wordsTop: "data/character_words_top50_by_season.csv",
  dialogue: "data/dialogue_lines.csv",
  report: "data/episode_parse_report.csv",
  notable: "data/notable_secondary_characters.csv"
};

const fmt = d3.format(",");
const compact = d3.format(".3s");
const tooltip = d3.select("#tooltip");

function toNum(d, keys) {
  keys.forEach(k => { if (k in d) d[k] = +d[k] || 0; });
  return d;
}

async function loadCsvSafe(path, rowFn = d => d) {
  try {
    return await d3.csv(path, rowFn);
  } catch (err) {
    console.warn(`Could not load ${path}`, err);
    return [];
  }
}

async function init() {
  DATA.major = await loadCsvSafe(FILES.major, d => toNum(d, ["line_count", "word_count", "episode_count", "season_count", "display_order"]));
  DATA.characterSummary = await loadCsvSafe(FILES.characterSummary, d => toNum(d, ["line_count", "word_count", "episode_count", "season_count"]));
  DATA.characterSeason = await loadCsvSafe(FILES.characterSeason, d => toNum(d, ["season", "line_count", "word_count", "episode_count"]));
  DATA.characterEpisode = await loadCsvSafe(FILES.characterEpisode, d => toNum(d, ["season", "episode", "line_count", "word_count"]));
  DATA.episodeSummary = await loadCsvSafe(FILES.episodeSummary, d => toNum(d, ["season", "episode", "line_count", "word_count", "speaker_count"]));
  DATA.edgesMajor = await loadCsvSafe(FILES.edgesMajor, d => toNum(d, ["season", "episode", "weight"]));
  DATA.wordsTop = await loadCsvSafe(FILES.wordsTop, d => toNum(d, ["season", "count", "frequency", "tf", "rank"]));
  DATA.dialogue = await loadCsvSafe(FILES.dialogue, d => toNum(d, ["season", "episode", "line_index", "word_count"]));
  DATA.report = await loadCsvSafe(FILES.report, d => toNum(d, ["season", "episode", "num_raw_lines", "num_dialogue_lines", "num_speakers"]));

  if (!DATA.major.length && DATA.characterSummary.length) {
    DATA.major = DATA.characterSummary.filter(d => MAIN_CAST.includes(d.speaker));
  }

  buildControls();
  renderAll();
  setupEvents();
}

function buildControls() {
  const seasons = ["All", ...Array.from(new Set([
    ...DATA.characterSeason.map(d => d.season).filter(Boolean),
    ...DATA.episodeSummary.map(d => d.season).filter(Boolean)
  ])).sort((a,b) => a-b).map(String)];

  d3.select("#seasonSelect")
    .selectAll("option")
    .data(seasons.length > 1 ? seasons : ["All","1","2","3","4","5","6","7","8"])
    .join("option")
    .attr("value", d => d)
    .text(d => d === "All" ? "All seasons" : `Season ${d}`);

  d3.select("#characterSelect")
    .selectAll("option")
    .data(MAIN_CAST)
    .join("option")
    .attr("value", d => d)
    .text(d => d);

  d3.select("#seasonSelect").property("value", state.season);
  d3.select("#characterSelect").property("value", state.character);
  d3.select("#metricSelect").property("value", state.metric);
  d3.select("#networkModeSelect").property("value", state.networkMode);
}

function setupEvents() {
  d3.select("#seasonSelect").on("change", e => { state.season = e.target.value; renderAll(); });
  d3.select("#characterSelect").on("change", e => { state.character = e.target.value; renderAll(); });
  d3.select("#metricSelect").on("change", e => { state.metric = e.target.value; renderAll(); });
  d3.select("#networkModeSelect").on("change", e => { state.networkMode = e.target.value; renderAll(); });
  d3.select("#resetBtn").on("click", () => {
    state.season = "All"; state.character = "House"; state.metric = "line_count"; state.networkMode = "force";
    buildControls(); renderAll();
  });
  d3.select("#phraseBtn").on("click", renderPhraseTracker);
  d3.select("#phraseInput").on("keydown", e => { if (e.key === "Enter") renderPhraseTracker(); });

  d3.selectAll("[data-popout]").on("click", (event) => openPopout(event.currentTarget.dataset.popout));
  d3.select("#popoutClose").on("click", closePopout);
  d3.select("#popoutOverlay").on("click", (event) => {
    if (event.target.id === "popoutOverlay") closePopout();
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePopout();
  });

  window.addEventListener("resize", debounce(() => {
    renderAll();
    if (state.popout) renderPopout();
  }, 150));
}

function renderAll() {
  renderStats();
  renderCharacterBars();
  renderHeatmap();
  renderProfile();
  renderNetworkGraph();
  renderInteractionMatrix();
  renderWordBubble();
  renderPhraseTracker();
}

function selectedSeasonNumber() {
  return state.season === "All" ? null : +state.season;
}

function getMajorForCurrentSeason() {
  const season = selectedSeasonNumber();
  if (!season || !DATA.characterSeason.length) {
    return MAIN_CAST.map(name => DATA.major.find(d => d.speaker === name) || {speaker: name, line_count: 0, word_count: 0, episode_count: 0, season_count: 0});
  }
  const bySpeaker = d3.rollup(
    DATA.characterSeason.filter(d => d.season === season && MAIN_CAST.includes(d.speaker)),
    v => ({
      speaker: v[0].speaker,
      line_count: d3.sum(v, d => d.line_count),
      word_count: d3.sum(v, d => d.word_count),
      episode_count: d3.sum(v, d => d.episode_count),
      season_count: 1
    }),
    d => d.speaker
  );
  return MAIN_CAST.map(name => bySpeaker.get(name) || {speaker: name, line_count: 0, word_count: 0, episode_count: 0, season_count: 0});
}

function renderStats() {
  const usable = DATA.report.filter(d => d.status === "usable").length || new Set(DATA.dialogue.map(d => `${d.season}x${d.episode}`)).size;
  const skipped = DATA.report.filter(d => d.status && d.status !== "usable").length;
  const seasons = new Set(DATA.major.flatMap(d => d.season_count ? ["x"] : []).length ? [1,2,3,4,5,6,7,8] : DATA.dialogue.map(d => d.season)).size || 8;
  const lines = DATA.dialogue.length || d3.sum(DATA.major, d => d.line_count);

  d3.select("#statStrip").html(`
    <div class="stat-card"><span class="stat-value">${fmt(usable || 0)}</span><span class="stat-label">usable episodes</span></div>
    <div class="stat-card"><span class="stat-value">${fmt(seasons || 8)}</span><span class="stat-label">seasons</span></div>
    <div class="stat-card"><span class="stat-value">${fmt(MAIN_CAST.length)}</span><span class="stat-label">main cast</span></div>
    <div class="stat-card"><span class="stat-value">${fmt(lines || 0)}</span><span class="stat-label">dialogue lines</span></div>
  `);

  const quality = DATA.report.length
    ? `${fmt(usable)} usable episodes · ${fmt(skipped)} excluded/blocked transcript pages · main roster locked to ${MAIN_CAST.length} recurring characters`
    : "Data quality report not loaded. Copy episode_parse_report.csv into /data for status chips.";
  d3.select("#dataQuality").text(quality);
  d3.select("#barChip").text(state.season === "All" ? "All seasons" : `Season ${state.season}`);
  const modeLabel = state.networkMode === "orbital" ? "Orbital sphere" : state.networkMode === "matrix" ? "Matrix mode" : "Adjacent speaker signal";
  d3.select("#networkChip").text(modeLabel);
}

function sizeOf(svgNode) {
  const rect = svgNode.getBoundingClientRect();
  return { width: Math.max(rect.width, 320), height: Math.max(rect.height, 260) };
}

function getChartTarget(id) {
  return state.popout === id ? "#popoutSvg" : `#${id}`;
}

function chartSize(id) {
  const node = document.querySelector(getChartTarget(id));
  return sizeOf(node);
}

function clearSvg(sel) {
  const svg = d3.select(sel);
  svg.selectAll("*").remove();
  return svg;
}

function addDefs(svg) {
  const defs = svg.append("defs");
  const g = defs.append("linearGradient").attr("id", "barGradient").attr("x1", "0%").attr("x2", "100%");
  g.append("stop").attr("offset", "0%").attr("stop-color", "#60f0ff");
  g.append("stop").attr("offset", "60%").attr("stop-color", "#8cffc3");
  g.append("stop").attr("offset", "100%").attr("stop-color", "#ffd37a");
}

function renderCharacterBars() {
  const el = document.querySelector("#barChart");
  const {width, height} = sizeOf(el);
  const svg = clearSvg("#barChart").attr("viewBox", [0, 0, width, height]);
  addDefs(svg);

  const margin = {top: 18, right: 36, bottom: 24, left: 98};
  const data = getMajorForCurrentSeason()
    .slice()
    .sort((a,b) => d3.descending(a[state.metric], b[state.metric]));

  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d[state.metric]) || 1])
    .nice()
    .range([margin.left, width - margin.right]);

  const y = d3.scaleBand()
    .domain(data.map(d => d.speaker))
    .range([margin.top, height - margin.bottom])
    .padding(0.26);

  svg.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat(compact));

  svg.append("g")
    .selectAll("line")
    .data(x.ticks(5))
    .join("line")
    .attr("class", "grid-line")
    .attr("x1", d => x(d)).attr("x2", d => x(d))
    .attr("y1", margin.top).attr("y2", height - margin.bottom);

  svg.append("g")
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("class", "label")
    .attr("x", margin.left - 12)
    .attr("y", d => y(d.speaker) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .attr("fill", d => CAST_COLORS.get(d.speaker))
    .text(d => d.speaker);

  svg.append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("class", d => `bar ${d.speaker === state.character ? "selected" : ""}`)
    .attr("x", margin.left)
    .attr("y", d => y(d.speaker))
    .attr("height", y.bandwidth())
    .attr("width", d => Math.max(1, x(d[state.metric]) - margin.left))
    .on("click", (_, d) => {
      state.character = d.speaker;
      d3.select("#characterSelect").property("value", state.character);
      renderAll();
    })
    .on("mousemove", (event, d) => showTooltip(event, `<strong>${d.speaker}</strong><br>${labelMetric(state.metric)}: ${fmt(d[state.metric])}<br>Episodes: ${fmt(d.episode_count || 0)}<br>Words: ${fmt(d.word_count || 0)}`))
    .on("mouseleave", hideTooltip);

  svg.append("g")
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("class", "small-label")
    .attr("x", d => Math.min(width - margin.right - 2, x(d[state.metric]) + 8))
    .attr("y", d => y(d.speaker) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .text(d => fmt(d[state.metric] || 0));
}

function renderHeatmap() {
  const el = document.querySelector("#heatmap");
  const {width, height} = sizeOf(el);
  const svg = clearSvg("#heatmap").attr("viewBox", [0, 0, width, height]);
  const margin = {top: 28, right: 24, bottom: 26, left: 88};
  const seasons = [1,2,3,4,5,6,7,8];

  const rows = [];
  const lookup = d3.rollup(
    DATA.characterSeason.filter(d => MAIN_CAST.includes(d.speaker)),
    v => ({
      line_count: d3.sum(v, d => d.line_count),
      word_count: d3.sum(v, d => d.word_count),
      episode_count: d3.sum(v, d => d.episode_count)
    }),
    d => d.speaker,
    d => d.season
  );

  MAIN_CAST.forEach(speaker => {
    seasons.forEach(season => {
      const found = lookup.get(speaker)?.get(season);
      rows.push({speaker, season, line_count: found?.line_count || 0, word_count: found?.word_count || 0, episode_count: found?.episode_count || 0});
    });
  });

  const x = d3.scaleBand().domain(seasons).range([margin.left, width - margin.right]).padding(0.09);
  const y = d3.scaleBand().domain(MAIN_CAST).range([margin.top, height - margin.bottom]).padding(0.12);
  const maxV = d3.max(rows, d => d[state.metric]) || 1;
  const color = d3.scaleSequential().domain([0, maxV]).interpolator(d3.interpolateYlGnBu);

  svg.append("g").selectAll("text")
    .data(seasons)
    .join("text")
    .attr("class", "label")
    .attr("x", d => x(d) + x.bandwidth()/2)
    .attr("y", margin.top - 9)
    .attr("text-anchor", "middle")
    .text(d => `S${d}`);

  svg.append("g").selectAll("text")
    .data(MAIN_CAST)
    .join("text")
    .attr("class", "small-label")
    .attr("x", margin.left - 12)
    .attr("y", d => y(d) + y.bandwidth()/2)
    .attr("dy", ".35em")
    .attr("text-anchor", "end")
    .attr("fill", d => d === state.character ? "#8cffc3" : "rgba(238,250,255,.72)")
    .text(d => d);

  svg.append("g").selectAll("rect")
    .data(rows)
    .join("rect")
    .attr("class", "heat-cell")
    .attr("x", d => x(d.season))
    .attr("y", d => y(d.speaker))
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth())
    .attr("rx", 6)
    .attr("fill", d => d[state.metric] ? color(d[state.metric]) : "rgba(255,255,255,.035)")
    .attr("opacity", d => (state.season !== "All" && +state.season !== d.season) ? .33 : 1)
    .on("click", (_, d) => {
      state.season = String(d.season);
      state.character = d.speaker;
      buildControls();
      renderAll();
    })
    .on("mousemove", (event, d) => showTooltip(event, `<strong>${d.speaker}, Season ${d.season}</strong><br>${labelMetric(state.metric)}: ${fmt(d[state.metric])}<br>Lines: ${fmt(d.line_count)}<br>Words: ${fmt(d.word_count)}`))
    .on("mouseleave", hideTooltip);
}

function renderProfile() {
  const current = getMajorForCurrentSeason().find(d => d.speaker === state.character) || DATA.major.find(d => d.speaker === state.character) || {};
  const all = DATA.major.find(d => d.speaker === state.character) || current;
  const seasonRows = DATA.characterSeason.filter(d => d.speaker === state.character).sort((a,b) => a.season - b.season);

  const note = state.season === "All"
    ? `${state.character} appears across ${fmt(all.season_count || 0)} season(s) and ${fmt(all.episode_count || 0)} usable episode(s).`
    : `Season ${state.season} focus. Totals shown for the selected season where available.`;

  d3.select("#profileCard").html(`
    <div class="profile-name" style="color:${CAST_COLORS.get(state.character)}">${state.character}</div>
    <div class="profile-grid">
      <div class="profile-stat"><strong>${fmt(current.line_count || 0)}</strong><span>lines</span></div>
      <div class="profile-stat"><strong>${fmt(current.word_count || 0)}</strong><span>words</span></div>
      <div class="profile-stat"><strong>${fmt(current.episode_count || 0)}</strong><span>episodes</span></div>
      <div class="profile-stat"><strong>${fmt(all.season_count || current.season_count || 0)}</strong><span>seasons</span></div>
    </div>
    <p class="profile-note">${note}</p>
    <svg id="profileSpark" class="sparkline"></svg>
  `);

  const svg = d3.select("#profileSpark");
  const node = svg.node();
  const w = Math.max(node.getBoundingClientRect().width, 220), h = 80;
  svg.attr("viewBox", [0,0,w,h]);
  const x = d3.scaleLinear().domain([1,8]).range([12,w-12]);
  const y = d3.scaleLinear().domain([0, d3.max(seasonRows, d => d.line_count) || 1]).range([h-18,10]);
  svg.append("path")
    .datum(seasonRows)
    .attr("fill", "none")
    .attr("stroke", CAST_COLORS.get(state.character))
    .attr("stroke-width", 3)
    .attr("d", d3.line().x(d => x(d.season)).y(d => y(d.line_count)).curve(d3.curveCatmullRom));
  svg.selectAll("circle")
    .data(seasonRows)
    .join("circle")
    .attr("cx", d => x(d.season)).attr("cy", d => y(d.line_count)).attr("r", 4)
    .attr("fill", "#fff");
}

function aggregateEdges() {
  const season = selectedSeasonNumber();
  const filtered = DATA.edgesMajor.filter(d =>
    MAIN_CAST.includes(d.source) && MAIN_CAST.includes(d.target) &&
    d.source !== d.target &&
    (!season || d.season === season)
  );

  const byPair = d3.rollup(
    filtered,
    v => d3.sum(v, d => d.weight),
    d => [d.source, d.target].sort().join("|||")
  );

  return Array.from(byPair, ([key, weight]) => {
    const [source, target] = key.split("|||");
    return {source, target, weight};
  }).filter(d => d.weight > 0);
}

function renderNetworkGraph() {
  const {width, height} = chartSize("networkGraph");
  const svg = clearSvg(getChartTarget("networkGraph")).attr("viewBox", [0, 0, width, height]);

  if (state.networkMode === "matrix") {
    svg.append("text").attr("class","empty-state-svg").attr("x", width/2).attr("y", height/2).attr("text-anchor","middle").attr("fill","rgba(238,250,255,.55)").text("Force graph hidden in Matrix mode.");
    return;
  }

  if (state.networkMode === "orbital") {
    renderOrbitalNetwork(svg, width, height);
    return;
  }

  const edges = aggregateEdges();
  const degree = d3.rollup(edges.flatMap(e => [{speaker:e.source,w:e.weight},{speaker:e.target,w:e.weight}]), v => d3.sum(v, d => d.w), d => d.speaker);
  const nodes = MAIN_CAST.map(speaker => ({speaker, weight: degree.get(speaker) || 0}));

  const maxEdge = d3.max(edges, d => d.weight) || 1;
  const edgeScale = d3.scaleSqrt().domain([0, maxEdge]).range([0.8, 10]);
  const nodeMax = state.popout === "networkGraph" ? 42 : Math.min(36, Math.max(24, width / 44));
  const nodeScale = d3.scaleSqrt().domain([0, d3.max(nodes, d => d.weight) || 1]).range([8, nodeMax]);

  const link = svg.append("g")
    .selectAll("line")
    .data(edges)
    .join("line")
    .attr("class", d => (d.source === state.character || d.target === state.character) ? "link focused" : "link")
    .attr("stroke-width", d => edgeScale(d.weight))
    .on("mousemove", (event, d) => {
      const sourceName = typeof d.source === "object" ? d.source.speaker : d.source;
      const targetName = typeof d.target === "object" ? d.target.speaker : d.target;
      showTooltip(event, `<strong>${sourceName} ↔ ${targetName}</strong><br>Interaction weight: ${fmt(d.weight)}<br>${state.season === "All" ? "All seasons" : `Season ${state.season}`}`);
    })
    .on("mouseleave", hideTooltip);

  const node = svg.append("g")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("class", "node")
    .attr("r", d => nodeScale(d.weight))
    .attr("fill", d => CAST_COLORS.get(d.speaker))
    .on("click", (_, d) => {
      state.character = d.speaker;
      d3.select("#characterSelect").property("value", state.character);
      renderAll();
    })
    .on("mousemove", (event, d) => showTooltip(event, `<strong>${d.speaker}</strong><br>Network weight: ${fmt(d.weight || 0)}`))
    .on("mouseleave", hideTooltip);

  const labels = svg.append("g")
    .selectAll("text")
    .data(nodes)
    .join("text")
    .attr("class", "small-label")
    .attr("text-anchor", "middle")
    .attr("dy", "-1.45em")
    .attr("fill", d => d.speaker === state.character ? "#8cffc3" : "rgba(238,250,255,.72)")
    .text(d => d.speaker);

  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(edges).id(d => d.speaker).distance(d => 130 - Math.min(85, edgeScale(d.weight) * 7)).strength(.42))
    .force("charge", d3.forceManyBody().strength(state.popout === "networkGraph" ? -980 : -720))
    .force("center", d3.forceCenter(width / 2, height / 2 + 8))
    .force("x", d3.forceX(width / 2).strength(0.035))
    .force("y", d3.forceY(height / 2).strength(0.05))
    .force("collide", d3.forceCollide().radius(d => nodeScale(d.weight) + (state.popout === "networkGraph" ? 48 : 36)))
    .on("tick", () => {
      link
        .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node
        .attr("cx", d => d.x = Math.max(28, Math.min(width-28, d.x)))
        .attr("cy", d => d.y = Math.max(36, Math.min(height-28, d.y)));
      labels
        .attr("x", d => d.x)
        .attr("y", d => d.y);
    });
}

function renderInteractionMatrix() {
  const {width, height} = chartSize("interactionMatrix");
  const svg = clearSvg(getChartTarget("interactionMatrix")).attr("viewBox", [0, 0, width, height]);

  if (state.networkMode === "force") {
    // Still render it lightly; this keeps the panel useful even in force mode.
  }

  const margin = {top: state.popout === "interactionMatrix" ? 118 : 92, right: 28, bottom: 28, left: state.popout === "interactionMatrix" ? 150 : 124};
  const availableW = width - margin.left - margin.right;
  const availableH = height - margin.top - margin.bottom;
  const size = Math.min(availableW / MAIN_CAST.length, availableH / MAIN_CAST.length) * (state.popout === "interactionMatrix" ? 0.98 : 0.96);
  const matrixW = size * MAIN_CAST.length;
  const matrixH = size * MAIN_CAST.length;
  const x0 = margin.left + (availableW - matrixW) / 2;
  const y0 = margin.top + (availableH - matrixH) / 2;

  const edges = aggregateEdges();
  const pairWeight = new Map();
  edges.forEach(e => {
    pairWeight.set(`${e.source}|||${e.target}`, e.weight);
    pairWeight.set(`${e.target}|||${e.source}`, e.weight);
  });

  const maxW = d3.max(edges, d => d.weight) || 1;
  const color = d3.scaleSequential().domain([0, maxW]).interpolator(d3.interpolatePuBuGn);

  svg.append("g").selectAll("text")
    .data(MAIN_CAST)
    .join("text")
    .attr("class", "small-label")
    .attr("transform", (d,i) => `translate(${x0 + i*size + size/2},${y0 - 10}) rotate(-45)`)
    .attr("text-anchor", "start")
    .text(d => d);

  svg.append("g").selectAll("text")
    .data(MAIN_CAST)
    .join("text")
    .attr("class", "small-label")
    .attr("x", x0 - 8)
    .attr("y", (d,i) => y0 + i*size + size/2)
    .attr("dy", ".35em")
    .attr("text-anchor", "end")
    .attr("fill", d => d === state.character ? "#8cffc3" : "rgba(238,250,255,.72)")
    .text(d => d);

  const cells = [];
  MAIN_CAST.forEach((row, ri) => MAIN_CAST.forEach((col, ci) => {
    cells.push({row, col, ri, ci, weight: row === col ? 0 : (pairWeight.get(`${row}|||${col}`) || 0)});
  }));

  svg.append("g").selectAll("rect")
    .data(cells)
    .join("rect")
    .attr("class", "matrix-cell")
    .attr("x", d => x0 + d.ci*size)
    .attr("y", d => y0 + d.ri*size)
    .attr("width", Math.max(1, size-1))
    .attr("height", Math.max(1, size-1))
    .attr("rx", 4)
    .attr("fill", d => d.weight ? color(d.weight) : "rgba(255,255,255,.025)")
    .attr("opacity", d => (d.row === state.character || d.col === state.character) ? 1 : .72)
    .on("click", (_, d) => {
      if (d.row !== d.col) {
        state.character = d.row;
        d3.select("#characterSelect").property("value", state.character);
        renderAll();
      }
    })
    .on("mousemove", (event, d) => showTooltip(event, `<strong>${d.row} ↔ ${d.col}</strong><br>Weight: ${fmt(d.weight)}`))
    .on("mouseleave", hideTooltip);
}

function renderWordBubble() {
  const {width, height} = chartSize("wordBubble");
  const svg = clearSvg(getChartTarget("wordBubble")).attr("viewBox", [0, 0, width, height]);

  if (!DATA.wordsTop.length) {
    svg.append("text").attr("x", width/2).attr("y", height/2).attr("text-anchor","middle").attr("fill","rgba(238,250,255,.55)").text("Copy character_words_top50_by_season.csv into /data to enable lexical fingerprint.");
    return;
  }

  const season = selectedSeasonNumber();
  let rows = DATA.wordsTop.filter(d => d.speaker === state.character && (!season || d.season === season));
  const countField = rows.some(d => d.count) ? "count" : (rows.some(d => d.frequency) ? "frequency" : "tf");

  if (!season) {
    rows = Array.from(d3.rollup(rows, v => d3.sum(v, d => d[countField] || 0), d => d.word), ([word, count]) => ({word, count}))
      .sort((a,b) => d3.descending(a.count,b.count))
      .slice(0,50);
  } else {
    rows = rows.map(d => ({word: d.word, count: d[countField] || 0})).sort((a,b) => d3.descending(a.count,b.count)).slice(0,50);
  }

  d3.select("#wordChip").text(`${state.character} · ${state.season === "All" ? "all seasons" : `Season ${state.season}`}`);

  const maxBubble = state.popout === "wordBubble" ? Math.min(82, Math.max(58, width / 22)) : Math.min(64, Math.max(44, width / 24));
  const minBubble = state.popout === "wordBubble" ? Math.min(18, Math.max(10, width / 110)) : Math.min(15, Math.max(8, width / 115));
  const radius = d3.scaleSqrt().domain([0, d3.max(rows, d => d.count) || 1]).range([minBubble, maxBubble]);
  const nodes = rows.map(d => ({...d, r: radius(d.count)}));

  const sim = d3.forceSimulation(nodes)
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX(width / 2).strength(0.028))
    .force("y", d3.forceY(height / 2).strength(0.04))
    .force("charge", d3.forceManyBody().strength(state.popout === "wordBubble" ? 16 : 11))
    .force("collide", d3.forceCollide().radius(d => d.r + (state.popout === "wordBubble" ? 8 : 5)))
    .stop();

  for (let i = 0; i < (state.popout === "wordBubble" ? 620 : 440); i++) sim.tick();

  const bubble = svg.append("g").selectAll("g")
    .data(nodes)
    .join("g")
    .attr("transform", d => `translate(${Math.max(d.r, Math.min(width-d.r, d.x))},${Math.max(d.r, Math.min(height-d.r, d.y))})`)
    .on("mousemove", (event, d) => showTooltip(event, `<strong>${d.word}</strong><br>Count: ${fmt(d.count)}`))
    .on("mouseleave", hideTooltip);

  bubble.append("circle")
    .attr("r", d => d.r)
    .attr("fill", (d,i) => d3.interpolateYlGnBu(.35 + .55*(i/Math.max(1,nodes.length-1))))
    .attr("opacity", .86)
    .attr("stroke", "rgba(255,255,255,.36)");

  bubble.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", ".32em")
    .attr("fill", "#061018")
    .attr("font-size", d => Math.min(14, Math.max(8, d.r / 2.5)))
    .attr("font-weight", 800)
    .text(d => d.word.length > 11 ? d.word.slice(0,10) + "…" : d.word);
}

function renderPhraseTracker() {
  const phrase = d3.select("#phraseInput").property("value").trim().toLowerCase();
  const {width, height} = chartSize("phraseChart");
  const svg = clearSvg(getChartTarget("phraseChart")).attr("viewBox", [0, 0, width, height]);

  if (!DATA.dialogue.length) {
    d3.select("#phraseMeta").text("dialogue_lines.csv was not loaded. Copy it into /data to enable full text search.");
    svg.append("text").attr("x", width/2).attr("y", height/2).attr("text-anchor","middle").attr("fill","rgba(238,250,255,.55)").text("Full dialogue not loaded.");
    return;
  }
  if (!phrase) return;

  const matches = DATA.dialogue.filter(d => (d.line || d.dialogue || "").toLowerCase().includes(phrase));
  d3.select("#phraseMeta").text(`${fmt(matches.length)} matching dialogue line(s) for “${phrase}”.`);

  const margin = {top: 28, right: state.popout === "phraseChart" ? 220 : 150, bottom: 38, left: 52};
  const bySeason = Array.from(d3.rollup(matches, v => v.length, d => d.season), ([season, count]) => ({season:+season, count}))
    .sort((a,b) => a.season-b.season);
  const seasonRows = [1,2,3,4,5,6,7,8].map(s => bySeason.find(d => d.season === s) || {season:s, count:0});

  const x = d3.scaleBand().domain(seasonRows.map(d => d.season)).range([margin.left, width - margin.right]).padding(.25);
  const y = d3.scaleLinear().domain([0, d3.max(seasonRows, d => d.count) || 1]).nice().range([height - margin.bottom, margin.top]);

  svg.append("g").attr("class","axis").attr("transform", `translate(0,${height-margin.bottom})`).call(d3.axisBottom(x).tickFormat(d => `S${d}`));
  svg.append("g").attr("class","axis").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(4));

  svg.append("g").selectAll("rect")
    .data(seasonRows)
    .join("rect")
    .attr("class","bar")
    .attr("x", d => x(d.season))
    .attr("y", d => y(d.count))
    .attr("width", x.bandwidth())
    .attr("height", d => y(0) - y(d.count))
    .on("mousemove", (event, d) => showTooltip(event, `<strong>Season ${d.season}</strong><br>${fmt(d.count)} matching line(s)`))
    .on("mouseleave", hideTooltip);

  const bySpeaker = Array.from(d3.rollup(matches.filter(d => MAIN_CAST.includes(d.speaker)), v => v.length, d => d.speaker), ([speaker, count]) => ({speaker, count}))
    .sort((a,b) => d3.descending(a.count,b.count))
    .slice(0,6);

  const lx = width - margin.right + 22;
  svg.append("text").attr("class","label").attr("x", lx).attr("y", margin.top).text("Top speakers");
  svg.selectAll(".phrase-speaker")
    .data(bySpeaker)
    .join("text")
    .attr("class","small-label")
    .attr("x", lx)
    .attr("y", (d,i) => margin.top + 24 + i*20)
    .attr("fill", d => CAST_COLORS.get(d.speaker))
    .text(d => `${d.speaker}: ${fmt(d.count)}`);
}

function labelMetric(metric) {
  return metric === "line_count" ? "Lines" : metric === "word_count" ? "Words" : "Episodes";
}

function showTooltip(event, html) {
  tooltip.style("opacity", 1).html(html).style("left", `${event.clientX}px`).style("top", `${event.clientY}px`);
}
function hideTooltip() { tooltip.style("opacity", 0); }

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null,args), wait);
  };
}



function renderOrbitalNetwork(svg, width, height) {
  const edges = aggregateEdges();
  const degree = d3.rollup(
    edges.flatMap(e => [{speaker:e.source,w:e.weight},{speaker:e.target,w:e.weight}]),
    v => d3.sum(v, d => d.w),
    d => d.speaker
  );

  const nodes = MAIN_CAST.map((speaker, i) => {
    const golden = Math.PI * (3 - Math.sqrt(5));
    const y = 1 - (i / (MAIN_CAST.length - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * golden;
    return {
      speaker,
      weight: degree.get(speaker) || 0,
      x3: Math.cos(theta) * radiusAtY,
      y3: y,
      z3: Math.sin(theta) * radiusAtY
    };
  });

  const nodeByName = new Map(nodes.map(d => [d.speaker, d]));
  const maxNode = d3.max(nodes, d => d.weight) || 1;
  const maxEdge = d3.max(edges, d => d.weight) || 1;
  const r = Math.min(width, height) * (state.popout === "networkGraph" ? 0.38 : 0.34);
  const cx = width / 2;
  const cy = height / 2 + 8;
  const perspective = 2.8;
  const nodeScale = d3.scaleSqrt().domain([0, maxNode]).range([7, state.popout === "networkGraph" ? 28 : 20]);
  const edgeScale = d3.scaleSqrt().domain([0, maxEdge]).range([0.7, state.popout === "networkGraph" ? 9 : 6]);

  let rotX = -0.18;
  let rotY = 0.62;
  let auto = true;

  const root = svg.append("g").attr("class", "orbital-root");

  svg.append("text")
    .attr("class", "orbital-note")
    .attr("x", 18)
    .attr("y", height - 18)
    .text("Drag to rotate · depth fades hidden links · click a node to focus character");

  function rotatePoint(p) {
    const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
    const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

    let x = p.x3 * cosY + p.z3 * sinY;
    let z = -p.x3 * sinY + p.z3 * cosY;
    let y = p.y3 * cosX - z * sinX;
    z = p.y3 * sinX + z * cosX;

    const scale = perspective / (perspective - z);
    return {
      ...p,
      rx: x,
      ry: y,
      rz: z,
      px: cx + x * r * scale,
      py: cy + y * r * scale,
      scale
    };
  }

  function projectCirclePoint(x3, y3, z3) {
    return rotatePoint({x3, y3, z3, speaker: "", weight: 0});
  }

  function drawGuide() {
    const guides = root.append("g").attr("class", "orbital-guides");
    guides.append("circle")
      .attr("class", "orbital-globe")
      .attr("cx", cx)
      .attr("cy", cy)
      .attr("r", r);

    const latitudes = [-0.5, 0, 0.5];
    latitudes.forEach(lat => {
      const pts = d3.range(0, 361, 8).map(a => {
        const t = a * Math.PI / 180;
        const rr = Math.sqrt(1 - lat * lat);
        return projectCirclePoint(Math.cos(t) * rr, lat, Math.sin(t) * rr);
      });
      guides.append("path")
        .attr("class", "orbital-latitude")
        .attr("d", d3.line().x(d => d.px).y(d => d.py)(pts));
    });

    const longitudes = [0, Math.PI/3, 2*Math.PI/3];
    longitudes.forEach(lon => {
      const pts = d3.range(-90, 91, 5).map(a => {
        const t = a * Math.PI / 180;
        return projectCirclePoint(Math.cos(t) * Math.cos(lon), Math.sin(t), Math.cos(t) * Math.sin(lon));
      });
      guides.append("path")
        .attr("class", "orbital-longitude")
        .attr("d", d3.line().x(d => d.px).y(d => d.py)(pts));
    });
  }

  function draw() {
    root.selectAll("*").remove();
    drawGuide();

    const projectedNodes = nodes.map(rotatePoint);
    const projectedByName = new Map(projectedNodes.map(d => [d.speaker, d]));

    const projectedEdges = edges.map(e => {
      const s = projectedByName.get(e.source);
      const t = projectedByName.get(e.target);
      return {...e, s, t, depth: ((s?.rz || 0) + (t?.rz || 0)) / 2};
    }).filter(e => e.s && e.t).sort((a,b) => a.depth - b.depth);

    root.append("g")
      .selectAll("line")
      .data(projectedEdges)
      .join("line")
      .attr("class", "orbital-link")
      .attr("x1", d => d.s.px)
      .attr("y1", d => d.s.py)
      .attr("x2", d => d.t.px)
      .attr("y2", d => d.t.py)
      .attr("stroke-width", d => edgeScale(d.weight) * Math.max(0.45, (d.depth + 1.25) / 2.25))
      .attr("stroke", d => (d.source === state.character || d.target === state.character) ? "rgba(140,255,195,.82)" : "rgba(96,240,255,.34)")
      .attr("opacity", d => Math.max(0.08, Math.min(0.78, (d.depth + 1.18) / 2.18)))
      .on("mousemove", (event, d) => showTooltip(event, `<strong>${d.source} ↔ ${d.target}</strong><br>Interaction weight: ${fmt(d.weight)}<br>${state.season === "All" ? "All seasons" : `Season ${state.season}`}<br>Depth: ${d.depth > 0 ? "front" : "back"}`))
      .on("mouseleave", hideTooltip);

    const frontToBack = projectedNodes.slice().sort((a,b) => a.rz - b.rz);

    const nodeG = root.append("g")
      .selectAll("g")
      .data(frontToBack)
      .join("g")
      .attr("transform", d => `translate(${d.px},${d.py})`)
      .style("opacity", d => Math.max(0.34, Math.min(1, (d.rz + 1.55) / 2.2)))
      .on("click", (_, d) => {
        state.character = d.speaker;
        d3.select("#characterSelect").property("value", state.character);
        renderAll();
        if (state.popout) renderPopout();
      })
      .on("mousemove", (event, d) => showTooltip(event, `<strong>${d.speaker}</strong><br>Network weight: ${fmt(d.weight || 0)}<br>${d.rz > 0 ? "Front hemisphere" : "Back hemisphere"}`))
      .on("mouseleave", hideTooltip);

    nodeG.append("circle")
      .attr("class", "orbital-node")
      .attr("r", d => nodeScale(d.weight) * d.scale)
      .attr("fill", d => CAST_COLORS.get(d.speaker))
      .attr("stroke-width", d => d.speaker === state.character ? 3 : 1.2);

    nodeG.append("text")
      .attr("class", "orbital-label")
      .attr("y", d => -nodeScale(d.weight) * d.scale - 7)
      .attr("text-anchor", "middle")
      .attr("fill", d => d.speaker === state.character ? "#8cffc3" : "rgba(238,250,255,.82)")
      .style("font-size", d => `${Math.max(10, 11 * d.scale)}px`)
      .text(d => d.speaker);
  }

  const drag = d3.drag()
    .on("start", () => { auto = false; })
    .on("drag", (event) => {
      rotY += event.dx * 0.008;
      rotX -= event.dy * 0.008;
      rotX = Math.max(-1.25, Math.min(1.25, rotX));
      draw();
    });

  svg.call(drag);

  draw();

  if (!state.popout) {
    // A short settling spin gives the orbital mode life without becoming distracting.
    let frames = 0;
    const spin = d3.timer(() => {
      if (!auto || state.networkMode !== "orbital" || state.popout) {
        spin.stop();
        return;
      }
      rotY += 0.004;
      draw();
      frames += 1;
      if (frames > 420) spin.stop();
    });
  }
}

const POPOUT_META = {
  networkGraph: {
    title: "Interaction Graph",
    subtitle: "Expanded force-directed view of adjacent-speaker interaction weight across the main cast."
  },
  interactionMatrix: {
    title: "Interaction Matrix",
    subtitle: "Expanded pairwise grid for reading weighted dialogue proximity without network clutter."
  },
  wordBubble: {
    title: "Lexical Fingerprint",
    subtitle: "Expanded bubble cloud of the selected character’s most frequent terms."
  },
  phraseChart: {
    title: "Phrase Tracker",
    subtitle: "Expanded search timeline showing phrase frequency across seasons and top speakers."
  }
};

function openPopout(id) {
  state.popout = id;
  const meta = POPOUT_META[id] || {title: "Expanded View", subtitle: "Focused chart inspection mode."};
  d3.select("#popoutTitle").text(meta.title);
  d3.select("#popoutSubtitle").text(meta.subtitle);
  d3.select("#popoutControls").text(`${state.character} · ${state.season === "All" ? "All seasons" : `Season ${state.season}`} · ${labelMetric(state.metric)}`);
  d3.select("#popoutOverlay").classed("open", true).attr("aria-hidden", "false");
  d3.select("body").style("overflow", "hidden");
  renderPopout();
}

function closePopout() {
  state.popout = null;
  d3.select("#popoutOverlay").classed("open", false).attr("aria-hidden", "true");
  d3.select("body").style("overflow", null);
  clearSvg("#popoutSvg");
}

function renderPopout() {
  if (!state.popout) return;
  clearSvg("#popoutSvg");
  d3.select("#popoutControls").text(`${state.character} · ${state.season === "All" ? "All seasons" : `Season ${state.season}`} · ${labelMetric(state.metric)}`);
  if (state.popout === "networkGraph") renderNetworkGraph();
  if (state.popout === "interactionMatrix") renderInteractionMatrix();
  if (state.popout === "wordBubble") renderWordBubble();
  if (state.popout === "phraseChart") renderPhraseTracker();
}

init();
