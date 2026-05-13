// Vercel Serverless Function: /api/listings
// K-Startup OpenAPI: 정부 창업지원사업 공고 28,000+건 실시간 동기화
// 응답 형식: <item><col name="필드명">값</col>...</item>

const STATIC_FALLBACK = [];

// ===== 분야/지역 분류 =====
function classifyField(title, summary, sptBizClsfc) {
  const text = (title + ' ' + summary + ' ' + sptBizClsfc).toLowerCase();
  if (/ai|인공지능|딥러닝|머신러닝|llm|gpt/.test(text)) return 'ai';
  if (/바이오|헬스|의료|제약|진단|치료|메디컬/.test(text)) return 'bio';
  if (/제조|메이커|하드웨어|반도체|로봇|d\.n\.a/.test(text)) return 'manufacturing';
  if (/유통|커머스|이커머스|배송|물류/.test(text)) return 'commerce';
  if (/식품|푸드|외식|농식품|레스토랑|농업/.test(text)) return 'food';
  if (/관광|문화|예술|콘텐츠|미디어|영상/.test(text)) return 'culture';
  if (/에너지|친환경|esg|탄소|재생|그린/.test(text)) return 'energy';
  if (/소셜|복지|사회적|취약|돌봄/.test(text)) return 'social';
  if (/딥테크|첨단|미래|혁신|기술/.test(text)) return 'deeptech';
  if (/창업교육|교육/.test(text)) return 'education';
  if (/시설|공간|입주|보육/.test(text)) return 'space';
  return 'general';
}

function classifyRegion(suptRegin, agency, title) {
  // K-Startup의 supt_regin은 "전국", "서울", "경기", "부산" 등 17개 시도 단위
  if (!suptRegin) suptRegin = '';
  const r = (suptRegin + ' ' + agency + ' ' + title).toLowerCase();
  // 정확도 우선 — 시도명 매칭
  if (/전국|전체 권역|전\s*국/.test(suptRegin)) return 'national';
  if (/서울/.test(r)) return 'seoul';
  if (/경기/.test(r)) return 'gyeonggi';
  if (/인천/.test(r)) return 'incheon';
  if (/부산/.test(r)) return 'busan';
  if (/대구/.test(r)) return 'daegu';
  if (/울산/.test(r)) return 'ulsan';
  if (/광주/.test(r)) return 'gwangju';
  if (/대전/.test(r)) return 'daejeon';
  if (/세종/.test(r)) return 'sejong';
  if (/강원/.test(r)) return 'gangwon';
  if (/충북|충청북도/.test(r)) return 'chungbuk';
  if (/충남|충청남도/.test(r)) return 'chungnam';
  if (/전북|전라북도/.test(r)) return 'jeonbuk';
  if (/전남|전라남도/.test(r)) return 'jeonnam';
  if (/경북|경상북도/.test(r)) return 'gyeongbuk';
  if (/경남|경상남도/.test(r)) return 'gyeongnam';
  if (/제주/.test(r)) return 'jeju';
  return 'national';
}

function normalizeDate(d) {
  if (!d) return '';
  const s = String(d).replace(/[^0-9]/g, '');
  if (s.length === 8) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  return d;
}

function extractAmount(summary, suptBizClsfc) {
  const text = (summary || '') + ' ' + (suptBizClsfc || '');
  if (!text) return '문의';
  const m1 = text.match(/최대\s*(\d+(?:\.\d+)?)\s*억/);
  if (m1) return `최대 ${m1[1]}억원`;
  const m2 = text.match(/(\d+(?:\.\d+)?)\s*억\s*원/);
  if (m2) return `${m2[1]}억원`;
  const m3 = text.match(/(\d+)\s*천만\s*원/);
  if (m3) return `${m3[1]}천만원`;
  const m4 = text.match(/(\d+(?:,\d{3})*)\s*만\s*원/);
  if (m4) return `${m4[1]}만원`;
  return '문의';
}

