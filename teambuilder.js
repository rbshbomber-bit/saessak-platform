// Agent Studio Hub - project-driven UI with dispatch to Claude Code CLI
const lobby = document.querySelector("#lobby");
const studioCards = document.querySelector("#studio-cards");
const studioShell = document.querySelector("#studio-shell");
const office = document.querySelector("#office");
const studioVideo = document.querySelector("#studio-video");
const studioVideoFade = document.querySelector("#studio-video-fade");
const hotspotLayer = document.querySelector("#hotspot-layer");
const videoSelected = document.querySelector("#video-selected");
const videoMiniPipeline = document.querySelector("#video-mini-pipeline");
const agentList = document.querySelector("#agent-list");
const eventLog = document.querySelector("#event-log");
const lastUpdated = document.querySelector("#last-updated");
const resetButton = document.querySelector("#reset-button");
const backButton = document.querySelector("#back-button");
const characterDock = document.querySelector("#character-dock");
const selectedProfile = document.querySelector("#selected-profile");
const pipelineList = document.querySelector("#pipeline-list");
const pipelineStrip = document.querySelector("#pipeline-strip");
const sceneTitle = document.querySelector("#scene-title");
const studioEyebrow = document.querySelector("#studio-eyebrow");
const studioTitle = document.querySelector("#studio-title");
const selectedHeading = document.querySelector("#selected-heading");
const pipelineHeading = document.querySelector("#pipeline-heading");
const crewHeading = document.querySelector("#crew-heading");
const logHeading = document.querySelector("#log-heading");
const logPanelDetails = document.querySelector("#log-panel-details");
const accountName = document.querySelector("#account-name");
const accountCredits = document.querySelector("#account-credits");
const topbarCredits = document.querySelector("#topbar-credits");
const devTopupButton = document.querySelector("#dev-topup-button");
const teamEditButton = document.querySelector("#team-edit-button");
const toggleBuilderButton = document.querySelector("#toggle-builder-button");
const studioBuilderForm = document.querySelector("#studio-builder-form");
const studioTitleInput = document.querySelector("#studio-title-input");
const studioSubtitleInput = document.querySelector("#studio-subtitle-input");
const studioSummaryInput = document.querySelector("#studio-summary-input");
const studioAgentsInput = document.querySelector("#studio-agents-input");
const builderStatus = document.querySelector("#builder-status");
const planGrid = document.querySelector("#plan-grid");
const operationTable = document.querySelector("#operation-table");
const pricingKrwButton = document.querySelector("#pricing-krw-button");
const pricingUsdButton = document.querySelector("#pricing-usd-button");
const councilMode = document.querySelector("#council-mode");
const councilQuestion = document.querySelector("#council-question");
const councilContext = document.querySelector("#council-context");
const councilRun = document.querySelector("#council-run");
const councilStatus = document.querySelector("#council-status");
const councilResults = document.querySelector("#council-results");
const councilQuickButtons = document.querySelectorAll("[data-council-question]");
const toolpackList = document.querySelector("#toolpack-list");
const toolpackToggleButton = document.querySelector("#toolpack-toggle-button");
const toolpackDrawer = document.querySelector("#toolpack-drawer");
const toolpackDrawerClose = document.querySelector("#toolpack-drawer-close");
const toolpackDrawerList = document.querySelector("#toolpack-drawer-list");

// Brief drawer
const briefDrawer = document.querySelector("#brief-drawer");
const briefEyebrow = document.querySelector("#brief-eyebrow");
const briefName = document.querySelector("#brief-name");
const briefSpecialty = document.querySelector("#brief-specialty");
const briefInput = document.querySelector("#brief-input");
const briefSubmit = document.querySelector("#brief-submit");
const briefStatus = document.querySelector("#brief-status");
const briefFeed = document.querySelector("#brief-feed");
const briefClose = document.querySelector("#brief-close");
const briefHead = document.querySelector(".brief-head");
const estimatedCredits = document.querySelector("#estimated-credits");
const balanceAfter = document.querySelector("#balance-after");
const teamEditor = document.querySelector("#team-editor");
const teamEditorList = document.querySelector("#team-editor-list");
const teamEditorClose = document.querySelector("#team-editor-close");
const teamEditorHead = document.querySelector("#team-editor .team-editor-head");
const addAgentButton = document.querySelector("#add-agent-button");
const saveTeamButton = document.querySelector("#save-team-button");
const teamEditorStatus = document.querySelector("#team-editor-status");

const VIDEO_PLAYBACK_RATE = 1.0;
let projects = [];
let accountState = null;
let pricingState = null;
let toolpackState = { packs: [] };
let pricingCurrency = "krw";
let activeProject = null;
let selectedAgentId = null;
let editingHotspotAgentId = null;
let draggingHotspot = null;
let videoLoopStart = 1;
let videoCrossfadeRunning = false;
let eventsTimer = null;
let costTimer = null;
const query = new URLSearchParams(window.location.search);
// 새싹매치 기본 동작:
//   - URL에 아무 파라미터 없어도 자동으로 saessak-match 스튜디오로 직진(로비 스킵).
//   - ?lobby=1 로 들어오면 로비를 보여줌(디버그/개발용).
const showLobbyMode = query.get("lobby") === "1";
const initialStudioId = query.get("studio") || query.get("project") || (showLobbyMode ? null : "saessak-match");
const embedMode = !showLobbyMode; // 기본 임베드 모드 ON → 뒤로 버튼 = "← 새싹매치"

// ── Utilities ──────────────────────────────────────────────────────
// HTML escape
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

// 메시지 안의 경로를 클릭 가능한 링크로 변환
function linkifyPaths(message) {
  const escaped = escapeHtml(message);
  const pathRe = /(\/Users\/[^\s'"<>]+|(?:projects|outputs|public|scripts|data|briefs|tts|clips|ai_images)\/[^\s'"<>]+)/g;
  return escaped.replace(pathRe, (m) => {
    const trimmed = m.replace(/[.,;:!?)\]]+$/, "");
    const trailing = m.slice(trimmed.length);
    return `<a href="#" class="path-link" data-path="${trimmed}" title="클릭: Finder에서 열기">${trimmed}</a>${trailing}`;
  });
}

