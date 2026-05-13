# 새싹지원사업 — Claude 작업 지침

이 프로젝트(`청년창업 강화도`) 폴더에서 Claude가 작업할 때 따라야 할 핵심 지침.

## 🔴 작업 시작 전 필수 확인

1. **HANDOFF.md를 먼저 읽어라** — 같은 폴더의 `HANDOFF.md`에 프로젝트 전체 컨텍스트가 들어있음 (16개 섹션)
2. **백업 위치**: 큰 변경 전에는 `backup/` 폴더에 스냅샷 생성 권장
3. **운영자**: 변승환 (만 39세, 1987-04-17생, 강화도, rbshbomber@gmail.com)
4. **호칭**: 캐주얼 한국어, "형님" 호칭 OK, 반말 OK

## 핵심 사실 (변경 금지)

- **사이트 URL**: https://saessak-platform.vercel.app
- **GitHub**: https://github.com/rbshbomber-bit/saessak-platform
- **메인 진입 파일**: `index.html` (Korean 파일명 X)
- **공유 JS 3개**: `supabase-config.js`, `admin-config.js`, `ai-client.js`
- **API 폴더**: `api/claude.js`, `api/listings.js`, `api/kstartup-debug.js`
- **환경변수**: `CLAUDE_API_KEY`, `KSTARTUP_API_KEY` (Vercel)

## 디자인 톤 (반드시 준수)

- ✅ **모던 SaaS 톤** — Linear / Notion / Vercel 풍
- ✅ **Pretendard 폰트** 단독 사용
- ✅ **sage 색감** (CSS 변수 `--sage`, `--sage-deep`, `--sage-soft`)
- ❌ **한자 장식 금지** (사주팔자 분위기 회피)
  - 蓄/流/微/中/厚/極/河/海/合格/指導 등 모두 제거됨
  - Cormorant Garamond italic은 거의 사용 안 함
- ❌ **광고 배너 금지**
- ❌ **불꽃 이모지 남발 금지**

## AI 결과물 포지셔닝 (필수)

모든 AI 사용 기능에 다음 메시지 일관 적용:

> **"AI는 자동화가 아닌 ‘작성 보조 도구’입니다."**

- 합격률 % 정량 표시 ❌ → 정성 5단계 (매우 강함/강함/보통/약함) ✅
- 실명·실재 기관 페르소나 ❌ → "정부 운영 경험형", "VC 경험형" 등 일반화 ✅
- 합격 보장 표현 ❌ → "도움이 됩니다", "가능성이 있습니다" ✅
- 변호사/세무사 매칭 수수료 ❌ → 광고 디렉토리 형태만 ✅
- 재무 자문·기업가치 평가 ❌ → "참고용 시뮬레이션" 명시 ✅

## 토큰 가격표 (현재 기준)

| 기능 | 토큰 | 가격 |
|---|---|---|
| AI 매칭 추천 | 무료 | - |
| 사업계획서 AI | 20 | 5,000원 |
| 비교 분석 | 10 | 2,500원 |
| 심사 시뮬레이션 | 50 | 12,500원 |
| 발표 슬라이드 | 30 | 7,500원 |
| 1:1 멘토링 | 30 | 7,500원 |
| 합격 라이브러리 1건 | 10 | 2,500원 |

회원가입 보너스: 50토큰  
관리자(rbshbomber@gmail.com): 무제한 (자동 부여)

## 배포 워크플로우

```bash
# 1. 파일 수정 후 /tmp/saessak-deploy 로 복사
cp "/Users/.../청년창업 강화도/index.html" /tmp/saessak-deploy/index.html

# 2. 커밋 + push (Vercel이 자동 빌드)
cd /tmp/saessak-deploy && \
  git add . && \
  git -c user.name="Saessak Bot" -c user.email="rbshbomber@gmail.com" \
      commit -m "메시지" && \
  git push origin main
```

## 자주 쓰는 코드 패턴

### Claude API 호출 (프론트엔드)
```js
const text = await window.saessak.callClaude(prompt, {
  system: "시스템 프롬프트",
  max_tokens: 2000,
  fallback: "API 실패 시 폴백"
});
```

### 토큰 차감 (관리자 자동 우회)
```js
const isAdmin = window.saessak?.isAdmin?.(user);
if (!isAdmin) {
  if ((user.tokens || 0) < COST) { /* 알림 */ return; }
  updateUser(u => { u.tokens -= COST; /* 로그 추가 */ });
}
```

### 새 서브페이지 헤더 (다른 서브페이지 그대로 복사)
```html
<header class="site">
  <div class="container nav">
    <a class="brand" href="index.html">
      <div class="logo-img" aria-hidden="true"></div>
      <span class="name">새싹<span class="accent">지원사업</span></span>
    </a>
    <div class="nav-right">
      <span class="token-chip" id="token-display"><span>로그인</span></span>
      <a href="index.html" class="back">← 메인</a>
    </div>
  </div>
</header>
```

## 새 페이지 생성 체크리스트

1. `<script src="supabase-config.js" defer>` 포함
2. `<script src="admin-config.js" defer>` 포함
3. `<script src="ai-client.js" defer>` 포함 (AI 사용 시)
4. CSS 변수 (`--sage`, `--ink` 등) 복사
5. 헤더 + 푸터 구조 다른 서브페이지에서 복사
6. 토큰 차감 시 관리자 우회 로직 적용
7. AI 사용 시 sage InfoBox로 "보조 도구" 명시
8. 푸터에 "AI 자동 응답 · 본인 판단·검토 필수 · 합격 보장 없음" 표기

## 미완성 작업 (Backlog)

자세한 건 `HANDOFF.md` 11번 섹션 참조. 우선순위:
1. 토스페이먼츠 결제 실연동
2. 도메인 등록 (saessak.kr)
3. 합격률 예측 "적합도" 정성 재설계
4. 17기 청년창업사관학교 (종료) 정보 정정
5. K-Startup 데이터 자동 갱신 cron

---

_이 문서는 Claude/AI 도구가 본 프로젝트 작업 시 자동으로 참조해야 하는 핵심 지침. 자세한 내용은 같은 폴더의 HANDOFF.md 참조._
