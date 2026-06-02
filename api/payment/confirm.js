// /api/payment/confirm.js
// Vercel Serverless Function — 토스페이먼츠 결제 최종 승인 + 토큰 지급
// 클라이언트가 결제 성공 후 호출 → Toss API로 검증 → Supabase 트랜잭션 업데이트 → 토큰 수량 반환
// 환경 변수: TOSS_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용합니다.' });

  const tossSecretKey = process.env.TOSS_SECRET_KEY;
  const supabaseUrl   = process.env.SUPABASE_URL;
  const supabaseKey   = process.env.SUPABASE_SERVICE_KEY;

  if (!tossSecretKey || !supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: '서버 환경 변수 누락. TOSS_SECRET_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY 확인.' });
  }

  const { paymentKey, orderId, amount } = req.body || {};

  if (!paymentKey || !orderId || !amount) {
    return res.status(400).json({ error: 'paymentKey, orderId, amount 모두 필요합니다.' });
  }

  // 1) Supabase에서 pending 트랜잭션 조회 — 이중 지급 방지
  const txRes = await fetch(
    `${supabaseUrl}/rest/v1/transactions?order_id=eq.${encodeURIComponent(orderId)}&select=*`,
    {
      headers: {
        'apikey':        supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    }
  );

  if (!txRes.ok) {
    const errText = await txRes.text();
    console.error('[payment/confirm] 트랜잭션 조회 실패:', errText);
    return res.status(500).json({ error: 'DB 조회 실패' });
  }

  const txList = await txRes.json();
  const tx = txList[0];

  if (!tx) {
    return res.status(404).json({ error: `orderId ${orderId}에 해당하는 트랜잭션이 없습니다.` });
  }
  if (tx.status === 'paid') {
    // 이미 승인된 주문 — 토큰만 반환 (멱등성 보장)
    return res.status(200).json({ success: true, tokens: tx.tokens, orderId, alreadyApplied: true });
  }
  if (tx.status !== 'pending') {
    return res.status(400).json({ error: `처리할 수 없는 주문 상태: ${tx.status}` });
  }

  // 2) 금액 검증 — 클라이언트 조작 방지
  if (Number(amount) !== tx.amount) {
    return res.status(400).json({ error: `금액 불일치 (요청: ${amount}, 예상: ${tx.amount})` });
  }

  // 3) Toss API로 결제 최종 승인
  const tossAuth = Buffer.from(`${tossSecretKey}:`).toString('base64');
  const tossRes = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${tossAuth}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ paymentKey, orderId, amount: tx.amount }),
  });

  const tossData = await tossRes.json();

  if (!tossRes.ok) {
    console.error('[payment/confirm] Toss 승인 실패:', tossData);

    // 실패 상태 기록
    await fetch(`${supabaseUrl}/rest/v1/transactions?order_id=eq.${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        status:        'failed',
        toss_response: tossData,
        updated_at:    new Date().toISOString(),
      }),
    });

    return res.status(400).json({
      error:   '결제 승인 실패',
      code:    tossData.code,
      message: tossData.message,
    });
  }

  // 4) 성공 — Supabase 트랜잭션 paid 처리
  const patchRes = await fetch(
    `${supabaseUrl}/rest/v1/transactions?order_id=eq.${encodeURIComponent(orderId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        status:        'paid',
        payment_key:   paymentKey,
        toss_response: tossData,
        updated_at:    new Date().toISOString(),
      }),
    }
  );

  if (!patchRes.ok) {
    const errText = await patchRes.text();
    console.error('[payment/confirm] 상태 업데이트 실패:', errText);
    // 결제는 완료됐으나 DB 업데이트 실패 → 토큰은 반환하되 서버 로그 필수
    return res.status(500).json({ error: 'DB 업데이트 실패. 관리자에게 문의: ' + orderId });
  }

  const creditResult = await grantCreditsIfPossible({
    supabaseUrl,
    supabaseKey,
    tx,
    orderId
  });

  return res.status(200).json({
    success:   true,
    tokens:    tx.tokens,
    packageId: tx.package_id,
    orderId,
    amount:    tx.amount,
    serverCreditsApplied: creditResult.applied,
    serverCreditsBalance: creditResult.balance,
  });
}

async function grantCreditsIfPossible({ supabaseUrl, supabaseKey, tx, orderId }) {
  if (!tx.supabase_user_id || !tx.tokens) {
    return { applied: false, balance: null };
  }

  const rpcRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/grant_user_credits`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      p_user_id: tx.supabase_user_id,
      p_email: tx.user_email || null,
      p_amount: tx.tokens,
      p_reason: `payment:${tx.package_id || 'token-charge'}`,
      p_request_id: orderId,
    }),
  });

  if (!rpcRes.ok) {
    const errText = await rpcRes.text();
    console.error('[payment/confirm] 서버 크레딧 적립 실패:', errText);
    return { applied: false, balance: null };
  }

  const balance = await rpcRes.json().catch(() => null);
  return { applied: true, balance };
}