// 클릭 시 macOS open 호출 (Finder reveal)
function showToast(msg, kind = "info") {
  let host = document.querySelector("#toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    host.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;";
    document.body.appendChild(host);
  }
  const t = document.createElement("div");
  const bg = kind === "error" ? "#7a1f1f" : (kind === "success" ? "#1f5a2f" : "#1f2a38");
  t.style.cssText = `background:${bg};color:#fff;padding:10px 16px;border-radius:8px;font-size:13px;max-width:560px;box-shadow:0 4px 18px rgba(0,0,0,0.4);pointer-events:auto;opacity:0;transition:opacity .2s;`;
  t.textContent = msg;
  host.appendChild(t);
  requestAnimationFrame(() => { t.style.opacity = "1"; });
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 250); }, 3500);
}

function makeDraggablePanel(panel, handle, options = {}) {
  if (!panel || !handle) return;
  let drag = null;
  const margin = options.margin ?? 8;
  const isInteractive = (target) => !!target.closest("button, input, textarea, select, a, label");

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || isInteractive(event.target)) return;
    const rect = panel.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    panel.style.transform = "none";
    panel.classList.add("is-dragging");
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  const moveDrag = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const maxLeft = window.innerWidth - drag.width - margin;
    const maxTop = window.innerHeight - drag.height - margin;
    const nextLeft = Math.max(margin, Math.min(maxLeft, drag.left + event.clientX - drag.startX));
    const nextTop = Math.max(margin, Math.min(maxTop, drag.top + event.clientY - drag.startY));
    panel.style.left = `${nextLeft}px`;
    panel.style.top = `${nextTop}px`;
  };

  const endDrag = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    panel.classList.remove("is-dragging");
    handle.releasePointerCapture?.(event.pointerId);
    drag = null;
  };
  handle.addEventListener("pointermove", moveDrag);
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function pointToHotspotPercent(event) {
  const rect = hotspotLayer.getBoundingClientRect();
  return {
    x: clampPercent(((event.clientX - rect.left) / rect.width) * 100),
    y: clampPercent(((event.clientY - rect.top) / rect.height) * 100)
  };
}

document.addEventListener("click", async (e) => {
  const link = e.target.closest(".path-link");
  if (!link) return;
  e.preventDefault();
  const path = link.dataset.path;
  link.style.opacity = "0.5";
  try {
    const resp = await fetch("/api/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, reveal: true })
    });
    let data = {};
    try { data = await resp.json(); } catch {}
    if (resp.status === 404 && (data.error || "").includes("Not found")) {
      showToast("서버에 /api/open 엔드포인트가 없습니다. 서버를 재시작해 주세요 (restart-server.command).", "error");
    } else if (!resp.ok || !data.ok) {
      const reason = data.error || `HTTP ${resp.status}`;
      showToast(`열기 실패: ${reason}`, "error");
      link.title = `열기 실패: ${reason}`;
      link.style.color = "#ff7474";
    } else {
      showToast(`Finder 열림: ${path.split("/").pop() || path}`, "success");
    }
  } catch (err) {
    console.error("open error:", err);
    showToast(`네트워크 오류: ${err.message}`, "error");
  } finally {
    setTimeout(() => { link.style.opacity = "1"; }, 300);
  }
});

// 영상 없는 모드(그라데이션)에서 핀을 자연스러운 그리드로 자동 배치
function gridHotspots(agents) {
  const n = agents.length;
  if (n === 0) return agents;
  const cols = n <= 4 ? n : (n <= 6 ? 3 : 4);
  const rows = Math.ceil(n / cols);
  // 좌우 패딩 12%, 상하 패딩 28%~72% 사이 분포
  const xPadding = 12;
  const xRange = 100 - xPadding * 2;
  const yStart = rows === 1 ? 50 : 32;
  const yEnd   = rows === 1 ? 50 : 72;
  const yStep  = rows === 1 ? 0 : (yEnd - yStart) / (rows - 1);
  return agents.map((a, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const colsInRow = (r === rows - 1) ? (n - r * cols) : cols;
    const xStep = colsInRow === 1 ? 0 : xRange / (colsInRow - 1);
    const x = colsInRow === 1 ? 50 : (xPadding + c * xStep);
    const y = yStart + r * yStep;
    return { ...a, hotspot: { x, y } };
  });
}

