# 새싹지원사업 (Saessak Jiwon Saeop) — 프로젝트 인수인계 문서

> 한국 청년창업 지원사업 통합 큐레이션 + AI 매칭 + 사업계획서 자동 생성 플랫폼  
> 운영 URL: **https://saessak-platform.vercel.app**  
> 마지막 업데이트: 2026-05-13

---

## 1. 프로젝트 한 줄 요약

**전국 17개 시도의 청년창업 정부 지원사업 공고 28,612건을 실시간으로 통합·큐레이션하고, Claude API로 매칭·사업계획서 자동 생성·심사 시뮬레이션·1:1 멘토링까지 제공하는 SaaS 플랫폼.**

타깃: 만 39세 이하 한국 청년 예비창업자  
포지셔닝: AI는 자동화가 아닌 ‘작성 보조 도구’ (책임감 있는 AI 활용)

---

## 2. 운영자 정보

- **이름**: 변승환 (만 39세, 1987년 4월 17일생) — 청년창업 자격 마지막 해
- **거주**: 인천광역시 강화군
- **연락처**: 010-7368-0417 / rbshbomber@gmail.com
- **GitHub**: https://github.com/rbshbomber-bit/saessak-platform
- **배경**: 정규 개발자 아님. AI 보조 코딩(바이브 코딩)으로 웹앱 5개 제작 경험. 본 플랫폼이 5번째.

---

## 3. 기술 스택

### Frontend
- **Vanilla HTML/CSS/JS** (프레임워크 없음, 정적 사이트)
- **Pretendard Variable** (메인 폰트)
- **Cormorant Garamond** (브랜드 액센트용 - 거의 사용 안 함, 모던 SaaS 톤으로 정리됨)
- 디자인 시스템: CSS 변수 기반 sage(연두) 톤

### Backend (Vercel Serverless Functions)
- **/api/claude.js** — Anthropic Claude API 프록시
- **/api/listings.js** — K-Startup OpenAPI에서 정부 공고 가져와 변환
- **/api/kstartup-debug.js** — K-Startup API 디버그용

### 인증/DB
- **Supabase** (PostgreSQL + Auth)
- 구글 OAuth 2.0 + 이메일/비밀번호 로그인
- localStorage 동기화 (오프라인 폴백)

### AI
- **Anthropic Claude API**
- 기본 모델: `claude-haiku-4-5-20251001` (저렴, 빠름)
- 환경변수: `CLAUDE_API_KEY`

### 데이터 소스
- **K-Startup OpenAPI** (공공데이터포털)
  - 엔드포인트: `https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01`
  - 응답: XML (`<item><col name="...">value</col>...</item>` 형식, 일반 XML 아님)
  - 일 호출 한도: 40,000건 (4개 기능 × 10,000)
  - 환경변수: `KSTARTUP_API_KEY` (decoded 형태)

### 배포
- **Vercel** (Hobby 플랜, 무료)
- **GitHub auto-deploy** (main 브랜치 push 시 자동 빌드)
- Edge Cache: 1시간 (`s-maxage=3600, stale-while-revalidate=600`)

---

## 4. 폴더 구조

```
청년창업 강화도/                  ← 프로젝트 루트
├── index.html                  ← 메인 페이지 (1900+ 라인, 가장 큰 파일)
├── auth.html                   ← 회원가입/로그인
├── mypage.html                 ← 마이페이지 (토큰 잔액, 사용 이력)
├── admin.html                  ← 관리자 페이지 (password: admin1234)
├── lib.html                    ← 합격 사업계획서 라이브러리 (12건)
├── mentor.html                 ← AI 1:1 멘토링 챗
├── compare.html                ← 사업계획서 비교 분석 (NEW)
├── simulate.html               ← 심사위원 시뮬레이션 (NEW)
├── slides.html                 ← 발표 슬라이드 자동 생성 (NEW)
├── b2b-demo.html              ← 강화군청 PoC 화이트라벨 시연
├── terms.html                  ← 약관 (이용/AI면책/환불/개인정보/분쟁 5개 섹션)
├── 404.html
├── 
├── supabase-config.js          ← Supabase 클라이언트 (모든 페이지 공유)
├── admin-config.js             ← 관리자 권한 자동 부여 (rbshbomber@gmail.com)
├── ai-client.js                ← window.saessak.callClaude() 헬퍼
├── 
├── listings.json               ← 정적 폴백 공고 13건 (API 실패 시)
├── package.json                ← Node 18+
├── google9ee90f27c0d0dc90.html ← Google Search Console 인증
├── robots.txt
├── sitemap.xml
├── 
├── api/
│   ├── claude.js               ← Anthropic API 프록시
│   ├── listings.js             ← K-Startup → 우리 LISTINGS 구조 변환
│   └── kstartup-debug.js       ← 디버그용 (필드명 확인용)
├── 
├── images/                     ← 로고, 히어로 이미지 등
├── 
├── backup/
│   └── v1-pre-ai-expansion/    ← 2026-05-13 신규 3종 추가 전 스냅샷
│       ├── BACKUP_README.md
│       └── (전체 사이트 파일 복사본)
├── 
└── 문서:
    ├── 예비창업패키지_사업계획서_새싹지원사업_v3_운영자역량강화.docx   ← 최신 사업계획서
    ├── BM캔버스_새싹지원사업_v2_전국.docx
    ├── 강화도_청년창업_새마을지도자_액션플랜_v3_전국.docx
    ├── 강화군청_PoC_제안서_새싹지원사업_v2.docx
    └── 매출시뮬레이션_새싹지원사업_v1.xlsx
```

