// Vercel Serverless Function: /api/listings-local
// K-Startup에 안 올라오는 강화·인천 지역 공고 보강 스크래퍼
// 4개 소스: 강화군청 / 강화일자리센터 / 인천CCEI / 인천 청년정책 포털

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

// ===== 3) 인천창조경제혁신센터 (사업공고) =====
async function fetchCCEI() {
  const baseUrl = 'https://ccei.creativekorea.or.kr';
  // 인천 지부 사업공고 목록 (center_searching=인천)
  const listUrl = `${baseUrl}/service/business_list.do?center_searching=%EC%9D%B8%EC%B2%9C&pn=1`;
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
    seen.add(id);
    results.push({
      id: `ccei-incheon-${id}`,
      title,
      region: 'incheon',
      regionLabel: '인천',
      org: '인천창조경제혁신센터',
      field: '일반',
      age: '만 39세 이하',
      money: '문의',
      types: ['자금', '멘토링'],
      moneyMax: 0,
      deadline: '',
      summary: '인천창조경제혁신센터 사업공고',
      url: `${baseUrl}/service/business_view.do?seq=${id}`,
      source: 'ccei-incheon',
    });
  }
  return results.slice(0, 30);
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
    // 4개 소스 병렬 fetch — 한 곳 실패해도 다른 거 동작
    const [ganghwaGov, ganghwaJob, ccei, incheonYouth] = await Promise.all([
      fetchGanghwaGov().catch(e => { console.error('ganghwa-gov', e.message); return []; }),
      fetchGanghwaJob().catch(e => { console.error('ganghwa-job', e.message); return []; }),
      fetchCCEI().catch(e => { console.error('ccei', e.message); return []; }),
      fetchIncheonYouth().catch(e => { console.error('incheon-youth', e.message); return []; }),
    ]);

    const all = [...ganghwaGov, ...ganghwaJob, ...ccei, ...incheonYouth];

    return res.status(200).json({
      ok: true,
      count: all.length,
      sources: {
        ganghwaGov: ganghwaGov.length,
        ganghwaJob: ganghwaJob.length,
        ccei: ccei.length,
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
