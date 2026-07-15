/* ═══════════════════════════════════════════════════════════════════════════
   STORM CITY — the live background for SpartanH2.

   Detroit seen from Belle Isle, west across the river: storm clouds with
   lightning firing inside them, driving rain in three depth layers, the skyline
   and its reflection in the water.

   Self-contained. It builds its own DOM (a fixed canvas behind the card, plus a
   sheet-lightning overlay), so a page only has to load this file. Drop the
   <script> tag and the site is exactly as it was.

   HOW TO CHANGE IT — see STORM_CITY.md at the repo root. The short version:
     - the city:      drawSkyline()      buildings, in a fixed virtual width
     - the weather:   the engine below   clouds, rain, bolts, flash

   PERFORMANCE CONTRACT (do not break these; they are why it is cheap):
     - the skyline is baked ONCE into an offscreen canvas, never redrawn
     - rain is 3 batched paths, not 900 stroke calls
     - DPR is capped at 1.5; the loop is capped at 30fps
     - it pauses hard when the tab is hidden, and never starts at all under
       prefers-reduced-motion
     - no ctx.shadowBlur anywhere: bloom is a wide dim pass under a thin bright
       one, which is the cheap way to fake it
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // Respect the user before doing anything at all. This is a decorative
  // background: moving fog and lightning are textbook vestibular triggers, so
  // if they have asked for reduced motion we simply never build it.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Build the DOM the engine needs, so pages only carry a script tag.
  const fx = document.createElement('div');
  fx.id = 'bgfx';
  fx.setAttribute('aria-hidden', 'true');
  const canvasEl = document.createElement('canvas');
  canvasEl.id = 'bgc';
  const flashEl0 = document.createElement('div');
  flashEl0.className = 'flash';
  fx.appendChild(canvasEl);
  fx.appendChild(flashEl0);
  document.body.insertBefore(fx, document.body.firstChild);

  /* ═══════════════════════════════════════════════════════════════════════════
     THE DETROIT SKYLINE, from Belle Isle looking west across the river.

     Single source of truth: injected into both the Storm City demo and the
     skyline lab page (skyline-lab.html), which renders it big and clean with no
     rain, clouds or card on top so the silhouettes can actually be judged.

     Everything is drawn as SILHOUETTE + LIT WINDOWS. At night, from a mile away
     across water, that is all a building is: a black shape with a rim where the
     light catches it, and its windows. Get the shape right and it reads; get it
     wrong and no amount of detail saves it.

     Coordinates: origin top-left. `HZ` is the waterline. Buildings are laid out in
     a fixed virtual width and then scaled, so on a phone the city overflows the
     right edge rather than being crushed to fit.
     ═══════════════════════════════════════════════════════════════════════════ */
  function drawSkyline(s, W, H, HZ, ZOOM) {

    // ── LAYOUT SPACE. The city is laid out in a fixed virtual width (VW) and
    //    then scaled. On a wide screen the scale is just W/VW, so the whole
    //    skyline spans the viewport. On a NARROW screen we refuse to shrink it
    //    any further — we take the height-derived scale instead and simply let
    //    the city run off the right edge. The RenCen stays anchored on the left
    //    at a proper size and you see a few buildings marching right, rather
    //    than the entire skyline crushed into 400px of phone.
    const VW = 1150;
    const S = Math.max(W / VW, Math.min(1.15, H / 780)) * (ZOOM || 1);
    const CITY_W = VW * S;

    // When the city is wider than the viewport (any phone), pan it so the RenCen
    // sits near the LEFT edge at full size and the rest of downtown marches off
    // to the right. Fitting the whole skyline into 400px is what made it look
    // cramped; showing a proper RenCen and a few neighbours does not.
    //
    // The framing is keyed on the RENCEN, deliberately. It was briefly shifted
    // right to keep Michigan Central (which sits west of it) on screen, but that
    // moved every other building with it — the station is a guest here, it does
    // not get to reframe the skyline. On a narrow screen it simply runs off the
    // left edge, the same as the rest of the city runs off the right.
    const OX = CITY_W > W ? (W * 0.20 - 0.22 * CITY_W) : 0;
    const X = (f) => f * CITY_W + OX;   // design fraction -> screen x

    const GOLD = '201,162,75';
    const GOLD_HI = '232,199,106';
    const CRIMSON = '225,29,72';

    const BODY = '#080b16';        // standard tower body
    const BODY_NEAR = '#04060c';   // nearer = darker (it blocks more of the glow)
    const BODY_FAR = '#0b0f1e';    // further = lighter (haze washes it out)

    // ── Storm glow behind the city. Black towers on a black page are invisible;
    //    this is the lit sky they stand against.
    const glow = s.createRadialGradient(X(0.30), HZ, 10, X(0.30), HZ, Math.max(W, H) * 0.7);
    glow.addColorStop(0, 'rgba(' + GOLD + ',0.18)');
    glow.addColorStop(0.35, 'rgba(185,28,44,0.11)');
    glow.addColorStop(1, 'rgba(185,28,44,0)');
    s.fillStyle = glow;
    s.fillRect(0, 0, W, HZ + 2);

    // ── Lit windows. They CLUSTER: offices light up by the floor, not at random.
    function win(x, y, w, h, density) {
      for (let wy = y + 4; wy < y + h - 2; wy += 6) {
        const floorLit = Math.random() < 0.35;                 // is this floor busy?
        for (let wx = x + 2; wx < x + w - 2; wx += 5) {
          if (Math.random() > (floorLit ? density * 1.9 : density * 0.55)) continue;
          s.fillStyle = Math.random() < 0.08
            ? 'rgba(' + CRIMSON + ',' + (0.3 + Math.random() * 0.5) + ')'
            : 'rgba(' + GOLD_HI + ',' + (0.25 + Math.random() * 0.55) + ')';
          s.fillRect(wx, wy, 2, 3);
        }
      }
    }

    // Rim light down the lit edge + along the top. This is what separates one
    // black shape from the black shape behind it.
    function rim(x, y, w, h, a) {
      s.fillStyle = 'rgba(' + GOLD + ',' + (a || 0.16) + ')';
      s.fillRect(x, y, 1, h);
      s.fillRect(x, y, w, 1);
    }

    // ── Primitive: a flat-topped box.
    function box(x, w, h, density, body, rimA) {
      const y = HZ - h;
      s.fillStyle = body || BODY;
      s.fillRect(x, y, w, h);
      rim(x, y, w, h, rimA);
      win(x, y, w, h, density === undefined ? 0.18 : density);
      return y;
    }

    // ── Primitive: a cylinder (rounded shoulders + vertical mullions).
    //    The RenCen towers are ribbed glass tubes; the ribs are what say "glass".
    function cyl(x, w, h, density, body, edgeA) {
      const y = HZ - h, r = Math.min(7, w * 0.28);
      s.save();
      s.beginPath();
      s.moveTo(x, HZ);
      s.lineTo(x, y + r);
      s.quadraticCurveTo(x, y, x + r, y);
      s.lineTo(x + w - r, y);
      s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, HZ);
      s.closePath();
      s.clip();

      // CROSS-SHADING is what makes a tube read as a tube instead of a flat box.
      // A cylinder is darkest where it turns away from us at the edges and
      // lightest down the middle where it faces us. Without this the RenCen is
      // just five rectangles, which is exactly what it looked like.
      const shade = s.createLinearGradient(x, 0, x + w, 0);
      const base = body || BODY;
      shade.addColorStop(0, '#03040a');
      shade.addColorStop(0.22, base);
      shade.addColorStop(0.5, '#131a30');
      shade.addColorStop(0.78, base);
      shade.addColorStop(1, '#03040a');
      s.fillStyle = shade;
      s.fillRect(x, y, w, h);

      // A glass tube also catches a vertical highlight just off centre.
      const hl = s.createLinearGradient(x, 0, x + w, 0);
      hl.addColorStop(0, 'rgba(' + GOLD + ',0)');
      hl.addColorStop(0.42, 'rgba(' + GOLD + ',0.10)');
      hl.addColorStop(0.52, 'rgba(' + GOLD + ',0)');
      s.fillStyle = hl;
      s.fillRect(x, y, w, h);

      // Vertical mullions, tighter toward the edges: the ribs wrap around the
      // curve, so they bunch up where the surface turns away.
      s.strokeStyle = 'rgba(' + GOLD + ',0.07)';
      s.lineWidth = 1;
      for (let i = 1; i < 12; i++) {
        const f = i / 12;
        const mx = x + w * (0.5 - Math.cos(f * Math.PI) * 0.5);   // cosine spacing
        s.beginPath(); s.moveTo(mx, y + r); s.lineTo(mx, HZ); s.stroke();
      }
      win(x, y + r, w, h - r, density);
      s.restore();

      // Outline last, over the shading: this is what stops overlapping black
      // cylinders from merging into a single blob.
      s.beginPath();
      s.moveTo(x, HZ);
      s.lineTo(x, y + r);
      s.quadraticCurveTo(x, y, x + r, y);
      s.lineTo(x + w - r, y);
      s.quadraticCurveTo(x + w, y, x + w, y + r);
      s.lineTo(x + w, HZ);
      s.strokeStyle = 'rgba(' + GOLD + ',' + (edgeA || 0.26) + ')';
      s.lineWidth = 1;
      s.stroke();
      return y;
    }

    // ═══════════════════════════════════════════════════════════════
    //  THE RENAISSANCE CENTER
    //
    //  Plan: a 73-storey hotel cylinder at the centre of a SQUARE, with four
    //  identical 39-storey office cylinders at the square's corners.
    //
    //  We view that square CORNER-ON from Belle Isle, so it projects to a
    //  diamond and the four identical towers land at four different depths:
    //
    //              back   (furthest: mostly swallowed by the hotel)
    //        left  o           o  right
    //              front  (nearest: stands in FRONT of the hotel)
    //
    //  Perspective therefore makes identical buildings render at different
    //  heights: near = tallest on screen, back = shortest. The front tower is
    //  offset LEFT of the hotel's centreline, so the hotel's shaft stays exposed
    //  down its right side. Painted back -> left -> right -> front so the
    //  overlaps actually occlude.
    //
    //  The whole cluster sits on a wide 5-storey podium at the waterline, which
    //  is what plants it on the river in every photograph.
    // ═══════════════════════════════════════════════════════════════
    const RC = X(0.22);              // cluster centre
    const HW = 44 * S;                // hotel: a fat glass tube, not a pole
    const HH = 248 * S;
    const hx = RC - HW / 2;

    const T_BACK  = { body: BODY_FAR,  edge: 0.14, win: 0.14 };
    const T_SIDE  = { body: '#06080f', edge: 0.24, win: 0.22 };
    const T_FRONT = { body: BODY_NEAR, edge: 0.34, win: 0.26 };

    const BACK  = { x: hx + 0.40 * HW, w: HW * 0.74, h: HH * 0.62, t: T_BACK };
    const LEFT  = { x: hx - 0.92 * HW, w: HW * 0.86, h: HH * 0.74, t: T_SIDE };
    const RIGHT = { x: hx + 1.12 * HW, w: HW * 0.90, h: HH * 0.76, t: T_SIDE };
    const FRONT = { x: hx - 0.14 * HW, w: HW * 0.98, h: HH * 0.80, t: T_FRONT };

    // An office tower: cylinder + the flat mechanical crown box on top.
    function officeTower(T) {
      const y = cyl(T.x, T.w, T.h, T.t.win, T.t.body, T.t.edge);
      // Dark mechanical collar just under the top, then the crown box: the
      // office towers are capped, not open-topped.
      s.fillStyle = '#04060c';
      s.fillRect(T.x + 1, y + 3 * S, T.w - 2, 3 * S);
      s.fillStyle = T.t.body;
      s.fillRect(T.x + T.w * 0.18, y - 4 * S, T.w * 0.64, 4 * S);
      s.strokeStyle = 'rgba(' + GOLD + ',' + T.t.edge + ')';
      s.lineWidth = 1;
      s.strokeRect(T.x + T.w * 0.18, y - 4 * S, T.w * 0.64, 4 * S);
    }

    officeTower(BACK);

    // The hotel.
    (function hotel() {
      const y = cyl(hx, HW, HH, 0.24, BODY, 0.28);
      // Crown: the wide restaurant band, then the narrower drum, then the mast.
      s.fillStyle = BODY;
      s.fillRect(hx + HW * 0.06, y - 8 * S, HW * 0.88, 8 * S);
      s.strokeStyle = 'rgba(' + GOLD + ',0.32)';
      s.lineWidth = 1;
      s.strokeRect(hx + HW * 0.06, y - 8 * S, HW * 0.88, 8 * S);
      // The lit ring: the RenCen's crown glows at night, and it is the single
      // most recognisable detail on the whole building.
      s.fillStyle = 'rgba(' + GOLD_HI + ',0.5)';
      s.fillRect(hx + HW * 0.06, y - 6 * S, HW * 0.88, 1.5);
      s.fillStyle = BODY;
      s.fillRect(hx + HW * 0.26, y - 14 * S, HW * 0.48, 6 * S);
      s.strokeRect(hx + HW * 0.26, y - 14 * S, HW * 0.48, 6 * S);
      s.fillRect(hx + HW * 0.5 - 1, y - 30 * S, 2, 16 * S);          // mast
      s.fillStyle = 'rgba(' + CRIMSON + ',0.9)';
      s.fillRect(hx + HW * 0.5 - 2.5, y - 33 * S, 5, 4);             // beacon
    })();

    officeTower(LEFT);
    officeTower(RIGHT);
    officeTower(FRONT);

    // The podium the cluster stands on, and the low riverfront buildings in
    // front of it. Without this the towers look like they float on the water.
    const podL = LEFT.x - 26 * S, podR = RIGHT.x + RIGHT.w + 22 * S;
    s.fillStyle = '#0a0e1c';
    s.fillRect(podL, HZ - 26 * S, podR - podL, 26 * S);
    rim(podL, HZ - 26 * S, podR - podL, 26 * S, 0.12);
    win(podL, HZ - 26 * S, podR - podL, 26 * S, 0.12);

    // Towers 500 / 600: the two low boxy towers immediately west of the cluster.
    box(podL - 30 * S, 24 * S, 62 * S, 0.2, '#090d1a');
    box(podL - 58 * S, 20 * S, 50 * S, 0.18, '#090d1a');


    /* ═══════════════════════════════════════════════════════════════════════
       THE LANDMARKS.

       Detroit's skyline is an art deco skyline. Deco means SETBACKS — the tower
       steps inward as it rises — and it means a CROWN, not a flat roof. That
       stepped, crowned silhouette is the entire difference between "Detroit" and
       "generic city", so each landmark is built from its own real profile rather
       than from a rectangle with a hat on it.
       ═══════════════════════════════════════════════════════════════════════ */

    // ── Helper: a tower that steps inward as it rises. `steps` is a list of
    //    [heightFraction, widthFraction] from the ground up.
    function stepped(x, w, h, steps, body, density) {
      let cx = x, cw = w, top = HZ;
      const parts = [];
      for (const st of steps) {
        const sh = h * st[0], sw = w * st[1];
        cx = x + (w - sw) / 2;                    // stay centred as it narrows
        const y = top - sh;
        s.fillStyle = body || BODY;
        s.fillRect(cx, y, sw, sh);
        rim(cx, y, sw, sh, 0.15);
        win(cx, y, sw, sh, density === undefined ? 0.2 : density);
        parts.push({ x: cx, y, w: sw, h: sh });
        top = y;
        cw = sw;
      }
      return { top, x: cx, w: cw, parts };
    }

    // ── PENOBSCOT. 1928 art deco. Big square base, then a tall shaft, then a
    //    tight stack of setbacks, capped by the mast and its red beacon — the
    //    beacon is the tell, it has been burning over Detroit for a century.
    (function penobscot() {
      const x = X(0.355), w = 40 * S, h = 190 * S;
      const t = stepped(x, w, h, [[0.52, 1.0], [0.24, 0.66], [0.12, 0.42], [0.07, 0.26]], BODY, 0.2);
      s.fillStyle = BODY;
      s.fillRect(t.x + t.w * 0.5 - 1, t.top - 18 * S, 2, 18 * S);     // mast
      s.fillStyle = 'rgba(' + CRIMSON + ',0.95)';                      // THE beacon
      s.beginPath(); s.arc(t.x + t.w * 0.5, t.top - 20 * S, 3, 0, 7); s.fill();
      s.fillStyle = 'rgba(' + CRIMSON + ',0.25)';
      s.beginPath(); s.arc(t.x + t.w * 0.5, t.top - 20 * S, 7, 0, 7); s.fill();
    })();

    // ── GUARDIAN. 1929. Deco again, but its top is a stepped PYRAMID of gables
    //    rather than a mast: the profile tapers to a blunt point.
    (function guardian() {
      const x = X(0.318), w = 30 * S, h = 152 * S;
      const t = stepped(x, w, h, [[0.62, 1.0], [0.2, 0.7], [0.1, 0.44]], BODY, 0.18);
      s.fillStyle = BODY;                                              // gabled cap
      s.beginPath();
      s.moveTo(t.x, t.top);
      s.lineTo(t.x + t.w / 2, t.top - 14 * S);
      s.lineTo(t.x + t.w, t.top);
      s.closePath(); s.fill();
      s.strokeStyle = 'rgba(' + GOLD + ',0.18)';
      s.lineWidth = 1; s.stroke();
    })();

    // ── ALLY / ONE DETROIT CENTER. 1993, postmodern-gothic: the tallest office
    //    tower, and its crown is a CLUSTER OF SPIRES — a central peak flanked by
    //    smaller ones, like a cathedral. That crown is its whole identity.
    (function ally() {
      const x = X(0.418), w = 46 * S, h = 190 * S;
      // Shaft, then TWO setbacks, then the crown. The crown is a single mass that
      // rises to one central peak with buttress spires tucked against it — not a
      // row of equal triangles, which reads as a comb.
      const t = stepped(x, w, h, [[0.72, 1.0], [0.16, 0.78], [0.12, 0.56]], BODY, 0.2);
      const cx0 = t.x, cw = t.w, y = t.top;
      s.fillStyle = BODY;
      s.beginPath();
      s.moveTo(cx0, y);
      s.lineTo(cx0, y - 10 * S);
      s.lineTo(cx0 + cw * 0.18, y - 22 * S);      // shoulder
      s.lineTo(cx0 + cw * 0.36, y - 16 * S);      // notch
      s.lineTo(cx0 + cw * 0.5, y - 52 * S);       // THE peak
      s.lineTo(cx0 + cw * 0.64, y - 16 * S);
      s.lineTo(cx0 + cw * 0.82, y - 22 * S);
      s.lineTo(cx0 + cw, y - 10 * S);
      s.lineTo(cx0 + cw, y);
      s.closePath();
      s.fill();
      s.strokeStyle = 'rgba(' + GOLD + ',0.22)';
      s.lineWidth = 1; s.stroke();
      // Lit crown: Ally's peak is floodlit at night, and that glow is how you
      // pick it out of the skyline from a mile away.
      s.fillStyle = 'rgba(' + GOLD_HI + ',0.35)';
      s.fillRect(cx0 + cw * 0.46, y - 50 * S, 2, 34 * S);
    })();

    // ── HUDSON'S. 2025, the new one: a slim glass shaft, taller than everything
    //    around it, topped by a needle. Modern, so no setbacks — the contrast
    //    with the deco towers beside it is the point.
    (function hudsons() {
      const x = X(0.487), w = 20 * S, h = 232 * S;
      const y = box(x, w, h, 0.14, '#0a0f1e');
      s.fillStyle = BODY;
      s.fillRect(x + w * 0.5 - 1, y - 40 * S, 2, 40 * S);              // needle
      s.fillStyle = 'rgba(' + GOLD_HI + ',0.8)';
      s.fillRect(x + w * 0.5 - 1.5, y - 42 * S, 3, 3);
    })();

    // ── DAVID STOTT. 1929. Very slim deco: a narrow shaft with a stack of tight
    //    setbacks. Reads as a thin, elegant wedge.
    (function stott() {
      const x = X(0.545), w = 22 * S, h = 165 * S;
      stepped(x, w, h, [[0.58, 1.0], [0.22, 0.72], [0.12, 0.5], [0.08, 0.3]], BODY, 0.18);
    })();

    // ── BOOK TOWER. 1926. The eccentric one: an ornate shaft capped by a steep
    //    green mansard ROOF, not a spire. That dome-ish cap is unmistakable.
    (function book() {
      const x = X(0.585), w = 26 * S, h = 148 * S;
      const y = box(x, w, h, 0.18, BODY);
      s.fillStyle = BODY;                                              // mansard cap
      s.beginPath();
      s.moveTo(x - 2, y);
      s.lineTo(x + w * 0.22, y - 16 * S);
      s.lineTo(x + w * 0.78, y - 16 * S);
      s.lineTo(x + w + 2, y);
      s.closePath(); s.fill();
      s.strokeStyle = 'rgba(' + GOLD + ',0.22)';
      s.lineWidth = 1; s.stroke();
      s.fillStyle = BODY;                                              // cupola
      s.fillRect(x + w * 0.42, y - 24 * S, w * 0.16, 8 * S);
    })();

    // ── CADILLAC TOWER. 1927. Slim deco, blunt stepped top.
    (function cadillac() {
      const x = X(0.625), w = 24 * S, h = 140 * S;
      stepped(x, w, h, [[0.66, 1.0], [0.2, 0.66], [0.14, 0.4]], BODY, 0.18);
    })();

    // ── RIVERFRONT TOWERS. Three pale residential towers WEST of the RenCen,
    //    right on the water. Round-shouldered and identical — a rhythm, not a
    //    landmark, but the eye misses them when they are gone.
    for (let i = 0; i < 3; i++) {
      cyl(podL - (95 + i * 30) * S, 18 * S, (112 + i * 8) * S, 0.24, '#0b1020', 0.2);
    }

    // ── Depth ranks. Landmarks alone sit in a line; a city has buildings BEHIND
    //    and IN FRONT of its landmarks. The back rank is lighter (haze) and the
    //    front rank is darker (it blocks the glow), and both overlap their
    //    neighbours, which is what turns a row into a district.
    const backRank = [
      [0.30, 26, 118], [0.345, 22, 96], [0.395, 30, 132], [0.44, 24, 104],
      [0.475, 28, 122], [0.515, 22, 88], [0.56, 26, 110], [0.60, 30, 126],
      [0.645, 24, 98], [0.68, 28, 116], [0.72, 22, 90],
    ];
    for (const b of backRank) box(X(b[0]) - 6 * S, b[1] * S, b[2] * S, 0.12, BODY_FAR, 0.08);

    const frontRank = [
      [0.315, 30, 74], [0.36, 26, 62], [0.40, 34, 86], [0.45, 24, 58],
      [0.49, 30, 70], [0.535, 26, 64], [0.575, 32, 80], [0.62, 24, 56],
      [0.66, 30, 72], [0.70, 26, 60], [0.74, 28, 68],
    ];
    for (const b of frontRank) box(X(b[0]), b[1] * S, b[2] * S, 0.22, BODY_NEAR, 0.2);

    // ── HUNTINGTON PLACE. The long low convention hall on the waterfront: wide
    //    and flat, it anchors the shoreline west of the cluster.
    (function hall() {
      const x = podL - 200 * S, w = 105 * S, h = 30 * S;
      const y = HZ - h;
      s.fillStyle = '#090d1a';
      s.fillRect(x, y, w, h);
      rim(x, y, w, h, 0.13);
      win(x, y, w, h, 0.14);
    })();

    // ── Shoreline: a thin strip of ground at the waterline, its wet edge faded
    //    at both ends. A flat full-width line reads as a rule drawn across the
    //    page rather than a shore.
    s.fillStyle = '#05070e';
    s.fillRect(0, HZ - 2 * S, W, 3 * S);
    const shore = s.createLinearGradient(0, 0, W, 0);
    shore.addColorStop(0, 'rgba(' + GOLD + ',0)');
    shore.addColorStop(0.2, 'rgba(' + GOLD + ',0.10)');
    shore.addColorStop(0.5, 'rgba(' + GOLD + ',0.13)');
    shore.addColorStop(0.85, 'rgba(' + GOLD + ',0.07)');
    shore.addColorStop(1, 'rgba(' + GOLD + ',0)');
    s.fillStyle = shore;
    s.fillRect(0, HZ, W, 1);
  }


  const cv = document.getElementById('bgc');
  const ctx = cv.getContext('2d');
  let w = 0, h = 0, dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = cv.clientWidth; h = cv.clientHeight;
    cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (typeof onResize === 'function') onResize();
  }

  let sky = null, rain = [], bolts = [], clouds = [], puffs = [];
  let nextBolt = 1.2, flashV = 0, horizon = 0;
  const flashEl = document.querySelector('.flash');
  const WIND = -0.20;

  // ── Storm clouds. Sized off the viewport DIAGONAL, not its width: on a tall
  //    phone, width-based scaling made them balloon into blobs that filled the
  //    sky. Count scales too, so a narrow screen gets fewer, smaller clouds and a
  //    wide one gets more.
  function bakeCloud() {
    const W = 520, H = 250, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.filter = 'blur(16px)';
    const blob = (bx, by, br, col) => {
      const g = x.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(bx, by, br, 0, 7); x.fill();
    };
    // Lighter than the night sky, or it is invisible: a storm cloud at night is
    // lit from beneath by the city, so it is grey-navy, not black.
    for (let i = 0; i < 14; i++) {
      blob(50 + Math.random() * (W - 100), 65 + Math.random() * 80,
           45 + Math.random() * 80, 'rgba(32,38,64,0.5)');
    }
    for (let i = 0; i < 8; i++) {   // crimson underbelly: city light thrown back up
      blob(60 + Math.random() * (W - 120), 150 + Math.random() * 55,
           40 + Math.random() * 65, 'rgba(185,28,44,0.26)');
    }
    for (let i = 0; i < 6; i++) {   // gold rim on top
      blob(70 + Math.random() * (W - 140), 48 + Math.random() * 28,
           30 + Math.random() * 50, 'rgba(201,162,75,0.18)');
    }
    for (let i = 0; i < 5; i++) {   // ragged dark core
      blob(80 + Math.random() * (W - 160), 100 + Math.random() * 50,
           28 + Math.random() * 48, 'rgba(8,11,22,0.45)');
    }
    return c;
  }

  function makeClouds() {
    const diag = Math.hypot(w, h);
    const base = diag / 1500;                       // viewport-independent scale
    const n = Math.max(5, Math.min(14, Math.round(w / 130)));
    clouds = [];
    for (let i = 0; i < n; i++) {
      const far = i % 2 === 0;
      const sc = (far ? 0.5 + Math.random() * 0.25 : 0.75 + Math.random() * 0.4) * base;
      // Keep every cloud inside the sky band and above the skyline: on a tall
      // screen an unclamped y put them in the water.
      const ch = 250 * sc;
      const yMin = ch * 0.35;
      const yMax = Math.max(yMin + 1, horizon * 0.62);
      clouds.push({
        x: Math.random() * (w + 400) - 200,
        y: yMin + Math.random() * (yMax - yMin),
        sc,
        sp: (far ? 0.05 : 0.13) + Math.random() * 0.08,
        a: far ? 0.45 + Math.random() * 0.2 : 0.7 + Math.random() * 0.25,
        s: puffs[(Math.random() * puffs.length) | 0],
        far,
      });
    }
  }

  function bakeSkyline() {
    horizon = h * 0.55;
    sky = document.createElement('canvas');
    sky.width = Math.floor(w * dpr); sky.height = Math.floor(h * dpr);
    const s = sky.getContext('2d');
    s.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The skyline computes its own layout scale now (fixed virtual width, and it
    // overflows off-screen rather than shrinking on a phone), so it just needs a
    // zoom factor.
    drawSkyline(s, w, h, horizon, 1);
  }

  function onResize() {
    bakeSkyline();
    if (!puffs.length) puffs = [bakeCloud(), bakeCloud(), bakeCloud()];
    makeClouds();
    const area = w * h;
    const layers = [
      [area / 5200, 6, 12, 3.5, 5.5],
      [area / 4200, 14, 26, 7, 11],
      [area / 9000, 34, 62, 15, 24],
    ];
    rain = [];
    layers.forEach((L, depth) => {
      for (let i = 0; i < L[0]; i++) {
        rain.push({
          depth,
          x: Math.random() * (w + 200) - 100,
          y: Math.random() * h,
          len: L[1] + Math.random() * (L[2] - L[1]),
          sp: L[3] + Math.random() * (L[4] - L[3]),
        });
      }
    });
  }

  function strike() {
    if (!clouds.length) return;
    // Only strike from clouds that are actually ON SCREEN. Clouds drift in from
    // off-canvas, and on a narrow phone most of them are off-canvas most of the
    // time — picking one at random meant the lightning was firing where you
    // could not see it. Also: if a pick fails (cloud too low to leave room for a
    // bolt), try again rather than silently skipping the strike entirely.
    const onscreen = clouds.filter(c => c.x > w * 0.05 && c.x < w * 0.95);
    // On a phone the card fills nearly the full width, so the sky behind it is
    // where the bolts were firing unseen. Prefer clouds toward the left/right
    // margins, where the strike is not hidden behind the panel.
    const narrowVp = w < 700;
    const sided = narrowVp
      ? onscreen.filter(c => c.x < w * 0.3 || c.x > w * 0.7)
      : onscreen;
    const pool = sided.length ? sided : (onscreen.length ? onscreen : clouds);
    let src = null, x0 = 0, y0 = 0, endY = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      const c = pool[(Math.random() * pool.length) | 0];
      const tx = c.x + (Math.random() - 0.5) * 120 * c.sc;
      const ty = c.y + 80 * c.sc;
      const te = horizon - Math.random() * 40;
      if (te > ty + 40 && tx > -w * 0.05 && tx < w * 1.05) {
        src = c; x0 = tx; y0 = ty; endY = te;
        break;
      }
    }
    if (!src) return;
    const near = !src.far;
    const steps = 6 + (Math.random() * 6 | 0);
    const dy = (endY - y0) / steps;
    const pts = [{ x: x0, y: y0 }];
    let x = x0, y = y0;
    for (let i = 0; i < steps; i++) {
      y += dy;
      x += (Math.random() - 0.5) * (near ? 52 : 30);
      pts.push({ x, y });
    }
    const forks = [];
    for (let i = 2; i < pts.length - 1; i++) {
      if (Math.random() < 0.35) {
        const f = [pts[i]];
        let fx = pts[i].x, fy = pts[i].y;
        const n = 2 + (Math.random() * 3 | 0);
        for (let k = 0; k < n; k++) {
          fy += (endY - fy) * (0.25 + Math.random() * 0.3);
          fx += (Math.random() - 0.5) * (near ? 66 : 40);
          f.push({ x: fx, y: fy });
        }
        forks.push(f);
      }
    }
    bolts.push({ pts, forks, life: 1, near });
    flashV = Math.max(flashV, near ? 0.7 + Math.random() * 0.3 : 0.3 + Math.random() * 0.3);
  }

  function strokeBolt(b, mirror) {
    const a = b.life;
    const paths = [b.pts].concat(b.forks);
    // Thicker on a narrow viewport: a 1.7px bolt seen through a translucent card
    // is invisible, and on a phone the card covers the sky.
    const k = w < 700 ? 1.7 : 1;
    const passes = b.near
      ? [[9 * k, 'rgba(201,162,75,' + (a * 0.16) + ')'], [3.6 * k, 'rgba(232,199,106,' + (a * 0.4) + ')'], [1.7 * k, 'rgba(255,252,244,' + a + ')']]
      : [[5 * k, 'rgba(201,162,75,' + (a * 0.1) + ')'], [1.1 * k, 'rgba(240,235,220,' + (a * 0.6) + ')']];
    for (const p of passes) {
      ctx.lineWidth = p[0]; ctx.strokeStyle = p[1];
      for (const path of paths) {
        ctx.beginPath();
        const my = (v) => mirror ? (2 * horizon - v) : v;
        ctx.moveTo(path[0].x, my(path[0].y));
        for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, my(path[i].y));
        ctx.stroke();
      }
    }
  }

  function draw(t) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';           // bolts, behind the clouds
    for (const b of bolts) strokeBolt(b, false);

    ctx.globalCompositeOperation = 'source-over';       // clouds over the bolts
    for (const c of clouds) {
      ctx.globalAlpha = c.a;
      const cw = 520 * c.sc, ch = 250 * c.sc;
      ctx.drawImage(c.s, c.x - cw / 2, c.y - ch / 2, cw, ch);
      c.x += c.sp;
      if (c.x - cw / 2 > w + 60) c.x = -cw / 2 - 60;
    }
    ctx.globalAlpha = 1;
    if (flashV > 0.02) {                                // the flash lights them from within
      ctx.globalCompositeOperation = 'lighter';
      for (const c of clouds) {
        if (c.far) continue;
        ctx.globalAlpha = flashV * 0.35;
        const cw = 520 * c.sc, ch = 250 * c.sc;
        ctx.drawImage(c.s, c.x - cw / 2, c.y - ch / 2, cw, ch);
      }
      ctx.globalAlpha = 1;
    }

    ctx.globalCompositeOperation = 'source-over';       // the city occludes the storm
    ctx.drawImage(sky, 0, 0, w, h);

    // The river: slice the skyline back row by row, each row offset by a
    // travelling sine. That horizontal smear is what water does to light.
    const SLICE = 3;
    for (let y = horizon; y < h; y += SLICE) {
      const d = (y - horizon) / (h - horizon);
      const wob = Math.sin(y * 0.05 + t * 1.6) * (1.5 + d * 16);
      ctx.globalAlpha = 0.5 * (1 - d * 0.7);
      ctx.drawImage(sky,
        0, Math.floor((2 * horizon - y - SLICE) * dpr), sky.width, Math.floor(SLICE * dpr),
        wob, y, w, SLICE + 1);
    }
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25;
    for (const b of bolts) strokeBolt(b, true);          // lightning in the water
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(201,162,75,0.05)';           // chop
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = horizon + 4; y < h; y += 7) {
      const d = (y - horizon) / (h - horizon);
      const seg = 20 + d * 90;
      for (let x = (t * 12 + y * 7) % seg - seg; x < w; x += seg + 26) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + seg * (0.3 + Math.random() * 0.4), y);
      }
    }
    ctx.stroke();

    for (let depth = 0; depth < 3; depth++) {            // rain: 3 batched paths
      ctx.strokeStyle = 'rgba(232,199,106,' + (depth === 0 ? 0.09 : 0.16) + ')';
      ctx.lineWidth = depth === 2 ? 1.9 : (depth === 1 ? 1 : 0.6);
      ctx.beginPath();
      for (const d of rain) {
        if (d.depth !== depth) continue;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.len * WIND, d.y + d.len);
        d.y += d.sp;
        d.x += d.sp * WIND;
        if (d.y > h) { d.y = -d.len; d.x = Math.random() * (w + 200) - 100; }
      }
      ctx.stroke();
    }

    if (flashV > 0.01) { flashV *= 0.70; flashEl.style.opacity = flashV.toFixed(3); }
    else if (flashEl.style.opacity !== '0') flashEl.style.opacity = '0';

    for (let i = bolts.length - 1; i >= 0; i--) {
      bolts[i].life -= bolts[i].near ? 0.11 : 0.17;
      if (bolts[i].life <= 0) bolts.splice(i, 1);
    }
    nextBolt -= 1 / 30;
    if (nextBolt <= 0) {
      strike();
      if (Math.random() < 0.35) strike();          // occasional double
      // Fewer clouds live on a narrow screen, so strikes would be rarer there
      // for no good reason. Shorten the gap when the viewport is narrow.
      const narrow = w < 700;
      nextBolt = (narrow ? 1.6 : 2.2) + Math.random() * (narrow ? 3.4 : 5);
    }
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let raf = 0, last = 0, running = false;
  const FRAME = 1000 / 30;
  function loop(t) {
    raf = requestAnimationFrame(loop);
    if (t - last < FRAME) return;
    last = t;
    draw(t / 1000);
  }
  const FORCE = location.search.indexOf('force') !== -1; // automated tabs report hidden
  function sync() {
    const should = (FORCE || !document.hidden) && !reduce.matches;
    if (should && !running) { running = true; last = 0; raf = requestAnimationFrame(loop); }
    else if (!should && running) { running = false; cancelAnimationFrame(raf); }
  }
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', sync);
  reduce.addEventListener('change', sync);
  resize(); sync();
})();