function timeAgo(value) {
  if (!value) return "방금 전";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 5) return "방금 전";
  if (seconds < 60) return `${seconds}s 전`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m 전`;
  return `${Math.round(minutes / 60)}h 전`;
}

function setProjectAccent(accent) {
  document.documentElement.style.setProperty("--accent", accent);
  office.style.setProperty("--studio-accent", accent);
}

async function loadAccount() {
  try {
    const resp = await fetch("/api/me");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    accountState = await resp.json();
    renderAccount();
  } catch (e) {
    console.warn("Failed to load /api/me", e);
    accountState = null;
  }
}

function renderAccount() {
  const balance = accountState?.credits?.balance;
  const unlimited = !!accountState?.credits?.unlimited;
  if (accountName) accountName.textContent = accountState?.user?.name || "Demo Founder";
  if (accountCredits) accountCredits.textContent = unlimited ? "무제한" : (Number.isFinite(balance) ? balance : "—");
  if (topbarCredits) topbarCredits.textContent = unlimited ? "무제한" : (Number.isFinite(balance) ? balance : "—");
  if (devTopupButton) devTopupButton.hidden = unlimited;
}

async function loadPricing() {
  try {
    const resp = await fetch("/api/pricing");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    pricingState = await resp.json();
    renderPricing();
  } catch (e) {
    console.warn("Failed to load /api/pricing", e);
  }
}

async function loadToolpacks() {
  try {
    const resp = await fetch("/api/toolpacks");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    toolpackState = await resp.json();
    renderToolpacks();
  } catch (e) {
    console.warn("Failed to load /api/toolpacks", e);
    toolpackState = { packs: [] };
  }
}

async function loadCouncilStatus() {
  if (!councilMode) return;
  try {
    const resp = await fetch("/api/council/status");
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || resp.status);
    councilMode.textContent = data.mode === "local" ? "실제 회의" : "연습 모드";
    councilMode.classList.toggle("is-live", data.mode === "local");
  } catch (err) {
    councilMode.textContent = "상태 확인 실패";
  }
}

function renderCouncilResult(data) {
  if (!councilResults) return;
  const blocks = [
    ["Claude", "claude", data.claude],
    ["Codex", "codex", data.codex],
    ["정리", "director", data.director]
  ];
  councilResults.innerHTML = blocks.map(([title, kind, body]) => `
    <article class="council-message council-${kind}">
      <strong>${title}</strong>
      <p>${escapeHtml(body || "").replace(/\n/g, "<br>")}</p>
    </article>
  `).join("");
}

function formatMoney(amount, currency) {
  if (currency === "usd") return `$${Number(amount).toLocaleString("en-US")}`;
  return `₩${Number(amount).toLocaleString("ko-KR")}`;
}

function renderPricing() {
  if (!pricingState || !planGrid || !operationTable) return;
  pricingKrwButton?.classList.toggle("selected", pricingCurrency === "krw");
  pricingUsdButton?.classList.toggle("selected", pricingCurrency === "usd");
  planGrid.innerHTML = pricingState.plans.map((plan) => `
    <article class="plan-card">
      <span>${escapeHtml(plan.audience)}</span>
      <strong>${escapeHtml(plan.name)}</strong>
      <em>${formatMoney(plan.monthly[pricingCurrency], pricingCurrency)} / 월</em>
      <p>${Number(plan.credits).toLocaleString("ko-KR")} credits · ${plan.studioLimit} studios · ${plan.seats} seats</p>
      <small>${plan.features.map(escapeHtml).join(" · ")}</small>
    </article>
  `).join("");
  operationTable.innerHTML = `
    <div class="operation-row operation-head">
      <span>작업</span><span>단위</span><span>차감</span>
    </div>
    ${pricingState.operations.map((op) => `
      <div class="operation-row">
        <span>${escapeHtml(op.name)}</span>
        <span>${op.variable ? `${op.minSeconds || 1}s 최소 / ${escapeHtml(op.unit)}` : escapeHtml(op.unit)}</span>
        <strong>${op.credits} credits${op.variable ? " / sec" : ""}</strong>
      </div>
    `).join("")}
  `;
}

function renderToolpacksInto(container) {
  if (!container) return;
  const packs = toolpackState?.packs || [];
  if (!packs.length) {
    container.innerHTML = `<div class="output-empty">사용 가능한 도구팩이 없습니다.</div>`;
    return;
  }
  const injected = new Set((activeProject?.toolpacks || []).map((item) => item.id));
  container.innerHTML = packs.map((pack) => {
    const installed = pack.state === "active" || injected.has(pack.id);
    return `
      <article class="toolpack-card" style="--pack-color:${escapeHtml(pack.accent || "#6ee7ff")}">
        <div>
          <span>${escapeHtml(pack.category || "Pack")}</span>
          <strong>${escapeHtml(pack.name)}</strong>
          <p>${escapeHtml(pack.summary)}</p>
          <small>${(pack.agents || []).map(escapeHtml).join(" · ")}</small>
        </div>
        <button type="button" data-pack-id="${escapeHtml(pack.id)}" ${!activeProject || installed ? "disabled" : ""}>
          ${installed ? "연결됨" : "적용"}
        </button>
      </article>
    `;
  }).join("");
}

function renderToolpacks() {
  renderToolpacksInto(toolpackList);
  renderToolpacksInto(toolpackDrawerList);
}

async function injectToolpack(packId) {
  if (!activeProject || !packId) return;
  const button = toolpackList?.querySelector(`[data-pack-id="${CSS.escape(packId)}"]`);
  if (button) {
    button.disabled = true;
    button.textContent = "적용 중";
  }
  try {
    const resp = await fetch(`/api/projects/${encodeURIComponent(activeProject.id)}/toolpacks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || resp.status);
    activeProject = data.project;
    projects = projects.map((project) => project.id === activeProject.id ? activeProject : project);
    renderToolpacks();
    renderLobby();
    await pollEvents();
    await loadOutputs();
    showToast(`${data.pack.name} 연결 확인 완료`, "success");
  } catch (err) {
    showToast(`기능 적용 확인 실패: ${err.message}`, "error");
    renderToolpacks();
  }
}

function openToolpackDrawer() {
  if (!activeProject) {
    showToast("먼저 스튜디오에 입장해주세요", "error");
    return;
  }
  renderToolpacks();
  toolpackDrawer?.classList.remove("is-hidden");
}

function closeToolpackDrawer() {
  toolpackDrawer?.classList.add("is-hidden");
}

