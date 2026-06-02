// Vercel Serverless Function: /api/admin/credits
// Supabase 관리자 인증 후 서버 크레딧 조회/지급/무제한 설정

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_KEY 환경 변수가 필요합니다.' });
  }

  const admin = await verifyAdmin(req, supabaseUrl, supabaseKey);
  if (!admin.ok) return res.status(admin.status).json(admin.body);

  try {
    if (req.method === 'GET') {
      return getCredits(req, res, supabaseUrl, supabaseKey);
    }

    return updateCredits(req, res, supabaseUrl, supabaseKey, admin.user);
  } catch (err) {
    console.error('[admin/credits] error:', err);
    return res.status(500).json({ error: '서버 오류', message: err?.message || String(err) });
  }
}

async function getCredits(req, res, supabaseUrl, supabaseKey) {
  const limit = clampInt(req.query?.limit, 1, 200, 100);
  const creditsRes = await supabaseFetch(
    supabaseUrl,
    supabaseKey,
    `/rest/v1/user_credits?select=*&order=updated_at.desc&limit=${limit}`
  );

  if (!creditsRes.ok) {
    return res.status(500).json({ error: 'USER_CREDITS_READ_FAILED', detail: await creditsRes.text() });
  }

  const ledgerRes = await supabaseFetch(
    supabaseUrl,
    supabaseKey,
    `/rest/v1/credit_ledger?select=*&order=created_at.desc&limit=${limit}`
  );

  if (!ledgerRes.ok) {
    return res.status(500).json({ error: 'CREDIT_LEDGER_READ_FAILED', detail: await ledgerRes.text() });
  }

  return res.status(200).json({
    credits: await creditsRes.json(),
    ledger: await ledgerRes.json()
  });
}

async function updateCredits(req, res, supabaseUrl, supabaseKey, adminUser) {
  const { user_id, email, amount, reason, is_unlimited } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id가 필요합니다.' });

  let grantBalance = null;
  const parsedAmount = Number(amount);
  if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
    const grantRes = await supabaseFetch(supabaseUrl, supabaseKey, '/rest/v1/rpc/grant_user_credits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_user_id: user_id,
        p_email: email || null,
        p_amount: Math.floor(parsedAmount),
        p_reason: reason || `admin-grant:${adminUser.email}`,
        p_request_id: `admin_${Date.now()}`
      })
    });

    if (!grantRes.ok) {
      return res.status(500).json({ error: 'GRANT_FAILED', detail: await grantRes.text() });
    }

    grantBalance = await grantRes.json().catch(() => null);
  }

  if (typeof is_unlimited === 'boolean') {
    const upsertRes = await supabaseFetch(
      supabaseUrl,
      supabaseKey,
      '/rest/v1/user_credits?on_conflict=user_id',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          user_id,
          email: email || null,
          balance: 0
        })
      }
    );

    if (!upsertRes.ok) {
      return res.status(500).json({ error: 'CREDIT_ACCOUNT_CREATE_FAILED', detail: await upsertRes.text() });
    }

    const patchRes = await supabaseFetch(
      supabaseUrl,
      supabaseKey,
      `/rest/v1/user_credits?user_id=eq.${encodeURIComponent(user_id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ email: email || null, is_unlimited })
      }
    );

    if (!patchRes.ok) {
      return res.status(500).json({ error: 'UNLIMITED_UPDATE_FAILED', detail: await patchRes.text() });
    }
  }

  return res.status(200).json({ ok: true, balance: grantBalance });
}

async function verifyAdmin(req, supabaseUrl, supabaseKey) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { ok: false, status: 401, body: { error: 'AUTH_REQUIRED' } };
  }

  const userRes = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!userRes.ok) {
    return { ok: false, status: 401, body: { error: 'INVALID_SESSION' } };
  }

  const user = await userRes.json();
  const email = String(user?.email || '').toLowerCase().trim();
  if (!getAdminEmails().includes(email)) {
    return { ok: false, status: 403, body: { error: 'ADMIN_ONLY' } };
  }

  return { ok: true, user };
}

function supabaseFetch(supabaseUrl, supabaseKey, path, options = {}) {
  return fetch(`${supabaseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      ...(options.headers || {})
    }
  });
}

function getAdminEmails() {
  const raw = process.env.ADMIN_EMAILS || 'rbshbomber@gmail.com';
  return raw
    .split(',')
    .map(email => email.toLowerCase().trim())
    .filter(Boolean);
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