// HTML 엔티티 디코딩
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&#xD;/g, '')
    .replace(/&#xA;/g, ' ')
    .replace(/&#x[0-9a-fA-F]+;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

// ===== K-Startup XML 파서 =====
// <item><col name="x">y</col>...</item> 형식 전용
function parseKStartupXML(xml) {
  if (!xml || typeof xml !== 'string') return [];

  const cleaned = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRegex.exec(cleaned)) !== null) {
    const itemXml = m[1];
    const obj = {};
    // <col name="필드명">값</col> 매칭
    const colRegex = /<col\s+name="([\w_]+)"\s*>([\s\S]*?)<\/col>/g;
    let cm;
    while ((cm = colRegex.exec(itemXml)) !== null) {
      obj[cm[1]] = decodeEntities(cm[2].trim());
    }
    if (Object.keys(obj).length > 0) {
      items.push(obj);
    }
  }
  return items;
}

function extractTotalCount(text) {
  const m = text.match(/<totalCount>(\d+)<\/totalCount>/);
  return m ? parseInt(m[1], 10) : 0;
}

// 영문 분야 키 → 한글 라벨 (사이트 카드 표시용)
const FIELD_KO = {
  ai: 'AI·딥테크',
  bio: '헬스케어',
  manufacturing: '제조',
  commerce: '커머스',
  food: '농업·푸드',
  culture: '문화·콘텐츠',
  energy: '에너지·ESG',
  social: '소셜·복지',
  deeptech: '딥테크',
  education: '창업교육',
  space: '시설·공간',
  general: '일반',
};

// K-Startup의 한글 분류(supt_biz_clsfc) → types 배열 매핑
function bizClsfcToTypes(bizClsfc) {
  if (!bizClsfc) return ['자금'];
  const text = bizClsfc;
  const types = [];
  if (/사업화/.test(text)) types.push('자금');
  if (/창업교육|교육/.test(text)) types.push('교육');
  if (/멘토링|컨설팅/.test(text)) types.push('멘토링');
  if (/시설|공간|보육|입주/.test(text)) types.push('공간');
  if (/판로|해외/.test(text)) types.push('판로');
  if (/행사|네트워크/.test(text)) types.push('네트워크');
  if (/투자/.test(text)) types.push('투자');
  return types.length > 0 ? types : ['자금'];
}

// 금액 문자열 → 숫자 추정 (정렬용)
function moneyToNumber(s, summary) {
  const text = (s || '') + ' ' + (summary || '');
  if (!text) return 0;
  const m1 = text.match(/(\d+(?:\.\d+)?)\s*억/);
  if (m1) return parseFloat(m1[1]) * 100000000;
  const m2 = text.match(/(\d+)\s*천만/);
  if (m2) return parseInt(m2[1], 10) * 10000000;
  const m3 = text.match(/(\d+(?:,\d{3})*)\s*만/);
  if (m3) return parseInt(m3[1].replace(/,/g, ''), 10) * 10000;
  return 0;
}

