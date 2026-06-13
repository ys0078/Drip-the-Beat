/* ═══════════════════════════════════════════════════════════════
   views/rhythm.js — 공유 리듬 엔진
   사용법: createRhythmView(cfg) 를 호출해 뷰 객체 생성

   cfg 필수 항목:
     tickCount      : 박자 수 (12, 16 …)
     tickStart      : 첫 tick x (px)
     tickSpacing    : tick 간격 (px)
     beatMs         : 박자 길이 (ms)
     beatPattern    : 스타일 배열  e.g. [3,0,2,3,1,1,…]
     rowTopStart    : 가사 첫 줄 top (px)
     rowGap         : 줄 간격 (px)
     rowCount       : 행 수 (numHandles 생성용)
     words          : 단어 배열 (Array<string>)
     audioPath      : 오디오 경로  e.g. 'audio/1.jangdan_3/'
     soundDefs      : { 'key': {variants:N}, … }
     getWordStyle(style)  → CSS 문자열
     getAudioKey(col, style, doubleWeakFirst) → {soundKey, variant}
     colKeyMap      : {keyCode: colIndex}
     getHTML()      → DOM 문자열

   cfg 선택 항목:
     eraseTop / eraseCoverTop / eraseSize / eraseCoverSize
     rulerFont      : ruler 숫자 font-family
     postProcessEvents(events)   — 이벤트 후처리 훅
     applyDynamicStyle(el, baseStyle, t) — 동적 스타일 오버라이드
     getWordTop(row, style)      — 두 줄 레이아웃 등 top 오버라이드
     extraOnBeat(col, style, beatAudioTime, playRawSound) — 추가 사운드 훅
═══════════════════════════════════════════════════════════════ */
function createRhythmView(cfg) {

  /* ── 파생 상수 ── */
  let TICK_XS  = Array.from({length: cfg.tickCount}, (_, i) => cfg.tickStart + i * cfg.tickSpacing);
  const TB_LEFT  = cfg.tickStart;          /* 첫 tick x — 항상 고정 */
  let   TB_RIGHT = TICK_XS[cfg.tickCount - 1];
  let   TB_W     = TB_RIGHT - TB_LEFT;
  const N_COLS   = cfg.tickCount;

  const BEAT_PATTERN  = cfg.beatPattern;
  const BEAT_MS       = cfg.beatMs;

  /* ── 공통 물리 상수 ── */
  const LINE_START_X   = -10, LINE_END_X = 1960, ERASE_DUR = 2000;
  const COL_DOT_Y      = 1015;
  const LINE_EXT_H     = 1100;
  const LINE_EXT_DUR   = 400;
  const DRAG_FULL_PX   = 80;
  const SYNC_RATIO     = 0.7;
  /* getNumBaseX(): 뷰포트 우측 끝 -25px를 canvas 좌표로 환산
     currentScale이 바뀌어도 항상 오른쪽 끝에 위치 */
  function getNumBaseX() {
    if (!currentScale) return 1900;
    return Math.round((window.innerWidth - 50) / (2 * currentScale) + 960);
  }
  /* COL_MOVE_STEP: 현재 spacing에 따라 동적 계산 → tickSpacingCurrent/2 사용 */
  const ROW_MOVE_STEP  = 10;
  const VOL_STEP       = 12.5;
  const VOL_CLICKS_PER_LEVEL = 2;
  const VOL_LEVEL_MIN  = -2, VOL_LEVEL_MAX = 2;
  const VOL_LEVEL_GAIN = {'-2':0.1,'-1':0.35,'0':1.0,'1':1.4,'2':1.8};
  const SPD_STEP       = 0.1, SPD_MIN = 0.25, SPD_MAX = 3.0;
  /* 간격 애니메이션 상수 */
  const TICK_LERP = 0.12;
  const TICK_STEP = cfg.tickSpacing / 10;         /* 한 마디의 1/10 — 세밀한 조정 */
  const TICK_MIN  = cfg.tickSpacing * 0.2;
  const TICK_MAX  = cfg.tickSpacing * 4.0;
  /* ruler 위치 상수 */
  const RULER_TOP    = 85;
  const RULER_NUM_Y  = 70;
  const RULER_HEIGHT = Math.round(27 * 3 / 4);        /* 27 * 0.75 = 20 */
  const RULER_BOTTOM = RULER_TOP + RULER_HEIGHT;      /* = 125 */

  /* ── 이벤트 배열 ── */
  function buildEvents() {
    const events = []; let wc = 0, beat = 0;
    while (wc < cfg.words.length) {
      const col = beat % N_COLS, row = Math.floor(beat / N_COLS);
      const style = BEAT_PATTERN[col];
      let word = null;
      if (style !== 0 && wc < cfg.words.length) {
        word = cfg.words[wc];
        wc++;
      }
      events.push({word, row, col, style}); beat++;
      if (wc >= cfg.words.length) break;
    }
    if (cfg.postProcessEvents) cfg.postProcessEvents(events);
    return events;
  }
  const EVENTS    = buildEvents();
  const TOTAL_DUR = EVENTS.length * BEAT_MS;

  /* ── 공통 유틸 ── */
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function styleBaseY(style) {
    if (style === 3) return COL_DOT_Y - 30;
    if (style === 2) return COL_DOT_Y;
    return COL_DOT_Y + 30;
  }

  function tickWidth(col) {
    return col < N_COLS - 1 ? TICK_XS[col+1] - TICK_XS[col] : 200;
  }

  /* 글자(wordEls)와 동일하게, ruler 좌표도 1920px 기준으로 좌측에서 다시 나타나도록 wrap */
  function wrapX(x) {
    return (((x % 1920) + 1920) % 1920);
  }

  /* ── 행(row)별 재생 순서: 각 박의 "시작점"(TICK_XS+beatDotOffsetX) 기준 좌→우 정렬
     선을 좌우로 옮겨 시작점이 옆 박을 넘어가면, 그 순서대로 연주/표시되도록 함.
     각 행이 처음 시작될 때 한 번 계산되어 캐시됨(연주 중 실시간으로 순서가
     바뀌면 혼란스러우므로, 해당 행 진입 시점의 위치를 기준으로 고정). ── */
  /* 해당 줄(row)에서 그 박의 글자가 실제로 표시되는 시작 x좌표.
     wordLoop의 xOff = beatDotOffsetX[col]*wordTop/COL_DOT_Y 와 동일한 식. */
  function effectiveX(col, row) {
    if (MERGED_INTO.has(col)) {
      const first = MERGED_INTO.get(col);
      return effectiveX(first, row) + 0.001; /* 6/12박은 5/11박 바로 다음 위치 고정 */
    }
    const style = BEAT_PATTERN[col];
    const wordTop = cfg.getWordTop ? cfg.getWordTop(row, style) : cfg.rowTopStart + row*cfg.rowGap;
    const xOff = (beatDotOffsetX[col] || 0) * wordTop / COL_DOT_Y;
    return TICK_XS[col] + xOff;
  }

  function getColOrder(row) {
    if (colOrderCache[row]) return colOrderCache[row];
    const cols = [];
    for (let c = 0; c < N_COLS; c++) if (row*N_COLS + c < EVENTS.length) cols.push(c);
    cols.sort((a,b) => effectiveX(a,row) - effectiveX(b,row));
    colOrderCache[row] = cols;
    return cols;
  }

  /* idx(순차 재생 인덱스) → 위치 기준으로 재정렬된 EVENTS 항목 */
  function getEvent(idx) {
    const row = Math.floor(idx / N_COLS);
    const posInRow = idx % N_COLS;
    const order = getColOrder(row);
    const col = order[posInRow];
    return EVENTS[row*N_COLS + col];
  }

  /* cfg에 없으면 기본 동적 스타일 사용 */
  const _applyDynamic = cfg.applyDynamicStyle || function(el, baseStyle, t) {
    t = Math.max(-1, Math.min(1, t));
    let weight, spacing;
    if (baseStyle === 3) {
      weight = t >= 0 ? 800 : 800 + (500-800)*(-t); spacing = 0;
    } else if (baseStyle === 2) {
      const tn = t*(80/50);
      if (t >= 0) { weight = 500+300*Math.min(tn,1); spacing = 0; }
      else        { weight = 500; spacing = 11*Math.min(-tn,1); }
    } else if (baseStyle === 1) {
      if (t >= 0) { weight = 500+300*t; spacing = 11*(1-t); }
      else        { weight = 500; spacing = 11; }
    } else return;
    el.style.fontWeight    = Math.round(weight/100)*100;
    el.style.letterSpacing = spacing > 0.1 ? spacing+'px' : '';
  };

  /* ── DOUBLE_WEAK 감지 (연속 약박 → 쌍 처리)
     cfg.doubleWeakEnabled = false 이면 비활성화 ── */
  const DOUBLE_WEAK_FIRST = new Set();
  const DOUBLE_WEAK_SKIP  = new Set();
  const MERGED_INTO = new Map();  /* secondCol → firstCol : 시각적으로 병합되는 박 (글자/선 상호작용 없음) */
  if (cfg.doubleWeakEnabled !== false) {
    const ones = BEAT_PATTERN.map((s,i) => s===1 ? i : -1).filter(i => i>=0);
    for (let i = 0; i < ones.length; i += 2) {
      DOUBLE_WEAK_FIRST.add(ones[i]);
      if (ones[i+1] !== undefined) { DOUBLE_WEAK_SKIP.add(ones[i+1]); MERGED_INTO.set(ones[i+1], ones[i]); }
    }
  }

  /* ══════════════════════════════
     오디오 시스템
  ══════════════════════════════ */
  let audioCtx      = null;
  const rawBuffers  = {};
  const audioBufs   = {};
  const LOOKAHEAD   = 0.01;
  const SCHED_AHEAD = 500;
  let schedNextIdx  = 0;
  const scheduledSet = new Set();
  let audioOrigin   = 0;

  function preloadRaw() {
    Object.entries(cfg.soundDefs).forEach(([key, {variants}]) => {
      rawBuffers[key] = {};
      for (let v = 1; v <= variants; v++) {
        rawBuffers[key][v] = null;
        const name = cfg.soundFileName ? cfg.soundFileName(key, v) : `${key}_${v}.wav`;
        fetch(`${cfg.audioPath}${name}`)
          .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then(arr => { rawBuffers[key][v] = arr; })
          .catch(e => console.warn('[audio] preload failed:', key, v, e));
      }
    });
  }

  async function initAudio() {
    if (audioCtx) { if (audioCtx.state === 'suspended') await audioCtx.resume(); return; }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    await Promise.all(Object.entries(cfg.soundDefs).map(async ([key, {variants}]) => {
      audioBufs[key] = {};
      for (let v = 1; v <= variants; v++) {
        const arr = rawBuffers[key]?.[v];
        if (!arr) { console.warn('[audio] not preloaded:', key, v); continue; }
        try { audioBufs[key][v] = await audioCtx.decodeAudioData(arr.slice(0)); }
        catch(e) { console.warn('[audio] decode failed:', key, v, e); }
      }
    }));
  }

  function _scheduleBuffer(buf, audioTime, gainVal) {
    if (!buf || !audioCtx) return;
    const startTime = Math.max(audioCtx.currentTime + 0.002, audioTime + LOOKAHEAD);
    const src = audioCtx.createBufferSource();
    const g   = audioCtx.createGain();
    src.buffer = buf; g.gain.value = gainVal;
    src.connect(g); g.connect(audioCtx.destination);
    src.start(startTime);
  }

  function playRawSound(soundKey, variant, audioTime, gainVal = 1.0) {
    _scheduleBuffer(audioBufs[soundKey]?.[variant], audioTime, gainVal);
  }

  function playBeat(col, style, beatAudioTime, splitN = 1) {
    if (!audioCtx || style === 0 || isMuted) return;
    if (DOUBLE_WEAK_SKIP.has(col)) return;

    const {soundKey, variant} = cfg.getAudioKey(col, style, DOUBLE_WEAK_FIRST);
    const buf = audioBufs[soundKey]?.[variant];
    if (!buf) { console.warn('[audio] missing buffer:', soundKey, variant); return; }

    const offsetSec = ((beatDotOffsetX[col] || 0) / (cfg.tickSpacing/2)) * (BEAT_MS/2/1000);
    const gain = VOL_LEVEL_GAIN[String(beatVolLevel[col] ?? 0)] ?? 1.0;

    const N = splitN;
    for (let s = 0; s < N; s++) {
      const subTime = beatAudioTime + s * (BEAT_MS / N / 1000);
      const startTime = Math.max(audioCtx.currentTime + 0.002, subTime + offsetSec + LOOKAHEAD);
      _scheduleBuffer(buf, startTime - LOOKAHEAD, gain);
    }

    if (cfg.extraOnBeat) cfg.extraOnBeat(col, style, beatAudioTime, playRawSound);
  }

  /* ══════════════════════════════
     뷰 상태 변수
  ══════════════════════════════ */
  let screenEl, appState, wordElapsed, wordStartTs, wordRafId, nextBeatIdx;
  let wordEls, timeBar, coverBox, playbackRate;
  let rowOffsets;
  let beatLineSvg, beatLineEls, beatDotEls, beatDotOffsetX, beatDotOffsetY;
  let colOrderCache; /* 행(row)별 재생 순서 — 박 위치(시작점) 기준 재정렬 캐시 */
  let beatVolLevel, beatVolAccum;
  let beatLineExtended, colLatestWordEl, colLatestWordInfo, colBaseY, lastSentRow, lastPlayedCol;
  let colDragCol, colDragStartMX, colDragStartMY, colDragStartOff, colDragStartOffY, dragAxis;
  let beatDotTargetX, beatDotTargetY, dotLerpRafId;
  let rulerLinesCollapsed, rulerResetOverlay;
  let numElsCreated, numHandles;
  let selectedCols, currentScale;
  let beatSplits, subBeatQueue, scheduledSplits, deletedBeats;
  let rulerTickLines, rulerDotCircles, rulerTexts;
  let rowDragging, rowDragIdx, rowDragStartX, rowDragStartOffset, rowDragStartNumX;
  let isMuted, roopEnabled;
  let tickSpacingCurrent, tickSpacingTarget, tickLerpRafId;
  let titleEl, subtitleEl, eraseRevealEl;
  let onKeyDown, onMouseMove, onMouseUp, onWheel, onResize;

  /* ══════════════════════════════
     MOUNT
  ══════════════════════════════ */
  function mount() {
    appState='idle'; wordElapsed=0; wordStartTs=null; wordRafId=null; nextBeatIdx=0;
    wordEls=[]; timeBar=null; coverBox=null; playbackRate=1; isMuted=false; roopEnabled=false;
    rowOffsets = Array(cfg.rowCount).fill(0);
    beatLineSvg=null; beatLineEls=[]; beatDotEls=[];
    beatDotOffsetX=Array(N_COLS).fill(0); beatDotOffsetY=Array(N_COLS).fill(0);
    beatVolLevel=Array(N_COLS).fill(0);   beatVolAccum=Array(N_COLS).fill(0);
    beatLineExtended=Array(N_COLS).fill(false); colLatestWordEl=Array(N_COLS).fill(null); colLatestWordInfo=Array(N_COLS).fill(null);
    colBaseY=Array(N_COLS).fill(COL_DOT_Y); lastSentRow=-1; lastPlayedCol=-1;
    beatSplits=Array(N_COLS).fill(1); subBeatQueue=[]; scheduledSplits={}; deletedBeats=new Set();
    colOrderCache={};
    colDragCol=-1; colDragStartMX=0; colDragStartMY=0;
    colDragStartOff=0; colDragStartOffY=0; dragAxis=null;
    beatDotTargetX=Array(N_COLS).fill(0); beatDotTargetY=Array(N_COLS).fill(0);
    dotLerpRafId=null;
    rulerLinesCollapsed=false; numElsCreated=false; numHandles=[];
    selectedCols=new Set(); currentScale=1;
    rulerTickLines=[]; rulerDotCircles=[]; rulerTexts=[];
    rowDragging=false; rowDragIdx=-1; rowDragStartX=0; rowDragStartOffset=0; rowDragStartNumX=0;
    schedNextIdx=0; scheduledSet.clear(); audioOrigin=0;
    tickSpacingCurrent=cfg.tickSpacing; tickSpacingTarget=cfg.tickSpacing; tickLerpRafId=null;
    /* TICK_XS 재초기화 */
    for (let i=0;i<N_COLS;i++) TICK_XS[i]=cfg.tickStart+i*cfg.tickSpacing;
    TB_RIGHT=TICK_XS[N_COLS-1]; TB_W=TB_RIGHT-TB_LEFT;

    document.getElementById('app').innerHTML = cfg.getHTML();
    screenEl = document.getElementById('screen');
    buildRuler();
    scaleScreen();

    rulerResetOverlay = document.createElement('div');
    rulerResetOverlay.style.cssText = `position:absolute;top:${RULER_TOP}px;left:${TB_LEFT}px;width:${TB_W}px;height:${RULER_HEIGHT}px;cursor:pointer;z-index:16;`;
    rulerResetOverlay.addEventListener('click', handleRulerClick);

    onResize    = scaleScreen;
    onKeyDown   = handleKeyDown;
    onMouseMove = handleMouseMove;
    onMouseUp   = handleMouseUp;
    onWheel     = handleWheel;

    window.addEventListener('resize',    onResize);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    window.addEventListener('wheel',     onWheel, {passive: false});

    preloadRaw();

    /* 제목/부제목: transform 영향 없는 body에 고정 */
    titleEl = null; subtitleEl = null;
    if (cfg.labelTitle) {
      titleEl = document.createElement('div');
      titleEl.style.cssText = `position:fixed;top:25px;left:25px;font-family:"Noto Serif KR",serif;font-weight:600;letter-spacing:-0.48px;white-space:nowrap;color:#000;z-index:100;`;
      titleEl.textContent = cfg.labelTitle;
      document.body.appendChild(titleEl);
    }
    if (cfg.labelSubtitle) {
      subtitleEl = document.createElement('div');
      subtitleEl.style.cssText = `position:fixed;top:25px;font-family:"Noto Serif KR",serif;font-weight:600;white-space:nowrap;color:#000;z-index:100;`;
      subtitleEl.textContent = ': ' + cfg.labelSubtitle;
      document.body.appendChild(subtitleEl);
    }
    scaleScreen();  /* 폰트 크기 즉시 적용 */
  }

  /* ══════════════════════════════
     UNMOUNT
  ══════════════════════════════ */
  function unmount() {
    if (wordRafId) { cancelAnimationFrame(wordRafId); wordRafId = null; }
    if (dotLerpRafId) { cancelAnimationFrame(dotLerpRafId); dotLerpRafId=null; }
    if (tickLerpRafId) { cancelAnimationFrame(tickLerpRafId); tickLerpRafId=null; }
    if (titleEl)    { titleEl.remove();    titleEl    = null; }
    if (subtitleEl) { subtitleEl.remove(); subtitleEl = null; }
    /* 메뉴 이동 시 즉시 오디오 정지 */
    if (audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(()=>{});
    window.removeEventListener('resize',    onResize);
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup',   onMouseUp);
    window.removeEventListener('wheel',     onWheel);
    document.getElementById('app').innerHTML = '';
  }

  /* ── Ruler ── */
  function buildRuler() {
    const svg = document.getElementById('ruler-svg');
    const NS  = 'http://www.w3.org/2000/svg';
    const font = cfg.rulerFont || '"Noto Serif KR",serif';
    for (let i = 0; i < N_COLS; i++) {
      const cx = wrapX(TICK_XS[i]);
      const txt = document.createElementNS(NS, 'text');
      txt.setAttribute('x', cx); txt.setAttribute('y', RULER_NUM_Y);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-family', font);
      txt.setAttribute('font-size', '12'); txt.setAttribute('font-weight', '600');
      txt.setAttribute('fill', '#000'); txt.textContent = i + 1;
      svg.appendChild(txt);
      rulerTexts.push(txt);
      const ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', cx); ln.setAttribute('y1', RULER_TOP);
      ln.setAttribute('x2', cx); ln.setAttribute('y2', RULER_BOTTOM);
      ln.setAttribute('stroke', '#000'); ln.setAttribute('stroke-width', '0.65');
      svg.appendChild(ln); rulerTickLines.push(ln);
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', cx); c.setAttribute('cy', '1015'); c.setAttribute('r', '6');
      c.setAttribute('fill', 'none'); c.setAttribute('stroke', '#000'); c.setAttribute('stroke-width', '0.65');
      svg.appendChild(c); rulerDotCircles.push(c);
    }
  }

  /* ── Scale ── */
  function scaleScreen() {
    if (!screenEl) return;
    currentScale = Math.min(window.innerWidth/1920, window.innerHeight/1080);
    screenEl.style.transform  = `scale(${currentScale})`;
    screenEl.style.marginLeft = `${(window.innerWidth  - 1920*currentScale)/2}px`;
    screenEl.style.marginTop  = `${(window.innerHeight - 1080*currentScale)/2}px`;
    const extraPx = (window.innerWidth - 1920*currentScale)/2 / currentScale;
    document.querySelectorAll('.rhythm-line').forEach(el => {
      el.style.left  = `${-extraPx}px`;
      el.style.width = `${180/currentScale + extraPx}px`;
    });
    document.querySelectorAll('.translate-line').forEach(el => {
      el.style.left  = `${-extraPx}px`;
      el.style.right = `${-extraPx}px`;
    });
    /* 제목/부제목 폰트 크기와 위치를 scale에 맞게 */
    if (titleEl) {
      titleEl.style.fontSize = (21 * currentScale) + 'px';
      titleEl.style.top      = (25 * currentScale) + 'px';
      titleEl.style.left     = (25 * currentScale) + 'px';
    }
    if (subtitleEl) {
      subtitleEl.style.fontSize = (16 * currentScale) + 'px';
      subtitleEl.style.top      = (25 * currentScale) + 'px';
      const titleRight = titleEl ? titleEl.getBoundingClientRect().right : (25 * currentScale);
      subtitleEl.style.left = (titleRight + 10 * currentScale) + 'px';
    }
    /* numHandle 위치: 창 크기 바뀌면 우측 끝 기준으로 재조정 */
    if (numHandles && numHandles.length) {
      const newBase = getNumBaseX();
      numHandles.forEach(h => {
        h.currentX = newBase;
        h.el.style.left = newBase + 'px';
      });
    }
  }

  /* ── Beat Lines ── */
  function initBeatLines() {
    const NS = 'http://www.w3.org/2000/svg';
    lastSentRow=-1; lastPlayedCol=-1; selectedCols=new Set();
    beatDotOffsetX.fill(0); beatDotOffsetY.fill(0);
    beatVolLevel.fill(0);   beatVolAccum.fill(0);
    beatDotTargetX.fill(0); beatDotTargetY.fill(0);
    beatSplits.fill(1); subBeatQueue=[]; scheduledSplits={}; deletedBeats=new Set();
    colOrderCache={};
    if (dotLerpRafId) { cancelAnimationFrame(dotLerpRafId); dotLerpRafId=null; }
    colLatestWordEl.fill(null); colLatestWordInfo.fill(null); colBaseY.fill(COL_DOT_Y);
    if (beatLineSvg) {
      beatLineSvg.innerHTML = '';
    } else {
      rulerTickLines.forEach(el => el.remove());
      rulerDotCircles.forEach(el => el.remove());
      beatLineSvg = document.createElementNS(NS, 'svg');
      beatLineSvg.style.cssText = `position:absolute;top:0;left:0;width:1920px;height:1200px;pointer-events:none;overflow:visible;z-index:15;`;
      screenEl.appendChild(beatLineSvg);
    }
    beatLineEls = []; beatDotEls = [];
    beatLineExtended.fill(false);
    for (let i = 0; i < N_COLS; i++) {
      const x = wrapX(TICK_XS[i]);
      const ln = document.createElementNS(NS, 'line');
      ln.setAttribute('x1', x); ln.setAttribute('y1', RULER_TOP);
      ln.setAttribute('x2', x); ln.setAttribute('y2', RULER_BOTTOM);
      ln.setAttribute('stroke', '#000'); ln.setAttribute('stroke-width', '0.65');
      beatLineSvg.appendChild(ln); beatLineEls.push(ln);
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', x); dot.setAttribute('cy', COL_DOT_Y);
      dot.setAttribute('r', 6); dot.setAttribute('fill', 'none');
      dot.setAttribute('stroke', '#000'); dot.setAttribute('stroke-width', '0.65');
      const isMergedSecond = MERGED_INTO.has(i);
      dot.style.pointerEvents = isMergedSecond ? 'none' : 'all';
      dot.style.cursor = isMergedSecond ? 'default' : 'move';
      /* 선택 상태 이어받기 */
      if (selectedCols.has(i)) { dot.setAttribute('fill', '#000'); dot.setAttribute('r', 9); }
      beatLineSvg.appendChild(dot); beatDotEls.push(dot);
      if (isMergedSecond) continue; /* 6/12박: 드래그·더블클릭 비활성 — 선을 옮겨도 변화 없음 */
      (function(col) {
        dot.addEventListener('mousedown', e => {
          if (e.button !== 0) return;
          if (dotLerpRafId) { cancelAnimationFrame(dotLerpRafId); dotLerpRafId=null; }
          colDragCol=col; colDragStartMX=e.clientX; colDragStartMY=e.clientY;
          colDragStartOff=beatDotOffsetX[col]; colDragStartOffY=beatDotOffsetY[col];
          dragAxis=null; e.preventDefault(); e.stopPropagation();
        });
        dot.addEventListener('dblclick', e => { e.stopPropagation(); resetBeatLine(col); });
      })(i);
    }
  }

  function animateLineExtend(col, targetY2) {
    const ln = beatLineEls[col]; if (!ln) return;
    const startY2 = parseFloat(ln.getAttribute('y2')) || 0;
    if (Math.abs(startY2 - targetY2) < 1) return;
    const dur = LINE_EXT_DUR; let ts0 = null;
    function anim(ts) {
      if (!ts0) ts0 = ts;
      const t = Math.min((ts-ts0)/dur, 1), ease = easeOut(t);
      ln.setAttribute('y2', startY2 + (targetY2-startY2)*ease);
      if (t < 1) requestAnimationFrame(anim);
      else { ln.setAttribute('y2', targetY2); beatLineExtended[col] = (targetY2 > 0); }
    }
    requestAnimationFrame(anim);
  }

  /* col의 현재 활성 글자(가장 최근 beatIndex)만 x위치 갱신 */
  function updateWordPositions(col) {
    const info = colLatestWordInfo[col];
    if (!info) return;
    wordEls.forEach(item => {
      if (item.col !== col || item.beatIndex !== info.beatIndex) return;
      const xOff = beatDotOffsetX[col] * item.top / COL_DOT_Y;
      const left = item.originalLeft + xOff + (rowOffsets[item.row] || 0);
      item.el.style.left = (((left % 1920) + 1920) % 1920) + 'px';
    });
  }

  /* ── 원 · 선 부드러운 이동 (exponential lerp)
     매 프레임 남은 거리의 DOT_LERP 비율씩 이동 → 처음 빠르고 끝 느린 감속 ── */
  const DOT_LERP = 0.18;

  function dotLerpLoop() {
    let active = false;
    for (let col = 0; col < N_COLS; col++) {
      if (!beatDotEls[col]) continue;
      const dX = beatDotTargetX[col] - beatDotOffsetX[col];
      const dY = beatDotTargetY[col] - beatDotOffsetY[col];
      if (Math.abs(dX) < 0.1 && Math.abs(dY) < 0.1) {
        beatDotOffsetX[col] = beatDotTargetX[col];
        beatDotOffsetY[col] = beatDotTargetY[col];
        continue;
      }
      beatDotOffsetX[col] += dX * DOT_LERP;
      beatDotOffsetY[col] += dY * DOT_LERP;
      const dotY = colBaseY[col] + beatDotOffsetY[col];
      const x1 = wrapX(TICK_XS[col]);
      const dotX = x1 + beatDotOffsetX[col] * dotY / LINE_EXT_H;
      beatDotEls[col].setAttribute('cx', dotX);
      beatDotEls[col].setAttribute('cy', dotY);
      if (beatLineEls[col]) beatLineEls[col].setAttribute('x2', x1+beatDotOffsetX[col]);
      if (Math.abs(dX) > 0.1) updateWordPositions(col); /* 선 이동 시 글자도 동기화 */
      const el = colLatestWordEl[col];
      if (el && el._baseStyle !== undefined) _applyDynamic(el, el._baseStyle, -beatDotOffsetY[col]/DRAG_FULL_PX);
      active = true;
    }
    dotLerpRafId = active ? requestAnimationFrame(dotLerpLoop) : null;
  }

  function startDotLerp() {
    if (!dotLerpRafId) dotLerpRafId = requestAnimationFrame(dotLerpLoop);
  }

  function resetBeatLine(col) {
    beatDotTargetX[col] = 0;
    beatDotTargetY[col] = 0;
    startDotLerp();
    const el = colLatestWordEl[col];
    if (el && el._baseStyle !== undefined) _applyDynamic(el, el._baseStyle, 0);
  }

  function handleRulerClick() {
    setRulerCollapsed(!rulerLinesCollapsed);
  }

  function setRulerCollapsed(collapsed) {
    if (collapsed === rulerLinesCollapsed) return;  /* 이미 같은 상태면 무시 */
    const dur = 400;
    if (collapsed) {
      rulerLinesCollapsed = true;
      for (let col = 0; col < N_COLS; col++) {
        const x1 = wrapX(TICK_XS[col]);
        const fromX2 = parseFloat(beatLineEls[col]?.getAttribute('x2')) || x1;
        const fromY2 = parseFloat(beatLineEls[col]?.getAttribute('y2')) || 0;
        let ts0 = null;
        (function(c, fx2, fy2, tx) {
          function anim(ts) {
            if (!ts0) ts0 = ts;
            const t = Math.min((ts-ts0)/dur, 1), ease = easeOut(t);
            if (beatLineEls[c]) { beatLineEls[c].setAttribute('x2', fx2+(tx-fx2)*ease); beatLineEls[c].setAttribute('y2', fy2+(RULER_BOTTOM-fy2)*ease); }
            if (t < 1) requestAnimationFrame(anim);
            else { beatLineExtended[c]=false; if (beatLineEls[c]) { beatLineEls[c].setAttribute('x2', tx); beatLineEls[c].setAttribute('y2', RULER_BOTTOM); } }
          }
          requestAnimationFrame(anim);
        })(col, fromX2, fromY2, x1);
      }
    } else {
      rulerLinesCollapsed = false;
      for (let col = 0; col < N_COLS; col++) {
        const x1 = wrapX(TICK_XS[col]);
        const fromX2 = parseFloat(beatLineEls[col]?.getAttribute('x2')) || x1;
        const targetX2 = x1 + beatDotOffsetX[col]; let ts0 = null;
        (function(c, fx2, tx2) {
          function anim(ts) {
            if (!ts0) ts0 = ts;
            const t = Math.min((ts-ts0)/dur, 1), ease = easeOut(t);
            if (beatLineEls[c]) { beatLineEls[c].setAttribute('x2', fx2+(tx2-fx2)*ease); beatLineEls[c].setAttribute('y2', RULER_BOTTOM+(LINE_EXT_H-RULER_BOTTOM)*ease); }
            if (t < 1) requestAnimationFrame(anim);
            else { beatLineExtended[c]=true; if (beatLineEls[c]) { beatLineEls[c].setAttribute('x2', tx2); beatLineEls[c].setAttribute('y2', LINE_EXT_H); } }
          }
          requestAnimationFrame(anim);
        })(col, fromX2, targetX2);
      }
    }
  }

  /* ── Num handles / Row drag ── */
  function createNumHandles() {
    if (numElsCreated) { numHandles.forEach(h => h.el.style.visibility='visible'); return; }
    numElsCreated = true;
    const rowH  = cfg.rowHeight || cfg.rowGap;
    const halfH = cfg.rowHeight ? cfg.rowHeight / 2 : 0; /* 두 줄 레이아웃이면 행 중앙 */
    for (let n = 0; n < cfg.rowCount; n++) {
      const el = document.createElement('div');
      const top = cfg.rowTopStart + n * rowH + halfH;
      el.style.cssText = `position:absolute;top:${top}px;left:${getNumBaseX()}px;
        transform:translateX(-50%);width:35px;text-align:center;color:#000;
        font-family:"Noto Serif KR",serif;font-size:12px;font-weight:600;
        line-height:normal;cursor:ew-resize;user-select:none;visibility:hidden;z-index:20;`;
      el.textContent = n + 1;
      screenEl.appendChild(el);
      numHandles.push({el, row: n, currentX: getNumBaseX()});
      setupNumDrag(numHandles[n]);
    }
  }

  function setupNumDrag(handle) {
    handle.el.addEventListener('mousedown', e => { if (e.button!==0) return; startRowDrag(handle.row, e.clientX); e.preventDefault(); e.stopPropagation(); });
    handle.el.addEventListener('dblclick',  e => { e.stopPropagation(); resetRowAnim(handle.row); });
  }

  function startRowDrag(row, clientX) {
    rowDragging=true; rowDragIdx=row;
    rowDragStartX=clientX/currentScale;
    rowDragStartOffset=rowOffsets[row];
    rowDragStartNumX=numHandles[row]?numHandles[row].currentX:getNumBaseX();
  }

  function resetRowAnim(rowIdx) {
    const handle = numHandles[rowIdx];
    const fromX = handle ? handle.currentX : getNumBaseX();
    const fromOffset = rowOffsets[rowIdx];
    const dur = 350; let startTs = null;
    function anim(ts) {
      if (!startTs) startTs = ts;
      const t = Math.min((ts-startTs)/dur, 1), ease = easeOut(t);
      rowOffsets[rowIdx] = fromOffset*(1-ease);
      if (handle) { handle.currentX = fromX+(getNumBaseX()-fromX)*ease; handle.el.style.left = handle.currentX+'px'; }
      wordEls.forEach(item => {
        if (item.row !== rowIdx) return;
        const xOff = beatDotOffsetX[item.col] * item.top / COL_DOT_Y;
        item.el.style.left = (((item.originalLeft+xOff+rowOffsets[rowIdx])%1920+1920)%1920)+'px';
      });
      if (t < 1) requestAnimationFrame(anim);
      else { rowOffsets[rowIdx]=0; if (handle) { handle.currentX=getNumBaseX(); handle.el.style.left=getNumBaseX()+'px'; } }
    }
    requestAnimationFrame(anim);
  }

  /* ══════════════════════════════
     재생 시스템
  ══════════════════════════════ */
  function startErase() {
    appState = 'erasing';
    createNumHandles();
    const eTop  = cfg.eraseTop       || cfg.rowTopStart - 7;
    const cTop  = cfg.eraseCoverTop  || cfg.rowTopStart;
    const eH    = cfg.eraseSize      || 200;
    const cH    = cfg.eraseCoverSize || eH + 5;
    const eraseLine = document.createElement('div');
    eraseLine.style.cssText = `position:absolute;top:${eTop}px;width:5px;height:${eH}px;background:#fff;pointer-events:none;z-index:5;`;
    coverBox = document.createElement('div');
    coverBox.style.cssText  = `position:absolute;top:${cTop}px;left:0;width:0;height:${cH}px;background:#fff;pointer-events:none;`;

    /* 지우개가 지나간 자리에 번역을 흐르는 텍스트로 reveal */
    eraseRevealEl = null;
    if (cfg.translateLines?.length && cfg.translateTop !== undefined) {
      eraseRevealEl = document.createElement('div');
      eraseRevealEl.style.cssText = `position:absolute;top:0;left:0;width:0;height:1080px;overflow:hidden;pointer-events:none;`;

      const lineH = cfg.translateLineHeight ?? 17;
      const GAP = 1; /* 각 줄 상단 1px는 비워서 .translate-line이 가려지지 않게 */

      let wIdx = 0;
      cfg.translateLines.forEach((line, li) => {
        /* 줄마다 흰 배경을 분리 — 상단 GAP px는 칠하지 않아 translate-line이 보이도록 */
        const rowBg = document.createElement('div');
        rowBg.style.cssText = `position:absolute;top:${cfg.translateTop + li*lineH + GAP}px;left:0;width:1920px;` +
          `height:${lineH - GAP}px;background:#fff;`;

        const lineEl = document.createElement('div');
        lineEl.style.cssText = `position:absolute;top:0;left:${cfg.translateLeft ?? 408}px;right:80px;` +
          `font-family:"Source Han Serif K","Noto Serif KR",serif;font-size:13px;line-height:${lineH}px;color:#000;white-space:nowrap;`;
        line.split(' ').filter(w => w.length > 0).forEach(word => {
          const s = cfg.beatPattern[wIdx % cfg.beatPattern.length];
          wIdx++;
          const span = document.createElement('span');
          span.textContent = word + ' ';
          if (s === 3) span.style.cssText = 'font-weight:800;';
          else if (s === 2) span.style.cssText = 'font-weight:500;';
          else if (s === 1) span.style.cssText = 'font-weight:500;letter-spacing:8px;';
          else span.style.cssText = 'font-weight:200;opacity:0.4;';
          lineEl.appendChild(span);
        });
        rowBg.appendChild(lineEl);
        eraseRevealEl.appendChild(rowBg);
      });
    }
    screenEl.appendChild(coverBox);
    if (eraseRevealEl) screenEl.appendChild(eraseRevealEl);
    screenEl.appendChild(eraseLine);
    /* 화면 밖까지 나가도록 뷰포트 기준 우측 끝 + 여유값 */
    const lineEndX = Math.ceil(window.innerWidth / currentScale) + 300;
    let numShown = false, eraseStartTs = null;
    function eraseLoop(ts) {
      if (!eraseStartTs) eraseStartTs = ts;
      const t = Math.min((ts-eraseStartTs)/ERASE_DUR, 1);
      const lineX = LINE_START_X + (lineEndX-LINE_START_X)*easeOut(t);
      eraseLine.style.left = lineX+'px';
      coverBox.style.width = Math.max(0, lineX)+'px';
      if (eraseRevealEl) eraseRevealEl.style.width = Math.max(0, lineX)+'px';
      if (!numShown && lineX >= 1900) { numHandles.forEach(h => h.el.style.visibility='visible'); numShown=true; }
      if (t < 1) requestAnimationFrame(eraseLoop);
      else { eraseLine.remove(); coverBox.style.width=lineEndX+'px'; setTimeout(() => startWords(), 500); }
    }
    requestAnimationFrame(eraseLoop);
  }

  function startWords() {
    timeBar = document.createElement('div');
    timeBar.style.cssText = `position:absolute;top:${RULER_TOP}px;left:${TB_LEFT}px;height:2.5px;width:0;background:#000;pointer-events:none;z-index:5;`;
    screenEl.appendChild(timeBar);
    if (!rulerResetOverlay.parentNode) screenEl.appendChild(rulerResetOverlay);
    initBeatLines();
    /* translate block은 DOM에 유지 — erase 후에도 번역이 보여야 함 */
    if (eraseRevealEl) { eraseRevealEl.style.width = '3000px'; eraseRevealEl = null; }
    wordElapsed=0; nextBeatIdx=0; wordEls=[];
    schedNextIdx=0; scheduledSet.clear();
    audioOrigin = audioCtx ? audioCtx.currentTime : 0;
    appState='playing'; wordStartTs=null; playbackRate=1;
    wordRafId = requestAnimationFrame(wordLoop);
  }

  function wordLoop(ts) {
    if (!wordStartTs) wordStartTs = ts;
    const dt = ts - wordStartTs; wordStartTs = ts;

    /* 오디오 클럭에 직접 동기화 → rAF 타임스탬프 drift 방지
       rewind / 변속(playbackRate≠1) 시에는 rAF 기반 유지 */
    if (audioCtx && playbackRate === 1) {
      wordElapsed = Math.max(0, Math.min(TOTAL_DUR, (audioCtx.currentTime - audioOrigin) * 1000));
    } else {
      wordElapsed = Math.max(0, Math.min(TOTAL_DUR, wordElapsed + dt * playbackRate));
    }

    if (playbackRate < 0) {
      wordEls = wordEls.filter(({el, beatIndex}) => {
        if (beatIndex*BEAT_MS > wordElapsed) { el.remove(); return false; } return true;
      });
      nextBeatIdx = Math.min(nextBeatIdx, Math.floor(wordElapsed/BEAT_MS)+1);
      schedNextIdx = nextBeatIdx; scheduledSet.clear();
      audioOrigin = audioCtx ? audioCtx.currentTime - wordElapsed/1000 : 0;
    }

    /* 오디오 lookahead 스케줄링 */
    if (audioCtx) {
      while (schedNextIdx < EVENTS.length && wordElapsed + SCHED_AHEAD >= schedNextIdx*BEAT_MS) {
        if (!scheduledSet.has(schedNextIdx) && !deletedBeats.has(schedNextIdx)) {
          const sev = getEvent(schedNextIdx);
          const splitN = beatSplits[sev.col] || 1;
          /* beatAudioTime: 현재 시점에서 이 박까지 남은 wordElapsed를
             playbackRate로 나눠 실제 소요 시간을 구한 뒤 오디오 클럭에 더함
             → 속도가 빨라지면 소리도 같은 비율로 당겨짐 */
          const msUntilBeat = schedNextIdx * BEAT_MS - wordElapsed;
          const beatAudioTime = audioCtx.currentTime + msUntilBeat / (playbackRate * 1000);
          playBeat(sev.col, sev.style, beatAudioTime, splitN);
          scheduledSplits[schedNextIdx] = splitN;
          if (splitN > 1) beatSplits[sev.col] = 1;
        }
        scheduledSet.add(schedNextIdx);
        schedNextIdx++;
      }
    }

    while (nextBeatIdx < EVENTS.length && wordElapsed >= nextBeatIdx*BEAT_MS) {
      const ev = getEvent(nextBeatIdx);

      if (ev.row !== lastSentRow) {
        lastSentRow = ev.row;
      }

      if (beatLineSvg && ev.row === 0 && !beatLineExtended[ev.col]) {
        animateLineExtend(ev.col, LINE_EXT_H);
        /* 선이 처음 나타날 때 원을 박자 세기 Y좌표로 애니메이션 */
        const targetBase = styleBaseY(ev.style);
        if (targetBase !== colBaseY[ev.col] && beatDotEls[ev.col]) {
          const fromY = parseFloat(beatDotEls[ev.col].getAttribute('cy')) || COL_DOT_Y;
          colBaseY[ev.col] = targetBase;
          beatDotTargetY[ev.col] = 0;
          const dur = LINE_EXT_DUR; let ts0 = null;
          (function(c, fy, ty) {
            function anim(ts) {
              if (!ts0) ts0 = ts;
              const t = Math.min((ts-ts0)/dur, 1), ease = easeOut(t);
              if (beatDotEls[c]) beatDotEls[c].setAttribute('cy', fy+(ty-fy)*ease);
              if (t < 1) requestAnimationFrame(anim);
            }
            requestAnimationFrame(anim);
          })(ev.col, fromY, targetBase);
        }
      }

      const newBase = styleBaseY(ev.style);
      if (newBase !== colBaseY[ev.col]) {
        const oldAbsY = colBaseY[ev.col] + beatDotOffsetY[ev.col];
        colBaseY[ev.col] = newBase;
        const minOff = newBase===COL_DOT_Y-30?0:newBase===COL_DOT_Y+30?-60:-30;
        const maxOff = newBase===COL_DOT_Y+30?0:newBase===COL_DOT_Y-30?60:30;
        beatDotOffsetY[ev.col] = Math.max(minOff, Math.min(maxOff, oldAbsY-newBase));
        beatDotTargetY[ev.col] = beatDotOffsetY[ev.col];
        const fromY = parseFloat(beatDotEls[ev.col]?.getAttribute('cy')) || COL_DOT_Y;
        const toY   = newBase + beatDotOffsetY[ev.col];
        const fromX = parseFloat(beatDotEls[ev.col]?.getAttribute('cx')) || wrapX(TICK_XS[ev.col]);
        const toX   = wrapX(TICK_XS[ev.col]) + beatDotOffsetX[ev.col]*toY/LINE_EXT_H;
        const dur = 200; let ts0 = null;
        (function(c, fy, ty, fx, tx) {
          function anim(ts) {
            if (!ts0) ts0 = ts;
            const t = Math.min((ts-ts0)/dur, 1), ease = easeOut(t);
            if (beatDotEls[c]) { beatDotEls[c].setAttribute('cy', fy+(ty-fy)*ease); beatDotEls[c].setAttribute('cx', fx+(tx-fx)*ease); }
            if (t < 1) requestAnimationFrame(anim);
          }
          requestAnimationFrame(anim);
        })(ev.col, fromY, toY, fromX, toX);
      }

      lastPlayedCol = ev.col;

      if (ev.word && !deletedBeats.has(nextBeatIdx)) {
        if (MERGED_INTO.has(ev.col)) {
          /* 6/12박: 독립 요소 없이 5/11박 글자에 이어붙여 표시 */
          const firstCol = MERGED_INTO.get(ev.col);
          const firstEl  = colLatestWordEl[firstCol];
          if (firstEl) {
            firstEl.textContent = firstEl.textContent + ' ' + ev.word;
            const newW = (parseFloat(firstEl.dataset.baseWidth) || 0) + tickWidth(ev.col);
            firstEl.dataset.baseWidth = newW;
            firstEl.style.width = newW + 'px';
            const info = colLatestWordInfo[firstCol];
            if (info) info.word = firstEl.textContent;
          }
          lastPlayedCol = firstCol; /* 이후 로터리 조작은 5/11박(병합 단위)을 대상으로 */
        } else {
        const N = scheduledSplits[nextBeatIdx] || 1;
        delete scheduledSplits[nextBeatIdx];
        const wordTop = cfg.getWordTop ? cfg.getWordTop(ev.row, ev.style) : cfg.rowTopStart + ev.row*cfg.rowGap;
        const colApplied = beatDotOffsetX[ev.col] !== 0 ? beatDotOffsetX[ev.col]*wordTop/COL_DOT_Y : 0;
        const baseLeft = TICK_XS[ev.col] + colApplied;
        const subW = tickWidth(ev.col) / N;

        function placeSubWord(s) {
          const el = document.createElement('div');
          const subOffset = s * tickWidth(ev.col) / N;
          const xOff = beatDotOffsetX[ev.col] * wordTop / COL_DOT_Y;
          const left = TICK_XS[ev.col] + xOff + subOffset + rowOffsets[ev.row];
          el.style.cssText = cfg.getWordStyle(ev.style) + `top:${wordTop}px;left:${(((left)%1920)+1920)%1920}px;width:${subW}px;`;
          el.dataset.baseWidth = subW;
          el.textContent = ev.word; el._baseStyle = ev.style;
          if (s === N-1) { colLatestWordEl[ev.col] = el; colLatestWordInfo[ev.col] = {word:ev.word, style:ev.style, top:wordTop, row:ev.row, beatIndex:nextBeatIdx}; }
          el.addEventListener('mousedown', e => { if (e.button!==0) return; startRowDrag(ev.row, e.clientX); e.preventDefault(); e.stopPropagation(); });
          el.addEventListener('dblclick',  e => { e.stopPropagation(); resetRowAnim(ev.row); });
          screenEl.appendChild(el);
          const beatFraction = ev.col + s / N;
          wordEls.push({el, beatIndex: nextBeatIdx, originalLeft: TICK_XS[ev.col]+subOffset, top: wordTop, row: ev.row, col: ev.col, beatFraction});
        }

        /* s=0 즉시 배치, s=1..N-1 은 각 sub-beat 시점에 맞춰 큐에 추가 */
        placeSubWord(0);
        for (let s = 1; s < N; s++) {
          const fireTime = nextBeatIdx * BEAT_MS + s * BEAT_MS / N;
          subBeatQueue.push({fireTime, s, N, place: placeSubWord.bind(null, s)});
        }
        }
      }
      nextBeatIdx++;
    }

    /* subBeatQueue: 각 sub-beat 글자를 정확한 시점에 배치 */
    subBeatQueue = subBeatQueue.filter(item => {
      if (wordElapsed >= item.fireTime) { item.place(); return false; }
      return true;
    });

    timeBar.style.width = (Math.min(wordElapsed/TOTAL_DUR, 1)*TB_W)+'px';
    if (wordElapsed < TOTAL_DUR) { wordRafId = requestAnimationFrame(wordLoop); }
    else {
      timeBar.style.width = TB_W+'px';
      if (roopEnabled) replayWords();
      else appState = 'ended';
    }
  }

  function pauseWords() {
    cancelAnimationFrame(wordRafId); wordRafId=null; wordStartTs=null; appState='paused';
    /* AudioContext 일시정지 → 예약된 사운드도 멈춤 */
    if (audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(()=>{});
  }

  function resumeWords() {
    const start = () => {
      /* 재개 시 audioOrigin 재조정 → visual 싱크 유지 */
      audioOrigin = audioCtx ? audioCtx.currentTime - wordElapsed/1000 : 0;
      schedNextIdx = nextBeatIdx; scheduledSet.clear();
      appState='playing'; wordStartTs=null; playbackRate=1;
      wordRafId = requestAnimationFrame(wordLoop);
    };
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().then(start).catch(start);
    } else {
      start();
    }
  }

  function replayWords() {
    const startW = parseFloat(timeBar.style.width) || 0;
    const RESET_DUR = 350; let resetTs = null;
    function resetLoop(ts) {
      if (!resetTs) resetTs = ts;
      const t = Math.min((ts-resetTs)/RESET_DUR, 1);
      timeBar.style.width = (startW*(1-t))+'px';
      if (t < 1) requestAnimationFrame(resetLoop);
      else {
        wordEls.forEach(({el}) => el.remove()); wordEls = [];
        if (coverBox) coverBox.style.width = '1920px';
        lastSentRow=-1; colLatestWordEl.fill(null); colLatestWordInfo.fill(null);
        wordElapsed=0; nextBeatIdx=0; appState='playing'; wordStartTs=null; playbackRate=1;
        schedNextIdx=0; scheduledSet.clear(); subBeatQueue=[]; scheduledSplits={};
        colOrderCache={}; /* 현재 박 위치 기준으로 재생 순서 다시 계산 */
        /* 리플레이 시 라인 확장 애니메이션 생략 — 이미 펼쳐진 상태 유지 */
        beatLineExtended.fill(true);
        audioOrigin = audioCtx ? audioCtx.currentTime : 0;
        wordRafId = requestAnimationFrame(wordLoop);
      }
    }
    requestAnimationFrame(resetLoop);
  }

  /* ══════════════════════════════
     액션 함수
  ══════════════════════════════ */
  function doPlay() {
    if (!audioCtx) {
      initAudio().then(() => _doPlayAction()).catch(e => console.warn('[audio]', e));
    } else _doPlayAction();
  }
  function _doPlayAction() {
    if (appState==='idle')    startErase();
    else if (appState==='playing') pauseWords();
    else if (appState==='paused')  resumeWords();
    else if (appState==='ended')   replayWords();
  }
  function doChange()    { showView('world_list'); }
  function doRuler()     { rulerResetOverlay.click(); }
  function doMute()      { isMuted=!isMuted; if (screenEl) screenEl.style.opacity = isMuted ? '0.5' : '1'; }

  /* 연주 이전 초기 상태로 완전 리셋 (이벤트 리스너 유지) */
  function doReset() {
    if (wordRafId)    { cancelAnimationFrame(wordRafId);    wordRafId=null; }
    if (dotLerpRafId) { cancelAnimationFrame(dotLerpRafId); dotLerpRafId=null; }
    if (tickLerpRafId) { cancelAnimationFrame(tickLerpRafId); tickLerpRafId=null; }
    /* 즉시 오디오 정지 */
    if (audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(()=>{});

    appState='idle'; wordElapsed=0; wordStartTs=null; nextBeatIdx=0;
    wordEls=[]; timeBar=null; coverBox=null; playbackRate=1;
    tickSpacingCurrent=cfg.tickSpacing; tickSpacingTarget=cfg.tickSpacing;
    for (let i=0;i<N_COLS;i++) TICK_XS[i]=cfg.tickStart+i*cfg.tickSpacing;
    TB_RIGHT=TICK_XS[N_COLS-1]; TB_W=TB_RIGHT-TB_LEFT;
    rowOffsets.fill(0);
    beatLineSvg=null; beatLineEls=[]; beatDotEls=[];
    beatDotOffsetX.fill(0); beatDotOffsetY.fill(0);
    beatDotTargetX.fill(0); beatDotTargetY.fill(0);
    beatVolLevel.fill(0);   beatVolAccum.fill(0);
    beatLineExtended.fill(false); colLatestWordEl.fill(null); colLatestWordInfo.fill(null);
    colBaseY.fill(COL_DOT_Y); lastSentRow=-1; lastPlayedCol=-1;
    selectedCols=new Set();
    beatSplits.fill(1); subBeatQueue=[]; scheduledSplits={}; deletedBeats=new Set();
    colOrderCache={};
    schedNextIdx=0; scheduledSet.clear();
    numElsCreated=false; numHandles=[];
    rulerTickLines=[]; rulerDotCircles=[]; rulerTexts=[]; eraseRevealEl=null;

    document.getElementById('app').innerHTML = cfg.getHTML();
    screenEl = document.getElementById('screen');
    if (!rulerResetOverlay.parentNode) screenEl.appendChild(rulerResetOverlay);
    buildRuler();
    scaleScreen();
    preloadRaw();
  }

  function doErase() {
    /* 연주 중이면 즉시 정지 */
    if (wordRafId) { cancelAnimationFrame(wordRafId); wordRafId = null; }
    if (audioCtx && audioCtx.state === 'running') audioCtx.suspend().catch(()=>{});
    if (appState === 'playing' || appState === 'paused') appState = 'idle';
    /* 재생바를 처음으로 되돌리기 */
    wordElapsed = 0; nextBeatIdx = 0; wordStartTs = null;
    schedNextIdx = 0; scheduledSet.clear(); subBeatQueue = []; scheduledSplits = {};
    colOrderCache = {};
    lastSentRow = -1; lastPlayedCol = -1;
    wordEls.forEach(({el}) => el.remove()); wordEls = [];
    colLatestWordEl.fill(null); colLatestWordInfo.fill(null);
    if (timeBar) timeBar.style.width = '0px';
    /* 속도·간격 원복 */
    playbackRate = 1;
    tickSpacingTarget = cfg.tickSpacing;
    startTickLerp();
    selectedCols.clear();
    beatDotEls.forEach(d => { if (d) { d.setAttribute('r', 6); d.setAttribute('fill', 'none'); } });
    for (let row = 0; row < rowOffsets.length; row++) resetRowAnim(row);
    for (let col = 0; col < N_COLS; col++) resetBeatLine(col);
  }

  /* 택트 선택만 해제 (오프셋/라인은 유지) */
  function doDesel() {
    selectedCols.forEach(col => {
      const dotEl = beatDotEls[col] || rulerDotCircles[col];
      if (dotEl) { dotEl.setAttribute('fill', 'none'); dotEl.setAttribute('r', 6); }
    });
    selectedCols.clear();
  }

  /* 키 누를 때 토글 선택 */
  function toggleSelectCol(col) {
    if (MERGED_INTO.has(col)) return; /* 6/12박: 선택 동작 없음 — 5/11박과 병합됨 */
    /* 재생 전 → rulerDotCircles 사용, 재생 후 → beatDotEls 사용 */
    const dotEl = beatDotEls[col] || rulerDotCircles[col];
    if (selectedCols.has(col)) {
      selectedCols.delete(col);
      if (dotEl) { dotEl.setAttribute('fill', 'none'); dotEl.setAttribute('r', 6); }
    } else {
      selectedCols.add(col);
      if (dotEl) { dotEl.setAttribute('fill', '#000'); dotEl.setAttribute('r', 9); }
    }
  }

  /* 선택된 cols가 없으면 마지막 연주된 col 반환 */
  function getActiveCols() {
    if (selectedCols.size > 0) return [...selectedCols];
    if (lastPlayedCol >= 0) return [lastPlayedCol];
    /* 재생 전이라면 col 0 기본값 */
    return appState !== 'idle' ? [0] : [];
  }

  /* ── tick 간격 동적 조정 ── */
  function updateTickXS(spacing) {
    for (let i=0;i<N_COLS;i++) TICK_XS[i]=cfg.tickStart+i*spacing;
    TB_RIGHT=TICK_XS[N_COLS-1]; TB_W=TB_RIGHT-TB_LEFT;
  }

  function updateTickPositions() {
    /* ruler 텍스트·선 — 글자(wordEls)와 동일하게 1920px 기준 wrap */
    rulerTexts.forEach((t,i)    =>{ if(t) t.setAttribute('x', wrapX(TICK_XS[i])); });
    rulerTickLines.forEach((l,i)=>{ if(l){ const x=wrapX(TICK_XS[i]); l.setAttribute('x1',x); l.setAttribute('x2',x); }});
    rulerDotCircles.forEach((c,i)=>{ if(c) c.setAttribute('cx', wrapX(TICK_XS[i])); });
    /* beat 선·원 */
    for (let col=0;col<N_COLS;col++) {
      const x1 = wrapX(TICK_XS[col]);
      if (beatLineEls[col]) {
        beatLineEls[col].setAttribute('x1', x1);
        beatLineEls[col].setAttribute('x2', x1+beatDotOffsetX[col]);
      }
      if (beatDotEls[col]) {
        const dotY = colBaseY[col]+beatDotOffsetY[col];
        beatDotEls[col].setAttribute('cx', x1+beatDotOffsetX[col]*dotY/LINE_EXT_H);
      }
    }
    /* 글자: 위치와 너비를 새 간격에 맞게 재계산 */
    wordEls.forEach(item => {
      item.originalLeft = cfg.tickStart + item.beatFraction * tickSpacingCurrent;
      const ratio = tickSpacingCurrent / cfg.tickSpacing;
      item.el.style.width = (parseFloat(item.el.dataset.baseWidth || item.el.style.width) * ratio) + 'px';
      const xOff = beatDotOffsetX[item.col]*item.top/COL_DOT_Y;
      const left = item.originalLeft+xOff+(rowOffsets[item.row]||0);
      item.el.style.left = (((left%1920)+1920)%1920)+'px';
    });
    /* rulerResetOverlay & timeBar */
    if (rulerResetOverlay) rulerResetOverlay.style.width = TB_W+'px';
    if (timeBar) {
      timeBar.style.left  = TB_LEFT+'px';
      timeBar.style.width = (Math.min(wordElapsed/TOTAL_DUR,1)*TB_W)+'px';
    }
  }

  function tickLerpLoop() {
    const diff = tickSpacingTarget - tickSpacingCurrent;
    if (Math.abs(diff) < 0.05) {
      tickSpacingCurrent = tickSpacingTarget;
      updateTickXS(tickSpacingCurrent);
      updateTickPositions();
      tickLerpRafId = null;
      return;
    }
    tickSpacingCurrent += diff * TICK_LERP;
    updateTickXS(tickSpacingCurrent);
    updateTickPositions();
    tickLerpRafId = requestAnimationFrame(tickLerpLoop);
  }

  function startTickLerp() {
    if (!tickLerpRafId) tickLerpRafId = requestAnimationFrame(tickLerpLoop);
  }

  function doMove(dir) {
    for (const col of getActiveCols()) {
      if (!beatDotEls[col]) continue;
      beatDotTargetX[col] += dir * (tickSpacingCurrent / 2);
    }
    startDotLerp();
  }

  function doVol(dir) {
    for (const col of getActiveCols()) {
      const minOff = colBaseY[col]===COL_DOT_Y-30?0:colBaseY[col]===COL_DOT_Y+30?-60:-30;
      const maxOff = colBaseY[col]===COL_DOT_Y+30?0:colBaseY[col]===COL_DOT_Y-30?60:30;
      beatDotTargetY[col] = Math.max(minOff, Math.min(maxOff, beatDotTargetY[col]+dir*VOL_STEP));
    }
    startDotLerp();
    for (const col of getActiveCols()) {
      beatVolAccum[col] += dir;
      if (Math.abs(beatVolAccum[col]) >= VOL_CLICKS_PER_LEVEL) {
        beatVolLevel[col] = Math.max(VOL_LEVEL_MIN, Math.min(VOL_LEVEL_MAX, beatVolLevel[col]+Math.sign(beatVolAccum[col])));
        beatVolAccum[col] = 0;
      }
    }
  }

  /* G 로터리: 박 쪼개기 (1→2→3→4…) */
  function doSplit(dir) {
    const cols = getActiveCols();
    if (cols.length === 0) return;
    for (const col of cols) {
      if (dir > 0) {
        /* G+ : 박 쪼개기 (원샷) */
        beatSplits[col] = Math.min(8, beatSplits[col] + 1);
        /* 즉시 사운드 */
        if (audioCtx && !isMuted && appState === 'playing') {
          const style = BEAT_PATTERN[col];
          if (style !== 0 && !DOUBLE_WEAK_SKIP.has(col)) {
            const {soundKey, variant} = cfg.getAudioKey(col, style, DOUBLE_WEAK_FIRST);
            playRawSound(soundKey, variant, audioCtx.currentTime, VOL_LEVEL_GAIN[String(beatVolLevel[col]??0)]??1.0);
          }
        }
        /* 즉시 글자 추가 */
        const info = colLatestWordInfo[col];
        if (info && screenEl) {
          const N = beatSplits[col];
          const subOffset = (N-1) * tickWidth(col) / N;
          const xOff = beatDotOffsetX[col] * info.top / COL_DOT_Y;
          const left = TICK_XS[col] + xOff + subOffset + (rowOffsets[info.row]||0);
          const el = document.createElement('div');
          el.style.cssText = cfg.getWordStyle(info.style) +
            `top:${info.top}px;left:${(((left)%1920)+1920)%1920}px;width:${tickWidth(col)/N}px;`;
          el.dataset.baseWidth = tickWidth(col)/N;
          el.textContent = info.word; el._baseStyle = info.style;
          colLatestWordEl[col] = el;
          el.addEventListener('mousedown', e => { if(e.button!==0)return; startRowDrag(info.row,e.clientX); e.preventDefault(); e.stopPropagation(); });
          el.addEventListener('dblclick', e => { e.stopPropagation(); resetRowAnim(info.row); });
          screenEl.appendChild(el);
          const beatFraction = col + (N-1) / N;
          wordEls.push({el, beatIndex: info.beatIndex, originalLeft: TICK_XS[col]+subOffset, top: info.top, row: info.row, col, beatFraction});
        }
      } else {
        /* G- : 현재 박 삭제 (원샷) */
        const info = colLatestWordInfo[col];
        if (!info) continue;
        deletedBeats.add(info.beatIndex);
        wordEls = wordEls.filter(item => {
          if (item.col === col && item.beatIndex === info.beatIndex) { item.el.remove(); return false; }
          return true;
        });
        colLatestWordEl[col] = null;
        colLatestWordInfo[col] = null;
      }
    }
  }

  function doSpeed(dir) {
    if (appState!=='playing' && appState!=='paused') return;
    playbackRate = Math.max(SPD_MIN, Math.min(SPD_MAX, playbackRate+dir*SPD_STEP));
    schedNextIdx = nextBeatIdx; scheduledSet.clear();
    /* 빠름 → 간격 줄고, 느림 → 간격 늘어남 */
    tickSpacingTarget = Math.max(TICK_MIN, Math.min(TICK_MAX, tickSpacingTarget - dir * TICK_STEP));
    startTickLerp();
  }

  function doRow(dir) {
    if (appState!=='playing' && appState!=='paused') return;
    const currentRow = lastSentRow >= 0 ? lastSentRow : 0;
    rowOffsets[currentRow] += dir * ROW_MOVE_STEP;
    wordEls.forEach(item => {
      if (item.row!==currentRow) return;
      const xOff = beatDotOffsetX[item.col] * item.top / COL_DOT_Y;
      item.el.style.left = (((item.originalLeft+xOff+rowOffsets[currentRow])%1920+1920)%1920)+'px';
    });
    if (numHandles[currentRow]) {
      numHandles[currentRow].currentX = (((numHandles[currentRow].currentX+dir*ROW_MOVE_STEP)%1920)+1920)%1920;
      numHandles[currentRow].el.style.left = numHandles[currentRow].currentX+'px';
    }
  }

  /* ══════════════════════════════
     이벤트 핸들러
  ══════════════════════════════ */
  function handleKeyDown(e) {
    if (e.code==='Enter')    { e.preventDefault(); doRuler();  return; }
    if (e.code==='Escape')   { doErase();  return; }
    if (e.code==='Space')    { e.preventDefault(); doPlay();   return; }
    if (e.code==='Backspace'){ e.preventDefault(); doChange(); return; }
    if (e.code==='KeyM')     { doMute();   return; }
    if (e.code==='ArrowUp')  { e.preventDefault(); doVol(-1); return; }
    if (e.code==='ArrowDown'){ e.preventDefault(); doVol(1);  return; }
    const colMap = cfg.colKeyMap;
    if (colMap && colMap[e.code] !== undefined) { e.preventDefault(); toggleSelectCol(colMap[e.code]); return; }
    if (e.code==='BracketRight'){ e.preventDefault(); doSplit(1);  return; } /* ] = 쪼개기 */
    if (e.code==='BracketLeft') { e.preventDefault(); doSplit(-1); return; } /* [ = 삭제 */
    if (e.code==='ArrowLeft'||e.code==='ArrowRight') { e.preventDefault(); doMove(e.code==='ArrowRight'?1:-1); return; }
    if (e.code==='KeyA'||e.code==='KeyD') { e.preventDefault(); doRow(e.code==='KeyD'?1:-1); return; }
  }

  function handleMouseMove(e) {
    if (rowDragging) {
      const dx = e.clientX/currentScale - rowDragStartX;
      const handle = numHandles[rowDragIdx];
      if (handle) { handle.currentX=(((rowDragStartNumX+dx)%1920)+1920)%1920; handle.el.style.left=handle.currentX+'px'; }
      rowOffsets[rowDragIdx] = rowDragStartOffset + dx;
      wordEls.forEach(item => {
        if (item.row!==rowDragIdx) return;
        const xOff = beatDotOffsetX[item.col] * item.top / COL_DOT_Y;
        item.el.style.left=(((item.originalLeft+xOff+rowOffsets[rowDragIdx])%1920+1920)%1920)+'px';
      });
    }
    if (colDragCol < 0) return;
    if (dragAxis === null) {
      const adx=Math.abs(e.clientX-colDragStartMX), ady=Math.abs(e.clientY-colDragStartMY);
      if (adx>=5||ady>=5) dragAxis = adx>=ady ? 'x' : 'y'; else return;
    }
    const col = colDragCol;
    const dx = (e.clientX-colDragStartMX)/currentScale, dy = (e.clientY-colDragStartMY)/currentScale;
    if (dragAxis === 'x') {
      beatDotOffsetX[col] = colDragStartOff + dx*SYNC_RATIO;
      beatDotTargetX[col] = beatDotOffsetX[col];
      const dotY = colBaseY[col]+beatDotOffsetY[col];
      const dotX = TICK_XS[col]+beatDotOffsetX[col]*dotY/LINE_EXT_H;
      if (beatDotEls[col]) beatDotEls[col].setAttribute('cx', dotX);
      if (beatLineEls[col]) beatLineEls[col].setAttribute('x2', TICK_XS[col]+beatDotOffsetX[col]);
      updateWordPositions(col);
    } else {
      const rawOff = colDragStartOffY + dy*SYNC_RATIO;
      const minOff = colBaseY[col]===COL_DOT_Y-30?0:colBaseY[col]===COL_DOT_Y+30?-60:-30;
      const maxOff = colBaseY[col]===COL_DOT_Y+30?0:colBaseY[col]===COL_DOT_Y-30?60:30;
      beatDotOffsetY[col] = Math.max(minOff, Math.min(maxOff, rawOff));
      beatDotTargetY[col] = beatDotOffsetY[col];
      const dotY = colBaseY[col]+beatDotOffsetY[col];
      const interp = TICK_XS[col]+beatDotOffsetX[col]*dotY/LINE_EXT_H;
      if (beatDotEls[col]) { beatDotEls[col].setAttribute('cx', interp); beatDotEls[col].setAttribute('cy', dotY); }
      const el = colLatestWordEl[col];
      if (el && el._baseStyle !== undefined) _applyDynamic(el, el._baseStyle, -beatDotOffsetY[col]/DRAG_FULL_PX);
    }
  }

  function handleMouseUp() { colDragCol=-1; dragAxis=null; rowDragging=false; }

  function handleWheel(e) {
    if (appState!=='playing' && appState!=='paused') return;
    e.preventDefault();
    const isMouse = e.deltaMode===1 || Math.abs(e.deltaY)>=50;
    const divisor = isMouse ? 3 : 8;
    const jump = e.deltaY>0 ? BEAT_MS/divisor : -(BEAT_MS/divisor);
    wordElapsed = Math.max(0, Math.min(TOTAL_DUR-1, wordElapsed+jump));
    wordStartTs = null;
    if (jump < 0) {
      wordEls = wordEls.filter(({el, beatIndex}) => { if (beatIndex*BEAT_MS>wordElapsed) { el.remove(); return false; } return true; });
      nextBeatIdx = Math.min(nextBeatIdx, Math.floor(wordElapsed/BEAT_MS)+1);
      schedNextIdx = nextBeatIdx; scheduledSet.clear();
      audioOrigin = audioCtx ? audioCtx.currentTime - wordElapsed/1000 : 0;
    }
    if (timeBar) timeBar.style.width = (Math.min(wordElapsed/TOTAL_DUR, 1)*TB_W)+'px';
    if (appState==='paused') resumeWords();
  }

  function handleCommand(cmd) {
    /* 택트 스위치: SEL0~SEL15 → 해당 col 토글 선택 */
    if (cmd.startsWith('SEL')) {
      const col = parseInt(cmd.slice(3));
      if (!isNaN(col) && col >= 0 && col < N_COLS) toggleSelectCol(col);
      return;
    }
    switch(cmd) {
      case 'PLAY':   doPlay();     break;
      case 'CHANGE': doChange();   break;
      case 'ERASE':  doErase();    break;
      case 'DESEL':  doDesel();    break;
      case 'RESET':  doReset();    break;
      case 'RULER1': setRulerCollapsed(true);  break;
      case 'RULER0': setRulerCollapsed(false); break;
      case 'ROOP1':
        if (!roopEnabled) {
          roopEnabled = true;
          if (appState === 'ended') replayWords();
        }
        break;
      case 'ROOP0':
        roopEnabled = false;
        break;
      case 'GVOL+':  /* TODO: 전체 볼륨 ↑ */       break;
      case 'GVOL-':  /* TODO: 전체 볼륨 ↓ */       break;
      case 'E+':     doVol(-1);    break;
      case 'E-':     doVol(1);     break;
      case 'F+':     doMove(1);    break;
      case 'F-':     doMove(-1);   break;
      case 'G+':     doSplit(1);   break;
      case 'G-':     doSplit(-1);  break;
      case 'H+':     doSpeed(1);   break;
      case 'H-':     doSpeed(-1);  break;
    }
  }

  return { mount, unmount, handleCommand };
}