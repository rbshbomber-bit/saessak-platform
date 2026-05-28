// Vercel Serverless Function: /api/grant-readiness
// 청년창업 지원사업 공통 요구사항 점검 엔진

import { evaluateReadiness } from './grant-readiness-core.js';

function limitText(value, max = 12000) {
  if (value == null) return '';
  return String(value).slice(0, max);
}

function limitObjectText(value, max = 1200) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === 'string' ? limitText(item, max) : item
    ])
  );
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const { userData = {}, planText = '', listing = {} } = req.body || {};
  return res.status(200).json(evaluateReadiness({
    userData: limitObjectText(userData),
    planText: limitText(planText),
    listing: limitObjectText(listing)
  }));
}
