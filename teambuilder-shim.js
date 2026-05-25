/*
 * teambuilder-shim.js — Agent Studio 백엔드 stub + 새싹매치 토큰 통합
 *
 * 원본은 Mini Mac에서 돌아가는 server.js(Node)에 의존. 여기서는 Vercel
 * 서버리스라 server.js가 없어서 /api/* 요청을 가로채 모의 데이터를 돌려준다.
 *
 * /api/dispatch와 /api/council만 실제로 Claude를 호출 — 나머지는 정적.
 * 토큰은 새싹매치 supabase-config.js의 user.tokens를 그대로 사용.
 */
(() => {
  "use strict";

  // ── 새싹매치 에이전트 매니페스트 (CLAUDE.md / agents/README.md 기반) ──
  const SAESSAK_PROJECT = {
    id: "saessak-match",
    title: "새싹매치",
    subtitle: "청년창업 지원사업 매칭 SaaS",
    summary: "Director가 한 줄 요청을 받아서 적합한 에이전트에게 위임. 모든 산출물은 새싹매치 톤·법적 안전 규칙을 따른다.",
    accent: "#5b8a72",
    background: { type: "video", src: "videos/saessak-platform.mp4" },
    meta: { status: "라이브" },
    agents: [
      {
        id: "director",
        name: "Director",
        title: "작업 총괄",
        specialty: "한 줄 요청 → 적합 에이전트 위임 · 결과 검수 · 4가지 제약 검사",
        color: "#7c8da3",
        hotspot: { x: 62, y: 32 }
      },
      {
        id: "frontend",
        name: "Frontend",
        title: "saessak-frontend",
        specialty: "HTML/CSS/JS · Pretendard + sage 톤 · 한자 장식 금지",
        color: "#8ab17d",
        hotspot: { x: 22, y: 56 }
      },
      {
        id: "api",
        name: "API",
        title: "saessak-api",
        specialty: "Vercel 서버리스 함수 · Supabase · Claude API 프록시",
        color: "#5b8a72",
        hotspot: { x: 36, y: 48 }
      },
      {
        id: "deploy",
        name: "Deploy",
        title: "saessak-deploy",
        specialty: "git push → Vercel 자동 빌드 · 환경변수 점검",
        color: "#c9a44c",
        hotspot: { x: 70, y: 60 }
      },
      {
        id: "doc-writer",
        name: "Doc Writer",
        title: "doc-writer",
        specialty: "docx/xlsx/pptx 산출물 · 사업계획서 · 발표 슬라이드",
        color: "#a06da3",
        hotspot: { x: 46, y: 70 }
      },
      {
        id: "research",
        name: "지원사업 리서치",
        title: "web-research",
        specialty: "K-Startup·중기부·지자체 공고 조사 · 가짜 데이터 금지",
        color: "#c8754f",
        hotspot: { x: 16, y: 76 }
      }
    ]
  };

  // ── 토큰 이코노미 (새싹매치 기존 가격표) ──
  const DISPATCH_COST = 5; // 1회 디스패치 = 5 토큰
  const COUNCIL_COST = 10; // Codex×Claude 회의 = 10 토큰

  // ── 유틸: saessak 헬퍼 안전 호출 ──
  function getUser() {
    try {
      const raw = localStorage.getItem("saessak.user");
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function setUser(user) {
    localStorage.setItem("saessak.user", JSON.stringify(user));
  }
  function isAdmin(user) {
    return !!user && (user.email === "rbshbomber@gmail.com" || user.role === "admin");
  }
  function chargeTokens(amount, label) {
    const user = getUser();
    if (!user) return { ok: true, charged: 0, remaining: null, unlimited: false };
    if (isAdmin(user)) return { ok: true, charged: 0, remaining: user.tokens ?? null, unlimited: true };
    const balance = Number(user.tokens || 0);
    if (balance < amount) {
      return { ok: false, error: "tokens-insufficient", message: `토큰 부족 (필요 ${amount} · 보유 ${balance})` };
    }
    user.tokens = balance - amount;
    user.history = user.history || [];
    user.history.unshift({ t: Date.now(), label: label || "AI 호출", delta: -amount, balance: user.tokens });
    setUser(user);
    return { ok: true, charged: amount, remaining: user.tokens, unlimited: false };
  }

  // ── Claude 호출 (ai-client.js의 saessak.callClaude 활용) ──
  async function callClaude(prompt, systemPrompt) {
    if (window.saessak && typeof window.saessak.callClaude === "function") {
      return window.saessak.callClaude(prompt, {
        system: systemPrompt || "당신은 새싹매치의 에이전트입니다. 가짜 데이터·합격 보장 표현·법적 위험 표현을 피하고, AI는 보조 도구임을 명시합니다.",
        max_tokens: 1500,
        fallback: "(AI 응답을 가져오지 못했어요. 잠시 후 다시 시도해주세요.)"
      });
    }
    // saessak.callClaude이 아직 안 로드된 경우 폴백
    return "(AI 클라이언트가 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요.)";
  }

  // ── Mock 응답 빌더 ──
  function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }

  async function handleApi(url, init) {
    const u = new URL(url, window.location.href);
    const path = u.pathname;
    const method = (init && init.method) || "GET";

    // ── 계정 정보 ──
    if (path === "/api/me") {
      const user = getUser();
      if (!user) {
        return jsonResponse({
          user: { name: "게스트", id: "guest" },
          credits: { balance: 0, unlimited: false }
        });
      }
      return jsonResponse({
        user: { name: user.name || user.email || "변승환", id: user.email || "user" },
        credits: { balance: user.tokens ?? 50, unlimited: isAdmin(user) }
      });
    }

    // ── 가격표 (정적, 새싹매치 토큰 가격표 기반) ──
    if (path === "/api/pricing") {
      return jsonResponse({
        plans: [
          { audience: "개인 창업자", name: "Starter", credits: 50, studioLimit: 1, seats: 1,
            monthly: { krw: 0, usd: 0 }, features: ["회원가입 보너스", "기본 매칭", "AI 보조 도구"] },
          { audience: "예비창업자", name: "Boost", credits: 200, studioLimit: 3, seats: 1,
            monthly: { krw: 49000, usd: 39 }, features: ["사업계획서 AI", "심사 시뮬레이션", "비교 분석"] },
          { audience: "팀 사용자", name: "Team", credits: 800, studioLimit: 10, seats: 5,
            monthly: { krw: 199000, usd: 159 }, features: ["멘토링 매칭", "발표 슬라이드", "라이브러리"] }
        ],
        operations: [
          { name: "AI 매칭 추천", unit: "회", credits: 0 },
          { name: "에이전트 디스패치", unit: "회", credits: DISPATCH_COST },
          { name: "Codex×Claude 회의", unit: "회", credits: COUNCIL_COST },
          { name: "사업계획서 AI", unit: "건", credits: 20 },
          { name: "심사 시뮬레이션", unit: "건", credits: 50 },
          { name: "발표 슬라이드", unit: "건", credits: 30 }
        ]
      });
    }

    // ── 도구팩 (정적) ──
    if (path === "/api/toolpacks") {
      return jsonResponse({
        packs: [
          { id: "supabase", name: "Supabase Connect", desc: "Auth · DB · Storage", state: "ready" },
          { id: "kstartup", name: "K-Startup API", desc: "지원사업 공고 실시간 조회", state: "ready" },
          { id: "claude", name: "Claude Sonnet 4.6", desc: "에이전트 추론 엔진", state: "ready" },
          { id: "vercel", name: "Vercel Deploy", desc: "git push 자동 빌드", state: "ready" }
        ]
      });
    }

    // ── 회의 상태 ──
    if (path === "/api/council/status") {
      return jsonResponse({ mode: "local", status: "ok" });
    }

    // ── 회의 실행 ──
    if (path === "/api/council" && method === "POST") {
      const charge = chargeTokens(COUNCIL_COST, "Codex×Claude 회의");
      if (!charge.ok) return jsonResponse(charge, 402);
      let body = {};
      try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
      const question = body.question || "내일 무엇을 할까?";
      const context = body.context || "";
      const claudePrompt = `다음 질문에 Claude 관점으로 답해주세요.\n\n질문: ${question}\n\n상황: ${context}`;
      const codexPrompt = `다음 질문에 Codex(개발자 관점)로 답해주세요.\n\n질문: ${question}\n\n상황: ${context}`;
      const directorPrompt = `다음 질문에 대해 Claude와 Codex 양쪽 의견을 듣고 통합 정리하는 Director 입장에서 답하세요. 우선순위 5개로 정리.\n\n질문: ${question}`;
      const [claudeAns, codexAns, directorAns] = await Promise.all([
        callClaude(claudePrompt),
        callClaude(codexPrompt),
        callClaude(directorPrompt)
      ]);
      return jsonResponse({
        claude: claudeAns,
        codex: codexAns,
        director: directorAns,
        creditsCharged: charge.charged,
        creditsRemaining: charge.remaining
      });
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

    // ── 프로젝트 도구팩 (POST는 무시) ──
    if (path.match(/^\/api\/projects\/[^/]+\/toolpacks/)) {
      return jsonResponse({ ok: true });
    }

    // ── 프로젝트 이벤트 (events.jsonl 폴링) ──
    if (path.match(/^\/api\/projects\/[^/]+\/events$/)) {
      const log = JSON.parse(localStorage.getItem("teambuilder.events") || "[]");
      return jsonResponse({ events: log });
    }

    // ── 프로젝트 산출물 ──
    if (path.match(/^\/api\/projects\/[^/]+\/outputs$/)) {
      return jsonResponse({ outputs: [] });
    }

    // ── 단일 산출물 ──
    if (path.match(/^\/api\/outputs\//)) {
      return jsonResponse({ output: null });
    }

    // ── 디스패치 비용 미리보기 ──
    if (path === "/api/dispatch-cost") {
      return jsonResponse({ estimated: DISPATCH_COST, currency: "credits" });
    }

    // ── 디스패치 (실제 Claude 호출) ──
    if (path === "/api/dispatch" && method === "POST") {
      let body = {};
      try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
      const charge = chargeTokens(DISPATCH_COST, `에이전트 디스패치 (${body.agent})`);
      if (!charge.ok) return jsonResponse(charge, 402);
      const agent = SAESSAK_PROJECT.agents.find(a => a.id === body.agent);
      const agentName = agent ? agent.name : body.agent;
      const agentRole = agent ? agent.specialty : "";
      const systemPrompt = `당신은 새싹매치의 "${agentName}" 에이전트입니다. 역할: ${agentRole}. 가짜 데이터·합격 보장·법적 위험 표현 금지. AI는 보조 도구임을 명시.`;
      const answer = await callClaude(body.brief || "", systemPrompt);
      const requestId = "req-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      // 이벤트 로그에 추가
      const log = JSON.parse(localStorage.getItem("teambuilder.events") || "[]");
      log.push({
        time: new Date().toISOString(),
        type: "dispatch",
        agent: body.agent,
        agentName,
        brief: body.brief,
        response: answer,
        requestId
      });
      while (log.length > 50) log.shift();
      localStorage.setItem("teambuilder.events", JSON.stringify(log));
      return jsonResponse({
        requestId,
        agent: body.agent,
        creditsCharged: charge.charged,
        creditsRemaining: charge.remaining,
        unlimited: charge.unlimited,
        response: answer
      });
    }

    // ── 개발용 충전 (관리자만) ──
    if (path === "/api/billing/dev-topup" && method === "POST") {
      const user = getUser();
      if (!user || !isAdmin(user)) {
        return jsonResponse({ error: "forbidden" }, 403);
      }
      user.tokens = Math.max(user.tokens || 0, 0) + 100;
      setUser(user);
      return jsonResponse({ ok: true, balance: user.tokens });
    }

    // ── 스튜디오 생성 (저장은 localStorage) ──
    if (path === "/api/studios" && method === "POST") {
      return jsonResponse({ ok: true, message: "스튜디오 생성은 다음 단계에서 활성화돼요." }, 501);
    }

    // ── 외부 링크 열기 ──
    if (path === "/api/open" && method === "POST") {
      return jsonResponse({ ok: true });
    }

    // 매칭되지 않은 /api/* — 빈 OK
    if (path.startsWith("/api/")) {
      console.warn("[teambuilder-shim] unmatched API:", method, path);
      return jsonResponse({ ok: true });
    }

    // /api/ 가 아니면 원본 fetch 호출
    return originalFetch(url, init);
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = function (url, init) {
    try {
      const u = typeof url === "string" ? url : (url && url.url);
      if (u && /(^\/api\/)|(^https?:\/\/[^/]+\/api\/)/.test(u)) {
        return handleApi(u, init);
      }
    } catch (e) { /* fall through */ }
    return originalFetch(url, init);
  };

  // 디버깅 헬퍼
  window.saessakShim = {
    project: SAESSAK_PROJECT,
    chargeTokens,
    callClaude,
    getUser,
    setUser
  };
})();
