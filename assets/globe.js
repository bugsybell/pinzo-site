// Pinzo dotted globe: canvas, d3-geo orthographic, drag to spin, slow auto-rotation, course pins.
(function () {
  const LAND = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json';
  let dotsPromise;
  function landDots(step) {
    dotsPromise = dotsPromise || fetch(LAND).then(r => r.json()).then(topo => {
      const land = topojson.feature(topo, topo.objects.land);
      const dots = [];
      for (let lat = -84; lat <= 84; lat += step) {
        const n = Math.max(1, Math.round(360 * Math.cos(lat * Math.PI / 180) / step));
        for (let i = 0; i < n; i++) {
          const lon = -180 + (i + 0.5) * 360 / n;
          if (d3.geoContains(land, [lon, lat])) dots.push([lon, lat]);
        }
      }
      return dots;
    });
    return dotsPromise;
  }

  window.PINZO_PINS = [
    { name: 'Old Course, St Andrews', c: [-2.80, 56.34] }, { name: 'Royal County Down', c: [-5.87, 54.22] },
    { name: 'Kingsbarns', c: [-2.66, 56.30] }, { name: 'Falsterbo', c: [12.82, 55.40] },
    { name: 'Valderrama', c: [-5.36, 36.29] }, { name: 'Monte Rei', c: [-7.59, 37.23] },
    { name: 'Pebble Beach', c: [-121.95, 36.57] }, { name: 'Royal Portrush', c: [-6.65, 55.20] },
    { name: 'Lahinch', c: [-9.42, 52.94] }, { name: 'Le Golf National', c: [2.07, 48.75] },
    { name: 'Cape Kidnappers', c: [177.07, -39.65] }, { name: 'Emirates Golf Club', c: [55.16, 25.09] },
  ];

  window.PinzoGlobe = function (canvas, opts = {}) {
    const o = Object.assign({ dark: false, pins: window.PINZO_PINS, arcs: true, speed: 0.06, start: [10, -38], tilt: 0, interactive: true }, opts);
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let rot = [o.start[0], o.start[1], o.tilt], dots = [], hover = null, dragging = false, last = performance.now(), visible = true;
    const proj = d3.geoOrthographic().clipAngle(90);
    const col = o.dark
      ? { sphere: ['#1d2f27', '#0f1a15'], rim: 'rgba(216,181,120,.18)', dot: [166, 190, 172], pin: '#D8B578', arc: 'rgba(216,181,120,.55)', label: '#F4F1E8', labelBg: 'rgba(20,35,29,.92)' }
      : { sphere: ['#ffffff', '#e6ece7'], rim: 'rgba(31,56,47,.14)', dot: [62, 102, 80], pin: '#1F382F', arc: 'rgba(31,56,47,.45)', label: '#1B1E1C', labelBg: 'rgba(255,255,255,.95)' };

    // Always square: Safari can lay a canvas out at its default 2:1 shape, which clipped the globe.
    function size() {
      const w = canvas.clientWidth;
      canvas.style.height = w + 'px';
      canvas.width = w * dpr; canvas.height = w * dpr;
      proj.translate([w / 2, w / 2]).scale(w / 2 - 6);
    }
    size();
    new ResizeObserver(size).observe(canvas);
    new IntersectionObserver(e => { visible = e[0].isIntersecting; }).observe(canvas);

    function draw(t) {
      const w = canvas.clientWidth, h = w, r = proj.scale(), [cx, cy] = proj.translate();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createRadialGradient(cx - r * .35, cy - r * .4, r * .1, cx, cy, r);
      g.addColorStop(0, col.sphere[0]); g.addColorStop(1, col.sphere[1]);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = col.rim; ctx.lineWidth = 1; ctx.stroke();
      proj.rotate(rot);
      const center = [-rot[0], -rot[1]];
      const ds = Math.max(1, r / 240);
      for (const d of dots) {
        const dist = d3.geoDistance(d, center);
        if (dist > Math.PI / 2) continue;
        const p = proj(d), a = 0.35 + 0.65 * Math.cos(dist);
        ctx.fillStyle = `rgba(${col.dot[0]},${col.dot[1]},${col.dot[2]},${a})`;
        ctx.beginPath(); ctx.arc(p[0], p[1], ds * (0.6 + 0.4 * Math.cos(dist)), 0, 2 * Math.PI); ctx.fill();
      }
      if (o.arcs && o.pins.length > 1) {
        const path = d3.geoPath(proj, ctx);
        ctx.strokeStyle = col.arc; ctx.lineWidth = 1.1; ctx.setLineDash([3, 4]);
        for (let i = 0; i < o.pins.length - 1; i++) {
          ctx.beginPath(); path({ type: 'LineString', coordinates: [o.pins[i].c, o.pins[i + 1].c] }); ctx.stroke();
        }
        ctx.setLineDash([]);
      }
      const pulse = (Math.sin(t / 600) + 1) / 2;
      hover = hover && d3.geoDistance(hover.c, center) < Math.PI / 2 ? hover : null;
      for (const pin of o.pins) {
        if (d3.geoDistance(pin.c, center) > Math.PI / 2 - 0.05) continue;
        const p = proj(pin.c);
        ctx.fillStyle = col.pin; ctx.globalAlpha = 0.18 + 0.12 * pulse;
        ctx.beginPath(); ctx.arc(p[0], p[1], 7 + 5 * pulse, 0, 2 * Math.PI); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(p[0], p[1], 3.6, 0, 2 * Math.PI); ctx.fill();
        pin._p = p;
      }
      if (hover && hover._p) {
        const p = hover._p, text = hover.name;
        ctx.font = '600 13px "Instrument Sans", system-ui, sans-serif';
        const tw = ctx.measureText(text).width + 22;
        ctx.fillStyle = col.labelBg;
        ctx.beginPath(); ctx.roundRect(p[0] - tw / 2, p[1] - 40, tw, 28, 14); ctx.fill();
        ctx.fillStyle = col.label; ctx.textAlign = 'center'; ctx.fillText(text, p[0], p[1] - 21);
      }
    }

    function frame(t) {
      const dt = t - last; last = t;
      if (!dragging && visible && !matchMedia('(prefers-reduced-motion: reduce)').matches) rot[0] += o.speed * dt / 16;
      if (visible) draw(t);
      requestAnimationFrame(frame);
    }

    if (o.interactive) {
      d3.select(canvas).call(d3.drag()
        .on('start', () => { dragging = true; canvas.style.cursor = 'grabbing'; })
        .on('drag', e => { const k = 70 / proj.scale(); rot[0] += e.dx * k * 3; rot[1] = Math.max(-60, Math.min(60, rot[1] - e.dy * k * 3)); })
        .on('end', () => { dragging = false; canvas.style.cursor = 'grab'; }));
      canvas.style.cursor = 'grab';
      canvas.addEventListener('mousemove', e => {
        const b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
        hover = o.pins.find(p => p._p && Math.hypot(p._p[0] - x, p._p[1] - y) < 12) || null;
      });
      canvas.addEventListener('mouseleave', () => { hover = null; });
    }
    landDots(o.step || 1.9).then(d => { dots = d; });
    requestAnimationFrame(frame);
  };
})();
