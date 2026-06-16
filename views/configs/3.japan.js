registerView('odori', createRhythmView({

  tickCount:   8,
  tickStart:   408,
  tickSpacing: 90,
  beatMs:      500,

  rowTopStart:    380,
  rowGap:         24,
  rowCount:       12,
  eraseTop:       373,
  eraseCoverTop:  335,
  eraseSize:      370,
  eraseCoverSize: 370,

  beatPattern: [3, 1, 3, 1, 3, 1, 3, 1],

  /* 행별 Y좌표 — 규칙에 따라 줄간격이 다름
     규칙1(1자/박, 첫줄8 이후4): 40pt 간격
     규칙2(1자/박, 4음절): 30pt 간격
     규칙3(2자/박, 4음절): 23pt 간격 */
  getWordTop(row) {
    const tops = [380, 420, 450, 480, 510, 540, 563, 586, 609, 632, 655, 678];
    return tops[row] ?? 380;
  },

  staggerRows: true, /* 짝수행(0-indexed odd)의 글자를 반박 뒤로 엇갈리게 배치 */

  /* 96개 더미 → postProcessEvents에서 실제 가사로 교체 */
  words: Array(96).fill('_'),

  postProcessEvents(events) {
    const w = [
      // 문장1 — 규칙1 (1자/박)
      '君','が','い','た','夏','は','遠','い',       // row 0: 8박
      '夢','の','中', null,                          // row 1: 3자 + 1빈박
      // 문장2 — 규칙2 (1자/박, 4음절씩)
      '空','に','消','え',                           // row 2
      'て','っ','た','打',                           // row 3
      'ち','上','げ','花',                           // row 4
      '火', null, null, null,                        // row 5: 1자 + 3빈박
      // 문장3+4 — 규칙3 (2자/박 = halfSplit)
      '君が','いた',                                 // row 6
      '夏は','遠い',                                 // row 7
      '夢の','中空',                                 // row 8
      'に消','えて',                                 // row 9
      'った','打ち',                                 // row 10
      '上げ','花火',                                 // row 11
    ];
    const active = [8, 4, 4, 4, 4, 4, 2, 2, 2, 2, 2, 2];
    const halfSplitRows = new Set([6, 7, 8, 9, 10, 11]); // 규칙3 행
    let wi = 0;
    for (const ev of events) {
      if (ev.col < (active[ev.row] || 0) && wi < w.length) {
        const word = w[wi++];
        if (word !== null) {
          ev.word = word;
          if (halfSplitRows.has(ev.row)) ev.halfSplit = true;
        } else {
          ev.word = null;
          ev.style = 0;
        }
      } else {
        ev.word = null;
        ev.style = 0;
      }
    }
  },

  doubleWeakEnabled: false,

  getWordStyle(style) {
    const base = `position:absolute;color:#000;font-family:"Hiragino Mincho ProN","Noto Serif JP",serif;
      font-size:18px;font-style:normal;line-height:normal;
      white-space:nowrap;cursor:ew-resize;user-select:none;`;
    if (style === 3) return base + 'font-weight:600;'; // W6
    if (style === 1) return base + 'font-weight:300;'; // W3
    return base;
  },

  audioPath: 'audio/3.japan/',
  soundDefs: {
    '3': { variants: 1 },
  },
  getAudioKey(col, style) { return { soundKey: '3', variant: 1 }; },

  colKeyMap: {
    'Digit1':0,'Digit2':1,'Digit3':2,'Digit4':3,
    'Digit5':4,'Digit6':5,'Digit7':6,'Digit8':7,
  },

  labelTitle:    'Matsuri',
  labelSubtitle: 'Hayasi',

  translateLineHeight: 17,
  translateLeft: 408,
  translateLines: [
    "네가 있던 여름은 먼 꿈 속",
    "하늘에 쏘아올린 불꽃",
    "네가 있던 여름은 먼 꿈 속",
    "하늘에 쏘아올린 불꽃",
  ],

  getHTML() {
    return `
      <div class="screen odori-view" id="screen">
        <svg style="position:absolute;top:0;left:0;width:1920px;height:1080px;pointer-events:none;overflow:visible;" id="ruler-svg"></svg>
        <div class="lyrics-block-odori">
          <p>君がいた夏は 遠い夢の中</p>
          <p>空に消えてった打ち上げ花火</p>
          <p>君がいた夏は 遠い夢の中</p>
          <p>空に消えてった打ち上げ花火</p>
        </div>
      </div>`;
  },
}));