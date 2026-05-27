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

  // === 1단계: supt_regin (시도 필드) 우선 검사 — 가장 신뢰도 높음 ===
  // 이 필드가 채워져 있으면 다른 곳의 단어(역량강화 등)는 무시
  if (suptRegin && suptRegin.trim().length > 0) {
    const sr = suptRegin;
    if (/전국|전체 권역|전\s*국/.test(sr)) return 'national';
    if (/서울/.test(sr)) return 'seoul';
    if (/경기/.test(sr)) return 'gyeonggi';
    if (/인천/.test(sr)) return 'incheon';
    if (/부산/.test(sr)) return 'busan';
    if (/대구/.test(sr)) return 'daegu';
    if (/울산/.test(sr)) return 'ulsan';
    if (/광주/.test(sr)) return 'gwangju';
    if (/대전/.test(sr)) return 'daejeon';
    if (/세종/.test(sr)) return 'sejong';
    if (/강원/.test(sr)) return 'gangwon';
    if (/충북|충청북도/.test(sr)) return 'chungbuk';
    if (/충남|충청남도/.test(sr)) return 'chungnam';
    if (/전북|전라북도/.test(sr)) return 'jeonbuk';
    if (/전남|전라남도/.test(sr)) return 'jeonnam';
    if (/경북|경상북도/.test(sr)) return 'gyeongbuk';
    if (/경남|경상남도/.test(sr)) return 'gyeongnam';
    if (/제주/.test(sr)) return 'jeju';
  }

  // === 2단계: supt_regin 비어있을 때만 agency + title로 추정 ===
  const r = (agency + ' ' + title).toLowerCase();
  if (/서울/.test(r)) return 'seoul';
  if (/경기/.test(r)) return 'gyeonggi';
  // 인천 — 시·군·구 보강 (강화군·옹진군 정확 매칭, "역량강화" 같은 단어 제외)
  if (/인천|강화군|옹진군|미추홀|남동구|부평구|계양구|연수구/.test(r)) return 'incheon';
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

