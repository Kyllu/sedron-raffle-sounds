// ==UserScript==
// @name         Sedron Kick Raffle — Sound Overlay
// @namespace    https://github.com/kyllu88/sedron-raffle-sounds
// @version      1.0.2
// @description  Dźwięk napięcia podczas losowania + fanfara przy zwycięzcy dla raffle.sedron.pl (koło i lista). Wbudowana biblioteka + własne pliki.
// @author       kyllu88
// @match        https://raffle.sedron.pl/*
// @run-at       document-idle
// @noframes
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/kyllu88/sedron-raffle-sounds/main/sedron-raffle-sounds.user.js
// @downloadURL  https://raw.githubusercontent.com/kyllu88/sedron-raffle-sounds/main/sedron-raffle-sounds.user.js
// ==/UserScript==

/*
 * Nakładka dodająca dźwięk do losowań na https://raffle.sedron.pl/
 * Nie wymaga dostępu do kodu strony — obserwuje DOM i odtwarza dźwięk lokalnie.
 *
 * Wykrywane sygnały (zweryfikowane w app.js strony):
 *   KOŁO  start:     '.wheel-wrapper' dostaje klasę 'spinning'
 *   KOŁO  zwycięzca: '#wheel-winner-banner' traci klasę 'hidden'
 *   LISTA start:     '#multi-winner-modal-container' traci 'hidden' (dostaje data-winner-count)
 *   LISTA zwycięzca: '.modal-title' w modalu staje się niepusty (niezależne od języka)
 *
 * Wbudowane dźwięki są SYNTEZOWANE (Web Audio) — brak plików, brak licencji, mały rozmiar.
 * Własne dźwięki: wgrywane jako data: URI i odtwarzane przez HTMLAudio.
 */
