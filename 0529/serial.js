/* ═══════════════════════════════════════════════
   serial.js — 시리얼 연결 관리자 (뷰 전환과 무관하게 유지)
   현재 뷰의 handleCommand()로 명령을 라우팅함
   ═══════════════════════════════════════════════ */

const Serial = (() => {
  let port    = null;
  let buf     = '';
  const btn   = () => document.getElementById('serial-btn');

  function dispatch(cmd) {
    cmd = cmd.trim();
    if (!cmd) return;
    if (typeof currentView !== 'undefined' && currentView?.handleCommand) {
      currentView.handleCommand(cmd);
    }
  }

  function setStatus(connected) {
    const b = btn(); if (!b) return;
    if (connected) {
      b.textContent='● CONNECTED'; b.style.color='#1a7a1a'; b.style.borderColor='#1a7a1a';
    } else {
      b.textContent='○ SERIAL';     b.style.color='#000';    b.style.borderColor='#000';
    }
  }

  async function openPort(p) {
    port = p;
    await port.open({ baudRate: 9600 });
    setStatus(true);

    const decoder = new TextDecoderStream();
    port.readable.pipeTo(decoder.writable).catch(() => {});
    const reader = decoder.readable.getReader();

    (async function readLoop() {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += value;
          const lines = buf.split('\n');
          buf = lines.pop();
          lines.forEach(dispatch);
        }
      } catch (err) {
        console.warn('Serial read error:', err);
      } finally {
        reader.releaseLock();
        setStatus(false);
        port = null;
      }
    })();
  }

  /* 사용자 클릭 → 포트 선택 다이얼로그 (최초 1회) */
  async function connect() {
    if (!('serial' in navigator)) {
      alert('이 브라우저는 Web Serial API를 지원하지 않습니다.\nChrome / Edge를 사용해 주세요.');
      return;
    }
    try {
      const p = await navigator.serial.requestPort();
      await openPort(p);
    } catch (err) {
      if (err.name !== 'NotFoundError') console.error('Serial connect error:', err);
    }
  }

  /* 자동 재연결 — 이전에 승인된 포트가 있으면 바로 열기 */
  async function tryAutoConnect() {
    if (!('serial' in navigator)) return;
    try {
      const ports = await navigator.serial.getPorts();
      if (ports.length > 0 && !port) {
        await openPort(ports[0]);
      }
    } catch (err) {
      console.warn('Auto-connect failed:', err);
    }
  }

  /* USB 연결 / 분리 이벤트 감지 */
  if ('serial' in navigator) {
    navigator.serial.addEventListener('connect', (e) => {
      if (!port) openPort(e.target).catch(console.warn);
    });
    navigator.serial.addEventListener('disconnect', () => {
      setStatus(false); port = null;
    });
  }

  /* 페이지 로드 시 자동 연결 시도 */
  window.addEventListener('DOMContentLoaded', tryAutoConnect);

  return { connect };
})();

/* ════════════════════════════════════════════
   뷰 라우터 — showView(name) 으로 뷰 전환
   ════════════════════════════════════════════ */
let currentView = null;
const views     = {};

function registerView(name, view) { views[name] = view; }

function showView(name) {
  if (currentView?.unmount) currentView.unmount();
  currentView = views[name];
  if (currentView?.mount) currentView.mount();
}