async function refreshCostPreview() {
  if (!activeProject || !selectedAgentId || !estimatedCredits || !balanceAfter) return;
  const brief = briefInput.value.trim();
  try {
    const resp = await fetch("/api/dispatch-cost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: activeProject.id, agent: selectedAgentId, brief })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || resp.status);
    estimatedCredits.textContent = data.unlimited ? `관리자 무제한` : `${data.estimatedCredits} credits`;
    balanceAfter.textContent = data.unlimited
      ? `예상 사용량 ${data.displayCredits || 0} credits · 차감 없음`
      : (data.canRun ? `실행 후 ${data.balanceAfter} 남음` : `부족: ${Math.abs(data.balanceAfter)} credits`);
    balanceAfter.classList.toggle("is-danger", !data.canRun);
    briefSubmit.disabled = !data.canRun;
  } catch (e) {
    estimatedCredits.textContent = "계산 실패";
    balanceAfter.textContent = e.message;
    balanceAfter.classList.add("is-danger");
  }
}

function toggleBuilder(forceOpen) {
  if (!studioBuilderForm) return;
  const open = typeof forceOpen === "boolean" ? forceOpen : studioBuilderForm.classList.contains("is-collapsed");
  studioBuilderForm.classList.toggle("is-collapsed", !open);
  if (toggleBuilderButton) toggleBuilderButton.textContent = open ? "닫기" : "열기";
  if (open) studioTitleInput?.focus();
}

function scheduleCostPreview() {
  clearTimeout(costTimer);
  costTimer = setTimeout(refreshCostPreview, 220);
}

function cloneAgentsForEdit() {
  return (activeProject?.agents || []).map((agent) => ({
    id: agent.id,
    name: agent.name,
    title: agent.title,
    specialty: agent.specialty,
    color: agent.color,
    hotspot: {
      x: Number(agent.hotspot?.x ?? 50),
      y: Number(agent.hotspot?.y ?? 15)
    }
  }));
}

function renderTeamEditor() {
  if (!teamEditorList || !activeProject) return;
  teamEditorList.innerHTML = "";
  for (const agent of activeProject.agents) {
    const row = document.createElement("article");
    row.className = "team-agent-row";
    row.classList.toggle("is-positioning", editingHotspotAgentId === agent.id);
    row.dataset.agentId = agent.id;
    row.innerHTML = `
      <div class="team-agent-main">
        <label>이름<input data-field="name" value="${escapeHtml(agent.name)}"></label>
        <label>역할<input data-field="title" value="${escapeHtml(agent.title)}"></label>
      </div>
      <label>전문성<textarea data-field="specialty" rows="2">${escapeHtml(agent.specialty)}</textarea></label>
      <div class="team-agent-meta">
        <label>색상<input data-field="color" type="color" value="${escapeHtml(agent.color || "#6ee7ff")}"></label>
        <label>X<input data-field="x" type="number" min="0" max="100" step="0.1" value="${Number(agent.hotspot?.x ?? 50).toFixed(1)}"></label>
        <label>Y<input data-field="y" type="number" min="0" max="100" step="0.1" value="${Number(agent.hotspot?.y ?? 15).toFixed(1)}"></label>
        <button type="button" data-action="position">${editingHotspotAgentId === agent.id ? "위치 지정 중" : "위치 지정"}</button>
        <button type="button" data-action="remove">삭제</button>
      </div>
    `;
    teamEditorList.appendChild(row);
  }
}

function syncTeamEditorToProject() {
  if (!teamEditorList || !activeProject) return;
  const rows = [...teamEditorList.querySelectorAll(".team-agent-row")];
  activeProject.agents = rows.map((row, index) => {
    const previous = activeProject.agents.find((agent) => agent.id === row.dataset.agentId) || {};
    const name = row.querySelector('[data-field="name"]').value.trim() || `Agent ${index + 1}`;
    const id = previous.id || `agent-${index + 1}`;
    const x = Number(row.querySelector('[data-field="x"]').value);
    const y = Number(row.querySelector('[data-field="y"]').value);
    return {
      id,
      name,
      title: row.querySelector('[data-field="title"]').value.trim() || "전문 에이전트",
      specialty: row.querySelector('[data-field="specialty"]').value.trim() || "사용자 브리프를 받아 산출물을 만든다",
      color: row.querySelector('[data-field="color"]').value || previous.color || "#6ee7ff",
      hotspot: {
        x: Math.max(0, Math.min(100, Number.isFinite(x) ? x : 50)),
        y: Math.max(0, Math.min(100, Number.isFinite(y) ? y : 15))
      }
    };
  });
  if (!activeProject.agents.find((agent) => agent.id === selectedAgentId)) {
    selectedAgentId = activeProject.agents[0]?.id || null;
  }
}

function openTeamEditor() {
  if (!activeProject || !teamEditor) return;
  editingHotspotAgentId = selectedAgentId;
  teamEditor.classList.remove("is-hidden");
  renderTeamEditor();
  if (teamEditorStatus) teamEditorStatus.textContent = "위치 지정할 팀원을 선택하세요";
  document.body.classList.add("is-editing-team");
}

function closeTeamEditor() {
  teamEditor?.classList.add("is-hidden");
  editingHotspotAgentId = null;
  document.body.classList.remove("is-editing-team");
}

function setEditorHotspot(agentId, x, y, options = {}) {
  const row = teamEditorList?.querySelector(`.team-agent-row[data-agent-id="${CSS.escape(agentId)}"]`);
  const agent = activeProject?.agents.find((item) => item.id === agentId);
  if (!agent) return;
  const safeX = clampPercent(x);
  const safeY = clampPercent(y);
  row?.querySelector('[data-field="x"]') && (row.querySelector('[data-field="x"]').value = safeX.toFixed(1));
  row?.querySelector('[data-field="y"]') && (row.querySelector('[data-field="y"]').value = safeY.toFixed(1));
  agent.hotspot = { x: safeX, y: safeY };
  const hotspot = hotspotLayer?.querySelector(`.video-hotspot[data-agent-id="${CSS.escape(agentId)}"]`);
  if (hotspot) {
    hotspot.style.left = `${safeX}%`;
    hotspot.style.top = `${safeY}%`;
    hotspot.classList.toggle("menu-hotspot", safeY <= 18);
  }
  if (options.render !== false) {
    renderProject();
    renderTeamEditor();
  }
}

function beginHotspotDrag(event, agent) {
  if (!hotspotLayer || event.button !== 0) return;
  const hotspot = event.currentTarget;
  const startX = event.clientX;
  const startY = event.clientY;
  let moved = false;
  draggingHotspot = {
    pointerId: event.pointerId,
    agentId: agent.id
  };
  selectedAgentId = agent.id;
  editingHotspotAgentId = agent.id;
  hotspot.classList.add("is-dragging");
  document.body.classList.add("is-dragging-hotspot");
  hotspot.setPointerCapture?.(event.pointerId);
  event.preventDefault();

  const moveHotspot = (moveEvent) => {
    if (!draggingHotspot || draggingHotspot.pointerId !== moveEvent.pointerId) return;
    const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
    if (distance > 2) moved = true;
    if (!moved) return;
    const next = pointToHotspotPercent(moveEvent);
    setEditorHotspot(agent.id, next.x, next.y, { render: false });
    if (teamEditorStatus && teamEditor && !teamEditor.classList.contains("is-hidden")) {
      teamEditorStatus.textContent = `${agent.name} 위치 ${next.x.toFixed(1)}, ${next.y.toFixed(1)} 이동 중`;
    }
  };

  const endHotspot = (upEvent) => {
    if (!draggingHotspot || draggingHotspot.pointerId !== upEvent.pointerId) return;
    hotspot.classList.remove("is-dragging");
    document.body.classList.remove("is-dragging-hotspot");
    hotspot.releasePointerCapture?.(upEvent.pointerId);
    window.removeEventListener("pointermove", moveHotspot);
    window.removeEventListener("pointerup", endHotspot);
    window.removeEventListener("pointercancel", endHotspot);
    draggingHotspot = null;
    if (moved) {
      renderProject();
      if (teamEditor && !teamEditor.classList.contains("is-hidden")) {
        renderTeamEditor();
        if (teamEditorStatus) teamEditorStatus.textContent = `${agent.name} 위치 이동 완료. 저장을 누르세요`;
      } else {
        showToast("위치를 바꿨어요. 팀 편집에서 저장하면 유지됩니다.", "info");
      }
      return;
    }
    selectAgent(agent.id, { openBrief: true });
  };

  window.addEventListener("pointermove", moveHotspot);
  window.addEventListener("pointerup", endHotspot);
  window.addEventListener("pointercancel", endHotspot);
}

// ── Lobby ───────────────────────────────────────────────────────────
async function loadProjects() {
  try {
    const resp = await fetch("/api/projects");
    const data = await resp.json();
    projects = data.projects || [];
  } catch (e) {
    console.warn("Failed to load /api/projects", e);
    projects = [];
  }
  renderLobby();
}

function deriveProjectStatus(project) {
  const m = project.meta || {};
  if (typeof m.status === "string") return m.status;
  if (typeof m.stage === "string") return m.stage;
  const s = (project.summary || "") + " " + (project.subtitle || "");
  if (/라이브|운영 중|운영중/.test(s)) return "라이브";
  if (/기획|리서치/.test(s)) return "기획";
  if (/개발|구현|포팅/.test(s)) return "개발";
  return "진행 중";
}

function renderLobby() {
  studioCards.innerHTML = "";
  for (const project of projects) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "studio-card";
    card.style.setProperty("--studio-accent", project.accent);
    const status = deriveProjectStatus(project);
    const subtitle = project.subtitle || "";
    card.innerHTML = `
      <span class="studio-card-status">
        <span class="studio-card-dot" aria-hidden="true"></span>
        <span class="studio-card-status-text">${status}</span>
      </span>
      <strong class="studio-card-title">${project.title}</strong>
      <span class="studio-card-sub">${subtitle}</span>
      <em class="studio-card-enter">입장하기</em>
    `;
    card.addEventListener("click", () => enterProject(project.id));
    studioCards.appendChild(card);
  }
}

