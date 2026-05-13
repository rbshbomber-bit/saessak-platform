// 디버그용: K-Startup API 응답을 그대로 보여줌
// 필드명 확인용. 프로덕션에서 절대 사용 X
// 접근: /api/kstartup-debug?endpoint=getAnnouncementInformation01&n=3

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.KSTARTUP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'KSTARTUP_API_KEY 미설정' });
  }

  const endpoint = req.query.endpoint || 'getAnnouncementInformation01';
  const n = parseInt(req.query.n || '3', 10);

  try {
    const url = new URL(`https://apis.data.go.kr/B552735/kisedKstartupService01/${endpoint}`);
    url.searchParams.set('serviceKey', apiKey);
    url.searchParams.set('numOfRows', String(n));
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('resultType', 'json');

    const r = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' }
    });

    const contentType = r.headers.get('content-type') || '';
    const text = await r.text();

    if (contentType.includes('json')) {
      try {
        const json = JSON.parse(text);
        return res.status(200).json({
          ok: r.ok,
          httpStatus: r.status,
          endpoint,
          requestUrl: url.toString().replace(apiKey, '***'),
          contentType,
          response: json,
        });
      } catch (e) {
        return res.status(200).json({
          ok: false,
          httpStatus: r.status,
          contentType,
          parseError: e.message,
          rawSample: text.slice(0, 2000),
        });
      }
    }

    // XML/기타
    return res.status(200).json({
      ok: r.ok,
      httpStatus: r.status,
      contentType,
      rawSample: text.slice(0, 4000),
      note: 'Content-Type이 JSON이 아니므로 raw 응답 표시',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
