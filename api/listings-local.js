// Vercel Serverless Function: /api/listings-local
// K-Startup에 안 올라오는 지역·전국 청년지원사업 공고 보강 스크래퍼
// 소스: 강화군청 / 강화일자리센터 / 전국 창조경제혁신센터 / 인천 청년정책 포털

// ===== 유틸 =====
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function clean(s) {
  return (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function classifyField(title) {
  const text = title || '';
  if (/AI|인공지능|딥테크|빅데이터|로봇|반도체|기술|R&D/i.test(text)) return '딥테크';
  if (/바이오|헬스|의료|웰니스|메디컬/i.test(text)) return '헬스케어';
  if (/농업|농식품|푸드|식품|로컬|관광/i.test(text)) return '농업·푸드';
  if (/콘텐츠|문화|예술|미디어|영상/i.test(text)) return '문화·콘텐츠';
  if (/소셜|사회적|돌봄|복지/i.test(text)) return '소셜·복지';
  if (/입주|보육|공간/i.test(text)) return '시설·공간';
  if (/교육|아카데미|캠프|스쿨/i.test(text)) return '창업교육';
  return '일반';
}

function classifyTypes(title) {
  const text = title || '';
  const types = [];
  if (/지원금|사업화|자금|바우처|보조금|모집|지원사업/.test(text)) types.push('자금');
  if (/입주|공간|보육|센터/.test(text)) types.push('공간');
  if (/멘토|컨설팅|액셀러|IR|투자/.test(text)) types.push('멘토링');
  if (/교육|아카데미|캠프|스쿨|강의/.test(text)) types.push('교육');
  if (/판로|수출|해외|마케팅|전시/.test(text)) types.push('판로');
  return types.length ? types : ['자금'];
}

const CCEI_CENTERS = [
  { name: '서울', region: 'seoul' },
  { name: '경기', region: 'gyeonggi' },
  { name: '인천', region: 'incheon' },
  { name: '부산', region: 'busan' },
  { name: '대구', region: 'daegu' },
  { name: '울산', region: 'ulsan' },
  { name: '광주', region: 'gwangju' },
  { name: '대전', region: 'daejeon' },
  { name: '세종', region: 'sejong' },
  { name: '강원', region: 'gangwon' },
  { name: '충북', region: 'chungbuk' },
  { name: '충남', region: 'chungnam' },
  { name: '전북', region: 'jeonbuk' },
  { name: '전남', region: 'jeonnam' },
  { name: '경북', region: 'gyeongbuk' },
  { name: '경남', region: 'gyeongnam' },
  { name: '제주', region: 'jeju' },
];

function isRelevantSupportTitle(title) {
  return /(청년|창업|스타트업|예비창업|초기창업|벤처|소상공인|로컬|창업기업|사업화|입주|보육|액셀러|IR|투자|지원사업)/.test(title);
}

async function fetchWithTimeout(url, ms = 6000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Saessak-Platform/1.0 (+https://saessak-platform.vercel.app)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });
    clearTimeout(t);
    return res;
  } catch (err) {
    clearTimeout(t);
    return null;
  }
}

async function fetchHtml(url, ms = 6000) {
  const res = await fetchWithTimeout(url, ms);
  if (!res || !res.ok) return '';
  const buffer = await res.arrayBuffer();
  // UTF-8 우선
  let html = new TextDecoder('utf-8').decode(buffer);
  // 한글 깨졌으면 EUC-KR 재시도 (한국 지자체 사이트는 EUC-KR 흔함)
  if (html.includes('�')) {
    try {
      html = new TextDecoder('euc-kr').decode(buffer);
    } catch (e) {
      // EUC-KR 미지원 환경 — UTF-8 결과 그대로
    }
  }
  return html;
}

// ===== 1) 강화군청 공지사항 (청년·창업 키워드 필터) =====
async function fetchGanghwaGov() {
  const baseUrl = 'https://www.ganghwa.go.kr';
  const listUrl = `${baseUrl}/open_content/main/bbs/bbsMsgList.do?bcd=notice`;
  const html = await fetchHtml(listUrl);
  if (!html) return [];

  const results = [];
  const seen = new Set();
  // msg_seq=숫자 패턴 + 인접 텍스트
  const regex = /msg_seq=(\d+)[^>]*>\s*([^<]{5,200})</g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    const title = decodeEntities(clean(m[2]));
    // 청년·창업 관련만 통과
    if (!/(청년|창업|일자리|영농|소상공인)/.test(title)) continue;
    if (title.length < 5) continue;
    seen.add(id);
    results.push({
      id: `ganghwa-gov-${id}`,
      title,
      region: 'incheon',
      regionLabel: '인천 강화군',
      org: '강화군청',
      field: '일반',
      age: '제한 없음',
      money: '문의',
      types: ['자금'],
      moneyMax: 0,
      deadline: '',
      summary: '강화군청 공고 — 상세는 원본 페이지 참조',
      url: `${baseUrl}/open_content/main/bbs/bbsMsgDetail.do?bcd=notice&msg_seq=${id}`,
      source: 'ganghwa-gov',
    });
  }
  return results.slice(0, 30);
}

// ===== 2) 강화군 창업·일자리센터 (그누보드) =====
async function fetchGanghwaJob() {
  const baseUrl = 'https://www.ganghwajob.kr';
  const listUrl = `${baseUrl}/_NBoard/board.php?bo_table=notice`;
  const html = await fetchHtml(listUrl);
  if (!html) return [];

  const results = [];
  const seen = new Set();
  // 그누보드: wr_id=숫자 패턴
  const regex = /wr_id=(\d+)[^>]*>\s*([^<]{5,200})</g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    const title = decodeEntities(clean(m[2]));
    if (title.length < 5 || title.length > 200) continue;
    // 메뉴/푸터 텍스트 제외
    if (/(로그인|회원가입|메뉴|이전|다음|페이지)/.test(title)) continue;
    seen.add(id);
    results.push({
      id: `ganghwa-job-${id}`,
      title,
      region: 'incheon',
      regionLabel: '인천 강화군',
      org: '강화군 창업·일자리센터',
      field: '일반',
      age: '만 39세 이하',
      money: '문의',
      types: ['자금'],
      moneyMax: 0,
      deadline: '',
      summary: '강화군 창업·일자리센터 공고',
      url: `${baseUrl}/_NBoard/board.php?bo_table=notice&wr_id=${id}`,
      source: 'ganghwa-job',
    });
  }
  return results.slice(0, 30);
}

