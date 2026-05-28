// 청년창업 지원사업 공통 요구사항 점검 코어
// API 핸들러와 팀빌더 프롬프트가 함께 사용한다.

export const DIMENSIONS = [
  {
    id: 'eligibility',
    label: '자격·기본요건',
    weight: 12,
    wants: ['연령/지역/사업자 등록 상태', '지원대상 부합성', '중복수혜·업력 제한 확인'],
    positive: ['만', '나이', '연령', '청년', '예비창업', '사업자', '등록', '업력', '지역', '거주', '인천', '강화'],
    missing: ['age', 'region', 'businessStatus'],
    strengthen: '신청자 나이, 거주지, 사업자 등록 상태, 업력, 중복수혜 여부를 표로 정리하세요.'
  },
  {
    id: 'problem',
    label: '문제정의·고객 pain',
    weight: 12,
    wants: ['누가 어떤 문제를 겪는지', '왜 지금 해결해야 하는지', '현 대안의 한계'],
    positive: ['문제', '불편', 'pain', '수요', '정보 비대칭', '시간 낭비', '마감', '신청', '고객', '사용자'],
    missing: ['customers', 'problemEvidence'],
    strengthen: '핵심 고객 1명을 구체화하고, 현재 겪는 문제와 기존 대안의 한계를 3문장으로 쓰세요.'
  },
  {
    id: 'evidence',
    label: '수요검증·근거',
    weight: 11,
    wants: ['인터뷰/설문/파일럿', 'MVP 사용자 반응', '실제 데이터와 출처'],
    positive: ['인터뷰', '설문', 'MVP', '파일럿', '테스트', '피드백', '사용자', '고객 검증', '데이터', '출처'],
    missing: ['evidence', 'prototype'],
    strengthen: '검증 안 된 수치 대신 실제 인터뷰, 테스트, MVP 피드백, 출처 있는 통계를 구분해서 넣으세요.'
  },
  {
    id: 'solution',
    label: '해결책·제품 완성도',
    weight: 10,
    wants: ['제품 기능', 'MVP 상태', '차별성', '기술 구현 가능성'],
    positive: ['솔루션', '기능', '제품', '서비스', 'SaaS', '플랫폼', 'MVP', '프로토타입', '자동화', 'AI', '매칭'],
    missing: ['prototype', 'features'],
    strengthen: '현재 구현된 기능과 아직 계획인 기능을 분리하고, 사용자가 바로 얻는 효익을 기능별로 쓰세요.'
  },
  {
    id: 'market',
    label: '시장성·경쟁대안',
    weight: 9,
    wants: ['시장/고객 규모', '경쟁 서비스', '왜 선택받는지'],
    positive: ['시장', '경쟁', '대안', '차별', '포지셔닝', '타깃', '세그먼트', '확장'],
    missing: ['market', 'competitors'],
    strengthen: '직접 경쟁, 간접 대안, 우리 서비스가 더 나은 이유를 각각 1개씩 쓰세요.'
  },
  {
    id: 'businessModel',
    label: '수익모델·지속가능성',
    weight: 10,
    wants: ['누가 돈을 내는지', '가격/구독/수수료 구조', '비용 대비 지속성'],
    positive: ['수익', '매출', '구독', '가격', '유료', 'B2B', 'B2C', '수수료', '비용', '마진', '지속가능'],
    missing: ['revenue', 'pricing'],
    strengthen: '고객별 결제 주체, 과금 방식, 무료/유료 전환 조건을 숫자 없이 구조로 먼저 정리하세요.'
  },
  {
    id: 'execution',
    label: '팀·실행역량',
    weight: 10,
    wants: ['대표자 경험', '팀 역할', '외부 협력', '실행 이력'],
    positive: ['경험', '역량', '팀', '대표', '운영', '개발', '네트워크', '협력', 'MOU', '파트너', '실행'],
    missing: ['team', 'strength'],
    strengthen: '대표자 강점, 부족한 역량, 보완할 협력자/외주/멘토를 역할 단위로 쓰세요.'
  },
  {
    id: 'budget',
    label: '예산·자금사용계획',
    weight: 10,
    wants: ['지원금 사용처', '자부담/운영비', '마일스톤별 예산'],
    positive: ['예산', '지원금', '자금', '사용 계획', '개발비', '마케팅비', '인건비', '서버', '운영비'],
    missing: ['budget', 'funding'],
    strengthen: '개발비, 운영비, 마케팅비, 검증비를 구분하고 각 항목의 필요 이유를 쓰세요.'
  },
  {
    id: 'impact',
    label: '성과·지역/사회적 효과',
    weight: 8,
    wants: ['고용/매출/지역 기여', '청년창업 생태계 효과', '측정 가능한 성과지표'],
    positive: ['성과', '고용', '지역', '사회적', '청년', '일자리', '확산', '기여', '지표', 'KPI'],
    missing: ['impact'],
    strengthen: '성과는 확정 수치가 아니라 측정할 지표로 제시하세요. 예: 신청 완료 건수, 상담 연결 수, 재방문율.'
  },
  {
    id: 'riskCompliance',
    label: '리스크·서류·법적 안전',
    weight: 8,
    wants: ['개인정보/AI/환불/광고 표현 리스크', '제출서류 체크', '마감 관리'],
    positive: ['리스크', '개인정보', '보안', '약관', '환불', 'AI', '보조 도구', '서류', '마감', '검토', '법적'],
    missing: ['documents', 'risk'],
    strengthen: '개인정보, AI 결과물 면책, 환불/결제, 제출서류, 마감일 체크리스트를 따로 만드세요.'
  }
];

