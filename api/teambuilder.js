// Vercel Serverless Function: /api/teambuilder
// 새싹매치 팀빌더 — 단일 에이전트 호출 (클라이언트가 순차 호출, 컨텍스트 누적)
//
// 입력 (POST JSON):
// {
//   studio: 'youth-startup',
//   agent: 'director' | 'grant-scout' | 'plan-writer' | 'eligibility' | 'deadline' | 'critic',
//   userData: { item, strength, funding, prototype, targetGrant, field, region, age },
//   request: '한 줄 요청',
//   previousResults: { director?: {...}, grantScout?: {...}, ... }  // 컨텍스트 누적
// }
//
// 출력:
// 성공: { ok: true, agent, result: {...}, attempts, usage }
// 실패: { ok: false, agent, error: 'parse_failed'|'api_error'|'validation_failed', detail, attempts }

import fs from 'fs';
import path from 'path';

const STUDIOS_PATH = path.join(process.cwd(), 'data', 'agent-studios.json');

// 데이터는 cold start 시 1회만 로드
let STUDIOS_CACHE = null;
function loadStudios() {
  if (STUDIOS_CACHE) return STUDIOS_CACHE;
  try {
    const raw = fs.readFileSync(STUDIOS_PATH, 'utf8');
    STUDIOS_CACHE = JSON.parse(raw);
    return STUDIOS_CACHE;
  } catch (e) {
    console.error('[teambuilder] agent-studios.json 로드 실패', e);
    throw new Error('agent-studios.json 로드 실패: ' + e.message);
  }
}

// ─────────────────────────────────────────────────────────
// 프롬프트 빌더 — globalRules + 에이전트 systemPrompt + 컨텍스트 누적
// ─────────────────────────────────────────────────────────
function buildSystemPrompt(globalRules, agentDef) {
  const rules = globalRules.absolute.map((r, i) => `${i + 1}. ${r}`).join('\n');
  return `[글로벌 규칙 — 절대 위반 금지]
${rules}

[톤 가이드]
${globalRules.tone}

[당신의 역할]
${agentDef.systemPrompt}

[출력 형식]
반드시 다음 스키마의 JSON으로만 응답하세요. 마크다운 코드블록(\`\`\`) 사용 금지, 추가 설명 금지.

${JSON.stringify(agentDef.outputSchema, null, 2)}`;
}

// ─────────────────────────────────────────────────────────
// K-Startup 공고 — Grant Scout 자동 컨텍스트 주입
// 사용자의 field/region에 매칭되는 청년 공고 상위 8건을 user prompt에 인용.
// 실패 시 null 반환 — Grant Scout는 기본 지식으로 답변.
// ─────────────────────────────────────────────────────────
async function fetchKstartupContext(userData, req) {
  try {
    const host = req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || (host && host.startsWith('localhost') ? 'http' : 'https');
    const url = `${proto}://${host}/api/listings?youth=1&pages=3`;
    const resp = await fetch(url, { headers: { accept: 'application/json' } });
    if (!resp.ok) return null;
    const data = await resp.json();
    let listings = Array.isArray(data.listings) ? data.listings : [];
    if (listings.length === 0) return null;

    // 사용자 분야·지역과 매칭 점수 부여
    const field = (userData.field || '').toLowerCase();
    const region = (userData.region || '').toLowerCase();
    const scoreOf = (l) => {
      let s = 0;
      const blob = (l.title + ' ' + l.field + ' ' + l.regionLabel + ' ' + l.summary).toLowerCase();
      if (field && blob.includes(field)) s += 3;
      if (region && blob.includes(region)) s += 2;
      if (l.region === 'national' || l.regionLabel === '전국') s += 1;
      if (l.age === '만 39세 이하') s += 1;
      return s;
    };
    listings.sort((a, b) => scoreOf(b) - scoreOf(a));
    return listings.slice(0, 8);
  } catch (e) {
    console.warn('[teambuilder] kstartup fetch failed:', e.message);
    return null;
  }
}