function applyEmbedMode() {
  document.body.classList.toggle("embed-mode", embedMode);
  if (embedMode && backButton) backButton.textContent = "← 새싹매치";
}

// ── Studio entry ───────────────────────────────────────────────────
function enterProject(projectId) {
  const project = projects.find((p) => p.id === projectId);
  if (!project) return;
  activeProject = project;
  selectedAgentId = project.agents[0]?.id || null;
  localStorage.setItem("agentStudio.activeProject", projectId);
  if (window.location.search) {
    const next = new URL(window.location.href);
    next.searchParams.set("studio", projectId);
    if (embedMode) next.searchParams.set("embed", "1");
    window.history.replaceState({}, "", next);
  }

  lobby.classList.add("is-hidden");
  studioShell.classList.remove("is-hidden");
  document.body.dataset.studio = projectId;

  applyProjectChrome();
  renderProject();
  renderToolpacks();
  startEventsPolling();
}

function showLobby() {
  if (embedMode && initialStudioId) {
    window.location.href = "index.html";
    return;
  }
  activeProject = null;
  stopEventsPolling();
  hideBriefDrawer();
  closeTeamEditor();
  localStorage.removeItem("agentStudio.activeProject");
  studioShell.classList.add("is-hidden");
  lobby.classList.remove("is-hidden");
  document.body.removeAttribute("data-studio");
  document.body.classList.remove("video-studio");
  office.classList.remove("has-video", "has-bg-gradient");
  renderToolpacks();
}

function applyProjectChrome() {
  const p = activeProject;
  studioEyebrow.textContent = p.subtitle || "";
  studioTitle.textContent = p.title;
  selectedHeading.textContent = "선택한 에이전트";
  pipelineHeading.textContent = "최근 산출물";
  crewHeading.textContent = "Crew";
  logHeading.textContent = "이벤트 로그";

  setProjectAccent(p.accent);
  pipelineStrip.innerHTML = "";

  const isVideo = p.background?.type === "video";
  document.body.classList.toggle("video-studio", isVideo);
  office.classList.toggle("has-video", isVideo);
  office.classList.toggle("has-bg-gradient", !isVideo);

  if (isVideo) {
    if (studioVideo.getAttribute("src") !== p.background.src) {
      studioVideo.src = p.background.src;
      studioVideoFade.src = p.background.src;
      studioVideo.addEventListener("loadedmetadata", () => {
        if (studioVideo.duration > videoLoopStart + 1) studioVideo.currentTime = videoLoopStart;
      }, { once: true });
      studioVideoFade.addEventListener("loadedmetadata", () => {
        if (studioVideoFade.duration > videoLoopStart + 1) studioVideoFade.currentTime = videoLoopStart;
      }, { once: true });
    }
    studioVideo.playbackRate = VIDEO_PLAYBACK_RATE;
    studioVideoFade.playbackRate = VIDEO_PLAYBACK_RATE;
    studioVideo.play().catch(() => {});
  } else {
    studioVideo.removeAttribute("src"); studioVideoFade.removeAttribute("src");
    studioVideo.load(); studioVideoFade.load();
    office.style.setProperty("--studio-bg", p.background?.src || "linear-gradient(135deg,#1a2030,#0f131c)");
  }
}

// ── Render hotspots and crew panel ─────────────────────────────────
function renderProject() {
  hotspotLayer.innerHTML = "";
  agentList.innerHTML = "";
  characterDock.innerHTML = "";

  // 영상이 없을 때만 핀을 그리드로 자동 배치한다.
  // 대체 영상이 붙은 페이지도 manifest 좌표를 우선 사용해야 전체 스튜디오 좌표 규칙이 유지된다.
  const useGrid = activeProject.background?.type !== "video";
  const agentsForRender = useGrid ? gridHotspots(activeProject.agents) : activeProject.agents;

  for (const agent of agentsForRender) {
    if (agent.hotspot) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "video-hotspot";
      button.dataset.agentId = agent.id;
      button.title = `${agent.name} 위치 손잡이`;
      button.classList.toggle("selected", agent.id === selectedAgentId);
      button.classList.toggle("menu-hotspot", agent.hotspot.y <= 18);
      button.style.left = `${agent.hotspot.x}%`;
      button.style.top = `${agent.hotspot.y}%`;
      button.style.setProperty("--card-color", agent.color);
      button.innerHTML = `<span>${agent.name}</span>`;
      button.addEventListener("pointerdown", (event) => beginHotspotDrag(event, agent));
      button.addEventListener("click", (event) => event.preventDefault());
      button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectAgent(agent.id, { openBrief: true });
        }
      });
      hotspotLayer.appendChild(button);
    }

    const card = document.createElement("article");
    card.className = "agent-card";
    card.classList.toggle("selected", agent.id === selectedAgentId);
    card.style.setProperty("--card-color", agent.color);
    card.addEventListener("click", () => selectAgent(agent.id, { openBrief: true }));
    card.innerHTML = `
      <div class="agent-card-header">
        <div>
          <div class="agent-name">${agent.name}</div>
          <div class="agent-role">${agent.title}</div>
        </div>
        <div class="state-badge idle">${agent.specialty?.split(/[·,]/)[0] || ""}</div>
      </div>
      <p class="agent-task">${agent.specialty || ""}</p>
    `;
    agentList.appendChild(card);
  }
  renderSelectedProfile();
  if (!teamEditor?.classList.contains("is-hidden")) renderTeamEditor();
}

