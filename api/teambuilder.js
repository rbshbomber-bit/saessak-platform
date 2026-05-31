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
import { buildReadinessPrompt, evaluateReadiness } from './grant-readiness-core.js';

const STUDIOS_PATH = path.join(process.cwd(), 'data', 'agent-studios.json');
const RUBRICS_PATH = path.join(process.cwd(), 'data', 'grant-rubrics.json');

// 데이터는 cold start 시 1회만 로드
let STUDIOS_CACHE = null;
let RUBRICS_CACHE = null;

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

function loadRubrics() {
  if (RUBRICS_CACHE) return RUBRICS_CACHE;
  try {
    const raw = fs.readFileSync(RUBRICS_PATH, 'utf8');
    RUBRICS_CACHE = JSON.parse(raw);
    return RUBRICS_CACHE;
  } catch (e) {
    console.warn('[teambuilder] grant-rubrics.json 로드 실패 — fallback 사용', e.message);
    return { rubrics: [] };
  }
}

// 추천 사업명 또는 사용자 targetGrant를 rubric에 매칭. 없으면 default rubric.
function matchRubric(haystack) {
  const rubrics = loadRubrics().rubrics || [];
  const text = String(haystack || '').toLowerCase();
  for (const r of rubrics) {
    if (!Array.isArray(r.match) || r.match.length === 0) continue;
    if (r.match.some(kw => text.includes(String(kw).toLowerCase()))) return r;
  }
  return rubrics.find(r => r.id === 'default') || null;
}

// Plan Writer 전용 — 추천 사업/사용자 희망 사업에서 rubric 찾기
function pickRubricForPlan(userData, previousResults) {
  const top = previousResults?.grantScout?.topRecommendation || '';
  const firstCand = previousResults?.grantScout?.candidates?.[0]?.name || '';
  const target = userData?.targetGrant || '';
  const haystack = [target, firstCand, top].filter(Boolean).join(' ');
  return matchRubric(haystack);
}

function limitText(value, max = 12000) {
  if (value == null) return '';
  return String(value).slice(0, max);
}

