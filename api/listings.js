// Vercel Serverless Function: /api/listings
// K-Startup OpenAPI에서 정부 창업지원사업 공고를 가져와서
// 우리 LISTINGS 구조로 변환해 반환.
// 실패 시 static listings.json 으로 폴백.
//
// 환경 변수: KSTARTUP_API_KEY (공공데이터포털 인증키, decoded 형태)
//
// 캐시: Vercel Edge에서 1시간 캐시 (stale-while-revalidate 10분)

const STATIC_FALLBACK = [
  // 폴백용 — 실제 데이터는 K-Startup API에서 받아옴
  // 사이트 처음 띄우거나 API 장애 시 표시되는 최소한의 시드 데이터
];

// 분야 분류 (제목·요약 키워드 기반)
function classifyField(title, summary) {
  const text = (title + ' ' + summary).toLowerCase();
  if (/ai|인공지능|딥러닝|머신러닝|llm|gpt/.test(text)) return 'ai';
  if (/바이오|헬스|의료|제약|진단|치료/.test(text)) return 'bio';
  if (/제조|메이커|하드웨어|반도체|로봇/.test(text)) return 'manufacturing';
  if (/유통|커머스|이커머스|배송|물류/.test(text)) return 'commerce';
  if (/식품|푸드|외식|농식품|레스토랑/.test(text)) return 'food';
  if (/관광|문화|예술|콘텐츠|미디어/.test(text)) return 'culture';
  if (/에너지|친환경|esg|탄소|재생/.test(text)) return 'energy';
  if (/소셜|복지|사회적|취약|돌봄/.test(text)) return 'social';
  if (/딥테크|첨단|미래|혁신|기술/.test(text)) return 'deeptech';
  return 'general';
}

// 지역 분류 (제목·기관명 기반)
function classifyRegion(title, agency) {
  const text = (title + ' ' + agency);
  if (/서울|경기|인천|수도권/.test(text)) return 'capital';
  if (/부산|울산|경남|경북|대구|영남/.test(text)) return 'youngnam';
  if (/광주|전남|전북|호남/.test(text)) return 'honam';
  if (/대전|세종|충남|충북|충청/.test(text)) return 'chungcheong';
  if (/강원/.test(text)) return 'gangwon';
  if (/제주/.test(text)) return 'jeju';
  return 'national';
}

// K-Startup 날짜 (YYYYMMDD 또는 YYYY-MM-DD) → YYYY-MM-DD
function normalizeDate(d) {
  if (!d) return '';
  const s = String(d).replace(/[^0-9]/g, '');
  if (s.length === 8) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  return d;
}

// 금액 추출 (요약문에서 "최대 1억", "1억원" 등 패턴 찾기)
function extractAmount(summary) {
  if (!summary) return '';
  const m1 = summary.match(/최대\s*(\d+(?:\.\d+)?)\s*억/);
  if (m1) return `최대 ${m1[1]}억원`;
  const m2 = summary.match(/(\d+(?:\.\d+)?)\s*억\s*원/);
  if (m2) return `${m2[1]}억원`;
  const m3 = summary.match(/(\d+)\s*천만\s*원/);
  if (m3) return `${m3[1]}천만원`;
  return '문의';
}

// K-Startup 응답 1건을 우리 LISTINGS 1건으로 변환
function transformItem(item, idx) {
  // K-Startup 응답 필드명이 응답 버전마다 다를 수 있어 여러 후보 시도
  const title = item.pblancNm || item.bsnsTitle || item.bizTitleNm || item.title || '';
  const summary = item.bsnsSumryCn || item.bizSumryCn || item.summary || '';
  const startDate = item.pbancRcptBgngDt || item.bizPbancBgngDt || item.startDate || '';
  const endDate = item.pbancRcptEndDt || item.bizPbancEndDt || item.endDate || '';
  const agency = item.pbancNtrpNm || item.jrsdInsttNm || item.agency || item.dept || '';
  const target = item.aplyTrgtNm || item.aplyTrgt || item.target || '';
  const url = item.detailPageUrl || item.bizPbancUrl || item.url || '';
  const id = item.pblancId || item.bizPbancNo || item.id || `kstartup-${idx}`;

  return {
    id: `ks-${id}`,
    title: title.trim(),
    field: classifyField(title, summary),
    region: classifyRegion(title, agency),
    age: /청년|만 39세|39세 이하/.test(target + summary) ? '만 39세 이하' : '제한없음',
    target: target || '예비창업자/창업기업',
    money: extractAmount(summary),
    period: `${normalizeDate(startDate)} ~ ${normalizeDate(endDate)}`,
    deadline: normalizeDate(endDate),
    agency: agency || '창업진흥원',
    summary: (summary || '').slice(0, 200),
    url: url || 'https://www.k-startup.go.kr',
    source: 'kstartup',
  };
}

export default async function handler(req, res) {
  // CORS + 캐시
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');

  const apiKey = process.env.KSTARTUP_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      ok: false,
      error: 'KSTARTUP_API_KEY 환경 변수 미설정',
      hint: 'Vercel Project Settings → Environment Variables 에서 추가하세요.',
      fallback: true,
      listings: STATIC_FALLBACK,
    });
  }

  try {
    // K-Startup 사업 공고 API (창업진흥원 KISED)
    // 엔드포인트 패턴: /B552735/kisedKstartupService01/getAnnouncementInformation01
    const url = new URL('https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01');
    url.searchParams.set('serviceKey', apiKey);
    url.searchParams.set('numOfRows', '200');
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('resultType', 'json');

    const apiRes = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' }
    });

    if (!apiRes.ok) {
      const text = await apiRes.text();
      console.error('K-Startup API HTTP error', apiRes.status, text.slice(0, 500));
      return res.status(200).json({
        ok: false,
        error: `K-Startup API ${apiRes.status}`,
        detail: text.slice(0, 500),
        fallback: true,
        listings: STATIC_FALLBACK,
      });
    }

    const data = await apiRes.json();

    // 응답 구조 후보 — K-Startup API가 가끔 구조를 바꿔서 여러 경로 시도
    const items =
      data?.response?.body?.items?.item ||
      data?.response?.body?.items ||
      data?.data ||
      data?.items ||
      [];

    const itemsArray = Array.isArray(items) ? items : [items];

    const today = new Date().toISOString().slice(0, 10);
    const transformed = itemsArray
      .filter(x => x && typeof x === 'object')
      .map((item, idx) => transformItem(item, idx))
      .filter(x => x.title && (!x.deadline || x.deadline >= today))
      .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));

    return res.status(200).json({
      ok: true,
      count: transformed.length,
      updatedAt: new Date().toISOString(),
      source: 'kstartup-live',
      listings: transformed,
    });
  } catch (err) {
    console.error('K-Startup fetch error', err);
    return res.status(200).json({
      ok: false,
      error: err.message,
      fallback: true,
      listings: STATIC_FALLBACK,
    });
  }
}
