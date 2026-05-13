// 디버그용: K-Startup API 여러 엔드포인트 패턴을 동시에 시도
// 어느 URL/방식이 작동하는지 한 번에 확인
// 접근: /api/kstartup-debug

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.KSTARTUP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'KSTARTUP_API_KEY 미설정' });
  }

  // 시도해볼 URL 패턴들 (K-Startup / KISED API 알려진 변형들)
  const candidates = [
    // 패턴 1: B552735 + kisedKstartupService01 + getAnnouncementInformation01
    { name: 'B552735/v01/getAnnouncement01', url: `https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01?serviceKey=${encodeURIComponent(apiKey)}&numOfRows=2&pageNo=1&resultType=json` },

    // 패턴 2: 버전 없는 base
    { name: 'B552735/base/getAnnouncement', url: `https://apis.data.go.kr/B552735/kisedKstartupService/getAnnouncementInformation?serviceKey=${encodeURIComponent(apiKey)}&numOfRows=2&pageNo=1&resultType=json` },

    // 패턴 3: odcloud 신형 API
    { name: 'odcloud/15121654', url: `https://api.odcloud.kr/api/15121654/v1/uddi:?serviceKey=${encodeURIComponent(apiKey)}&page=1&perPage=2` },

    // 패턴 4: 사업소개 (Business Information)
    { name: 'B552735/v01/getBusiness01', url: `https://apis.data.go.kr/B552735/kisedKstartupService01/getBusinessInformation01?serviceKey=${encodeURIComponent(apiKey)}&numOfRows=2&pageNo=1&resultType=json` },

    // 패턴 5: 통합공고 (Integrated Announcement)
    { name: 'B552735/v01/getAllAnnouncement01', url: `https://apis.data.go.kr/B552735/kisedKstartupService01/getAllAnnouncementInformation01?serviceKey=${encodeURIComponent(apiKey)}&numOfRows=2&pageNo=1&resultType=json` },

    // 패턴 6: 디코딩 키 (URL 인코딩 안 함)
    { name: 'B552735/v01 raw key', url: `https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01?serviceKey=${apiKey}&numOfRows=2&pageNo=1&resultType=json` },

    // 패턴 7: XML 응답 (resultType 제거)
    { name: 'B552735/v01 XML', url: `https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01?serviceKey=${encodeURIComponent(apiKey)}&numOfRows=2&pageNo=1` },
  ];

  const results = [];

  for (const c of candidates) {
    try {
      const r = await fetch(c.url, {
        method: 'GET',
        headers: { 'Accept': 'application/json,text/xml,*/*' }
      });
      const ct = r.headers.get('content-type') || '';
      const text = await r.text();
      results.push({
        name: c.name,
        status: r.status,
        ok: r.ok,
        contentType: ct,
        sample: text.slice(0, 800),
        urlPattern: c.url.replace(apiKey, '***KEY***'),
      });
    } catch (err) {
      results.push({
        name: c.name,
        error: err.message,
        urlPattern: c.url.replace(apiKey, '***KEY***'),
      });
    }
  }

  // 작동하는 거 1순위로 정렬
  results.sort((a, b) => {
    if (a.ok && !b.ok) return -1;
    if (!a.ok && b.ok) return 1;
    return (a.status || 0) - (b.status || 0);
  });

  return res.status(200).json({
    note: 'K-Startup API 여러 URL 시도 결과. ok=true 인 것이 작동하는 패턴',
    keyLength: apiKey.length,
    keyPreview: apiKey.slice(0, 6) + '...' + apiKey.slice(-4),
    triedAt: new Date().toISOString(),
    results,
  });
}