(function () {
    'use strict';

    // ---- Garda przed podwójnym uruchomieniem ----
    if (document.documentElement.dataset.srsLoaded) return;
    document.documentElement.dataset.srsLoaded = '1';

    // =========================================================================
    // KONFIGURACJA / STORAGE
    // =========================================================================
    const KEY = 'sedronSoundOverlay.v1';
    const hasGM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';

    const LIB = {
        suspense: [
            { id: 'drumroll', name: 'Werbel (drumroll)' },
            { id: 'epic', name: 'Bębny (epicki)' },
            { id: 'ticking', name: 'Tykanie (napięcie)' },
            { id: 'riser', name: 'Narastanie (riser)' },
        ],
        winner: [
            { id: 'tada', name: 'Ta-da' },
            { id: 'fanfare', name: 'Fanfara' },
            { id: 'airhorn', name: 'Airhorn' },
            { id: 'coin', name: 'Moneta (coin)' },
        ],
    };

    function defaults() {
        return {
            master: true,
            scope: { wheel: true, list: true },
            suspense: { enabled: true, source: 'builtin', builtinId: 'drumroll', custom: null, volume: 0.8 },
            winner: { enabled: true, source: 'builtin', builtinId: 'tada', custom: null, volume: 0.9 },
            ui: { open: false },
        };
    }

    function loadRaw() {
        try { return hasGM ? GM_getValue(KEY, null) : localStorage.getItem(KEY); }
        catch (e) { return null; }
    }
    function saveRaw(str) {
        try { if (hasGM) GM_setValue(KEY, str); else localStorage.setItem(KEY, str); }
        catch (e) { console.warn('[SRS] Zapis ustawień nie powiódł się (limit miejsca?):', e); }
    }

    function mergeInto(base, extra) {
        if (!extra || typeof extra !== 'object') return base;
        for (const k of Object.keys(base)) {
            if (extra[k] === undefined) continue;
            const bv = base[k], ev = extra[k];
            if (bv && typeof bv === 'object' && !Array.isArray(bv) &&
                ev && typeof ev === 'object' && !Array.isArray(ev)) {
                mergeInto(bv, ev); // scal zagnieżdżone obiekty (scope, suspense, winner, ui)
            } else {
                base[k] = ev; // przypisz wartości proste, tablice i obiekty custom (base może być null)
            }
        }
        return base;
    }

    let cfg = (function () {
        const raw = loadRaw();
        let obj = {};
        if (raw) { try { obj = JSON.parse(raw); } catch (e) { } }
        return mergeInto(defaults(), obj);
    })();

    function save() { saveRaw(JSON.stringify(cfg)); }

    // =========================================================================
    // AUDIO — kontekst i odblokowanie autoplay
    // =========================================================================
    let AC = null;
    function ac() {
        if (!AC) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            AC = new Ctx();
        }
        return AC;
    }
    let unlocked = false;
    function unlock() {
        try {
            const c = ac();
            if (c.state === 'suspended') c.resume();
        } catch (e) { }
        unlocked = true;
    }

    let _noiseBuf = null;
    function noiseBuffer() {
        const ctx = ac();
        if (_noiseBuf && _noiseBuf.sampleRate === ctx.sampleRate) return _noiseBuf;
        const len = Math.floor(ctx.sampleRate * 1.0);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        _noiseBuf = buf;
        return buf;
    }

    // Pojedynczy ton (oscylator z obwiednią)
    function tone(out, { freq, t, dur, type = 'triangle', gain = 0.3, attack = 0.008, release = 0.08 }) {
        const ctx = ac();
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        const g = ctx.createGain();
        const end = t + dur;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + attack);
        g.gain.setValueAtTime(gain, Math.max(t + attack, end - release));
        g.gain.exponentialRampToValueAtTime(0.0001, end);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(end + 0.03);
    }

    // Uderzenie werbla (szum + filtr)
    function snare(out, t, gain) {
        const ctx = ac();
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer();
        src.loop = true;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(out);
        src.start(t); src.stop(t + 0.09);
    }

    // Niski bęben (tom) z opadającą wysokością
    function tom(out, t, gain, from = 140, to = 60) {
        const ctx = ac();
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(from, t);
        o.frequency.exponentialRampToValueAtTime(to, t + 0.18);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + 0.24);
    }

    // ---- Napięcie (pętla) -> zwraca kontroler {stop} ----
    function startSynthSuspense(id, out) {
        let iv = null; const stops = [];
        const stopOsc = node => stops.push(() => { try { node.stop(); } catch (e) { } });

        if (id === 'ticking') {
            // Teleturniejowe napięcie: naprzemienne tykanie + niski dron pod spodem
            const ctx = ac();
            const drone = ctx.createOscillator(); drone.type = 'sine'; drone.frequency.value = 110;
            const dg = ctx.createGain(); dg.gain.value = 0.05;
            drone.connect(dg); dg.connect(out); drone.start(); stopOsc(drone);
            let k = 0;
            const tick = () => {
                tone(out, { freq: k % 2 === 0 ? 1500 : 1150, t: ac().currentTime, dur: 0.035, type: 'square', gain: 0.45, attack: 0.002, release: 0.025 });
                k++;
            };
            tick(); iv = setInterval(tick, 500);

        } else if (id === 'riser') {
            // Powtarzalne narastanie z płynniejszą obwiednią
            const sweep = () => {
                const ctx = ac(); const t = ctx.currentTime;
                const o = ctx.createOscillator(); o.type = 'sawtooth';
                o.frequency.setValueAtTime(180, t);
                o.frequency.exponentialRampToValueAtTime(1500, t + 1.35);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0.0001, t);
                g.gain.linearRampToValueAtTime(0.22, t + 0.95);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
                o.connect(g); g.connect(out);
                o.start(t); o.stop(t + 1.47);
            };
            sweep(); iv = setInterval(sweep, 1400);

        } else if (id === 'epic') {
            // Epickie bębny wojenne: mocny tom na każdy takt + werbel na "i" + niski dron
            const ctx = ac();
            const drone = ctx.createOscillator(); drone.type = 'sine'; drone.frequency.value = 55;
            const dg = ctx.createGain(); dg.gain.value = 0.08;
            drone.connect(dg); dg.connect(out); drone.start(); stopOsc(drone);
            let i = 0;
            const beat = () => {
                const t = ac().currentTime;
                tom(out, t, 0.6, 150, 55);
                if (i % 2 === 1) snare(out, t, 0.3);
                i++;
            };
            beat(); iv = setInterval(beat, 185);

        } else { // 'drumroll' — pełniejszy werbel z akcentem i tomem
            let i = 0;
            const hit = () => {
                const t = ac().currentTime;
                const accent = i % 8 === 0;
                snare(out, t, accent ? 0.75 : 0.42);
                if (accent) tom(out, t, 0.5);
                i++;
            };
            hit(); iv = setInterval(hit, 45);
        }
        return { stop() { if (iv) clearInterval(iv); iv = null; stops.forEach(f => f()); } };
    }

    // ---- Zwycięzca (jednorazowo) ----
    function playSynthWinner(id, out) {
        const ctx = ac(); const t = ctx.currentTime;
        if (id === 'fanfare') {
            [523, 659, 784, 1047].forEach((f, k) =>
                tone(out, { freq: f, t: t + k * 0.12, dur: 0.14, type: 'triangle', gain: 0.3 }));
            [523, 659, 784, 1047].forEach(f =>
                tone(out, { freq: f, t: t + 0.5, dur: 0.7, type: 'triangle', gain: 0.28, release: 0.3 }));
        } else if (id === 'airhorn') {
            [0, 0.28, 0.56].forEach(off => {
                for (const det of [-3, 3]) {
                    const o = ctx.createOscillator(); o.type = 'sawtooth';
                    o.frequency.setValueAtTime(215 + det, t + off);
                    o.frequency.linearRampToValueAtTime(180 + det, t + off + 0.22);
                    const g = ctx.createGain();
                    g.gain.setValueAtTime(0.0001, t + off);
                    g.gain.exponentialRampToValueAtTime(0.3, t + off + 0.02);
                    g.gain.setValueAtTime(0.3, t + off + 0.2);
                    g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.24);
                    o.connect(g); g.connect(out);
                    o.start(t + off); o.stop(t + off + 0.26);
                }
            });
        } else if (id === 'coin') {
            tone(out, { freq: 988, t: t, dur: 0.08, type: 'square', gain: 0.4 });
            tone(out, { freq: 1319, t: t + 0.08, dur: 0.5, type: 'square', gain: 0.4, release: 0.2 });
        } else { // 'tada'
            [392, 494, 587].forEach(f => tone(out, { freq: f, t: t, dur: 0.16, type: 'triangle', gain: 0.26 }));
            [523, 659, 784].forEach(f => tone(out, { freq: f, t: t + 0.19, dur: 0.65, type: 'triangle', gain: 0.3, release: 0.3 }));
        }
    }

    // =========================================================================
    // SILNIK AUDIO (napięcie / fanfara, syntezowane lub własny plik)
    // =========================================================================
    const Engine = {
        active: null, // {audio} | {ctrl,g}
        playSuspense(slot) {
            this.stopSuspense();
            if (!slot.enabled) return;
            unlock();
            if (slot.source === 'custom' && slot.custom && slot.custom.data) {
                const a = new Audio(slot.custom.data);
                a.loop = true; a.volume = clamp(slot.volume);
                a.play().catch(() => { });
                this.active = { audio: a };
            } else {
                const ctx = ac();
                const g = ctx.createGain(); g.gain.value = clamp(slot.volume);
                g.connect(ctx.destination);
                const ctrl = startSynthSuspense(slot.builtinId, g);
                this.active = { ctrl, g };
            }
        },
        stopSuspense() {
            const s = this.active; if (!s) return; this.active = null;
            if (s.audio) { try { s.audio.pause(); s.audio.currentTime = 0; } catch (e) { } }
            if (s.ctrl) s.ctrl.stop();
            if (s.g) { try { setTimeout(() => s.g.disconnect(), 200); } catch (e) { } }
        },
        setSuspenseVolume(v) {
            const s = this.active; if (!s) return;
            if (s.audio) s.audio.volume = clamp(v);
            if (s.g) { try { s.g.gain.value = clamp(v); } catch (e) { } }
        },
        playFanfare(slot) {
            if (!slot.enabled) return;
            unlock();
            if (slot.source === 'custom' && slot.custom && slot.custom.data) {
                const a = new Audio(slot.custom.data);
                a.volume = clamp(slot.volume);
                a.play().catch(() => { });
            } else {
                const ctx = ac();
                const g = ctx.createGain(); g.gain.value = clamp(slot.volume);
                g.connect(ctx.destination);
                playSynthWinner(slot.builtinId, g);
                setTimeout(() => { try { g.disconnect(); } catch (e) { } }, 2500);
            }
        },
    };
    function clamp(v) { v = +v; return v < 0 ? 0 : v > 1 ? 1 : (isNaN(v) ? 0 : v); }

    // =========================================================================
    // AUTOMAT STANÓW + OBSERWATOR DOM
    // =========================================================================
    const IDLE = 0, DRAWING = 1, REVEALED = 2;
    const SAFETY_MS = 15000, REARM_MS = 1500;
    let state = IDLE, surface = null, safety = null, rearm = null, modalObs = null;

    const scopeOn = s => cfg.master && (s === 'wheel' ? cfg.scope.wheel : cfg.scope.list);

    function onStart(s) {
        if (!scopeOn(s)) return;
        if (state === DRAWING && surface === s) return; // ta sama runda — ignoruj powtórki
        clearTimeout(safety); clearTimeout(rearm); Engine.stopSuspense(); detachModal();
        state = DRAWING; surface = s;
        Engine.playSuspense(cfg.suspense);
        safety = setTimeout(() => { Engine.stopSuspense(); toIdle(); }, SAFETY_MS);
        if (s === 'list') attachModal();
    }
    function onReveal(s) {
        if (state !== DRAWING || surface !== s) return; // fanfara dokładnie raz
        state = REVEALED; clearTimeout(safety);
        Engine.stopSuspense(); detachModal();
        Engine.playFanfare(cfg.winner);
        rearm = setTimeout(toIdle, REARM_MS);
    }
    function toIdle() {
        state = IDLE; surface = null;
        clearTimeout(safety); clearTimeout(rearm); detachModal();
    }

    // Reveal listy: '.modal-title' ZMIENIA tekst względem startu.
    // Podczas losowania tytuł to "Drawing..."/"Losowanie...", przy zwycięzcy zmienia się
    // na "Winner: X"/"Zwycięzca: X". Porównanie ze stanem startowym (baseline) jest
    // niezależne od języka i nie odpala fanfary od razu na etykiecie "Drawing...".
    function attachModal() {
        const m = document.getElementById('multi-winner-modal-container');
        if (!m) return;
        const baseline = new WeakMap();
        const snapshot = () => {
            m.querySelectorAll('.modal-title').forEach(t => {
                if (!baseline.has(t)) baseline.set(t, (t.textContent || '').trim());
            });
        };
        const revealed = () => {
            const titles = m.querySelectorAll('.modal-title');
            for (const t of titles) {
                const now = (t.textContent || '').trim();
                const base = baseline.has(t) ? baseline.get(t) : '';
                if (now !== '' && now !== base) return true;
            }
            return false;
        };
        snapshot();
        modalObs = new MutationObserver(() => { snapshot(); if (revealed()) onReveal('list'); });
        modalObs.observe(m, { childList: true, subtree: true, characterData: true });
    }
    function detachModal() { if (modalObs) { modalObs.disconnect(); modalObs = null; } }

    function maybeStart(node) {
        if (!node || node.nodeType !== 1) return;
        const q = sel => (node.matches && node.matches(sel)) ? node : (node.querySelector ? node.querySelector(sel) : null);
        if (q('.wheel-wrapper.spinning')) onStart('wheel');
        if (q('#multi-winner-modal-container:not(.hidden)')) onStart('list');
    }

    const root = new MutationObserver(muts => {
        for (const m of muts) {
            if (m.type === 'childList') {
                if (m.addedNodes) m.addedNodes.forEach(maybeStart);
                continue;
            }
            const el = m.target;
            if (!el || el.nodeType !== 1 || !el.matches) continue;
            const old = m.oldValue || '';
            if (el.matches('.wheel-wrapper')) {
                const had = /\bspinning\b/.test(old), has = el.classList.contains('spinning');
                if (!had && has) onStart('wheel');
            } else if (el.id === 'wheel-winner-banner') {
                const had = /\bhidden\b/.test(old), has = el.classList.contains('hidden');
                if (had && !has) onReveal('wheel');
                else if (!had && has && surface === 'wheel') toIdle();
            } else if (el.id === 'multi-winner-modal-container') {
                if (m.attributeName === 'data-winner-count') {
                    if (!el.classList.contains('hidden')) onStart('list');
                } else {
                    const had = /\bhidden\b/.test(old), has = el.classList.contains('hidden');
                    if (had && !has) onStart('list');
                    else if (!had && has) toIdle();
                }
            }
        }
    });

    // =========================================================================
    // PANEL USTAWIEŃ (wstrzykiwany na stronę)
    // =========================================================================
    const CSS = `
    .srs-btn{position:fixed;right:18px;bottom:18px;width:48px;height:48px;border-radius:50%;
      background:#7c3aed;color:#fff;border:none;cursor:pointer;font-size:22px;z-index:2147483000;
      box-shadow:0 4px 14px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;
      transition:transform .1s ease, background .2s ease;}
    .srs-btn:hover{background:#6d28d9;transform:scale(1.05);}
    .srs-btn.off{background:#4b5563;}
    .srs-panel{position:fixed;right:18px;bottom:76px;width:320px;max-height:78vh;overflow-y:auto;
      background:#1b1e27;color:#e5e7eb;border:1px solid #33384a;border-radius:14px;z-index:2147483000;
      box-shadow:0 10px 40px rgba(0,0,0,.55);font:13px/1.4 'Inter',system-ui,sans-serif;display:none;}
    .srs-panel.open{display:block;}
    .srs-hd{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;
      border-bottom:1px solid #2a2f3d;position:sticky;top:0;background:#1b1e27;border-radius:14px 14px 0 0;}
    .srs-hd b{font-size:14px;}
    .srs-x{background:none;border:none;color:#9aa0ad;font-size:18px;cursor:pointer;}
    .srs-body{padding:12px 14px;}
    .srs-master{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-weight:600;}
    .srs-slot{border:1px solid #2a2f3d;border-radius:10px;padding:10px;margin:10px 0;}
    .srs-slot h4{margin:0 0 8px;font-size:13px;display:flex;align-items:center;gap:8px;}
    .srs-slot h4 small{color:#8b90a0;font-weight:400;}
    .srs-row{display:flex;align-items:center;gap:8px;margin:7px 0;}
    .srs-row label{color:#aab;min-width:64px;}
    .srs-panel select,.srs-panel input[type=range]{flex:1;min-width:0;}
    .srs-panel select{background:#12141b;color:#e5e7eb;border:1px solid #333;border-radius:6px;padding:5px;}
    .srs-file{font-size:11px;color:#8b90a0;margin-top:4px;display:flex;align-items:center;gap:6px;}
    .srs-file a{color:#f87171;cursor:pointer;text-decoration:none;}
    .srs-test{background:#2a2f3d;border:1px solid #3a4152;color:#e5e7eb;border-radius:6px;
      padding:4px 10px;cursor:pointer;font-size:12px;}
    .srs-test:hover{background:#343b4d;}
    .srs-test.on{background:#7c3aed;border-color:#7c3aed;}
    .srs-scope{display:flex;gap:14px;align-items:center;margin:10px 0 4px;}
    .srs-note{font-size:11px;color:#8b90a0;border-top:1px solid #2a2f3d;margin-top:8px;padding-top:8px;}
    .srs-vol{color:#7c8;min-width:34px;text-align:right;font-variant-numeric:tabular-nums;}
    .srs-panel input[type=checkbox]{accent-color:#7c3aed;width:16px;height:16px;}
    `;
    function injectCSS() {
        if (typeof GM_addStyle === 'function') { GM_addStyle(CSS); return; }
        const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
    }

    let panel, fab, testingSuspense = false;

    function slotHTML(key, title, subtitle) {
        const slot = cfg[key];
        const lib = LIB[key];
        const sel = slot.source === 'custom' ? 'custom' : 'b:' + slot.builtinId;
        let opts = lib.map(o => `<option value="b:${o.id}"${sel === 'b:' + o.id ? ' selected' : ''}>${o.name}</option>`).join('');
        if (slot.custom) opts += `<option value="custom"${sel === 'custom' ? ' selected' : ''}>★ ${escapeHtml(slot.custom.name)}</option>`;
        opts += `<option value="upload">⬆ Wgraj własny plik…</option>`;
        return `
        <div class="srs-slot" data-slot="${key}">
          <h4><input type="checkbox" data-a="enabled" ${slot.enabled ? 'checked' : ''}> ${title} <small>${subtitle}</small></h4>
          <div class="srs-row">
            <label>Dźwięk</label>
            <select data-a="source">${opts}</select>
          </div>
          <div class="srs-file" ${slot.custom ? '' : 'style="display:none"'}>
            ${slot.custom ? '📁 ' + escapeHtml(slot.custom.name) + ' (' + Math.round((slot.custom.size || 0) / 1024) + ' KB) <a data-a="clear">usuń</a>' : ''}
          </div>
          <div class="srs-row">
            <label>Głośność</label>
            <input type="range" min="0" max="100" value="${Math.round(slot.volume * 100)}" data-a="volume">
            <span class="srs-vol">${Math.round(slot.volume * 100)}%</span>
          </div>
          <div class="srs-row">
            <button class="srs-test" data-a="test">${key === 'suspense' ? '► Test (pętla)' : '► Test'}</button>
          </div>
          <input type="file" accept="audio/*" data-a="fileinput" style="display:none">
        </div>`;
    }

    function render() {
        if (!panel) return;
        panel.querySelector('.srs-body').innerHTML = `
          <label class="srs-master"><input type="checkbox" data-master ${cfg.master ? 'checked' : ''}> Dźwięki włączone</label>
          ${slotHTML('suspense', 'Napięcie', 'podczas losowania')}
          ${slotHTML('winner', 'Zwycięzca', 'fanfara przy wyniku')}
          <div class="srs-scope">
            <span style="color:#aab">Dotyczy:</span>
            <label><input type="checkbox" data-scope="wheel" ${cfg.scope.wheel ? 'checked' : ''}> Koło</label>
            <label><input type="checkbox" data-scope="list" ${cfg.scope.list ? 'checked' : ''}> Lista</label>
          </div>
          <div class="srs-note">
            ⚠ OBS: uruchamiaj losowanie w <b>zwykłej karcie</b> przeglądarki (nie jako „Browser Source" w OBS) i przechwytuj dźwięk przez <b>Application/Desktop Audio Capture</b>.<br>
            💡 Kliknij raz stronę (lub ten panel) na początku sesji — przeglądarka odblokuje wtedy dźwięk.
          </div>`;
        wire();
        if (fab) fab.classList.toggle('off', !cfg.master);
    }

    function wire() {
        panel.querySelector('[data-master]').onchange = e => { cfg.master = e.target.checked; save(); render(); };
        panel.querySelectorAll('[data-scope]').forEach(cb => {
            cb.onchange = e => { cfg.scope[cb.getAttribute('data-scope')] = e.target.checked; save(); };
        });
        panel.querySelectorAll('.srs-slot').forEach(box => {
            const key = box.getAttribute('data-slot');
            const slot = cfg[key];
            const fileInput = box.querySelector('[data-a="fileinput"]');

            box.querySelector('[data-a="enabled"]').onchange = e => { slot.enabled = e.target.checked; save(); };

            box.querySelector('[data-a="source"]').onchange = e => {
                const v = e.target.value;
                if (v === 'upload') { fileInput.click(); e.target.value = slot.source === 'custom' ? 'custom' : 'b:' + slot.builtinId; return; }
                if (v === 'custom') { slot.source = 'custom'; }
                else { slot.source = 'builtin'; slot.builtinId = v.slice(2); }
                save();
            };

            fileInput.onchange = e => onFile(key, e.target.files && e.target.files[0]);

            const clear = box.querySelector('[data-a="clear"]');
            if (clear) clear.onclick = () => { slot.custom = null; slot.source = 'builtin'; save(); render(); };

            const vol = box.querySelector('[data-a="volume"]');
            vol.oninput = e => {
                slot.volume = (+e.target.value) / 100;
                box.querySelector('.srs-vol').textContent = e.target.value + '%';
                if (key === 'suspense' && testingSuspense) Engine.setSuspenseVolume(slot.volume);
            };
            vol.onchange = () => save();

            box.querySelector('[data-a="test"]').onclick = e => {
                unlock();
                if (key === 'winner') { Engine.playFanfare(slot); return; }
                // suspense: toggle
                if (testingSuspense) { Engine.stopSuspense(); testingSuspense = false; e.target.classList.remove('on'); e.target.textContent = '► Test (pętla)'; }
                else { Engine.playSuspense(slot); testingSuspense = true; e.target.classList.add('on'); e.target.textContent = '■ Stop'; }
            };
        });
    }

    function onFile(key, file) {
        if (!file) return;
        if (!/^audio\//.test(file.type)) { alert('To nie jest plik audio.'); return; }
        const MAX = 2 * 1024 * 1024;
        if (file.size > MAX) { alert('Plik za duży (max 2 MB). Wybierz krótszy/mniejszy klip.'); return; }
        const fr = new FileReader();
        fr.onload = () => {
            cfg[key].custom = { name: file.name, size: file.size, data: fr.result };
            cfg[key].source = 'custom';
            save(); render();
        };
        fr.onerror = () => alert('Nie udało się wczytać pliku.');
        fr.readAsDataURL(file);
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function togglePanel(force) {
        const open = force !== undefined ? force : !panel.classList.contains('open');
        panel.classList.toggle('open', open);
        cfg.ui.open = open; save();
        if (open) { unlock(); render(); }
        else if (testingSuspense) { Engine.stopSuspense(); testingSuspense = false; }
    }

    function mountUI() {
        injectCSS();
        fab = document.createElement('button');
        fab.className = 'srs-btn' + (cfg.master ? '' : ' off');
        fab.title = 'Dźwięki losowania';
        fab.textContent = '🔊';
        fab.onclick = () => togglePanel();

        panel = document.createElement('div');
        panel.className = 'srs-panel';
        panel.innerHTML = `<div class="srs-hd"><b>🔊 Dźwięki losowania</b><button class="srs-x" title="Zamknij">✕</button></div><div class="srs-body"></div>`;

        document.documentElement.appendChild(fab);
        document.documentElement.appendChild(panel);
        panel.querySelector('.srs-x').onclick = () => togglePanel(false);

        render();
        if (cfg.ui.open) togglePanel(true);
    }

    // =========================================================================
    // START
    // =========================================================================
    function boot() {
        document.addEventListener('pointerdown', function once() {
            unlock(); document.removeEventListener('pointerdown', once, true);
        }, true);

        root.observe(document.documentElement, {
            subtree: true, childList: true, attributes: true,
            attributeOldValue: true, attributeFilter: ['class', 'data-winner-count'],
        });
        maybeStart(document.body); // gdyby losowanie już trwało w chwili załadowania
        mountUI();
        console.log('[SRS] Sedron Raffle Sound Overlay v1.0.0 aktywny.');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
