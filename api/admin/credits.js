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

  const supabaseUrl = getSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const supabaseKey = serviceKey || anonKey;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_ANON_KEY 환경 변수가 필요합니다.' });
  }

  const admin = await verifyAdmin(req, supabaseUrl, anonKey || supabaseKey);
  if (!admin.ok) return res.status(admin.status).json(admin.body);
  const dbAuthToken = serviceKey || admin.token;

  try {
    if (req.method === 'GET') {
      return getCredits(req, res, supabaseUrl, supabaseKey, dbAuthToken);
    }

    return updateCredits(req, res, supabaseUrl, supabaseKey, dbAuthToken, admin.user);
  } catch (err) {
    console.error('[admin/credits] error:', err);
    return res.status(500).json({ error: '서버 오류', message: err?.message || String(err) });
  }
}

async function getCredits(req, res, supabaseUrl, supabaseKey, dbAuthToken) {
  const limit = clampInt(req.query?.limit, 1, 200, 100);
  const creditsRes = await supabaseFetch(
    supabaseUrl,
    supabaseKey,
    dbAuthToken,
    `/rest/v1/user_credits?select=*&order=updated_at.desc&limit=${limit}`
  );

  if (!creditsRes.ok) {
    return res.status(500).json({ error: 'USER_CREDITS_READ_FAILED', detail: await creditsRes.text() });
  }

  const ledgerRes = await supabaseFetch(
    supabaseUrl,
    supabaseKey,
    dbAuthToken,
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

async function updateCredits(req, res, supabaseUrl, supabaseKey, dbAuthToken, adminUser) {
  const { self_admin_unlimited, user_id: bodyUserId, email: bodyEmail, amount, reason, is_unlimited } = req.body || {};
  const user_id = self_admin_unlimited ? adminUser.id : bodyUserId;
  const email = self_admin_unlimited ? adminUser.email : bodyEmail;
  const nextUnlimited = self_admin_unlimited ? true : is_unlimited;

  if (!user_id) return res.status(400).json({ error: 'user_id가 필요합니다.' });

  let grantBalance = null;
  const parsedAmount = Number(amount);
  if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
    const grantRes = await supabaseFetch(supabaseUrl, supabaseKey, dbAuthToken, '/rest/v1/rpc/grant_user_credits', {
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

  if (typeof nextUnlimited === 'boolean') {
    const upsertRes = await supabaseFetch(
      supabaseUrl,
      supabaseKey,
      dbAuthToken,
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
      dbAuthToken,
      `/rest/v1/user_credits?user_id=eq.${encodeURIComponent(user_id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({ email: email || null, is_unlimited: nextUnlimited })
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

  return { ok: true, user, token };
}

function supabaseFetch(supabaseUrl, supabaseKey, dbAuthToken, path, options = {}) {
  return fetch(`${supabaseUrl.replace(/\/$/, '')}${path}`, {
    ...options,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${dbAuthToken}`,
      ...(options.headers || {})
    }
  });
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
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

const DEFAULT_SUPABASE_URL = 'https://ifrqrhmmlrtainlsooym.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlmcnFyaG1tbHJ0YWlubHNvb3ltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1OTc0NTgsImV4cCI6MjA5NDE3MzQ1OH0.s1_z4KKhRZylUdWsAggzdZ2367XnNRl-6eljOhEdvNU';
