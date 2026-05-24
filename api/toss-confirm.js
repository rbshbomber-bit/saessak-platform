const PRODUCTS = {
  mini: { type: "charge", label: "Mini", tokens: 50, price: 2900 },
  standard: { type: "charge", label: "Standard", tokens: 200, price: 9900 },
  plus: { type: "charge", label: "Plus", tokens: 500, price: 19900 },
  pro: { type: "charge", label: "Pro", tokens: 1200, price: 39900 },
  light: { type: "subscribe", label: "Light", tokens: 150, price: 7900 },
  "standard-sub": { type: "subscribe", label: "Standard", tokens: 400, price: 14900 },
  "premium-sub": { type: "subscribe", label: "Premium", tokens: 1000, price: 29900 }
};

function productIdFromOrderId(orderId) {
  if(typeof orderId !== "string") return null;
  const match = orderId.match(/^ss_(mini|standard|plus|pro|light|standard-sub|premium-sub)_/);
  return match ? match[1] : null;
}

module.exports = async function handler(req, res) {
  if(req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "METHOD_NOT_ALLOWED" });
  }

  const secretKey = process.env.TOSS_SECRET_KEY;
  if(!secretKey) return res.status(500).json({ error: "TOSS_SECRET_KEY_MISSING" });

  const { paymentKey, orderId, amount } = req.body || {};
  const productId = productIdFromOrderId(orderId);
  const product = productId ? PRODUCTS[productId] : null;
  if(!paymentKey || !orderId || !product) {
    return res.status(400).json({ error: "INVALID_PAYMENT_REQUEST" });
  }

  const requestedAmount = Number(amount);
  if(requestedAmount !== product.price) {
    return res.status(400).json({ error: "AMOUNT_MISMATCH" });
  }

  const auth = Buffer.from(`${secretKey}:`).toString("base64");
  const tossResp = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      "Idempotency-Key": orderId
    },
    body: JSON.stringify({
      paymentKey,
      orderId,
      amount: product.price
    })
  });

  const data = await tossResp.json().catch(() => ({}));
  if(!tossResp.ok) {
    return res.status(tossResp.status).json({
      error: data.code || "TOSS_CONFIRM_FAILED",
      message: data.message || "토스페이먼츠 결제 승인에 실패했습니다."
    });
  }

  return res.status(200).json({
    ok: true,
    orderId,
    paymentKey: data.paymentKey,
    approvedAt: data.approvedAt,
    method: data.method,
    totalAmount: data.totalAmount,
    productId,
    product
  });
};