function limitUserData(userData) {
  if (!userData || typeof userData !== 'object' || Array.isArray(userData)) return {};
  return Object.fromEntries(
    Object.entries(userData).map(([key, value]) => [
      key,
      typeof value === 'string' ? limitText(value, 1200) : value
    ])
  );
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

async function fetchSupportContext(userData, request, previousResults, req) {
  try {
    const host = req.headers.host;
    if (!host) return null;
    const proto = req.headers['x-forwarded-proto'] || (host && host.startsWith('localhost') ? 'http' : 'https');
    const url = `${proto}://${host}/api/support-context`;
    const planText = extractPlanText(request, previousResults);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        target: userData.targetGrant,
        field: userData.field,
        region: userData.region,
        userData,
        planText,
        listing: extractReadinessListing(previousResults)
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.ok ? data : null;
  } catch (e) {
    console.warn('[teambuilder] support context fetch failed:', e.message);
    return null;
  }
}

function formatAdditionalUserData(userData) {
  const labels = {
    businessStatus: '사업자 상태',
    customers: '핵심 고객',
    evidence: '검증 근거',
    features: '구현 기능',
    market: '시장/타깃',
    competitors: '경쟁/대안',
    revenue: '매출/유료화 근거',
    pricing: '수익모델',
    budget: '예산 계획',
    impact: '성과 지표',
    documents: '보유 서류',
    risk: '리스크 관리'
  };
  return Object.entries(labels)
    .map(([key, label]) => `- ${label}: ${userData[key] || '(미입력)'}`)
    .join('\n');
}

function buildHumanizeGuide(userData) {
  // 사용자가 채운 정성 필드 중 글감으로 쓸 만한 것 추출
  const sources = [
    ['strength', '운영자 강점'],
    ['customers', '핵심 고객'],
    ['evidence', '검증 근거'],
    ['competitors', '경쟁/대안'],
    ['risk', '리스크 관리'],
    ['region', '지역'],
    ['age', '연령']
  ];
  const filled = sources
    .filter(([k]) => userData?.[k] && String(userData[k]).trim().length > 0)
    .map(([k, label]) => `- ${label}: "${userData[k]}" → 본문에 그대로 또는 자연스러운 표현으로 녹여라.`);
  if (filled.length === 0) return '';
  return `[Humanize 가이드 — 글에 녹일 본인 데이터]
다음 표현은 사용자가 직접 제공한 검증된 사실이다. 본문에서 그대로 또는 가까운 표현으로 1번 이상 인용하라. 일반론으로 추상화하지 마라.
${filled.join('\n')}

또한:
- "저는", "저희는", "대표자는" 같은 1인칭/구체 주어 사용
- 챕터당 최소 1번은 위 데이터에서 끌어낸 일화·배경·현장 관찰을 1~2문장으로 삽입
- "혁신적", "획기적", "최적의" 같은 마케팅 형용사 금지
- 위 사실 중 수치·고유명사는 그대로 보존 (예: "어머니 약사 40년" → 변형 금지)`;
}

function buildRubricGuide(rubric) {
  if (!rubric) return '';
  const heavy = (rubric.heavyDimensions || []).join(', ') || '균형';
  const light = (rubric.lightDimensions || []).join(', ') || '없음';
  const watch = (rubric.watchOuts || []).map((w, i) => `${i + 1}. ${w}`).join('\n');
  const cues = (rubric.winningCues || []).map((w, i) => `${i + 1}. ${w}`).join('\n');
  return `[지원사업 심사 가이드 — ${rubric.displayName}]
- 심사 포커스: ${rubric.focus}
- 평가자 관점: ${rubric.evaluatorPersona}
- 더 두텁게 쓸 축 (heavyDimensions): ${heavy}
- 상대적으로 가볍게 가도 되는 축 (lightDimensions): ${light}

[피해야 할 함정 — watchOuts]
${watch || '없음'}

[가산점 신호 — winningCues, 자연스럽게 본문에 녹여라]
${cues || '없음'}

주의: 위 가이드는 공식 심사표가 아니라 공개 자료에서 관찰된 일반적 경향이다. 실제 공고문이 우선이다.`;
}

function buildSupportContextGuide(context, agentId) {
  if (!context) return '';
  const related = (context.relatedListings || [])
    .slice(0, agentId === 'grant-scout' ? 6 : 3)
    .map((item, i) => `${i + 1}. ${item.title} (${item.org || '기관 확인 필요'}, ${item.money || '지원금 문의'}, ${item.deadline || '마감 확인 필요'})`)
    .join('\n');
  const apis = (context.apiStatus || [])
    .filter(api => api.priority === 'core' || api.priority === 'high' || api.configured)
    .map(api => `- ${api.name}: ${api.configured ? '연동 가능' : '키 필요'} / ${api.use}`)
    .join('\n');
  const evidence = (context.evidenceNeeds || [])
    .map(item => `- ${item.area}: ${item.need}`)
    .join('\n');
  const market = (context.marketPrompts || []).map(item => `- ${item}`).join('\n');
  return `[지원사업 데이터 컨텍스트]
이 컨텍스트는 공고·시장·정책 근거를 보강하기 위한 보조 자료입니다. 실제 공고 원문 확인이 우선입니다.

[API 상태]
${apis || '확인된 API 상태 없음'}

[관련 공고 후보]
${related || '관련 공고 후보 없음'}

[보강할 증거]
${evidence || '확인 필요'}

[시장·정책 근거 작성 지침]
${market || '확인 필요'}

사용자가 제공하지 않은 수치·실적·계약은 만들지 말고 '확인 필요'로 남기세요.`;
}

function buildUserPrompt(userData, request, previousResults, agentId, kstartupContext, readiness, rubric, supportContext) {
  const dataSection = `[사용자 본인 데이터]
- 사업 아이템: ${userData.item || '(미입력)'}
- 운영자 강점: ${userData.strength || '(미입력)'}
- 자금 상황: ${userData.funding || '(미입력)'}
- 시제품 유무: ${userData.prototype || '(미입력)'}
- 신청 희망 사업: ${userData.targetGrant || '(미정)'}
- 분야: ${userData.field || '(미입력)'}
- 지역: ${userData.region || '(미입력)'}
- 연령: ${userData.age || '(미입력)'}
${formatAdditionalUserData(userData)}`;

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

  const readinessSection = readiness ? `\n\n${buildReadinessPrompt(readiness)}` : '';
  const supportSection = supportContext ? `\n\n${buildSupportContextGuide(supportContext, agentId)}` : '';

  // Plan Writer 전용: Humanize 가이드 + 공고별 심사 가중치
  let planWriterSection = '';
  if (agentId === 'plan-writer') {
    const humanize = buildHumanizeGuide(userData);
    const rubricGuide = buildRubricGuide(rubric);
    const parts = [humanize, rubricGuide].filter(Boolean);
    if (parts.length > 0) planWriterSection = '\n\n' + parts.join('\n\n');
  }

  return `${dataSection}\n\n${requestSection}${contextSection}${readinessSection}${supportSection}${kstartupSection}${planWriterSection}`;
}

function extractPlanText(request, previousResults) {
  const parts = [request || ''];
  if (previousResults && typeof previousResults === 'object') {
    for (const key of ['director', 'grantScout', 'planWriter', 'eligibility', 'deadline', 'critic']) {
      if (previousResults[key]) parts.push(JSON.stringify(previousResults[key]));
    }
  }
  return parts.join('\n\n');
}

function extractReadinessListing(previousResults) {
  const firstCandidate = previousResults?.grantScout?.candidates?.[0];
  if (!firstCandidate) return {};
  return {
    title: firstCandidate.name,
    org: firstCandidate.organization,
    money: firstCandidate.fundingRange,
    deadline: firstCandidate.deadlineNote,
    target: firstCandidate.eligibilityKey,
    summary: firstCandidate.fitReason
  };
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

// 사용자 본인 데이터에 명시된 수치는 검증된 사실로 간주, scrub에서 보존.
function extractUserDataNumbers(userData) {
  if (!userData || typeof userData !== 'object') return [];
  const allText = Object.values(userData)
    .filter(v => typeof v === 'string')
    .join(' ');
  const matches = allText.match(/\d[\d,]*\s*(?:개월|만원|억원|명|건|곳|개|%|원|인|년|세|차|회)/g) || [];
  // 길이 내림차순 — 긴 표현 먼저 마스킹해야 부분 매치로 잘려나가지 않음.
  return [...new Set(matches)].sort((a, b) => b.length - a.length);
}

function scrubUnverifiedNumbers(text, userNumbers = []) {
  if (typeof text !== 'string') return text;
  // 본인 데이터 수치 토큰 마스킹
  const tokens = {};
  let working = text;
  userNumbers.forEach((num, i) => {
    const token = `__USER_NUM_${i}__`;
    if (working.includes(num)) {
      tokens[token] = num;
      working = working.split(num).join(token);
    }
  });
  // 일반 scrub — 검증되지 않은 수치를 '확인 필요'로
  working = working
    .replace(/\d+\s*[~∼-]\s*\d+\s*(?:개월|만원|억원|명|건|곳|개|%|원|인)/g, '확인 필요')
    .replace(/\d[\d,]*\s*(?:개월|만원|억원|명|건|곳|개|%|원|인)\s*이상/g, '확인 필요')
    .replace(/\d[\d,]*\s*(?:개월|만원|억원|명|건|곳|개|%|원|인)/g, '확인 필요')
    .replace(/확인 필요\s*월/g, '확인 필요')
    .replace(/월\s*확인 필요\s*수준/g, '확인 필요 수준');
  // 본인 데이터 수치 복원
  Object.entries(tokens).forEach(([token, num]) => {
    working = working.split(token).join(num);
  });
  return working;
}

function sanitizeResult(agentId, result, userData) {
  if (!result || typeof result !== 'object') return result;
  if (agentId !== 'plan-writer') return result;

  const userNumbers = extractUserDataNumbers(userData);
  const scrub = (s) => scrubUnverifiedNumbers(s, userNumbers);

  return {
    ...result,
    chapters: Array.isArray(result.chapters)
      ? result.chapters.map(chapter => ({
        ...chapter,
        body: scrub(chapter.body)
      }))
      : [],
    assumptions: Array.isArray(result.assumptions)
      ? result.assumptions.map(scrub)
      : [],
    missingInputs: Array.isArray(result.missingInputs)
      ? result.missingInputs.map(scrub)
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
    const { studio: studioId, agent: agentId, request, previousResults } = req.body || {};
    const userData = limitUserData(req.body?.userData);
    const safeRequest = limitText(request, 8000);

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
    const readiness = evaluateReadiness({
      userData,
      planText: extractPlanText(safeRequest, previousResults),
      listing: extractReadinessListing(previousResults)
    });
    const supportContext = await fetchSupportContext(userData, safeRequest, previousResults, req);
    // Plan Writer에 한해 추천 사업/타깃 사업에 맞는 심사 가중치 가이드 주입
    const rubric = agentId === 'plan-writer' ? pickRubricForPlan(userData, previousResults) : null;

    const userPrompt = buildUserPrompt(userData, safeRequest, previousResults, agentId, kstartupContext, readiness, rubric, supportContext);
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

    parsedResult = sanitizeResult(agentId, parsedResult, userData);

    return res.status(200).json({
      ok: true,
      agent: agentId,
      agentName: agentDef.name,
      agentTitle: agentDef.title,
      stage: agentDef.stage,
      stageLabel: agentDef.stageLabel,
      readiness,
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