function buildUserPrompt(userData, request, previousResults, agentId, kstartupContext) {
  const dataSection = `[사용자 본인 데이터]
- 사업 아이템: ${userData.item || '(미입력)'}
- 운영자 강점: ${userData.strength || '(미입력)'}
- 자금 상황: ${userData.funding || '(미입력)'}
- 시제품 유무: ${userData.prototype || '(미입력)'}
- 신청 희망 사업: ${userData.targetGrant || '(미정)'}
- 분야: ${userData.field || '(미입력)'}
- 지역: ${userData.region || '(미입력)'}
- 연령: ${userData.age || '(미입력)'}`;

  const requestSection = `[사용자 한 줄 요청]
${request || '(요청 없음 — 본인 데이터 기반 종합 컨설팅)'}`;

  // 컨텍스트 누적 — 이전 에이전트 결과를 다음 에이전트가 참조
  let contextSection = '';
  if (previousResults && Object.keys(previousResults).length > 0) {
    const parts = [];
    if (previousResults.director) {
      parts.push(`[Director 분담 계획]\n${JSON.stringify(previousResults.director, null, 2)}`);
    }
    if (previousResults.grantScout && agentId !== 'grant-scout') {
      parts.push(`[Grant Scout 추천 사업]\n${JSON.stringify(previousResults.grantScout, null, 2)}`);
    }
    if (previousResults.planWriter && (agentId === 'eligibility' || agentId === 'critic')) {
      parts.push(`[Plan Writer 사업계획서 초안]\n${JSON.stringify(previousResults.planWriter, null, 2)}`);
    }
    if (previousResults.eligibility && agentId === 'critic') {
      parts.push(`[Eligibility 자격 체크 결과]\n${JSON.stringify(previousResults.eligibility, null, 2)}`);
    }
    if (previousResults.deadline && agentId === 'critic') {
      parts.push(`[Deadline 추진 일정]\n${JSON.stringify(previousResults.deadline, null, 2)}`);
    }
    contextSection = '\n\n' + parts.join('\n\n');
  }

  // K-Startup 공고 컨텍스트 (Grant Scout 전용)
  let kstartupSection = '';
  if (agentId === 'grant-scout' && Array.isArray(kstartupContext) && kstartupContext.length > 0) {
    const lines = kstartupContext.map((c, i) =>
      `${i + 1}. ${c.title} — ${c.org || '기관미상'}\n   분야: ${c.field || ''} · 지역: ${c.regionLabel || ''} · 자금: ${c.money || '미공시'} · 마감: ${c.deadline || '확인필요'}\n   대상: ${c.target || c.age || ''}\n   요약: ${(c.summary || '').slice(0, 180)}\n   URL: ${c.url || ''}`
    );
    kstartupSection = `\n\n[K-Startup 실시간 공고 — 사용자 분야·지역과 매칭된 ${lines.length}건]\n${lines.join('\n\n')}\n\n위 목록을 우선 검토하고, 사용자 본인 데이터와 매칭 이유를 명시하여 candidates 배열에 인용하세요. 목록에 없는 사업도 추천 가능하지만, 이 목록의 사업을 더 신뢰하세요.`;
  }

  return `${dataSection}\n\n${requestSection}${contextSection}${kstartupSection}`;
}

// ─────────────────────────────────────────────────────────
// JSON 파싱 + 스키마 검증
// ─────────────────────────────────────────────────────────
function extractJson(text) {
  if (!text || typeof text !== 'string') return null;
  // 코드블록 제거
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*$/gm, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;

  // 가장 넓은 JSON 후보부터 줄여가며 파싱한다. 긴 초안에 여분 텍스트가 붙어도 살리기 위함.
  for (let end = last; end > first; end = cleaned.lastIndexOf('}', end - 1)) {
    if (end === -1) break;
    const candidate = cleaned.slice(first, end + 1);
    try {
      return JSON.parse(candidate);
    } catch (e) {
      if (end === first) console.warn('[teambuilder] JSON parse fail', e.message, 'text:', cleaned.slice(0, 200));
    }
  }
  return null;
}

function validateAgainstSchema(result, schema) {
  // 1단계 키 존재 여부만 체크 (느슨한 검증)
  if (!result || typeof result !== 'object') return { ok: false, missing: ['(전체 객체 누락)'] };
  const missing = [];
  for (const key of Object.keys(schema)) {
    if (!(key in result)) missing.push(key);
  }
  return { ok: missing.length === 0, missing };
}

// ─────────────────────────────────────────────────────────
// Claude API 호출 (1회 재시도 포함)
// ─────────────────────────────────────────────────────────
async function callClaude({ apiKey, systemPrompt, userPrompt, maxTokens, model }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens || 2500,
      system: systemPrompt,
      messages: [{ role: 'user', content: [{ type: 'text', text: userPrompt }] }]
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    const err = new Error(`Claude API HTTP ${res.status}`);
    err.code = 'api_error';
    err.status = res.status;
    err.detail = errText;
    throw err;
  }
  const data = await res.json();
  let text = '';
  if (Array.isArray(data.content)) {
    text = data.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  }
  return { text, usage: data.usage || null };
}

