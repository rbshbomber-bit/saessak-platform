// 새싹매치 — 일일 사용 한도 (어뷰징 방지, 마진 보호)
// 정찰제 토큰 모델 유지 + 비정상적 무한 사용만 차단
// 관리자(rbshbomber@gmail.com)는 자동 우회
//
// 사용법:
//   if (!window.saessak.checkLimit('planner')) {
//     alert(window.saessak.getLimitMessage('planner'));
//     return;
//   }
//   // ... API 호출 ...
//   window.saessak.recordUsage('planner');  // API 성공 후

(function () {
  window.saessak = window.saessak || {};

  // 일일 사용 한도 (기능별)
  // 평균 사용자는 절대 도달 못함. 어뷰저(스크립트 봇, 무한 reroll)만 차단.
  const DAILY_LIMITS = {
    match:    30,   // AI 매칭 (무료, K-Startup API 비용 방어)
    planner:   5,   // 사업계획서 AI (5,000원 × 5건 = 하루 2.5만원)
    compare:  10,   // 비교 분석 (2,500원 × 10건 = 2.5만원)
    simulate:  3,   // 심사 시뮬레이션 (12,500원 × 3건 = 3.75만원, 가장 무거움)
    slides:    5,   // 발표 슬라이드 (7,500원 × 5건 = 3.75만원)
    mentor:   10,   // 멘토링 세션 (30토큰 × 10 = 7.5만원, 세션 시작 단위)
    lib:      10    // 합격 라이브러리 해제 (현재 준비 중)
  };

  const FEATURE_LABEL = {
    match: 'AI 매칭', planner: '사업계획서 AI', compare: '비교 분석',
    simulate: '심사 시뮬레이션', slides: '발표 슬라이드',
    mentor: '1:1 멘토링', lib: '합격 라이브러리'
  };

  const STORAGE_KEY = 'saessak_daily_usage';

  // KST 기준 오늘 날짜 (YYYY-MM-DD)
  function todayKST() {
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 - now.getTimezoneOffset()) * 60000);
    return kst.toISOString().slice(0, 10);
  }

  function loadUsage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { date: todayKST(), counts: {} };
      const parsed = JSON.parse(raw);
      // 다른 날짜면 리셋
      if (parsed.date !== todayKST()) return { date: todayKST(), counts: {} };
      return parsed;
    } catch (e) {
      return { date: todayKST(), counts: {} };
    }
  }

  function saveUsage(usage) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
    } catch (e) { /* localStorage 가득참 등 무시 */ }
  }

  /**
   * 사용 한도 OK인지 확인 (관리자 자동 우회)
   * @param {string} feature — 'planner', 'compare', 'simulate', 'slides', 'mentor', 'match', 'lib'
   * @returns {boolean} 사용 가능하면 true
   */
  window.saessak.checkLimit = function (feature) {
    // 관리자는 무제한
    if (window.saessak.isAdmin && window.saessak.isAdmin()) return true;

    const limit = DAILY_LIMITS[feature];
    if (typeof limit !== 'number') return true; // 정의 안 된 기능은 통과

    const usage = loadUsage();
    const used = usage.counts[feature] || 0;
    return used < limit;
  };

  /**
   * 사용 기록 (API 호출 성공 후 호출)
   * 관리자는 카운트 안 늘림 (통계 왜곡 방지)
   */
  window.saessak.recordUsage = function (feature) {
    if (window.saessak.isAdmin && window.saessak.isAdmin()) return;
    if (typeof DAILY_LIMITS[feature] !== 'number') return;

    const usage = loadUsage();
    usage.counts[feature] = (usage.counts[feature] || 0) + 1;
    saveUsage(usage);
  };

  /**
   * 한도 초과 시 사용자에게 보여줄 메시지
   */
  window.saessak.getLimitMessage = function (feature) {
    const limit = DAILY_LIMITS[feature] || 0;
    const label = FEATURE_LABEL[feature] || feature;
    return `오늘 ${label} 사용 한도(${limit}건)에 도달했습니다.\n\n` +
           `과도한 사용 방지를 위한 일일 제한입니다. ` +
           `한국 시간 기준 자정 이후 다시 이용해주세요.\n\n` +
           `(긴급 사용 필요 시 운영자 rbshbomber@gmail.com 으로 문의)`;
  };

  /**
   * 오늘 남은 사용 횟수 (마이페이지 등에서 표시용)
   * @returns {number} 남은 횟수 (관리자는 Infinity)
   */
  window.saessak.getRemainingToday = function (feature) {
    if (window.saessak.isAdmin && window.saessak.isAdmin()) return Infinity;
    const limit = DAILY_LIMITS[feature];
    if (typeof limit !== 'number') return Infinity;
    const usage = loadUsage();
    const used = usage.counts[feature] || 0;
    return Math.max(0, limit - used);
  };

  /**
   * 오늘 전체 사용량 (마이페이지 등에서 일괄 표시용)
   * @returns {object} { planner: {used, limit, remaining}, ... }
   */
  window.saessak.getDailyUsageSummary = function () {
    const usage = loadUsage();
    const isAdmin = window.saessak.isAdmin && window.saessak.isAdmin();
    const summary = {};
    for (const key in DAILY_LIMITS) {
      const limit = DAILY_LIMITS[key];
      const used = usage.counts[key] || 0;
      summary[key] = {
        label: FEATURE_LABEL[key] || key,
        used, limit,
        remaining: isAdmin ? Infinity : Math.max(0, limit - used)
      };
    }
    return summary;
  };

  // 디버그/관리용
  window.saessak._DAILY_LIMITS = DAILY_LIMITS;
})();
