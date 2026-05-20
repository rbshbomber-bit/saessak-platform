// /api/payment/request.js
// Vercel Serverless Function — 토스페이먼츠 결제 요청 초기화
// 클라이언트가 호출 → orderId 생성 & Supabase에 pending 트랜잭션 저장 → 결제 정보 반환
// 환경 변수: TOSS_CLIENT_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY

const PACKAGES = {
  mini:          { name: 'Mini — 50토큰',              amount: 2900,  tokens: 50   },
  standard:      { name: 'Standard — 200토큰',          amount: 9900,  tokens: 200  },
  plus:          { name: 'Plus — 500토큰',              amount: 19900, tokens: 500  },
  pro:           { name: 'Pro — 1,200토큰',             amount: 39900, tokens: 1200 },
  'light':       { name: 'Light 구독 — 150토큰/월',     amount: 7900,  tokens: 150  },
  'standard-sub':{ name: 'Standard 구독 — 400토큰/월', amount: 14900, tokens: 400  },
  'premium-sub': { name: 'Premium 구독 — 1,000토큰/월',amount: 29900, tokens: 1000 },
};

function generateOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SSM-${ts}-${rand}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용합니다.' });

  const tossClientKey = process.env.TOSS_CLIENT_KEY;
  const supabaseUrl   = process.env.SUPABASE_URL;
  const supabaseKey   = process.env.SUPABASE_SERVICE_KEY;

  if (!tossClientKey || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: '서버 환경 변수 누락. TOSS_CLIENT_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY 확인.' });
  }

  const { packageId, userId, supabaseUserId } = req.body || {};

  if (!packageId || !PACKAGES[packageId]) {
    return res.status(400).json({ error: `유효하지 않은 packageId: ${packageId}` });
  }
  if (!userId) {
    return res.status(400).json({ error: 'userId가 필요합니다.' });
  }

  const pkg     = PACKAGES[packageId];
  const orderId = generateOrderId();

  // Supabase에 pending 트랜잭션 저장
  const supabaseRes = await fetch(`${supabaseUrl}/rest/v1/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify({
      order_id:         orderId,
      user_id:          userId,
      supabase_user_id: supabaseUserId || null,
      package_id:       packageId,
      amount:           pkg.amount,
      tokens:           pkg.tokens,
      status:           'pending',
    }),
  });

  if (!supabaseRes.ok) {
    const errText = await supabaseRes.text();
    console.error('[payment/request] Supabase 저장 실패:', errText);
    return res.status(500).json({ error: 'DB 저장 실패', detail: errText });
  }

  return res.status(200).json({
    orderId,
    orderName:  pkg.name,
    amount:     pkg.amount,
    tokens:     pkg.tokens,
    packageId,
    clientKey:  tossClientKey,
  });
}