async function repairJsonWithClaude({ apiKey, rawText, schema, agentId }) {
  if (!rawText || rawText.length < 20) return null;
  const systemPrompt = `당신은 깨진 AI 응답을 유효한 JSON으로 복구하는 변환기입니다.
추가 설명 없이 JSON 객체만 반환하세요.
원문에 없는 사실을 새로 만들지 말고, 누락된 배열은 []로, 누락된 문자열은 "확인 필요"로 채우세요.`;
  const userPrompt = `[에이전트]
${agentId}

[필수 JSON 스키마]
${JSON.stringify(schema, null, 2)}

[원문 응답]
${rawText.slice(0, 12000)}

위 원문을 스키마에 맞는 유효한 JSON 객체 하나로만 변환하세요.`;
  try {
    const { text } = await callClaude({ apiKey, systemPrompt, userPrompt, maxTokens: 2200 });
    return extractJson(text);
  } catch (e) {
    console.warn('[teambuilder] JSON repair failed:', e.message);
    return null;
  }
}

function fallbackResultFromText(agentId, rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;
  const body = text.slice(0, 6000);

  if (agentId === 'plan-writer') {
    return {
      title: '사업계획서 초안',
      chapters: [{ h: '초안 본문', body }],
      assumptions: ['AI 응답이 JSON 형식으로 구조화되지 않아 원문 초안을 보존했습니다. 제출 전 본인 검토가 필요합니다.'],
      missingInputs: ['정량 수치, 실제 고객/사용자 데이터, 정확한 신청 공고명, 지원금 규모']
    };
  }
  if (agentId === 'director') {
    return {
      summary: body.slice(0, 1200),
      plans: {
        grantScout: '지원사업 후보와 자금지원형 여부를 재확인합니다.',
        planWriter: '원문 내용을 사업계획서 초안으로 재구성합니다.',
        eligibility: '자격요건과 제출서류를 확인합니다.',
        deadline: '마감일 기준 실행 일정을 역산합니다.',
        critic: '근거 부족과 과장 표현을 점검합니다.'
      },
      priority: ['공고와 자격요건 확인', '사업계획서 초안 작성', '근거 부족 항목 보완'],
      missingData: ['AI 응답 구조화 실패로 세부 누락 정보 재확인 필요']
    };
  }
  if (agentId === 'grant-scout') {
    return {
      topRecommendation: body.slice(0, 1200),
      candidates: [],
      searchGaps: ['AI 응답이 구조화되지 않아 추천 공고 목록을 확정하지 못했습니다. 원문 요약을 확인하고 공고 링크를 재검증하세요.']
    };
  }
  if (agentId === 'eligibility') {
    return {
      eligibilityChecks: [{ targetGrant: '확인 필요', status: '불명확', reasons: [body.slice(0, 1200)], missingData: ['공고 원문', '사업자 등록 상태', '연령/지역 요건'] }],
      documentChecklist: [],
      questionsForUser: ['현재 사업자 등록 상태는 무엇인가요?', '지원하려는 정확한 공고명은 무엇인가요?']
    };
  }
  if (agentId === 'deadline') {
    return {
      timeline: [{ stage: '일정 확인', startDate: '확인 필요', endDate: '확인 필요', daysNeeded: 0, userActions: [body.slice(0, 1200)] }],
      criticalDates: [],
      todayActions: ['지원 공고의 정확한 마감일을 확인하세요.']
    };
  }
  if (agentId === 'critic') {
    return {
      overallVerdict: body.slice(0, 1200),
      weaknesses: [],
      missingUserData: [],
      legalRiskFlags: []
    };
  }
  return null;
}

function scrubUnverifiedNumbers(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\d+\s*[~∼-]\s*\d+\s*(?:개월|만원|억원|명|건|곳|개|%|원|인)/g, '확인 필요')
    .replace(/\d[\d,]*\s*(?:개월|만원|억원|명|건|곳|개|%|원|인)\s*이상/g, '확인 필요')
    .replace(/\d[\d,]*\s*(?:개월|만원|억원|명|건|곳|개|%|원|인)/g, '확인 필요')
    .replace(/확인 필요\s*월/g, '확인 필요')
    .replace(/월\s*확인 필요\s*수준/g, '확인 필요 수준');
}

function sanitizeResult(agentId, result) {
  if (!result || typeof result !== 'object') return result;
  if (agentId !== 'plan-writer') return result;

  return {
    ...result,
    chapters: Array.isArray(result.chapters)
      ? result.chapters.map(chapter => ({
        ...chapter,
        body: scrubUnverifiedNumbers(chapter.body)
      }))
      : [],
    assumptions: Array.isArray(result.assumptions)
      ? result.assumptions.map(scrubUnverifiedNumbers)
      : [],
    missingInputs: Array.isArray(result.missingInputs)
      ? result.missingInputs.map(scrubUnverifiedNumbers)
      : []
  };
}

