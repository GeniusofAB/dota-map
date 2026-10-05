(() => {
  'use strict';
  // Coordinate dimensions of the ORIGINAL map, independent of image resolution.
  const MAP = { width: 17408, height: 10240, units: 128 };
  const toPixel = (lat, lng) => ({ x: lng * MAP.units, y: -lat * MAP.units });
  const toPosition = (x, y) => ({ lat: -y / MAP.units, lng: x / MAP.units });
  window.MapCoordinates = Object.freeze({ MAP, toPixel, toPosition });
  const $ = id => document.getElementById(id);
  const viewport = $('viewport'), world = $('map-world');
  const state = { scale: 1, fit: 1, tx: 0, ty: 0, selected: null };
  const pointers = new Map();
  let gesture = null, copyTimer;
  const heroes = (window.HEROES || []).filter(h => !h.hidden);
  const pins = heroes.map(hero => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'marker' + (hero.name === 'Roshan' ? ' roshan' : '');
    button.setAttribute('aria-label', `${hero.name}: [${hero.lat}, ${hero.lng}]`);
    button.style.setProperty('--pin-color', hero.color);
    const label = document.createElement('span');
    label.className = 'marker-label'; label.textContent = hero.name;
    button.append(label);
    button.addEventListener('click', event => {
      event.stopPropagation();
      // Pointer taps are handled by pointerup, after distinguishing taps from drags.
      if (event.detail === 0) select(toPixel(hero.lat, hero.lng), hero);
    });
    $('markers').append(button);
    return { hero, button, point: toPixel(hero.lat, hero.lng) };
  });
  $('hero-count').textContent = heroes.length;
  const size = () => ({ w: viewport.clientWidth, h: viewport.clientHeight });
  function clamp() {
    const { w, h } = size();
    const mw = MAP.width * state.scale, mh = MAP.height * state.scale;
    state.tx = mw <= w ? (w - mw) / 2 : Math.min(0, Math.max(w - mw, state.tx));
    state.ty = mh <= h ? (h - mh) / 2 : Math.min(0, Math.max(h - mh, state.ty));
  }
  function render() {
    clamp();
    world.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
    for (const { button, point, hero } of pins) {
      button.style.left = `${state.tx + point.x * state.scale}px`;
      button.style.top = `${state.ty + point.y * state.scale}px`;
      button.classList.toggle('selected', state.selected?.hero === hero);
    }
    if (state.selected) {
      $('selection').style.left = `${state.tx + state.selected.x * state.scale}px`;
      $('selection').style.top = `${state.ty + state.selected.y * state.scale}px`;
    }
    $('zoom-label').textContent = `${(state.scale / state.fit).toFixed(1)}×`;
    $('zoom-out').disabled = state.scale <= state.fit * 1.001;
    $('zoom-in').disabled = state.scale >= state.fit * 12 / 1.001;
  }
  function fitMap() {
    const { w, h } = size();
    state.fit = Math.min(w / MAP.width, h / MAP.height);
    state.scale = state.fit; state.tx = 0; state.ty = 0; render();
  }
  function zoom(factor, cx = viewport.clientWidth / 2, cy = viewport.clientHeight / 2) {
    const next = Math.max(state.fit, Math.min(state.fit * 12, state.scale * factor));
    const ratio = next / state.scale;
    state.tx = cx - (cx - state.tx) * ratio;
    state.ty = cy - (cy - state.ty) * ratio;
    state.scale = next; render();
  }
  function local(event) {
    const rect = viewport.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function select(point, hero = null) {
    if (point.x < 0 || point.y < 0 || point.x > MAP.width || point.y > MAP.height) return;
    const pos = hero ? { lat: hero.lat, lng: hero.lng } : toPosition(point.x, point.y);
    state.selected = { ...point, ...pos, hero };
    $('empty-state').hidden = true; $('point-details').hidden = false; $('selection').hidden = false;
    $('point-name').textContent = hero ? hero.name : 'Точка на карте';
    const fmt = value => (Math.abs(value) < 0.0000005 ? 0 : value).toFixed(6);
    $('pos-value').textContent = `[${fmt(pos.lat)}, ${fmt(pos.lng)}]`;
    $('lat-value').textContent = fmt(pos.lat); $('lng-value').textContent = fmt(pos.lng);
    $('x-value').textContent = point.x.toFixed(2); $('y-value').textContent = point.y.toFixed(2);
    $('copy-status').textContent = ''; render();
  }
  $('show-heroes').addEventListener('change', event => {
    $('markers').hidden = !event.target.checked;
  });
  $('zoom-in').addEventListener('click', () => zoom(1.5));
  $('zoom-out').addEventListener('click', () => zoom(1 / 1.5));
  $('fit-map').addEventListener('click', fitMap);
  // Keep navigation controls out of the map's pan/tap gesture handling.
  document.querySelector('.zoom-controls').addEventListener('pointerdown', e => e.stopPropagation());
  viewport.addEventListener('wheel', event => {
    event.preventDefault(); const p = local(event);
    zoom(Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) * 0.003), p.x, p.y);
  }, { passive: false });
  viewport.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const p = local(event); pointers.set(event.pointerId, p);
    viewport.setPointerCapture(event.pointerId);
    if (pointers.size === 1) {
      gesture = { start: p, last: p, moved: false, pin: pins.find(pin => pin.button.contains(event.target)) };
    } else {
      const [a,b] = [...pointers.values()];
      gesture = { moved: true, pinch: true, distance: Math.hypot(a.x-b.x,a.y-b.y), center: {x:(a.x+b.x)/2,y:(a.y+b.y)/2} };
    }
  });
  viewport.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    const p = local(event); pointers.set(event.pointerId,p);
    if (pointers.size >= 2) {
      const [a,b] = [...pointers.values()], distance = Math.hypot(a.x-b.x,a.y-b.y);
      const center = {x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      if (gesture.distance > 0) zoom(distance/gesture.distance,gesture.center.x,gesture.center.y);
      state.tx += center.x-gesture.center.x; state.ty += center.y-gesture.center.y;
      gesture.distance = distance; gesture.center = center; render();
    } else {
      if (Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y) > 4) gesture.moved = true;
      if (gesture.moved) {
        state.tx += p.x-gesture.last.x; state.ty += p.y-gesture.last.y;
        viewport.classList.add('dragging'); render();
      }
      gesture.last = p;
    }
  });
  function endPointer(event, cancelled = false) {
    if (!pointers.has(event.pointerId)) return;
    const p = local(event);
    if (!cancelled && gesture && !gesture.moved && pointers.size === 1) {
      if (gesture.pin) select(gesture.pin.point,gesture.pin.hero);
      else select({x:(p.x-state.tx)/state.scale,y:(p.y-state.ty)/state.scale});
    }
    pointers.delete(event.pointerId);
    if (pointers.size === 1) {
      const last = [...pointers.values()][0];
      gesture = { start:last,last,moved:true };
    } else if (!pointers.size) { gesture = null; viewport.classList.remove('dragging'); }
  }
  viewport.addEventListener('pointerup', event => endPointer(event));
  viewport.addEventListener('pointercancel', event => endPointer(event,true));
  viewport.addEventListener('lostpointercapture', event => {
    if (pointers.has(event.pointerId)) endPointer(event,true);
  });
  viewport.addEventListener('keydown', event => {
    if (event.target !== viewport) return;
    if (event.key === '+' || event.key === '=') zoom(1.5);
    else if (event.key === '-') zoom(1/1.5);
    else if (event.key === 'Home') fitMap();
    else if (event.key === 'Enter' || event.key === ' ') select({x:(viewport.clientWidth/2-state.tx)/state.scale,y:(viewport.clientHeight/2-state.ty)/state.scale});
    else if (event.key.startsWith('Arrow')) {
      if (event.key === 'ArrowLeft') state.tx += 80;
      if (event.key === 'ArrowRight') state.tx -= 80;
      if (event.key === 'ArrowUp') state.ty += 80;
      if (event.key === 'ArrowDown') state.ty -= 80;
      render();
    } else return;
    event.preventDefault();
  });
  $('copy-pos').addEventListener('click', async () => {
    if (!state.selected) return;
    // Copy full precision, while the interface rounds to six decimal places.
    const { lat,lng } = state.selected;
    const text = JSON.stringify([lat,lng]);
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; }
    catch {
      const input = document.createElement('textarea'); input.value = text;
      input.style.cssText = 'position:fixed;left:-9999px'; document.body.append(input);
      input.select(); copied = document.execCommand('copy'); input.remove(); $('copy-pos').focus();
    }
    $('copy-status').textContent = copied ? 'Скопировано' : 'Выдели и скопируй pos выше';
    clearTimeout(copyTimer); copyTimer = setTimeout(() => { $('copy-status').textContent = ''; },2500);
  });
  // Six vertical strips, ordered left to right. Keep the original coordinate
  // bounds: 6 * 2901 = 17406 source pixels, displayed across 17408 map units.
  const mapParts = Array.from({ length: 6 }, (_, index) => `assets/${index + 1}.jpg`);
  const partStates = mapParts.map(() => 'loading');
  const mapStatus = $('map-status');
  world.replaceChildren();
  world.style.display = 'grid';
  world.style.gridTemplateColumns = 'repeat(6, minmax(0, 1fr))';
  world.style.gridTemplateRows = '100%';
  world.style.gap = '0';
  function updateMapStatus() {
    const failed = mapParts.filter((_, index) => partStates[index] === 'error');
    const loadedCount = partStates.filter(status => status === 'loaded').length;
    mapStatus.hidden = loadedCount === mapParts.length;
    mapStatus.textContent = failed.length
      ? `Не удалось загрузить: ${failed.join(', ')}. Проверь файлы и обнови страницу.`
      : `Загрузка карты… ${loadedCount}/${mapParts.length}`;
  }
  updateMapStatus();
  mapParts.forEach((src, index) => {
    const image = document.createElement('img');
    if (index === 0) image.id = 'map-image';
    image.alt = `Карта мира Dota 2 — часть ${index + 1} из ${mapParts.length}`;
    image.draggable = false;
    image.width = 2901; image.height = MAP.height;
    image.style.minWidth = '0';
    image.style.width = '100%'; image.style.height = '100%';
    image.addEventListener('load', () => {
      partStates[index] = 'loaded'; updateMapStatus();
    });
    image.addEventListener('error', () => {
      partStates[index] = 'error'; updateMapStatus();
    });
    world.append(image);
    image.src = src;
  });
  let lastSize = size();
  const observer = new ResizeObserver(() => {
    const previousFit = state.fit, nextSize = size();
    const center = {x:(lastSize.w/2-state.tx)/state.scale,y:(lastSize.h/2-state.ty)/state.scale};
    state.fit = Math.min(nextSize.w/MAP.width,nextSize.h/MAP.height);
    state.scale = state.fit * Math.max(1,Math.min(12,state.scale/previousFit));
    state.tx = nextSize.w/2-center.x*state.scale; state.ty = nextSize.h/2-center.y*state.scale;
    lastSize = nextSize;
    render();
  });
  fitMap(); observer.observe(viewport);
})();