---

## 5. 구현된 기능 전체 목록

### 5-1. 공개 기능 (무료)
- **메인 페이지** — 전국 17개 시도 청년창업 공고 카드 그리드 (현재 161건 라이브)
- **지역 필터** — 수도권/영남/호남/충청/강원/제주/전국
- **세부 필터** — 분야(9종)/지원유형/금액/마감일 4축 체크박스
- **검색** — 공고명·주관기관 텍스트 검색
- **신청 트래커** — 관심 공고 저장 + 6단계 상태 추적 (관심→통과)
- **합격 라이브러리** — 12건 사례 (10토큰 잠금 해제)

### 5-2. AI 기능 (토큰 차감)

| 기능 | URL | 토큰 | 가격 |
|---|---|---|---|
| AI 매칭 추천 | `#ai-matching` (메인) | 무료 | - |
| 사업계획서 AI | `#ai-planner` (메인) | 20 | 5,000원 |
| 비교 분석 | `compare.html` | 10 | 2,500원 |
| 심사 시뮬레이션 | `simulate.html` | 50 | 12,500원 |
| 발표 슬라이드 | `slides.html` | 30 | 7,500원 |
| 1:1 멘토링 | `mentor.html` | 30 | 7,500원 |
| 합격 라이브러리 (1건) | `lib.html` | 10 | 2,500원 |

### 5-3. 결제·구독 시스템

**토큰 충전 4종** (단건):
- Mini: 150토큰 / 3,400원 (정가 4,900)
- **Standard: 300토큰 / 6,900원 ⭐** (정가 9,900, 추천)
- Plus: 600토큰 / 13,900원 (정가 19,900)
- Pro: 1,200토큰 / 27,900원 (정가 39,900)

**월 구독 3종**:
- Light: 400토큰/월 / 6,900원
- **Standard: 900토큰/월 / 13,900원 ⭐** (추천)
- Premium: 2,000토큰/월 / 27,900원

**결제 PG**: 토스페이먼츠 연동 준비 단계 (placeholder, 실연동 X)  
**회원가입 보너스**: 50토큰 자동 지급

### 5-4. 회원·관리자 시스템
- **Supabase Auth + 구글 OAuth**
- **관리자 자동 부여**: `rbshbomber@gmail.com` 로그인 시 `role: 'admin'` + 토큰 999,999
  - 관리자 UI: 토큰 칩 "∞" + 우측 상단 노란 "ADMIN" 뱃지
- **admin.html**: 비밀번호 `admin1234` (단순 입력, KPI/사용자/공고/결제/B2B 5개 섹션)

### 5-5. B2B 화이트라벨
- **b2b-demo.html** — 강화군청용 시연 페이지 (코발트+골드 컬러)
- 17개 시도 + 226개 기초지자체 영업 대상

---

## 6. 환경변수 (Vercel)

```env
CLAUDE_API_KEY=sk-ant-api03-...        ← Anthropic 콘솔에서 발급
KSTARTUP_API_KEY=aaa94a7bd...761f      ← 공공데이터포털에서 발급 (64자 hex)
```

설정 위치: Vercel → saessak-platform → Settings → Environment Variables  
적용: Production + Preview + Development 셋 다 체크 + 저장 후 Redeploy

---

## 7. 디자인 시스템

