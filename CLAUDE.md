# 새싹지원사업 — Claude 작업 지침

이 프로젝트(`청년창업 강화도`) 폴더에서 Claude가 작업할 때 따라야 할 핵심 지침.

## 🔴 작업 시작 전 필수 확인

1. **HANDOFF.md를 먼저 읽어라** — 같은 폴더의 `HANDOFF.md`에 프로젝트 전체 컨텍스트가 들어있음 (16개 섹션)
2. **백업 위치**: 큰 변경 전에는 `backup/` 폴더에 스냅샷 생성 권장
3. **운영자**: 변승환 (만 39세, 1987-04-17생, 강화도, rbshbomber@gmail.com)
4. **호칭**: 캐주얼 한국어, "형님" 호칭 OK, 반말 OK
5. **서브에이전트 사용 시 `agents/README.md` 와 해당 에이전트 정의서 먼저 읽기** (2026-05-18 추가)

## 🔴 서브에이전트 호출 규칙 (2026-05-20 M4 도착 후 본격 적용)

이 프로젝트에서 메인 세션이 서브에이전트(Task/Agent 도구)를 호출할 때 **반드시** 지킬 것:

### 1. 호출 prompt에 반드시 포함할 4가지
서브에이전트는 메인 컨텍스트를 못 봄. 따라서 prompt가 자급자족 가능해야 함.

- **목적 1줄** — 왜 이 일을 하는지
- **컨텍스트** — 관련 파일 절대 경로, 직전 변경 사항
- **준수 사항** — 아래 "핵심 제약 4가지" 중 해당되는 것 명시
- **출력 형식** — 각 에이전트 정의서의 "보고 형식" 섹션 참고

### 2. 핵심 제약 4가지 (해당 시 prompt에 명시)
- **디자인 톤** (프론트엔드/문서 작업 시): Pretendard + sage, 한자 장식 금지, 모던 SaaS 톤
- **가짜 데이터 금지** (전 작업): 사용자/결제/KPI/합격사례 미검증 수치 금지
- **AI 결과물 면책** (AI 사용 페이지·문서): "보조 도구" 포지셔닝, 합격률 % 금지
- **법적 안전** (전문가 매칭·재무 자문): 변호사법·세무사법·표시광고법 회피

### 3. 메인 세션의 책임
- 서브에이전트 결과를 받으면 위 4가지 제약 위반 여부 **즉시 검수**
- 위반 시 즉시 수정 지시 또는 재호출
- 절대 검수 없이 다음 단계로 넘어가지 말 것

### 4. 병렬 호출 권장
- 의존성 없는 작업은 한 메시지에서 동시 호출 (Agent 도구를 여러 개 한 번에)
- 의존 체인(예: 코드 수정 → 배포)은 직렬 처리

### 5. 도메인 분리 원칙
| 영역 | 담당 에이전트 |
|---|---|
| 새싹매치 HTML/CSS/JS | saessak-frontend |
| 새싹매치 api/ (서버리스) | saessak-api |
| 새싹매치 배포 (git push) | saessak-deploy |
| 약국앱 도메인 리서치 | pharmacy-research |
| docx/xlsx/pptx 산출물 | doc-writer |
| 약국 외 웹 리서치 | web-research |

다른 도메인의 에이전트를 잘못 호출하면 컨텍스트 누락 위험. 매트릭스 따라 호출.

### 6. 참고 문서
- 에이전트별 상세 정의: `agents/<이름>.md`
- 호출 매트릭스 + 위임 패턴: `agents/README.md`
- 병렬 작업 풀: `AGENT_TASKS_POOL.md`
- M4 셋업 가이드: `M4_SETUP.md`

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

## 🔴 가짜 데이터 금지 원칙 (절대 위반 X)

**다음 데이터는 절대 만들지 말 것:**
- 가짜 사용자 (j***@gmail.com 같은 마스킹 이메일 포함)
- 가짜 결제 내역
- 가짜 KPI (MAU 2,847, 매칭 누적 8,492 등)
- 가짜 합격 사례 (lib.html 12건은 모두 가짜였음 — 이미 제거됨)
- 가짜 "첫 100명" 카운터
- 사업계획서에 검증 안 된 "사용자 N명 확보" 같은 수치

**모든 통계/리스트는 다음 중 하나여야 함:**
1. **실제 측정값** (localStorage / Supabase에서 실시간 카운트)
2. **"준비 중" 또는 "0 / —"** (데이터 없는 상태 정직 표시)
3. **"계획" 또는 "목표"로 명시** (예: "파이프라인 타깃 (계획) 7곳")

## 진짜 데이터 추가 방법 (나중에 적용)

