// Vercel Serverless Function: /api/listings
// K-Startup OpenAPI에서 정부 창업지원사업 공고를 가져와서
// 우리 LISTINGS 구조로 변환해 반환.
// XML 응답 자동 파싱. 실패 시 fallback 처리.
//
// 환경 변수: KSTARTUP_API_KEY
// 캐시: Vercel Edge에서 1시간 (stale-while-revalidate 10분)

const STATIC_FALLBACK = [];

// ===== 분류 헬퍼 =====
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

function normalizeDate(d) {
  if (!d) return '';
  const s = String(d).replace(/[^0-9]/g, '');
  if (s.length === 8) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  if (s.length === 14) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  return d;
}

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

// ===== XML 파서 (여러 item 태그 후보 시도) =====
function parseXMLItems(xml) {
  if (!xml || typeof xml !== 'string') return { items: [], tagUsed: null };

  // CDATA 처리
  const cleaned = xml.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');

  // 다양한 정부 API에서 쓰는 item 태그 후보들
  const tagCandidates = ['item', 'row', 'data', 'record', 'announcement', 'pblanc', 'BSNS', 'list'];

  for (const tag of tagCandidates) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const itemRegex = new RegExp(`<${escaped}>([\\s\\S]*?)</${escaped}>`, 'g');
    const items = [];
    let m;
    while ((m = itemRegex.exec(cleaned)) !== null) {
      const itemXml = m[1];
      const obj = {};
      const fieldRegex = /<([\w_:]+)>([\s\S]*?)<\/\1>/g;
      let fm;
      while ((fm = fieldRegex.exec(itemXml)) !== null) {
        obj[fm[1]] = fm[2].trim();
      }
      if (Object.keys(obj).length > 0) {
        items.push(obj);
      }
    }
    if (items.length > 0) {
      return { items, tagUsed: tag };
    }
  }

  return { items: [], tagUsed: null };
}

// 모든 최상위 태그 이름 추출 (디버그용)
function extractTopLevelTags(xml) {
  if (!xml) return [];
  const tags = new Set();
  const re = /<([\w_:]+)[\s>]/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    tags.add(m[1]);
    if (tags.size > 50) break;
  }
  return Array.from(tags);
}

// XML/JSON 응답에서 totalCount 추출
function extractTotalCount(text) {
  const m = text.match(/<totalCount>(\d+)<\/totalCount>/);
  return m ? parseInt(m[1], 10) : 0;
}

// ===== K-Startup 1건 → 우리 LISTINGS 1건 =====
function transformItem(item, idx) {
  // 가능한 필드명 후보를 모두 시도
  const title =
    item.pblancNm || item.bsnsTitle || item.bizTitleNm || item.title ||
    item.PBLANC_NM || item.BSNS_TITLE || '';
  const summary =
    item.bsnsSumryCn || item.bizSumryCn || item.summary ||
    item.BSNS_SUMRY_CN || item.bsnsCn || '';
  const startDate =
    item.pbancRcptBgngDt || item.bizPbancBgngDt || item.startDate ||
    item.PBANC_RCPT_BGNG_DT || '';
  const endDate =
    item.pbancRcptEndDt || item.bizPbancEndDt || item.endDate ||
    item.PBANC_RCPT_END_DT || '';
  const agency =
    item.pbancNtrpNm || item.jrsdInsttNm || item.agency || item.dept ||
    item.PBANC_NTRP_NM || item.JRSD_INSTT_NM || '';
  const target =
    item.aplyTrgtNm || item.aplyTrgt || item.target ||
    item.APLY_TRGT_NM || item.APLY_TRGT || '';
  const url =
    item.detailPageUrl || item.bizPbancUrl || item.url ||
    item.DETAIL_PAGE_URL || item.BIZ_PBANC_URL || '';
  const id =
    item.pblancId || item.bizPbancNo || item.id ||
    item.PBLANC_ID || item.BIZ_PBANC_NO || `kstartup-${idx}`;
  const supportArea =
    item.suportBizFromObjOpttn || item.aplyMthdNm || item.supportArea || '';

  return {
    id: `ks-${id}`,
    title: title.trim(),
    field: classifyField(title, summary + ' ' + supportArea),
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

  try {
    // K-Startup 사업 공고 정보 조회
    const url = new URL('https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01');
    url.searchParams.set('serviceKey', apiKey);
    url.searchParams.set('numOfRows', '200');
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('resultType', 'json');  // 무시되더라도 시도

    const apiRes = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json,text/xml,*/*',
        'User-Agent': 'saessak-platform/1.0 (https://saessak-platform.vercel.app)',
      }
    });

    const text = await apiRes.text();
    const ct = (apiRes.headers.get('content-type') || '').toLowerCase();

    if (!apiRes.ok) {
      return res.status(200).json({
        ok: false,
        error: `K-Startup API ${apiRes.status}`,
        detail: text.slice(0, 500),
        fallback: true,
        listings: STATIC_FALLBACK,
      });
    }

    // JSON 우선 시도, 안 되면 XML 파싱
    let items = [];
    let parseMode = 'unknown';
    let tagUsed = null;

    try {
      const json = JSON.parse(text);
      const candidates =
        json?.response?.body?.items?.item ||
        json?.response?.body?.items ||
        json?.data ||
        json?.items ||
        [];
      items = Array.isArray(candidates) ? candidates : [candidates];
      parseMode = 'json';
    } catch (jsonErr) {
      // XML 파싱
      const parsed = parseXMLItems(text);
      items = parsed.items;
      tagUsed = parsed.tagUsed;
      parseMode = 'xml';
    }

    const today = new Date().toISOString().slice(0, 10);
    const transformed = items
      .filter(x => x && typeof x === 'object')
      .map((item, idx) => transformItem(item, idx))
      .filter(x => x.title && (!x.deadline || x.deadline >= today))
      .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));

    // 파싱은 됐는데 결과 0건이면 디버그 정보 추가
    const response = {
      ok: true,
      count: transformed.length,
      totalCount: extractTotalCount(text),
      parseMode,
      tagUsed,
      contentType: ct,
      updatedAt: new Date().toISOString(),
      source: 'kstartup-live',
      listings: transformed,
    };

    if (transformed.length === 0) {
      response.debug = {
        rawItemsParsed: items.length,
        topLevelTags: extractTopLevelTags(text).slice(0, 30),
        rawSample: text.slice(0, 3000),
        firstItemKeys: items[0] ? Object.keys(items[0]) : [],
      };
    }

    return res.status(200).json(response);
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
