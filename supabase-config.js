/*!
 * supabase-config.js
 * 새싹지원사업 — Supabase Auth 통합 (구글 로그인 + 기존 localStorage 호환)
 *
 * 작동:
 * 1) 페이지 로드 시 Supabase 클라이언트 초기화
 * 2) 현재 Supabase 세션 확인
 * 3) 세션이 있으면 → 기존 localStorage 사용자 시스템(saessak_users / saessak_current_user)에 자동 동기화
 * 4) 다른 페이지 코드는 기존대로 localStorage 읽기/쓰기 → 호환 유지
 *
 * 향후 (M+1) 전체 DB 이전 시 — localStorage 동기화 제거하고 Supabase DB 직접 호출로 전환
 */

// ===== Supabase SDK 자동 로드 (window.supabase 없으면) =====
(function ensureSupabaseSDK(){
  if(window.supabase) return;
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  script.async = false;
  document.head.appendChild(script);
})();

// ===== Config =====
const SUPABASE_URL = 'https://ifrqrhmmlrtainlsooym.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmcnFyaG1tbHJ0YWlubHNvb3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1OTc0NTgsImV4cCI6MjA5NDE3MzQ1OH0.s1_z4KKhRZylUdWsAggzdZ2367XnNRl-6eljOhEdvNU';

const USER_KEY = 'saessak_users';
const CURRENT_KEY = 'saessak_current_user';

// 전역 상태
window.saessak = window.saessak || {};

// ===== Supabase 클라이언트 초기화 (SDK 로드 후) =====
async function initSupabaseClient(){
  // SDK가 비동기로 로드되므로 약간 대기
  for(let i = 0; i < 50; i++){
    if(window.supabase) break;
    await new Promise(r => setTimeout(r, 100));
  }
  if(!window.supabase){
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
  try { return JSON.parse(localStorage.getItem(USER_KEY) || '[]'); } catch(e){ return []; }
}
function saveLocalUsers(arr){ localStorage.setItem(USER_KEY, JSON.stringify(arr)); }
function setCurrentLocalUser(id){ localStorage.setItem(CURRENT_KEY, id); }

function syncSupabaseToLocal(session){
  if(!session?.user) return null;
  const u = session.user;
  const email = (u.email || '').toLowerCase();
  if(!email) return null;

  const users = getLocalUsers();
  let local = users.find(x => x.email === email);

  if(!local){
    // 첫 로그인 — 새 사용자 생성 (구글 메타에서 이름 추출)
    const name = u.user_metadata?.name
              || u.user_metadata?.full_name
              || u.user_metadata?.given_name
              || email.split('@')[0];

    local = {
      id: 'u_supabase_' + u.id,
      supabaseId: u.id,
      name: name,
      email: email,
      password: '__google_oauth__',
      region: u.user_metadata?.region || '서울',
      field: u.user_metadata?.field || '딥테크·AI',
      age: u.user_metadata?.age || null,
      avatar: u.user_metadata?.avatar_url || u.user_metadata?.picture || null,
      provider: u.app_metadata?.provider || 'google',
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
        memo: '구글 회원가입 보너스 — 50 토큰'
      }]
    };
    users.push(local);
    saveLocalUsers(users);
  } else {
    // 기존 사용자 — Supabase ID·아바타 갱신
    local.supabaseId = u.id;
    if(u.user_metadata?.avatar_url) local.avatar = u.user_metadata.avatar_url;
    saveLocalUsers(users);
  }

  setCurrentLocalUser(local.id);
  return local;
}

// ===== 공개 헬퍼 함수들 (다른 페이지에서 사용 가능) =====

// 구글로 로그인 시작 (현재 페이지로 돌아오는 OAuth 리다이렉트)
window.saessak.signInWithGoogle = async function(redirectTo){
  const client = window.saessak.supabase;
  if(!client){ alert('Supabase 클라이언트 초기화 중. 잠시 후 다시 시도하세요.'); return; }
  const target = redirectTo || (location.origin + '/');
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: target }
  });
  if(error){ alert('구글 로그인 실패: ' + error.message); console.error(error); }
};

// 로그아웃 (Supabase + localStorage 동시)
window.saessak.signOut = async function(){
  const client = window.saessak.supabase;
  if(client){
    try { await client.auth.signOut(); } catch(e){ console.warn(e); }
  }
  localStorage.removeItem(CURRENT_KEY);
};

// 현재 세션 확인
window.saessak.getCurrentSession = async function(){
  const client = window.saessak.supabase;
  if(!client) return null;
  const { data } = await client.auth.getSession();
  return data?.session || null;
};

// ===== 페이지 로드 시 자동 세션 동기화 =====
async function bootstrap(){
  const client = await initSupabaseClient();
  if(!client) return;

  // 현재 세션 가져오기 (localStorage에 저장된 토큰으로)
  const { data: { session } } = await client.auth.getSession();
  if(session){
    syncSupabaseToLocal(session);
  }

  // 세션 변경 이벤트 리스너
  client.auth.onAuthStateChange((event, session) => {
    if(event === 'SIGNED_IN' && session){
      syncSupabaseToLocal(session);
      // 페이지 다시 그리기 트리거 (auth-area 업데이트)
      if(typeof updateAuthUI === 'function') updateAuthUI();
      if(typeof refreshTokenDisplay === 'function') refreshTokenDisplay();
    } else if(event === 'SIGNED_OUT'){
      localStorage.removeItem(CURRENT_KEY);
      if(typeof updateAuthUI === 'function') updateAuthUI();
    }
  });

  // 페이지가 OAuth 리다이렉트로 돌아온 경우 — URL에 토큰이 있을 수 있음
  // detectSessionInUrl: true 옵션이 처리해줌. 추가로 hash 정리.
  if(location.hash.includes('access_token')){
    // Supabase가 자동 처리 후 hash 비움
    setTimeout(() => {
      history.replaceState(null, '', location.pathname + location.search);
    }, 1000);
  }
}

// DOMContentLoaded 또는 즉시 실행
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