// ===== 3) 전국 창조경제혁신센터 (사업공고) =====
async function fetchCCEICenter(center) {
  const baseUrl = 'https://ccei.creativekorea.or.kr';
  const listUrl = `${baseUrl}/service/business_list.do?center_searching=${encodeURIComponent(center.name)}&pn=1`;
  const html = await fetchHtml(listUrl);
  if (!html) return [];

  const results = [];
  const seen = new Set();
  // onclick="goView(123)" 또는 seq=123 패턴
  const regex = /(?:goView\s*\(|seq=)['"]?(\d+)['"]?[^>]*>\s*([^<]{5,200})</g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    const title = decodeEntities(clean(m[2]));
    if (title.length < 5) continue;
    if (/(로그인|회원가입|메뉴|이전|다음)/.test(title)) continue;
    if (!isRelevantSupportTitle(title)) continue;
    seen.add(id);
    results.push({
      id: `ccei-${center.region}-${id}`,
      title,
      region: center.region,
      regionLabel: center.name,
      org: `${center.name}창조경제혁신센터`,
      field: classifyField(title),
      age: '만 39세 이하',
      money: '문의',
      types: classifyTypes(title),
      moneyMax: 0,
      deadline: '',
      summary: `${center.name}창조경제혁신센터 사업공고 — 상세는 원본 페이지에서 확인`,
      url: `${baseUrl}/service/business_view.do?seq=${id}`,
      source: `ccei-${center.region}`,
    });
  }
  return results.slice(0, 20);
}

async function fetchCCEIAll() {
  const settled = await Promise.allSettled(CCEI_CENTERS.map(fetchCCEICenter));
  return settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}

// ===== 4) 인천 청년정책 포털 =====
async function fetchIncheonYouth() {
  const baseUrl = 'https://youth.incheon.go.kr';
  // acptrun=ing → 모집 중만
  const listUrl = `${baseUrl}/youthpolicy/youthPolicyInfoList.do?acptrun=ing&pgno=1`;
  const html = await fetchHtml(listUrl);
  if (!html) return [];

  const results = [];
  const seen = new Set();
  const regex = /poly_seq=(\d+)[^>]*>\s*([^<]{5,200})</g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    const title = decodeEntities(clean(m[2]));
    if (title.length < 5) continue;
    if (/(로그인|회원가입|메뉴|이전|다음|페이지)/.test(title)) continue;
    seen.add(id);
    // 창업 관련 우선 분류
    const isStartup = /(창업|스타트업|벤처|사업|소상공인|영농)/.test(title);
    results.push({
      id: `incheon-youth-${id}`,
      title,
      region: 'incheon',
      regionLabel: '인천 (청년정책)',
      org: '인천광역시 청년정책',
      field: '일반',
      age: '만 39세 이하',
      money: '문의',
      types: isStartup ? ['자금'] : ['기타'],
      moneyMax: 0,
      deadline: '',
      summary: '인천 청년정책 통합플랫폼 공고',
      url: `${baseUrl}/youthpolicy/youthPolicyInfoDetail.do?poly_seq=${id}`,
      source: 'incheon-youth',
      _isStartup: isStartup,  // 후처리용
    });
  }
  // 청년창업 관련 먼저, 그 다음 일반 청년정책
  results.sort((a, b) => Number(b._isStartup) - Number(a._isStartup));
  return results.slice(0, 30).map(({ _isStartup, ...rest }) => rest);
}

// ===== 핸들러 =====
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // 캐시 1시간 (지자체 공고는 갱신 빈도 낮음, 스크래핑 부담 방지)
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=1800');

  try {
    // 공식 소스 병렬 fetch — 한 곳 실패해도 다른 거 동작
    const [ganghwaGov, ganghwaJob, ccei, incheonYouth] = await Promise.all([
      fetchGanghwaGov().catch(e => { console.error('ganghwa-gov', e.message); return []; }),
      fetchGanghwaJob().catch(e => { console.error('ganghwa-job', e.message); return []; }),
      fetchCCEIAll().catch(e => { console.error('ccei', e.message); return []; }),
      fetchIncheonYouth().catch(e => { console.error('incheon-youth', e.message); return []; }),
    ]);

    const seen = new Set();
    const all = [...ganghwaGov, ...ganghwaJob, ...ccei, ...incheonYouth].filter(item => {
      const key = `${item.title}|${item.org}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return res.status(200).json({
      ok: true,
      count: all.length,
      sources: {
        ganghwaGov: ganghwaGov.length,
        ganghwaJob: ganghwaJob.length,
        cceiAll: ccei.length,
        incheonYouth: incheonYouth.length,
      },
      updatedAt: new Date().toISOString(),
      source: 'local-scrape',
      listings: all,
    });
  } catch (err) {
    console.error('listings-local error', err);
    return res.status(200).json({
      ok: false,
      error: err.message,
      listings: [],
    });
  }
}
