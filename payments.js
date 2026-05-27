(function(){
  const PENDING_KEY = "saessak_pending_toss_order";
  const CREDIT_PREFIX = "saessak_paid_order_";

  const PRODUCTS = {
    mini: { type: "charge", label: "Mini", tokens: 50, price: 2900 },
    standard: { type: "charge", label: "Standard", tokens: 200, price: 9900 },
    plus: { type: "charge", label: "Plus", tokens: 500, price: 19900 },
    pro: { type: "charge", label: "Pro", tokens: 1200, price: 39900 },
    light: { type: "subscribe", label: "Light", tokens: 150, price: 7900 },
    "standard-sub": { type: "subscribe", label: "Standard", tokens: 400, price: 14900 },
    "premium-sub": { type: "subscribe", label: "Premium", tokens: 1000, price: 29900 }
  };

  window.saessak = window.saessak || {};
  window.saessak.payments = window.saessak.payments || {};

  function readUsers(){
    try { return JSON.parse(localStorage.getItem("saessak_users") || "[]"); } catch(e){ return []; }
  }

  function writeUsers(users){
    localStorage.setItem("saessak_users", JSON.stringify(users));
  }

  function updateUserById(userId, updater){
    const users = readUsers();
    const idx = users.findIndex(u => u.id === userId);
    if(idx === -1) return null;
    users[idx] = updater(users[idx]) || users[idx];
    writeUsers(users);
    return users[idx];
  }

  function loadTossSdk(){
    if(window.TossPayments) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-toss-payments]");
      if(existing){
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://js.tosspayments.com/v2/standard";
      script.async = true;
      script.setAttribute("data-toss-payments", "1");
      script.onload = resolve;
      script.onerror = () => reject(new Error("토스페이먼츠 SDK를 불러오지 못했습니다."));
      document.head.appendChild(script);
    });
  }

  async function getPaymentConfig(){
    const res = await fetch("/api/payment-config", { cache: "no-store" });
    if(!res.ok) throw new Error("결제 설정을 불러오지 못했습니다.");
    return res.json();
  }

  function makeOrderId(plan){
    const rand = Math.random().toString(36).slice(2, 10);
    return `ss_${plan.replace(/[^A-Za-z0-9_-]/g, "")}_${Date.now()}_${rand}`.slice(0, 64);
  }

  async function startCheckout(input){
    const product = PRODUCTS[input.plan];
    if(!product) return alert("알 수 없는 결제 상품입니다.");
    if(!input.user) return alert("로그인이 필요합니다.");

    try {
      const config = await getPaymentConfig();
      if(!config.clientKey){
        alert("토스페이먼츠 클라이언트 키가 아직 설정되지 않았습니다. Vercel 환경변수 TOSS_CLIENT_KEY를 먼저 등록해주세요.");
        return;
      }
      await loadTossSdk();

      const orderId = makeOrderId(input.plan);
      const orderName = product.type === "subscribe"
        ? `새싹매치 ${product.label} 월 구독`
        : `새싹매치 ${product.label} 토큰 ${product.tokens}개`;
      const pending = {
        orderId,
        plan: input.plan,
        type: product.type,
        tokens: product.tokens,
        price: product.price,
        orderName,
        userId: input.user.id,
        createdAt: new Date().toISOString()
      };
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));

      const tossPayments = window.TossPayments(config.clientKey);
      const customerKey = (input.user.supabaseId || input.user.id || orderId).replace(/[^A-Za-z0-9_\-=.@]/g, "_").slice(0, 50);
      const payment = tossPayments.payment({ customerKey });
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: product.price },
        orderId,
        orderName,
        successUrl: `${location.origin}/payment-success.html`,
        failUrl: `${location.origin}/payment-fail.html`,
        customerEmail: input.user.email,
        customerName: input.user.name
      });
    } catch(err){
      console.error(err);
      alert(err.message || "결제창을 여는 중 문제가 발생했습니다.");
    }
  }

  function applyPaidProduct(payment){
    const pendingRaw = sessionStorage.getItem(PENDING_KEY);
    const pending = pendingRaw ? JSON.parse(pendingRaw) : null;
    const product = payment.product;
    if(!pending || pending.orderId !== payment.orderId) return { ok: false, reason: "pending_order_mismatch" };
    if(!product || pending.plan !== payment.productId || pending.price !== product.price || pending.tokens !== product.tokens) {
      return { ok: false, reason: "product_mismatch" };
    }
    const userId = pending.userId;
    if(!userId) return { ok: false, reason: "user_not_found" };

    const creditKey = CREDIT_PREFIX + payment.orderId;
    if(localStorage.getItem(creditKey)) return { ok: true, duplicate: true };

    const updated = updateUserById(userId, user => {
      user.tokens = (user.tokens || 0) + product.tokens;
      user.tokenLog = user.tokenLog || [];
      user.tokenLog.unshift({
        ts: new Date().toISOString(),
        kind: product.type === "subscribe" ? "subscribe" : "purchase",
        amount: product.tokens,
        balance: user.tokens,
        memo: `${product.label} ${product.type === "subscribe" ? "구독 첫 회" : "충전"} 결제 완료 (₩${product.price.toLocaleString()})`
      });
      if(product.type === "subscribe"){
        user.plan = "premium";
        user.subscription = {
          plan: payment.productId,
          startedAt: new Date().toISOString(),
          renewsAt: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
          monthlyTokens: product.tokens,
          priceWon: product.price,
          provider: "tosspayments",
          lastOrderId: payment.orderId
        };
      }
      return user;
    });
    if(!updated) return { ok: false, reason: "user_not_found" };
    localStorage.setItem(creditKey, new Date().toISOString());
    sessionStorage.removeItem(PENDING_KEY);
    return { ok: true, user: updated };
  }

  window.saessak.payments.startCheckout = startCheckout;
  window.saessak.payments.applyPaidProduct = applyPaidProduct;
  window.saessak.payments.PRODUCTS = PRODUCTS;
})();
