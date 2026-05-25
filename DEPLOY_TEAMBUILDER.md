# AI 팀 스튜디오 — 배포 가이드

미니맥애이전트의 Agent Studio 룩을 새싹매치 `teambuilder.html`에 이식한 후 처음 배포할 때 사용.

## 변경/추가된 파일

| 파일 | 크기 | 역할 |
|---|---|---|
| `teambuilder.html` | 15KB | Agent Studio 룩(로비 + 스튜디오 쉘) |
| `teambuilder.css` | 86KB | 어두운 무드 + Pretendard 폰트 |
| `teambuilder.js` | 53KB | 핫스팟·파이프라인·브리프·이벤트 로그 로직 |
| `teambuilder-shim.js` | 13KB | `/api/*` fetch 인터셉트 + 새싹매치 토큰 결제 |
| `videos/lobby-bg.mp4` | 594KB | 로비 영상 루프 (해변/우드톤) |
| `videos/saessak-platform.mp4` | 1.3MB | 새싹매치 스튜디오 영상 루프 |
| `index.html` | 변경 | 팀빌더 링크에 `?studio=saessak-match&embed=1` 추가 |

기존 `teambuilder.html` (892줄)은 `backup/v3-pre-teambuilder-rewrite/`에 보존.

## 새싹매치 토큰 결합

`teambuilder-shim.js`가 다음 비용으로 토큰 차감 (관리자는 자동 무제한):

- 에이전트 디스패치: **5 토큰**
- Codex×Claude 회의: **10 토큰**

차감 로직은 `localStorage["saessak.user"]`의 `tokens` 필드를 직접 수정.
`rbshbomber@gmail.com` 또는 `role === "admin"`이면 무제한.

## 등록된 에이전트 (CLAUDE.md 기준)

| ID | 이름 | 역할 |
|---|---|---|
| `director` | Director | 작업 총괄 — 한 줄 요청을 적합 에이전트에게 위임 |
| `frontend` | Frontend | saessak-frontend — HTML/CSS/JS |
| `api` | API | saessak-api — Vercel 서버리스 |
| `deploy` | Deploy | saessak-deploy — git push → Vercel |
| `doc-writer` | Doc Writer | docx/xlsx/pptx 산출물 |
| `research` | 지원사업 리서치 | K-Startup·중기부·지자체 공고 조사 |

## 진입 URL

```
/teambuilder.html?studio=saessak-match&embed=1&source=saessak
```

쿼리 파라미터:
- `studio=saessak-match` → 로비 건너뛰고 바로 스튜디오 진입
- `embed=1` → 임베드 모드 (뒤로 버튼 = "← 새싹매치")
- `source=saessak` → 향후 분석용

## 배포 명령

```bash
cd ~/Documents/Claude/Projects/청년창업\ 강화도

# /tmp/saessak-deploy 처음이면
[ ! -d /tmp/saessak-deploy ] && \
  git clone https://github.com/rbshbomber-bit/saessak-platform.git /tmp/saessak-deploy

# 파일 동기화 (.git/backup/zip 제외)
rsync -av --delete \
  --exclude='.git' --exclude='backup' \
  --exclude='새싹지원사업_*' --exclude='zivjNyM6' \
  --exclude='.DS_Store' --exclude='agents' \
  --exclude='M4_SETUP.md' --exclude='AGENT_TASKS_POOL.md' \
  ./ /tmp/saessak-deploy/

cd /tmp/saessak-deploy && \
  git add . && \
  git -c user.name="Saessak Bot" -c user.email="rbshbomber@gmail.com" \
      commit -m "AI 팀 스튜디오 — Agent Studio 룩 이식 + 토큰 통합" && \
  git push origin main
```

Vercel 자동 빌드 30~60초.

## 알려진 한계 (다음 세션)

1. `/api/dispatch` 응답이 즉시 반환만 — 이벤트 로그는 localStorage 기반 (서버 events.jsonl 아님)
2. 산출물(`/api/outputs/*`)은 빈 응답 — 별도 파일 저장 미구현
3. `/api/studios` POST는 501 (스튜디오 생성 비활성)
4. `/api/pricing` 정적 — 실제 결제는 토스페이먼츠 연동 대기 중

다음 단계로 `/api/dispatch`를 Vercel 서버리스 함수로 실재 구현하면 됨.