function stripHTML(s) {
  return decodeEntities(String(s || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function parseBizinfoPeriod(period) {
  const raw = String(period || '');
  const dashedDates = raw.match(/\d{4}-\d{2}-\d{2}/g) || [];
  if (dashedDates.length) {
    return {
      start: dashedDates[0] || '',
      end: dashedDates[1] || dashedDates[0] || '',
    };
  }
  const compactDates = raw.match(/\d{8}/g) || [];
  return {
    start: normalizeDate(compactDates[0] || ''),
    end: normalizeDate(compactDates[1] || compactDates[0] || ''),
  };
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
  const m5 = text.match(/(\d+)\s*백만\s*원/);
  if (m5) return `${m5[1]}백만원`;
  return '문의';
}

// HTML 엔티티 디코딩
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
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

function isFundingRelevant(title, summary, category, hashTags) {
  const text = `${title} ${summary} ${category} ${hashTags}`.toLowerCase();
  const hasFundingSignal = /자금|사업화|지원금|보조금|사업비|융자|대출|보증|투자|바우처|시제품|제품화|상용화|r&d|기술개발|마케팅|판로|수출|해외시장/.test(text);
  const hasEducationOnlySignal = /교육|아카데미|강의|특강|세미나|설명회|포럼|컨퍼런스|워크숍|워크샵|캠프|상담회|행사|박람회|페어|멘토링/.test(text);
  const hasHardFundingSignal = /자금|사업화|지원금|보조금|사업비|융자|대출|보증|투자|바우처|r&d|기술개발/.test(text);
  const hasEventOnlySignal = /참관객|참가자|청중|행사|네트워크|정기\s*ir|설명회|세미나|포럼|컨퍼런스/.test(text);
  const hasDirectMoneySignal = /자금|사업화|지원금|보조금|사업비|융자|대출|보증|투자유치|투자금|바우처|r&d|기술개발/.test(text);

  if (hasEventOnlySignal && !hasDirectMoneySignal) return false;
  if (hasFundingSignal) return true;
  if (hasEducationOnlySignal && !hasHardFundingSignal) return false;
  return /금융|창업/.test(category || hashTags || '');
}

function isListingFundingRelevant(x) {
  return isFundingRelevant(
    x.title,
    x.summary,
    `${x.bizClsfc || ''} ${(x.types || []).join(' ')}`,
    `${x.field || ''} ${x.hashTags || ''}`
  );
}

function bizinfoTypes(title, summary, category) {
  const text = `${title} ${summary} ${category}`;
  const types = [];
  if (/융자|대출|보증|정책자금|운전자금|시설자금/.test(text)) types.push('융자');
  if (/자금|사업화|지원금|보조금|사업비|바우처|시제품|제품화|상용화|기술개발|r&d/i.test(text)) types.push('자금');
  if (/멘토링|컨설팅/.test(text)) types.push('멘토링');
  if (/판로|수출|마케팅|홍보/.test(text)) types.push('판로');
  if (/공간|입주|보육/.test(text)) types.push('공간');
  return types.length ? [...new Set(types)] : (/금융/.test(category) ? ['융자'] : ['자금']);
}

function bizinfoMoney(title, summary, category) {
  const text = `${title} ${summary}`;
  const amount = extractAmount(text, category);
  if (amount !== '문의') return amount;
  if (/융자|대출|보증|정책자금/.test(text + category)) return '융자·보증';
  if (/바우처/.test(text)) return '바우처';
  return '지원금 문의';
}

function transformBizinfoItem(item, idx) {
  const title = stripHTML(item.pblancNm || item.title || '');
  const summary = stripHTML(item.bsnsSumryCn || item.description || '');
  const category = stripHTML(`${item.pldirSportRealmLclasCodeNm || item.lcategory || ''} ${item.pldirSportRealmMlsfcCodeNm || ''}`);
  const hashTags = stripHTML(item.hashTags || item.hashtags || '');
  const agency = stripHTML(item.jrsdInsttNm || item.author || '');
  const execAgency = stripHTML(item.excInsttNm || '');
  const period = parseBizinfoPeriod(item.reqstBeginEndDe || item.reqstDt || '');
  const id = item.pblancId || item.seq || `bizinfo-${idx}`;
  const url = item.pblancUrl || item.link || 'https://www.bizinfo.go.kr';
  const regionLabel = classifyBizinfoRegion(hashTags, agency, title);
  const region = classifyRegion(regionLabel, agency, title);
  const types = bizinfoTypes(title, summary, category);
  const money = bizinfoMoney(title, summary, category);
  const fieldKey = classifyField(title, summary, category);

  return {
    id: `bi-${id}`,
    region,
    regionLabel,
    title: title.replace(/\s+/g, ' '),
    org: execAgency ? `${agency || '기업마당'} / ${execAgency}` : (agency || '기업마당'),
    field: FIELD_KO[fieldKey] || category || '일반',
    age: /청년|39세|만\s*39/.test(`${title} ${summary}`) ? '만 39세 이하' : '제한 없음',
    money,
    types,
    moneyMax: moneyToNumber(money, summary),
    deadline: period.end,
    summary: summary.slice(0, 250),
    url,
    fieldKey,
    bizClsfc: category,
    sprvInst: agency,
    period: period.start || period.end ? `${period.start || '상시'} ~ ${period.end || '상시'}` : '상시/공고문 확인',
    target: stripHTML(item.trgetNm || ''),
    applyUrl: item.rceptEngnHmpgUrl || url,
    contact: stripHTML(item.refrncNm || ''),
    hashTags,
    rcrtOngoing: true,
    isExplicitlyNonYouth: false,
    source: 'bizinfo',
  };
}

function classifyBizinfoRegion(hashTags, agency, title) {
  const primaryText = `${title || ''},${agency || ''}`;
  const regions = ['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'];
  const primaryFound = regions.find(r => primaryText.includes(r));
  if (primaryFound) return primaryFound;

  const tagText = `${hashTags || ''}`;
  const tagMatches = regions.filter(r => tagText.includes(r));
  if (tagMatches.length >= 10) return '전국';
  return tagMatches[0] || '전국';
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

  const ageStr = (targetAge + ' ' + target + ' ' + title).toLowerCase();
  const isYouth = /만 39세 이하|39세|청년|만 19세|만 20세|만 29세|만 34세/.test(ageStr);
  // 명시적으로 청년 대상이 아닌 경우 (만 40세 이상, 시니어, 중장년 등)
  const isExplicitlyNonYouth = !isYouth && /만 40세|만 45세|만 50세|만 65세|시니어|중장년|장년|노인|silver|senior/i.test(ageStr);

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
    isExplicitlyNonYouth: isExplicitlyNonYouth,
    source: 'kstartup',
  };
}

// 단일 페이지 가져오기
async function fetchPage(apiKey, page, perPage) {
  const url = new URL('https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01');
  url.searchParams.set('serviceKey', apiKey);
  url.searchParams.set('perPage', String(perPage));
  url.searchParams.set('page', String(page));
  url.searchParams.set('numOfRows', String(perPage));
  url.searchParams.set('pageNo', String(page));

  try {
    const apiRes = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/xml,text/xml,*/*',
        'User-Agent': 'saessak-platform/1.0',
      }
    });
    if (!apiRes.ok) {
      console.error(`K-Startup page ${page} HTTP ${apiRes.status}`);
      return { items: [], totalCount: 0 };
    }
    const text = await apiRes.text();
    return {
      items: parseKStartupXML(text),
      totalCount: extractTotalCount(text),
    };
  } catch (err) {
    console.error(`K-Startup page ${page} fetch error`, err.message);
    return { items: [], totalCount: 0 };
  }
}

async function fetchBizinfoPage(apiKey, categoryId, page, perPage) {
  if (!apiKey) return { items: [], totalCount: 0, skipped: true };

  const url = new URL('https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do');
  url.searchParams.set('crtfcKey', apiKey);
  url.searchParams.set('dataType', 'json');
  url.searchParams.set('searchLclasId', categoryId);
  url.searchParams.set('pageUnit', String(perPage));
  url.searchParams.set('pageIndex', String(page));

  try {
    const apiRes = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json,*/*',
        'User-Agent': 'saessak-platform/1.0',
      }
    });
    const text = await apiRes.text();
    if (!apiRes.ok) {
      console.error(`Bizinfo category ${categoryId} page ${page} HTTP ${apiRes.status}`);
      return { items: [], totalCount: 0 };
    }
    const data = JSON.parse(text);
    if (data.reqErr) {
      console.error(`Bizinfo category ${categoryId} page ${page} error: ${data.reqErr}`);
      return { items: [], totalCount: 0 };
    }
    const channel = data.jsonArray || data.channel || data;
    const rawItems = Array.isArray(channel) ? channel : (channel.item || []);
    const items = Array.isArray(rawItems) ? rawItems : [rawItems].filter(Boolean);
    const totalCount = parseInt(items[0]?.totCnt || channel.totCnt || '0', 10) || 0;
    return { items, totalCount };
  } catch (err) {
    console.error(`Bizinfo category ${categoryId} page ${page} fetch error`, err.message);
    return { items: [], totalCount: 0 };
  }
}