const FIELD_ALIASES = {
  businessStatus: ['businessStatus', '사업자등록상태', 'bizStatus', 'registration'],
  problemEvidence: ['problemEvidence', 'painEvidence', 'problemProof'],
  evidence: ['evidence', 'traction', 'validation'],
  features: ['features', 'productFeatures'],
  market: ['market', 'marketSize'],
  competitors: ['competitors', 'competition'],
  pricing: ['pricing', 'price'],
  documents: ['documents', 'docs'],
  risk: ['risk', 'risks']
};

function normalizeText(...parts) {
  return parts
    .filter(Boolean)
    .map(value => typeof value === 'string' ? value : JSON.stringify(value))
    .join('\n')
    .toLowerCase();
}

function hasValue(data, key) {
  const keys = [key, ...(FIELD_ALIASES[key] || [])];
  return keys.some(k => {
    const value = data && data[k];
    if (Array.isArray(value)) return value.length > 0;
    return value != null && String(value).trim().length > 0;
  });
}

function countKeywordHits(text, keywords) {
  return keywords.reduce((sum, keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(escaped, 'gi'));
    return sum + (match ? match.length : 0);
  }, 0);
}

function statusFor(ratio) {
  if (ratio >= 0.78) return '강함';
  if (ratio >= 0.55) return '보완 필요';
  return '취약';
}

export function gradeFor(score) {
  if (score >= 82) return '매우 강함';
  if (score >= 68) return '강함';
  if (score >= 52) return '보통';
  return '약함';
}

function evaluateDimension(dimension, text, userData, listing) {
  const hits = countKeywordHits(text, dimension.positive);
  const keywordScore = Math.min(1, hits / 5);
  const missingInputs = dimension.missing.filter(key => !hasValue(userData, key));
  const inputScore = 1 - (missingInputs.length / Math.max(1, dimension.missing.length));
  const listingBonus = listing && Object.keys(listing).length > 0 ? 0.08 : 0;
  const ratio = Math.max(0, Math.min(1, keywordScore * 0.55 + inputScore * 0.37 + listingBonus));
  const score = Math.round(dimension.weight * ratio);

  return {
    id: dimension.id,
    label: dimension.label,
    score,
    max: dimension.weight,
    status: statusFor(ratio),
    wants: dimension.wants,
    missingInputs,
    strengthen: dimension.strengthen
  };
}

export function buildPromptPack(dimensions) {
  const weak = dimensions.filter(d => d.status !== '강함').slice(0, 5);
  return {
    director: weak.map(d => `${d.label}: ${d.strengthen}`),
    planWriter: weak.map(d => `${d.label} 보강 문단을 작성하되, 확인되지 않은 수치는 '확인 필요'로 남겨라.`),
    critic: weak.map(d => `${d.label}에서 근거 부족, 과장 표현, 제출 리스크를 찾아라.`)
  };
}

export function evaluateReadiness({ userData = {}, planText = '', listing = {} } = {}) {
  const text = normalizeText(userData, planText, listing);
  const dimensions = DIMENSIONS.map(d => evaluateDimension(d, text, userData, listing));
  const score = Math.round(dimensions.reduce((sum, d) => sum + d.score, 0));
  const weak = dimensions.filter(d => d.status === '취약');
  const needs = dimensions.filter(d => d.status === '보완 필요');
  const requiredInputs = [...new Set(dimensions.flatMap(d => d.missingInputs))];
  const priorityActions = [...weak, ...needs]
    .slice(0, 6)
    .map(d => ({ area: d.label, action: d.strengthen }));

  return {
    ok: true,
    score,
    grade: gradeFor(score),
    summary: `공통 심사축 ${DIMENSIONS.length}개 기준 ${score}/100점입니다. 강한 축은 ${dimensions.filter(d => d.status === '강함').length}개, 보완 필요는 ${needs.length}개, 취약 축은 ${weak.length}개입니다.`,
    dimensions,
    requiredInputs,
    priorityActions,
    promptPack: buildPromptPack(dimensions),
    disclaimer: 'AI 작성 보조용 진단입니다. 실제 공고 원문과 기관 안내를 기준으로 최종 확인해야 합니다.'
  };
}

export function buildReadinessPrompt(readiness) {
  if (!readiness || !Array.isArray(readiness.dimensions)) return '';
  const weakLines = readiness.priorityActions
    .map((item, i) => `${i + 1}. ${item.area}: ${item.action}`)
    .join('\n');
  const dimensionLines = readiness.dimensions
    .map(d => `- ${d.label}: ${d.score}/${d.max}, ${d.status}, 누락: ${d.missingInputs.join(', ') || '없음'}`)
    .join('\n');

  return `[지원사업 준비도 진단]
- 현재 준비도: ${readiness.score}/100, ${readiness.grade}
- 해석: 이 점수는 합격률이 아니라 공통 심사 요구사항 충족도입니다.

[10대 심사축 상태]
${dimensionLines}

[우선 보강 액션]
${weakLines || '현재 큰 취약 항목 없음'}

위 진단을 반드시 반영하세요. 사용자가 제공하지 않은 증거·수치·실적은 만들지 말고 '확인 필요' 또는 missingInputs에 남기세요.`;
}
