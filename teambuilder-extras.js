/*
 * teambuilder-extras.js — Agent Studio 룩 위에 새싹매치 전용 기능 추가
 *
 * 추가 기능:
 *   1) 본인 데이터 입력 패널 (item, strength, funding, prototype, targetGrant, field, region, age)
 *   2) "🚀 전체 실행 (60토큰)" 버튼 + 6 에이전트 자동 체인 진행 UI
 *   3) 영상 배경 교체 드롭다운
 *   4) 산출물 다운로드 (.md)
 *   5) brief 텍스트 파일 첨부 (.txt, .md, .json)
 *   6) 모바일 친화 (CSS는 teambuilder-extras.css)
 */
(() => {
  "use strict";

  // ── DOM이 준비되고 teambuilder.js의 초기화가 끝난 후 동작 ──
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      setTimeout(fn, 0);
    }
  }

  // ── 영상 풀 (나중에 더 추가 가능) ──
  const VIDEO_POOL = [
    { id: "saessak-platform", label: "🌊 새싹 스튜디오 (해변)", src: "videos/saessak-platform.mp4" },
    { id: "lobby-bg",        label: "🌅 로비 (석양)",         src: "videos/lobby-bg.mp4" }
  ];

  // ── 본인 데이터 필드 정의 ──
  const USER_DATA_FIELDS = [
    { key: "item",        label: "사업 아이템",      placeholder: "예) 약국용 복약지도 자동화 SaaS",       type: "text"     },
    { key: "strength",    label: "운영자 강점",      placeholder: "예) 어머니 약사 40년 + 현장 1년",       type: "text"     },
    { key: "funding",     label: "자금 상황",        placeholder: "예) 자기자본 보유 + 정부지원 희망",      type: "text"     },
    { key: "prototype",   label: "시제품 유무",      placeholder: "예) MVP 베타 운영 중 / 기획 단계",      type: "text"     },
    { key: "targetGrant", label: "신청 희망 사업",   placeholder: "예) 예비창업패키지, 청년창업사관학교",   type: "text"     },
    { key: "field",       label: "분야",             placeholder: "예) 의료 SaaS / 핀테크 / 콘텐츠",       type: "text"     },
    { key: "region",      label: "지역",             placeholder: "예) 인천 강화군 / 서울 강남구",         type: "text"     },
    { key: "age",         label: "연령",             placeholder: "예) 만 39세 (1987생)",                  type: "text"     },
    { key: "businessStatus", label: "사업자 상태",    placeholder: "예) 개인사업자 등록 완료 / 예비창업",   type: "text"     },
    { key: "customers",   label: "핵심 고객",        placeholder: "예) 정부지원사업을 처음 신청하는 1인 창업자", type: "text" },
    { key: "evidence",    label: "검증 근거",        placeholder: "예) 인터뷰/설문/MVP 피드백/출처 있는 통계", type: "text" },
    { key: "features",    label: "구현 기능",        placeholder: "예) 공고 수집, AI 매칭, 신청 트래커",     type: "text"     },
    { key: "market",      label: "시장/타깃",        placeholder: "예) 청년창업 지원사업 신청자",            type: "text"     },
    { key: "competitors", label: "경쟁/대안",        placeholder: "예) K-Startup 직접 검색, 컨설팅 업체",   type: "text"     },
    { key: "revenue",     label: "매출/유료화 근거", placeholder: "예) 아직 없음 / 첫 결제 확인 필요 / 유료화 테스트 계획", type: "text" },
    { key: "pricing",     label: "수익모델",         placeholder: "예) 토큰 충전, 구독, B2B 라이선스",      type: "text"     },
    { key: "budget",      label: "예산 계획",        placeholder: "예) 개발비, 운영비, 검증비, 마케팅비",   type: "text"     },
    { key: "impact",      label: "성과 지표",        placeholder: "예) 신청 완료 건수, 상담 연결 수, 재방문율", type: "text" },
    { key: "documents",   label: "보유 서류",        placeholder: "예) 사업자등록증, 통신판매업, 통장",      type: "text"     },
    { key: "risk",        label: "리스크 관리",      placeholder: "예) 개인정보, AI 면책, 환불/결제, 허위 수치 차단", type: "text" }
  ];

  // ── 헬퍼 ──
  const $ = (sel) => document.querySelector(sel);
  function getUserData() {
    return (window.SAESSAK_USER_DATA && window.SAESSAK_USER_DATA.get())
      || JSON.parse(localStorage.getItem("saessak.teambuilder.userData") || "{}");
  }
  function setUserData(d) {
    if (window.SAESSAK_USER_DATA) window.SAESSAK_USER_DATA.set(d);
    else localStorage.setItem("saessak.teambuilder.userData", JSON.stringify(d));
  }
  function escapeHtml(s) {
    return String(s || "").replace(/[<>&"']/g, (c) => ({
      "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function downloadAsFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function gradeClass(grade) {
    if (grade === "매우 강함") return "great";
    if (grade === "강함") return "good";
    if (grade === "보통") return "normal";
    return "weak";
  }

  function statusClass(status) {
    if (status === "강함") return "good";
    if (status === "보완 필요") return "normal";
    return "weak";
  }

  async function fetchReadiness(planText) {
    const resp = await fetch("/api/grant-readiness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userData: getUserData(), planText: planText || "" })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || data.detail || resp.status);
    if (!Number.isFinite(data.score) || !Array.isArray(data.dimensions)) {
      throw new Error("준비도 응답 형식이 올바르지 않습니다");
    }
    return data;
  }

  // ── 1) 본인 데이터 패널 (모달 형식) ──
  function buildUserDataPanel() {
    if (document.getElementById("saessak-user-data-modal")) return;
    const modal = document.createElement("div");
    modal.id = "saessak-user-data-modal";
    modal.className = "saessak-modal is-hidden";
    modal.innerHTML = `
      <div class="saessak-modal-backdrop" data-close></div>
      <div class="saessak-modal-card">
        <header class="saessak-modal-head">
          <div>
            <p class="saessak-eyebrow">Studio Input</p>
            <strong>본인 데이터 입력</strong>
            <small>이 데이터는 모든 에이전트가 답할 때 인용해요. 일반론 방지용. 정보 정확할수록 결과가 진해집니다.</small>
          </div>
          <button class="saessak-close-btn" data-close aria-label="close">×</button>
        </header>
        <div class="saessak-form-grid">
          ${USER_DATA_FIELDS.map(f => `
            <label class="saessak-field">
              <span>${f.label}</span>
              <input type="${f.type}" data-key="${f.key}" placeholder="${escapeHtml(f.placeholder)}" />
            </label>
          `).join("")}
        </div>
        <footer class="saessak-modal-foot">
          <button class="saessak-btn ghost" data-close>닫기</button>
          <button class="saessak-btn primary" id="saessak-save-userdata">저장 (로컬)</button>
          <small id="saessak-userdata-status"></small>
        </footer>
        <p class="saessak-modal-note">
          저장값은 본 기기 localStorage에 보관됩니다. 에이전트 실행 시에는 사용자가 요청한 분석을 위해 API로 전달됩니다.
          AI 보조 도구일뿐, 본인 판단·검토 필수 · 합격 보장 없음.
        </p>
      </div>
    `;
    document.body.appendChild(modal);

    // 기존 값 채우기
    const data = getUserData();
    modal.querySelectorAll("input[data-key]").forEach(input => {
      const k = input.dataset.key;
      input.value = data[k] || "";
    });

    // 닫기 핸들러
    modal.querySelectorAll("[data-close]").forEach(el => {
      el.addEventListener("click", () => modal.classList.add("is-hidden"));
    });
    // 저장
    modal.querySelector("#saessak-save-userdata").addEventListener("click", () => {
      const d = {};
      modal.querySelectorAll("input[data-key]").forEach(input => {
        d[input.dataset.key] = (input.value || "").trim();
      });
      setUserData(d);
      const status = modal.querySelector("#saessak-userdata-status");
      status.textContent = "저장됨 · 다음 디스패치부터 적용";
      status.className = "saessak-ok";
      updateUserDataBadge();
      setTimeout(() => modal.classList.add("is-hidden"), 700);
    });
  }
  function openUserDataModal() {
    buildUserDataPanel();
    document.getElementById("saessak-user-data-modal").classList.remove("is-hidden");
  }

  // ── 준비도 / 100점 로드맵 ──
  function buildReadinessModal() {
    if (document.getElementById("saessak-readiness-modal")) return;
    const modal = document.createElement("div");
    modal.id = "saessak-readiness-modal";
    modal.className = "saessak-modal is-hidden";
    modal.innerHTML = `
      <div class="saessak-modal-backdrop" data-close></div>
      <div class="saessak-modal-card saessak-modal-wide">
        <header class="saessak-modal-head">
          <div>
            <p class="saessak-eyebrow">Grant Readiness</p>
            <strong>100점 로드맵</strong>
            <small>합격률이 아니라 공통 심사 요구사항 충족도입니다. 부족한 증거와 서류를 먼저 잡아줍니다.</small>
          </div>
          <button class="saessak-close-btn" data-close aria-label="close">×</button>
        </header>
        <label class="saessak-field saessak-field-full">
          <span>추가 메모 또는 사업계획서 초안</span>
          <textarea id="saessak-readiness-plan" rows="4" placeholder="현재 사업계획서 초안, 심사위원에게 강조하고 싶은 내용, 공고문 핵심 조건을 붙여넣으세요."></textarea>
        </label>
        <div class="saessak-readiness-result" id="saessak-readiness-result"></div>
        <footer class="saessak-modal-foot">
          <button class="saessak-btn ghost" data-close>닫기</button>
          <button class="saessak-btn" id="saessak-readiness-edit">본인 데이터 보강</button>
          <button class="saessak-btn primary" id="saessak-readiness-run">준비도 진단</button>
          <span id="saessak-readiness-status"></span>
        </footer>
        <p class="saessak-modal-note">AI 작성 보조용 진단입니다. 실제 공고 원문과 기관 안내를 기준으로 최종 확인해야 합니다.</p>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-close]").forEach(el =>
      el.addEventListener("click", () => modal.classList.add("is-hidden")));
    modal.querySelector("#saessak-readiness-edit").addEventListener("click", openUserDataModal);
    modal.querySelector("#saessak-readiness-run").addEventListener("click", runReadinessCheck);
  }

  function renderReadiness(data) {
    const el = document.getElementById("saessak-readiness-result");
    if (!el) return;
    const actions = (data.priorityActions || []).map((item, i) => `
      <li><strong>${i + 1}. ${escapeHtml(item.area)}</strong><span>${escapeHtml(item.action)}</span></li>
    `).join("");
    const dimensions = (data.dimensions || []).map(d => `
      <article class="saessak-readiness-dim ${statusClass(d.status)}">
        <div>
          <strong>${escapeHtml(d.label)}</strong>
          <small>${escapeHtml(d.status)} · 누락 ${d.missingInputs?.length || 0}</small>
        </div>
        <span>${d.score}/${d.max}</span>
      </article>
    `).join("");

    el.innerHTML = `
      <section class="saessak-readiness-score ${gradeClass(data.grade)}">
        <div>
          <small>현재 준비도</small>
          <strong>${data.score}/100</strong>
        </div>
        <span>${escapeHtml(data.grade)}</span>
      </section>
      <p class="saessak-readiness-summary">${escapeHtml(data.summary)}</p>
      <div class="saessak-readiness-grid">${dimensions}</div>
      <section class="saessak-readiness-actions">
        <strong>우선 보강 액션</strong>
        <ol>${actions || "<li><span>큰 취약 항목은 없습니다. 공고 원문 기준으로 마지막 검토를 진행하세요.</span></li>"}</ol>
      </section>
    `;
  }

  async function runReadinessCheck() {
    const status = document.getElementById("saessak-readiness-status");
    const button = document.getElementById("saessak-readiness-run");
    const planText = document.getElementById("saessak-readiness-plan")?.value || "";
    if (status) { status.textContent = "진단 중..."; status.className = ""; }
    if (button) button.disabled = true;
    try {
      const data = await fetchReadiness(planText);
      renderReadiness(data);
      if (status) { status.textContent = "진단 완료"; status.className = "saessak-ok"; }
    } catch (e) {
      if (status) { status.textContent = "진단 실패: " + e.message; status.className = "saessak-err"; }
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function openReadinessModal() {
    buildReadinessModal();
    const modal = document.getElementById("saessak-readiness-modal");
    modal.classList.remove("is-hidden");
    document.getElementById("saessak-readiness-status").textContent = "";
    if (!document.getElementById("saessak-readiness-result").innerHTML.trim()) {
      await runReadinessCheck();
    }
  }

  // 본인 데이터 진행률 뱃지
  function updateUserDataBadge() {
    const data = getUserData();
    const filled = USER_DATA_FIELDS.filter(f => data[f.key]).length;
    const total = USER_DATA_FIELDS.length;
    const badge = document.getElementById("saessak-userdata-badge");
    if (badge) {
      badge.textContent = `${filled}/${total}`;
      badge.classList.toggle("complete", filled === total);
      badge.classList.toggle("empty", filled === 0);
    }
  }

  // ── 2) 전체 실행 패널 ──
  function buildRunAllPanel() {
    if (document.getElementById("saessak-runall-modal")) return;
    const modal = document.createElement("div");
    modal.id = "saessak-runall-modal";
    modal.className = "saessak-modal is-hidden";
    modal.innerHTML = `
      <div class="saessak-modal-backdrop" data-close></div>
      <div class="saessak-modal-card saessak-modal-wide">
        <header class="saessak-modal-head">
          <div>
            <p class="saessak-eyebrow">Full Run · 6 Agents</p>
            <strong>전체 실행 — 60 토큰</strong>
            <small>한 줄 요청 → Director가 분담 → 5 에이전트 순차 작동 → Critic 자기 비판. 약 1~2분 소요.</small>
          </div>
          <button class="saessak-close-btn" data-close aria-label="close">×</button>
        </header>
        <div class="saessak-runall-body">
          <label class="saessak-field saessak-field-full">
            <span>한 줄 요청</span>
            <textarea id="saessak-runall-brief" rows="3"
              placeholder="예) 시제품 베타 운영 중인 약국 SaaS로 예비창업패키지 신청 패키지 만들어줘."></textarea>
          </label>
          <div class="saessak-runall-checks">
            <button class="saessak-link" id="saessak-runall-edit-userdata">본인 데이터 편집 →</button>
            <span class="saessak-badge" id="saessak-runall-userdata-badge">0/${USER_DATA_FIELDS.length}</span>
          </div>
          <div class="saessak-pipeline" id="saessak-runall-pipeline"></div>
        </div>
        <footer class="saessak-modal-foot">
          <button class="saessak-btn ghost" data-close>닫기</button>
          <button class="saessak-btn primary" id="saessak-runall-start">🚀 전체 실행 (60토큰)</button>
          <span id="saessak-runall-status"></span>
        </footer>
        <p class="saessak-modal-note">
          AI는 보조 도구 — 본인 판단·검토 필수. 합격 보장 없음. 결과는 자동으로 산출물 목록에 저장돼요.
        </p>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll("[data-close]").forEach(el =>
      el.addEventListener("click", () => modal.classList.add("is-hidden")));

    modal.querySelector("#saessak-runall-edit-userdata").addEventListener("click", () => {
      openUserDataModal();
    });

    modal.querySelector("#saessak-runall-start").addEventListener("click", runAll);
  }

  function renderRunAllPipeline(steps) {
    const el = document.getElementById("saessak-runall-pipeline");
    if (!el) return;
    el.innerHTML = steps.map(s => `
      <div class="saessak-step saessak-step-${s.status}" data-agent="${s.id}">
        <span class="saessak-step-num">${s.stage}</span>
        <div class="saessak-step-body">
          <strong>${s.name}</strong>
          <small>${s.statusText || ""}</small>
        </div>
        ${s.status === "done" ? `<button class="saessak-step-view" data-view-step="${s.id}">보기</button>` : ""}
      </div>
    `).join("");
    el.querySelectorAll("[data-view-step]").forEach(btn => {
      btn.addEventListener("click", () => {
        const agentId = btn.dataset.viewStep;
        const step = steps.find(s => s.id === agentId);
        if (step && step.response) showResponseModal(step.name, step.response, { agent: agentId });
      });
    });
  }

  let runAllInFlight = false;
  async function runAll() {
    if (runAllInFlight) return;
    const briefEl = document.getElementById("saessak-runall-brief");
    const brief = (briefEl?.value || "").trim();
    if (!brief) {
      const s = document.getElementById("saessak-runall-status");
      if (s) { s.textContent = "한 줄 요청을 입력해주세요"; s.className = "saessak-err"; }
      return;
    }

    const project = window.SAESSAK_PROJECT;
    const order = ["director", "grant-scout", "plan-writer", "eligibility", "deadline", "critic"];
    const steps = order.map((id, i) => {
      const a = project.agents.find(x => x.id === id);
      return { id, name: a.name, stage: i + 1, status: "pending", statusText: "대기" };
    });
    renderRunAllPipeline(steps);
    runAllInFlight = true;

    const startBtn = document.getElementById("saessak-runall-start");
    const status = document.getElementById("saessak-runall-status");
    if (startBtn) startBtn.disabled = true;
    if (status) { status.textContent = "실행 중…"; status.className = ""; }

    try {
      // 직접 한 단계씩 실행하면서 UI 업데이트 (서버 /api/dispatch-all도 있지만 클라가 직접 돌면 진행 표시 가능)
      const previousResults = {};
      for (let i = 0; i < order.length; i++) {
        const agentId = order[i];
        const step = steps[i];
        step.status = "running"; step.statusText = "실행 중…";
        renderRunAllPipeline(steps);

        try {
          const resp = await fetch("/api/dispatch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project: "saessak-match", agent: agentId, brief, previousResults })
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.message || data.error || resp.status);
          step.status = "done";
          step.statusText = `완료 · ${data.creditsCharged || 0} 토큰 차감`;
          step.response = data.response;
          step.raw = data.raw;
          // previousResults 누적 (camelCase)
          const camelKey = agentId.replace(/-(\w)/g, (_, c) => c.toUpperCase());
          previousResults[camelKey] = data.raw;
        } catch (e) {
          step.status = "error"; step.statusText = "실패: " + e.message;
        }
        renderRunAllPipeline(steps);
      }
      if (status) {
        const errCount = steps.filter(s => s.status === "error").length;
        if (errCount > 0) {
          status.textContent = `완료 (${errCount}개 실패)`;
          status.className = "saessak-warn";
        } else {
          status.textContent = "✅ 전체 완료 · 산출물에 저장됨";
          status.className = "saessak-ok";
        }
      }
    } finally {
      runAllInFlight = false;
      if (startBtn) startBtn.disabled = false;
    }
  }

  function openRunAllModal() {
    buildRunAllPanel();
    const modal = document.getElementById("saessak-runall-modal");
    modal.classList.remove("is-hidden");
    document.getElementById("saessak-runall-pipeline").innerHTML = "";
    document.getElementById("saessak-runall-status").textContent = "";
    updateUserDataBadge();
    document.getElementById("saessak-runall-userdata-badge").className = "saessak-badge";
    const data = getUserData();
    const filled = USER_DATA_FIELDS.filter(f => data[f.key]).length;
    document.getElementById("saessak-runall-userdata-badge").textContent = `${filled}/${USER_DATA_FIELDS.length}`;
  }

  // ── 3) 응답 보기 모달 (다운로드 포함) ──
  function showResponseModal(title, content, opts) {
    opts = opts || {};
    let modal = document.getElementById("saessak-response-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "saessak-response-modal";
      modal.className = "saessak-modal is-hidden";
      modal.innerHTML = `
        <div class="saessak-modal-backdrop" data-close></div>
        <div class="saessak-modal-card saessak-modal-wide">
          <header class="saessak-modal-head">
            <div>
              <p class="saessak-eyebrow">Output</p>
              <strong id="saessak-response-title">—</strong>
            </div>
            <button class="saessak-close-btn" data-close aria-label="close">×</button>
          </header>
          <pre class="saessak-response-body" id="saessak-response-body"></pre>
          <footer class="saessak-modal-foot">
            <button class="saessak-btn ghost" data-close>닫기</button>
            <button class="saessak-btn" id="saessak-copy-response">복사</button>
            <button class="saessak-btn primary" id="saessak-download-response">.md 다운로드</button>
          </footer>
          <p class="saessak-modal-note">AI 보조 도구 — 본인 판단·검토 필수. 합격 보장 없음.</p>
        </div>
      `;
      document.body.appendChild(modal);
      modal.querySelectorAll("[data-close]").forEach(el =>
        el.addEventListener("click", () => modal.classList.add("is-hidden")));
    }
    modal.querySelector("#saessak-response-title").textContent = title;
    modal.querySelector("#saessak-response-body").textContent = content;
    modal.querySelector("#saessak-copy-response").onclick = () => {
      navigator.clipboard?.writeText(content);
    };
    modal.querySelector("#saessak-download-response").onclick = () => {
      const safe = (title || "result").replace(/[\\/:*?"<>|]/g, "_");
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      downloadAsFile(`${safe}_${stamp}.md`, content);
    };
    modal.classList.remove("is-hidden");
  }

  // ── 4) 영상 교체 ──
  function applyVideoBackground(videoId) {
    const choice = VIDEO_POOL.find(v => v.id === videoId);
    if (!choice) return;
    if (window.SAESSAK_PROJECT) window.SAESSAK_PROJECT.background.src = choice.src;
    localStorage.setItem("teambuilder.activeVideo", videoId);
    const studioVideo = document.querySelector("#studio-video");
    const studioVideoFade = document.querySelector("#studio-video-fade");
    if (studioVideo) {
      studioVideo.src = choice.src;
      studioVideo.load(); studioVideo.play().catch(() => {});
    }
    if (studioVideoFade) {
      studioVideoFade.src = choice.src;
      studioVideoFade.load();
    }
  }

  // ── 5) 상단 바에 버튼들 주입 (Run All, 본인 데이터, 영상 교체) ──
  function injectTopbarButtons() {
    const topbarActions = document.querySelector(".topbar-actions");
    if (!topbarActions || document.getElementById("saessak-topbar-injected")) return;

    const wrap = document.createElement("div");
    wrap.id = "saessak-topbar-injected";
    wrap.className = "saessak-topbar-injected";
    wrap.innerHTML = `
      <button id="saessak-runall-btn" class="saessak-btn primary saessak-pill" type="button" title="6 에이전트 자동 체인">
        🚀 전체 실행
        <span class="saessak-pill-cost">60</span>
      </button>
      <button id="saessak-menu-toggle" class="saessak-btn ghost saessak-pill" type="button" aria-expanded="false" title="도구팩과 에이전트 메뉴 열기">
        메뉴
      </button>
      <button id="saessak-userdata-btn" class="saessak-btn ghost saessak-pill" type="button" title="본인 데이터 — 모든 에이전트가 인용">
        본인 데이터
        <span id="saessak-userdata-badge" class="saessak-badge empty">0/${USER_DATA_FIELDS.length}</span>
      </button>
      <button id="saessak-readiness-btn" class="saessak-btn ghost saessak-pill" type="button" title="지원사업 준비도와 100점 로드맵">
        100점 로드맵
      </button>
      <select id="saessak-video-picker" class="saessak-video-picker" title="배경 영상 교체">
        ${VIDEO_POOL.map(v => `<option value="${v.id}">${v.label}</option>`).join("")}
      </select>
    `;
    // 도구팩 버튼 앞에 삽입
    const toolpackBtn = document.querySelector("#toolpack-toggle-button");
    if (toolpackBtn) topbarActions.insertBefore(wrap, toolpackBtn);
    else topbarActions.appendChild(wrap);

    document.getElementById("saessak-runall-btn").addEventListener("click", openRunAllModal);
    document.getElementById("saessak-menu-toggle").addEventListener("click", (e) => {
      const open = document.body.classList.toggle("studio-menu-open");
      e.currentTarget.setAttribute("aria-expanded", String(open));
      e.currentTarget.textContent = open ? "메뉴 닫기" : "메뉴";
    });
    document.getElementById("saessak-userdata-btn").addEventListener("click", openUserDataModal);
    document.getElementById("saessak-readiness-btn").addEventListener("click", openReadinessModal);

    const picker = document.getElementById("saessak-video-picker");
    const saved = localStorage.getItem("teambuilder.activeVideo") || "saessak-platform";
    picker.value = saved;
    picker.addEventListener("change", () => applyVideoBackground(picker.value));
    // 초기 적용
    if (saved !== "saessak-platform") applyVideoBackground(saved);

    updateUserDataBadge();
  }

  // ── 6) brief 드로어에 파일 첨부 추가 ──
  function injectFileAttachUI() {
    const briefDrawer = document.getElementById("brief-drawer");
    if (!briefDrawer || briefDrawer.querySelector(".saessak-attach-row")) return;
    const briefInput = briefDrawer.querySelector("#brief-input");
    if (!briefInput) return;

    const row = document.createElement("div");
    row.className = "saessak-attach-row";
    row.innerHTML = `
      <label class="saessak-attach-label">
        📎 파일 첨부 (.txt/.md/.json — brief 끝에 자동 추가)
        <input type="file" id="saessak-attach-file" accept=".txt,.md,.json,.csv" hidden />
      </label>
      <span id="saessak-attach-status" class="saessak-attach-status"></span>
    `;
    briefInput.parentNode.insertBefore(row, briefInput.nextSibling);

    const fileInput = row.querySelector("#saessak-attach-file");
    const label = row.querySelector(".saessak-attach-label");
    label.addEventListener("click", (e) => {
      if (e.target.tagName !== "INPUT") fileInput.click();
    });
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const status = row.querySelector("#saessak-attach-status");
      try {
        const text = await file.text();
        const limited = text.slice(0, 8000); // 8KB 한도
        const sep = briefInput.value ? "\n\n" : "";
        briefInput.value = briefInput.value + sep + `[첨부: ${file.name}]\n${limited}` + (text.length > 8000 ? "\n... (잘림)" : "");
        status.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB) 첨부됨`;
        status.className = "saessak-attach-status saessak-ok";
      } catch (e) {
        status.textContent = "첨부 실패: " + e.message;
        status.className = "saessak-attach-status saessak-err";
      }
    });
  }

  // ── 7) 이벤트 로그 항목에 다운로드/보기 버튼 추가 (mutation observer) ──
  function wireEventLogButtons() {
    const log = document.getElementById("event-log");
    if (!log) return;
    // brief-feed 와 event-log 둘 다 감시
    const observer = new MutationObserver(() => {
      log.querySelectorAll(".event-item, .feed-item, .brief-feed-item").forEach(item => {
        if (item.dataset.saessakWired) return;
        item.dataset.saessakWired = "1";
        // 어떤 응답이라도 클릭하면 모달
        item.style.cursor = "pointer";
        item.addEventListener("click", () => {
          const text = item.textContent || "";
          if (text.length > 50) {
            showResponseModal("산출물 보기", text);
          }
        });
      });
    });
    observer.observe(log, { childList: true, subtree: true });
  }

  // ── 부트스트랩 ──
  ready(() => {
    // 상단 바 + 첨부 UI를 비동기로 잡기 (teambuilder.js가 늦게 DOM 만들 수 있음)
    const tryInject = () => {
      injectTopbarButtons();
      injectFileAttachUI();
      wireEventLogButtons();
    };
    tryInject();
    setTimeout(tryInject, 500);
    setTimeout(tryInject, 1500);
    setTimeout(tryInject, 3000);

    // studio enter 후에도 한 번 더
    const studioShell = document.getElementById("studio-shell");
    if (studioShell) {
      const observer = new MutationObserver(tryInject);
      observer.observe(studioShell, { attributes: true, attributeFilter: ["class"] });
    }
  });

  // 외부에서 호출 가능하게
  window.saessakExtras = {
    openUserDataModal, openRunAllModal, openReadinessModal, showResponseModal,
    applyVideoBackground, getUserData, setUserData,
    USER_DATA_FIELDS, VIDEO_POOL
  };
})();
