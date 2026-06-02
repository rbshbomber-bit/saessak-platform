// 새싹지원사업 - Claude API 클라이언트 헬퍼
// 모든 페이지에서 window.saessak.callClaude(prompt, options) 로 호출 가능
// 옵션: { system, max_tokens, model, attachments, fallback }

(function () {
  window.saessak = window.saessak || {};

  /**
   * Claude API 호출
   * @param {string} prompt - 사용자 프롬프트
   * @param {object} [options]
   * @param {string} [options.system] - 시스템 프롬프트
   * @param {number} [options.max_tokens=1024]
   * @param {string} [options.model] - 기본: claude-opus-4-7 (Anthropic 최상위 모델)
   * @param {Array}  [options.attachments] - [{type:'image', media_type, data:base64}]
   * @param {string} [options.fallback] - API 실패 시 대체 텍스트
   * @returns {Promise<string>} 응답 텍스트
   */
  window.saessak.callClaude = async function (prompt, options) {
    options = options || {};
    const fallback = options.fallback || '⚠️ AI 응답 생성에 실패했어요. 잠시 후 다시 시도해주세요.';
    const timeoutMs = Number(options.timeout_ms || options.timeoutMs || 45000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let accessToken = options.access_token || options.accessToken || null;
      if (!accessToken && window.saessak.getCurrentSession) {
        try {
          const session = await window.saessak.getCurrentSession();
          accessToken = session && session.access_token;
        } catch (e) {
          console.warn('[saessak.callClaude] session lookup failed', e);
        }
      }

      const headers = { 'Content-Type': 'application/json' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const res = await fetch('/api/claude', {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          prompt,
          system: options.system,
          max_tokens: options.max_tokens || 1024,
          model: options.model,
          feature: options.feature,
          cost: options.cost,
          attachments: options.attachments
        })
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        console.warn('[saessak.callClaude] HTTP', res.status, errBody);

        if (res.status === 401) {
          return options.authFallback || '로그인 후 AI 기능을 사용할 수 있습니다.';
        }

        // CLAUDE_API_KEY 미설정 — 데모 모드 안내
        if (res.status === 500 && errBody.error && errBody.error.includes('CLAUDE_API_KEY')) {
          return (
            '🔑 데모 모드: Claude API 키가 아직 등록되지 않았습니다.\n\n' +
            '관리자가 Vercel 환경 변수에 CLAUDE_API_KEY를 추가하면 실제 AI 응답이 활성화됩니다.\n\n' +
            '— 데모 응답 —\n' +
            fallback
          );
        }

        return fallback;
      }

      const data = await res.json();
      return data.text || fallback;
    } catch (err) {
      if (err && err.name === 'AbortError') {
        console.error('[saessak.callClaude] timeout', timeoutMs);
      } else {
        console.error('[saessak.callClaude] error', err);
      }
      return fallback;
    } finally {
      clearTimeout(timer);
    }
  };

  // 호환 레이어: 기존 코드가 window.cowork.askClaude(...) 를 호출해도 동작하도록 폴리필
  window.cowork = window.cowork || {};
  if (!window.cowork.askClaude) {
    window.cowork.askClaude = async function (prompt, data) {
      let fullPrompt = prompt;
      if (Array.isArray(data) && data.length > 0) {
        fullPrompt += '\n\n— 참고 데이터 —\n' + data
          .map(d => typeof d === 'string' ? d : JSON.stringify(d, null, 2))
          .join('\n\n');
      }
      return window.saessak.callClaude(fullPrompt, { max_tokens: 1500 });
    };
  }
})();
