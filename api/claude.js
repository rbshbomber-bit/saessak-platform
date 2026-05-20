// Vercel Serverless Function: /api/claude
// 클라이언트에서 호출되면 Anthropic API로 프록시
// 환경 변수: CLAUDE_API_KEY (Vercel Project Settings -> Environment Variables)

export default async function handler(req, res) {
  // CORS (같은 도메인이라 사실 필요없지만 안전장치)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'CLAUDE_API_KEY 환경 변수가 설정되지 않았습니다.',
      hint: 'Vercel Project Settings -> Environment Variables 에서 CLAUDE_API_KEY 추가하세요.'
    });
  }

  try {
    const { prompt, system, max_tokens, model, attachments } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt 필드가 필요합니다 (문자열).' });
    }

    // 메시지 구성
    const messages = [];
    const content = [];

    // 첨부 파일 (이미지) 처리
    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        if (att && att.type === 'image' && att.data && att.media_type) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: att.media_type,
              data: att.data
            }
          });
        }
      }
    }

    content.push({ type: 'text', text: prompt });
    messages.push({ role: 'user', content });

    // Anthropic API 호출
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'claude-haiku-4-5-20251001',
        max_tokens: max_tokens || 1024,
        system: system || '당신은 한국의 청년창업 지원사업을 도와주는 친절한 전문 컨설턴트입니다. 한국어로 명확하고 실용적으로 답변하세요.',
        messages
      })
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return res.status(anthropicResponse.status).json({
        error: 'Anthropic API 오류',
        status: anthropicResponse.status,
        detail: errText
      });
    }

    const data = await anthropicResponse.json();

    // 텍스트만 추출해서 편하게 사용
    let text = '';
    if (Array.isArray(data.content)) {
      text = data.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
    }

    return res.status(200).json({
      text,
      raw: data,
      usage: data.usage || null
    });
  } catch (err) {
    console.error('Claude API proxy error:', err);
    return res.status(500).json({
      error: '서버 오류',
      message: err && err.message ? err.message : String(err)
    });
  }
}
