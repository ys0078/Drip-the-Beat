/* ═══════════════════════════════════════════════
   views/world_list.js — 글로브 월드 리스트 뷰
   ═══════════════════════════════════════════════ */
registerView('world_list', (() => {

  const COUNTRIES = [
    { code:'KR', name:'Korea',    lat:37.5,  lon:127.0, continent:'Asia',   rhythm:'Cyclical' },
    { code:'JP', name:'Japan',    lat:35.7,  lon:139.7, continent:'Asia',   rhythm:'Cyclical' },
    { code:'CN', name:'China',    lat:39.9,  lon:116.4, continent:'Asia',   rhythm:'Periodic' },
    { code:'TH', name:'Thailand', lat:15.9,  lon:100.9, continent:'Asia',   rhythm:'Cyclical' },
    { code:'IN', name:'India',    lat:20.6,  lon:78.9,  continent:'Asia',   rhythm:'Cyclical' },
    { code:'EG', name:'Egypt',    lat:26.8,  lon:30.8,  continent:'Africa', rhythm:'Cyclical' },
    { code:'GR', name:'Greece',   lat:39.1,  lon:21.8,  continent:'Europe', rhythm:'Free' },
    { code:'GB', name:'England',  lat:52.5,  lon:-1.5,  continent:'Europe', rhythm:'Periodic' },
    { code:'RU', name:'Russia',   lat:61.5,  lon:105.3, continent:'Europe', rhythm:'Periodic' },
  ];

  const CX=786, CY=786, R=786;
  const GLOB_SCREEN_X=296, GLOB_SCREEN_Y=-236;
  const FILTER_ITEMS = [
    {type:'continent',val:'Africa'},{type:'continent',val:'Asia'},{type:'continent',val:'Europe'},
    {type:'rhythm',val:'Cyclical'},{type:'rhythm',val:'Free'},{type:'rhythm',val:'Periodic'},
  ];

  /* ── 뷰 상태 ── */
  let rotY, rotX, targetRotY, targetRotX, velY, velX;
  let smoothX, smoothY, mouseScreenX, mouseScreenY;
  let targetCircX, targetCircY, smoothCircX, smoothCircY;
  let hoveredCountry, focusedCountry, navMode;
  let activeContinents, activeRhythms, contCursor, rhyCursor;
  let isDragging, dragStartX, dragStartY, rotYStart, rotXStart, prevDragX, prevDragY;
  let currentScale, rafId;
  let canvas, ctx;
  let onKeyDown, onMouseMove, onMouseUp, onResize;
  let filterEls, feat1El, feat2El;

  const DRAG_SENS=0.0025, FRICTION=0.82, MIN_VEL=0.00001, ROT_LERP=0.15;
  const MOUSE_LERP=0.18, CIRCLE_LERP=0.18;

  function matchesFilter(c){
    return (activeContinents.size===0||activeContinents.has(c.continent))&&
           (activeRhythms.size===0||activeRhythms.has(c.rhythm));
  }

  function latLonToXYZ(lat,lon,rotYr,rotXr){
    const φ=lat*Math.PI/180, λ=(lon*Math.PI/180)+rotYr;
    let x=Math.cos(φ)*Math.cos(λ), y=Math.sin(φ), z=Math.cos(φ)*Math.sin(λ);
    const y2=y*Math.cos(rotXr)-z*Math.sin(rotXr);
    const z2=y*Math.sin(rotXr)+z*Math.cos(rotXr);
    return {x,y:y2,z:z2};
  }
  function project(x,y,z){ return {sx:CX-x*R,sy:CY-y*R,visible:z>0}; }

  function shortestAngle(from,to){
    const d=((to-from)%(2*Math.PI)+3*Math.PI)%(2*Math.PI)-Math.PI;
    return from+d;
  }

  function centerCountry(c){
    focusedCountry=c;
    navMode='rotary';
    targetRotY=shortestAngle(targetRotY,Math.PI/2-c.lon*Math.PI/180);
    targetRotX=Math.max(-Math.PI/2,Math.min(Math.PI/2,c.lat*Math.PI/180));
    velY=0; velX=0;
  }

  /* ── 위/경도 그리드 (가로 N칸 × 세로 M칸) ──
     가로 이동(F)  → 같은 위도 밴드(row) 안에서 경도순 이동
     세로 이동(G)  → 같은 경도 밴드(col) 안에서 위도순 이동
     → 같은 행/열 안에서만 옮겨다니므로 다음 국가를 예측 가능 */
  const LON_BAND=45, LAT_BAND=30;
  function gridCol(c){ return Math.floor((c.lon+180)/LON_BAND); }
  function gridRow(c){ return Math.floor((c.lat+90)/LAT_BAND); }

  function pickInitial(){
    const visible=COUNTRIES.filter(c=>{
      const {z}=latLonToXYZ(c.lat,c.lon,rotY,rotX);
      return z>0&&matchesFilter(c);
    });
    if(!visible.length)return null;
    let best=null,bd=Infinity;
    visible.forEach(c=>{
      const {x,y,z}=latLonToXYZ(c.lat,c.lon,rotY,rotX);
      const p=project(x,y,z);
      const d=Math.hypot(p.sx-CX,p.sy-CY);
      if(d<bd){bd=d;best=c;}
    });
    return best;
  }

  /* axis:'row'→가로(경도) 이동, 'col'→세로(위도) 이동 / dir: +1(동·북) or -1(서·남) */
  function findGridNeighbor(axis,dir){
    if(!focusedCountry) return pickInitial();
    const group=COUNTRIES.filter(c=>{
      if(!matchesFilter(c))return false;
      return axis==='row' ? gridRow(c)===gridRow(focusedCountry)
                           : gridCol(c)===gridCol(focusedCountry);
    });
    if(group.length<=1)return null;          // 같은 행/열에 다른 나라 없음
    const key=axis==='row'?'lon':'lat';
    group.sort((a,b)=>a[key]-b[key]);
    let idx=group.findIndex(c=>c.code===focusedCountry.code);
    if(idx===-1){                             // 포커스가 필터로 제외된 경우
      idx=0;
      for(let i=0;i<group.length;i++){ if(group[i][key]<=focusedCountry[key]) idx=i; }
    }
    const n=group.length;
    return group[((idx+dir)%n+n)%n];
  }

  function drawGlobe(){
    ctx.clearRect(0,0,1572,1572);
    ctx.strokeStyle='rgba(0,0,0,0.07)'; ctx.lineWidth=0.8;
    for(let lon=-180;lon<180;lon+=30){
      ctx.beginPath(); let first=true;
      for(let lat=-90;lat<=90;lat+=2){
        const {x,y,z}=latLonToXYZ(lat,lon,rotY,rotX);
        const p=project(x,y,z);
        if(!p.visible){first=true;continue;}
        if(first){ctx.moveTo(p.sx,p.sy);first=false;}else ctx.lineTo(p.sx,p.sy);
      }
      ctx.stroke();
    }
    for(let lat=-60;lat<=60;lat+=30){
      ctx.beginPath(); let first=true;
      for(let lon=-180;lon<=180;lon+=2){
        const {x,y,z}=latLonToXYZ(lat,lon,rotY,rotX);
        const p=project(x,y,z);
        if(!p.visible){first=true;continue;}
        if(first){ctx.moveTo(p.sx,p.sy);first=false;}else ctx.lineTo(p.sx,p.sy);
      }
      ctx.stroke();
    }
    COUNTRIES.forEach(c=>{
      const {x,y,z}=latLonToXYZ(c.lat,c.lon,rotY,rotX);
      const p=project(x,y,z);
      if(!p.visible)return;
      const matches=matchesFilter(c);
      const isFocused=focusedCountry&&c.code===focusedCountry.code;
      const alpha=matches?1:0.2;
      ctx.beginPath();
      ctx.arc(p.sx,p.sy,isFocused?6:3.5,0,Math.PI*2);
      ctx.fillStyle=`rgba(0,0,0,${alpha})`; ctx.fill();
      if(isFocused){ctx.strokeStyle=`rgba(0,0,0,${alpha})`;ctx.lineWidth=1.5;ctx.stroke();}
      ctx.font='400 18px "Noto Serif KR",serif';
      ctx.fillStyle=`rgba(0,0,0,${alpha})`;
      ctx.fillText(c.name,p.sx+8,p.sy+6);
    });
    /* 커서 원 도려내기 */
    const cx2=smoothX-GLOB_SCREEN_X, cy2=smoothY-GLOB_SCREEN_Y;
    ctx.save();
    ctx.globalCompositeOperation='destination-out';
    ctx.beginPath(); ctx.arc(cx2,cy2,7.5,0,Math.PI*2);
    ctx.fillStyle='rgba(0,0,0,1)'; ctx.fill();
    ctx.restore();
  }

  function loop(){
    const ptrH=document.getElementById('ptr-h');
    const ptrV=document.getElementById('ptr-v');
    const ptrCirc=document.getElementById('ptr-circle');
    if(!ptrH)return;

    if(!isDragging){
      velY*=FRICTION; velX*=FRICTION;
      if(Math.abs(velY)>MIN_VEL)targetRotY+=velY;
      if(Math.abs(velX)>MIN_VEL){targetRotX+=velX;targetRotX=Math.max(-Math.PI/2,Math.min(Math.PI/2,targetRotX));}
    }
    rotY+=(targetRotY-rotY)*ROT_LERP;
    rotX+=(targetRotX-rotX)*ROT_LERP;

    /* 로터리(F/G)로 선택한 국가 → 십자선/정보가 그 위치(그리드)를 따라가도록 */
    if(navMode==='rotary'&&focusedCountry){
      const {x,y,z}=latLonToXYZ(focusedCountry.lat,focusedCountry.lon,rotY,rotX);
      if(z>0){
        const p=project(x,y,z);
        mouseScreenX=GLOB_SCREEN_X+p.sx;
        mouseScreenY=GLOB_SCREEN_Y+p.sy;
        targetCircX=mouseScreenX; targetCircY=mouseScreenY;
        document.getElementById('pointer-svg').style.opacity='1';
        feat1El.style.opacity='1'; feat2El.style.opacity='1';
        feat1El.textContent=focusedCountry.continent;
        feat2El.textContent=focusedCountry.rhythm;
      }
    }

    smoothX+=(mouseScreenX-smoothX)*MOUSE_LERP;
    smoothY+=(mouseScreenY-smoothY)*MOUSE_LERP;
    smoothCircX+=(targetCircX-smoothCircX)*CIRCLE_LERP;
    smoothCircY+=(targetCircY-smoothCircY)*CIRCLE_LERP;

    const marginX=(window.innerWidth-1920*currentScale)/2;
    const marginY=(window.innerHeight-1080*currentScale)/2;
    const extraX=marginX/currentScale, extraY=marginY/currentScale;
    ptrH.setAttribute('x1',-extraX); ptrH.setAttribute('y1',smoothY);
    ptrH.setAttribute('x2',1920+extraX); ptrH.setAttribute('y2',smoothY);
    ptrV.setAttribute('x1',smoothX); ptrV.setAttribute('y1',-extraY);
    ptrV.setAttribute('x2',smoothX); ptrV.setAttribute('y2',1080+extraY);
    ptrCirc.setAttribute('cx',smoothX); ptrCirc.setAttribute('cy',smoothY);
    /* feat: position:fixed on body → viewport 좌표 변환 */
    if(feat1El.style.opacity!=='0'){
      const viewY=marginY+smoothY*currentScale;
      feat1El.style.top=Math.max(70,viewY-30*currentScale)+'px';
      feat2El.style.top=Math.max(70,viewY-1*currentScale)+'px';
    }
    drawGlobe();
    rafId=requestAnimationFrame(loop);
  }

  function scaleScreen(){
    const el=document.getElementById('screen');
    if(!el)return;
    currentScale=Math.min(window.innerWidth/1920,window.innerHeight/1080);
    el.style.transform=`scale(${currentScale})`;
    el.style.marginLeft=`${(window.innerWidth-1920*currentScale)/2}px`;
    el.style.marginTop=`${(window.innerHeight-1080*currentScale)/2}px`;
    const fs=Math.round(18*currentScale*10)/10;
    const gap=3*currentScale;
    document.querySelectorAll('.filter-row').forEach(el=>el.style.fontSize=fs+'px');
    const fw=document.querySelector('.filter-wrap');
    if(fw)fw.style.gap=gap+'px';
    const featFs=Math.round(21*currentScale*10)/10;
    if(feat1El) feat1El.style.fontSize=featFs+'px';
    if(feat2El) feat2El.style.fontSize=featFs+'px';
  }

  function updateFilterUI(){
    filterEls.forEach((el,idx)=>{
      const item=FILTER_ITEMS[idx]; if(!item)return;
      const isActive=item.type==='continent'?activeContinents.has(item.val):activeRhythms.has(item.val);
      el.classList.toggle('active',isActive);
      const isCursor = item.type==='continent' ? idx===contCursor : (idx-3)===rhyCursor;
      el.classList.toggle('cursor',isCursor);
    });
  }

  /* ══════════════════════════════════════
     MOUNT
  ══════════════════════════════════════ */
  function mount(){
    rotY=(Math.PI/2)-(127.0*Math.PI/180); rotX=(37.5*Math.PI/180);
    targetRotY=rotY; targetRotX=rotX; velY=0; velX=0;
    smoothX=960; smoothY=540; mouseScreenX=960; mouseScreenY=540;
    targetCircX=960; targetCircY=540; smoothCircX=960; smoothCircY=540;
    hoveredCountry=null; focusedCountry=null; navMode='mouse';
    activeContinents=new Set(); activeRhythms=new Set(); contCursor=0; rhyCursor=0;
    isDragging=false; currentScale=1;

    document.getElementById('app').innerHTML = `
      <div class="filter-wrap">
        <div class="filter-row" id="filter-continent">
          <span class="filter-item" data-val="Africa">Africa</span>
          <span class="filter-sep"> / </span>
          <span class="filter-item" data-val="Asia">Asia</span>
          <span class="filter-sep"> / </span>
          <span class="filter-item" data-val="Europe">Europe</span>
        </div>
        <div class="filter-row" id="filter-rhythm">
          <span class="filter-item" data-val="Cyclical">Cyclical</span>
          <span class="filter-sep"> / </span>
          <span class="filter-item" data-val="Free">Free</span>
          <span class="filter-sep"> / </span>
          <span class="filter-item" data-val="Periodic">Periodic</span>
        </div>
      </div>
      <div class="screen world-view" id="screen">
        <div id="globe-wrap">
          <canvas id="globe-canvas" width="1572" height="1572"></canvas>
        </div>
        <div id="globe-hitarea"></div>
        <svg id="pointer-svg">
          <line id="ptr-h" stroke="#000" stroke-width="0.85"/>
          <line id="ptr-v" stroke="#000" stroke-width="0.85"/>
          <circle id="ptr-circle" r="7.5" fill="none" stroke="#000" stroke-width="2.5"/>
        </svg>
      </div>`;

    /* feat1/feat2를 body에 생성 — transform:scale() 영향 밖, position:fixed 정상 작동 */
    feat1El=document.createElement('div'); feat1El.className='point-feature'; feat1El.id='feat1';
    feat2El=document.createElement('div'); feat2El.className='point-feature'; feat2El.id='feat2';
    document.body.appendChild(feat1El); document.body.appendChild(feat2El);

    canvas=document.getElementById('globe-canvas');
    ctx=canvas.getContext('2d');
    const DPR=window.devicePixelRatio||1;
    canvas.width=1572*DPR; canvas.height=1572*DPR;
    canvas.style.width='1572px'; canvas.style.height='1572px';
    ctx.scale(DPR,DPR);

    filterEls=[...document.querySelectorAll('.filter-item')];
    filterEls.forEach((el,idx)=>{
      el.addEventListener('click',()=>{
        const item=FILTER_ITEMS[idx]; if(!item)return;
        const set=item.type==='continent'?activeContinents:activeRhythms;
        if(set.has(item.val))set.delete(item.val); else set.add(item.val);
        if(item.type==='continent') contCursor=idx; else rhyCursor=idx-5;
        updateFilterUI();
      });
    });
    updateFilterUI();

    const hitarea=document.getElementById('globe-hitarea');
    hitarea.addEventListener('mousedown',(e)=>{
      isDragging=true;
      dragStartX=e.clientX; dragStartY=e.clientY;
      prevDragX=e.clientX; prevDragY=e.clientY;
      rotYStart=rotY; rotXStart=rotX;
      targetRotY=rotY; targetRotX=rotX;
      velY=0; velX=0; e.preventDefault();
    });
    hitarea.addEventListener('mousemove',(e)=>{
      navMode='mouse';
      const sx=(e.clientX-(window.innerWidth-1920*currentScale)/2)/currentScale;
      const sy=(e.clientY-(window.innerHeight-1080*currentScale)/2)/currentScale;
      document.getElementById('pointer-svg').style.opacity='1';
      let nearest=null,nearDist=40;
      COUNTRIES.forEach(c=>{
        if(!matchesFilter(c))return;
        const {x,y,z}=latLonToXYZ(c.lat,c.lon,rotY,rotX);
        if(z<=0)return;
        const p=project(x,y,z);
        const d=Math.hypot(sx-(GLOB_SCREEN_X+p.sx),sy-(GLOB_SCREEN_Y+p.sy));
        if(d<nearDist){nearDist=d;nearest={...c,px:GLOB_SCREEN_X+p.sx,py:GLOB_SCREEN_Y+p.sy};}
      });
      hoveredCountry=nearest;
      targetCircX=nearest?nearest.px:sx;
      targetCircY=nearest?nearest.py:sy;
      if(nearest){
        feat1El.style.opacity='1'; feat2El.style.opacity='1';
        feat1El.textContent=nearest.continent; feat2El.textContent=nearest.rhythm;
      } else { feat1El.style.opacity='0'; feat2El.style.opacity='0'; }
    });
    hitarea.addEventListener('mouseleave',()=>{
      document.getElementById('pointer-svg').style.opacity='0';
      feat1El.style.opacity='0'; feat2El.style.opacity='0';
      hoveredCountry=null;
    });
    hitarea.addEventListener('click',(e)=>{
      const sx=(e.clientX-(window.innerWidth-1920*currentScale)/2)/currentScale;
      const sy=(e.clientY-(window.innerHeight-1080*currentScale)/2)/currentScale;
      let nearest=null,nearDist=30;
      COUNTRIES.forEach(c=>{
        const {x,y,z}=latLonToXYZ(c.lat,c.lon,rotY,rotX);
        if(z<=0)return;
        const p=project(x,y,z);
        const d=Math.hypot(sx-(GLOB_SCREEN_X+p.sx),sy-(GLOB_SCREEN_Y+p.sy));
        if(d<nearDist){nearDist=d;nearest=c;}
      });
      if(nearest)selectCountry(nearest);
    });

    onMouseMove=(e)=>{
      navMode='mouse';
      mouseScreenX=(e.clientX-(window.innerWidth-1920*currentScale)/2)/currentScale;
      mouseScreenY=(e.clientY-(window.innerHeight-1080*currentScale)/2)/currentScale;
      if(isDragging){
        const dx=(e.clientX-dragStartX)/currentScale, dy=(e.clientY-dragStartY)/currentScale;
        targetRotY=rotYStart+dx*DRAG_SENS;
        targetRotX=Math.max(-Math.PI/2,Math.min(Math.PI/2,rotXStart+dy*DRAG_SENS));
        velY=(e.clientX-prevDragX)/currentScale*DRAG_SENS;
        velX=(e.clientY-prevDragY)/currentScale*DRAG_SENS;
        prevDragX=e.clientX; prevDragY=e.clientY;
      }
    };
    onMouseUp=()=>{ isDragging=false; };
    onKeyDown=(e)=>{
      if(e.code==='Backspace'){e.preventDefault(); showView('world_list');}
      if(e.code==='Enter'){e.preventDefault(); doSelectCountry();}
    };
    onResize=scaleScreen;

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize',    onResize);

    scaleScreen();
    rafId=requestAnimationFrame(loop);
  }

  /* ══════════════════════════════════════
     UNMOUNT
  ══════════════════════════════════════ */
  function unmount(){
    cancelAnimationFrame(rafId);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup',   onMouseUp);
    document.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize',    onResize);
    if(feat1El&&feat1El.parentNode) feat1El.remove();
    if(feat2El&&feat2El.parentNode) feat2El.remove();
    document.getElementById('app').innerHTML='';
  }

  /* 국가 코드 → 뷰 이름 매핑
     새 나라 추가 시 여기만 수정 */
  const COUNTRY_VIEW = {
    'KR': 'main',
    'IN': 'tala',
    'JP': 'odori',
    /* 'BR': 'samba',  */
  };

  function selectCountry(c){
    const view = COUNTRY_VIEW[c.code];
    if (!view) return; /* 매핑 없는 국가 */
    if (!views[view]) { console.warn('[world_list] 뷰 미등록:', view, '→ index.html에 해당 config 파일이 로드됐는지 확인하세요.'); return; }
    showView(view);
  }

  function doSelectCountry(){
    const c=focusedCountry||hoveredCountry||pickInitial();
    if(c){
      if(!focusedCountry) centerCountry(c);
      selectCountry(c);
    }
  }

  /* ── 시리얼 명령 핸들러 ── */
  function handleCommand(cmd){
    switch(cmd){
      case 'CHANGE': showView('world_list'); break;
      case 'PLAY':   doSelectCountry();  break;   // SW A, SW E → 박자(국가) 선택
      case 'FSEL1':  doContToggle();     break;   // SW B → 대륙 필터 토글
      case 'FSEL2':  doRhyToggle();      break;   // SW D → 리듬 필터 토글
      case 'H+':     doContMove(-1);     break;   // 로터리 B → 대륙 커서 ←
      case 'H-':     doContMove(1);      break;   // 로터리 B → 대륙 커서 →
      case 'GVOL+':  doRhyMove(-1);      break;   // 로터리 D → 리듬 커서 ←
      case 'GVOL-':  doRhyMove(1);       break;   // 로터리 D → 리듬 커서 →
      case 'F+':   { const n=findGridNeighbor('col', 1); if(n)centerCountry(n); break; }  // 로터리 A → 세로
      case 'F-':   { const n=findGridNeighbor('col',-1); if(n)centerCountry(n); break; }
      case 'G+':   { const n=findGridNeighbor('row', 1); if(n)centerCountry(n); break; }  // 로터리 B → 가로
      case 'G-':   { const n=findGridNeighbor('row',-1); if(n)centerCountry(n); break; }
    }
  }

  function doContMove(dir){
    contCursor=((contCursor+dir)%3+3)%3;
    updateFilterUI();
  }
  function doRhyMove(dir){
    rhyCursor=((rhyCursor+dir)%3+3)%3;
    updateFilterUI();
  }
  function doContToggle(){
    const item=FILTER_ITEMS[contCursor];
    if(activeContinents.has(item.val)) activeContinents.delete(item.val);
    else activeContinents.add(item.val);
    updateFilterUI();
  }
  function doRhyToggle(){
    const item=FILTER_ITEMS[3+rhyCursor];
    if(activeRhythms.has(item.val)) activeRhythms.delete(item.val);
    else activeRhythms.add(item.val);
    updateFilterUI();
  }

  return { mount, unmount, handleCommand };
})());