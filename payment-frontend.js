/**
 * payment-frontend.js
 * index.html에 삽입할 토스페이먼츠 결제 프론트엔드 로직
 *
 * 사용법: index.html </body> 바로 위에 <script src="payment-frontend.js"></script> 추가
 * 또는 index.html의 기존 <script> 블록 안에 아래 코드를 붙여넣기
 */

(function () {
  'use strict';

  // ────────────────────────────────────────────────────
  // Toss Payments SDK 지연 로드
  // ────────────────────────────────────────────────────
  function loadTossSDK() {
    return new Promise((resolve, reject) => {
      if (window.TossPayments) return resolve(window.TossPayments);
      const script = document.createElement('script');
      script.src = 'https://js.tosspayments.com/v1/payment';
      script.onload  = () => resolve(window.TossPayments);
      script.onerror = () => reject(new Error('Toss SDK 로드 실패'));
      document.head.appendChild(script);
    });
  }

  // ────────────────────────────────────────────────────
  // 로그인한 사용자 가져오기 (supabase-config.js 호환)
  // ────────────────────────────────────────────────────
  function getCurrentUser() {
    try {
      const userId = localStorage.getItem('saessak_current_user');
      if (!userId) return null;
      const users = JSON.parse(localStorage.getItem('saessak_users') || '[]');
      return users.find(u => u.id === userId) || null;
    } catch {
      return null;
    }
  }

  // ────────────────────────────────────────────────────
  // 토큰 추가 (결제 성공 후 localStorage 업데이트)
  // ────────────────────────────────────────────────────
  function addTokensToUser(userId, tokensToAdd, packageId, orderId) {
    try {
      const users = JSON.parse(localStorage.getItem('saessak_users') || '[]');
      const user  = users.find(u => u.id === userId);
      if (!user) return false;

      user.tokens = (user.tokens || 0) + tokensToAdd;
      user.tokenLog = user.tokenLog || [];
      user.tokenLog.push({
        ts:      new Date().toISOString(),
        kind:    'purchase',
        amount:  tokensToAdd,
        balance: user.tokens,
        memo:    `토스페이먼츠 결제 — ${packageId} (${orderId})`,
      });

      localStorage.setItem('saessak_users', JSON.stringify(users));

      // 토큰 UI 즉시 갱신 (index.html의 기존 함수 호출)
      if (typeof window.refreshTokenDisplay === 'function') window.refreshTokenDisplay();
      if (typeof window.updateAuthUI        === 'function') window.updateAuthUI();
      return true;
    } catch (e) {
      console.error('[payment] localStorage 토큰 업데이트 실패:', e);
      return false;
    }
  }

  // ────────────────────────────────────────────────────
  // 결제 버튼 클릭 핸들러
  // ────────────────────────────────────────────────────
  async function handlePaymentClick(packageId) {
    // 1) 로그인 확인
    const user = getCurrentUser();
    if (!user) {
      alert('결제하려면 먼저 로그인해 주세요.');
      window.location.href = '/auth.html';
      return;
    }

    // 2) /api/payment/request 호출 → orderId 등 결제 정보 획득
    let paymentInfo;
    try {
      const res = await fetch('/api/payment/request', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          packageId,
          userId:          user.id,
          supabaseUserId:  user.supabaseId || null,
        }),
      });
      paymentInfo = await res.json();
      if (!res.ok) throw new Error(paymentInfo.error || '결제 요청 실패');
    } catch (e) {
      alert('결제 요청 중 오류: ' + e.message);
      return;
    }

    // 3) Toss SDK 로드 & 결제창 열기
    try {
      const TossPayments = await loadTossSDK();
      const toss = TossPayments(paymentInfo.clientKey);

      await toss.requestPayment('카드', {
        amount:       paymentInfo.amount,
        orderId:      paymentInfo.orderId,
        orderName:    paymentInfo.orderName,
        customerName: user.name || '새싹매치 회원',
        customerEmail: user.email || undefined,
        successUrl: window.location.origin + '/payment-success.html',
        failUrl:    window.location.origin + '/payment-fail.html',
      });
    } catch (e) {
      // 사용자가 직접 닫은 경우 code === 'USER_CANCEL'
      if (e.code !== 'USER_CANCEL') {
        alert('결제 중 오류: ' + (e.message || e.code));
      }
    }
  }

  // ────────────────────────────────────────────────────
  // pricing 섹션의 .pcta 버튼에 이벤트 연결
  // ────────────────────────────────────────────────────
  function bindPricingButtons() {
    const buttons = document.querySelectorAll('.pcta[data-charge], .pcta[data-subscribe]');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const packageId = btn.dataset.charge || btn.dataset.subscribe;
        handlePaymentClick(packageId);
      });
    });
  }

  // ────────────────────────────────────────────────────
  // 공개 API (payment-success.html에서 사용)
  // ────────────────────────────────────────────────────
  window.saessak = window.saessak || {};
  window.saessak.payment = {
    addTokensToUser,
    getCurrentUser,
  };

  // DOM 준비 후 버튼 바인딩
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindPricingButtons);
  } else {
    bindPricingButtons();
  }
})();