### 1) 합격 라이브러리 — 실제 사례 수집 절차
1. SNS/블로그/링크드인에서 예비창업패키지·청년창업사관학교 합격자 찾기
2. DM/이메일로 컨택 — "익명화하여 5만원 보상" 제시
3. 동의서 받기 (이메일 답신 + 마스킹 동의)
4. 합격자가 직접 보낸 텍스트만 사용 (AI 가공 X)
5. 이름·회사명·민감 수치 마스킹 후 게재
6. `lib.html`의 hero/main 영역을 복원 (백업: `backup/v1-pre-ai-expansion/lib.html`)
7. CASES 배열에 진짜 사례 추가

### 2) admin.html 통계 활성화
1. 가입자 50명 도달 시 권역별/분야별 분포 자동 활성화
2. 첫 결제 발생 시 결제 내역 표 자동 표시
3. K-Startup API 통계는 이미 실시간 (kpi-ks-total/shown)

### 3) 사업계획서에 사용자 수 기재 시
- 실제 가입자 수만 적기 (현재: 운영자 본인 1명)
- 또는 "M+N 후 목표 N명" 식으로 명확히 구분
- "이미 확보" 표현은 측정 가능한 경우만

### 4) B2B 영업 파이프라인
- "콜드 리드" / "타깃" / "협의 중" 단계 명시
- 실제 미팅·계약 발생 시 단계 업데이트
- 가짜 계약 표시 절대 금지

## AI 결과물 포지셔닝 (필수)

모든 AI 사용 기능에 다음 메시지 일관 적용:

> **"AI는 자동화가 아닌 ‘작성 보조 도구’입니다."**

- 합격률 % 정량 표시 ❌ → 정성 5단계 (매우 강함/강함/보통/약함) ✅
- 실명·실재 기관 페르소나 ❌ → "정부 운영 경험형", "VC 경험형" 등 일반화 ✅
- 합격 보장 표현 ❌ → "도움이 됩니다", "가능성이 있습니다" ✅
- 변호사/세무사 매칭 수수료 ❌ → 광고 디렉토리 형태만 ✅
- 재무 자문·기업가치 평가 ❌ → "참고용 시뮬레이션" 명시 ✅

## 토큰 가격표 (현재 기준)

### 정액 기능 (고정 가격)

| 기능 | 토큰 | 가격 |
|---|---|---|
| AI 매칭 추천 | 무료 | - |
| 사업계획서 AI | 20 | 5,000원 |
| 비교 분석 | 10 | 2,500원 |
| 심사 시뮬레이션 | 50 | 12,500원 |
| 발표 슬라이드 | 30 | 7,500원 |
| 1:1 멘토링 | 30 | 7,500원 |
| 합격 라이브러리 1건 | 10 | 2,500원 |

### AI 팀 스튜디오 (teambuilder.html)

| 작업 | 토큰 |
|---|---|
| 개별 에이전트 디스패치 | 5~20 (에이전트별, 길이 가산) |
| Council (빠른 회의) | 10 |
| 전체 실행 (6명 풀체인) | 60 |

### 📄 사업계획서 업로드 분석 (v5 · Metered Billing · 동적 견적)

**위치**: `teambuilder.html` → `analyzer.js` 모듈 (런처는 topbar + lobby 카드)  
**원칙**: 업로드 분량과 산출물 선택에 비례한 동적 견적 + 견적 +20% 초과분은 우리가 흡수

**견적 공식**:
```
estimated = 10 (base)
          + ceil(words / 800) * 2          // 인풋 가산 (800단어당 2토큰)
          + output_cost                    // 산출물 가산 (아래 표)
          + (useTeam ? ceil((base + output_cost) * 0.25) : 0)  // AI 팀 검수 +25%
cap = ceil(estimated * 1.20)              // 견적의 120%, 초과분은 무료
```

**산출물 가산 (output_cost)**:

| 산출물 | 토큰 |
|---|---|
| Word 보완 체크리스트 | +8 |
| PDF 정리본 | +18 |
| PPT 발표자료 (10장) | +28 |
| 풀패키지 (Word+PDF+PPT, 15% 할인) | +45 |

**실전 예시 (펀딩가 1토큰≈49.5원, 검산 완료)**:
- 20p / 4,800단어 → PPT만: 10+12+28+0 = **50토큰 ≈ 2,475원** (캡 60)
- 40p / 9,600단어 → 풀패키지 + AI 팀: 10+24+45+14 = **93토큰 ≈ 4,600원** (캡 112)
- 60p / 30,000단어 → 풀패키지 + AI 팀: 10+76+45+14 = **145토큰 ≈ 7,180원** (캡 174)
- 캡 보호: 견적의 120% 초과분은 우리가 흡수

### Phase 1 / Phase 2 분리 (2026-05-26)

- **Phase 1 (라이브)**: UI + 견적 + 데모 차감 (실제 산출물 X). `user.analyzerLog`에 기록.
- **Phase 2 (미구현)**: `api/analyze-plan.js` 서버리스 → Claude API 호출 → Word/PDF/PPT 실제 생성. 이때 `analyzer.js`의 `onRun()` 함수 안의 데모 차감 블록을 실제 API 호출 + 실측 토큰 정산으로 교체.

### 공통

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
