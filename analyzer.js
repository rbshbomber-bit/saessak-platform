/*
 * 새싹매치 — 사업계획서 업로드 분석 모듈 (v5 · Phase 1)
 * ============================================================
 * - 동적 견적 모델 (Metered Billing) + 캡 +20% 무료 흡수
 * - PDF/DOCX 클라이언트 파싱 (pdf.js + mammoth.js CDN)
 * - 산출물 옵션별 가산 (Word/PDF/PPT/풀패키지)
 * - AI 팀 6명 협업 검수 옵션 (+25%)
 *
 * Phase 1 범위 (이 세션):
 *   ✓ UI + 견적 로직 + Supabase에 demo 차감 기록
 * Phase 2 (다음 세션):
 *   - api/analyze-plan.js 서버리스 (Claude API)
 *   - 산출물 (Word/PDF/PPT) 동적 생성
 * ============================================================
 */
(() => {
  if (window.__SAESSAK_ANALYZER_LOADED) return;
  window.__SAESSAK_ANALYZER_LOADED = true;

  // ────────────────────────────────────────────────
  // 1) 외부 라이브러리 lazy load (pdf.js + mammoth.js)
  // ────────────────────────────────────────────────
  const PDFJS_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const MAMMOTH_SRC = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = () => reject(new Error("load fail: " + src));
      document.head.appendChild(s);
    });
  }

  async function ensurePdfJs() {
    if (window.pdfjsLib) return window.pdfjsLib;
    await loadScript(PDFJS_SRC);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return window.pdfjsLib;
  }
  async function ensureMammoth() {
    if (window.mammoth) return window.mammoth;
    await loadScript(MAMMOTH_SRC);
    return window.mammoth;
  }

  // ────────────────────────────────────────────────
  // 2) 견적 함수 (Metered Billing)
  // ────────────────────────────────────────────────
  const OUTPUT_PRICE = {
    word_checklist: 8,
    pdf_report: 18,
    pptx_deck: 28,
    full_package: 45, // word + pdf + pptx 15% 할인
  };
  const TEAM_SURCHARGE_RATE = 0.25;  // AI 팀 6명 검수: +25%
  const CAP_RATE = 1.20;             // 견적 +20% 초과는 우리 부담

  function estimateTokens({ words = 0, outputs = [], useTeam = false }) {
    const base = 10;
    // 800 단어당 2 토큰 (인풋 가산)
    const inputCost = Math.ceil(words / 800) * 2;
    // 산출물 가산
    let outputCost = 0;
    if (outputs.includes("full_package")) {
      outputCost = OUTPUT_PRICE.full_package;
    } else {
      outputs.forEach(o => { outputCost += OUTPUT_PRICE[o] || 0; });
    }
    // AI 팀 검수 가산
    const teamSurcharge = useTeam
      ? Math.ceil((base + outputCost) * TEAM_SURCHARGE_RATE)
      : 0;
    const estimated = base + inputCost + outputCost + teamSurcharge;
    const cap = Math.ceil(estimated * CAP_RATE);
    return { base, inputCost, outputCost, teamSurcharge, estimated, cap };
  }

  // ────────────────────────────────────────────────
  // 3) 파일 파싱
  // ────────────────────────────────────────────────
  async function parsePdf(file) {
    const lib = await ensurePdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: buf }).promise;
    const pages = pdf.numPages;
    let text = "";
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join(" ") + "\n";
    }
    return { pages, text, words: countWords(text) };
  }
  async function parseDocx(file) {
    const m = await ensureMammoth();
    const buf = await file.arrayBuffer();
    const result = await m.extractRawText({ arrayBuffer: buf });
    const text = result.value || "";
    // DOCX는 페이지 수 불확실 — 단어 500개당 1페이지로 추정
    const pages = Math.max(1, Math.ceil(countWords(text) / 500));
    return { pages, text, words: countWords(text), pagesEstimated: true };
  }
  function countWords(text) {
    if (!text) return 0;
    // 한국어/영어 혼합: 공백 + CJK 분리 모두 카운트
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return 0;
    // 영어 단어 + 한글 어절 합산
    const enWords = (cleaned.match(/[A-Za-z]+(?:['-]?[A-Za-z]+)*/g) || []).length;
    const koWords = (cleaned.match(/[가-힯]+/g) || []).length;
    const numWords = (cleaned.match(/\d+/g) || []).length;
    return enWords + koWords + numWords;
  }

  // ────────────────────────────────────────────────
  // 4) Supabase 잔액 (있으면) 또는 로컬 토큰
  // ────────────────────────────────────────────────
  function getCurrentUser() {
    try {
      const id = localStorage.getItem("saessak_current_user");
      if (!id) return null;
      const users = JSON.parse(localStorage.getItem("saessak_users") || "[]");
      return users.find(u => u.id === id) || null;
    } catch (e) { return null; }
  }
  function updateUser(updater) {
    const id = localStorage.getItem("saessak_current_user");
    if (!id) return null;
    try {
      const users = JSON.parse(localStorage.getItem("saessak_users") || "[]");
      const idx = users.findIndex(u => u.id === id);
      if (idx === -1) return null;
      users[idx] = updater(users[idx]) || users[idx];
      localStorage.setItem("saessak_users", JSON.stringify(users));
      return users[idx];
    } catch (e) { return null; }
  }
  function isAdmin(user) {
    return !!user && (user.email === "rbshbomber@gmail.com" || user.is_admin);
  }

  // ────────────────────────────────────────────────
  // 5) CSS 주입
  // ────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("analyzer-styles")) return;
    const css = `
      .sa-modal { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; }
      .sa-modal.is-hidden { display: none; }
      .sa-modal-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.55); backdrop-filter: blur(4px); }
      .sa-card { position: relative; background: #fff; border-radius: 18px; max-width: 720px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.3); font-family: 'Pretendard', -apple-system, sans-serif; }
      .sa-head { padding: 22px 26px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: flex-start; }
      .sa-head-l strong { font-size: 22px; color: #1a1a1a; display: block; letter-spacing: -0.01em; }
      .sa-head-l small { color: #888; font-size: 13px; display: block; margin-top: 4px; }
      .sa-head-eyebrow { font-size: 11px; font-weight: 700; color: #6b8a5a; letter-spacing: .12em; }
      .sa-close { background: transparent; border: 0; font-size: 28px; color: #888; cursor: pointer; line-height: 1; padding: 0 4px; }
      .sa-body { padding: 22px 26px; }
      .sa-dropzone { border: 2px dashed #c8d6c0; background: #f6faf3; border-radius: 14px; padding: 28px 20px; text-align: center; cursor: pointer; transition: all .15s; }
      .sa-dropzone:hover, .sa-dropzone.is-drag { background: #ecf4e6; border-color: #6b8a5a; }
      .sa-dropzone p { margin: 0; color: #555; font-size: 14px; }
      .sa-dropzone .sa-dz-big { font-size: 17px; color: #1a1a1a; font-weight: 600; margin-bottom: 6px; }
      .sa-dropzone small { color: #888; font-size: 12px; display: block; margin-top: 6px; }
      .sa-fileinfo { background: #f7f7f5; border: 1px solid #e5e5e3; border-radius: 12px; padding: 14px 16px; margin-top: 14px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
      .sa-fileinfo .sa-fi-name { font-weight: 600; color: #1a1a1a; }
      .sa-fileinfo .sa-fi-meta { color: #666; }
      .sa-fileinfo .sa-fi-clear { background: transparent; border: 0; color: #aa6; cursor: pointer; font-size: 18px; padding: 0 4px; }
      .sa-section-title { font-size: 12px; font-weight: 700; color: #6b8a5a; letter-spacing: .1em; margin: 22px 0 10px; }
      .sa-options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .sa-opt { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border: 1px solid #e5e5e3; border-radius: 10px; cursor: pointer; transition: all .12s; background: #fff; }
      .sa-opt:hover { border-color: #b0c5a4; background: #f6faf3; }
      .sa-opt input { margin-top: 3px; flex-shrink: 0; accent-color: #6b8a5a; }
      .sa-opt-body { flex: 1; min-width: 0; }
      .sa-opt-name { font-size: 14px; color: #1a1a1a; font-weight: 600; }
      .sa-opt-cost { font-size: 12px; color: #6b8a5a; font-weight: 600; margin-left: 6px; }
      .sa-opt-desc { font-size: 11.5px; color: #888; margin-top: 3px; line-height: 1.4; }
      .sa-opt.is-checked { border-color: #6b8a5a; background: #ecf4e6; }
      .sa-team-toggle { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border: 1px solid #e5e5e3; border-radius: 10px; cursor: pointer; margin-top: 12px; background: #fff; }
      .sa-team-toggle:hover { border-color: #b0c5a4; }
      .sa-team-toggle.is-checked { border-color: #6b8a5a; background: #ecf4e6; }
      .sa-team-toggle input { accent-color: #6b8a5a; }
      .sa-team-info { flex: 1; }
      .sa-team-info strong { font-size: 14px; color: #1a1a1a; display: block; }
      .sa-team-info small { color: #888; font-size: 11.5px; }
      .sa-team-pill { background: #6b8a5a; color: #fff; padding: 3px 8px; border-radius: 8px; font-size: 11px; font-weight: 700; }
      .sa-estimate { margin-top: 20px; background: linear-gradient(135deg, #1a3a1a, #2d4a2d); color: #fff; border-radius: 14px; padding: 18px 22px; }
      .sa-est-row { display: flex; justify-content: space-between; align-items: baseline; }
      .sa-est-label { font-size: 13px; color: rgba(255,255,255,.7); }
      .sa-est-num { font-size: 32px; font-weight: 800; color: #fff; }
      .sa-est-num .sa-est-unit { font-size: 14px; font-weight: 500; color: rgba(255,255,255,.6); margin-left: 4px; }
      .sa-est-won { color: rgba(255,255,255,.6); font-size: 13px; margin-left: 6px; }
      .sa-est-cap { font-size: 12px; color: rgba(168,213,168,.95); margin-top: 8px; }
      .sa-est-bal { font-size: 12px; color: rgba(255,255,255,.6); margin-top: 4px; }
      .sa-est-bal.is-low { color: #ffb3b3; }
      .sa-est-breakdown { font-size: 11.5px; color: rgba(255,255,255,.55); margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,.1); line-height: 1.6; }
      .sa-foot { padding: 16px 26px 22px; display: flex; justify-content: space-between; align-items: center; gap: 12px; border-top: 1px solid #f0f0f0; }
      .sa-foot-note { font-size: 11px; color: #888; flex: 1; line-height: 1.5; }
      .sa-btn { font-family: inherit; font-size: 14px; padding: 11px 22px; border-radius: 10px; cursor: pointer; border: 0; font-weight: 600; transition: all .12s; }
      .sa-btn.primary { background: #6b8a5a; color: #fff; }
      .sa-btn.primary:hover { background: #5a7849; }
      .sa-btn.primary:disabled { background: #c8c8c8; cursor: not-allowed; }
      .sa-btn.ghost { background: transparent; color: #666; border: 1px solid #d8d8d8; }
      .sa-status { font-size: 12px; color: #888; }
      .sa-status.is-ok { color: #6b8a5a; }
      .sa-status.is-err { color: #c0392b; }
      .sa-launcher { background: #fff; color: #1a3a1a; border: 1.5px solid #6b8a5a; padding: 9px 18px; border-radius: 999px; font-size: 13px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; transition: all .12s; white-space: nowrap; flex-shrink: 0; line-height: 1.2; }
      .sa-launcher:hover { background: #ecf4e6; }
      .sa-launcher-cost { background: #6b8a5a; color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; white-space: nowrap; }
      .sa-phase1-note { background: #fff8e6; border: 1px solid #f5d97a; border-radius: 10px; padding: 11px 14px; font-size: 12px; color: #6b5b1f; margin-top: 16px; line-height: 1.5; }
      .sa-disclaimer { background: #f5f7f5; border: 1px solid #e0e6dd; border-radius: 10px; padding: 12px 14px; font-size: 11.5px; color: #555; margin-top: 14px; line-height: 1.55; }
      @media (max-width: 600px) {
        .sa-options { grid-template-columns: 1fr; }
        .sa-card { max-height: 95vh; }
        .sa-launcher { font-size: 12px; padding: 8px 14px; }
      }
      /* lobby 카드: 좁은 화면에서 세로 정렬로 안전하게 */
      @media (max-width: 720px) {
        #sa-lobby-card { flex-direction: column; align-items: stretch !important; }
        #sa-lobby-card .sa-launcher { width: 100%; justify-content: center; }
      }
    `;
    const style = document.createElement("style");
    style.id = "analyzer-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ────────────────────────────────────────────────
  // 6) 모달 UI 생성
  // ────────────────────────────────────────────────
  let modalEl = null;
  let parsedFile = null; // { name, pages, words, text, pagesEstimated }

  function buildModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement("div");
    modalEl.className = "sa-modal is-hidden";
    modalEl.id = "saessak-analyzer-modal";
    modalEl.innerHTML = `
      <div class="sa-modal-backdrop" data-close></div>
      <div class="sa-card">
        <header class="sa-head">
          <div class="sa-head-l">
            <span class="sa-head-eyebrow">UPLOAD ANALYZER · METERED BILLING</span>
            <strong>📄 사업계획서 업로드 분석</strong>
            <small>업로드한 분량과 산출물 선택에 비례해서 토큰 차감 — 초과분은 우리가 흡수</small>
          </div>
          <button class="sa-close" data-close aria-label="close">×</button>
        </header>
        <div class="sa-body">
          <div class="sa-dropzone" id="sa-dropzone">
            <p class="sa-dz-big">📎 PDF 또는 DOCX 파일을 끌어다 놓거나 클릭</p>
            <p>업로드 즉시 페이지·단어 수를 측정해서 견적을 계산합니다.</p>
            <small>파일은 브라우저 내에서만 처리되며, 분석 실행 전엔 서버로 전송되지 않습니다.</small>
            <input type="file" id="sa-file-input" accept=".pdf,.docx" style="display:none" />
          </div>
          <div id="sa-fileinfo-wrap"></div>

          <div class="sa-section-title">산출물 선택 (복수 가능 · 풀패키지는 단독)</div>
          <div class="sa-options" id="sa-options">
            <label class="sa-opt" data-opt="word_checklist">
              <input type="checkbox" data-output="word_checklist" />
              <div class="sa-opt-body">
                <div class="sa-opt-name">📝 보완 체크리스트 <span class="sa-opt-cost">+8</span></div>
                <div class="sa-opt-desc">Word 문서 · 보강해야 할 항목 + 심사 포인트</div>
              </div>
            </label>
            <label class="sa-opt" data-opt="pdf_report">
              <input type="checkbox" data-output="pdf_report" />
              <div class="sa-opt-body">
                <div class="sa-opt-name">📄 정리본 PDF <span class="sa-opt-cost">+18</span></div>
                <div class="sa-opt-desc">PDF · 챕터별 요약 + AI 개선안</div>
              </div>
            </label>
            <label class="sa-opt" data-opt="pptx_deck">
              <input type="checkbox" data-output="pptx_deck" />
              <div class="sa-opt-body">
                <div class="sa-opt-name">🎯 발표 자료 PPT <span class="sa-opt-cost">+28</span></div>
                <div class="sa-opt-desc">PPT 약 10장 · 심사위원용 핵심 슬라이드</div>
              </div>
            </label>
            <label class="sa-opt" data-opt="full_package">
              <input type="checkbox" data-output="full_package" />
              <div class="sa-opt-body">
                <div class="sa-opt-name">🎁 풀패키지 <span class="sa-opt-cost">+45 (15% 할인)</span></div>
                <div class="sa-opt-desc">Word + PDF + PPT 세트 한 번에</div>
              </div>
            </label>
          </div>

          <label class="sa-team-toggle" id="sa-team-toggle">
            <input type="checkbox" id="sa-team-check" />
            <div class="sa-team-info">
              <strong>AI 팀 6명 협업 검수</strong>
              <small>Director · Grant Scout · Plan Writer · Eligibility · Deadline · Critic</small>
            </div>
            <span class="sa-team-pill">+25%</span>
          </label>

          <div class="sa-estimate" id="sa-estimate">
            <div class="sa-est-row">
              <div class="sa-est-label">예상 차감 토큰</div>
              <div class="sa-est-num"><span id="sa-est-num">0</span><span class="sa-est-unit">토큰</span><span class="sa-est-won" id="sa-est-won">— 원</span></div>
            </div>
            <div class="sa-est-cap" id="sa-est-cap">🛡️ 견적 +20% 초과 시 무료 — 최대 0 토큰까지 보장</div>
            <div class="sa-est-bal" id="sa-est-bal">잔액 확인 중...</div>
            <div class="sa-est-breakdown" id="sa-est-breakdown">파일을 업로드하고 산출물을 선택하면 견적이 계산됩니다.</div>
          </div>

          <div class="sa-phase1-note">
            ⚠️ <b>Phase 1 베타</b> — 견적·진행 흐름까지 작동합니다. 실제 산출물 자동 생성(Word/PDF/PPT)은 Phase 2에서 추가됩니다. 진행 시 데모 차감만 기록됩니다.
          </div>

          <div class="sa-disclaimer">
            🤝 <b>AI는 보조 도구입니다.</b> 생성되는 산출물은 사용자가 직접 검토·수정·검증해야 하며, 정부 지원사업 합격을 보장하지 않습니다. 업로드 파일은 브라우저에서만 파싱되며, 진행 동의 전엔 서버로 전송되지 않습니다.
          </div>
        </div>
        <footer class="sa-foot">
          <div class="sa-foot-note">
            적게 의뢰 → 적게 차감. 많이 의뢰 → 비례 차감. 캡 초과분은 우리 부담.
          </div>
          <button class="sa-btn ghost" data-close>닫기</button>
          <button class="sa-btn primary" id="sa-run" disabled>진행하기</button>
        </footer>
        <div style="padding: 0 26px 14px;"><span class="sa-status" id="sa-run-status"></span></div>
      </div>
    `;
    document.body.appendChild(modalEl);

    // 닫기
    modalEl.querySelectorAll("[data-close]").forEach(el => {
      el.addEventListener("click", closeModal);
    });

    // 드래그&드롭
    const dz = modalEl.querySelector("#sa-dropzone");
    const fi = modalEl.querySelector("#sa-file-input");
    dz.addEventListener("click", () => fi.click());
    dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("is-drag"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("is-drag"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault(); dz.classList.remove("is-drag");
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fi.addEventListener("change", () => {
      if (fi.files[0]) handleFile(fi.files[0]);
    });

    // 옵션 체크박스
    modalEl.querySelectorAll(".sa-opt input").forEach(cb => {
      cb.addEventListener("change", onOptionChange);
    });
    modalEl.querySelector("#sa-team-check").addEventListener("change", refreshEstimate);

    // 진행
    modalEl.querySelector("#sa-run").addEventListener("click", onRun);

    return modalEl;
  }

  function onOptionChange(e) {
    // full_package는 단독 선택
    const cb = e.target;
    const val = cb.dataset.output;
    if (val === "full_package" && cb.checked) {
      modalEl.querySelectorAll(".sa-opt input").forEach(o => {
        if (o.dataset.output !== "full_package") o.checked = false;
      });
    } else if (cb.checked) {
      const full = modalEl.querySelector('input[data-output="full_package"]');
      if (full) full.checked = false;
    }
    // 시각 표시
    modalEl.querySelectorAll(".sa-opt").forEach(opt => {
      const i = opt.querySelector("input");
      opt.classList.toggle("is-checked", i && i.checked);
    });
    refreshEstimate();
  }

  // ────────────────────────────────────────────────
  // 7) 파일 처리
  // ────────────────────────────────────────────────
  async function handleFile(file) {
    const name = file.name || "";
    const lc = name.toLowerCase();
    const wrap = modalEl.querySelector("#sa-fileinfo-wrap");
    wrap.innerHTML = `<div class="sa-fileinfo"><div><div class="sa-fi-name">${escapeHtml(name)}</div><div class="sa-fi-meta">파싱 중...</div></div></div>`;
    try {
      let res;
      if (lc.endsWith(".pdf")) res = await parsePdf(file);
      else if (lc.endsWith(".docx")) res = await parseDocx(file);
      else throw new Error("지원하지 않는 형식 (PDF / DOCX만 가능)");
      parsedFile = { name, ...res };
      const pageLabel = res.pagesEstimated ? `약 ${res.pages}p (추정)` : `${res.pages}p`;
      wrap.innerHTML = `
        <div class="sa-fileinfo">
          <div>
            <div class="sa-fi-name">📄 ${escapeHtml(name)}</div>
            <div class="sa-fi-meta">${pageLabel} · ${res.words.toLocaleString()} 단어</div>
          </div>
          <button class="sa-fi-clear" id="sa-fi-clear" aria-label="제거">×</button>
        </div>
      `;
      wrap.querySelector("#sa-fi-clear").addEventListener("click", () => {
        parsedFile = null;
        wrap.innerHTML = "";
        refreshEstimate();
      });
      refreshEstimate();
    } catch (err) {
      wrap.innerHTML = `<div class="sa-fileinfo" style="background:#fdecec;border-color:#f5b3b3;"><div><div class="sa-fi-name" style="color:#c0392b;">파싱 실패</div><div class="sa-fi-meta">${escapeHtml(err.message)}</div></div></div>`;
      parsedFile = null;
      refreshEstimate();
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // ────────────────────────────────────────────────
  // 8) 견적 갱신 (디바운스)
  // ────────────────────────────────────────────────
  let estTimer = null;
  function refreshEstimate() {
    clearTimeout(estTimer);
    estTimer = setTimeout(doRefresh, 80);
  }
  function doRefresh() {
    const outputs = [...modalEl.querySelectorAll(".sa-opt input:checked")].map(i => i.dataset.output);
    const useTeam = modalEl.querySelector("#sa-team-check").checked;
    const words = parsedFile ? parsedFile.words : 0;
    const est = estimateTokens({ words, outputs, useTeam });

    const numEl = modalEl.querySelector("#sa-est-num");
    const wonEl = modalEl.querySelector("#sa-est-won");
    const capEl = modalEl.querySelector("#sa-est-cap");
    const balEl = modalEl.querySelector("#sa-est-bal");
    const bdEl = modalEl.querySelector("#sa-est-breakdown");
    const runBtn = modalEl.querySelector("#sa-run");

    numEl.textContent = est.estimated;
    // Standard 충전 ₩9,900 / 200토큰 = 49.5원/토큰 (펀딩가)
    const won = Math.round(est.estimated * 49.5);
    wonEl.textContent = `≈ ${won.toLocaleString()}원`;
    capEl.textContent = `🛡️ 견적 +20% 초과 시 무료 — 최대 ${est.cap} 토큰까지 보장`;

    // 잔액
    const user = getCurrentUser();
    const bal = user ? (user.tokens || 0) : null;
    const admin = isAdmin(user);
    if (!user) {
      balEl.textContent = "⚠️ 로그인 필요 — 새싹매치 메인에서 로그인하세요.";
      balEl.classList.add("is-low");
      runBtn.disabled = true;
    } else if (admin) {
      balEl.textContent = "👑 관리자 — 차감 없음";
      balEl.classList.remove("is-low");
      runBtn.disabled = !(parsedFile && outputs.length > 0);
    } else if (bal < est.estimated) {
      balEl.textContent = `잔액 ${bal} 토큰 — ${est.estimated - bal} 토큰 부족 (충전 필요)`;
      balEl.classList.add("is-low");
      runBtn.disabled = true;
    } else {
      balEl.textContent = `잔액 ${bal} 토큰 · 진행 시 ${est.estimated} 토큰 차감 예정`;
      balEl.classList.remove("is-low");
      runBtn.disabled = !(parsedFile && outputs.length > 0);
    }

    // 내역
    const parts = [`기본 ${est.base}`];
    if (parsedFile) parts.push(`인풋 가산 ${est.inputCost} (${parsedFile.words.toLocaleString()}단어)`);
    if (est.outputCost > 0) parts.push(`산출물 ${est.outputCost}`);
    if (est.teamSurcharge > 0) parts.push(`AI 팀 검수 ${est.teamSurcharge}`);
    bdEl.textContent = parts.join(" + ") + ` = ${est.estimated} 토큰`;
  }

  // ────────────────────────────────────────────────
  // 9) 진행 (Phase 1: 데모 차감만)
  // ────────────────────────────────────────────────
  function onRun() {
    const outputs = [...modalEl.querySelectorAll(".sa-opt input:checked")].map(i => i.dataset.output);
    const useTeam = modalEl.querySelector("#sa-team-check").checked;
    if (!parsedFile || outputs.length === 0) return;
    const est = estimateTokens({ words: parsedFile.words, outputs, useTeam });
    const user = getCurrentUser();
    if (!user) { setStatus("로그인이 필요합니다.", "err"); return; }
    const admin = isAdmin(user);
    if (!admin && (user.tokens || 0) < est.estimated) {
      setStatus("토큰 잔액 부족 — 충전 후 다시 시도해주세요.", "err");
      return;
    }

    // 동의 확인
    const ok = confirm(
      `진행하시면 다음과 같이 차감됩니다:\n\n` +
      `· 파일: ${parsedFile.name} (${parsedFile.words.toLocaleString()}단어)\n` +
      `· 산출물: ${outputs.join(", ")}\n` +
      `· AI 팀 검수: ${useTeam ? "예" : "아니오"}\n\n` +
      `· 예상 차감: ${est.estimated} 토큰 (최대 ${est.cap})\n` +
      `· 캡 초과분은 우리가 흡수합니다.\n\n` +
      `※ Phase 1 베타 — 실제 산출물 자동 생성은 Phase 2에서 추가됩니다. ` +
      `지금은 견적/차감 흐름만 기록됩니다.\n\n진행할까요?`
    );
    if (!ok) return;

    if (!admin) {
      updateUser(u => {
        u.tokens = (u.tokens || 0) - est.estimated;
        u.analyzerLog = u.analyzerLog || [];
        u.analyzerLog.push({
          at: new Date().toISOString(),
          file: parsedFile.name,
          words: parsedFile.words,
          outputs, useTeam,
          estimated: est.estimated,
          cap: est.cap,
          phase: 1,
          note: "Phase 1 demo charge — 실제 산출물 미생성"
        });
        return u;
      });
    }
    setStatus(
      `✓ ${admin ? "" : `${est.estimated} 토큰 차감됨. `}` +
      `Phase 2에서 실제 산출물이 자동 생성됩니다. 메인 페이지에서 잔액 확인 가능.`,
      "ok"
    );
    // 자동 닫지 않음 (사용자가 메시지 확인 후 닫기)
  }

  function setStatus(msg, kind) {
    const el = modalEl.querySelector("#sa-run-status");
    el.textContent = msg;
    el.className = "sa-status" + (kind ? " is-" + kind : "");
  }

  // ────────────────────────────────────────────────
  // 10) 열기/닫기
  // ────────────────────────────────────────────────
  function openModal() {
    injectStyles();
    buildModal();
    modalEl.classList.remove("is-hidden");
    // 잔액 첫 표시
    refreshEstimate();
  }
  function closeModal() {
    if (modalEl) modalEl.classList.add("is-hidden");
  }

  // ────────────────────────────────────────────────
  // 11) topbar 런처 — 의도적으로 제거됨 (v5.1)
  // ────────────────────────────────────────────────
  // 사유: topbar에 이미 5개 버튼(도구팩/전체실행/본인데이터/picker/Syncing)이
  // 있어서 글자 줄바꿈/겹침 발생. lobby 카드 단일 진입점으로 충분.
  // studio-shell 내부에선 "← 로비" 버튼으로 lobby 복귀 후 진입 가능.
  function injectLauncher() { return false; }

  // 초기 진입 (lobby) 카드에도 추가
  function injectLobbyCard() {
    if (document.getElementById("sa-lobby-card")) return;
    const lobbyInner = document.querySelector(".lobby-inner");
    if (!lobbyInner) return;
    const card = document.createElement("section");
    card.id = "sa-lobby-card";
    card.style.cssText = "margin: 16px 0; padding: 22px 26px; background: linear-gradient(135deg, #f6faf3, #ecf4e6); border: 1.5px solid #b0c5a4; border-radius: 16px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap;";
    card.innerHTML = `
      <div style="flex:1; min-width:240px;">
        <div style="font-size:11px; font-weight:700; color:#6b8a5a; letter-spacing:.12em; margin-bottom:6px;">NEW · METERED BILLING</div>
        <strong style="font-size:18px; color:#1a3a1a; display:block; letter-spacing:-.01em;">📄 사업계획서 업로드 분석</strong>
        <p style="font-size:13px; color:#3a4a3a; margin:6px 0 0; line-height:1.5;">
          이미 작성한 사업계획서를 업로드하면 AI 팀이 분석해서 보완 체크리스트·PDF 정리본·발표 PPT까지 만들어줍니다.
          <b>업로드 분량과 산출물 선택에 비례한 동적 견적</b> — 캡 +20% 초과분은 우리가 흡수.
        </p>
      </div>
      <button class="sa-launcher" id="sa-lobby-launch" type="button" style="flex-shrink:0;">
        분석 시작 <span class="sa-launcher-cost">동적 견적</span>
      </button>
    `;
    // council-panel과 studio-builder 사이에 끼우기
    const studioBuilder = document.querySelector("#studio-builder");
    if (studioBuilder) lobbyInner.insertBefore(card, studioBuilder);
    else lobbyInner.appendChild(card);
    card.querySelector("#sa-lobby-launch").addEventListener("click", openModal);
    injectStyles();
  }

  // ────────────────────────────────────────────────
  // 12) 부트스트랩 — DOM 변화 감시 (lobby/shell 토글에 대응)
  // ────────────────────────────────────────────────
  function boot() {
    injectLobbyCard();
  }
  function tryBoot() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
    // lobby가 동적으로 다시 렌더링될 때를 위해 MutationObserver
    const target = document.body;
    if (target && window.MutationObserver) {
      const mo = new MutationObserver(() => {
        if (!document.getElementById("sa-lobby-card")) injectLobbyCard();
      });
      mo.observe(target, { childList: true, subtree: true });
    }
  }
  tryBoot();

  // 외부 접근용
  window.SaessakAnalyzer = {
    open: openModal,
    estimate: estimateTokens,
    parsePdf, parseDocx, countWords,
  };
})();
