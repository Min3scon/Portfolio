// Easter egg: type "moon" anywhere on the page and everything drops under
// low gravity, piling up at the bottom of the window. Blocks can be dragged
// back up, but they have weight: bigger blocks lag behind the pointer and sag
// like you're hauling something heavy. Type "moon" again to put it all back.
(() => {
  const CODE_WORD = "moon";

  // Matter.js handles the collisions and stacking. It's only fetched the first
  // time the word is typed, so normal visits never download it.
  const MATTER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/matter-js/0.19.0/matter.min.js";
  const MATTER_SRI = "sha384-OqQP3UcU7efkEYDRjGmQou2uEvzGFGRtwdYXTjnupeB9cWogSgQ4BOhyklFBYbBR";

  // What falls. Only the outermost match is used, so a card drops as one
  // piece rather than as its title, text and tags separately.
  const BODY_SELECTOR = [
    ".site-header .path", ".site-header .nav a", ".site-footer", ".card",
    "main h1", "main h2", "main h3", "main p", "main a", "main img",
    "main ul", "main ol", "main form", "main figure",
  ].join(", ");
  // Text blocks stretch across their whole column. Shrink them to their text
  // so the empty part of the box doesn't hold other blocks up in mid-air.
  const TEXT_TAGS = new Set(["H1", "H2", "H3", "P", "UL", "OL"]);

  const STEP = 1000 / 60; // ms per physics step
  // Matter's gravity of 1 is roughly Earth on screen; the Moon is about a sixth.
  const GRAVITY = 0.17;
  const GRAVITY_ACCEL = GRAVITY * 0.001 * STEP * STEP; // px per step²

  // Dragging is a damped spring pulling the grabbed point towards the pointer.
  // Small blocks follow quickly. Bigger ones get a softer spring and a cap on
  // how hard you can pull, so they lag behind and are slow to lift.
  const LIGHT_AREA = 6000; // px², about the size of a nav link
  const HEAVY_AREA = 200000; // px², about the size of a project card
  const SPRING = 0.3; // per step, for a light block
  const DAMPING = 0.8; // fraction of critical damping
  const STRENGTH = 5; // a heavy block can be pulled with 5x its own weight

  const MAX_SPEED = 25; // px per step, so nothing tunnels through a wall
  const WALL = 1000; // wall thickness in px
  const FLOOR_RISE = 4; // px per step the floor lifts half-hidden blocks into view
  const RETURN_MS = 1000;
  const RETURN_STAGGER = 30;

  let state = "off"; // "off" | "loading" | "on" | "landing"
  let scene = null;
  let typed = "";

  const loadMatter = () => {
    if (window.Matter) return Promise.resolve(window.Matter);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = MATTER_SRC;
      script.integrity = MATTER_SRI;
      script.crossOrigin = "anonymous";
      script.onload = () => resolve(window.Matter);
      script.onerror = () => {
        script.remove();
        reject(new Error("Couldn't load Matter.js"));
      };
      document.head.append(script);
    });
  };

  // Turn the page into physics bodies and start the simulation. Returns
  // controls to fly everything home (land) or snap it back (restore).
  const drop = ({ Engine, Bodies, Body, Composite }) => {
    const root = document.documentElement;
    const savedGutter = root.style.scrollbarGutter;

    // Freeze scrolling so the window is the box everything falls in. Keep the
    // scrollbar's space if there was one, so the layout doesn't shift sideways.
    if (window.innerWidth > root.clientWidth) root.style.scrollbarGutter = "stable";
    root.classList.add("moon");

    const matches = [...document.querySelectorAll(BODY_SELECTOR)];
    const items = matches
      .filter((el) => {
        if (matches.some((other) => other !== el && other.contains(el))) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .map((el) => {
        const style = getComputedStyle(el);
        return {
          el,
          css: el.style.cssText,
          display: style.display,
          position: style.position,
          radius: parseFloat(style.borderTopLeftRadius) || 0,
        };
      });

    for (const { el, display, position } of items) {
      // Transforms don't apply to plain inline boxes, and z-index (for the
      // block being dragged) needs a positioned element.
      if (display === "inline") el.style.display = "inline-block";
      if (position === "static") el.style.position = "relative";
      if (TEXT_TAGS.has(el.tagName)) el.style.width = "fit-content";
      el.style.transition = "none";
      el.style.transform = "none";
      el.classList.add("moon-body");
    }

    const view = { width: root.clientWidth, height: root.clientHeight };

    // Where each element sits with no transform. Its body's position is
    // drawn as an offset from here.
    const measure = (item) => {
      const rect = item.el.getBoundingClientRect();
      item.home = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      return rect;
    };

    const engine = Engine.create({ positionIterations: 10, velocityIterations: 8 });
    engine.gravity.y = GRAVITY;

    // Anything below the fold drops in from above the window instead. Anything
    // cut off by the bottom edge stays put, and the floor starts below it and
    // rises to lift it into view.
    let floorY = view.height;
    let skyY = Math.min(0, ...items.map((item) => item.el.getBoundingClientRect().top)) - 80;

    for (const item of items) {
      const rect = measure(item);
      item.w = rect.width;
      item.h = rect.height;
      let { x, y } = item.home;
      if (rect.top >= view.height) {
        y = skyY - rect.height / 2;
        skyY -= rect.height + 80;
      } else {
        floorY = Math.max(floorY, rect.bottom);
      }
      const radius = Math.min(item.radius, rect.width / 2 - 1, rect.height / 2 - 1);
      item.body = Bodies.rectangle(x, y, rect.width, rect.height, {
        chamfer: radius > 1 ? { radius } : null,
        friction: 0.5,
        frictionStatic: 0.8,
        frictionAir: 0.008,
        restitution: 0.1,
      });
      // A little spin so things land in a heap rather than perfectly flat.
      Body.setAngularVelocity(item.body, (Math.random() - 0.5) * 0.002);
      item.prev = { x, y, angle: 0 };
    }

    const wall = { isStatic: true, friction: 0.8 };
    const floor = Bodies.rectangle(0, 0, 40000, WALL, wall);
    const leftWall = Bodies.rectangle(0, 0, WALL, 40000, wall);
    const rightWall = Bodies.rectangle(0, 0, WALL, 40000, wall);
    const placeWalls = () => {
      Body.setPosition(floor, { x: view.width / 2, y: floorY + WALL / 2 });
      Body.setPosition(leftWall, { x: -WALL / 2, y: view.height - 20000 });
      Body.setPosition(rightWall, { x: view.width + WALL / 2, y: view.height - 20000 });
    };
    placeWalls();
    Composite.add(engine.world, [...items.map((item) => item.body), floor, leftWall, rightWall]);

    // ---- Dragging ----
    let grab = null;
    let blockClick = false;

    const onPointerDown = (event) => {
      if (grab || event.button !== 0) return;
      if (event.target.closest("input, textarea, select, button, label")) return;
      const item = items.find(({ el }) => el.contains(event.target));
      if (!item) return;
      event.preventDefault();

      const { body } = item;
      const dx = event.clientX - body.position.x;
      const dy = event.clientY - body.position.y;
      const cos = Math.cos(body.angle);
      const sin = Math.sin(body.angle);
      grab = {
        item,
        body,
        pointerId: event.pointerId,
        // The grabbed point in the body's own unrotated frame, so it stays
        // on the same spot as the body turns.
        local: { x: dx * cos + dy * sin, y: dy * cos - dx * sin },
        target: { x: event.clientX, y: event.clientY },
        start: { x: event.clientX, y: event.clientY },
        moved: false,
        omega: SPRING * Math.min(1, (LIGHT_AREA / body.area) ** 0.3),
        maxAccel: GRAVITY_ACCEL * Math.max(1.5, (STRENGTH * HEAVY_AREA) / body.area),
      };
      item.el.classList.add("moon-held");
      root.classList.add("moon-dragging");
      item.el.setPointerCapture?.(event.pointerId);
    };

    const onPointerMove = (event) => {
      if (!grab || event.pointerId !== grab.pointerId) return;
      grab.target = { x: event.clientX, y: event.clientY };
      if (Math.hypot(event.clientX - grab.start.x, event.clientY - grab.start.y) > 4) grab.moved = true;
    };

    const letGo = () => {
      if (!grab) return;
      grab.item.el.classList.remove("moon-held");
      root.classList.remove("moon-dragging");
      grab = null;
    };

    const onPointerUp = (event) => {
      if (!grab || event.pointerId !== grab.pointerId) return;
      // Dropping a link after dragging it shouldn't also follow it.
      if (grab.moved) {
        blockClick = true;
        setTimeout(() => { blockClick = false; });
      }
      letGo();
    };

    const onClick = (event) => {
      if (!blockClick) return;
      blockClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const onDragStart = (event) => event.preventDefault();

    // Push the grabbed point towards the pointer. The spring is weaker for
    // heavier blocks and the pull is capped, so a big card can't be yanked
    // around like a nav link.
    const pull = () => {
      const { body, local, target, omega, maxAccel } = grab;
      const cos = Math.cos(body.angle);
      const sin = Math.sin(body.angle);
      const rx = local.x * cos - local.y * sin;
      const ry = local.x * sin + local.y * cos;
      // Velocity of the grabbed point, in px per step.
      const spin = body.angle - body.anglePrev;
      const vx = body.position.x - body.positionPrev.x - spin * ry;
      const vy = body.position.y - body.positionPrev.y + spin * rx;

      let ax = omega * omega * (target.x - body.position.x - rx) - 2 * DAMPING * omega * vx;
      let ay = omega * omega * (target.y - body.position.y - ry) - 2 * DAMPING * omega * vy;
      const accel = Math.hypot(ax, ay);
      if (accel > maxAccel) {
        ax *= maxAccel / accel;
        ay *= maxAccel / accel;
      }
      const toForce = body.mass / (STEP * STEP);
      Body.applyForce(
        body,
        { x: body.position.x + rx, y: body.position.y + ry },
        { x: ax * toForce, y: ay * toForce },
      );
    };

    // ---- Simulation ----
    const step = () => {
      for (const { body, prev } of items) {
        prev.x = body.position.x;
        prev.y = body.position.y;
        prev.angle = body.angle;
      }
      if (floorY > view.height) {
        floorY = Math.max(view.height, floorY - FLOOR_RISE);
        placeWalls();
      }
      if (grab) pull();
      Engine.update(engine, STEP);

      for (const item of items) {
        const { body } = item;
        const vx = body.position.x - body.positionPrev.x;
        const vy = body.position.y - body.positionPrev.y;
        const speed = Math.hypot(vx, vy);
        if (speed > MAX_SPEED) Body.setVelocity(body, { x: (vx / speed) * MAX_SPEED, y: (vy / speed) * MAX_SPEED });

        // If something still slips out of the box, drop it back in from the top.
        const escaped = body.position.x < -WALL / 2 || body.position.x > view.width + WALL / 2
          || body.position.y > floorY + WALL / 2;
        if (escaped) {
          if (grab?.item === item) letGo();
          Body.setPosition(body, { x: view.width / 2, y: -item.h });
          Body.setVelocity(body, { x: 0, y: 0 });
        }
      }
    };

    // Draw each body as a transform on its element, blending between the last
    // two steps so motion stays smooth on screens faster than 60Hz.
    const draw = (blend) => {
      for (const item of items) {
        const { body, prev, home } = item;
        const x = prev.x + (body.position.x - prev.x) * blend - home.x;
        const y = prev.y + (body.position.y - prev.y) * blend - home.y;
        const angle = prev.angle + (body.angle - prev.angle) * blend;
        const transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${angle.toFixed(4)}rad)`;
        if (transform !== item.transform) item.el.style.transform = item.transform = transform;
      }
    };

    let frameId = 0;
    let last = performance.now();
    let lag = 0;
    const frame = (now) => {
      // Cap the catch-up so returning to a background tab doesn't fast-forward.
      lag = Math.min(lag + Math.max(0, now - last), STEP * 4);
      last = now;
      while (lag >= STEP) {
        step();
        lag -= STEP;
      }
      draw(lag / STEP);
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);

    // On resize, re-measure where everything sits in the new layout and
    // resize bodies whose element changed shape (e.g. text rewrapped). The
    // bodies themselves stay where they've fallen.
    let resizeId = 0;
    const refit = () => {
      view.width = root.clientWidth;
      view.height = root.clientHeight;
      floorY = Math.max(floorY, view.height);
      for (const { el } of items) el.style.transform = "none";
      for (const item of items) {
        const rect = measure(item);
        const { body } = item;
        if (Math.abs(rect.width - item.w) > 1 || Math.abs(rect.height - item.h) > 1) {
          const angle = body.angle;
          Body.setAngle(body, 0);
          Body.scale(body, rect.width / item.w, rect.height / item.h);
          Body.setAngle(body, angle);
          item.w = rect.width;
          item.h = rect.height;
        }
        const { min, max } = body.bounds;
        if (max.x > view.width) Body.translate(body, { x: view.width - max.x, y: 0 });
        if (min.x < 0) Body.translate(body, { x: -min.x, y: 0 });
        item.prev = { x: body.position.x, y: body.position.y, angle: body.angle };
        item.transform = "";
      }
      placeWalls();
      draw(1);
    };
    const onResize = () => {
      cancelAnimationFrame(resizeId);
      resizeId = requestAnimationFrame(refit);
    };

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("click", onClick, true);
    document.addEventListener("dragstart", onDragStart);
    window.addEventListener("resize", onResize);

    const halt = () => {
      cancelAnimationFrame(frameId);
      cancelAnimationFrame(resizeId);
      letGo();
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("click", onClick, true);
      document.removeEventListener("dragstart", onDragStart);
      window.removeEventListener("resize", onResize);
    };

    let landTimer = 0;

    // Stop the physics and float every element back to where it belongs.
    const land = (done) => {
      halt();
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return done();

      // Start from the same angle turned less than half a turn, so nothing
      // spins round several times on the way home.
      for (const item of items) {
        const { body, home } = item;
        let angle = body.angle % (2 * Math.PI);
        if (angle > Math.PI) angle -= 2 * Math.PI;
        if (angle < -Math.PI) angle += 2 * Math.PI;
        item.el.style.transform = `translate(${body.position.x - home.x}px, ${body.position.y - home.y}px) rotate(${angle}rad)`;
      }
      root.getBoundingClientRect(); // commit the start point before transitioning
      items.forEach(({ el }, i) => {
        el.style.transition = `transform ${RETURN_MS}ms cubic-bezier(0.22, 1, 0.36, 1) ${i * RETURN_STAGGER}ms`;
        el.style.transform = "translate(0px, 0px) rotate(0rad)";
      });
      landTimer = setTimeout(done, RETURN_MS + items.length * RETURN_STAGGER);
    };

    // Put the page back exactly as it was.
    const restore = () => {
      clearTimeout(landTimer);
      halt();
      for (const { el, css } of items) {
        if (css) el.style.cssText = css;
        else el.removeAttribute("style");
        el.classList.remove("moon-body", "moon-held");
      }
      root.classList.remove("moon", "moon-dragging");
      root.style.scrollbarGutter = savedGutter;
    };

    return { land, restore };
  };

  const start = () => {
    state = "loading";
    loadMatter().then(
      (Matter) => {
        scene = drop(Matter);
        state = "on";
      },
      (error) => {
        console.warn("Moon mode:", error);
        state = "off";
      },
    );
  };

  const finish = () => {
    scene.restore();
    scene = null;
    state = "off";
  };

  const toggle = () => {
    if (state === "off") {
      start();
    } else if (state === "on") {
      state = "landing";
      scene.land(finish);
    } else if (state === "landing") {
      finish();
      start();
    }
    // While Matter.js is still loading, ignore it.
  };

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
    // Typing "moon" into a form field is just typing.
    if (event.target.isContentEditable || event.target.closest?.("input, textarea, select")) return;
    typed = (typed + event.key.toLowerCase()).slice(-CODE_WORD.length);
    if (typed !== CODE_WORD) return;
    typed = "";
    toggle();
  });
})();
