/* ═══════════════════════════════════════════════
   views/main.js — Jangdan 메인 뷰
   ═══════════════════════════════════════════════ */
registerView('main', (() => {

  /* ── 상수 ── */
  const TICK_XS = (function() {
    const xs = []; let x = 408;
    for (let i = 0; i < 12; i++) { xs.push(x); x += 105; }
    return xs;
  })();
  const TB_LEFT  = TICK_XS[0];
  const TB_RIGHT = TICK_XS[11];
  const TB_W     = TB_RIGHT - TB_LEFT;

  const LINE_START_X  = -10, LINE_END_X = 1960, ERASE_DUR = 2000;
  const COL_DOT_Y     = 1015;
  const LINE_EXT_H    = 1100;
  const LINE_EXT_DUR  = 400;
  const DRAG_FULL_PX  = 80;
  const SYNC_RATIO    = 0.7;
  const ROW_TOP_START = 457;
  const ROW_GAP       = 26;
  const BEAT_MS       = 500;
  const NUM_BASE_X    = 1900;
  const COL_MOVE_STEP = 52.5; /* 1/2박 = tick간격(105px) / 2 */
  const ROW_MOVE_STEP = 10;
  const VOL_STEP      = 12.5;
  const VOL_CLICKS_PER_LEVEL = 2; /* 몇 클릭마다 레벨 변경 */
  let beatVolLevel = Array(12).fill(0); /* col별 세기 레벨: -2~+2 */
  let beatVolAccum = Array(12).fill(0); /* 누적 클릭 카운터 */
  const VOL_LEVEL_MIN = -2, VOL_LEVEL_MAX = 2;

  /* 레벨 → 게인 매핑 (파일 없을 때 gain으로 표현) */
  const VOL_LEVEL_GAIN = { '-2': 0.1, '-1': 0.35, '0': 1.0, '1': 1.4, '2': 1.8 };
  const SPD_STEP      = 0.1, SPD_MIN = 0.25, SPD_MAX = 3.0;

  const SENTENCES = [
    "에헤 에헤 아미 타하 아허야 불이로다",
    "서산 낙조에 떨어지는 해는 내일 아침이면은",
    "다시 돋견마는 황천 길은 얼마나 먼지 한번 가면은 영절이라",
    "에헤 에헤 아미 타하 아허야 불이로다",
    "서산 명월이 다 넘어가구 벽수비풍은",
    "슬슬 부는데 새벽 종다리 우지짖는 소리 아니나든 심정이 절로난다",
    "에헤 에헤 아미 타하 아허야 불이로다"
  ];
  const BEAT_PATTERN = [3, 0, 2, 3, 1, 1, 3, 0, 2, 3, 1, 1];
  const ALL_WORDS = SENTENCES.join(' ').split(' ').reduce((acc, w, i, arr) => {
    if (w === '아미' && arr[i + 1] === '타하') acc.push('아미 타하');
    else if (w === '타하' && arr[i - 1] === '아미') { }
    else acc.push(w);
    return acc;
  }, []);

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function tickWidth(col) { return col < 11 ? TICK_XS[col+1]-TICK_XS[col] : 200; }

  function buildEvents() {
    const events = []; let wc = 0, beat = 0;
    while (wc < ALL_WORDS.length) {
      const col = beat%12, row = Math.floor(beat/12), style = BEAT_PATTERN[col];
      let word = null;
      if (style !== 0 && wc < ALL_WORDS.length) word = ALL_WORDS[wc++];
      events.push({ word, row, col, style }); beat++;
      if (wc >= ALL_WORDS.length) break;
    }
    /* 마지막 실제 박(style !== 0)을 style 2로 교체 */
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].style !== 0) {
        events[i].style = 2;
        break;
      }
    }
    return events;
  }
  const EVENTS   = buildEvents();
  const TOTAL_DUR = EVENTS.length * BEAT_MS;

  function getWordStyle(style) {
    const base = `position:absolute;color:#000;font-family:"Noto Serif KR",serif;
      font-size:18px;font-style:normal;line-height:normal;
      white-space:nowrap;cursor:ew-resize;user-select:none;`;
    if (style===3) return base+'font-weight:800;';
    if (style===2) return base+'font-weight:500;';
    if (style===1) return base+'font-weight:500;letter-spacing:11px;';
    return base;
  }

  function applyDynamicStyle(el, baseStyle, t) {
    t = Math.max(-1, Math.min(1, t));
    let weight, spacing;
    if (baseStyle===3) {
      weight = t>=0 ? 800 : 800+(500-800)*(-t); spacing=0;
    } else if (baseStyle===2) {
      const tn=t*(80/50);
      if(t>=0){weight=500+300*Math.min(tn,1);spacing=0;}
      else    {weight=500;spacing=11*Math.min(-tn,1);}
    } else if (baseStyle===1) {
      if(t>=0){weight=500+300*t;spacing=11*(1-t);}
      else    {weight=500;spacing=11;}
    } else return;
    el.style.fontWeight    = Math.round(weight/100)*100;
    el.style.letterSpacing = spacing>0.1 ? spacing+'px' : '';
  }

  function styleBaseY(style) {
    if(style===3) return COL_DOT_Y-50;
    if(style===2) return COL_DOT_Y;
    return COL_DOT_Y+50;
  }

  /* ── 뷰 상태 (mount/unmount 시 초기화) ── */
  let screenEl, appState, wordElapsed, wordStartTs, wordRafId, nextBeatIdx;
  let wordEls, timeBar, coverBox, playbackRate, rowOffsets;
  let beatLineSvg, beatLineEls, beatDotEls, beatDotOffsetX, beatDotOffsetY;
  let beatLineExtended, colLatestWordEl, colBaseY, lastSentRow;
  let colDragCol, colDragStartMX, colDragStartMY, colDragStartOff, colDragStartOffY, dragAxis;
  let rulerLinesCollapsed, rulerResetOverlay;
  let numElsCreated, numHandles;
  let selectedCol, currentScale;
  let rulerTickLines, rulerDotCircles;
  let rowDragging, rowDragIdx, rowDragStartX, rowDragStartOffset, rowDragStartNumX;

  /* ── 이벤트 핸들러 참조 (unmount 시 제거용) ── */
  let onKeyDown, onMouseMove, onMouseUp, onWheel, onResize;

  /* ── 오디오 시스템 ── */
  let audioCtx = null;
  const rawBuffers   = {};
  const audioBuffers = {};
  const LOOKAHEAD    = 0.01;
  const SCHED_AHEAD  = 500; /* ms 앞당겨 오디오 스케줄 */
  let schedNextIdx   = 0;
  const scheduledSet = new Set();
  let audioOrigin    = 0; /* audioCtx.currentTime - wordElapsed/1000 */

  /* 파일 구조: {style}_{variant}.wav
     3_1.wav, 3_2.wav / 2_1.wav / 11_1.wav
  */
  const SOUND_DEFS = {
    '3':  { variants: 2 },
    '2':  { variants: 1 },
    '11': { variants: 1 },
  };

  const DOUBLE_WEAK_FIRST = new Set();
  const DOUBLE_WEAK_SKIP  = new Set();
  (function() {
    const ones = BEAT_PATTERN.map((s,i) => s===1 ? i : -1).filter(i => i>=0);
    for (let i = 0; i < ones.length; i += 2) {
      DOUBLE_WEAK_FIRST.add(ones[i]);
      if (ones[i+1] !== undefined) DOUBLE_WEAK_SKIP.add(ones[i+1]);
    }
  })();

  /* col → variant
     style 3: col%6===0 (0,6) → 1 / col%6===3 (3,9) → 2
     style 2, 11: 항상 1
  */
  const COL_VARIANT_MAP = {};
  (function() {
    BEAT_PATTERN.forEach((s, col) => {
      if (s === 3) COL_VARIANT_MAP[col] = (col % 6 === 0) ? 1 : 2;
      else         COL_VARIANT_MAP[col] = 1;
    });
    [...DOUBLE_WEAK_FIRST].forEach(col => { COL_VARIANT_MAP[col] = 1; });
  })();

  let prevBeatStyle = 0;

  function preloadRaw() {
    Object.entries(SOUND_DEFS).forEach(([key, { variants }]) => {
      rawBuffers[key] = {};
      for (let v = 1; v <= variants; v++) {
        rawBuffers[key][v] = null;
        const name = `${key}_${v}.wav`;
        fetch(`audio/1.jangdan_3/${name}`)
          .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then(arr => { rawBuffers[key][v] = arr; })
          .catch(e => console.warn('[audio] preload failed:', name, e));
      }
    });
  }

  async function initAudio() {
    if (audioCtx) { if (audioCtx.state === 'suspended') await audioCtx.resume(); return; }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    await audioCtx.resume();
    await Promise.all(Object.entries(SOUND_DEFS).map(async ([key, { variants }]) => {
      audioBuffers[key] = {};
      for (let v = 1; v <= variants; v++) {
        const arr = rawBuffers[key]?.[v];
        if (!arr) { console.warn('[audio] not preloaded:', key, v); continue; }
        try {
          audioBuffers[key][v] = await audioCtx.decodeAudioData(arr.slice(0));
        } catch(e) { console.warn('[audio] decode failed:', key, v, e); }
      }
    }));
  }

  function playBeat(col, style, beatAudioTime) {
    if (!audioCtx || style === 0 || isMuted) return;
    if (DOUBLE_WEAK_SKIP.has(col)) return;

    let soundKey, variant;
    if (DOUBLE_WEAK_FIRST.has(col) && style === 1) {
      /* style이 1로 유지된 경우만 11 재생 (마지막박 등 style이 바뀐 경우 제외) */
      soundKey = '11'; variant = 1;
    } else {
      soundKey = String(style);
      variant  = COL_VARIANT_MAP[col] || 1;
    }
    prevBeatStyle = style;

    const buf = audioBuffers[soundKey]?.[variant];
    if (!buf) { console.warn('[audio] missing buffer:', soundKey, variant); return; }

    /* circle X → 타이밍 오프셋 */
    const offsetSec = ((beatDotOffsetX[col] || 0) / 52.5) * 0.25;
    const startTime = Math.max(audioCtx.currentTime + 0.002,
                               beatAudioTime + offsetSec + LOOKAHEAD);

    /* 세기 레벨 → gain (2클릭=1레벨, 파일 교체 시 여기서 파일 선택 가능) */
    const gain = VOL_LEVEL_GAIN[String(beatVolLevel[col] ?? 0)] ?? 1.0;

    const src      = audioCtx.createBufferSource();
    const gainNode = audioCtx.createGain();
    src.buffer          = buf;
    gainNode.gain.value = gain;
    src.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    src.start(startTime);
  }

  /* ══════════════════════════════════════
     MOUNT
  ══════════════════════════════════════ */
  function mount() {
    /* 상태 초기화 */
    appState='idle'; wordElapsed=0; wordStartTs=null; wordRafId=null; nextBeatIdx=0;
    wordEls=[]; timeBar=null; coverBox=null; playbackRate=1;
    rowOffsets=[0,0,0,0,0];
    beatLineSvg=null; beatLineEls=[]; beatDotEls=[];
    beatDotOffsetX=Array(12).fill(0); beatDotOffsetY=Array(12).fill(0);
    beatVolLevel=Array(12).fill(0);   beatVolAccum=Array(12).fill(0);
    beatLineExtended=Array(12).fill(false); colLatestWordEl=Array(12).fill(null);
    colBaseY=Array(12).fill(COL_DOT_Y); lastSentRow=-1;
    colDragCol=-1; colDragStartMX=0; colDragStartMY=0;
    colDragStartOff=0; colDragStartOffY=0; dragAxis=null;
    rulerLinesCollapsed=false; numElsCreated=false; numHandles=[];
    selectedCol=-1; currentScale=1;
    rulerTickLines=[]; rulerDotCircles=[];
    rowDragging=false; rowDragIdx=-1; rowDragStartX=0; rowDragStartOffset=0; rowDragStartNumX=0;

    /* DOM 구성 */
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="screen main-view" id="screen">
        <div class="rhythm-line" style="top:65px;"></div>
        <div class="rhythm-line" style="top:71px;"></div>
        <div class="label-jangdan">Jangdan</div>
        <div class="label-gutgeori">Gutgeori</div>
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

    screenEl = document.getElementById('screen');
    buildRuler();
    scaleScreen();

    /* rulerResetOverlay */
    rulerResetOverlay = document.createElement('div');
    rulerResetOverlay.style.cssText = `position:absolute;top:0;left:${TB_LEFT}px;width:${TB_W}px;height:27px;cursor:pointer;z-index:16;`;
    rulerResetOverlay.addEventListener('click', handleRulerClick);

    /* 이벤트 리스너 등록 */
    onResize   = scaleScreen;
    onKeyDown  = handleKeyDown;
    onMouseMove = handleMouseMove;
    onMouseUp  = handleMouseUp;
    onWheel    = handleWheel;

    window.addEventListener('resize',    onResize);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    window.addEventListener('wheel',     onWheel, { passive: false });

    /* 오디오 파일 미리 다운로드 (AudioContext는 doPlay 시 생성) */
    preloadRaw();
  }

  /* ══════════════════════════════════════
     UNMOUNT
  ══════════════════════════════════════ */
  function unmount() {
    if (wordRafId) { cancelAnimationFrame(wordRafId); wordRafId=null; }
    window.removeEventListener('resize',    onResize);
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup',   onMouseUp);
    window.removeEventListener('wheel',     onWheel);
    document.getElementById('app').innerHTML = '';
  }

  /* ── Ruler 초기화 ── */
  function buildRuler() {
    const svg = document.getElementById('ruler-svg');
    const NS  = 'http://www.w3.org/2000/svg';
    const TICK_TOP=0, TICK_H=27, TICK_BTM=TICK_TOP+TICK_H;
    const NUM_Y=50, DOT_Y=1015, DOT_R=6;
    for (let i=0; i<12; i++) {
      const cx=TICK_XS[i];
      const txt=document.createElementNS(NS,'text');
      txt.setAttribute('x',cx); txt.setAttribute('y',NUM_Y);
      txt.setAttribute('text-anchor','middle');
      txt.setAttribute('font-family','"Noto Serif KR",serif');
      txt.setAttribute('font-size','12'); txt.setAttribute('font-weight','600');
      txt.setAttribute('fill','#000'); txt.textContent=i+1;
      svg.appendChild(txt);
      const ln=document.createElementNS(NS,'line');
      ln.setAttribute('x1',cx); ln.setAttribute('y1',TICK_TOP);
      ln.setAttribute('x2',cx); ln.setAttribute('y2',TICK_BTM);
      ln.setAttribute('stroke','#000'); ln.setAttribute('stroke-width','0.65');
      svg.appendChild(ln); rulerTickLines.push(ln);
      const c=document.createElementNS(NS,'circle');
      c.setAttribute('cx',cx); c.setAttribute('cy',DOT_Y); c.setAttribute('r',DOT_R);
      c.setAttribute('fill','none'); c.setAttribute('stroke','#000'); c.setAttribute('stroke-width','0.65');
      svg.appendChild(c); rulerDotCircles.push(c);
    }
  }

  /* ── 반응형 scale ── */
  function scaleScreen() {
    if (!screenEl) return;
    currentScale = Math.min(window.innerWidth/1920, window.innerHeight/1080);
    screenEl.style.transform  = `scale(${currentScale})`;
    screenEl.style.marginLeft = `${(window.innerWidth -1920*currentScale)/2}px`;
    screenEl.style.marginTop  = `${(window.innerHeight-1080*currentScale)/2}px`;
    const marginX = (window.innerWidth-1920*currentScale)/2;
    const extraPx = marginX/currentScale;
    document.querySelectorAll('.rhythm-line').forEach(el => {
      el.style.left=`${-extraPx}px`; el.style.width=`${180/currentScale+extraPx}px`;
    });
    document.querySelectorAll('.translate-line').forEach(el => {
      el.style.left=`${-extraPx}px`; el.style.right=`${-extraPx}px`;
    });
  }

  /* ── Beat Lines ── */
  function initBeatLines() {
    const NS='http://www.w3.org/2000/svg';
    lastSentRow=-1;
    beatDotOffsetX.fill(0); beatDotOffsetY.fill(0);
    colLatestWordEl.fill(null); colBaseY.fill(COL_DOT_Y);
    if (beatLineSvg) {
      beatLineEls=[]; beatDotEls=[];
      beatLineSvg.querySelectorAll('line,circle').forEach(el=>el.remove());
      beatLineExtended.fill(false);
      beatLineSvg.querySelectorAll('line,circle').forEach(el=>{
        beatLineEls.forEach((ln,i)=>{ beatLineExtended[i]=false; animateLineExtend(i,0); });
      });
      // 재사용
      beatLineSvg.innerHTML='';
    } else {
      rulerTickLines.forEach(el=>el.remove());
      rulerDotCircles.forEach(el=>el.remove());
      beatLineSvg=document.createElementNS(NS,'svg');
      beatLineSvg.style.cssText=`position:absolute;top:0;left:0;width:1920px;height:1200px;pointer-events:none;overflow:visible;z-index:15;`;
      screenEl.appendChild(beatLineSvg);
    }
    beatLineEls=[]; beatDotEls=[];
    for (let i=0; i<12; i++) {
      const x=TICK_XS[i];
      const ln=document.createElementNS(NS,'line');
      ln.setAttribute('x1',x); ln.setAttribute('y1',0); ln.setAttribute('x2',x); ln.setAttribute('y2',0);
      ln.setAttribute('stroke','#000'); ln.setAttribute('stroke-width','0.65');
      beatLineSvg.appendChild(ln); beatLineEls.push(ln);
      const dot=document.createElementNS(NS,'circle');
      dot.setAttribute('cx',x); dot.setAttribute('cy',COL_DOT_Y);
      dot.setAttribute('r',6); dot.setAttribute('fill','none');
      dot.setAttribute('stroke','#000'); dot.setAttribute('stroke-width','0.65');
      dot.style.pointerEvents='all'; dot.style.cursor='move';
      beatLineSvg.appendChild(dot); beatDotEls.push(dot);
      (function(col) {
        dot.addEventListener('mousedown',(e)=>{
          if(e.button!==0)return;
          colDragCol=col; colDragStartMX=e.clientX; colDragStartMY=e.clientY;
          colDragStartOff=beatDotOffsetX[col]; colDragStartOffY=beatDotOffsetY[col];
          dragAxis=null; e.preventDefault(); e.stopPropagation();
        });
        dot.addEventListener('dblclick',(e)=>{ e.stopPropagation(); resetBeatLine(col); });
      })(i);
    }
  }

  function animateLineExtend(col, targetY2) {
    const ln=beatLineEls[col]; if(!ln)return;
    const startY2=parseFloat(ln.getAttribute('y2'))||0;
    if(Math.abs(startY2-targetY2)<1)return;
    const dur=LINE_EXT_DUR; let ts0=null;
    function anim(ts) {
      if(!ts0)ts0=ts;
      const t=Math.min((ts-ts0)/dur,1), ease=easeOut(t);
      ln.setAttribute('y2',startY2+(targetY2-startY2)*ease);
      if(t<1)requestAnimationFrame(anim);
      else{ln.setAttribute('y2',targetY2); beatLineExtended[col]=(targetY2>0);}
    }
    requestAnimationFrame(anim);
  }

  function resetBeatLine(col) {
    const fromX=beatDotOffsetX[col], fromY=beatDotOffsetY[col];
    const dur=350; let ts0=null;
    function anim(ts) {
      if(!ts0)ts0=ts;
      const t=Math.min((ts-ts0)/dur,1), ease=easeOut(t);
      const curOffX=fromX*(1-ease), curOffY=fromY*(1-ease);
      const dotY=colBaseY[col]+curOffY;
      const dotX=TICK_XS[col]+curOffX*dotY/LINE_EXT_H;
      if(beatDotEls[col]){beatDotEls[col].setAttribute('cx',dotX);beatDotEls[col].setAttribute('cy',dotY);}
      if(beatLineEls[col])beatLineEls[col].setAttribute('x2',TICK_XS[col]+curOffX);
      const el=colLatestWordEl[col];
      if(el&&el._baseStyle!==undefined)applyDynamicStyle(el,el._baseStyle,-curOffY/DRAG_FULL_PX);
      if(t<1)requestAnimationFrame(anim);
      else{
        beatDotOffsetX[col]=0; beatDotOffsetY[col]=0;
        const baseY=colBaseY[col];
        if(beatDotEls[col]){beatDotEls[col].setAttribute('cx',TICK_XS[col]);beatDotEls[col].setAttribute('cy',baseY);}
        if(beatLineEls[col]){beatLineEls[col].setAttribute('x2',TICK_XS[col]);beatLineEls[col].setAttribute('y2',beatLineExtended[col]?LINE_EXT_H:0);}
      }
    }
    requestAnimationFrame(anim);
  }

  /* ── Ruler 토글 ── */
  function handleRulerClick() {
    const dur=400;
    if (!rulerLinesCollapsed) {
      rulerLinesCollapsed=true;
      for(let col=0;col<12;col++){
        const fromX2=parseFloat(beatLineEls[col]?.getAttribute('x2'))||TICK_XS[col];
        const fromY2=parseFloat(beatLineEls[col]?.getAttribute('y2'))||0;
        let ts0=null;
        (function(c,fx2,fy2){
          function anim(ts){
            if(!ts0)ts0=ts;
            const t=Math.min((ts-ts0)/dur,1),ease=easeOut(t);
            if(beatLineEls[c]){beatLineEls[c].setAttribute('x2',fx2+(TICK_XS[c]-fx2)*ease);beatLineEls[c].setAttribute('y2',fy2+(27-fy2)*ease);}
            if(t<1)requestAnimationFrame(anim);
            else{beatLineExtended[c]=false;if(beatLineEls[c]){beatLineEls[c].setAttribute('x2',TICK_XS[c]);beatLineEls[c].setAttribute('y2',27);}}
          }
          requestAnimationFrame(anim);
        })(col,fromX2,fromY2);
      }
    } else {
      rulerLinesCollapsed=false;
      for(let col=0;col<12;col++){
        const targetX2=TICK_XS[col]+beatDotOffsetX[col];
        let ts0=null;
        (function(c,tx2){
          function anim(ts){
            if(!ts0)ts0=ts;
            const t=Math.min((ts-ts0)/dur,1),ease=easeOut(t);
            if(beatLineEls[c]){beatLineEls[c].setAttribute('x2',TICK_XS[c]+(tx2-TICK_XS[c])*ease);beatLineEls[c].setAttribute('y2',27+(LINE_EXT_H-27)*ease);}
            if(t<1)requestAnimationFrame(anim);
            else{beatLineExtended[c]=true;if(beatLineEls[c]){beatLineEls[c].setAttribute('x2',tx2);beatLineEls[c].setAttribute('y2',LINE_EXT_H);}}
          }
          requestAnimationFrame(anim);
        })(col,targetX2);
      }
    }
  }

  /* ── Num handles / Row drag ── */
  function createNumHandles() {
    if(numElsCreated){numHandles.forEach(h=>h.el.style.visibility='visible');return;}
    numElsCreated=true;
    for(let n=0;n<5;n++){
      const el=document.createElement('div');
      const top=ROW_TOP_START+n*ROW_GAP;
      el.style.cssText=`position:absolute;top:${top}px;left:${NUM_BASE_X}px;
        transform:translateX(-50%);width:35px;text-align:center;color:#000;
        font-family:"Noto Serif KR",serif;font-size:12px;font-weight:600;
        line-height:normal;cursor:ew-resize;user-select:none;visibility:hidden;z-index:20;`;
      el.textContent=n+1;
      screenEl.appendChild(el);
      numHandles.push({el,row:n,currentX:NUM_BASE_X});
      setupNumDrag(numHandles[n]);
    }
  }

  function setupNumDrag(handle) {
    handle.el.addEventListener('mousedown',(e)=>{if(e.button!==0)return;startRowDrag(handle.row,e.clientX);e.preventDefault();e.stopPropagation();});
    handle.el.addEventListener('dblclick',(e)=>{e.stopPropagation();resetRowAnim(handle.row);});
  }

  function startRowDrag(row, clientX) {
    rowDragging=true; rowDragIdx=row;
    rowDragStartX=clientX/currentScale;
    rowDragStartOffset=rowOffsets[row];
    rowDragStartNumX=numHandles[row]?numHandles[row].currentX:NUM_BASE_X;
  }

  function resetRowAnim(rowIdx) {
    const handle=numHandles[rowIdx];
    const fromX=handle?handle.currentX:NUM_BASE_X;
    const fromOffset=rowOffsets[rowIdx];
    const dur=350; let startTs=null;
    function anim(ts){
      if(!startTs)startTs=ts;
      const t=Math.min((ts-startTs)/dur,1),ease=easeOut(t);
      rowOffsets[rowIdx]=fromOffset*(1-ease);
      if(handle){handle.currentX=fromX+(NUM_BASE_X-fromX)*ease;handle.el.style.left=handle.currentX+'px';}
      wordEls.forEach(({el,originalLeft,row})=>{
        if(row===rowIdx)el.style.left=(((originalLeft+rowOffsets[rowIdx])%1920+1920)%1920)+'px';
      });
      if(t<1)requestAnimationFrame(anim);
      else{rowOffsets[rowIdx]=0;if(handle){handle.currentX=NUM_BASE_X;handle.el.style.left=NUM_BASE_X+'px';}}
    }
    requestAnimationFrame(anim);
  }

  /* ── 재생 시스템 ── */
  function startErase() {
    appState='erasing';
    createNumHandles();
    const eraseLine=document.createElement('div');
    eraseLine.style.cssText=`position:absolute;top:430px;width:5px;height:200px;background:#000;pointer-events:none;`;
    coverBox=document.createElement('div');
    coverBox.style.cssText=`position:absolute;top:437px;left:0;width:0;height:205px;background:#fff;pointer-events:none;`;
    screenEl.appendChild(coverBox); screenEl.appendChild(eraseLine);
    let numShown=false, eraseStartTs=null;
    function eraseLoop(ts){
      if(!eraseStartTs)eraseStartTs=ts;
      const t=Math.min((ts-eraseStartTs)/ERASE_DUR,1);
      const lineX=LINE_START_X+(LINE_END_X-LINE_START_X)*easeOut(t);
      eraseLine.style.left=lineX+'px'; coverBox.style.width=Math.max(0,lineX)+'px';
      if(!numShown&&lineX>=1900){numHandles.forEach(h=>h.el.style.visibility='visible');numShown=true;}
      if(t<1)requestAnimationFrame(eraseLoop);
      else{eraseLine.remove();coverBox.style.width='1920px';setTimeout(()=>startWords(),500);}
    }
    requestAnimationFrame(eraseLoop);
  }

  function startWords() {
    timeBar=document.createElement('div');
    timeBar.style.cssText=`position:absolute;top:27px;left:${TB_LEFT}px;height:2.5px;width:0;background:#000;pointer-events:none;z-index:5;`;
    screenEl.appendChild(timeBar);
    if(!rulerResetOverlay.parentNode)screenEl.appendChild(rulerResetOverlay);
    initBeatLines();
    wordElapsed=0; nextBeatIdx=0; wordEls=[];
    schedNextIdx=0; scheduledSet.clear();
    audioOrigin = audioCtx ? audioCtx.currentTime : 0;
    appState='playing'; wordStartTs=null; playbackRate=1;
    wordRafId=requestAnimationFrame(wordLoop);
  }

  function wordLoop(ts) {
    if(!wordStartTs)wordStartTs=ts;
    const dt=ts-wordStartTs; wordStartTs=ts;
    wordElapsed=Math.max(0,Math.min(TOTAL_DUR,wordElapsed+dt*playbackRate));
    if(playbackRate<0){
      wordEls=wordEls.filter(({el,beatIndex})=>{
        if(beatIndex*BEAT_MS>wordElapsed){el.remove();return false;}return true;
      });
      nextBeatIdx=Math.min(nextBeatIdx,Math.floor(wordElapsed/BEAT_MS)+1);
      schedNextIdx=nextBeatIdx; scheduledSet.clear();
      audioOrigin = audioCtx ? audioCtx.currentTime - wordElapsed/1000 : 0;
    }
    /* ── 오디오 lookahead 스케줄링 ── */
    if (audioCtx) {
      while (schedNextIdx < EVENTS.length &&
             wordElapsed + SCHED_AHEAD >= schedNextIdx * BEAT_MS) {
        if (!scheduledSet.has(schedNextIdx)) {
          const sev = EVENTS[schedNextIdx];
          const beatAudioTime = audioOrigin + schedNextIdx * BEAT_MS / 1000;
          playBeat(sev.col, sev.style, beatAudioTime);
          scheduledSet.add(schedNextIdx);
        }
        schedNextIdx++;
      }
    }

    while(nextBeatIdx<EVENTS.length&&wordElapsed>=nextBeatIdx*BEAT_MS){
      const ev=EVENTS[nextBeatIdx];
      if(ev.row!==lastSentRow){
        if(lastSentRow>=0&&beatDotEls.length)beatDotEls.forEach(d=>{if(d)d.setAttribute('fill','none');});
        lastSentRow=ev.row;
      }
      if(beatLineSvg&&ev.row===0&&!beatLineExtended[ev.col])animateLineExtend(ev.col,LINE_EXT_H);
      if(beatDotEls[ev.col])beatDotEls[ev.col].setAttribute('fill','#000');
      const newBase=styleBaseY(ev.style);
      if(newBase!==colBaseY[ev.col]){
        const oldAbsY=colBaseY[ev.col]+beatDotOffsetY[ev.col];
        colBaseY[ev.col]=newBase;
        const minOff=newBase===COL_DOT_Y-50?0:newBase===COL_DOT_Y+50?-100:-50;
        const maxOff=newBase===COL_DOT_Y+50?0:newBase===COL_DOT_Y-50?100:50;
        beatDotOffsetY[ev.col]=Math.max(minOff,Math.min(maxOff,oldAbsY-newBase));
        const fromY=parseFloat(beatDotEls[ev.col]?.getAttribute('cy'))||COL_DOT_Y;
        const toY=newBase+beatDotOffsetY[ev.col];
        const fromX=parseFloat(beatDotEls[ev.col]?.getAttribute('cx'))||TICK_XS[ev.col];
        const toX=TICK_XS[ev.col]+beatDotOffsetX[ev.col]*toY/LINE_EXT_H;
        const dur=200; let ts0=null;
        (function(c,fy,ty,fx,tx){
          function anim(ts){
            if(!ts0)ts0=ts;
            const t=Math.min((ts-ts0)/dur,1),ease=easeOut(t);
            if(beatDotEls[c]){beatDotEls[c].setAttribute('cy',fy+(ty-fy)*ease);beatDotEls[c].setAttribute('cx',fx+(tx-fx)*ease);}
            if(t<1)requestAnimationFrame(anim);
          }
          requestAnimationFrame(anim);
        })(ev.col,fromY,toY,fromX,toX);
      }
      if(ev.word){
        const el=document.createElement('div');
        const top=ROW_TOP_START+ev.row*ROW_GAP;
        const originalLeft=TICK_XS[ev.col];
        const colApplied=beatDotOffsetX[ev.col]!==0?beatDotOffsetX[ev.col]*top/COL_DOT_Y:0;
        const baseLeft=originalLeft+colApplied;
        el.style.cssText=getWordStyle(ev.style)+`top:${top}px;left:${(((baseLeft+rowOffsets[ev.row])%1920)+1920)%1920}px;width:${tickWidth(ev.col)}px;`;
        el.textContent=ev.word; el._baseStyle=ev.style;
        colLatestWordEl[ev.col]=el;
        el.addEventListener('mousedown',(e)=>{if(e.button!==0)return;startRowDrag(ev.row,e.clientX);e.preventDefault();e.stopPropagation();});
        el.addEventListener('dblclick',(e)=>{e.stopPropagation();resetRowAnim(ev.row);});
        screenEl.appendChild(el);
        wordEls.push({el,beatIndex:nextBeatIdx,originalLeft:baseLeft,row:ev.row,col:ev.col});
      }
      nextBeatIdx++;
    }
    timeBar.style.width=(Math.min(wordElapsed/TOTAL_DUR,1)*TB_W)+'px';
    if(wordElapsed<TOTAL_DUR){wordRafId=requestAnimationFrame(wordLoop);}
    else{timeBar.style.width=TB_W+'px';appState='ended';}
  }

  function pauseWords(){cancelAnimationFrame(wordRafId);wordRafId=null;wordStartTs=null;appState='paused';}
  function resumeWords(){appState='playing';wordStartTs=null;playbackRate=1;wordRafId=requestAnimationFrame(wordLoop);}
  function replayWords(){
    const startW=parseFloat(timeBar.style.width)||0;
    const RESET_DUR=350; let resetTs=null;
    function resetLoop(ts){
      if(!resetTs)resetTs=ts;
      const t=Math.min((ts-resetTs)/RESET_DUR,1);
      timeBar.style.width=(startW*(1-t))+'px';
      if(t<1)requestAnimationFrame(resetLoop);
      else{
        wordEls.forEach(({el})=>el.remove()); wordEls=[];
        if(coverBox)coverBox.style.width='1920px';
        lastSentRow=-1; colLatestWordEl.fill(null);
        wordElapsed=0; nextBeatIdx=0; appState='playing'; wordStartTs=null; playbackRate=1;
        schedNextIdx=0; scheduledSet.clear();
        audioOrigin = audioCtx ? audioCtx.currentTime : 0;
        wordRafId=requestAnimationFrame(wordLoop);
      }
    }
    requestAnimationFrame(resetLoop);
  }

  /* ── 공용 액션 함수 ── */
  function doPlay(){
    if (!audioCtx) {
      initAudio().then(() => {
        if(appState==='idle')    startErase();
        else if(appState==='playing')pauseWords();
        else if(appState==='paused') resumeWords();
        else if(appState==='ended')  replayWords();
      }).catch(e => console.warn('[audio] init:', e));
    } else {
      if(appState==='idle')    startErase();
      else if(appState==='playing')pauseWords();
      else if(appState==='paused') resumeWords();
      else if(appState==='ended')  replayWords();
    }
  }
  function doChange(){ showView('world_list'); }
  function doErase(){
    selectedCol=-1;
    beatDotEls.forEach(d=>{if(d)d.setAttribute('r',6);});
    for(let row=0;row<rowOffsets.length;row++)resetRowAnim(row);
    for(let col=0;col<12;col++)resetBeatLine(col);
  }
  function doRuler(){ rulerResetOverlay.click(); }
  function doSelectCol(col){
    selectedCol=col;
    beatDotEls.forEach((d,i)=>{if(!d)return;d.setAttribute('r',i===selectedCol?9:6);});
  }
  function doColMove(dir){
    if(selectedCol<0)doSelectCol(dir>0?0:11);
    else doSelectCol((selectedCol+dir+12)%12);
  }
  function doMove(dir){
    if(selectedCol<0||!beatDotEls[selectedCol])return;
    beatDotOffsetX[selectedCol] += dir * COL_MOVE_STEP; /* 1/2박 단위, SYNC_RATIO 미적용 */
    const dotY=colBaseY[selectedCol]+beatDotOffsetY[selectedCol];
    const dotX=TICK_XS[selectedCol]+beatDotOffsetX[selectedCol]*dotY/LINE_EXT_H;
    beatDotEls[selectedCol].setAttribute('cx',dotX);
    if(beatLineEls[selectedCol])beatLineEls[selectedCol].setAttribute('x2',TICK_XS[selectedCol]+beatDotOffsetX[selectedCol]);
  }
  function doVol(dir){
    if(selectedCol<0)return;
    const col=selectedCol;
    /* 시각: 원 위아래 이동 */
    const minOff=colBaseY[col]===COL_DOT_Y-50?0:colBaseY[col]===COL_DOT_Y+50?-100:-50;
    const maxOff=colBaseY[col]===COL_DOT_Y+50?0:colBaseY[col]===COL_DOT_Y-50?100:50;
    beatDotOffsetY[col]=Math.max(minOff,Math.min(maxOff,beatDotOffsetY[col]+dir*VOL_STEP));
    const dotY=colBaseY[col]+beatDotOffsetY[col];
    const dotX=TICK_XS[col]+beatDotOffsetX[col]*dotY/LINE_EXT_H;
    if(beatDotEls[col]){beatDotEls[col].setAttribute('cx',dotX);beatDotEls[col].setAttribute('cy',dotY);}
    const el=colLatestWordEl[col];
    if(el&&el._baseStyle!==undefined)applyDynamicStyle(el,el._baseStyle,-beatDotOffsetY[col]/DRAG_FULL_PX);
    /* 오디오: 2클릭마다 레벨 변경 */
    beatVolAccum[col] += dir;
    if(Math.abs(beatVolAccum[col]) >= VOL_CLICKS_PER_LEVEL){
      beatVolLevel[col] = Math.max(VOL_LEVEL_MIN, Math.min(VOL_LEVEL_MAX,
                            beatVolLevel[col] + Math.sign(beatVolAccum[col])));
      beatVolAccum[col] = 0;
    }
  }
  function doSpeed(dir){
    if(appState!=='playing'&&appState!=='paused')return;
    playbackRate=Math.max(SPD_MIN,Math.min(SPD_MAX,playbackRate+dir*SPD_STEP));
  }
  function doRow(dir){
    if(appState!=='playing'&&appState!=='paused')return;
    const currentRow=lastSentRow>=0?lastSentRow:0;
    rowOffsets[currentRow]+=dir*ROW_MOVE_STEP;
    wordEls.forEach(({el,originalLeft,row})=>{
      if(row===currentRow)el.style.left=(((originalLeft+rowOffsets[currentRow])%1920+1920)%1920)+'px';
    });
    if(numHandles[currentRow]){
      numHandles[currentRow].currentX=(((numHandles[currentRow].currentX+dir*ROW_MOVE_STEP)%1920)+1920)%1920;
      numHandles[currentRow].el.style.left=numHandles[currentRow].currentX+'px';
    }
  }

  /* ── 이벤트 핸들러 ── */
  let isMuted = false;

  function doMute() {
    isMuted = !isMuted;
    const screen = document.getElementById('screen');
    if (screen) screen.style.opacity = isMuted ? '0.5' : '1';
  }

  function handleKeyDown(e){
    if(e.code==='Enter')    {e.preventDefault();doRuler();return;}
    if(e.code==='Escape')   {doErase();return;}
    if(e.code==='Space')    {e.preventDefault();doPlay();return;}
    if(e.code==='Backspace'){e.preventDefault();doChange();return;}
    if(e.code==='KeyM')     {doMute();return;}
    if(e.code==='ArrowUp')  {e.preventDefault();doVol(-1);return;}
    if(e.code==='ArrowDown'){e.preventDefault();doVol(1);return;}
    const colMap={'Digit1':0,'Digit2':1,'Digit3':2,'Digit4':3,'Digit5':4,'Digit6':5,'Digit7':6,'Digit8':7,'Digit9':8,'Digit0':9,'Minus':10,'Equal':11};
    if(colMap[e.code]!==undefined){e.preventDefault();doSelectCol(colMap[e.code]);return;}
    if(selectedCol>=0&&(e.code==='ArrowLeft'||e.code==='ArrowRight')){e.preventDefault();doMove(e.code==='ArrowRight'?1:-1);return;}
    if(e.code==='KeyA'||e.code==='KeyD'){e.preventDefault();doRow(e.code==='KeyD'?1:-1);return;}
  }

  function handleMouseMove(e){
    if(rowDragging){
      const dx=e.clientX/currentScale-rowDragStartX;
      const handle=numHandles[rowDragIdx];
      if(handle){handle.currentX=(((rowDragStartNumX+dx)%1920)+1920)%1920;handle.el.style.left=handle.currentX+'px';}
      rowOffsets[rowDragIdx]=rowDragStartOffset+dx;
      wordEls.forEach(({el,originalLeft,row})=>{
        if(row===rowDragIdx)el.style.left=(((originalLeft+rowOffsets[rowDragIdx])%1920+1920)%1920)+'px';
      });
    }
    if(colDragCol<0)return;
    if(dragAxis===null){
      const adx=Math.abs(e.clientX-colDragStartMX), ady=Math.abs(e.clientY-colDragStartMY);
      if(adx>=5||ady>=5)dragAxis=adx>=ady?'x':'y'; else return;
    }
    const col=colDragCol;
    const dx=(e.clientX-colDragStartMX)/currentScale, dy=(e.clientY-colDragStartMY)/currentScale;
    if(dragAxis==='x'){
      beatDotOffsetX[col]=colDragStartOff+dx*SYNC_RATIO;
      const dotY=colBaseY[col]+beatDotOffsetY[col];
      const dotX=TICK_XS[col]+beatDotOffsetX[col]*dotY/LINE_EXT_H;
      if(beatDotEls[col])beatDotEls[col].setAttribute('cx',dotX);
      if(beatLineEls[col])beatLineEls[col].setAttribute('x2',TICK_XS[col]+beatDotOffsetX[col]);
    } else {
      const rawOff=colDragStartOffY+dy*SYNC_RATIO;
      const minOff=colBaseY[col]===COL_DOT_Y-50?0:colBaseY[col]===COL_DOT_Y+50?-100:-50;
      const maxOff=colBaseY[col]===COL_DOT_Y+50?0:colBaseY[col]===COL_DOT_Y-50?100:50;
      beatDotOffsetY[col]=Math.max(minOff,Math.min(maxOff,rawOff));
      const dotY=colBaseY[col]+beatDotOffsetY[col];
      const interp=TICK_XS[col]+beatDotOffsetX[col]*dotY/LINE_EXT_H;
      if(beatDotEls[col]){beatDotEls[col].setAttribute('cx',interp);beatDotEls[col].setAttribute('cy',dotY);}
      const el=colLatestWordEl[col];
      if(el&&el._baseStyle!==undefined)applyDynamicStyle(el,el._baseStyle,-beatDotOffsetY[col]/DRAG_FULL_PX);
    }
  }

  function handleMouseUp(){ colDragCol=-1; dragAxis=null; rowDragging=false; }

  function handleWheel(e){
    if(appState!=='playing'&&appState!=='paused')return;
    e.preventDefault();
    const isMouse=e.deltaMode===1||Math.abs(e.deltaY)>=50;
    const divisor=isMouse?3:8;
    const jump=e.deltaY>0?BEAT_MS/divisor:-(BEAT_MS/divisor);
    wordElapsed=Math.max(0,Math.min(TOTAL_DUR-1,wordElapsed+jump));
    wordStartTs=null;
    if(jump<0){
      wordEls=wordEls.filter(({el,beatIndex})=>{if(beatIndex*BEAT_MS>wordElapsed){el.remove();return false;}return true;});
      nextBeatIdx=Math.min(nextBeatIdx,Math.floor(wordElapsed/BEAT_MS)+1);
      schedNextIdx=nextBeatIdx; scheduledSet.clear();
      audioOrigin = audioCtx ? audioCtx.currentTime - wordElapsed/1000 : 0;
    }
    if(timeBar)timeBar.style.width=(Math.min(wordElapsed/TOTAL_DUR,1)*TB_W)+'px';
    if(appState==='paused')resumeWords();
  }

  /* ── 시리얼 명령 핸들러 ── */
  function handleCommand(cmd){
    switch(cmd){
      case 'PLAY':   doPlay();      break;
      case 'CHANGE': doChange();    break;
      case 'ERASE':  doErase();     break;
      case 'RULER':  doRuler();     break;
      case 'E+':     doColMove(1);  break;  // 박자 원 선택 →
      case 'E-':     doColMove(-1); break;  // 박자 원 선택 ←
      case 'F+':     doMove(1);     break;  // 선택된 원 →
      case 'F-':     doMove(-1);    break;  // 선택된 원 ←
      case 'G+':     doVol(1);      break;  // 강약 약하게
      case 'G-':     doVol(-1);     break;  // 강약 강하게
    }
  }

  return { mount, unmount, handleCommand };
})());