/*!
 * supabase-config.js
 * 새싹지원사업 — Supabase Auth 통합 (구글/카카오/네이버 로그인 + 기존 localStorage 호환)
 *
 * 작동:
 * 1) 페이지 로드 시 Supabase 클라이언트 초기화
 * 2) 현재 Supabase 세션 확인
 * 3) 세션이 있으면 → 기존 localStorage 사용자 시스템(saessak_users / saessak_current_user)에 자동 동기화
 * 4) 다른 페이지 코드는 기존대로 localStorage 읽기/쓰기 → 호환 유지
 *
 * v2 — IIFE로 감싸서 글로벌 변수 충돌 방지 (USER_KEY 등)
 */

(function(){
  // ===== Supabase SDK 자동 로드 (window.supabase 없으면) =====
  function ensureSupabaseSDK(){
    if(window.supabase) return;
    if(document.querySelector('script[data-supabase-sdk]')) return;
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    script.async = false;
    script.setAttribute('data-supabase-sdk', '1');
    document.head.appendChild(script);
  }
  ensureSupabaseSDK();

  // ===== Config =====
  const SUPABASE_URL = 'https://ifrqrhmmlrtainlsooym.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmcnFyaG1tbHJ0YWlubHNvb3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1OTc0NTgsImV4cCI6MjA5NDE3MzQ1OH0.s1_z4KKhRZylUdWsAggzdZ2367XnNRl-6eljOhEdvNU';

  // 함수 스코프 안의 변수 (외부 스크립트와 충돌 X)
  const SUPA_USER_KEY = 'saessak_users';
  const SUPA_CURRENT_KEY = 'saessak_current_user';

  // 전역 네임스페이스 노출만 함
  window.saessak = window.saessak || {};

  // ===== Supabase 클라이언트 초기화 (SDK 로드 후) =====
  async function initSupabaseClient(){
    for(let i = 0; i < 80; i++){
      if(window.supabase && window.supabase.createClient) break;
      await new Promise(r => setTimeout(r, 100));
    }
    if(!(window.supabase && window.supabase.createClient)){
      console.error('[supabase] SDK 로드 실패');
      return null;
    }
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
      }
    });
    window.saessak.supabase = client;
    return client;
  }

  // ===== 헬퍼: localStorage 사용자 시스템에 동기화 =====
  function getLocalUsers(){
    try { return JSON.parse(localStorage.getItem(SUPA_USER_KEY) || '[]'); } catch(e){ return []; }
  }
  function saveLocalUsers(arr){ localStorage.setItem(SUPA_USER_KEY, JSON.stringify(arr)); }
  function setCurrentLocalUser(id){ localStorage.setItem(SUPA_CURRENT_KEY, id); }

  function syncSupabaseToLocal(session){
    if(!session || !session.user) return null;
    const u = session.user;
    const email = (u.email || '').toLowerCase();
    if(!email) return null;

    const users = getLocalUsers();
    let local = users.find(x => x.email === email);

    if(!local){
      const meta = u.user_metadata || {};
      const name = meta.name || meta.full_name || meta.given_name || email.split('@')[0];

      local = {
        id: 'u_supabase_' + u.id,
        supabaseId: u.id,
        name: name,
        email: email,
        password: '__oauth__',
        region: meta.region || '서울',
        field: meta.field || '딥테크·AI',
        age: meta.age || null,
        avatar: meta.avatar_url || meta.picture || null,
        provider: (u.app_metadata && u.app_metadata.provider) || 'oauth',
        plan: 'free',
        joinedAt: new Date().toISOString(),
        usage: { matches: 0, plans: 0 },
        tokens: 50,
        subscription: null,
        tokenLog: [{
          ts: new Date().toISOString(),
          kind: 'signup-bonus',
          amount: 50,
          balance: 50,
          memo: '소셜 회원가입 보너스 — 50 토큰'
        }]
      };
      users.push(local);
      saveLocalUsers(users);
    } else {
      local.supabaseId = u.id;
      const meta = u.user_metadata || {};
      if(meta.avatar_url) local.avatar = meta.avatar_url;
      else if(meta.picture) local.avatar = meta.picture;
      saveLocalUsers(users);
    }

    setCurrentLocalUser(local.id);
    return local;
  }

  // ===== 공개 헬퍼 함수들 =====
  window.saessak.signInWithOAuthProvider = async function(provider, redirectTo){
    // SDK·클라이언트 준비 대기 (최대 8초)
    for(let i = 0; i < 80; i++){
      if(window.saessak.supabase) break;
      await new Promise(r => setTimeout(r, 100));
    }
    const client = window.saessak.supabase;
    if(!client){
      alert('Supabase 클라이언트 초기화 실패. 새로고침 후 다시 시도해주세요.');
      return;
    }
    const target = redirectTo || (location.origin + '/');
    const { error } = await client.auth.signInWithOAuth({
      provider: provider,
      options: { redirectTo: target }
    });
    if(error){
      alert('소셜 로그인 실패: ' + error.message);
      console.error(error);
    }
  };

  window.saessak.signInWithGoogle = function(redirectTo){
    return window.saessak.signInWithOAuthProvider('google', redirectTo);
  };
  window.saessak.signInWithKakao = function(redirectTo){
    return window.saessak.signInWithOAuthProvider('kakao', redirectTo);
  };
  window.saessak.signInWithNaver = function(redirectTo){
    return window.saessak.signInWithOAuthProvider('naver', redirectTo);
  };

  window.saessak.signOut = async function(){
    const client = window.saessak.supabase;
    if(client){
      try { await client.auth.signOut(); } catch(e){ console.warn(e); }
    }
    localStorage.removeItem(SUPA_CURRENT_KEY);
  };

  window.saessak.getCurrentSession = async function(){
    const client = window.saessak.supabase;
    if(!client) return null;
    const { data } = await client.auth.getSession();
    return (data && data.session) || null;
  };

  // ===== 페이지 로드 시 자동 세션 동기화 =====
  async function bootstrap(){
    const client = await initSupabaseClient();
    if(!client) return;

    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData && sessionData.session;
    if(session){
      syncSupabaseToLocal(session);
    }

    client.auth.onAuthStateChange((event, sess) => {
      if(event === 'SIGNED_IN' && sess){
        syncSupabaseToLocal(sess);
        if(typeof window.updateAuthUI === 'function') window.updateAuthUI();
        if(typeof window.refreshTokenDisplay === 'function') window.refreshTokenDisplay();
      } else if(event === 'SIGNED_OUT'){
        localStorage.removeItem(SUPA_CURRENT_KEY);
        if(typeof window.updateAuthUI === 'function') window.updateAuthUI();
      }
    });

    if(location.hash.includes('access_token')){
      setTimeout(() => {
        history.replaceState(null, '', location.pathname + location.search);
      }, 1000);
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
