function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if(options.httpOnly) parts.push("HttpOnly");
  if(options.secure) parts.push("Secure");
  if(options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if(options.path) parts.push(`Path=${options.path}`);
  if(options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join("; ");
}

module.exports = async function handler(req, res) {
  const clientId = process.env.NAVER_CLIENT_ID;
  if(!clientId) return res.status(500).send("NAVER_CLIENT_ID_MISSING");

  const redirect = typeof req.query.redirect === "string" && req.query.redirect.startsWith("https://saessak-platform.vercel.app")
    ? req.query.redirect
    : "https://saessak-platform.vercel.app/";
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const callbackUrl = "https://saessak-platform.vercel.app/api/naver-callback";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: callbackUrl,
    state
  });

  res.setHeader("Set-Cookie", [
    serializeCookie("ss_naver_state", state, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 600 }),
    serializeCookie("ss_naver_redirect", redirect, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 600 })
  ]);
  res.writeHead(302, { Location: `https://nid.naver.com/oauth2.0/authorize?${params.toString()}` });
  res.end();
};