function renderSelectedProfile() {
  const agent = activeProject?.agents.find((a) => a.id === selectedAgentId);
  if (!agent) { selectedProfile.innerHTML = ""; return; }
  selectedProfile.style.setProperty("--card-color", agent.color);
  selectedProfile.innerHTML = `
    <div class="profile-character" style="background:linear-gradient(135deg, ${agent.color}, color-mix(in srgb, ${agent.color} 50%, #1a1f2e));"></div>
    <div>
      <div class="profile-name">${agent.name}</div>
      <div class="profile-title">${agent.title}</div>
      <p>${agent.specialty}</p>
      <button class="dispatch-button" id="open-brief-from-profile">이 에이전트에게 작업 시키기 →</button>
    </div>
  `;
  const btn = selectedProfile.querySelector("#open-brief-from-profile");
  if (btn) btn.addEventListener("click", () => showBriefDrawer(agent));

  // Update video overlay (selected agent banner)
  if (activeProject.background?.type === "video") {
    videoSelected.style.setProperty("--card-color", agent.color);
    videoSelected.innerHTML = `<span>${agent.name}</span><strong>${agent.title}</strong><em>${agent.specialty}</em>`;
  } else {
    videoSelected.innerHTML = "";
    videoMiniPipeline.innerHTML = "";
  }
  if (sceneTitle) sceneTitle.textContent = `${agent.name} 대기 중`;
}

function selectAgent(agentId, opts = {}) {
  selectedAgentId = agentId;
  renderProject();
  if (opts.openBrief) {
    const agent = activeProject.agents.find((a) => a.id === agentId);
    if (agent) showBriefDrawer(agent);
  }
}

// ── Brief drawer ───────────────────────────────────────────────────
function showBriefDrawer(agent) {
  briefEyebrow.textContent = agent.name;
  briefName.textContent = agent.title;
  briefSpecialty.textContent = agent.specialty;
  briefDrawer.style.setProperty("--accent", agent.color);
  briefDrawer.classList.remove("is-hidden");
  briefStatus.textContent = "";
  briefStatus.className = "brief-status";
  briefSubmit.disabled = false;
  refreshCostPreview();
  briefInput.focus();
}
function hideBriefDrawer() {
  briefDrawer.classList.add("is-hidden");
  briefInput.value = "";
}

briefClose.addEventListener("click", hideBriefDrawer);
briefInput.addEventListener("input", scheduleCostPreview);

if (devTopupButton) {
  devTopupButton.addEventListener("click", async () => {
    devTopupButton.disabled = true;
    try {
      const resp = await fetch("/api/billing/dev-topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 50 })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || resp.status);
      await loadAccount();
      refreshCostPreview();
      showToast(`개발용 크레딧 +${data.amount} 충전`, "success");
    } catch (err) {
      showToast(`충전 실패: ${err.message}`, "error");
    } finally {
      devTopupButton.disabled = false;
    }
  });
}

if (toggleBuilderButton) {
  toggleBuilderButton.addEventListener("click", () => toggleBuilder());
}

councilRun?.addEventListener("click", async () => {
  const question = councilQuestion?.value.trim() || "";
  const context = councilContext?.value.trim() || "";
  if (!question) {
    if (councilStatus) councilStatus.textContent = "먼저 물어볼 것을 적거나 위 버튼을 눌러주세요";
    councilQuestion?.focus();
    return;
  }
  councilRun.disabled = true;
  if (councilStatus) councilStatus.textContent = "Codex랑 Claude가 얘기 중...";
  try {
    const resp = await fetch("/api/council", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, context })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || data.message || resp.status);
    renderCouncilResult(data);
    if (councilStatus) councilStatus.textContent = data.mode === "local" ? "회의 완료 · 실제 회의" : "회의 완료 · 연습 모드";
  } catch (err) {
    if (councilStatus) councilStatus.textContent = `회의 실패: ${err.message}`;
  } finally {
    councilRun.disabled = false;
  }
});

councilQuickButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (councilQuestion) councilQuestion.value = button.dataset.councilQuestion || "";
    if (councilContext) councilContext.value = button.dataset.councilContext || "";
    if (councilStatus) councilStatus.textContent = "내용 채웠습니다. 회의 시작을 누르세요.";
    councilQuestion?.focus();
  });
});

pricingKrwButton?.addEventListener("click", () => {
  pricingCurrency = "krw";
  renderPricing();
});

pricingUsdButton?.addEventListener("click", () => {
  pricingCurrency = "usd";
  renderPricing();
});

if (studioBuilderForm) {
  studioBuilderForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = studioTitleInput.value.trim();
    if (!title) {
      builderStatus.textContent = "스튜디오 이름을 입력해주세요";
      builderStatus.className = "error";
      studioTitleInput.focus();
      return;
    }
    const submitButton = studioBuilderForm.querySelector("#create-studio-button");
    submitButton.disabled = true;
    builderStatus.textContent = "스튜디오 생성 중...";
    builderStatus.className = "";
    try {
      const resp = await fetch("/api/studios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          subtitle: studioSubtitleInput.value.trim(),
          summary: studioSummaryInput.value.trim(),
          agents: studioAgentsInput.value
        })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || resp.status);
      builderStatus.textContent = `${data.project.title} 생성 완료`;
      builderStatus.className = "ok";
      await loadProjects();
      toggleBuilder(false);
      enterProject(data.project.id);
    } catch (err) {
      builderStatus.textContent = `생성 실패: ${err.message}`;
      builderStatus.className = "error";
    } finally {
      submitButton.disabled = false;
    }
  });
}

