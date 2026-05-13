// 새싹지원사업 — 관리자 권한 / 토큰 무제한 설정
// 모든 페이지에서 공유. window.saessak.isAdmin() 으로 접근.

(function () {
  window.saessak = window.saessak || {};

  // 관리자 이메일 목록 (소문자 비교)
  const ADMIN_EMAILS = [
    'rbshbomber@gmail.com'   // 변승환 — 운영자
  ];

  /**
   * 사용자가 관리자인지 판정
   * 기준: ADMIN_EMAILS 에 포함된 이메일 OR user.role === 'admin'
   */
  window.saessak.isAdmin = function (user) {
    if (!user) {
      // 인자 없으면 현재 로그인 사용자 자동 조회
      try {
        const id = localStorage.getItem('saessak_current_user');
        if (!id) return false;
        const users = JSON.parse(localStorage.getItem('saessak_users') || '[]');
        user = users.find(u => u.id === id);
        if (!user) return false;
      } catch (e) { return false; }
    }
    if (user.role === 'admin') return true;
    const email = (user.email || '').toLowerCase().trim();
    return ADMIN_EMAILS.includes(email);
  };

  /**
   * 관리자라면 토큰 무한 표시용 텍스트 반환
   * 일반 사용자는 숫자 그대로
   */
  window.saessak.formatTokens = function (user) {
    if (window.saessak.isAdmin(user)) return '∞';
    return ((user && user.tokens) || 0).toLocaleString();
  };

  /**
   * 관리자 자동 초기화 — 로그인 후 호출
   * 관리자면 tokens를 충분히 (999999) 세팅하고 role='admin' 부여
   */
  window.saessak.ensureAdminPrivileges = function () {
    try {
      const id = localStorage.getItem('saessak_current_user');
      if (!id) return false;
      const users = JSON.parse(localStorage.getItem('saessak_users') || '[]');
      const idx = users.findIndex(u => u.id === id);
      if (idx === -1) return false;
      const user = users[idx];
      const email = (user.email || '').toLowerCase().trim();
      if (ADMIN_EMAILS.includes(email) && user.role !== 'admin') {
        users[idx].role = 'admin';
        users[idx].tokens = 999999;
        localStorage.setItem('saessak_users', JSON.stringify(users));
        console.log('[saessak] 관리자 권한 부여:', email);
        return true;
      }
      return false;
    } catch (e) { return false; }
  };

  // 페이지 로드 시 자동으로 관리자 권한 체크/부여
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.saessak.ensureAdminPrivileges();
    });
  } else {
    window.saessak.ensureAdminPrivileges();
  }
})();
