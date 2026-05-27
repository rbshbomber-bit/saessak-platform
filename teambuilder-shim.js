/*
 * teambuilder-shim.js — Agent Studio 룩 → 새싹매치 실제 백엔드 프록시
 *
 * 핵심:
 *   - 가짜 에이전트 응답 제거. 모두 /api/teambuilder(단일) + /api/claude(보조) 실호출.
 *   - 토큰 차감은 ai-client.js의 window.saessak.deductTokens (관리자 자동 우회)
 *   - 결과물은 ai-client.js의 window.saessak.saveAiResult (Supabase ai_results)
 *   - K-Startup 공고는 /api/listings로 Grant Scout 보강 (서버측 또는 클라측)
 *
 * 에이전트 셋: data/agent-studios.json (youth-startup 스튜디오) 와 1:1 매핑.
 */
(() => {
  "use strict";

  // ── 새싹매치 청년창업 도우미 6 에이전트 ──
  const SAESSAK_PROJECT = {
    id: "saessak-match",
    title: "청년창업 도우미",
    subtitle: "지원사업 탐색 → 사업계획서 → 자격·마감 → 자기 비판",
    summary: "한 줄 요청 + 본인 데이터를 받아 6명의 AI 에이전트가 협업해 정부 지원사업 신청 패키지 초안을 만들어요. AI는 보조 도구 — 본인 판단·검토 필수.",
    accent: "#8da888",
    background: { type: "video", src: "videos/saessak-platform.mp4" },
    meta: { status: "BETA · 라이브" },
    fullRunCost: 60,
    agents: [
      { id: "director",    name: "Director",     title: "작업 총괄",
        specialty: "한 줄 요청 → 5 에이전트에게 작업 분담 + 최종 통합",
        color: "#6ee7ff", hotspot: { x: 50, y: 22 }, cost: 5, stage: 1 },
      { id: "grant-scout", name: "Grant Scout",  title: "지원사업 리서치",
        specialty: "K-Startup · 중기부 · 지자체 공고 매칭 + 적합도 평가",
        color: "#ff8ab3", hotspot: { x: 20, y: 48 }, cost: 10, stage: 2 },
      { id: "plan-writer", name: "Plan Writer",  title: "사업계획서 초안",
        specialty: "문제정의 · 시장성 · 실행계획 · 예산안 6 챕터 작성",
        color: "#7ee787", hotspot: { x: 70, y: 44 }, cost: 20, stage: 3 },
      { id: "eligibility", name: "Eligibility",  title: "자격 검수",
        specialty: "사용자 조건 적합성 + 필요 서류 체크리스트",
        color: "#c4a3ff", hotspot: { x: 32, y: 72 }, cost: 8, stage: 4 },
      { id: "deadline",    name: "Deadline",     title: "제출 관리",
        specialty: "마감일 역산 추진 일정 + 단계별 체크포인트",
        color: "#f2c66d", hotspot: { x: 78, y: 70 }, cost: 7, stage: 5 },
      { id: "critic",      name: "Critic",       title: "자기 비판 · 약점 점검",
        specialty: "위 5명 결과물의 약점 · 과장 · 법적 리스크 비판",
        color: "#ff7474", hotspot: { x: 52, y: 84 }, cost: 10, stage: 6 }
    ]
  };
  window.SAESSAK_PROJECT = SAESSAK_PROJECT;

  // ── 본인 데이터 (localStorage 'saessak.teambuilder.userData') ──
  const USER_DATA_KEY = "saessak.teambuilder.userData";
  function getUserData() {
    try {
      const raw = localStorage.getItem(USER_DATA_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function setUserData(d) {
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(d));
  }
  window.SAESSAK_USER_DATA = { get: getUserData, set: setUserData };

  // ── 이벤트 로그 (UI 표시용, 영구는 Supabase) ──
  const EVENT_LOG_KEY = "teambuilder.events";
  function getEvents() {
    try { return JSON.parse(localStorage.getItem(EVENT_LOG_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function pushEvent(e) {
    const log = getEvents();
    log.push(e);
    while (log.length > 100) log.shift();
    localStorage.setItem(EVENT_LOG_KEY, JSON.stringify(log));
  }

  // ── saessak 헬퍼 안전 래퍼 ──
  function deductTokens(cost, memo) {
    if (window.saessak && typeof window.saessak.deductTokens === "function") {
      return window.saessak.deductTokens(cost, memo);
    }
    return true; // fallback
  }
  function refundTokens(amount, memo) {
    if (window.saessak && typeof window.saessak.refundTokens === "function") {
      window.saessak.refundTokens(amount, memo);
    }
  }
  async function saveAiResult(type, title, content, opts) {
    if (window.saessak && typeof window.saessak.saveAiResult === "function") {
      try { return await window.saessak.saveAiResult(type, title, content, opts || {}); }
      catch (e) { console.warn("[shim] saveAiResult 실패", e); return null; }
    }
    return null;
  }
  function currentUser() {
    try {
      const id = localStorage.getItem("saessak_current_user");
      if (!id) return null;
      const users = JSON.parse(localStorage.getItem("saessak_users") || "[]");
      return users.find(u => u.id === id) || null;
    } catch (e) { return null; }
  }
  function isAdmin(user) {
    if (!user) return false;
    return user.email === "rbshbomber@gmail.com" || user.role === "admin";
  }

  // ── 에이전트 스레드 메모리 (localStorage, 에이전트별 최근 3턴) ──
  const THREAD_LIMIT = 3;
  function threadKey(agentId) { return `saessak.teambuilder.thread.${agentId}`; }
  function loadThread(agentId) {
    try { return JSON.parse(localStorage.getItem(threadKey(agentId)) || "[]"); }
    catch (e) { return []; }
  }
  function appendThread(agentId, brief, responseText) {
    const t = loadThread(agentId);
    t.push({ at: Date.now(), brief, response: (responseText || "").slice(0, 1500) });
    while (t.length > THREAD_LIMIT) t.shift();
    localStorage.setItem(threadKey(agentId), JSON.stringify(t));
  }
  function clearThread(agentId) { localStorage.removeItem(threadKey(agentId)); }
  function buildThreadContext(agentId) {
    const t = loadThread(agentId);
    if (t.length === 0) return "";
    const lines = t.map((h, i) =>
      `[이전 대화 ${i + 1} — ${new Date(h.at).toLocaleString('ko-KR')}]\n사용자 요청: ${h.brief}\n응답 요약: ${h.response.slice(0, 400)}`
    );
    return `\n\n[이전 대화 히스토리 — 이 에이전트의 최근 ${t.length}턴]\n${lines.join("\n\n")}\n\n[현재 요청을 처리할 때 위 히스토리의 맥락을 참고하되, 동일 결과 반복 금지.]`;
  }
  window.saessakThreads = { load: loadThread, clear: clearThread };

  // ── /api/teambuilder 실호출 (서버측 단일 에이전트 호출) ──
  async function callBackendAgent(agentId, userData, request, previousResults, useThread) {
    // 메모리 사용 (단발 호출에만 — 전체 실행은 previousResults가 메모리 역할)
    const effectiveRequest = useThread
      ? (request || "") + buildThreadContext(agentId)
      : (request || "");
    const resp = await fetch("/api/teambuilder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studio: "youth-startup",
        agent: agentId,
        userData: userData || {},
        request: effectiveRequest,
        previousResults: previousResults || {}
      })
    });
    const data = await resp.json();
    if (!resp.ok || !data.ok) {
      throw new Error(data.detail || data.error || `에이전트 호출 실패 (${resp.status})`);
    }
    return data; // { ok, agent, result, attempts, usage }
  }

  // ── 응답을 사람이 읽기 좋게 텍스트로 변환 (JSON → markdown) ──
  function formatAgentResult(agentId, result) {
    if (!result) return "(응답 없음)";
    try {
      if (agentId === "director") {
        let s = "**요약**\n" + (result.summary || "") + "\n\n**분담 계획**\n";
        for (const [k, v] of Object.entries(result.plans || {})) {
          s += `\n• **${k}** — ${v}\n`;
        }
        return s;
      }
      if (agentId === "grant-scout") {
        let s = "**1순위 추천**\n" + (result.topRecommendation || "") + "\n\n**후보 사업**\n";
        for (const c of (result.candidates || [])) {
          s += `\n• **${c.name}** (${c.organization || ""}) — 적합도 ${c.fitGrade || ""}\n  ${c.fitReason || ""}\n  자금: ${c.fundingRange || ""} · 자격: ${c.eligibilityKey || ""} · 마감: ${c.deadlineNote || ""}\n`;
        }
        return s;
      }
      if (agentId === "plan-writer") {
        let s = "**" + (result.title || "사업계획서 초안") + "**\n";
        for (const ch of (result.chapters || [])) {
          s += `\n### ${ch.h}\n${ch.body}\n`;
        }
        return s;
      }
      if (agentId === "eligibility") {
        let s = "**자격 체크**\n";
        for (const c of (result.eligibilityChecks || [])) {
          s += `\n• ${c.targetGrant} — ${c.status}\n  사유: ${(c.reasons || []).join("; ")}\n  부족 데이터: ${(c.missingData || []).join("; ")}\n`;
        }
        s += "\n**서류 체크리스트**\n";
        for (const d of (result.documentChecklist || [])) {
          s += `\n• [${d.required ? "필수" : "선택"}] ${d.documentName} — ${d.note || ""}\n`;
        }
        return s;
      }
      if (agentId === "deadline") {
        let s = "**추진 일정**\n";
        for (const t of (result.timeline || [])) {
          s += `\n• ${t.stage} (${t.startDate || ""} → ${t.endDate || ""}, ${t.daysNeeded}일)\n  ${(t.userActions || []).join("; ")}\n`;
        }
        s += "\n**중요 일정**\n";
        for (const d of (result.criticalDates || [])) {
          s += `\n• ${d.date} — ${d.event} [${d.importance}]\n`;
        }
        return s;
      }
      if (agentId === "critic") {
        let s = "**한 줄 평**\n" + (result.overallVerdict || "") + "\n\n**약점**\n";
        for (const w of (result.weaknesses || [])) {
          s += `\n• [${w.severity}] ${w.chapter} — ${w.issue}\n  개선: ${w.fixSuggestion}\n`;
        }
        s += "\n**누락된 사용자 데이터**\n";
        for (const m of (result.missingUserData || [])) {
          s += `\n• ${m.field} — ${m.why}\n  예시: ${m.exampleAnswer}\n`;
        }
        s += "\n**법적 리스크 표현**\n";
        for (const r of (result.legalRiskFlags || [])) {
          s += `\n• "${r.phrase}" — ${r.risk}\n  대체: ${r.suggestedReplacement}\n`;
        }
        return s;
      }
    } catch (e) {
      console.warn("[shim] formatAgentResult", e);
    }
    return JSON.stringify(result, null, 2);
  }

  // ── Mock 응답 빌더 ──
  function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status, headers: { "Content-Type": "application/json" }
    });
  }

  // ── /api/* 인터셉트 ──
  async function handleApi(url, init) {
    const u = new URL(url, window.location.href);
    const path = u.pathname;
    const method = (init && init.method) || "GET";

    // /api/teambuilder 는 실제 백엔드 — 통과
    if (path === "/api/teambuilder") return originalFetch(url, init);
    // /api/claude, /api/listings 등 다른 실 endpoint도 통과
    if (path === "/api/claude") return originalFetch(url, init);
    if (path === "/api/listings") return originalFetch(url, init);
    if (path === "/api/kstartup-debug") return originalFetch(url, init);

    // ── 계정 정보 ──
    if (path === "/api/me") {
      const user = currentUser();
      if (!user) {
        return jsonResponse({
          user: { name: "게스트", id: "guest" },
          credits: { balance: 0, unlimited: false }
        });
      }
      return jsonResponse({
        user: { name: user.name || user.email || "변승환", id: user.email || user.id },
        credits: {
          balance: Number(user.tokens || 0),
          unlimited: isAdmin(user)
        }
      });
    }

    // ── 가격표 ──
    if (path === "/api/pricing") {
      return jsonResponse({
        plans: [
          { audience: "개인 창업자", name: "Starter", credits: 50, studioLimit: 1, seats: 1,
            monthly: { krw: 0, usd: 0 }, features: ["회원가입 보너스 50토큰", "AI 매칭 무료"] },
          { audience: "예비창업자", name: "Boost",   credits: 200, studioLimit: 3, seats: 1,
            monthly: { krw: 9900, usd: 8 },  features: ["월 200토큰", "사업계획서 AI", "비교 분석"] },
          { audience: "팀",         name: "Team",    credits: 800, studioLimit: 10, seats: 5,
            monthly: { krw: 39000, usd: 29 }, features: ["월 800토큰", "팀 공유", "전체 실행"] }
        ],
        operations: [
          { name: "AI 매칭 추천 (별도)",     unit: "회", credits: 0 },
          { name: "Director 단독",         unit: "회", credits: 5 },
          { name: "Grant Scout 단독",      unit: "회", credits: 10 },
          { name: "Plan Writer 단독",      unit: "회", credits: 20 },
          { name: "Eligibility 단독",      unit: "회", credits: 8 },
          { name: "Deadline 단독",         unit: "회", credits: 7 },
          { name: "Critic 단독",           unit: "회", credits: 10 },
          { name: "전체 실행 (6 에이전트)", unit: "1세트", credits: 60 }
        ]
      });
    }

    // ── 도구팩 (실제 사용 도구) ──
    if (path === "/api/toolpacks") {
      return jsonResponse({
        packs: [
          {
            id: "funding-listings",
            category: "공고 데이터",
            name: "자금지원 공고",
            summary: "K-Startup과 기업마당 자금지원형 공고를 Grant Scout가 우선 참고합니다.",
            agents: ["Grant Scout", "Eligibility", "Deadline"],
            accent: "#6ee7ff",
            state: "active"
          },
          {
            id: "plan-export",
            category: "산출물",
            name: "사업계획서 내보내기",
            summary: "Plan Writer 결과를 제출 전 검토용 문서 초안으로 정리합니다.",
            agents: ["Plan Writer", "Critic"],
            accent: "#7ee787",
            state: "active"
          }
        ]
      });
    }

    // ── 회의 상태 (Codex 분리는 모델 없으니 정직하게 표기) ──
    if (path === "/api/council/status") {
      return jsonResponse({ mode: "single-model", status: "ok", note: "현재 Claude 단일 모델 두 관점" });
    }

    // ── 회의 실행 — 분석가 관점 vs 엔지니어 관점 (둘 다 Claude) ──
    if (path === "/api/council" && method === "POST") {
      let body = {};
      try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
      const user = currentUser();
      const cost = 10;
      if (!isAdmin(user)) {
        if (!user) return jsonResponse({ error: "auth-required", message: "로그인이 필요해요." }, 401);
        if (Number(user.tokens || 0) < cost) {
          return jsonResponse({ error: "tokens-insufficient", message: `토큰 부족 (필요 ${cost}, 보유 ${user.tokens || 0})` }, 402);
        }
      }
      const question = body.question || "내일 무엇을 할까?";
      const context = body.context || "";
      const baseSys = "당신은 새싹매치 청년창업 도우미입니다. 가짜 데이터·합격 보장·법적 위험 표현 금지. AI = 보조 도구.";
      const analystSys = baseSys + " 관점: **사업/시장 분석가**. 시장성·수익성·경쟁·고객 흐름 위주로 답하세요.";
      const engineerSys = baseSys + " 관점: **실행 엔지니어**. 다음 단계의 구체 작업·도구·일정 위주로 답하세요.";
      const directorSys = baseSys + " 관점: **Director**. 위 두 관점을 통합하여 우선순위 5개를 한 줄씩 정리하세요.";

      // 토큰 차감 (실패하면 abort)
      const charged = deductTokens(cost, "Codex회의 (분석가+엔지니어+Director)");
      if (!charged) return jsonResponse({ error: "tokens-insufficient" }, 402);

      const call = async (sys, prompt) => {
        try {
          const r = await fetch("/api/claude", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, system: sys, max_tokens: 1000 })
          });
          const d = await r.json();
          if (!r.ok) throw new Error(d.error || r.status);
          return d.text || "(빈 응답)";
        } catch (e) {
          return "(호출 실패: " + e.message + ")";
        }
      };

      const userPrompt = `질문: ${question}\n\n상황: ${context}`;
      try {
        const [analyst, engineer] = await Promise.all([
          call(analystSys, userPrompt),
          call(engineerSys, userPrompt)
        ]);
        const directorPrompt = `사업/시장 분석가 의견:\n${analyst}\n\n실행 엔지니어 의견:\n${engineer}\n\n위 두 관점을 통합해 우선순위 5개를 한 줄씩 정리해주세요.`;
        const director = await call(directorSys, directorPrompt);
        pushEvent({ time: new Date().toISOString(), type: "council", question, summary: director.slice(0, 200) });
        return jsonResponse({
          claude: analyst,   // (라벨은 호환 위해 유지, 실제로는 '분석가 관점')
          codex: engineer,   // ('엔지니어 관점')
          director,
          creditsCharged: cost,
          creditsRemaining: isAdmin(user) ? null : Number((currentUser() || {}).tokens || 0),
          modeNote: "현재 Claude 단일 모델로 분석가·엔지니어 두 관점 분리. OpenAI 등 추가 모델 도입 시 진짜 모델간 회의로 전환 예정."
        });
      } catch (e) {
        refundTokens(cost, "회의 실패 환불");
        return jsonResponse({ error: "council-failed", message: e.message }, 500);
      }
    }

    // ── 프로젝트 목록 ──
    if (path === "/api/projects" && method === "GET") {
      return jsonResponse({ projects: [SAESSAK_PROJECT] });
    }

    // ── 단일 프로젝트 ──
    const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch && method === "GET") {
      return jsonResponse({ project: SAESSAK_PROJECT });
    }

    // ── 프로젝트 도구팩 ──
    if (path.match(/^\/api\/projects\/[^/]+\/toolpacks/)) {
      return jsonResponse({ ok: true });
    }

    // ── 프로젝트 이벤트 ──
    if (path.match(/^\/api\/projects\/[^/]+\/events$/)) {
      return jsonResponse({ events: getEvents() });
    }

    // ── 프로젝트 산출물 (Supabase) ──
    if (path.match(/^\/api\/projects\/[^/]+\/outputs$/)) {
      if (window.saessak && typeof window.saessak.listMyAiResults === "function") {
        try {
          const list = await window.saessak.listMyAiResults(20);
          const outputs = (list || [])
            .filter(r => r.type === "teambuilder")
            .map(r => ({
              id: r.id,
              title: r.title || "(제목 없음)",
              summary: (r.content || "").slice(0, 120),
              provider: r.metadata && r.metadata.agent ? r.metadata.agent : "teambuilder",
              created_at: r.created_at
            }));
          return jsonResponse({ outputs });
        } catch (e) { /* fall through */ }
      }
      return jsonResponse({ outputs: [] });
    }

    // ── 단일 산출물 ──
    const outputMatch = path.match(/^\/api\/outputs\/([^/]+)$/);
    if (outputMatch) {
      const id = decodeURIComponent(outputMatch[1]);
      if (window.saessak && typeof window.saessak.listMyAiResults === "function") {
        try {
          const list = await window.saessak.listMyAiResults(100);
          const r = (list || []).find(x => x.id === id);
          if (r) {
            return jsonResponse({
              output: {
                id: r.id, title: r.title, content: r.content, summary: r.content.slice(0, 200),
                provider: r.metadata && r.metadata.agent ? r.metadata.agent : "teambuilder"
              }
            });
          }
        } catch (e) {}
      }
      return jsonResponse({ output: null });
    }

    // ── 비용 미리보기 (동적, brief 길이 반영) ──
    if (path === "/api/dispatch-cost") {
      let body = {};
      try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
      const briefLen = (body.brief || "").length;
      const agentId = body.agent;
      const agent = SAESSAK_PROJECT.agents.find(a => a.id === agentId);
      const baseCost = agent ? agent.cost : 5;
      // brief가 길수록 + 0.5씩 (200자 초과 시 1당 0.05)
      const extra = Math.max(0, Math.ceil((briefLen - 200) * 0.05));
      const total = baseCost + extra;
      return jsonResponse({
        estimated: total,
        baseCost,
        extra,
        currency: "credits",
        note: extra > 0 ? `기본 ${baseCost} + 길이 가산 ${extra}` : `기본 ${baseCost}`
      });
    }

    // ── 디스패치 (실제 백엔드 호출) ──
    if (path === "/api/dispatch" && method === "POST") {
      let body = {};
      try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
      const user = currentUser();
      const agent = SAESSAK_PROJECT.agents.find(a => a.id === body.agent);
      if (!agent) return jsonResponse({ error: "agent-not-found" }, 404);

      const briefLen = (body.brief || "").length;
      const extra = Math.max(0, Math.ceil((briefLen - 200) * 0.05));
      const cost = agent.cost + extra;

      if (!isAdmin(user)) {
        if (!user) return jsonResponse({ error: "auth-required", message: "로그인이 필요해요." }, 401);
        if (Number(user.tokens || 0) < cost) {
          return jsonResponse({ error: "tokens-insufficient", message: `토큰 부족 (필요 ${cost}, 보유 ${user.tokens || 0})` }, 402);
        }
      }

      // 토큰 차감 (관리자 자동 우회)
      if (!isAdmin(user)) {
        const charged = deductTokens(cost, `${agent.name} 단독 호출`);
        if (!charged) return jsonResponse({ error: "tokens-insufficient" }, 402);
      }

      try {
        const userData = getUserData();
        const previousResults = body.previousResults || {};
        const isStandalone = !previousResults || Object.keys(previousResults).length === 0;
        // 단독 호출일 때만 thread memory 사용 (전체 실행 체인은 자체 컨텍스트 누적)
        const data = await callBackendAgent(body.agent, userData, body.brief, previousResults, isStandalone);
        const requestId = "req-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

        // 응답 텍스트화
        const text = formatAgentResult(body.agent, data.result);

        // 메모리에 추가 (단독 호출만)
        if (isStandalone) appendThread(body.agent, body.brief, text);

        // Supabase에 저장 (관리자/로그인 사용자 모두)
        if (user) {
          await saveAiResult(
            "teambuilder",
            `${agent.name} — ${(body.brief || "").slice(0, 50)}`,
            text,
            {
              metadata: {
                agent: body.agent, brief: body.brief, raw: data.result,
                requestId, attempts: data.attempts, usage: data.usage
              }
            }
          );
        }

        // UI 이벤트 로그
        pushEvent({
          time: new Date().toISOString(),
          type: "dispatch", agent: body.agent, agentName: agent.name,
          brief: body.brief, response: text, requestId
        });

        return jsonResponse({
          requestId,
          agent: body.agent,
          creditsCharged: isAdmin(user) ? 0 : cost,
          creditsRemaining: isAdmin(user) ? null : Number((currentUser() || {}).tokens || 0),
          unlimited: isAdmin(user),
          response: text,
          raw: data.result
        });
      } catch (e) {
        if (!isAdmin(user)) refundTokens(cost, `${agent.name} 실패 환불`);
        return jsonResponse({ error: "dispatch-failed", message: e.message }, 500);
      }
    }

    // ── 전체 실행 (6 에이전트 자동 체인) ──
    if (path === "/api/dispatch-all" && method === "POST") {
      let body = {};
      try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
      const user = currentUser();
      const cost = SAESSAK_PROJECT.fullRunCost;

      if (!isAdmin(user)) {
        if (!user) return jsonResponse({ error: "auth-required", message: "로그인이 필요해요." }, 401);
        if (Number(user.tokens || 0) < cost) {
          return jsonResponse({ error: "tokens-insufficient", message: `토큰 부족 (필요 ${cost}, 보유 ${user.tokens || 0})` }, 402);
        }
        const charged = deductTokens(cost, "전체 실행 (6 에이전트)");
        if (!charged) return jsonResponse({ error: "tokens-insufficient" }, 402);
      }

      const userData = getUserData();
      const request = body.brief || "";
      const previousResults = {};
      const chainResults = {};
      const order = ["director", "grant-scout", "plan-writer", "eligibility", "deadline", "critic"];
      const errors = [];

      // 진행 이벤트 발행 (UI는 events 폴링)
      const runId = "run-" + Date.now().toString(36);
      pushEvent({ time: new Date().toISOString(), type: "run-start", runId, agents: order });

      for (const agentId of order) {
        const agent = SAESSAK_PROJECT.agents.find(a => a.id === agentId);
        pushEvent({ time: new Date().toISOString(), type: "run-step-start", runId, agent: agentId, agentName: agent.name });
        try {
          const data = await callBackendAgent(agentId, userData, request, previousResults);
          chainResults[agentId] = data.result;
          // previousResults 키는 camelCase로 변환 (api/teambuilder.js와 일치)
          const camelKey = agentId.replace(/-(\w)/g, (_, c) => c.toUpperCase());
          previousResults[camelKey] = data.result;
          const text = formatAgentResult(agentId, data.result);
          pushEvent({
            time: new Date().toISOString(),
            type: "run-step-done", runId, agent: agentId, agentName: agent.name,
            response: text
          });

          // Supabase 저장
          if (user) {
            await saveAiResult(
              "teambuilder",
              `${agent.name} (전체 실행) — ${request.slice(0, 40)}`,
              text,
              { metadata: { agent: agentId, runId, brief: request, raw: data.result } }
            );
          }
        } catch (e) {
          errors.push({ agent: agentId, error: e.message });
          pushEvent({ time: new Date().toISOString(), type: "run-step-error", runId, agent: agentId, error: e.message });
          // 한 단계 실패해도 계속 시도 (Critic이라도 돌아가게)
        }
      }

      pushEvent({
        time: new Date().toISOString(),
        type: "run-complete", runId,
        completed: Object.keys(chainResults), errors: errors.length
      });

      return jsonResponse({
        runId,
        results: chainResults,
        errors,
        creditsCharged: isAdmin(user) ? 0 : cost,
        creditsRemaining: isAdmin(user) ? null : Number((currentUser() || {}).tokens || 0)
      });
    }

    // ── 개발용 충전 (관리자만) ──
    if (path === "/api/billing/dev-topup" && method === "POST") {
      const user = currentUser();
      if (!isAdmin(user)) return jsonResponse({ error: "forbidden" }, 403);
      const users = JSON.parse(localStorage.getItem("saessak_users") || "[]");
      const idx = users.findIndex(u => u.id === user.id);
      if (idx >= 0) {
        users[idx].tokens = Math.max(users[idx].tokens || 0, 0) + 100;
        localStorage.setItem("saessak_users", JSON.stringify(users));
        return jsonResponse({ ok: true, balance: users[idx].tokens });
      }
      return jsonResponse({ ok: false }, 404);
    }

    // ── 스튜디오 생성 (v0.2 예정) ──
    if (path === "/api/studios" && method === "POST") {
      return jsonResponse({ ok: false, message: "스튜디오 생성은 v0.2에서 활성화돼요." }, 501);
    }

    if (path === "/api/open" && method === "POST") return jsonResponse({ ok: true });

    if (path.startsWith("/api/")) {
      console.warn("[teambuilder-shim] unmatched API:", method, path);
      return jsonResponse({ ok: true });
    }
    return originalFetch(url, init);
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = function (url, init) {
    try {
      const u = typeof url === "string" ? url : (url && url.url);
      if (u && /(^\/api\/)|(^https?:\/\/[^/]+\/api\/)/.test(u)) {
        return handleApi(u, init);
      }
    } catch (e) {}
    return originalFetch(url, init);
  };

  window.saessakShim = {
    project: SAESSAK_PROJECT,
    deductTokens, refundTokens, saveAiResult,
    getUserData, setUserData,
    callBackendAgent, formatAgentResult,
    pushEvent, getEvents
  };
})();
