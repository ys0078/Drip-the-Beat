/* ═══════════════════════════════════════════════
   views/configs/teental.js — Tala / Teental 설정
   ═══════════════════════════════════════════════ */
registerView('tala', createRhythmView({

  /* ── 그리드 ── */
  tickCount:   16,
  tickStart:   408,
  tickSpacing: 45,
  beatMs:      500,

  /* ── 레이아웃 ── */
  rowTopStart:    372,
  rowGap:         26,
  rowHeight:      60,   /* 두 줄 레이아웃: style3 top + style1/2 bottom */
  rowCount:       4,
  eraseTop:       344,
  eraseCoverTop:  350,
  eraseSize:      280,
  eraseCoverSize: 280,

  /* ── 박자 패턴 ── */
  beatPattern: [3, 2, 2, 3, 3, 2, 2, 3, 3, 1, 1, 2, 2, 1, 1, 3],

  /* ── 가사 ── */
  words: "दर्द बनके जो मेरे दिल में रहा ढल ना सका जादू बनके तेरी आँखों में रुका चल ना सका दर्द बनके जो मेरे दिल में रहा ढल ना सका जादू बनके तेरी आँखों में रुका चल ना सका आज लाया हूँ वही गीत मैं तेरे लिये जलते हैं जिसके लिये"
    .split(' ').filter(w => w.length > 0),

  /* ── 한글 번역 (기존 translate-text와 동일한 줄바꿈, beatPattern으로 스타일링) ── */
  translateTop: 861,
  translateLineHeight: 17,
  translateLeft: 408,
  translateLines: [
    "내 가슴속에 고통으로 남아 사라지지 않던 것 그대 눈속에 마법처럼 머물러 움직이지 않던 것",
    "내 가슴속에 고통으로 남아 사라지지 않던 것 그대 눈속에 마법처럼 머물러 움직이지 않던 것",
    "오늘 오직 그대만을 위한 그 노래를 가져왔노라",
    "그것을 위해 타오르는",
  ],


  /* ── 이벤트 후처리: 마지막 실제 박 → style 2 ── */
  postProcessEvents(events) {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].style !== 0) { events[i].style = 2; break; }
    }
  },

  /* ── 두 줄 레이아웃: style 3 → 위, style 1/2 → 아래 ── */
  getWordTop(row, style) {
    const ROW_HEIGHT = 60, ROW_GAP = 30;
    return style === 3
      ? 372 + row * ROW_HEIGHT
      : 372 + row * ROW_HEIGHT + ROW_GAP;
  },

  /* ── 단어 CSS ── */
  getWordStyle(style) {
    const base = `position:absolute;color:#000;
      font-family:"October Devanagari","Noto Serif Devanagari",serif;
      font-size:18px;font-style:normal;line-height:30px;
      white-space:nowrap;cursor:ew-resize;user-select:none;`;
    return base + (style === 3 ? 'font-weight:700;' : 'font-weight:400;');
  },

  /* ── DOUBLE_WEAK 비활성화: 탈라는 1박자 전부 소리냄 ── */
  doubleWeakEnabled: false,

  /* ── 오디오 ── */
  audioPath: 'audio/2.tala/',
  soundDefs: {
    '3': { variants: 1 },
    '2': { variants: 2 },
    '1': { variants: 1 },  /* 11_1 → 1.wav */
    '0': { variants: 1 },
  },

  /* 파일명: 기본 포맷 {key}_{variant}.wav 사용 */

  getAudioKey(col, style) {
    if (style === 1) return { soundKey: '1', variant: 1 };
    if (style === 2) {
      const variant = Math.floor(col / 4) >= 2 ? 2 : 1;
      return { soundKey: '2', variant };
    }
    return { soundKey: String(style), variant: 1 };
  },

  /* set 종료 style 3 (col 3,7,15) → 0.5박 후 "0" sound */
  extraOnBeat(col, style, beatAudioTime, playRawSound) {
    if (style === 3 && (col === 3 || col === 7 || col === 15)) {
      playRawSound('0', 1, beatAudioTime + 0.25); /* BEAT_MS*0.5 = 0.25s */
    }
  },

  /* ── 키보드 col 매핑 (16박 → Q/W/E/R 추가) ── */
  colKeyMap: {
    'Digit1':0,'Digit2':1,'Digit3':2,'Digit4':3,
    'Digit5':4,'Digit6':5,'Digit7':6,'Digit8':7,
    'Digit9':8,'Digit0':9,'Minus':10,'Equal':11,
    /* 'KeyQ':12,'KeyW':13,'KeyE':14,'KeyR':15 — 아두이노 납땜 후 활성화 */
  },

  /* ── DOM 템플릿 ── */
  labelTitle:    'Tala',
  labelSubtitle: 'Teental',

  getHTML() {
    return `
      <div class="screen tala-view" id="screen">
        <svg style="position:absolute;top:0;left:0;width:1920px;height:1080px;pointer-events:none;overflow:visible;" id="ruler-svg"></svg>
        <div class="lyrics-block-tala">
          <p>दर्द बनके जो मेरे दिल में रहा ढल ना सका</p>
          <p>जादू बनके तेरी आँखों में रुका चल ना सका</p>
          <p>दर्द बनके जो मेरे दिल में रहा ढल ना सका</p>
          <p>जादू बनके तेरी आँखों में रुका चल ना सका</p>
          <p>आज लाया हूँ वही गीत मैं तेरे लिये</p>
          <p>जलते हैं जिसके लिये</p>
        </div>
        <div class="translate-line" style="top:929px;"></div>
        <div class="translate-line" style="top:912px;"></div>
        <div class="translate-line" style="top:895px;"></div>
        <div class="translate-line" style="top:878px;"></div>
        <div class="translate-line" style="top:861px;"></div>
        <div class="translate-text" style="top:861px;">내 가슴속에 고통으로 남아 사라지지 않던 것, 그대 눈속에 마법처럼 머물러 움직이지 않던 것</div>
        <div class="translate-text" style="top:878px;">내 가슴속에 고통으로 남아 사라지지 않던 것, 그대 눈속에 마법처럼 머물러 움직이지 않던 것</div>
        <div class="translate-text" style="top:895px;">오늘 오직 그대만을 위한 그 노래를 가져왔노라</div>
        <div class="translate-text" style="top:912px;">그것을 위해 타오르는</div>
      </div>`;
  },

}));