function parseCookies(cookieHeader = "") {
  return Object.fromEntries(cookieHeader.split(";").map(part => {
    const idx = part.indexOf("=");
    if(idx === -1) return null;
    return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())];
  }).filter(Boolean));
}

function clearCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

module.exports = async function handler(req, res) {
  const clientId = process.env.KAKAO_REST_API_KEY;
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  if(!clientId || !clientSecret) return res.status(500).send("KAKAO_ENV_MISSING");

  const cookies = parseCookies(req.headers.cookie || "");
  const { code, state, error, error_description } = req.query || {};
  const redirect = cookies.ss_kakao_redirect || "https://saessak-platform.vercel.app/";
  res.setHeader("Set-Cookie", [clearCookie("ss_kakao_state"), clearCookie("ss_kakao_redirect")]);

  if(error) return res.status(400).send(`Kakao login failed: ${error_description || error}`);
  if(!code || !state || state !== cookies.ss_kakao_state) return res.status(400).send("INVALID_KAKAO_STATE");

  const tokenResp = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: "https://saessak-platform.vercel.app/api/kakao-callback",
      code
    })
  });
  const tokenData = await tokenResp.json();
  if(!tokenResp.ok || !tokenData.access_token) {
    return res.status(400).send("KAKAO_TOKEN_EXCHANGE_FAILED");
  }

  const profileResp = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const profileData = await profileResp.json();
  const kakaoAccount = profileData.kakao_account || {};
  const profile = kakaoAccount.profile || profileData.properties || {};
  const id = String(profileData.id || Date.now());
  const adminKakaoEmailById = { "4912921188": "rbshbomber@gmail.com" };
  const adminKakaoNameById = { "4912921188": "byeun seung" };
  const email = (kakaoAccount.email || adminKakaoEmailById[id] || `${id}@kakao.local`).toLowerCase();
  const isKnownAdmin = adminKakaoEmailById[id] && email === adminKakaoEmailById[id];
  const payload = {
    id: `u_kakao_${id}`,
    kakaoId: id,
    name: adminKakaoNameById[id] || profile.nickname || email.split("@")[0],
    email,
    avatar: profile.profile_image_url || profile.thumbnail_image_url || null,
    provider: "kakao",
    role: isKnownAdmin ? "admin" : null,
    tokens: isKnownAdmin ? 999999 : null
  };

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>카카오 로그인 처리 중</title></head>
<body>
<script>
(function(){
  const profile = ${escapeJsonForHtml(payload)};
  const USER_KEY = "saessak_users";
  const CURRENT_KEY = "saessak_current_user";
  const users = JSON.parse(localStorage.getItem(USER_KEY) || "[]");
  let user = users.find(u => u.email === profile.email || u.kakaoId === profile.kakaoId);
  if(!user){
    user = {
      id: profile.id,
      kakaoId: profile.kakaoId,
      name: profile.name,
      email: profile.email,
      password: "__oauth__",
      region: "서울",
      field: "딥테크·AI",
      age: null,
      avatar: profile.avatar,
      provider: "kakao",
      plan: "free",
      joinedAt: new Date().toISOString(),
      usage: { matches: 0, plans: 0 },
      role: profile.role || null,
      tokens: profile.tokens || 50,
      subscription: null,
      tokenLog: [{
        ts: new Date().toISOString(),
        kind: "signup-bonus",
        amount: profile.tokens || 50,
        balance: profile.tokens || 50,
        memo: "카카오 회원가입 보너스 — 50 토큰"
      }]
    };
    users.push(user);
  } else {
    user.kakaoId = profile.kakaoId || user.kakaoId;
    user.provider = user.provider || "kakao";
    if(profile.avatar) user.avatar = profile.avatar;
    if(profile.email && (!user.email || /@(kakao|naver)\.local$/.test(user.email))) user.email = profile.email;
    if(profile.name && (!user.name || /^\\d+$/.test(String(user.name)))) user.name = profile.name;
    if(profile.role) user.role = profile.role;
    if(profile.tokens && (!user.tokens || user.tokens < profile.tokens)) user.tokens = profile.tokens;
  }
  localStorage.setItem(USER_KEY, JSON.stringify(users));
  localStorage.setItem(CURRENT_KEY, user.id);
  location.replace(${escapeJsonForHtml(redirect)});
})();
</script>
카카오 로그인 처리 중입니다.
</body></html>`);
};
