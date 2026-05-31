/*!
 * 새싹매치 — 사업자 정보 표시 보조 스크립트
 * 결제 정식 오픈 전까지는 미검증 사업자 세부정보를 만들지 않고,
 * footer의 사업자 정보 영역을 조용히 준비 상태로 유지한다.
 */
(function () {
  const block = document.getElementById("biz-info-block");
  if (!block || block.dataset.ready === "1") return;
  block.dataset.ready = "1";
  block.innerHTML = `
    <div style="margin-top:12px;color:var(--ink-3);font-size:11px;line-height:1.7;">
      사업자 정보·통신판매업 신고 정보는 유료 결제 정식 오픈 전 최신 등록 정보 기준으로 표시됩니다.
    </div>
  `;
})();
