// 새싹지원사업 — 클라이언트 사이드 .docx 생성 모듈
// docx-js (CDN) 사용 — 사업계획서/비교/시뮬레이션/슬라이드 등 모든 AI 결과를 워드 파일로 다운로드
// 사용법: window.saessak.downloadDocx({ title, sections })

(function () {
  window.saessak = window.saessak || {};

  // docx 라이브러리 동적 로딩
  let docxLoaded = false;
  let docxLoadPromise = null;

  function loadDocxLib() {
    if (docxLoaded) return Promise.resolve();
    if (docxLoadPromise) return docxLoadPromise;
    docxLoadPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.min.js';
      s.onload = () => { docxLoaded = true; resolve(); };
      s.onerror = (e) => reject(new Error('docx 라이브러리 로딩 실패'));
      document.head.appendChild(s);
    });
    return docxLoadPromise;
  }

  /**
   * .docx 파일 생성 + 다운로드
   * @param {object} opts
   *   opts.title: 문서 제목
   *   opts.subtitle: 부제목 (선택)
   *   opts.author: 작성자 (선택, 기본 "변승환")
   *   opts.sections: [{ heading, content }] 또는 [{ heading, items: [...] }]
   *   opts.filename: 다운로드 파일명 (선택, 확장자 자동)
   *   opts.footerNote: 푸터에 들어갈 면책 문구 (선택)
   */
  window.saessak.downloadDocx = async function (opts) {
    await loadDocxLib();
    const D = window.docx;
    if (!D) throw new Error('docx 라이브러리를 사용할 수 없습니다.');

    const {
      Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
      Header, Footer, PageBreak, LevelFormat
    } = D;

    const sections = opts.sections || [];
    const children = [];

    // 표지: 제목
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 240 },
      children: [new TextRun({ text: '새싹지원사업', size: 24, color: '5C7A5A', bold: true })]
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: opts.title || '문서', size: 48, color: '14181F', bold: true })]
    }));
    if (opts.subtitle) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({ text: opts.subtitle, size: 24, color: '3A4250' })]
      }));
    }
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({
        text: `작성자: ${opts.author || '변승환'} · 생성일: ${new Date().toLocaleDateString('ko-KR')}`,
        size: 20, color: '6C7280'
      })]
    }));
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [new TextRun({
        text: '※ 본 문서는 새싹지원사업 AI 보조 도구로 작성된 초안입니다. 본인 검수 및 차별화된 본인 데이터 추가가 필수입니다.',
        size: 18, color: 'B45309', italics: true
      })]
    }));
    children.push(new Paragraph({ children: [new PageBreak()] }));

    // 본문 섹션들
    sections.forEach((sec, idx) => {
      if (sec.heading) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 360, after: 180 },
          children: [new TextRun({ text: sec.heading, bold: true, size: 32, color: '14181F' })]
        }));
      }
      if (sec.subheading) {
        children.push(new Paragraph({
          spacing: { before: 120, after: 80 },
          children: [new TextRun({ text: sec.subheading, bold: true, size: 24, color: '5C7A5A' })]
        }));
      }
      if (sec.content) {
        // 줄바꿈 단위로 문단 분할
        const paragraphs = String(sec.content).split(/\n+/).filter(p => p.trim());
        paragraphs.forEach(p => {
          children.push(new Paragraph({
            spacing: { before: 60, after: 60, line: 340 },
            children: [new TextRun({ text: p.trim(), size: 22 })]
          }));
        });
      }
      if (Array.isArray(sec.items)) {
        sec.items.forEach(it => {
          children.push(new Paragraph({
            numbering: { reference: 'bullets', level: 0 },
            spacing: { before: 40, after: 40, line: 320 },
            children: [new TextRun({ text: typeof it === 'string' ? it : (it.text || JSON.stringify(it)), size: 22 })]
          }));
        });
      }
      if (Array.isArray(sec.bullets)) {
        sec.bullets.forEach(b => {
          children.push(new Paragraph({
            numbering: { reference: 'bullets', level: 0 },
            spacing: { before: 40, after: 40, line: 320 },
            children: [new TextRun({ text: b, size: 22 })]
          }));
        });
      }
    });

    // 푸터 면책
    children.push(new Paragraph({
      spacing: { before: 600 },
      alignment: AlignmentType.CENTER,
      children: [new TextRun({
        text: opts.footerNote ||
          '🤖 AI 보조 결과물 · 본인 검수·차별화 데이터 추가 필수 · 합격 보장 없음 · 새싹지원사업 (saessak-platform.vercel.app)',
        size: 16, color: '6C7280', italics: true
      })]
    }));

    const doc = new Document({
      creator: opts.author || '변승환',
      title: opts.title || '문서',
      styles: {
        default: { document: { run: { font: '맑은 고딕', size: 22 } } },
        paragraphStyles: [
          { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
            run: { size: 32, bold: true, color: '14181F' },
            paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 } }
        ]
      },
      numbering: {
        config: [
          { reference: 'bullets',
            levels: [{
              level: 0, format: LevelFormat.BULLET, text: '•',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } }
            }] }
        ]
      },
      sections: [{
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        children
      }]
    });

    const blob = await Packer.toBlob(doc);
    const filename = (opts.filename || (opts.title || '문서').replace(/[^\w가-힣A-Za-z0-9_-]/g, '_')) + '.docx';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (!opts.skipHistory && window.saessak?.saveHistory) {
      window.saessak.saveHistory({
        kind: 'docx',
        title: opts.title || filename,
        target: opts.target || opts.subtitle || '',
        input: '',
        output: {
          filename,
          title: opts.title || '문서',
          subtitle: opts.subtitle || '',
          sections,
          footerNote: opts.footerNote || '',
        },
        meta: {
          filename,
          sourceKind: opts.sourceKind || '',
          sourceTitle: opts.sourceTitle || opts.title || '',
          downloadedAt: new Date().toISOString(),
          sectionCount: sections.length,
        }
      });
    }
  };
})();