teamEditButton?.addEventListener("click", openTeamEditor);
teamEditorClose?.addEventListener("click", closeTeamEditor);
toolpackToggleButton?.addEventListener("click", openToolpackDrawer);
toolpackDrawerClose?.addEventListener("click", closeToolpackDrawer);
makeDraggablePanel(teamEditor, teamEditorHead);
makeDraggablePanel(toolpackDrawer, toolpackDrawer?.querySelector(".team-editor-head"));
makeDraggablePanel(briefDrawer, briefHead);

teamEditorList?.addEventListener("input", (event) => {
  if (!event.target.matches("input, textarea")) return;
  syncTeamEditorToProject();
});

teamEditorList?.addEventListener("change", (event) => {
  if (!event.target.matches("input, textarea")) return;
  syncTeamEditorToProject();
  renderProject();
});

teamEditorList?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest(".team-agent-row");
  if (!row) return;
  if (button.dataset.action === "position") {
    syncTeamEditorToProject();
    editingHotspotAgentId = row.dataset.agentId;
    selectedAgentId = editingHotspotAgentId;
    renderProject();
    if (teamEditorStatus) teamEditorStatus.textContent = `${row.querySelector('[data-field="name"]').value} 위치 지정 중: 화면을 클릭하세요`;
    return;
  }
  if (button.dataset.action === "remove") {
    row.remove();
    syncTeamEditorToProject();
    renderProject();
    if (teamEditorStatus) teamEditorStatus.textContent = "삭제됨. 저장을 눌러 반영하세요";
  }
});

addAgentButton?.addEventListener("click", () => {
  if (!activeProject) return;
  const index = activeProject.agents.length;
  const colors = ["#6ee7ff", "#ff8ab3", "#7ee787", "#c4a3ff", "#f2c66d", "#ff7474", "#8da888", "#ffb86b"];
  activeProject.agents.push({
    id: `agent-${Date.now()}`,
    name: `Agent ${index + 1}`,
    title: "전문 에이전트",
    specialty: "사용자 브리프를 받아 산출물을 만든다",
    color: colors[index % colors.length],
    hotspot: { x: 20 + (index % 6) * 8, y: 15 }
  });
  selectedAgentId = activeProject.agents[index].id;
  editingHotspotAgentId = selectedAgentId;
  renderProject();
});

