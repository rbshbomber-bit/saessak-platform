// 새싹지원사업 — AI 결과물 저장/조회 공유 모듈
// localStorage 기반 (사용자별), 마이페이지의 "내 자료실"에서 조회

(function () {
  window.saessak = window.saessak || {};

  const HISTORY_KEY = 'saessak_ai_history';
  const MAX_ITEMS = 300;  // 사용자당 최대 300건 (localStorage 한도 고려)

  /**
   * AI 결과물 저장
   * @param {object} record - { kind, title, target, input, output, meta }
   *   kind: 'plan' | 'compare' | 'simulate' | 'slides' | 'mentor' | 'docx'
   *   title: 표시용 제목
   *   target: 신청 사업명 (예: 예비창업패키지)
   *   input: 사용자 입력 (사업계획서 본문 등)
   *   output: AI 결과 (JSON 또는 텍스트)
   *   meta: 추가 메타데이터 (자유)
   */
  window.saessak.saveHistory = function (record) {
    try {
      const userId = localStorage.getItem('saessak_current_user');
      if (!userId) return null;

      const allHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
      const userHistory = allHistory[userId] || [];

      const item = {
        id: 'h-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        userId,
        kind: record.kind,
        title: record.title || '제목 없음',
        target: record.target || '',
        input: record.input || '',
        output: record.output || null,
        meta: record.meta || {},
        createdAt: new Date().toISOString(),
      };

      userHistory.unshift(item);
      // 한도 초과 시 오래된 거 삭제
      if (userHistory.length > MAX_ITEMS) {
        userHistory.length = MAX_ITEMS;
      }
      allHistory[userId] = userHistory;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(allHistory));
      return item;
    } catch (e) {
      console.warn('[saessak.saveHistory] failed:', e);
      return null;
    }
  };

  /**
   * 현재 사용자의 히스토리 전체 조회 (최신순)
   * @param {string} [kind] - 종류 필터 (선택)
   */
  window.saessak.getHistory = function (kind) {
    try {
      const userId = localStorage.getItem('saessak_current_user');
      if (!userId) return [];
      const allHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
      const userHistory = allHistory[userId] || [];
      if (kind) return userHistory.filter(x => x.kind === kind);
      return userHistory;
    } catch (e) { return []; }
  };

  /**
   * 특정 히스토리 1건 조회
   */
  window.saessak.getHistoryItem = function (id) {
    return window.saessak.getHistory().find(x => x.id === id) || null;
  };

  /**
   * 특정 히스토리 1건 삭제
   */
  window.saessak.deleteHistory = function (id) {
    try {
      const userId = localStorage.getItem('saessak_current_user');
      if (!userId) return false;
      const allHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
      const userHistory = allHistory[userId] || [];
      const idx = userHistory.findIndex(x => x.id === id);
      if (idx === -1) return false;
      userHistory.splice(idx, 1);
      allHistory[userId] = userHistory;
      localStorage.setItem(HISTORY_KEY, JSON.stringify(allHistory));
      return true;
    } catch (e) { return false; }
  };

  /**
   * 다음 단계로 데이터 전달 (compare → simulate 등)
   * 임시 localStorage 키에 저장 후 다음 페이지에서 자동 입력
   */
  window.saessak.handOff = function (data) {
    try {
      localStorage.setItem('saessak_handoff', JSON.stringify({
        ...data,
        timestamp: Date.now(),
      }));
      return true;
    } catch (e) { return false; }
  };

  window.saessak.consumeHandOff = function () {
    try {
      const raw = localStorage.getItem('saessak_handoff');
      if (!raw) return null;
      const data = JSON.parse(raw);
      // 1시간 이내만 유효
      if (Date.now() - data.timestamp > 3600 * 1000) {
        localStorage.removeItem('saessak_handoff');
        return null;
      }
      localStorage.removeItem('saessak_handoff');
      return data;
    } catch (e) { return null; }
  };

  // 종류 라벨
  window.saessak.KIND_LABEL = {
    plan: '사업계획서 AI',
    compare: '비교 분석',
    simulate: '심사 시뮬레이션',
    slides: '발표 슬라이드',
    mentor: '1:1 멘토링',
    docx: 'DOCX 문서',
  };
})();
