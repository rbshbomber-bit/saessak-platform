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
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if(!clientId || !clientSecret) return res.status(500).send("NAVER_ENV_MISSING");

  const cookies = parseCookies(req.headers.cookie || "");
  const { code, state, error, error_description } = req.query || {};
  const redirect = cookies.ss_naver_redirect || "https://saessak-platform.vercel.app/";
  res.setHeader("Set-Cookie", [clearCookie("ss_naver_state"), clearCookie("ss_naver_redirect")]);

  if(error) return res.status(400).send(`Naver login failed: ${error_description || error}`);
  if(!code || !state || state !== cookies.ss_naver_state) return res.status(400).send("INVALID_NAVER_STATE");

  const tokenParams = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
    state
  });
  const tokenResp = await fetch(`https://nid.naver.com/oauth2.0/token?${tokenParams.toString()}`, { method: "GET" });
  const tokenData = await tokenResp.json();
  if(!tokenResp.ok || !tokenData.access_token) {
    return res.status(400).send("NAVER_TOKEN_EXCHANGE_FAILED");
  }

  const profileResp = await fetch("https://openapi.naver.com/v1/nid/me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const profileData = await profileResp.json();
  const profile = profileData.response || {};
  const email = (profile.email || `${profile.id || Date.now()}@naver.local`).toLowerCase();
  const name = profile.name || profile.nickname || email.split("@")[0];
  const payload = {
    id: `u_naver_${profile.id || Date.now()}`,
    naverId: profile.id || null,
    name,
    email,
    avatar: profile.profile_image || null,
    provider: "naver"
  };

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>네이버 로그인 처리 중</title></head>
<body>
<script>
(function(){
  const profile = ${escapeJsonForHtml(payload)};
  const USER_KEY = "saessak_users";
  const CURRENT_KEY = "saessak_current_user";
  const users = JSON.parse(localStorage.getItem(USER_KEY) || "[]");
  let user = users.find(u => u.email === profile.email);
  if(!user){
    user = {
      id: profile.id,
      naverId: profile.naverId,
      name: profile.name,
      email: profile.email,
      password: "__oauth__",
      region: "서울",
      field: "딥테크·AI",
      age: null,
      avatar: profile.avatar,
      provider: "naver",
      plan: "free",
      joinedAt: new Date().toISOString(),
      usage: { matches: 0, plans: 0 },
      tokens: 50,
      subscription: null,
      tokenLog: [{
        ts: new Date().toISOString(),
        kind: "signup-bonus",
        amount: 50,
        balance: 50,
        memo: "네이버 회원가입 보너스 — 50 토큰"
      }]
    };
    users.push(user);
  } else {
    user.naverId = profile.naverId || user.naverId;
    user.provider = user.provider || "naver";
    if(profile.avatar) user.avatar = profile.avatar;
  }
  localStorage.setItem(USER_KEY, JSON.stringify(users));
  localStorage.setItem(CURRENT_KEY, user.id);
  location.replace(${escapeJsonForHtml(redirect)});
})();
</script>
네이버 로그인 처리 중입니다.
</body></html>`);
};
