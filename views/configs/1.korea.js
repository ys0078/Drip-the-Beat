/* ═══════════════════════════════════════════════
   views/configs/jangdan.js — 장단 / 굿거리 설정
   ═══════════════════════════════════════════════ */
registerView('main', createRhythmView({

  /* ── 그리드 ── */
  tickCount:   12,
  tickStart:   408,
  tickSpacing: 105,
  beatMs:      500,

  /* ── 레이아웃 ── */
  rowTopStart:    437,
  rowGap:         26,
  rowCount:       5,
  eraseTop:       430,
  eraseCoverTop:  385,
  eraseSize:      200,
  eraseCoverSize: 257,

  /* ── 박자 패턴 ── */
  beatPattern: [3, 0, 2, 3, 1, 1, 3, 0, 2, 3, 1, 1],

  /* ── 가사 ── */
  words: (function() {
    const S = [
      "에헤 에헤 아미 타하 아허야 불이로다",
      "서산 낙조에 떨어지는 해는 내일 아침이면은",
      "다시 돋견마는 황천 길은 얼마나 먼지 한번 가면은 영절이라",
      "에헤 에헤 아미 타하 아허야 불이로다",
      "서산 명월이 다 넘어가구 벽수비풍은",
      "슬슬 부는데 새벽 종다리 우지짖는 소리 아니나든 심정이 절로난다",
      "에헤 에헤 아미 타하 아허야 불이로다"
    ];
    return S.join(' ').split(' ').reduce((acc, w, i, arr) => {
      if (w === '아미' && arr[i+1] === '타하') acc.push('아미 타하');
      else if (w === '타하' && arr[i-1] === '아미') { /* skip */ }
      else acc.push(w);
      return acc;
    }, []);
  })(),

  /* ── 이벤트 후처리: 마지막 박 → style 2 ── */
  postProcessEvents(events) {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].style !== 0) { events[i].style = 2; break; }
    }
  },

  /* ── 단어 CSS ── */
  getWordStyle(style) {
    const base = `position:absolute;color:#000;font-family:"Noto Serif KR",serif;
      font-size:18px;font-style:normal;line-height:normal;
      white-space:nowrap;cursor:ew-resize;user-select:none;`;
    if (style === 3) return base + 'font-weight:800;';
    if (style === 2) return base + 'font-weight:500;';
    if (style === 1) return base + 'font-weight:500;letter-spacing:11px;';
    return base;
  },

  /* ── 오디오 ── */
  audioPath: 'audio/1.jangdan_3/',
  soundDefs: {
    '3':  { variants: 2 },
    '2':  { variants: 1 },
    '11': { variants: 1 },
  },

  getAudioKey(col, style, doubleWeakFirst) {
    if (doubleWeakFirst.has(col) && style === 1) return { soundKey: '11', variant: 1 };
    if (style === 3) return { soundKey: '3', variant: col % 6 === 0 ? 1 : 2 };
    return { soundKey: String(style), variant: 1 };
  },

  /* ── 키보드 col 매핑 ── */
  colKeyMap: {
    'Digit1':0,'Digit2':1,'Digit3':2,'Digit4':3,
    'Digit5':4,'Digit6':5,'Digit7':6,'Digit8':7,
    'Digit9':8,'Digit0':9,'Minus':10,'Equal':11,
  },

  labelTitle:    'Jangdan',
  labelSubtitle: 'Gutgeori',

  /* ── DOM 템플릿 ── */
  getHTML() {
    return `
      <div class="screen main-view" id="screen">
        <svg style="position:absolute;top:0;left:0;width:1920px;height:1080px;pointer-events:none;overflow:visible;" id="ruler-svg"></svg>
        <div class="lyrics-block">
          <p>에헤 에헤 아미 타하 아허야 불이로다</p>
          <p>서산 낙조에 떨어지는 해는 내일 아침이면은</p>
          <p>다시 돋견마는 황천 길은 얼마나 먼지 한번 가면은 영절이라</p>
          <p>에헤 에헤 아미 타하 아허야 불이로다</p>
          <p>서산 명월이 다 넘어가구 벽수비풍은</p>
          <p>슬슬 부는데 새벽 종다리 우지짖는 소리 아니나든 심정이 절로난다</p>
          <p>에헤 에헤 아미 타하 아허야 불이로다</p>
        </div>
        <div class="translate-line" style="top:929px;"></div>
        <div class="translate-line" style="top:911px;"></div>
        <div class="translate-line" style="top:893px;"></div>
      </div>`;
  },

}));