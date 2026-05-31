// Vercel Serverless Function: /api/support-context
// 지원사업 공고·시장근거·심사 보강 컨텍스트를 한 번에 구성한다.
// 외부 API 키가 없어도 서비스는 동작하고, 키가 추가되면 상태만 자동 반영된다.

import { evaluateReadiness } from './grant-readiness-core.js';

const API_CATALOG = [
  {
    id: 'kstartup',
    name: 'K-Startup 공고 API',
    env: 'KSTARTUP_API_KEY',
    priority: 'core',
    use: '창업지원사업 공고, 신청대상, 마감, 지원유형 매칭',
    sourceUrl: 'https://www.k-startup.go.kr/'
  },
  {
    id: 'bizinfo',
    name: '기업마당/BizInfo API',
    env: 'BIZINFO_API_KEY',
    priority: 'high',
    use: '중소기업·소상공인·R&D·판로·수출 지원사업 보강',
    sourceUrl: 'https://www.bizinfo.go.kr/'
  },
  {
    id: 'startup-space',
    name: '창업공간플랫폼 API',
    env: 'DATA_GO_KR_API_KEY',
    priority: 'medium',
    use: '입주공간·보육센터·창업공간 추천 근거',
    sourceUrl: 'https://www.data.go.kr/data/15125365/openapi.do'
  },
  {
    id: 'smallbiz-area',
    name: '소상공인 상권정보 API',
    env: 'SMALLBIZ_API_KEY',
    priority: 'medium',
    use: '로컬·커머스·소상공인 시장분석 보강',
    sourceUrl: 'https://www.data.go.kr/'
  },
  {
    id: 'kosis',
    name: '통계청 KOSIS API',
    env: 'KOSIS_API_KEY',
    priority: 'medium',
    use: '인구·산업·지역 통계 출처 후보',
    sourceUrl: 'https://kosis.kr/openapi/'
  },
  {
    id: 'kipris',
    name: 'KIPRIS Plus 특허 API',
    env: 'KIPRIS_API_KEY',
    priority: 'low',
    use: '기술 차별성·유사특허 검토 출처 후보',
    sourceUrl: 'https://plus.kipris.or.kr/'
  }
];