### 컬러 (CSS 변수)
```css
--bg: #fbfaf6           /* 메인 배경 (크림화이트) */
--bg-2: #f4f1ea         /* 보조 배경 */
--card: #ffffff         /* 카드 배경 */
--ink: #14181f          /* 메인 텍스트 (거의 검정) */
--ink-2: #3a4250        /* 보조 텍스트 */
--ink-3: #6c7280        /* 흐린 텍스트 */
--line: #e6e3da         /* 보더 라인 */
--sage: #8da888         /* 브랜드 메인 (sage green) */
--sage-deep: #5c7a5a    /* 브랜드 강조 */
--sage-soft: #d8e3d4    /* sage 배경 */
--cream: #f1ead9        /* 크림 컬러 */
--gold: #b9844a         /* 강조 오렌지/골드 */
--good: #2f7a3c         /* 성공 */
--warn: #b45309         /* 경고 */
--bad: #b91c1c          /* 에러 */
```

### 톤
- **모던 SaaS 톤** (Linear / Notion / Vercel 풍)
- **Pretendard 단독** (한자 장식 모두 제거됨 — 사주팔자 톤 회피)
- **광고 없음**, 차분한 sage 색감
- **카드 그리드**, **둥근 모서리** (10-14px), **부드러운 그림자**

### 타이포그래피
- 본문: Pretendard Variable
- 제목: Pretendard 800 (extrabold)
- 영어 숫자/PER MONTH 같은 강조: 그대로 유지

---

## 7-2. 가짜 데이터 금지 원칙 (2026-05-13 적용)

본 프로젝트는 **모든 사용자 통계·결제 데이터·합격 사례를 정직하게 표시**합니다.
가짜 시뮬레이션 데이터로 사용자를 오인시키지 않습니다.

**제거된 가짜 데이터 목록:**
- ❌ lib.html의 합격 사례 12건 (모두 AI 생성 가짜) → "준비 중" 페이지로 전환
- ❌ admin.html의 MAU 2,847 / AI 매칭 8,492 / 결제 127건 → 모두 실시간 카운트로
- ❌ admin.html의 가짜 결제 내역 8건 → "데이터 없음" 상태로
- ❌ admin.html의 가짜 사용자 분포·월별 추이·인기 공고 Top 5 → "데이터 50명 도달 시 활성화"
- ❌ "첫 100명 50% 할인" 카운터 → "베타 한정 50% 할인"으로 변경 (수량 카운터 제거)
- ❌ 사업계획서 fallback의 "베타 사용자 50명 확보" → "초기 사용자 확보 (목표 N명)"
- ❌ B2B 영업 "상담 문의 4건" → 0으로 (실 발생 시 카운트)

**원칙: 모든 통계는 다음 중 하나**
1. 실제 측정값 (localStorage / Supabase 실시간)
2. "0" 또는 "—" (정직한 빈 상태)
3. "계획"/"목표"로 명시 (예: "파이프라인 타깃(계획) 7곳")

**진짜 데이터 추가 방법은 CLAUDE.md 참고.**

## 8. 법적/책임감 포지셔닝

### 핵심 메시지
**"AI는 자동화가 아닌 ‘작성 보조 도구’입니다."**

이 메시지를 모든 AI 사용 페이지 상단 sage InfoBox로 명시:
- index.html (사업계획서 AI 섹션)
- compare.html
- simulate.html
- slides.html
- mentor.html

### 5겹 방어 장치
1. **사전 동의 체크박스** (사업계획서 AI 사용 전 필수)
2. **결과물 워터마크** ("AI 보조 결과물, 본인 검수 필수")
3. **합격 보장 부정 명시** (모든 카드/페이지 푸터)
4. **본인 데이터 추가 강제** (편집기 진입)
5. **운영자 1차 검수 옵션** (프리미엄 부가)

### 법적 안전 가이드 (신규 서비스 도입 시 준수)
- ❌ 합격률 % 정량 표시 금지 → ✅ 정성 5단계 (매우 강함/강함/보통/약함)
- ❌ 실명·실재 기관 페르소나 금지 → ✅ "정부 운영 경험형", "VC 경험형" 등 일반화
- ❌ 변호사/세무사 수수료 매칭 금지 (변호사법 109조, 최대 징역 5년)
- ❌ 재무 자문·기업가치 평가 출력 금지 (세무사법·회계사법)
- ✅ AI 기본법 (2026년 시행) 이용자 권리 보호 조항 약관 명시

### terms.html 5개 섹션
1. 이용약관
2. AI 면책 조항
3. 환불 정책
4. 개인정보처리방침
5. 분쟁 해결

---

## 9. 운영자 강점 (사업계획서 핵심 포인트)

심사위원이 즉시 검증 가능한 운영자 역량:

1. **만 39세** — 청년창업 자격 마지막 해 (긴급성 + 풀타임 투입 의지)
2. **바이브 코딩 5개 웹앱 제작** — 본 플랫폼 포함
3. **본인이 본인의 1호 사용자** — 자가 검증된 페인포인트 (dogfooding)
4. **외부 API 3종 실 연동 운영** — Claude / K-Startup / Supabase
5. **GitHub 30+ 커밋 + 자동 CI/CD** — 무중단 배포 검증
6. **강화군 새마을지도자 트랙 병행** — B2B 1호 PoC 통로
7. **본 사업계획서 자체가 본 도구로 작성** — 시제품 자가 검증의 메타 증거

---

## 10. 개발/배포 워크플로우

### 로컬 개발 (필요 시)
```bash
# 사이트 루트에서 정적 파일 서빙
python3 -m http.server 8000
# 또는
npx serve .
```

### Git/GitHub
- **레포**: https://github.com/rbshbomber-bit/saessak-platform
- **브랜치**: main (단일 브랜치 운영)
- **자동 배포**: main에 push 시 Vercel 자동 빌드 (30초~1분)

### 배포 파이프라인 (Claude/AI가 자동으로 처리해온 패턴)
```bash
# /tmp/saessak-deploy 에 clone되어 있음
cd /tmp/saessak-deploy
# 파일 수정 → 복사
cp /Users/.../청년창업\ 강화도/index.html ./index.html
# 커밋 + push
git add . && \
  git -c user.name="Saessak Bot" -c user.email="rbshbomber@gmail.com" \
      commit -m "메시지" && \
  git push origin main
```

### GitHub Token (Vercel 자동 배포용)
- 형태: `ghp_***` (Personal Access Token)
- 권한: repo (full)
- 저장 위치: /tmp/saessak-deploy/.git/config 의 remote URL에 포함

---

## 11. 미완성 / 다음 작업 (Backlog)

### 즉시 가능 (1-2일)
- [ ] 토스페이먼츠 결제 PG 실연동 (현재 placeholder)
- [ ] 도메인 등록 (saessak.kr 또는 saessak.io)
- [ ] AI 기본법 약관 단락 추가

### 단기 (1-2주)
- [ ] 합격률 예측 → "적합도" 정성 평가로 재설계 후 출시
- [ ] 카톡 알림 시스템 (카카오 비즈니스 + 마케팅 동의 분리)
- [ ] sitemap.xml 자동 갱신 (신규 페이지 반영)
- [ ] 17기 청년창업사관학교 (종료) 정보 정정
- [ ] K-Startup 데이터 자동 갱신 cron 추가 (현재는 호출 시점 캐시)

### 중기 (1-2개월)
- [ ] 운영자 1차 검수 → 외부 컨설턴트 매칭 시스템
- [ ] 재무 모델 자동 생성 ("참고용 시뮬레이션" 명확히)
- [ ] B2B 대학 LINC 라인 영업 (연 500만/대학)
- [ ] B2B 기업 사내벤처 도구 (월 99,000원/사)

### 장기 (3-6개월)
- [ ] 전문가 매칭 → 광고 디렉토리 형태 (변호사법 회피)
- [ ] iOS/Android 앱 (React Native)
- [ ] 합격자 인터뷰 영상 콘텐츠 라인
- [ ] 데이터 자산 모네타이제이션 (B2B 트렌드 리포트)

---

## 12. 외부 자원 / 계정 정보

| 서비스 | 용도 | 계정/링크 |
|---|---|---|
| Vercel | 호스팅 | https://vercel.com/unha/saessak-platform |
| GitHub | 코드 저장소 | https://github.com/rbshbomber-bit/saessak-platform |
| Supabase | 인증·DB | https://supabase.com (조직: saessak) |
| Anthropic | Claude API | https://console.anthropic.com |
| 공공데이터포털 | K-Startup API | https://data.go.kr (인증키 발급일: 2026-04-19, 활용기간 ~2028-05-13) |
| Google Cloud | OAuth 2.0 | rbshbomber@gmail.com |
| Google Search Console | SEO | google9ee90f27c0d0dc90 |

---

## 13. ChatGPT/다른 AI로 작업 이어받기

### 작업 인수인계 시 ChatGPT에 던질 컨텍스트
이 문서를 통째로 첨부하고 다음을 추가로 알려주면 됨:

```
나는 변승환(만 39세, 강화도)이고, 새싹지원사업이라는 
한국 청년창업 정부 지원사업 통합 플랫폼을 운영 중이야.
사이트: https://saessak-platform.vercel.app
GitHub: https://github.com/rbshbomber-bit/saessak-platform

첨부한 HANDOFF.md를 참고해서 [작업 내용] 도와줘.

작업 시 주의:
1. 톤은 캐주얼 한국어 (반말 OK, "형님" 호칭 사용)
2. 디자인은 모던 SaaS 톤 — 한자 장식 금지 (사주팔자 분위기 회피)
3. AI 결과물은 무조건 "보조 도구" 포지셔닝
4. 합격률 % 정량 표시 금지, 정성 5단계만
5. 변호사법·세무사법 위배 가능한 매칭 서비스 회피
6. 기존 파일 변경 전 backup/ 폴더로 복사 권장
```

### 자주 쓰는 코드 패턴

**Claude API 호출 (프론트엔드)**:
```js
const text = await window.saessak.callClaude(prompt, {
  system: "시스템 프롬프트",
  max_tokens: 2000,
  fallback: "API 실패 시 폴백 텍스트"
});
```

**토큰 차감 (관리자 자동 우회)**:
```js
const isAdmin = window.saessak?.isAdmin?.(user);
if (!isAdmin) {
  if ((user.tokens || 0) < COST) { 알림(); return; }
  updateUser(u => { u.tokens -= COST; ... });
}
```

**서브페이지 헤더 (token-chip)**:
```html
<span class="token-chip" id="token-display">
  <span>로그인</span>
</span>
```

**드롭다운 메뉴 패턴 (index.html)**:
```html
<div class="dropdown" data-dropdown>
  <button class="dropdown-trigger">메뉴 <span class="caret">▾</span></button>
  <div class="dropdown-menu">
    <a href="..."><span>항목명</span><span class="meta token">N토큰</span></a>
  </div>
</div>
```

---

## 14. 매출 시뮬레이션 (1년차 추정)

| 라인 | 보수 | 기본 | 공격 |
|---|---|---|---|
| 정부 지원사업 자금 | 1억 (예창패) | 1.5억 | 2억 |
| B2B 지자체 라이선스 | 500만 | 1,500만 | 3,000만 |
| 사업계획서 AI 컨설팅 | 300만 | 1,000만 | 2,000만 |
| B2C 월 구독 | 100만 | 500만 | 1,000만 |
| 신규 AI 서비스 3종 추가 매출 | +300만 | +800만 | +1,500만 |
| **합계** | **약 1.2억** | **약 2억** | **약 3억** |

3년차 목표: 3~10억 (B2B 5~10곳 + MAU 30,000)

---

## 15. 변경 이력 (주요 마일스톤)

- **2026-04-19**: 공공데이터포털 K-Startup API 활용신청 완료
- **2026-05-13**: 사이트 정식 배포 + Claude API 연동 + K-Startup 실연동 + 관리자 토큰 무제한 + 신규 AI 서비스 3종 추가 (비교/시뮬레이션/슬라이드) + 드롭다운 네비 + 한자 장식 전면 제거 + 사업계획서 v3 운영자 역량 강화 + AI 보조 도구 포지셔닝 강화
- 다음 마일스톤: 토스 결제 실연동 + 도메인 등록 + 합격률 예측 안전 재설계

---

## 16. 핵심 의사결정 기록 (Why)

| 결정 | 이유 |
|---|---|
| 청년창업 단일 segment | 모든 정부지원사업 확장은 분산 우려 — 깊이 우선 |
| Vanilla HTML (React X) | 빠른 출시, AI 보조 코딩 친화적 |
| Supabase | 무료 플랜으로 시작 가능, OAuth 통합 쉬움 |
| Claude Haiku 4.5 | 가장 저렴 + 빠름 (1회 약 $0.001~0.005) |
| 1억 사업화 자금 신청 | 예비창업패키지 최대치, 가장 현실적 |
| sage(연두) 톤 | 다른 정부 사업 사이트(파란색)와 차별화 + 청년·새싹 이미지 |
| 한자 장식 제거 (2026-05-13) | 사주팔자 분위기 회피, 모던 SaaS 톤 통일 |
| 합격률 % 표시 금지 | 표시광고법 + 손해배상 위험 회피 |
| 페르소나 일반화 | 실명 명예훼손 회피 |
| 운영자 직접 검수 → 외부 매칭 전환 | 책임 분산 + 환불 위험 회피 |

---

_이 문서는 운영자 변승환이 새싹지원사업 플랫폼 운영을 ChatGPT/다른 AI 도구로 이어받아 작업할 수 있도록 작성된 인수인계 문서입니다. 최신 정보는 GitHub repo와 사이트 자체를 참고하세요._
