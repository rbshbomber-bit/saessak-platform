# 백업 스냅샷 — v1-pre-ai-expansion

**생성일**: 2026-05-13
**시점**: 신규 AI 서비스 3종(비교 분석 / 심사위원 시뮬레이션 / 발표 슬라이드) 추가 직전

## 백업 시점의 사이트 상태
- ✅ K-Startup OpenAPI 실시간 연동 완료 (28,612건)
- ✅ Claude API 실 연동 완료 (매칭/사업계획서/멘토링)
- ✅ 관리자 토큰 무제한 (admin-config.js)
- ✅ 사이트 카드 디스플레이 보정 완료 (한글 카테고리)
- ✅ AI 보조 도구 포지셔닝 InfoBox 적용 (index/mentor)
- ✅ 161건 라이브 공고 노출 중

## 포함 파일
- 메인: index.html
- 서브앱: auth.html, mypage.html, admin.html, lib.html, mentor.html, b2b-demo.html, terms.html, 404.html
- 공유 JS: supabase-config.js, admin-config.js, ai-client.js
- API: api/listings.js, api/claude.js, api/kstartup-debug.js
- 데이터: listings.json
- 메타: robots.txt, sitemap.xml

## 복원 방법
이 폴더의 파일을 다시 사이트 루트로 복사하면 백업 시점으로 되돌아갑니다.

```bash
cp backup/v1-pre-ai-expansion/*.html .
cp backup/v1-pre-ai-expansion/*.js .
cp backup/v1-pre-ai-expansion/api/* api/
```

## 백업 후 추가될 변경
- compare.html — 사업계획서 비교 분석 (10 토큰)
- simulate.html — 심사위원 시뮬레이션 (50 토큰)
- slides.html — 발표 슬라이드 PPT 자동 생성 (30 토큰)
- index.html 네비게이션 메뉴에 신규 3개 링크 추가
- index.html 요금제 섹션에 신규 토큰 가격 안내 추가