// ===== K-Startup 1건 → 우리 LISTINGS 1건 (사이트 카드 호환 구조) =====
function transformItem(item, idx) {
  const title = item.biz_pbanc_nm || item.intg_pbanc_biz_nm || '';
  const summary = item.pbanc_ctnt || item.aply_trgt_cntnt || '';
  const startDate = item.pbanc_rcpt_bgng_dt || '';
  const endDate = item.pbanc_rcpt_end_dt || '';
  const agency = item.pbanc_ntrp_nm || item.biz_prch_dprt_nm || '';
  const target = item.aply_trgt || '';
  const targetAge = item.biz_trgt_age || '';
  const suptRegin = item.supt_regin || '';
  const suptBizClsfc = item.supt_biz_clsfc || '';
  const detailUrl = item.detl_pg_url || '';
  const applyUrl = item.biz_aply_url || item.aply_mthd_onli_rcpt_istc || '';
  const guideUrl = item.biz_gdnc_url || '';
  const id = item.pbanc_sn || item.id || `kstartup-${idx}`;
  const sprvInst = item.sprv_inst || '';
  const rcrtPrgsYn = item.rcrt_prgs_yn || '';
  const contact = item.prch_cnpl_no || '';

  const ageStr = targetAge + ' ' + target;
  const isYouth = /만 39세 이하|39세|청년|만 19세|만 20세|만 29세|만 34세/.test(ageStr);

  const fieldKey = classifyField(title, summary, suptBizClsfc);
  const region = classifyRegion(suptRegin, agency, title);
  const money = extractAmount(summary, suptBizClsfc);
  const types = bizClsfcToTypes(suptBizClsfc);

  return {
    // === 사이트 카드 호환 필드 (기존 LISTINGS 구조) ===
    id: `ks-${id}`,
    region: region,
    regionLabel: suptRegin || '전국',  // 카드 표시용
    title: title.trim().replace(/\s+/g, ' '),
    org: agency || '창업진흥원',  // 카드 표시용 (기관명)
    field: FIELD_KO[fieldKey] || '일반',  // 한글 라벨
    age: isYouth ? '만 39세 이하' : (targetAge ? targetAge.split(',')[0] : '제한 없음'),
    money: money,
    types: types,
    moneyMax: moneyToNumber(money, summary),
    deadline: normalizeDate(endDate),
    summary: summary.slice(0, 250),
    url: detailUrl || guideUrl || 'https://www.k-startup.go.kr',

    // === K-Startup 추가 메타 (선택적 사용) ===
    fieldKey: fieldKey,
    bizClsfc: suptBizClsfc,
    sprvInst: sprvInst,
    period: `${normalizeDate(startDate)} ~ ${normalizeDate(endDate)}`,
    target: target,
    applyUrl: applyUrl,
    contact: contact,
    rcrtOngoing: rcrtPrgsYn === 'Y',
    source: 'kstartup',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');

  const apiKey = process.env.KSTARTUP_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      ok: false,
      error: 'KSTARTUP_API_KEY 환경 변수 미설정',
      fallback: true,
      listings: STATIC_FALLBACK,
    });
  }

  // ?youth=1 파라미터: 청년창업만 필터
  const youthOnly = req.query?.youth === '1';
  // ?perPage 파라미터: 가져올 개수 (기본 200, 최대 500)
  const perPage = Math.min(parseInt(req.query?.perPage || '200', 10), 500);

  try {
    const url = new URL('https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01');
    url.searchParams.set('serviceKey', apiKey);
    // K-Startup은 perPage/page 파라미터를 씀 (numOfRows/pageNo 아님)
    url.searchParams.set('perPage', String(perPage));
    url.searchParams.set('page', '1');
    // 호환성을 위해 둘 다 보냄
    url.searchParams.set('numOfRows', String(perPage));
    url.searchParams.set('pageNo', '1');

    const apiRes = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/xml,text/xml,*/*',
        'User-Agent': 'saessak-platform/1.0',
      }
    });

    const text = await apiRes.text();

    if (!apiRes.ok) {
      return res.status(200).json({
        ok: false,
        error: `K-Startup API ${apiRes.status}`,
        detail: text.slice(0, 500),
        fallback: true,
        listings: STATIC_FALLBACK,
      });
    }

    const items = parseKStartupXML(text);
    const today = new Date().toISOString().slice(0, 10);

    let transformed = items
      .map((item, idx) => transformItem(item, idx))
      .filter(x => x.title)  // 제목 있는 것만
      .filter(x => !x.deadline || x.deadline >= today)  // 마감 안 지난 것
      .filter(x => x.rcrtOngoing !== false)  // 모집 진행 중인 것 (Y만)
      .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));

    // 청년 전용 필터
    if (youthOnly) {
      transformed = transformed.filter(x => x.age === '만 39세 이하');
    }

    return res.status(200).json({
      ok: true,
      count: transformed.length,
      totalAvailable: extractTotalCount(text),
      rawItemsParsed: items.length,
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