async function fetchBizinfoListings(apiKey, pages, perPage) {
  if (!apiKey) {
    return { listings: [], rawItemsParsed: 0, totalAvailable: 0, skipped: true };
  }

  // 01 금융, 06 창업. 교육/행사성은 transform 전 필터에서 제외한다.
  const categories = ['01', '06'];
  const requests = [];
  categories.forEach(categoryId => {
    for (let page = 1; page <= pages; page += 1) {
      requests.push(fetchBizinfoPage(apiKey, categoryId, page, perPage));
    }
  });
  const results = await Promise.all(requests);
  const rawItems = results.flatMap(r => r.items);
  const totalAvailable = results.reduce((sum, r) => sum + (r.totalCount || 0), 0);

  const listings = rawItems
    .map((item, idx) => transformBizinfoItem(item, idx))
    .filter(x => x.title)
    .filter(x => isFundingRelevant(x.title, x.summary, x.bizClsfc, x.hashTags || ''));

  return {
    listings,
    rawItemsParsed: rawItems.length,
    totalAvailable,
    skipped: false,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 캐시 10분 (1시간 → 10분 단축, 최신성 ↑)
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  const apiKey = process.env.KSTARTUP_API_KEY;
  const bizinfoApiKey = process.env.BIZINFO_API_KEY;
  if (!apiKey && !bizinfoApiKey) {
    return res.status(200).json({
      ok: false,
      error: 'KSTARTUP_API_KEY 또는 BIZINFO_API_KEY 환경 변수 미설정',
      fallback: true,
      listings: STATIC_FALLBACK,
    });
  }

  // ?youth=1 파라미터: 청년창업만 필터
  const youthOnly = req.query?.youth === '1';
  // ?perPage 파라미터: 페이지당 개수 (기본 500, 최대 500)
  const perPage = Math.min(parseInt(req.query?.perPage || '500', 10), 500);
  // ?pages 파라미터: 가져올 페이지 수 (기본 5 = 최대 2,500건, 최대 10 = 5,000건)
  const maxPages = Math.min(parseInt(req.query?.pages || '5', 10), 10);
  const includeBizinfo = req.query?.bizinfo !== '0';
  const fundingOnly = req.query?.funding !== '0';
  const bizinfoPages = Math.min(parseInt(req.query?.bizinfoPages || '2', 10), 5);
  const bizinfoPerPage = Math.min(parseInt(req.query?.bizinfoPerPage || '100', 10), 300);

  try {
    // 페이지 1~N 병렬 호출
    const pageNumbers = Array.from({ length: maxPages }, (_, i) => i + 1);
    const results = apiKey
      ? await Promise.all(pageNumbers.map(p => fetchPage(apiKey, p, perPage)))
      : [];

    // 모든 페이지 합치기
    const allItems = results.flatMap(r => r.items);
    const totalAvailable = results[0]?.totalCount || 0;
    const bizinfoResult = includeBizinfo
      ? await fetchBizinfoListings(bizinfoApiKey, bizinfoPages, bizinfoPerPage)
      : { listings: [], rawItemsParsed: 0, totalAvailable: 0, skipped: true };

    const today = new Date().toISOString().slice(0, 10);

    // 변환 + 필터 + 중복 제거 + 정렬
    const kstartupListings = allItems
      .map((item, idx) => transformItem(item, idx))
      .filter(x => x.title)
      .filter(x => !x.deadline || x.deadline >= today)
      .filter(x => x.rcrtOngoing !== false)
      .filter(x => !x.isExplicitlyNonYouth);

    const bizinfoListings = bizinfoResult.listings
      .filter(x => !x.deadline || x.deadline >= today);

    let transformed = [...kstartupListings, ...bizinfoListings];
    if (fundingOnly) {
      transformed = transformed.filter(isListingFundingRelevant);
    }

    // 중복 제거 (원천 ID 우선, 같은 제목+기관 보조)
    const seenIds = new Set();
    const seenTitles = new Set();
    transformed = transformed.filter(x => {
      const titleKey = `${x.title}|${x.org}`.replace(/\s+/g, ' ').toLowerCase();
      if (seenIds.has(x.id) || seenTitles.has(titleKey)) return false;
      seenIds.add(x.id);
      seenTitles.add(titleKey);
      return true;
    });

    // 마감 임박순 정렬
    transformed.sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));

    // 청년 전용 필터
    if (youthOnly) {
      transformed = transformed.filter(x => x.age === '만 39세 이하');
    }

    return res.status(200).json({
      ok: true,
      count: transformed.length,
      totalAvailable: totalAvailable + (bizinfoResult.totalAvailable || 0),
      rawItemsParsed: allItems.length + (bizinfoResult.rawItemsParsed || 0),
      pagesFetched: maxPages,
      updatedAt: new Date().toISOString(),
      source: includeBizinfo ? 'kstartup-bizinfo-live' : 'kstartup-live',
      fundingOnly,
      sources: {
        kstartup: {
          enabled: Boolean(apiKey),
          count: kstartupListings.length,
          rawItemsParsed: allItems.length,
          totalAvailable,
        },
        bizinfo: {
          enabled: Boolean(bizinfoApiKey) && includeBizinfo,
          skipped: bizinfoResult.skipped,
          count: bizinfoListings.length,
          rawItemsParsed: bizinfoResult.rawItemsParsed || 0,
          totalAvailable: bizinfoResult.totalAvailable || 0,
        },
      },
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