saveTeamButton?.addEventListener("click", async () => {
  if (!activeProject) return;
  syncTeamEditorToProject();
  saveTeamButton.disabled = true;
  if (teamEditorStatus) teamEditorStatus.textContent = "저장 중...";
  try {
    const resp = await fetch(`/api/projects/${encodeURIComponent(activeProject.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: activeProject.title,
        subtitle: activeProject.subtitle,
        summary: activeProject.summary,
        accent: activeProject.accent,
        agents: activeProject.agents
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || resp.status);
    activeProject = data.project;
    projects = projects.map((project) => project.id === activeProject.id ? activeProject : project);
    selectedAgentId = activeProject.agents.find((agent) => agent.id === selectedAgentId)?.id || activeProject.agents[0]?.id || null;
    renderProject();
    renderLobby();
    if (teamEditorStatus) teamEditorStatus.textContent = "저장 완료";
    showToast("팀 구성이 저장됐습니다", "success");
  } catch (err) {
    if (teamEditorStatus) teamEditorStatus.textContent = `저장 실패: ${err.message}`;
    showToast(`팀 저장 실패: ${err.message}`, "error");
  } finally {
    saveTeamButton.disabled = false;
  }
});

toolpackList?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-pack-id]");
  if (!button) return;
  injectToolpack(button.dataset.packId);
});

toolpackDrawerList?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-pack-id]");
  if (!button) return;
  injectToolpack(button.dataset.packId);
});

hotspotLayer?.addEventListener("click", (event) => {
  if (!editingHotspotAgentId || !activeProject || teamEditor?.classList.contains("is-hidden")) return;
  if (event.target.closest(".video-hotspot")) return;
  const { x, y } = pointToHotspotPercent(event);
  setEditorHotspot(editingHotspotAgentId, x, y);
  if (teamEditorStatus) teamEditorStatus.textContent = `위치 ${x.toFixed(1)}, ${y.toFixed(1)} 지정됨. 저장을 누르세요`;
});

briefSubmit.addEventListener("click", async () => {
  if (!activeProject || !selectedAgentId) return;
  const brief = briefInput.value.trim();
  if (!brief) {
    briefStatus.textContent = "브리프를 입력해주세요";
    briefStatus.className = "brief-status error";
    return;
  }
  briefSubmit.disabled = true;
  briefStatus.textContent = "전송 중…";
  briefStatus.className = "brief-status";
  try {
    const resp = await fetch("/api/dispatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: activeProject.id, agent: selectedAgentId, brief })
    });
    const data = await resp.json();
    if (!resp.ok) {
      briefStatus.textContent = data.message || `에러: ${data.error || resp.status}`;
      briefStatus.className = "brief-status error";
      if (resp.status === 402) await loadAccount();
    } else {
      const chargeText = data.creditsCharged === 0 ? "관리자 무제한 실행" : `${data.creditsCharged} credits 사용 · 잔액 ${data.creditsRemaining}`;
      briefStatus.textContent = `보냄 (${data.requestId.slice(0, 16)}…) · ${chargeText}`;
      briefStatus.className = "brief-status ok";
      if (logPanelDetails) logPanelDetails.open = true;
      briefInput.value = "";
      await loadAccount();
      refreshCostPreview();
      // refresh events immediately
      pollEvents();
    }
  } catch (err) {
    briefStatus.textContent = `네트워크 에러: ${err.message}`;
    briefStatus.className = "brief-status error";
  } finally {
    briefSubmit.disabled = false;
  }
});

// ── Events polling (project events.jsonl) ──────────────────────────
async function pollEvents() {
  if (!activeProject) return;
  try {
    const resp = await fetch(`/api/projects/${activeProject.id}/events`);
    if (!resp.ok) return;
    const data = await resp.json();
    renderEvents(data.events || []);
    if (data.events?.length) {
      lastUpdated.textContent = `Updated ${timeAgo(data.events[data.events.length - 1].time)}`;
    }
  } catch (e) { /* ignore */ }
}

function startEventsPolling() {
  stopEventsPolling();
  pollEvents();
  eventsTimer = setInterval(pollEvents, 1800);
}
function stopEventsPolling() {
  if (eventsTimer) clearInterval(eventsTimer);
  eventsTimer = null;
}

function renderEvents(events) {
  eventLog.innerHTML = "";
  briefFeed.innerHTML = "";
  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "event";
    empty.innerHTML = "<strong>아직 작업 없음</strong><p>핀을 클릭해 브리프를 보내세요.</p>";
    eventLog.appendChild(empty);
    return;
  }
  const sorted = events.slice().reverse(); // newest first
  for (const ev of sorted) {
    const agentMeta = activeProject?.agents.find((a) => a.id === ev.agentId);
    const color = agentMeta?.color || "#56647e";
    const name = agentMeta?.name || ev.agentId || "system";
    const kindLabel = ({ dispatched: "전송", progress: "작업중", done: "완료", error: "에러" })[ev.kind] || ev.kind;

    const node = document.createElement("article");
    node.className = "event";
    node.style.setProperty("--event-color", color);
    const msgFull = ev.message || "";
    const msgHtml = linkifyPaths(msgFull.length > 400 ? msgFull.slice(0, 400) + "…" : msgFull);
    // 프로젝트 출력 폴더 바로가기 (현재 활성 프로젝트가 있을 때만)
    const projectOutputsPath = activeProject ? `projects/${activeProject.id}/outputs` : null;
    const folderBtn = projectOutputsPath
      ? `<a href="#" class="path-link event-folder-btn" data-path="${projectOutputsPath}" title="이 프로젝트 outputs 폴더 열기">📂 출력 폴더</a>`
      : "";
    node.innerHTML = `
      <strong>${name} · ${kindLabel}</strong>
      <p>${msgHtml}</p>
      <div class="event-time-row">
        <span class="event-time">${timeAgo(ev.time)}</span>
        ${folderBtn}
      </div>
    `;
    eventLog.appendChild(node);

    // also push to brief drawer feed
    if (!briefDrawer.classList.contains("is-hidden")) {
      const feed = document.createElement("div");
      feed.className = "feed-item";
      feed.style.setProperty("--feed-color", color);
      const feedMsg = ev.message || "";
      const feedHtml = linkifyPaths(feedMsg.length > 400 ? feedMsg.slice(0, 400) + "…" : feedMsg);
      feed.innerHTML = `<strong>${name} · ${kindLabel}</strong><span class="feed-time">${timeAgo(ev.time)}</span><span class="feed-msg">${feedHtml}</span>`;
      briefFeed.appendChild(feed);
    }
  }
  loadOutputs();
}

async function loadOutputs() {
  if (!activeProject || !pipelineList) return;
  try {
    const resp = await fetch(`/api/projects/${encodeURIComponent(activeProject.id)}/outputs`);
    if (!resp.ok) return;
    const data = await resp.json();
    renderOutputs(data.outputs || data.files || []);
  } catch (err) {
    console.warn("Failed to load outputs", err);
  }
}

function renderOutputs(outputs) {
  pipelineList.innerHTML = "";
  if (!outputs.length) {
    pipelineList.innerHTML = `<div class="output-empty">아직 저장된 산출물이 없습니다.</div>`;
    return;
  }
  for (const output of outputs.slice(0, 8)) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "output-card";
    item.innerHTML = `
      <strong>${escapeHtml(output.title || output.name || output.id)}</strong>
      <span>${escapeHtml(output.summary || output.provider || "")}</span>
      <em>${timeAgo(output.created_at || output.mtime)}</em>
    `;
    item.addEventListener("click", () => openOutput(output.id || (output.name || "").replace(/\.md$/, "")));
    pipelineList.appendChild(item);
  }
}

async function openOutput(outputId) {
  if (!outputId) return;
  try {
    const resp = await fetch(`/api/outputs/${encodeURIComponent(outputId)}`);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || resp.status);
    const output = data.output;
    const w = window.open("", "_blank", "noopener,noreferrer,width=960,height=760");
    if (!w) {
      showToast("팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 열어주세요.", "error");
      return;
    }
    w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(output.title)}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.65;padding:40px;max-width:880px;margin:auto;color:#1f2937}pre{white-space:pre-wrap}h1{font-size:28px}</style></head><body><h1>${escapeHtml(output.title)}</h1><p>${escapeHtml(output.summary || output.provider || "")}</p><pre>${escapeHtml(output.content || "")}</pre></body></html>`);
    w.document.close();
  } catch (err) {
    showToast(`산출물 열기 실패: ${err.message}`, "error");
  }
}

// ── Video crossfade loop (kept from previous version) ──────────────
studioVideo.addEventListener("timeupdate", () => {
  const duration = studioVideo.duration;
  if (!duration || duration <= videoLoopStart + 2 || videoCrossfadeRunning) return;
  if (studioVideo.currentTime > duration - 1.2) {
    videoCrossfadeRunning = true;
    studioVideoFade.currentTime = videoLoopStart;
    studioVideoFade.play().catch(() => {});
    office.classList.add("is-crossfading");
    window.setTimeout(() => {
      studioVideo.currentTime = studioVideoFade.currentTime;
      studioVideo.play().catch(() => {});
      office.classList.remove("is-crossfading");
      studioVideoFade.pause();
      videoCrossfadeRunning = false;
    }, 900);
  }
});

// ── Buttons ─────────────────────────────────────────────────────────
backButton.addEventListener("click", showLobby);
resetButton.addEventListener("click", async () => {
  if (!activeProject) return;
  if (!confirm(`${activeProject.title} 의 이벤트 로그를 지울까요? (산출물 파일은 유지됩니다)`)) return;
  // Currently the server's /api/reset clears legacy data. For per-project clearing we'd add a new endpoint.
  // For now, just refresh.
  pollEvents();
});

// Initial load
Promise.all([loadProjects(), loadAccount(), loadPricing(), loadToolpacks(), loadCouncilStatus()]).then(() => {
  applyEmbedMode();
  const target = initialStudioId || localStorage.getItem("agentStudio.activeProject");
  if (target && projects.find((p) => p.id === target)) enterProject(target);
});
