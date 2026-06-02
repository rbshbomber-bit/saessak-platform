// Vercel Serverless Function: /api/claude
// 클라이언트에서 호출되면 Anthropic API로 프록시
// 환경 변수: CLAUDE_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY

export default async function handler(req, res) {
  // CORS (같은 도메인이라 사실 필요없지만 안전장치)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

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
    const auth = await verifySupabaseUser(req);
    if (!auth.ok) {
      return res.status(auth.status).json(auth.body);
    }

    const { prompt, system, max_tokens, model, attachments, feature, cost } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt 필드가 필요합니다 (문자열).' });
    }

    const creditCharge = await spendCreditsIfRequired(auth.user, feature, cost, auth.token);
    if (!creditCharge.ok) {
      return res.status(creditCharge.status).json(creditCharge.body);
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
      usage: data.usage || null,
      feature: feature || null,
      cost: creditCharge.cost,
      creditsRemaining: creditCharge.balance,
      creditsUnlimited: creditCharge.unlimited
    });
  } catch (err) {
    console.error('Claude API proxy error:', err);
    return res.status(500).json({
      error: '서버 오류',
      message: err && err.message ? err.message : String(err)
    });
  }
}

async function verifySupabaseUser(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return {
      ok: false,
      status: 401,
      body: {
        error: 'AUTH_REQUIRED',
        message: '로그인 후 AI 기능을 사용할 수 있습니다.'
      }
    };
  }

  const supabaseUrl = getSupabaseUrl();
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      ok: false,
      status: 500,
      body: {
        error: 'AUTH_CONFIG_MISSING',
        message: 'AI 인증 서버 설정이 누락되었습니다.'
      }
    };
  }

  const userRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!userRes.ok) {
    return {
      ok: false,
      status: 401,
      body: {
        error: 'INVALID_SESSION',
        message: '로그인 세션이 만료되었거나 유효하지 않습니다.'
      }
    };
  }

  const user = await userRes.json().catch(() => null);
  if (!user || !user.id) {
    return {
      ok: false,
      status: 401,
      body: {
        error: 'INVALID_SESSION',
        message: '로그인 세션이 만료되었거나 유효하지 않습니다.'
      }
    };
  }

  return { ok: true, user, token };
}

async function spendCreditsIfRequired(user, feature, requestedCost, userToken) {
  if (isAdminUser(user)) {
    return { ok: true, cost: 0, balance: null, unlimited: true };
  }

  if (String(process.env.CLAUDE_REQUIRE_CREDITS || '').toLowerCase() !== 'true') {
    return { ok: true, cost: null, balance: null, unlimited: false };
  }

  const supabaseUrl = getSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || '';
  const supabaseKey = serviceKey || process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const dbAuthToken = serviceKey || userToken;
  if (!supabaseUrl || !supabaseKey) {
    return {
      ok: false,
      status: 500,
      body: {
        error: 'CREDIT_CONFIG_MISSING',
        message: '크레딧 서버 설정이 누락되었습니다.'
      }
    };
  }

  const cost = resolveCreditCost(feature, requestedCost);
  const requestId = makeRequestId();
  const spendRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/spend_user_credits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseKey,
      Authorization: `Bearer ${dbAuthToken}`
    },
    body: JSON.stringify({
      p_user_id: user.id,
      p_email: user.email || null,
      p_feature: feature || 'claude',
      p_cost: cost,
      p_request_id: requestId
    })
  });

  if (!spendRes.ok) {
    const detail = await spendRes.text();
    const isInsufficient = /tokens-insufficient/i.test(detail);
    return {
      ok: false,
      status: isInsufficient ? 402 : 500,
      body: {
        error: isInsufficient ? 'TOKENS_INSUFFICIENT' : 'CREDIT_SPEND_FAILED',
        message: isInsufficient ? '토큰이 부족합니다.' : '크레딧 차감 중 오류가 발생했습니다.',
        detail
      }
    };
  }

  const rows = await spendRes.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : rows;
  return {
    ok: true,
    cost,
    balance: row && row.balance != null ? row.balance : null,
    unlimited: !!(row && row.unlimited)
  };
}

function resolveCreditCost(feature, requestedCost) {
  const featureCost = {
    match: 1,
    planner: 20,
    plan: 20,
    simulate: 80,
    compare: 30,
    mentor: 35,
    slides: 50,
    library: 5,
    analyzer: 20,
    'simulate-followup': 1,
    teambuilder: 60,
    claude: 10
  };

  const normalizedFeature = String(feature || 'claude').toLowerCase();
  const baseCost = featureCost[normalizedFeature] ?? featureCost.claude;
  const bodyCost = Number(requestedCost);
  if (!Number.isFinite(bodyCost) || bodyCost < 0) return baseCost;
  return Math.max(baseCost, Math.floor(bodyCost));
}

function makeRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function isAdminUser(user) {
  const email = String(user && user.email || '').toLowerCase().trim();
  if (!email) return false;
  return getAdminEmails().includes(email);
}

function getAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || 'rbshbomber@gmail.com';
  return raw
    .split(',')
    .map(email => email.toLowerCase().trim())
    .filter(Boolean);
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

const DEFAULT_SUPABASE_URL = 'https://ifrqrhmmlrtainlsooym.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmcnFyaG1tbHJ0YWlubHNvb3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1OTc0NTgsImV4cCI6MjA5NDE3MzQ1OH0.s1_z4KKhRZylUdWsAggzdZ2367XnNRl-6eljOhEdvNU';