function limitText(value, max = 12000) {
  return value == null ? '' : String(value).slice(0, max);
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function fieldTags(field = '') {
  const text = String(field).toLowerCase();
  if (/ai|딥테크|tech|기술/.test(text)) return ['기술 차별성', '데이터', '모델 검증', '지식재산'];
  if (/헬스|바이오|의료/.test(text)) return ['규제', '개인정보', '임상·전문가 검증', '데이터 보안'];
  if (/커머스|로컬|소상공/.test(text)) return ['상권', '반복구매', '객단가', '지역 고객'];
  if (/농업|푸드|식품/.test(text)) return ['원재료', '유통', '지역 생산자', '식품 인허가'];
  if (/문화|콘텐츠/.test(text)) return ['콘텐츠 IP', '팬덤', '유통채널', '제작 역량'];
  return ['고객 문제', '시장성', '수익모델', '실행계획'];
}

function buildEvidenceNeeds({ target = '', field = '', region = '' }) {
  const tags = fieldTags(field);
  const base = [
    {
      area: '공고 적합성',
      need: `${target || '신청 사업'} 공고의 지원대상, 제외대상, 제출서류, 사업비 사용 가능 항목 확인`,
      sourceHint: 'K-Startup/기업마당 공고 원문, 모집요강 PDF'
    },
    {
      area: '고객·수요 검증',
      need: '인터뷰, 설문, MVP 사용 로그, 상담/문의 기록처럼 직접 확인 가능한 증거',
      sourceHint: '사용자 보유 자료, 서비스 로그, 설문 원본'
    },
    {
      area: '시장·지역 근거',
      need: `${region || '대상 지역'} 인구·산업·상권·청년창업 관련 통계 또는 정책자료`,
      sourceHint: 'KOSIS, 공공데이터포털, 지자체 정책자료'
    },
    {
      area: '분야별 차별성',
      need: `${tags.join(', ')} 관점에서 기존 대안과 다른 점을 증명할 자료`,
      sourceHint: /기술|AI|딥테크/.test(field) ? 'KIPRIS, 기술문서, 데모 화면' : '경쟁 서비스 비교표, 고객 피드백'
    },
    {
      area: '자금 사용 계획',
      need: '예산 항목별 산출 근거, 견적, 일정과 연결된 집행 이유',
      sourceHint: '견적서, 서버/도구 요금표, 외주 범위, 마일스톤'
    }
  ];
  return base;
}

function buildApiStatus() {
  return API_CATALOG.map(item => ({
    ...item,
    configured: Boolean(process.env[item.env]),
    status: process.env[item.env] ? 'configured' : 'needs_key'
  }));
}

function buildMarketPrompts({ field = '', region = '' }) {
  const prompts = [
    `${region || '대상 지역'}의 청년창업자 수요를 실제 인터뷰·문의·사용 로그로 확인하세요.`,
    `${field || '해당 분야'} 시장 규모는 출처 있는 통계나 공공자료로만 기입하고, 미확인 수치는 '확인 필요'로 남기세요.`
  ];
  if (/커머스|로컬|소상공|농업|푸드/.test(field)) {
    prompts.push('상권정보 API 또는 지자체 상권 자료로 고객 밀집도, 업종 분포, 지역 소비 패턴을 보강하세요.');
  }
  if (/AI|딥테크|기술|헬스/.test(field)) {
    prompts.push('기술 차별성은 특허·논문·데모·성능 검증표 중 최소 1개 근거로 설명하세요.');
  }
  return prompts;
}

function scoreListingMatch(listing, { target, field, region }) {
  const text = `${listing.title || ''} ${listing.summary || ''} ${listing.field || ''} ${listing.regionLabel || ''} ${listing.types?.join(' ') || ''}`.toLowerCase();
  let score = 0;
  for (const token of [target, field, region].filter(Boolean)) {
    const words = String(token).split(/[·\s,/]+/).filter(w => w.length >= 2);
    score += words.filter(w => text.includes(w.toLowerCase())).length * 2;
  }
  if (/자금|사업화|지원금|사업비|바우처|r&d|기술개발/i.test(text)) score += 3;
  if (/교육|세미나|행사|컨퍼런스/.test(text) && !/사업화|지원금|자금/.test(text)) score -= 3;
  return score;
}

async function fetchRelatedListings(req, body) {
  const host = req.headers.host;
  if (!host) return [];
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const url = `${proto}://${host}/api/listings?funding=1&pages=3&bizinfoPages=2`;
  try {
    const resp = await fetch(url, { headers: { accept: 'application/json' } });
    const data = await resp.json();
    if (!data.ok || !Array.isArray(data.listings)) return [];
    return data.listings
      .map(item => ({ ...item, _score: scoreListingMatch(item, body) }))
      .filter(item => item._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 8)
      .map(({ _score, ...item }) => ({
        id: item.id,
        title: item.title,
        org: item.org,
        regionLabel: item.regionLabel,
        field: item.field,
        money: item.money,
        deadline: item.deadline,
        types: item.types,
        url: item.url,
        source: item.source
      }));
  } catch (e) {
    return [];
  }
}

function buildPromptContext({ readiness, evidenceNeeds, apiStatus, relatedListings, marketPrompts }) {
  const apiLines = apiStatus
    .filter(api => api.priority !== 'low' || api.configured)
    .map(api => `- ${api.name}: ${api.status === 'configured' ? '연동 가능' : '키 필요'} / ${api.use}`)
    .join('\n');
  const evidenceLines = evidenceNeeds.map(item => `- ${item.area}: ${item.need} / 출처 후보: ${item.sourceHint}`).join('\n');
  const listingLines = relatedListings.length
    ? relatedListings.map((item, i) => `${i + 1}. ${item.title} (${item.org || '기관 확인 필요'}, ${item.money || '지원금 문의'}, 마감 ${item.deadline || '확인 필요'})`).join('\n')
    : '관련 공고는 K-Startup/기업마당에서 별도 확인 필요';
  const marketLines = marketPrompts.map(item => `- ${item}`).join('\n');
  return `[지원사업 데이터 컨텍스트]
준비도: ${readiness.score}/100 (${readiness.grade}) — 합격률이 아니라 공통 심사 요구사항 충족도

[활성/후보 API]
${apiLines}

[관련 공고 후보]
${listingLines}

[보강할 근거]
${evidenceLines}

[시장·정책 근거 작성 지침]
${marketLines}

사용자가 제공하지 않은 수치·실적·계약은 만들지 말고 '확인 필요'로 남기세요.`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      updatedAt: new Date().toISOString(),
      apiStatus: buildApiStatus()
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const body = req.body || {};
  const target = clean(body.target || body.targetGrant);
  const field = clean(body.field);
  const region = clean(body.region);
  const planText = limitText(body.planText || body.text);
  const listing = body.listing && typeof body.listing === 'object' ? body.listing : {};
  const userData = body.userData && typeof body.userData === 'object' ? body.userData : {};

  const readiness = evaluateReadiness({ userData: { ...userData, targetGrant: target, field, region }, planText, listing });
  const evidenceNeeds = buildEvidenceNeeds({ target, field, region });
  const apiStatus = buildApiStatus();
  const marketPrompts = buildMarketPrompts({ field, region });
  const relatedListings = await fetchRelatedListings(req, { target, field, region });

  return res.status(200).json({
    ok: true,
    updatedAt: new Date().toISOString(),
    target,
    field,
    region,
    readiness,
    evidenceNeeds,
    apiStatus,
    marketPrompts,
    relatedListings,
    promptContext: buildPromptContext({ readiness, evidenceNeeds, apiStatus, relatedListings, marketPrompts }),
    disclaimer: 'AI 작성 보조용 데이터 컨텍스트입니다. 실제 신청 전 공고 원문과 기관 안내를 최종 확인해야 합니다.'
  });
}