// ─────────────────────────────────────────────────────────
// 핸들러
// ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      ok: false,
      error: 'no_api_key',
      detail: 'CLAUDE_API_KEY 환경 변수가 설정되지 않았습니다.'
    });
  }

  try {
    const { studio: studioId, agent: agentId, userData, request, previousResults } = req.body || {};

    if (!studioId || !agentId) {
      return res.status(400).json({ ok: false, error: 'missing_params', detail: 'studio와 agent 필수' });
    }

    // 스튜디오·에이전트 찾기
    const studios = loadStudios();
    const studio = (studios.studios || []).find(s => s.id === studioId);
    if (!studio) return res.status(404).json({ ok: false, error: 'studio_not_found', detail: studioId });

    const agentDef = (studio.agents || []).find(a => a.id === agentId);
    if (!agentDef) return res.status(404).json({ ok: false, error: 'agent_not_found', detail: agentId });

    // 사용자 데이터 게이트 — 일반론 방지
    if (!userData || !userData.item) {
      return res.status(400).json({
        ok: false,
        error: 'missing_user_data',
        detail: '사업 아이템(item)은 필수입니다. 일반론적 결과 방지.'
      });
    }

    // K-Startup 컨텍스트 — Grant Scout 전용 (다른 에이전트는 skip)
    let kstartupContext = null;
    if (agentId === 'grant-scout') {
      kstartupContext = await fetchKstartupContext(userData, req);
    }

    // 시스템 프롬프트 + 사용자 프롬프트 빌드
    const systemPrompt = buildSystemPrompt(studios.globalRules, agentDef);
    const userPrompt = buildUserPrompt(userData, request, previousResults, agentId, kstartupContext);
    const maxTokens = (agentDef.estimatedTokens || 1500) + 500; // 여유분

    // 호출 + 재시도
    let attempts = 0;
    let lastError = null;
    let parsedResult = null;
    let totalUsage = null;
    let lastRawText = '';
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        const retryHint = attempts > 1
          ? '\n\n[재시도 지시]\n직전 응답은 JSON 파싱 또는 스키마 검증에 실패했습니다. 이번 응답은 반드시 { 로 시작해서 } 로 끝나는 유효한 JSON 객체 하나만 반환하세요. 줄바꿈이 들어간 본문은 JSON 문자열 안에 \\n으로 이스케이프하세요.'
          : '';
        const { text, usage } = await callClaude({ apiKey, systemPrompt, userPrompt: userPrompt + retryHint, maxTokens });
        totalUsage = usage;
        lastRawText = text;

        const json = extractJson(text);
        if (!json) {
          lastError = { code: 'parse_failed', detail: 'JSON 추출 실패. raw text 길이: ' + text.length };
          continue;
        }

        const validation = validateAgainstSchema(json, agentDef.outputSchema);
        if (!validation.ok) {
          lastError = { code: 'validation_failed', detail: '누락 필드: ' + validation.missing.join(', ') };
          continue;
        }

        parsedResult = json;
        break;
      } catch (err) {
        lastError = { code: err.code || 'api_error', detail: err.message, status: err.status };
        // api_error는 재시도 의미 없을 수도 있지만 일단 1회 더
      }
    }

    if (!parsedResult) {
      const repaired = await repairJsonWithClaude({
        apiKey,
        rawText: lastRawText,
        schema: agentDef.outputSchema,
        agentId
      });
      if (repaired) {
        const validation = validateAgainstSchema(repaired, agentDef.outputSchema);
        if (validation.ok) {
          parsedResult = repaired;
        }
      }
    }

    let degraded = false;
    if (!parsedResult && lastRawText && ['parse_failed', 'validation_failed'].includes(lastError?.code)) {
      parsedResult = fallbackResultFromText(agentId, lastRawText);
      degraded = Boolean(parsedResult);
    }

    if (!parsedResult) {
      return res.status(502).json({
        ok: false,
        agent: agentId,
        error: lastError?.code || 'unknown_error',
        detail: lastError?.detail || '에이전트 결과 생성 실패',
        attempts
      });
    }

    parsedResult = sanitizeResult(agentId, parsedResult);

    return res.status(200).json({
      ok: true,
      agent: agentId,
      agentName: agentDef.name,
      agentTitle: agentDef.title,
      stage: agentDef.stage,
      stageLabel: agentDef.stageLabel,
      result: parsedResult,
      attempts,
      degraded,
      usage: totalUsage
    });
  } catch (err) {
    console.error('[teambuilder] server error', err);
    return res.status(500).json({
      ok: false,
      error: 'server_error',
      detail: err.message
    });
  }
}
