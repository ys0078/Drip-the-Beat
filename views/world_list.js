/* ═══════════════════════════════════════════════
   views/world_list.js — 글로브 월드 리스트 뷰
   ═══════════════════════════════════════════════ */
registerView('world_list', (() => {

  const COUNTRIES = [
    { code:'KR', name:'Korea',         lat:37.5,  lon:127.0,  continent:'Asia',    rhythm:'Cyclical' },
    { code:'JP', name:'Japan',         lat:35.7,  lon:139.7,  continent:'Asia',    rhythm:'Cyclical' },
    { code:'CN', name:'China',         lat:39.9,  lon:116.4,  continent:'Asia',    rhythm:'Periodic' },
    { code:'IN', name:'India',         lat:20.6,  lon:78.9,   continent:'Asia',    rhythm:'Cyclical' },
    { code:'ID', name:'Indonesia',     lat:-0.8,  lon:113.9,  continent:'Asia',    rhythm:'Cyclical' },
    { code:'IR', name:'Iran',          lat:32.4,  lon:53.7,   continent:'Asia',    rhythm:'Free' },
    { code:'TR', name:'Turkey',        lat:38.9,  lon:35.2,   continent:'Asia',    rhythm:'Cyclical' },
    { code:'AE', name:'UAE',           lat:23.4,  lon:53.8,   continent:'Asia',    rhythm:'Cyclical' },
    { code:'SA', name:'Saudi Arabia',  lat:23.9,  lon:45.1,   continent:'Asia',    rhythm:'Cyclical' },
    { code:'SY', name:'Syria',         lat:34.8,  lon:38.9,   continent:'Asia',    rhythm:'Free' },
    { code:'LB', name:'Lebanon',       lat:33.9,  lon:35.5,   continent:'Asia',    rhythm:'Free' },
    { code:'JO', name:'Jordan',        lat:30.6,  lon:36.2,   continent:'Asia',    rhythm:'Free' },
    { code:'IQ', name:'Iraq',          lat:33.2,  lon:43.7,   continent:'Asia',    rhythm:'Free' },
    { code:'VN', name:'Vietnam',       lat:14.1,  lon:108.3,  continent:'Asia',    rhythm:'Cyclical' },
    { code:'TH', name:'Thailand',      lat:15.9,  lon:100.9,  continent:'Asia',    rhythm:'Cyclical' },
    { code:'EG', name:'Egypt',         lat:26.8,  lon:30.8,   continent:'Africa',  rhythm:'Cyclical' },
    { code:'MA', name:'Morocco',       lat:31.8,  lon:-7.1,   continent:'Africa',  rhythm:'Cyclical' },
    { code:'DZ', name:'Algeria',       lat:28.0,  lon:1.7,    continent:'Africa',  rhythm:'Cyclical' },
    { code:'TN', name:'Tunisia',       lat:33.9,  lon:9.5,    continent:'Africa',  rhythm:'Cyclical' },
    { code:'NG', name:'Nigeria',       lat:9.1,   lon:8.7,    continent:'Africa',  rhythm:'Poly' },
    { code:'GH', name:'Ghana',         lat:7.9,   lon:-1.0,   continent:'Africa',  rhythm:'Poly' },
    { code:'SN', name:'Senegal',       lat:14.5,  lon:-14.5,  continent:'Africa',  rhythm:'Poly' },
    { code:'ML', name:'Mali',          lat:17.6,  lon:-4.0,   continent:'Africa',  rhythm:'Poly' },
    { code:'BJ', name:'Benin',         lat:9.3,   lon:2.3,    continent:'Africa',  rhythm:'Poly' },
    { code:'TG', name:'Togo',          lat:8.6,   lon:0.8,    continent:'Africa',  rhythm:'Poly' },
    { code:'CI', name:"Cote d'Ivoire", lat:7.5,   lon:-5.5,   continent:'Africa',  rhythm:'Poly' },
    { code:'CM', name:'Cameroon',      lat:3.8,   lon:11.5,   continent:'Africa',  rhythm:'Poly' },
    { code:'CD', name:'DR Congo',      lat:-4.0,  lon:21.8,   continent:'Africa',  rhythm:'Poly' },
    { code:'AO', name:'Angola',        lat:-11.2, lon:17.9,   continent:'Africa',  rhythm:'Poly' },
    { code:'ZA', name:'South Africa',  lat:-30.6, lon:22.9,   continent:'Africa',  rhythm:'Poly' },
    { code:'KE', name:'Kenya',         lat:0.0,   lon:37.9,   continent:'Africa',  rhythm:'Poly' },
    { code:'TZ', name:'Tanzania',      lat:-6.4,  lon:34.9,   continent:'Africa',  rhythm:'Poly' },
    { code:'UG', name:'Uganda',        lat:1.4,   lon:32.3,   continent:'Africa',  rhythm:'Poly' },
    { code:'ET', name:'Ethiopia',      lat:9.1,   lon:40.5,   continent:'Africa',  rhythm:'Free' },
    { code:'SD', name:'Sudan',         lat:12.9,  lon:30.2,   continent:'Africa',  rhythm:'Free' },
    { code:'GR', name:'Greece',        lat:39.1,  lon:21.8,   continent:'Europe',  rhythm:'Free' },
    { code:'BG', name:'Bulgaria',      lat:42.7,  lon:25.5,   continent:'Europe',  rhythm:'Periodic' },
    { code:'RS', name:'Serbia',        lat:44.0,  lon:21.0,   continent:'Europe',  rhythm:'Periodic' },
    { code:'MK', name:'N.Macedonia',   lat:41.6,  lon:21.7,   continent:'Europe',  rhythm:'Periodic' },
    { code:'RO', name:'Romania',       lat:45.9,  lon:24.9,   continent:'Europe',  rhythm:'Periodic' },
    { code:'HU', name:'Hungary',       lat:47.2,  lon:19.5,   continent:'Europe',  rhythm:'Periodic' },
    { code:'PL', name:'Poland',        lat:51.9,  lon:19.1,   continent:'Europe',  rhythm:'Periodic' },
    { code:'DE', name:'Germany',       lat:51.2,  lon:10.5,   continent:'Europe',  rhythm:'Periodic' },
    { code:'FR', name:'France',        lat:46.2,  lon:2.2,    continent:'Europe',  rhythm:'Periodic' },
    { code:'IT', name:'Italy',         lat:41.9,  lon:12.6,   continent:'Europe',  rhythm:'Periodic' },
    { code:'ES', name:'Spain',         lat:40.5,  lon:-3.7,   continent:'Europe',  rhythm:'Periodic' },
    { code:'PT', name:'Portugal',      lat:39.4,  lon:-8.2,   continent:'Europe',  rhythm:'Periodic' },
    { code:'GB', name:'UK',            lat:55.4,  lon:-3.4,   continent:'Europe',  rhythm:'Periodic' },
    { code:'IE', name:'Ireland',       lat:53.1,  lon:-8.2,   continent:'Europe',  rhythm:'Periodic' },
    { code:'SCT',name:'Scotland',      lat:56.5,  lon:-4.2,   continent:'Europe',  rhythm:'Periodic' },
    { code:'RU', name:'Russia',        lat:61.5,  lon:105.3,  continent:'Europe',  rhythm:'Periodic' },
    { code:'UA', name:'Ukraine',       lat:48.4,  lon:31.2,   continent:'Europe',  rhythm:'Periodic' },
    { code:'US', name:'USA',           lat:37.1,  lon:-95.7,  continent:'America', rhythm:'Rhythm Mode' },
    { code:'CA', name:'Canada',        lat:56.1,  lon:-106.3, continent:'America', rhythm:'Rhythm Mode' },
    { code:'MX', name:'Mexico',        lat:23.6,  lon:-102.6, continent:'America', rhythm:'Cyclical' },
    { code:'CU', name:'Cuba',          lat:21.5,  lon:-79.5,  continent:'America', rhythm:'Poly' },
    { code:'BR', name:'Brazil',        lat:-14.2, lon:-51.9,  continent:'America', rhythm:'Poly' },
    { code:'CO', name:'Colombia',      lat:4.6,   lon:-74.3,  continent:'America', rhythm:'Poly' },
    { code:'PE', name:'Peru',          lat:-9.2,  lon:-75.0,  continent:'America', rhythm:'Cyclical' },
    { code:'AR', name:'Argentina',     lat:-38.4, lon:-63.6,  continent:'America', rhythm:'Periodic' },
    { code:'CL', name:'Chile',         lat:-35.7, lon:-71.5,  continent:'America', rhythm:'Cyclical' },
    { code:'VE', name:'Venezuela',     lat:6.4,   lon:-66.6,  continent:'America', rhythm:'Poly' },
    { code:'UY', name:'Uruguay',       lat:-32.5, lon:-55.8,  continent:'America', rhythm:'Periodic' },
    { code:'PY', name:'Paraguay',      lat:-23.4, lon:-58.4,  continent:'America', rhythm:'Periodic' },
    { code:'BO', name:'Bolivia',       lat:-16.3, lon:-63.6,  continent:'America', rhythm:'Cyclical' },
    { code:'EC', name:'Ecuador',       lat:-1.8,  lon:-78.2,  continent:'America', rhythm:'Cyclical' },
    { code:'CR', name:'Costa Rica',    lat:9.7,   lon:-83.8,  continent:'America', rhythm:'Cyclical' },
    { code:'PA', name:'Panama',        lat:8.5,   lon:-80.8,  continent:'America', rhythm:'Poly' },
    { code:'JM', name:'Jamaica',       lat:18.1,  lon:-77.3,  continent:'America', rhythm:'Rhythm Mode' },
    { code:'HT', name:'Haiti',         lat:18.9,  lon:-72.3,  continent:'America', rhythm:'Poly' },
    { code:'DO', name:'Dominican Rep.',lat:18.7,  lon:-70.2,  continent:'America', rhythm:'Poly' },
    { code:'NZ', name:'New Zealand',   lat:-40.9, lon:174.9,  continent:'Oceania', rhythm:'Free' },
    { code:'AU', name:'Australia',     lat:-25.3, lon:133.8,  continent:'Oceania', rhythm:'Free' },
  ];

  const CX=786, CY=786, R=786;
  const GLOB_SCREEN_X=296, GLOB_SCREEN_Y=-236;
  const FILTER_ITEMS = [
    {type:'continent',val:'Africa'},{type:'continent',val:'America'},
    {type:'continent',val:'Asia'},{type:'continent',val:'Europe'},{type:'continent',val:'Oceania'},
    {type:'rhythm',val:'Cyclical'},{type:'rhythm',val:'Free'},
    {type:'rhythm',val:'Poly'},{type:'rhythm',val:'Periodic'},{type:'rhythm',val:'Rhythm Mode'},
  ];

  /* ── 뷰 상태 ── */
  let rotY, rotX, targetRotY, targetRotX, velY, velX;
  let smoothX, smoothY, mouseScreenX, mouseScreenY;
  let targetCircX, targetCircY, smoothCircX, smoothCircY;
  let hoveredCountry, focusedCountry;
  let activeContinents, activeRhythms, filterCursor;
  let isDragging, dragStartX, dragStartY, rotYStart, rotXStart, prevDragX, prevDragY;
  let currentScale, rafId;
  let canvas, ctx;
  let onKeyDown, onMouseMove, onMouseUp, onResize;
  let filterEls;

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
    targetRotY=shortestAngle(targetRotY,Math.PI/2-c.lon*Math.PI/180);
    targetRotX=Math.max(-Math.PI/2,Math.min(Math.PI/2,c.lat*Math.PI/180));
    velY=0; velX=0;
  }

  function findNeighbor(dir){
    const visible=COUNTRIES.filter(c=>{
      const {z}=latLonToXYZ(c.lat,c.lon,rotY,rotX);
      return z>0&&matchesFilter(c);
    });
    if(!visible.length)return null;
    if(!focusedCountry||!visible.find(c=>c.code===focusedCountry.code)){
      let best=null,bd=Infinity;
      visible.forEach(c=>{
        const {x,y,z}=latLonToXYZ(c.lat,c.lon,rotY,rotX);
        const p=project(x,y,z);
        const d=Math.hypot(p.sx-CX,p.sy-CY);
        if(d<bd){bd=d;best=c;}
      });
      return best;
    }
    const {x:fx,y:fy,z:fz}=latLonToXYZ(focusedCountry.lat,focusedCountry.lon,rotY,rotX);
    const fp=project(fx,fy,fz);
    let best=null,bs=Infinity;
    visible.forEach(c=>{
      if(c.code===focusedCountry.code)return;
      const {x,y,z}=latLonToXYZ(c.lat,c.lon,rotY,rotX);
      const p=project(x,y,z);
      const dx=p.sx-fp.sx,dy=p.sy-fp.sy;
      let score;
      if(dir==='right'&&dx>5)      score=dx+Math.abs(dy)*0.5;
      else if(dir==='left'&&dx<-5) score=-dx+Math.abs(dy)*0.5;
      else if(dir==='down'&&dy>5)  score=dy+Math.abs(dx)*0.5;
      else if(dir==='up'&&dy<-5)   score=-dy+Math.abs(dx)*0.5;
      else return;
      if(score<bs){bs=score;best=c;}
    });
    return best;
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
      ctx.fillText(c.code,p.sx+8,p.sy+6);
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
    if(!isDragging){
      velY*=FRICTION; velX*=FRICTION;
      if(Math.abs(velY)>MIN_VEL)targetRotY+=velY;
      if(Math.abs(velX)>MIN_VEL){targetRotX+=velX;targetRotX=Math.max(-Math.PI/2,Math.min(Math.PI/2,targetRotX));}
    }
    rotY+=(targetRotY-rotY)*ROT_LERP;
    rotX+=(targetRotX-rotX)*ROT_LERP;
    smoothX+=(mouseScreenX-smoothX)*MOUSE_LERP;
    smoothY+=(mouseScreenY-smoothY)*MOUSE_LERP;
    smoothCircX+=(targetCircX-smoothCircX)*CIRCLE_LERP;
    smoothCircY+=(targetCircY-smoothCircY)*CIRCLE_LERP;

    const marginX=(window.innerWidth-1920*currentScale)/2;
    const marginY=(window.innerHeight-1080*currentScale)/2;
    const extraX=marginX/currentScale, extraY=marginY/currentScale;
    const ptrH=document.getElementById('ptr-h');
    const ptrV=document.getElementById('ptr-v');
    const ptrCirc=document.getElementById('ptr-circle');
    const feat1=document.getElementById('feat1');
    const feat2=document.getElementById('feat2');
    if(!ptrH)return;
    ptrH.setAttribute('x1',-extraX); ptrH.setAttribute('y1',smoothY);
    ptrH.setAttribute('x2',1920+extraX); ptrH.setAttribute('y2',smoothY);
    ptrV.setAttribute('x1',smoothX); ptrV.setAttribute('y1',-extraY);
    ptrV.setAttribute('x2',smoothX); ptrV.setAttribute('y2',1080+extraY);
    ptrCirc.setAttribute('cx',smoothX); ptrCirc.setAttribute('cy',smoothY);
    if(feat1.style.opacity!=='0'){
      feat1.style.top=Math.max(70,smoothY-30)+'px';
      feat2.style.top=Math.max(70,smoothY-1)+'px';
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
  }

  function updateFilterUI(){
    filterEls.forEach((el,idx)=>{
      const item=FILTER_ITEMS[idx]; if(!item)return;
      const isActive=item.type==='continent'?activeContinents.has(item.val):activeRhythms.has(item.val);
      el.classList.toggle('active',isActive);
      el.classList.toggle('cursor',idx===filterCursor);
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
    hoveredCountry=null; focusedCountry=null;
    activeContinents=new Set(); activeRhythms=new Set(); filterCursor=0;
    isDragging=false; currentScale=1;

    document.getElementById('app').innerHTML = `
      <div class="filter-wrap">
        <div class="filter-row" id="filter-continent">
          <span class="filter-item" data-val="Africa">Africa</span>
          <span class="filter-sep"> / </span>
          <span class="filter-item" data-val="America">America</span>
          <span class="filter-sep"> / </span>
          <span class="filter-item" data-val="Asia">Asia</span>
          <span class="filter-sep"> / </span>
          <span class="filter-item" data-val="Europe">Europe</span>
          <span class="filter-sep"> / </span>
          <span class="filter-item" data-val="Oceania">Oceania</span>
        </div>
        <div class="filter-row" id="filter-rhythm">
          <span class="filter-item" data-val="Cyclical">Cyclical</span>
          <span class="filter-sep"> / </span>
          <span class="filter-item" data-val="Free">Free</span>
          <span class="filter-sep"> / </span>
          <span class="filter-item" data-val="Poly">Poly</span>
          <span class="filter-sep"> / </span>
          <span class="filter-item" data-val="Periodic">Periodic</span>
          <span class="filter-sep"> / </span>
          <span class="filter-item" data-val="Rhythm Mode">Rhythm Mode</span>
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
        <div class="point-feature" id="feat1"></div>
        <div class="point-feature" id="feat2"></div>
      </div>`;

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
        filterCursor=idx; updateFilterUI();
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
      const feat1=document.getElementById('feat1'), feat2=document.getElementById('feat2');
      if(nearest){
        feat1.style.opacity='1'; feat2.style.opacity='1';
        feat1.style.left='17px'; feat2.style.left='17px';
        feat1.textContent=nearest.continent; feat2.textContent=nearest.rhythm;
      } else { feat1.style.opacity='0'; feat2.style.opacity='0'; }
    });
    hitarea.addEventListener('mouseleave',()=>{
      document.getElementById('pointer-svg').style.opacity='0';
      document.getElementById('feat1').style.opacity='0';
      document.getElementById('feat2').style.opacity='0';
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
      if(e.code==='Backspace'){e.preventDefault(); showView('main');}
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
    document.getElementById('app').innerHTML='';
  }

  function selectCountry(c){
    if(c.code==='KR') showView('main');
    // 다른 국가 페이지 추가 시: else if(c.code==='JP') showView('japan'); 등
  }

  function doSelectCountry(){
    const c=focusedCountry||hoveredCountry;
    if(c)selectCountry(c);
  }

  /* ── 시리얼 명령 핸들러 ── */
  function handleCommand(cmd){
    switch(cmd){
      case 'CHANGE': showView('main');   break;
      case 'PLAY':   doSelectCountry();  break;
      case 'E+':     doFilterMove(1);    break;  // 필터 커서 ↓
      case 'E-':     doFilterMove(-1);   break;  // 필터 커서 ↑
      case 'F+':   { const n=findNeighbor('right'); if(n)centerCountry(n); break; }
      case 'F-':   { const n=findNeighbor('left');  if(n)centerCountry(n); break; }
      case 'G+':   { const n=findNeighbor('down');  if(n)centerCountry(n); break; }
      case 'G-':   { const n=findNeighbor('up');    if(n)centerCountry(n); break; }
    }
  }

  function doFilterMove(dir){
    filterCursor=(filterCursor+dir+FILTER_ITEMS.length)%FILTER_ITEMS.length;
    updateFilterUI();
  }
  function doFilterToggle(){
    const item=FILTER_ITEMS[filterCursor];
    const set=item.type==='continent'?activeContinents:activeRhythms;
    if(set.has(item.val))set.delete(item.val); else set.add(item.val);
    updateFilterUI();
  }

  return { mount, unmount, handleCommand };
})());