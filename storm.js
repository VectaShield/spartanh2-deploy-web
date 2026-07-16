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
    //    then scaled. On a wide screen the scale used to be just W/VW, so the
    //    whole skyline spanned the viewport — which meant on an ultrawide 21:9
    //    monitor the buildings scaled up until they clipped the top. To stop
    //    that, we CAP the scaling at 10.5:9 aspect ratio: from mobile up to a
    //    viewport slightly wider than square, buildings scale with width;
    //    beyond that, scale is frozen at whatever it was at exactly 10.5:9 and
    //    the extra viewport width becomes open water on the right.
    //
    //    On a NARROW screen we still refuse to shrink further — we take the
    //    height-derived scale instead and simply let the city run off the right
    //    edge, so the RenCen stays anchored on the left at a proper size.
    const VW = 1150;
    const CAP_AR = 10.5 / 9;                     // freeze scale at this aspect
    const W_FOR_SCALE = Math.min(W, H * CAP_AR); // above cap, W-driven scale plateaus
    const S = Math.max(W_FOR_SCALE / VW, Math.min(1.15, H / 780)) * (ZOOM || 1);
    const CITY_W = VW * S;

    // Horizontal offset.
    //
    // 1. City wider than viewport (any phone): pan so the RenCen sits near the
    //    LEFT edge at full size and the rest of downtown marches off to the
    //    right. The framing is keyed on the RENCEN, deliberately. On a narrow
    //    screen the west-of-RenCen buildings simply run off the left edge, the
    //    same as the rest of the city runs off the right.
    //
    // 2. City NARROWER than viewport (ultrawide, above the 10.5:9 cap): the
    //    centered card moves right as the viewport widens; anchor the city to
    //    the card by translating it by the same amount the card shifts. That
    //    keeps the RenCen at a constant distance from the card's left edge no
    //    matter how wide the monitor gets. The extra pixels on the right become
    //    open water.
    let OX;
    if (CITY_W > W) {
      OX = W * 0.20 - 0.22 * CITY_W;
    } else {
      // Reference viewport width at exactly the 10.5:9 cap
      const REF_W = H * CAP_AR;
      // Where the city sat at the reference viewport (same formula as above)
      const OX_AT_REF = REF_W * 0.20 - 0.22 * CITY_W;
      // The centered card shifts right by half the excess viewport width;
      // translate the city by the same amount to keep it locked to the card
      OX = OX_AT_REF + (W - REF_W) / 2;
    }
    const X = (f) => f * CITY_W + OX;   // design fraction -> screen x

    const GOLD = '201,162,75';
    const GOLD_HI = '232,199,106';
    const CRIMSON = '225,29,72';

    const BODY = '#080b16';        // standard tower body
    const BODY_NEAR = '#04060c';   // nearer = darker (it blocks more of the glow)
    const BODY_FAR = '#0b0f1e';    // further = lighter (haze washes it out)

    // ── Storm glow behind the city. Black towers on a black page are invisible;
    //    this is the lit sky they stand against. Scaled by the active weather
    //    preset: on a clear night the crimson storm glow drops way down so the
    //    sky reads as dark navy behind the stars, and only a soft warm halo
    //    around the city itself remains.
    const glowMul = (typeof weather !== 'undefined' && weather) ? weather.stormGlow : 1;
    const glow = s.createRadialGradient(X(0.30), HZ, 10, X(0.30), HZ, Math.max(W, H) * 0.7);
    glow.addColorStop(0, 'rgba(' + GOLD + ',' + (0.18 * glowMul) + ')');
    glow.addColorStop(0.35, 'rgba(185,28,44,' + (0.11 * glowMul) + ')');
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
    //  EVERYTHING LEFT OF THE RENCEN — the Canadian shore, the Ambassador
    //  Bridge, and the freighter mid-river. All laid out in DESIGN SPACE
    //  at negative fractions so they scale and pan as one composition with
    //  the rest of the city (rather than floating independently in screen
    //  space, which the previous version did wrong).
    //
    //  Layout, running from LEFT edge of design canvas back to the RenCen.
    //  DELIBERATELY COMPRESSED: the whole west-of-downtown scene has been
    //  shifted right (toward the RenCen) so on ultrawide viewports the far
    //  left doesn't read as empty water. Bridge sits close to freighter,
    //  freighter close to Caesars, Caesars a short reach from the RenCen.
    //
    //      fraction  -0.48  -0.44  -0.36  -0.32  -0.16  -0.08 -0.02 0.22
    //      element   Sand-  Sand-  Gordie Amb.   Amb.   Caes- red   Ren-
    //                wich   wich   Howe   Bridge Bridge ars   frt.  Cen
    //                stack  stack  pylon  west   east   Windsr       cluster
    //                #3     #1,2          tower  tower
    //
    //  Windsor riverfront band runs continuously from -0.50 to +0.12 BEHIND
    //  everything (drawn first, then Sandwich industrial, then Caesars,
    //  then freighter, then Ambassador Bridge draws on top of everything).
    //
    //  Sizing is critical: content placed at fractions < -0.50 is off-screen
    //  on 21:9 1440p (the target monitor). Everything MUST fit in the
    //  -0.50 → +0.22 corridor to be visible where it matters.
    //
    //  On narrow viewports these draw at negative screen x and fall off the
    //  left edge — no visible harm. On viewports wide enough to have empty
    //  water on the left, they slide into view at fixed proportional
    //  distance from the RenCen.
    // ═══════════════════════════════════════════════════════════════

    // Skip the whole left-side draw when none of it will land on screen.
    const leftContentVisible = X(-0.50) < W && X(0.12) > 0;

    if (leftContentVisible) {

      // ── WINDSOR RIVERFRONT. Across the Detroit River on the Canadian
      //    side, visible in every Belle Isle photograph as a low horizontal
      //    band of buildings that stretches ALL THE WAY across the middle
      //    of the frame — from downriver (west, behind and past the
      //    Ambassador Bridge) to roughly opposite the RenCen. This is what
      //    fills the "empty water" between the bridge and downtown Detroit.
      //    In reality that expanse is mostly water, but the Canadian shore
      //    always reads as a continuous ridge on the horizon behind it.
      //
      //    Occupies design fractions -0.50 through +0.12. Passes BEHIND the
      //    Ambassador Bridge (bridge draws later and occludes overlap).
      //    Range chosen to stay within the 21:9-visible corridor.
      (function windsorRiverfront() {
        const startX = X(-0.50);
        const endX = X(0.12);
        const baseY = HZ - 2 * S;
        const SIL_FAR = '#0a0f1c';             // hazier than the bridge, for distance

        s.fillStyle = SIL_FAR;

        // Continuous ground-level ribbon of the shore itself
        const bandH = 4 * S;
        s.fillRect(startX, baseY - bandH, endX - startX, bandH);

        // A rhythm of small mid-rise slabs poking above the band. Slightly
        // denser overall now that the west span is tighter; heights peak in
        // the middle (Windsor city core opposite the Ambassador in the
        // compressed layout) and taper east toward the Riverside Drive
        // condos and Caesars area.
        // Arranged so the TALLER, denser cluster (Windsor city core) lands
        // in the visible-on-21:9 middle range (indices ~22-40). Sandwich /
        // western Windsor sits on the far-west side (indices 0-20) and only
        // shows on super-ultrawide. Riverside Drive condos taper east
        // (indices 40+) toward the freighter/Caesars area behind the card.
        const heights = [
          3, 4, 3, 5, 3, 4, 3, 4, 3, 4, 3, 4,     // 0-11: sparse Sandwich mid-low
          5, 4, 6, 4, 5, 4, 6, 4, 5, 4, 6, 5,     // 12-23: transition into Windsor
          7, 5, 9, 6, 8, 5, 10, 6, 7, 5, 9, 6,    // 24-35: Windsor CORE (visible cluster)
          8, 5, 6, 4, 5, 3, 4, 3, 3, 2, 3, 2      // 36-47: taper east / Riverside
        ];
        const widths = [
          4, 4, 4, 5, 4, 4, 4, 4, 4, 4, 4, 4,
          5, 4, 5, 4, 5, 4, 6, 4, 5, 4, 6, 5,
          5, 4, 7, 4, 6, 4, 7, 5, 5, 4, 6, 5,
          6, 4, 5, 4, 4, 4, 4, 4, 4, 4, 4, 4
        ];
        const gap = 3 * S;
        let x = startX + 4 * S;
        for (let i = 0; i < heights.length && x < endX - 6 * S; i++) {
          const bw = widths[i] * S;
          const bh = heights[i] * S;
          s.fillRect(x, baseY - bandH - bh, bw, bh);
          x += bw + gap;
        }

        // Sparse night-lit windows scattered across the entire band
        s.fillStyle = 'rgba(232,199,106,0.4)';
        const nLights = 18;
        for (let k = 0; k < nLights; k++) {
          const lx = startX + ((endX - startX) * ((k + 0.4) / nLights));
          s.fillRect(lx, baseY - bandH * 0.55, 1, 1);
        }
      })();

      // ── SANDWICH TOWN / WINDSOR SALT industrial silhouettes. Just west
      //    of the Ambassador Bridge on the Canadian side is the historic
      //    Sandwich neighbourhood, which includes the Windsor Salt mining
      //    operation and older industrial along the river. From Belle Isle
      //    distance these read as a couple of tall thin smokestacks and a
      //    low warehouse mass rising above the Windsor riverfront band —
      //    the visual anchor that says "working waterfront" rather than
      //    just condos.
      (function sandwichIndustrial() {
        const baseY = HZ - 6 * S;
        const SIL = '#0a0f1c';
        s.fillStyle = SIL;

        // Two smokestacks, close together, one noticeably taller
        const stack1X = X(-0.44), stack1H = 26 * S;
        const stack2X = X(-0.415), stack2H = 20 * S;
        s.fillRect(stack1X, baseY - stack1H, 1.3 * S, stack1H);
        s.fillRect(stack2X, baseY - stack2H, 1.1 * S, stack2H);

        // Squat warehouse mass at the stacks' base
        const clusterX = X(-0.47);
        s.fillRect(clusterX, baseY - 9 * S, 26 * S, 9 * S);

        // Windsor Salt cylindrical STORAGE SILOS — the defining feature of
        // the plant. A row of stubby round-shouldered silos on top of the
        // warehouse mass.
        const siloBaseY = baseY - 9 * S;
        for (let i = 0; i < 4; i++) {
          const sx = clusterX + 3 * S + i * 5 * S;
          const sw = 3.5 * S, sh = 10 * S;
          s.fillRect(sx, siloBaseY - sh, sw, sh);
          s.beginPath();
          s.arc(sx + sw / 2, siloBaseY - sh, sw / 2, Math.PI, 2 * Math.PI);
          s.fill();
        }

        // A third smaller stack further west (single mark)
        const stack3X = X(-0.485), stack3H = 15 * S;
        s.fillRect(stack3X, baseY - stack3H, 0.9 * S, stack3H);

        // Small cluster of low industrial roofs left of the third stack
        s.fillRect(X(-0.50), baseY - 5 * S, 14 * S, 5 * S);

        // Tiny red aviation warning light on the tallest stack
        s.fillStyle = 'rgba(225,29,72,0.7)';
        s.beginPath(); s.arc(stack1X + 0.65, baseY - stack1H - 0.5, 0.9, 0, 7); s.fill();
      })();

      // ── CAESARS WINDSOR. Paired hotel slabs (Augustus + Forum towers) on
      //    the Windsor shore, roughly opposite the RenCen. The tallest thing
      //    on the Canadian side; reads as two blocky flat-topped verticals
      //    with a slight height difference (Augustus is the taller one).
      (function caesarsWindsor() {
        const cx = X(-0.08);
        const baseY = HZ - 6 * S;              // sits on top of the Windsor band
        const SIL = '#0c1220';                 // matches Windsor mid-tone

        s.fillStyle = SIL;

        // Augustus tower (taller, on the LEFT of the pair)
        const augW = 9 * S, augH = 32 * S;
        s.fillRect(cx - augW - 1 * S, baseY - augH, augW, augH);
        // Forum tower (shorter, on the RIGHT of the pair)
        const forW = 7 * S, forH = 26 * S;
        s.fillRect(cx + 1 * S, baseY - forH, forW, forH);

        // A few window lights scattered on the towers (Windsor at night)
        s.fillStyle = 'rgba(232,199,106,0.45)';
        for (let i = 0; i < 6; i++) {
          const wy = baseY - augH * (0.15 + i * 0.13);
          s.fillRect(cx - augW * 0.7, wy, 1, 1);
          if (i < 4) s.fillRect(cx + forW * 0.35, wy + forH * 0.05, 1, 1);
        }
      })();

      // ── A RED FREIGHTER on the river between Caesars Windsor and the
      //    RenCen. Positioned close to Caesars so the bridge/freighter
      //    scene reads as tightly clustered next to downtown, not spread
      //    thin across empty water.
      (function freighter() {
        const fcx = X(-0.02);
        const hullW = 44 * S;
        const hullH = 3 * S;
        const supersW = 8 * S;
        const supersH = 5 * S;
        const y = HZ - 3 * S;
        s.fillStyle = '#8a1a24';                // dark crimson hull
        s.fillRect(fcx - hullW / 2, y - hullH, hullW, hullH);
        s.fillStyle = '#5a1218';                // darker superstructure
        s.fillRect(fcx + hullW / 2 - supersW - 4 * S, y - hullH - supersH, supersW, supersH);
        // Thin masts / stacks
        s.fillRect(fcx + hullW / 2 - 6 * S, y - hullH - supersH - 3 * S, 0.8, 3 * S);
        s.fillRect(fcx - hullW / 2 + 6 * S, y - hullH - 4 * S, 0.8, 4 * S);
        // A single warm light on the superstructure
        s.fillStyle = 'rgba(232,199,106,0.7)';
        s.fillRect(fcx + hullW / 2 - supersW / 2 - 4 * S, y - hullH - supersH * 0.5, 1, 1);
      })();

    }

    // ═══════════════════════════════════════════════════════════════
    //  THE AMBASSADOR BRIDGE. Far to the west / downriver from Belle Isle,
    //  a distant suspension-bridge silhouette anchored in DESIGN SPACE at
    //  fractions -0.30 (west tower) through -0.14 (east tower). Shifted
    //  east from the geographically accurate position so the west scene
    //  reads as tight and connected rather than a bridge floating alone
    //  in empty water on ultrawide displays.
    //
    //  Traced from actual Belle Isle -> Detroit photographs, not from
    //  imagination. The silhouette details that matter at this distance:
    //    - LATTICE steel towers: two thin legs joined by a horizontal CAP
    //      crossbar at the top (a rectangular portal frame, NOT solid
    //      rectangles and NOT gothic spires)
    //    - a soft catenary main cable dipping between the tower tops with
    //      vertical HANGERS dropping from cable to deck (the comb pattern
    //      that says "suspension" rather than "cable-stayed")
    //    - a STRAIGHT horizontal deck through the main span; no arch
    //    - truss approach ramps angling up from the banks to the main deck
    //
    //  Falls off the left edge of the viewport on narrow screens; slides
    //  into view as the viewport widens past the 10.5:9 cap.
    // ═══════════════════════════════════════════════════════════════
    (function ambassadorBridge() {
      const leftFrac = -0.32;
      const rightFrac = -0.16;
      const cx = X((leftFrac + rightFrac) / 2);
      const leftX = X(leftFrac);
      const rightX = X(rightFrac);
      const span = rightX - leftX;

      // Skip if the whole bridge is off the left edge of the viewport.
      if (rightX + 60 * S < 0) return;

      const towerH = 44 * S;
      const towerLegGap = 4 * S;
      const legW = 1.3 * S;
      const deckY = HZ - 5 * S;
      const SIL = '#04060e';

      s.fillStyle = SIL;
      s.strokeStyle = SIL;

      // ── GORDIE HOWE INTERNATIONAL BRIDGE pylon. Downstream (west) of the
      //    Ambassador Bridge, opened 2025. Cable-stayed with two very tall
      //    concrete A-frame pylons that rise noticeably ABOVE the Ambassador
      //    Bridge deckline in Belle Isle photographs. Draw it BEFORE the
      //    Ambassador so the Ambassador draws on top where they overlap.
      //    Rendered as two thin needle spikes with a hint of A-frame at the
      //    base — details invisible at this apparent distance, but the two
      //    tall vertical marks are the tell.
      (function gordieHowe() {
        const gcx = X(-0.36);              // sits just LEFT of Ambassador west tower
        const pylonH = 62 * S;             // ~40% taller than Ambassador towers
        const pylonSpacing = 6 * S;
        const pylonW = 1.4 * S;
        const gDeckY = HZ - 3 * S;
        const GSIL = '#05070f';
        s.fillStyle = GSIL;
        // Two vertical pylons
        s.fillRect(gcx - pylonSpacing - pylonW / 2, gDeckY - pylonH, pylonW, pylonH);
        s.fillRect(gcx + pylonSpacing - pylonW / 2, gDeckY - pylonH, pylonW, pylonH);
        // Subtle A-frame splay near the base (widens slightly outward)
        s.beginPath();
        s.moveTo(gcx - pylonSpacing, gDeckY - pylonH * 0.4);
        s.lineTo(gcx - pylonSpacing - 2 * S, gDeckY);
        s.moveTo(gcx + pylonSpacing, gDeckY - pylonH * 0.4);
        s.lineTo(gcx + pylonSpacing + 2 * S, gDeckY);
        s.lineWidth = 0.8;
        s.stroke();
        // Very faint fan-stay cable hints (cable-stayed, not suspension)
        s.strokeStyle = 'rgba(10,14,25,0.55)';
        s.lineWidth = 0.4;
        s.beginPath();
        for (let i = 1; i <= 3; i++) {
          const off = i * 4 * S;
          s.moveTo(gcx - pylonSpacing, gDeckY - pylonH + 3 * S);
          s.lineTo(gcx - pylonSpacing - off, gDeckY);
          s.moveTo(gcx + pylonSpacing, gDeckY - pylonH + 3 * S);
          s.lineTo(gcx + pylonSpacing + off, gDeckY);
        }
        s.stroke();
        // Tiny red aviation beacons on the pylon tops
        s.fillStyle = 'rgba(' + CRIMSON + ',0.75)';
        s.beginPath(); s.arc(gcx - pylonSpacing, gDeckY - pylonH - 0.5, 1, 0, 7); s.fill();
        s.beginPath(); s.arc(gcx + pylonSpacing, gDeckY - pylonH - 0.5, 1, 0, 7); s.fill();
        // Restore for the Ambassador draw
        s.strokeStyle = SIL;
        s.fillStyle = SIL;
      })();

      // ── Lattice portal-frame tower: two thin vertical legs, a cap crossbar
      //    at the top joining them, and two thin mid-height crossbars to
      //    suggest X-bracing (the actual X pattern is too fine to render at
      //    this apparent scale; hint at the lattice with horizontal ties).
      function latticeTower(tx) {
        const lx = tx - towerLegGap / 2 - legW / 2;   // left leg x
        const rx = tx + towerLegGap / 2 - legW / 2;   // right leg x
        const top = deckY - towerH;
        // Legs
        s.fillRect(lx, top, legW, towerH);
        s.fillRect(rx, top, legW, towerH);
        // Cap crossbeam at the top
        s.fillRect(lx, top, (rx + legW) - lx, 1.6 * S);
        // Mid-height horizontal ties (suggest lattice)
        s.fillRect(lx, top + towerH * 0.38, (rx + legW) - lx, 0.8 * S);
        s.fillRect(lx, top + towerH * 0.68, (rx + legW) - lx, 0.8 * S);
      }
      latticeTower(leftX);
      latticeTower(rightX);

      // ── Deck: STRAIGHT horizontal bar through the main span, extending
      //    outward as approach roadways onto the banks.
      s.fillRect(leftX - 65 * S, deckY, span + 130 * S, 1.7 * S);

      // ── Truss approach ramps: the roadway climbs from bank level up to the
      //    tower base. Draw as a subtle diagonal from the far end of each
      //    approach up to the tower base. In silhouette this reads as the
      //    trussed approach structure.
      s.lineWidth = 1;
      s.beginPath();
      s.moveTo(leftX - 65 * S, deckY + 3 * S);
      s.lineTo(leftX, deckY);
      s.moveTo(rightX + 65 * S, deckY + 3 * S);
      s.lineTo(rightX, deckY);
      s.stroke();

      // ── Main suspension catenary. Sags between the two tower tops in a
      //    soft parabolic curve. This is drawn as a slightly thicker line so
      //    it stays visible at very small apparent scales.
      s.lineWidth = 1.3;
      const cableTopY = deckY - towerH + 2;   // cable attaches just below cap
      const cableSagY = deckY - 6 * S;        // low point of the catenary
      s.beginPath();
      s.moveTo(leftX, cableTopY);
      s.quadraticCurveTo(cx, cableSagY, rightX, cableTopY);
      s.stroke();

      // ── Cable extensions from tower tops down to the anchor points on the
      //    banks (matches the M-shape you see from a distance).
      s.beginPath();
      s.moveTo(leftX - 55 * S, deckY);
      s.lineTo(leftX, cableTopY);
      s.moveTo(rightX + 55 * S, deckY);
      s.lineTo(rightX, cableTopY);
      s.stroke();

      // ── Vertical hangers. Short thin lines dropping from the main cable
      //    to the deck; this "comb" pattern is the visual signature that
      //    separates a suspension bridge from a cable-stayed one.
      s.lineWidth = 0.55;
      s.beginPath();
      const N_HANGERS = 6;
      for (let i = 1; i < N_HANGERS; i++) {
        const t = i / N_HANGERS;
        const hx = leftX + t * span;
        // Quadratic Bezier y at parameter t (control point at cableSagY)
        const cy = (1 - t) * (1 - t) * cableTopY + 2 * (1 - t) * t * cableSagY + t * t * cableTopY;
        s.moveTo(hx, cy);
        s.lineTo(hx, deckY);
      }
      s.stroke();

      // ── Tiny red aviation beacons on each tower top with a soft halo.
      s.fillStyle = 'rgba(' + CRIMSON + ',0.75)';
      s.beginPath(); s.arc(leftX, deckY - towerH - 1, 1.2, 0, 7); s.fill();
      s.beginPath(); s.arc(rightX, deckY - towerH - 1, 1.2, 0, 7); s.fill();
      s.fillStyle = 'rgba(' + CRIMSON + ',0.2)';
      s.beginPath(); s.arc(leftX, deckY - towerH - 1, 3, 0, 7); s.fill();
      s.beginPath(); s.arc(rightX, deckY - towerH - 1, 3, 0, 7); s.fill();
    })();

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

    // ═══════════════════════════════════════════════════════════════
    //  EAST OF DOWNTOWN — the Detroit riverfront going upstream toward
    //  Belle Isle. From Belle Isle looking west, this stretch appears on
    //  the RIGHT of the frame, past Cadillac Tower (the eastmost downtown
    //  deco building). Reference: Chene Park / Aretha Franklin Amphitheatre
    //  with its multi-peak white PTFE tent roof, Harbortown residential
    //  mid-rises, MacArthur Bridge arches to Belle Isle.
    //
    //  Layout, running LEFT → RIGHT east of Cadillac (0.625):
    //      fraction  0.66   0.71   0.76        0.83       0.90
    //      element   Stroh  UAW-   Aretha      Harbor-    MacArthur
    //                River  Ford   Franklin    town       Bridge
    //                Place  NTC    Amphi       residnt    arches
    // ═══════════════════════════════════════════════════════════════

    // ── STROH RIVER PLACE / former Parke-Davis. Long low red-brick
    //    industrial-institutional block right on the riverfront, capped by
    //    a squat clock/water tower. Reads as a horizontal mass with a
    //    single vertical accent — very different from the deco towers
    //    behind it. Slightly warmer tint hints at the brick.
    (function strohRiverPlace() {
      const x = X(0.66), w = 60 * S, h = 34 * S;
      const y = HZ - h;
      s.fillStyle = '#100a12';                      // hint of brick warmth (dark)
      s.fillRect(x, y, w, h);
      rim(x, y, w, h, 0.12);
      win(x, y, w, h, 0.15);
      // Squat clock/water tower on the roof (a distinctive local silhouette)
      s.fillStyle = '#0e0810';
      const tW = 8 * S, tH = 14 * S;
      s.fillRect(x + w * 0.28, y - tH, tW, tH);
      // Tiny warm light on the tower (clock face)
      s.fillStyle = 'rgba(' + GOLD_HI + ',0.55)';
      s.fillRect(x + w * 0.28 + tW * 0.35, y - tH * 0.55, 2, 2);
    })();

    // ── UAW-FORD NATIONAL PROGRAMS CENTER. Just east of RenCen on the
    //    river. Mid-rise glassy building with a stepped/pyramidal atrium
    //    section on the river side. Reads as a wider-than-tall silhouette
    //    with a slanted top corner.
    (function uawFord() {
      const x = X(0.705), w = 38 * S, h = 62 * S;
      const y = HZ - h;
      s.fillStyle = '#080b16';
      s.fillRect(x, y, w, h);
      rim(x, y, w, h, 0.14);
      win(x, y, w, h, 0.22);
      // Stepped/slanted atrium on the LEFT (river) side
      s.fillStyle = '#080b16';
      s.beginPath();
      s.moveTo(x - 6 * S, HZ);
      s.lineTo(x, HZ - h * 0.55);
      s.lineTo(x, HZ);
      s.closePath();
      s.fill();
    })();

    // ── ARETHA FRANKLIN AMPHITHEATRE (formerly Chene Park). The white
    //    PTFE-fiberglass fabric tent roof: multiple sharp peaks tensioned
    //    on cables, low to the ground. At night in silhouette the fabric
    //    catches sky light and reads LIGHTER than the surrounding buildings
    //    — a row of pale triangular peaks against dark water. This is the
    //    distinctive east-of-downtown landmark.
    (function arethaAmphi() {
      const cx = X(0.762);
      const baseY = HZ - 2 * S;
      const spanW = 68 * S;
      const peakH = 24 * S;
      const nPeaks = 5;
      const peakSpacing = spanW / (nPeaks - 1);
      const left = cx - spanW / 2;

      // Pale fabric — lighter than any building silhouette, warmer with
      // the storm glow. Use two passes: fill + subtle rim.
      s.fillStyle = '#544048';                       // warmer off-white for tent fabric
      s.beginPath();
      s.moveTo(left, baseY);
      for (let i = 0; i < nPeaks; i++) {
        const px = left + i * peakSpacing;
        s.lineTo(px, baseY - peakH * (0.7 + (i % 2 ? 0.3 : 0.0)));
        if (i < nPeaks - 1) {
          const valley = left + i * peakSpacing + peakSpacing * 0.5;
          s.lineTo(valley, baseY - peakH * 0.28);      // dip between peaks
        }
      }
      s.lineTo(left + spanW, baseY);
      s.closePath();
      s.fill();

      // Thin support masts (cable tensioners) rising slightly above the peaks
      s.fillStyle = '#1a1218';
      for (let i = 0; i < nPeaks; i++) {
        const px = left + i * peakSpacing;
        const mH = peakH * (0.7 + (i % 2 ? 0.3 : 0.0)) + 3 * S;
        s.fillRect(px - 0.4, baseY - mH, 0.8, mH);
      }

      // Gold rim along the peak edges to catch the glow — brighter than
      // most rims because the fabric roof is famously lit from below.
      s.strokeStyle = 'rgba(' + GOLD_HI + ',0.55)';
      s.lineWidth = 1.2;
      s.beginPath();
      s.moveTo(left, baseY);
      for (let i = 0; i < nPeaks; i++) {
        const px = left + i * peakSpacing;
        s.lineTo(px, baseY - peakH * (0.7 + (i % 2 ? 0.3 : 0.0)));
        if (i < nPeaks - 1) {
          const valley = left + i * peakSpacing + peakSpacing * 0.5;
          s.lineTo(valley, baseY - peakH * 0.28);
        }
      }
      s.stroke();
    })();

    // ── HARBORTOWN. A cluster of mid-rise brick residential towers east
    //    of Chene Park, with a marina in front (a small forest of thin
    //    vertical masts). Reads as a small city-block of boxy verticals.
    (function harbortown() {
      const cx = X(0.83);
      const baseY = HZ;
      const SIL = '#0a0e1c';

      // Three residential slabs at slightly different heights, tightly
      // grouped
      const slabs = [
        { dx: -22, w: 14, h: 56 },
        { dx:  -6, w: 16, h: 62 },
        { dx:  12, w: 14, h: 52 },
      ];
      for (const b of slabs) {
        const x = cx + b.dx * S, w = b.w * S, h = b.h * S;
        const y = baseY - h;
        s.fillStyle = SIL;
        s.fillRect(x, y, w, h);
        rim(x, y, w, h, 0.14);
        win(x, y, w, h, 0.20);
      }

      // Marina masts in front — thin vertical hair-lines, warm at tips
      s.strokeStyle = 'rgba(' + GOLD + ',0.35)';
      s.lineWidth = 0.5;
      s.beginPath();
      for (let i = 0; i < 9; i++) {
        const mx = cx - 24 * S + i * 6 * S;
        const mh = 5 * S + (i % 3) * 3 * S;
        s.moveTo(mx, baseY);
        s.lineTo(mx, baseY - mh);
      }
      s.stroke();
    })();

    // ── MacARTHUR BRIDGE (Belle Isle Bridge). Long low concrete arch
    //    bridge — ~19 shallow arches marching across the water toward
    //    Belle Isle. From Belle Isle POV it's the near-field bridge on
    //    the right, framing the east edge of the composition. Rendered
    //    subtly to not compete with the Ambassador Bridge on the west.
    (function macarthurBridge() {
      const startX = X(0.87);
      const endX = X(1.05);
      const deckY = HZ - 7 * S;
      const arches = 11;
      const spacing = (endX - startX) / arches;
      const archH = 5 * S;
      const SIL = '#0e1424';                          // darker than sky, visible

      // Deck bar
      s.fillStyle = SIL;
      s.fillRect(startX, deckY, endX - startX, 2 * S);

      // Piers + arch underlines
      s.strokeStyle = SIL;
      s.lineWidth = 1.4;
      for (let i = 0; i <= arches; i++) {
        const x = startX + i * spacing;
        s.fillRect(x - 0.7, deckY, 1.4, HZ - deckY);   // pier
        if (i < arches) {
          s.beginPath();
          s.moveTo(x, deckY + 1);
          s.quadraticCurveTo(x + spacing / 2, deckY + archH, x + spacing, deckY + 1);
          s.stroke();
        }
      }

      // Rim highlight along top of deck to lift it from the sky
      s.fillStyle = 'rgba(' + GOLD + ',0.18)';
      s.fillRect(startX, deckY - 0.5, endX - startX, 0.7);

      // Warm lamp standards along the deck (a string of amber points)
      s.fillStyle = 'rgba(' + GOLD_HI + ',0.65)';
      for (let i = 0; i < 8; i++) {
        const x = startX + (i + 0.5) * (endX - startX) / 8;
        s.fillRect(x - 0.4, deckY - 4 * S, 0.8, 4 * S);
        s.fillRect(x - 0.9, deckY - 4.4 * S, 1.8, 1);
      }
    })();

    // ── EAST SHORE MISC: houses / low industrial silhouettes between
    //    Harbortown and MacArthur Bridge. Not identifiable landmarks,
    //    just the low urban rhythm you see anywhere along that Detroit
    //    riverfront going east — a mix of warehouses, small commercial,
    //    and residential rooftops. Fills what would otherwise be empty
    //    water on the right of the frame.
    (function eastShoreMisc() {
      const items = [
        { f: 0.79, w: 12, h: 22 },
        { f: 0.805, w: 16, h: 14 },
        { f: 0.855, w: 22, h: 18 },
        { f: 0.875, w: 14, h: 12 },
        { f: 0.895, w: 20, h: 20 },
        { f: 0.915, w: 12, h: 10 },
        { f: 0.94, w: 18, h: 16 },
        { f: 0.965, w: 14, h: 10 },
        { f: 0.99, w: 18, h: 14 },
        { f: 1.02, w: 14, h: 12 },
        { f: 1.05, w: 20, h: 16 },
        { f: 1.075, w: 12, h: 10 },
        { f: 1.10, w: 16, h: 12 },
        { f: 1.13, w: 14, h: 10 },
      ];
      for (const it of items) {
        const x = X(it.f), w = it.w * S, h = it.h * S;
        const y = HZ - h;
        s.fillStyle = '#0a0e1c';
        s.fillRect(x, y, w, h);
        rim(x, y, w, h, 0.10);
        win(x, y, w, h, 0.13);
      }
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


  /* ═══════════════════════════════════════════════════════════════════════
     WEATHER PRESETS.

     Eight discrete "moods" the scene picks from on page load. Runs from a
     calm clear summer 2 AM at the low end to the full driving-rain lightning
     storm the site was originally designed around. Selection is one-shot at
     boot; the weather does not change during a session.

     Test any preset with ?weather=N (N is 0..7). Without the query param a
     preset is picked at random on load.

     Every preset is a bundle of multipliers on the existing engine so we
     don't have to fork the drawing code — clouds, rain, lightning, water
     chop and storm glow all scale off these numbers, and stars only exist
     on the calmer presets.
     ═════════════════════════════════════════════════════════════════════ */
  const WEATHER_PRESETS = [
    // 0 — CLEAR (level 1). Summer, 2 AM. Stars out with named constellations,
    //     no clouds, mirror-still water. Storm glow way down so the upper sky
    //     reads as dark navy behind the stars.
    { name: 'clear',    cloudCount: 0.00, cloudAlpha: 0.00, rainDensity: 0.00,
      thunderRate: 0,   starDensity: 1.00, chopIntensity: 0.15, wobble: 0.18, stormGlow: 0.14 },

    // 1 — WISPS (level 2). High thin clouds drift across; most of the stars
    //     are still visible. Water barely moving.
    { name: 'wisps',    cloudCount: 0.18, cloudAlpha: 0.35, rainDensity: 0.00,
      thunderRate: 0,   starDensity: 0.70, chopIntensity: 0.2,  wobble: 0.25, stormGlow: 0.25 },

    // 2 — OVERCAST (level 3). Full cloud cover, no stars, no rain yet. Light
    //     chop; the whole scene sits under lidded grey.
    { name: 'overcast', cloudCount: 0.75, cloudAlpha: 0.55, rainDensity: 0.00,
      thunderRate: 0,   starDensity: 0.00, chopIntensity: 0.35, wobble: 0.40, stormGlow: 0.50 },

    // 3 — DRIZZLE (level 4). Light rain begins. Clouds thicker, water
    //     livelier. Still no thunder.
    { name: 'drizzle',  cloudCount: 0.85, cloudAlpha: 0.75, rainDensity: 0.30,
      thunderRate: 0,   starDensity: 0.00, chopIntensity: 0.5,  wobble: 0.55, stormGlow: 0.60 },

    // 4 — STEADY + DISTANT THUNDER (level 5). Standard rain, and the FIRST
    //     lightning appears — infrequent, mostly distant strikes with a soft
    //     flash. Water working steadily.
    { name: 'steady',   cloudCount: 0.95, cloudAlpha: 0.85, rainDensity: 0.65,
      thunderRate: 0.28, starDensity: 0.00, chopIntensity: 0.65, wobble: 0.70, stormGlow: 0.80 },

    // 5 — HEAVY + MODERATE THUNDER (level 6). Sheeting rain and more
    //     frequent bolts; still a "storm across town" feel, not overhead.
    { name: 'heavy',    cloudCount: 1.05, cloudAlpha: 0.95, rainDensity: 1.20,
      thunderRate: 0.6, starDensity: 0.00, chopIntensity: 0.85, wobble: 0.85, stormGlow: 0.95 },

    // 6 — TRULY INCREDIBLE STORM (level 7). Wall-to-wall clouds, sheeting
    //     rain, near-continuous close-range lightning with dramatic flashes,
    //     chaotic wind-driven water. The showpiece preset.
    { name: 'incredible', cloudCount: 1.30, cloudAlpha: 1.00, rainDensity: 1.75,
      thunderRate: 1.5, starDensity: 0.00, chopIntensity: 1.15, wobble: 1.10, stormGlow: 1.10 },

    // 7 — APOCALYPTIC (level 8). One notch past incredible — even denser
    //     clouds, most rain, absolute peak lightning frequency. Kept as an
    //     extreme option; can be pulled from the random pool if it's too
    //     much for everyday viewing.
    { name: 'apocalyptic', cloudCount: 1.50, cloudAlpha: 1.00, rainDensity: 2.10,
      thunderRate: 2.0, starDensity: 0.00, chopIntensity: 1.30, wobble: 1.20, stormGlow: 1.20 },
  ];

  /* ── SHIPPING pool.
     Only three presets ever get randomly picked in production: CLEAR,
     RAIN, STORM. The 8-preset WEATHER_PRESETS array above stays intact
     as a debug/test surface, addressable via ?weather=0..7. The shipping
     configs below are hand-blended (starting from the 8-preset numbers,
     with a few tweaks) so the three we actually ship feel distinct
     without any two feeling like near-duplicates of each other. */
  const SHIPPING_WEATHER = [
    {
      // CLEAR = preset 0 (clear starry) with the SLIGHTLY livelier water
      // borrowed from preset 1 (wisps) — dead-flat water read as unnatural.
      name: 'clear',
      cloudCount: 0.00, cloudAlpha: 0.00, rainDensity: 0.00,
      thunderRate: 0,   starDensity: 1.00,
      chopIntensity: 0.20, wobble: 0.25, stormGlow: 0.14,
    },
    {
      // RAIN = preset 3 (drizzle) with rain density bumped to preset 4's
      // level, so it reads as proper rain instead of a light sprinkle.
      name: 'rain',
      cloudCount: 0.85, cloudAlpha: 0.75, rainDensity: 0.65,
      thunderRate: 0,   starDensity: 0.00,
      chopIntensity: 0.50, wobble: 0.55, stormGlow: 0.60,
    },
    {
      // STORM = preset 7 (apocalyptic), the full-tier stormfront.
      name: 'storm',
      cloudCount: 1.50, cloudAlpha: 1.00, rainDensity: 2.10,
      thunderRate: 2.0, starDensity: 0.00,
      chopIntensity: 1.30, wobble: 1.20, stormGlow: 1.20,
    },
  ];

  /* Weather + seed are cached in sessionStorage. Within a single tab
     session, every internal navigation reproduces the exact same weather
     preset AND the same baked visual layout (window lights, stars, cloud
     positions) — otherwise every click through the site re-rolls all
     that state and the transitions read as jarring.

     sessionStorage is per-tab: a fresh tab starts with a fresh roll. */
  const SESSION_KEY = 'sh2_wx_v1';

  /* Mobile detection: any touch-primary device (phone or tablet) always
     gets the STORM preset. The stylized clear/rain feels too calm on a
     small screen where the sky area is proportionally larger relative to
     the city, and the storm's rain + lightning + dense clouds fill that
     space with motion. `pointer: coarse` matches touch input regardless
     of "request desktop site" toggle — a phone stays a phone.

     Note: the SEED stays random per session, so window lights, cloud
     positions, and star scatter still vary between visits — the visual
     variety per session is preserved, only the preset itself is fixed. */
  const IS_MOBILE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  function pickWeather() {
    const p = new URLSearchParams(location.search).get('weather');
    // URL overrides — bypass mobile lock too, so debug URLs work
    // everywhere. Fixed seed keeps those URLs deterministic.
    if (p) {
      const byName = SHIPPING_WEATHER.find(w => w.name === p.toLowerCase());
      if (byName) return { ...byName, _seed: 0x2f9a1e5b };
      const idx = parseInt(p, 10);
      if (Number.isFinite(idx) && idx >= 0 && idx < WEATHER_PRESETS.length) {
        return { ...WEATHER_PRESETS[idx], _seed: 0x2f9a1e5b };
      }
    }
    // Read stored seed (both mobile and desktop reuse it).
    let storedName = null, storedSeed = null;
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (saved && Number.isFinite(saved.seed)) {
        storedSeed = saved.seed >>> 0;
        if (typeof saved.name === 'string') storedName = saved.name;
      }
    } catch (_) { /* corrupted storage — treat as first visit */ }

    // On mobile, force STORM regardless of what was saved (desktop-side
    // could have persisted a 'clear' or 'rain' for the tab; the mobile
    // guard overrides). On desktop, use stored name if present, else
    // random from the shipping pool.
    const chosenName = IS_MOBILE
      ? 'storm'
      : (storedName ||
         SHIPPING_WEATHER[Math.floor(Math.random() * SHIPPING_WEATHER.length)].name);
    const preset = SHIPPING_WEATHER.find(w => w.name === chosenName) || SHIPPING_WEATHER[0];
    const seed = storedSeed !== null
      ? storedSeed
      : (Math.random() * 0xffffffff) >>> 0;

    // Persist for next page-load in this tab.
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ name: preset.name, seed }));
    } catch (_) { /* private mode / disabled storage — session-scoped fallback still fine */ }
    return { ...preset, _seed: seed };
  }
  const weather = pickWeather();

  /* Mulberry32 PRNG (Sebastian Vigna, public domain). Small, fast,
     good statistical quality — plenty for scattering window lights and
     stars. Deterministic from a 32-bit seed. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Monkey-patch Math.random during the BAKING sequence — window lights,
     star positions, initial cloud/rain state — so every function that
     touches Math.random gets the seeded PRNG instead. Restore the native
     RNG immediately afterwards so per-frame animation (rain respawn,
     bolt fork paths, thunder scheduling) stays genuinely random. Reset
     from the seed every time we enter the bake, so the sequence is
     identical on every page load. */
  const REAL_RANDOM = Math.random;
  function withBakedRand(fn) {
    Math.random = mulberry32(weather._seed);
    try { return fn(); }
    finally { Math.random = REAL_RANDOM; }
  }

  // ── Fetch the sky data once. It's a static JSON (~150 KB) built by
  //    scripts/build-sky-data.js from the RA/Dec catalog. On stormy presets
  //    we never draw constellations, so skip the fetch entirely — no point
  //    pulling data we'll never use.
  window.__SKY_DATA__ = null;
  if (weather.starDensity > 0.01) {
    fetch('/weather/sky-by-month.json')
      .then(r => {
        if (!r.ok) {
          // Loud failure. Field stars still render without this data, so
          // the site keeps working — but the constellations silently
          // disappearing is exactly the class of bug we shipped once
          // already (build script wasn't copying the file), so surface it.
          console.warn('[storm.js] sky-by-month.json fetch failed:',
                       r.status, r.statusText, '- constellations will not render');
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        window.__SKY_DATA__ = data;
        // Re-generate stars now that constellation data is available.
        if (typeof onResize === 'function') onResize();
      })
      .catch(err => {
        console.warn('[storm.js] sky-by-month.json fetch error:', err,
                     '- constellations will not render');
      });
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

  let sky = null, rain = [], bolts = [], clouds = [], puffs = [], stars = [];
  let nextBolt = 1.2, flashV = 0, horizon = 0;

  // Layout constants from drawSkyline. Updated on every bake so stars,
  // constellations, and anything else living in design space can pin
  // themselves to the same coordinate system as the buildings — meaning
  // they scale + slide with the city as the viewport changes, instead of
  // drifting freely across the viewport.
  const layout = { CITY_W: 0, OX: 0, S: 1, HZ: 0, VW: 1150 };
  function computeLayout(w, h) {
    const VW = 1150;
    const CAP_AR = 10.5 / 9;
    const W_FOR_SCALE = Math.min(w, h * CAP_AR);
    const S = Math.max(W_FOR_SCALE / VW, Math.min(1.15, h / 780));
    const CITY_W = VW * S;
    let OX;
    if (CITY_W > w) {
      OX = w * 0.20 - 0.22 * CITY_W;
    } else {
      const REF_W = h * CAP_AR;
      const OX_AT_REF = REF_W * 0.20 - 0.22 * CITY_W;
      OX = OX_AT_REF + (w - REF_W) / 2;
    }
    return { VW, CITY_W, OX, S, HZ: h * 0.55 };
  }
  const X_DES = (f) => f * layout.CITY_W + layout.OX;    // design fraction → screen x

  /* ═══════════════════════════════════════════════════════════════════════
     SKY PROJECTION.

     Standard astronomy convention:
       azimuth  0° = North, 90° = East, 180° = South, 270° = West
       altitude 0° = horizon, 90° = zenith, negative = below horizon

     Camera: looks WEST (azimuth ≈ 268°, roughly the bearing of the
       Detroit skyline from Belle Isle Sunset Point), horizon at bottom.
     Projection: equirectangular. Both axes are linear in degrees, sharing
       the same pixel scale so shapes don't distort horizontally vs.
       vertically. The RenCen (design fraction 0.22) sits at the camera
       centerline in azimuth.
     Field of view: pxPerDeg = CITY_W / 90, so 90° of azimuth spans the
       city width. On 21:9 the viewport is wider than the city, so hFOV
       naturally exceeds 90° there and more of the sky becomes visible.

     Stars above alt ≈ CITY_W/pxPerDeg × height ratio get clipped off the
     top of the canvas — that's a limitation of a flat rectilinear canvas
     representing part of a hemisphere. We accept it: the interesting
     constellations for this west-facing view (Big Dipper, Cassiopeia,
     Boötes, the Summer Triangle low in the west) mostly sit in the
     visible band. Overhead objects like Draco or Cepheus may exceed the
     top on 1080p.
     ═════════════════════════════════════════════════════════════════════ */
  const CAMERA_AZ_DEG = 268;      // WSW — matches the RenCen bearing from Belle Isle

  /* ═══════════════════════════════════════════════════════════════════════
     SKY PROJECTION — anchor-based, artistic-license.

     The mapping is deliberately NOT a photographically accurate FOV. The
     drawn skyline compresses the real 11° angular span of downtown Detroit
     into ~25% of the canvas, so a strict astronomy projection would leave
     the surrounding sky nearly empty. Instead we anchor the sky to specific
     positions on the canvas:

       Sky azRel   0°  →  canvas center (W/2)
       Sky azRel -90°  →  X position of Ambassador Bridge Canadian tower
                                                (design fraction -0.32)
       Sky azRel +90°  →  X position of MacArthur Bridge east end
                                                (design fraction +1.05)

     Piecewise linear on each side of canvas center. Since the drawn city
     is asymmetric relative to canvas center (Amb west sits some distance
     LEFT of center, MacArthur east sits some distance RIGHT — the two
     distances differ, and how they differ depends on viewport width),
     the left and right halves of sky get different pixel scales.

     Outside the ±90° range we LINEARLY EXTRAPOLATE at the same per-side
     rate — so a wider viewport naturally shows more sky, filling the
     extra canvas past the anchors with sky beyond 90° from center. The
     only clipping is at ±180° (physically behind the observer) plus the
     usual off-canvas / below-horizon checks.

     Vertical scale uses the AVERAGE horizontal deg-per-pixel from the two
     sides so constellation shapes don't get too squished. Altitude cap is
     roughly horizon / pxPerDeg_v — comfortably above Polaris (42°) and
     the Big Dipper (24-47°); near-zenith objects (Vega 84°, Draco 75°)
     do clip off the top, an acceptable flat-canvas limitation.
     ═════════════════════════════════════════════════════════════════════ */
  const LEFT_ANCHOR_FRAC  = -0.32;   // Ambassador Bridge Canadian (west) tower
  const RIGHT_ANCHOR_FRAC =  1.05;   // MacArthur Bridge east end (Belle Isle)
  const SKY_HALF_DEG      = 90;      // Amb west = -90°, MacArthur east = +90°

  function skyToScreen(altDeg, azDeg) {
    // Signed azimuth relative to camera direction, wrapped to (-180, +180].
    let azRel = azDeg - CAMERA_AZ_DEG;
    while (azRel > 180) azRel -= 360;
    while (azRel < -180) azRel += 360;

    // Horizontal — piecewise linear about canvas center, with linear
    // extrapolation beyond ±90° so wide viewports get extra sky past the
    // anchors instead of empty margins.
    const centerSx      = w / 2;
    const leftAnchorSx  = X_DES(LEFT_ANCHOR_FRAC);
    const rightAnchorSx = X_DES(RIGHT_ANCHOR_FRAC);
    const pxPerDegLeft  = (centerSx - leftAnchorSx)  / SKY_HALF_DEG;   // > 0
    const pxPerDegRight = (rightAnchorSx - centerSx) / SKY_HALF_DEG;   // > 0
    const sx = azRel <= 0
      ? centerSx + azRel * pxPerDegLeft         // azRel negative → sx moves left
      : centerSx + azRel * pxPerDegRight;

    // Vertical: uniform pxPerDeg from the average of the two horizontal
    // rates. Uses layout.CITY_W scaled equivalents to stay consistent
    // even when the anchors are partly off-canvas on narrow viewports.
    const pxPerDegV = (pxPerDegLeft + pxPerDegRight) / 2;
    const sy = horizon - altDeg * pxPerDegV;

    // Only physically clip at ±180° (behind observer). The screen bounds
    // and horizon check do the rest.
    const visible = Math.abs(azRel) < 180 &&
                    altDeg >= -0.5 &&
                    sy >= -2 && sy <= horizon + 4 &&
                    sx >= -20 && sx <= w + 20;
    return { sx, sy, azRel, visible };
  }

  // vmag → brightness (0..1.3). Sirius is ~-1.5, brightest catalog stars
  // like Vega ~0, faint ones ~4.5. A log-ish curve because human eye is
  // logarithmic in perceived brightness.
  function vmagToBrightness(vmag) {
    // Star at vmag 0 → 1.20 brightness (very bright), vmag 1 → 1.00, vmag
    // 2.5 → 0.75, vmag 4 → 0.55, vmag 5 → 0.42
    const b = 1.20 - 0.18 * vmag;
    return Math.max(0.35, Math.min(1.35, b));
  }
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
    const nBase = Math.max(5, Math.min(14, Math.round(w / 130)));
    const n = Math.round(nBase * weather.cloudCount);
    clouds = [];
    for (let i = 0; i < n; i++) {
      const far = i % 2 === 0;
      const sc = (far ? 0.5 + Math.random() * 0.25 : 0.75 + Math.random() * 0.4) * base;
      // Keep every cloud inside the sky band and above the skyline: on a tall
      // screen an unclamped y put them in the water.
      const ch = 250 * sc;
      const yMin = ch * 0.35;
      const yMax = Math.max(yMin + 1, horizon * 0.62);
      const baseA = far ? 0.45 + Math.random() * 0.2 : 0.7 + Math.random() * 0.25;
      clouds.push({
        x: Math.random() * (w + 400) - 200,
        y: yMin + Math.random() * (yMax - yMin),
        sc,
        sp: (far ? 0.05 : 0.13) + Math.random() * 0.08,
        a: baseA * weather.cloudAlpha,
        s: puffs[(Math.random() * puffs.length) | 0],
        far,
      });
    }
  }

  function bakeSkyline() {
    horizon = h * 0.55;
    const L = computeLayout(w, h);
    layout.CITY_W = L.CITY_W; layout.OX = L.OX; layout.S = L.S; layout.HZ = L.HZ;
    sky = document.createElement('canvas');
    sky.width = Math.floor(w * dpr); sky.height = Math.floor(h * dpr);
    const s = sky.getContext('2d');
    s.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The skyline computes its own layout scale now (fixed virtual width, and it
    // overflows off-screen rather than shrinking on a phone), so it just needs a
    // zoom factor.
    drawSkyline(s, w, h, horizon, 1);
  }

  function onResize() { withBakedRand(() => {
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
      const count = Math.round(L[0] * weather.rainDensity);
      for (let i = 0; i < count; i++) {
        rain.push({
          depth,
          x: Math.random() * (w + 200) - 100,
          y: Math.random() * h,
          len: L[1] + Math.random() * (L[2] - L[1]),
          sp: L[3] + Math.random() * (L[4] - L[3]),
        });
      }
    });

    // ── STARS. Only on calmer presets; density scales with weather.starDensity.
    //    All star positions are stored in DESIGN SPACE so they scale + pan with
    //    the city the same way the buildings do — pinned to the ground, not
    //    the viewport.
    //
    //    Field stars: {dx: fraction of CITY_W (can go negative for west sky),
    //                  dy: fraction of horizon-Y (0=top of viewport, 1=horizon)}.
    //    Rendered each frame as sx = X_DES(dx), sy = dy * horizon.
    stars = [];
    if (weather.starDensity > 0.01) {
      // Fill a design-space region that's wider than the visible viewport on
      // ultrawide, so wherever the viewer's window lands they see stars all
      // the way to the frame edges. The sky-y band is the upper 78% of
      // horizon (never on the water, never on the tallest buildings).
      const DX_MIN = -1.0, DX_MAX = 1.4;   // covers well past the composition on all sides
      const DY_MIN = 0.02, DY_MAX = 0.80;

      // Density: ~1 star per (0.008 fraction * 0.02 sky-y-frac) = one per
      // 0.00016 fraction-area. Over the (2.4 x 0.78) design region that's
      // roughly ~1100 stars at full clear density, well above the old count.
      const area = (DX_MAX - DX_MIN) * (DY_MAX - DY_MIN);
      const nStars = Math.round(1100 * weather.starDensity * area / (2.4 * 0.78));
      for (let i = 0; i < nStars; i++) {
        const dx = DX_MIN + Math.random() * (DX_MAX - DX_MIN);
        const dy = DY_MIN + Math.random() * (DY_MAX - DY_MIN);
        stars.push({
          x: X_DES(dx),                    // baked to screen coords: valid until next resize
          y: dy * horizon,
          br: 0.25 + Math.pow(Math.random(), 2.2) * 0.75,
          tw: Math.random() * Math.PI * 2,
          tSpeed: 0.3 + Math.random() * 1.4,
          big: Math.random() < 0.06,
          named: false,
        });
      }

      // ── CONSTELLATIONS from real astronomy data.
      //
      // Positions come from sky-by-month.json (built by scripts/build-
      // sky-data.js from the RA/Dec catalog): for each 1st-of-month at 2 AM
      // local Detroit time, every star has precomputed altitude/azimuth
      // for observer 42.34N / 82.98W.
      //
      // The renderer:
      //   - picks the current calendar month
      //   - projects every star (regardless of visibility) via skyToScreen
      //   - only pushes stars/lines to the draw list if the endpoints are
      //     within horizontal FOV and above the horizon
      //
      // sky data may still be loading on first paint — the fetch below
      // reruns makeStars() when it lands. Field stars appear immediately;
      // constellations appear after the ~100ms fetch.
      window.__constellationLines = [];
      window.__highlightLines = [];
      if (window.__SKY_DATA__) {
        // ?month=NN (01..12) forces a specific month for testing; without
        // it, use the actual current calendar month.
        const monthOverride = new URLSearchParams(location.search).get('month');
        const monthKey = /^(0[1-9]|1[0-2])$/.test(monthOverride)
          ? monthOverride
          : String(new Date().getMonth() + 1).padStart(2, '0');
        const monthData = window.__SKY_DATA__.months[monthKey];

        // ── HIGHLIGHT CONSTELLATIONS. Names in this map get special
        //    rendering: brighter/bigger star cores, warm gold connecting
        //    lines, and a soft halo. Each entry can also set `maxAlt` to
        //    slide the whole constellation DOWN as one unit if any of its
        //    stars would clip off the top of the canvas.
        //
        //    Deliberately unlabeled — the visual gold treatment is the
        //    only cue.
        const HIGHLIGHTS = {
          'Scorpius': { maxAlt: 55 },
          'Cancer':   { maxAlt: 55 },
        };

        // altMax we can actually render on the current viewport, given the
        // vertical pxPerDeg used by skyToScreen. Anything above this drops
        // off the top of the canvas.
        const altMaxOnCanvas = horizon /
          (((w/2 - X_DES(LEFT_ANCHOR_FRAC)) / SKY_HALF_DEG +
            (X_DES(RIGHT_ANCHOR_FRAC) - w/2) / SKY_HALF_DEG) / 2);

        if (monthData) {
          for (const cons of monthData.constellations) {
            const hl = HIGHLIGHTS[cons.name];

            // For highlighted constellations, compute an altitude offset
            // that slides the whole constellation down until its highest
            // star clears the canvas top (or the target maxAlt, whichever
            // is more restrictive).
            let altShift = 0;
            if (hl) {
              const consMaxAlt = Math.max(...cons.stars.map(s => s.altDeg));
              const target = Math.min(altMaxOnCanvas - 4, hl.maxAlt);
              if (consMaxAlt > target) altShift = consMaxAlt - target;
            }

            const px = cons.stars.map(s => {
              const p = skyToScreen(s.altDeg - altShift, s.azDeg);
              return { x: p.sx, y: p.sy, visible: p.visible, vmag: s.vmag, name: s.name };
            });
            for (const p of px) {
              if (!p.visible) continue;
              stars.push({
                x: p.x, y: p.y,
                br: vmagToBrightness(p.vmag) * (hl ? 1.25 : 1),
                tw: Math.random() * Math.PI * 2,
                tSpeed: 0.15 + Math.random() * 0.35,
                big: true, named: true,
                highlight: !!hl,
              });
            }
            // Lines all use the same faint indigo style — highlighted
            // constellations pop via their star markers, not their lines.
            for (const [a, b] of cons.lines) {
              if (!px[a].visible || !px[b].visible) continue;
              window.__constellationLines.push({
                x1: px[a].x, y1: px[a].y,
                x2: px[b].x, y2: px[b].y,
              });
            }
          }
        }
      }
    }
  }); }

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

    // ── SANITY CHECK LINES: mark sky angles -90°, 0°, +90° on canvas.
    //    Only drawn when the URL query has ?debug=1. Temporary — remove
    //    once the FOV mapping is confirmed.
    if (new URLSearchParams(location.search).get('debug') === '1' && weather.starDensity > 0.01) {
      const mark = (skyDeg, color, label) => {
        // Simulate a star at azRel = skyDeg, alt = 0 to find the x coord.
        // Pass az = CAMERA_AZ_DEG + skyDeg so azRel = skyDeg after subtraction.
        const p = skyToScreen(0, CAMERA_AZ_DEG + skyDeg);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(p.sx, 0); ctx.lineTo(p.sx, horizon); ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = '16px monospace';
        ctx.fillText(label, p.sx + 4, 20);
      };
      mark(-90, 'rgba(120,255,120,0.9)', '-90° (Amb west)');
      mark(  0, 'rgba(255,80,80,0.9)',   '0° (center)');
      mark(+90, 'rgba(120,180,255,0.9)', '+90° (MacArthur east)');
    }

    // ── STARS. Behind everything, twinkling gently. Only drawn when the
    //    active weather preset has non-zero starDensity (clear / wisps).
    //    Named constellation stars are rendered bigger with a wider halo
    //    and connected by faint lines so the shapes actually read.
    if (stars.length) {
      ctx.globalCompositeOperation = 'source-over';

      // Constellation connecting lines FIRST, so stars draw on top of them.
      const lines = window.__constellationLines || [];
      if (lines.length) {
        // Faint indigo lines for regular constellations — visible but
        // recessive, so the birthday highlights read as louder against
        // the same background.
        ctx.strokeStyle = 'rgba(200,215,255,0.13)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (const L of lines) {
          ctx.moveTo(L.x1, L.y1);
          ctx.lineTo(L.x2, L.y2);
        }
        ctx.stroke();
      }

      for (const st of stars) {
        const tw = 0.72 + 0.28 * Math.sin(t * st.tSpeed + st.tw);
        const a = Math.min(1, st.br * tw);
        if (st.highlight) {
          // HIGHLIGHTED constellation star: warm gold, larger, with an outer
          // amber halo so it visibly pops from the field.
          ctx.fillStyle = 'rgba(255,205,110,' + (a * 0.22) + ')';
          ctx.beginPath(); ctx.arc(st.x, st.y, 6.5, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,215,130,' + (a * 0.5) + ')';
          ctx.beginPath(); ctx.arc(st.x, st.y, 3.4, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,240,200,' + a + ')';
          ctx.fillRect(st.x - 1.3, st.y - 1.3, 3, 3);
          // Cross glint, warm
          ctx.fillStyle = 'rgba(255,220,150,' + (a * 0.4) + ')';
          ctx.fillRect(st.x - 6, st.y - 0.35, 12, 0.9);
          ctx.fillRect(st.x - 0.35, st.y - 6, 0.9, 12);
        } else if (st.named) {
          // NAMED constellation star: bigger core, larger warm halo, and a
          // second thinner cross-glint to sell "bright star".
          ctx.fillStyle = 'rgba(255,250,235,' + (a * 0.18) + ')';
          ctx.beginPath(); ctx.arc(st.x, st.y, 4.5, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,250,235,' + (a * 0.35) + ')';
          ctx.beginPath(); ctx.arc(st.x, st.y, 2.4, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,252,240,' + a + ')';
          ctx.fillRect(st.x - 1, st.y - 1, 2.4, 2.4);
          ctx.fillStyle = 'rgba(255,250,235,' + (a * 0.28) + ')';
          ctx.fillRect(st.x - 4, st.y - 0.3, 8, 0.7);
          ctx.fillRect(st.x - 0.3, st.y - 4, 0.7, 8);
        } else if (st.big) {
          // Occasional bright field star
          ctx.fillStyle = 'rgba(255,250,235,' + (a * 0.25) + ')';
          ctx.beginPath(); ctx.arc(st.x, st.y, 2.2, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,250,235,' + a + ')';
          ctx.fillRect(st.x - 0.5, st.y - 0.5, 1.6, 1.6);
        } else {
          ctx.fillStyle = 'rgba(232,232,240,' + a + ')';
          ctx.fillRect(st.x, st.y, 1, 1);
        }
      }
    }

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

    // Sky-only mode (?skyonly=1) skips ALL city + water rendering so the
    // constellations can be verified against reference charts without the
    // buildings occluding the low-altitude stars. Temporary debug aid.
    const SKY_ONLY = new URLSearchParams(location.search).get('skyonly') === '1';
    if (SKY_ONLY) {
      return;   // nothing else to draw
    }

    ctx.globalCompositeOperation = 'source-over';       // the city occludes the storm
    ctx.drawImage(sky, 0, 0, w, h);

    // On viewports wider than the 10.5:9 cap the skyline no longer scales up
    // to fill; the extra pixels on the right should read as open water, not
    // as blank body background. Paint a dark water base across the full width
    // below the horizon. Below, the reflection slices layer over this and the
    // chop and rain still span the full width.
    const waterGrad = ctx.createLinearGradient(0, horizon, 0, h);
    waterGrad.addColorStop(0,   'rgba(6, 10, 24, 0.90)');
    waterGrad.addColorStop(0.4, 'rgba(6, 10, 24, 0.80)');
    waterGrad.addColorStop(1,   'rgba(4, 6, 16, 0.85)');
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, horizon, w, h - horizon);

    // The river: slice the skyline back row by row, each row offset by a
    // travelling sine. That horizontal smear is what water does to light.
    const SLICE = 3;
    // Weather-driven wobble: calm water is nearly mirror-still, chaotic water
    // smears the reflection heavily. Speed also scales — a calm night has
    // slow rolling ripples instead of the storm's fast chop.
    const wobMul = weather.wobble;
    const wobSpeed = 0.4 + 1.2 * wobMul;
    // Calm water: reflection is sharper (higher alpha).
    const reflAlphaMul = wobMul < 0.4 ? 1.35 : 1.0;
    for (let y = horizon; y < h; y += SLICE) {
      const d = (y - horizon) / (h - horizon);
      const wob = Math.sin(y * 0.05 + t * wobSpeed) * (1.5 + d * 16) * wobMul;
      ctx.globalAlpha = Math.min(0.85, 0.5 * (1 - d * 0.7) * reflAlphaMul);
      ctx.drawImage(sky,
        0, Math.floor((2 * horizon - y - SLICE) * dpr), sky.width, Math.floor(SLICE * dpr),
        wob, y, w, SLICE + 1);
    }
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.25;
    for (const b of bolts) strokeBolt(b, true);          // lightning in the water
    ctx.globalAlpha = 1;

    // Chop lines on the water — density and brightness scale with weather.
    // Calm water has almost no chop; storm water is dense with it.
    const chopAlpha = 0.05 * (0.5 + weather.chopIntensity * 1.5);
    const chopStep = weather.chopIntensity < 0.3 ? 14 : 7;    // fewer lines when calm
    const chopSpeed = weather.chopIntensity < 0.3 ? 4 : 12;
    ctx.strokeStyle = 'rgba(201,162,75,' + chopAlpha + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = horizon + 4; y < h; y += chopStep) {
      const d = (y - horizon) / (h - horizon);
      const seg = 20 + d * 90;
      for (let x = (t * chopSpeed + y * 7) % seg - seg; x < w; x += seg + 26) {
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
    // Lightning strike scheduling — only on presets with thunder enabled,
    // and with the strike interval scaled by weather.thunderRate (rate 1.0
    // is the original storm cadence; 0.5 stretches the gap ~2x).
    if (weather.thunderRate > 0) {
      nextBolt -= 1 / 30;
      if (nextBolt <= 0) {
        strike();
        if (Math.random() < 0.35 * weather.thunderRate) strike();
        const narrow = w < 700;
        const base = (narrow ? 1.6 : 2.2) + Math.random() * (narrow ? 3.4 : 5);
        nextBolt = base / weather.thunderRate;
      }
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
