(() => {
  "use strict";
  const root = document.getElementById("sceneRoot");
  const canvas = document.getElementById("securityCanvas");
  const T = window.THREE;
  if (!root || !canvas) return;
  const fallback = () => { root.dataset.sceneState = "fallback"; };
  if (!T) { fallback(); return; }
  const compact = window.matchMedia("(max-width: 700px)").matches;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  let context;
  try { context = canvas.getContext("webgl2", { alpha: true, antialias: !compact, powerPreference: compact ? "default" : "high-performance" }); } catch { fallback(); return; }
  if (!context) { fallback(); return; }

  try {
    const renderer = new T.WebGLRenderer({ canvas, context, alpha: true, antialias: !compact });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.75));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(0x090916, 0);
    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(34, 1, .1, 40);
    camera.position.set(0, 0, compact ? 9.3 : 8.5);

    // A locally generated reflection studio: no textures or model downloads.
    const studio = document.createElement("canvas");
    studio.width = 1024; studio.height = 512;
    const paint = studio.getContext("2d");
    const backdrop = paint.createLinearGradient(0, 0, 0, 512);
    backdrop.addColorStop(0, "#101024"); backdrop.addColorStop(.4, "#4a416c");
    backdrop.addColorStop(.52, "#aaa1c3"); backdrop.addColorStop(.7, "#151728"); backdrop.addColorStop(1, "#03040b");
    paint.fillStyle = backdrop; paint.fillRect(0, 0, 1024, 512);
    const strip = (x, width, color) => { const gradient = paint.createLinearGradient(x, 0, x + width, 0); gradient.addColorStop(0, "rgba(255,255,255,0)"); gradient.addColorStop(.5, color); gradient.addColorStop(1, "rgba(255,255,255,0)"); paint.fillStyle = gradient; paint.fillRect(x, 55, width, 310); };
    strip(80, 110, "#ffffff"); strip(480, 90, "#c2dcff"); strip(780, 180, "#ffd7eb");
    const studioTexture = new T.CanvasTexture(studio);
    studioTexture.mapping = T.EquirectangularReflectionMapping;
    studioTexture.colorSpace = T.SRGBColorSpace;
    const environmentGenerator = new T.PMREMGenerator(renderer);
    const environment = environmentGenerator.fromEquirectangular(studioTexture);
    scene.environment = environment.texture;
    environmentGenerator.dispose(); studioTexture.dispose();
    scene.add(new T.HemisphereLight(0xc8c6ff, 0x090916, 1.5));
    const key = new T.DirectionalLight(0xffffff, 4); key.position.set(3, 5, 5); scene.add(key);
    const violet = new T.PointLight(0x8a63ff, 55, 15, 2); violet.position.set(-3, 2, 3); scene.add(violet);
    const blue = new T.PointLight(0x72ddff, 45, 15, 2); blue.position.set(3, -1, 3); scene.add(blue);
    const rim = new T.DirectionalLight(0xff9c87, 2.3); rim.position.set(-4, -2, -1); scene.add(rim);

    const world = new T.Group(); scene.add(world);
    const sculpture = new T.Group(); world.add(sculpture);
    const forms = {
      defense: new T.TorusKnotGeometry(1.13, .34, compact ? 120 : 200, compact ? 20 : 36, 2, 3),
      offense: new T.IcosahedronGeometry(1.65, 1),
      research: new T.TorusKnotGeometry(1.15, .23, compact ? 150 : 240, compact ? 18 : 28, 3, 5)
    };
    const palette = { defense: 0x9672ff, offense: 0xff987b, research: 0x71dfff };
    const initialFocus = forms[root.dataset.focus] ? root.dataset.focus : "defense";
    const material = new T.MeshPhysicalMaterial({ color: palette[initialFocus], metalness: .88, roughness: .2, clearcoat: 1, clearcoatRoughness: .13, iridescence: .45, iridescenceIOR: 1.5, envMapIntensity: 1.6, flatShading: initialFocus === "offense" });
    const core = new T.Mesh(forms[initialFocus], material);
    core.rotation.set(.25, -.2, .12); sculpture.add(core);
    const wire = new T.Mesh(forms[initialFocus], new T.MeshBasicMaterial({ color: 0xdfd5ff, wireframe: true, transparent: true, opacity: .025, depthWrite: false }));
    wire.scale.setScalar(1.004); wire.rotation.copy(core.rotation); sculpture.add(wire);
    const rings = new T.Group(); world.add(rings);
    const ringMaterial = new T.MeshStandardMaterial({ color: 0xb6a7ec, metalness: .8, roughness: .25, transparent: true, opacity: .72 });
    const ringA = new T.Mesh(new T.TorusGeometry(2.15, .017, 8, 180), ringMaterial); ringA.rotation.set(1.02, .3, -.35); rings.add(ringA);
    const ringB = new T.Mesh(new T.TorusGeometry(2.5, .009, 6, 200), new T.MeshBasicMaterial({ color: 0x8174bc, transparent: true, opacity: .35 })); ringB.rotation.set(.7, -.4, .75); rings.add(ringB);
    const nodes = Object.keys(palette).map((focus, index) => {
      const angle = index * Math.PI * 2 / 3 + .4;
      const node = new T.Mesh(new T.SphereGeometry(.105, 20, 12), new T.MeshStandardMaterial({ color: palette[focus], emissive: palette[focus], emissiveIntensity: .55, metalness: .3, roughness: .25 }));
      node.position.set(Math.cos(angle) * 2.15, Math.sin(angle) * 1.1, Math.sin(angle + .3) * 1.6);
      node.userData.focus = focus; rings.add(node); return node;
    });

    const glowCanvas = document.createElement("canvas"); glowCanvas.width = glowCanvas.height = 128;
    const glowPaint = glowCanvas.getContext("2d");
    const glowGradient = glowPaint.createRadialGradient(64, 64, 0, 64, 64, 64);
    glowGradient.addColorStop(0, "rgba(255,255,255,.6)"); glowGradient.addColorStop(.35, "rgba(255,255,255,.16)"); glowGradient.addColorStop(1, "rgba(255,255,255,0)");
    glowPaint.fillStyle = glowGradient; glowPaint.fillRect(0, 0, 128, 128);
    const glow = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(glowCanvas), color: palette.defense, transparent: true, opacity: .38, blending: T.AdditiveBlending, depthWrite: false }));
    glow.position.z = -1.4; glow.scale.set(7, 7, 1); world.add(glow);
    let seed = 38;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const positions = new Float32Array((compact ? 100 : 230) * 3);
    for (let i = 0; i < positions.length; i += 3) { positions[i] = (random() - .5) * 13; positions[i + 1] = (random() - .5) * 8; positions[i + 2] = -2 - random() * 5; }
    const particleGeometry = new T.BufferGeometry(); particleGeometry.setAttribute("position", new T.BufferAttribute(positions, 3));
    const particles = new T.Points(particleGeometry, new T.PointsMaterial({ color: 0xb5b7ea, size: .018, transparent: true, opacity: .65, depthWrite: false })); scene.add(particles);

    let activeFocus = initialFocus;
    let targetYaw = .25, yaw = .25, targetPitch = -.15, pitch = -.15;
    let pointerX = 0, pointerY = 0, motion = !reduced.matches, visible = true;
    let dragging = false, lastX = 0, lastY = 0, startX = 0, startY = 0;
    let frame = 0, lastTime = 0, elapsed = 0, frames = 0;
    let targetScale = 1;
    const targetColor = new T.Color(palette[initialFocus]);
    const raycaster = new T.Raycaster();
    const pauseButton = root.querySelector('[data-scene-action="pause"]');
    const controls = [...root.querySelectorAll("[data-scene-action]")];
    const schedule = () => { if (!frame && visible && !document.hidden && root.dataset.sceneState === "ready") frame = requestAnimationFrame(tick); };
    const setMotion = value => {
      motion = value; root.dataset.motion = motion ? "playing" : "paused";
      pauseButton.setAttribute("aria-pressed", String(!motion)); pauseButton.setAttribute("aria-label", motion ? "Pause motion" : "Play motion");
      pauseButton.querySelector(".motion-label").textContent = motion ? "Pause" : "Play";
      pauseButton.querySelector(".pause-symbol").textContent = motion ? "Ⅱ" : "▷";
      if (!motion) { targetYaw = yaw; targetPitch = pitch; }
      schedule();
    };
    function tick(time) {
      frame = 0;
      if (!visible || document.hidden || root.dataset.sceneState !== "ready") { lastTime = 0; return; }
      const delta = lastTime ? Math.min((time - lastTime) / 1000, .05) : 1 / 60; lastTime = time;
      const ease = !motion || reduced.matches ? 1 : 1 - Math.exp(-delta * 5);
      if (motion && !dragging) { elapsed += delta; targetYaw += delta * .095; }
      yaw += (targetYaw - yaw) * ease; pitch += (targetPitch - pitch) * ease;
      world.rotation.set(pitch, yaw, -.13);
      world.position.y = motion ? Math.sin(elapsed * .7) * .09 : world.position.y;
      if (motion) rings.rotation.z += delta * .045;
      sculpture.scale.setScalar(sculpture.scale.x + (targetScale - sculpture.scale.x) * ease);
      if (Math.abs(sculpture.scale.x - targetScale) < .035) targetScale = 1;
      material.color.lerp(targetColor, reduced.matches ? 1 : ease);
      glow.material.color.copy(material.color);
      const parallax = reduced.matches ? 0 : 1;
      camera.position.x += (pointerX * .25 * parallax - camera.position.x) * ease;
      camera.position.y += (-pointerY * .15 * parallax - camera.position.y) * ease;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      root.dataset.renderedFocus = activeFocus;
      frames++;
      if (frames % 20 === 0 || !motion) root.dataset.frames = String(frames);
      root.dataset.yaw = yaw.toFixed(3);
      const colorDifference = Math.abs(material.color.r - targetColor.r) + Math.abs(material.color.g - targetColor.g) + Math.abs(material.color.b - targetColor.b);
      const unsettled = Math.abs(targetYaw - yaw) > .001 || Math.abs(targetPitch - pitch) > .001 || Math.abs(sculpture.scale.x - 1) > .002 || colorDifference > .002;
      if (motion || dragging || unsettled) schedule();
    }
    const resize = () => {
      const width = root.clientWidth, height = root.clientHeight;
      if (!width || !height) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 600 ? 1.25 : 1.5));
      camera.position.z = width < 600 ? 9.3 : 8.5;
      renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); schedule();
    };
    root.addEventListener("focuschange", event => {
      const focus = event.detail;
      if (!forms[focus] || focus === activeFocus) return;
      activeFocus = focus; core.geometry = forms[focus]; wire.geometry = forms[focus];
      material.flatShading = focus === "offense"; material.needsUpdate = true;
      targetColor.setHex(palette[focus]); targetYaw += .5; targetScale = motion && !reduced.matches ? .82 : 1;
      nodes.forEach(node => node.scale.setScalar(node.userData.focus === focus ? 1.5 : 1));
      root.dataset.form = focus; lastTime = 0; schedule();
    });
    controls.forEach(button => button.addEventListener("click", () => {
      const action = button.dataset.sceneAction;
      if (action === "pause") { setMotion(!motion); return; }
      if (action === "left") targetYaw -= .55;
      if (action === "right") targetYaw += .55;
      if (action === "reset") { targetYaw = .25; targetPitch = -.15; pointerX = pointerY = 0; }
      schedule();
    }));
    canvas.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      dragging = true; lastX = startX = event.clientX; lastY = startY = event.clientY;
      canvas.setPointerCapture(event.pointerId); root.classList.add("is-dragging"); schedule();
    });
    canvas.addEventListener("pointermove", event => {
      const bounds = root.getBoundingClientRect();
      pointerX = (event.clientX - bounds.left) / bounds.width * 2 - 1;
      pointerY = (event.clientY - bounds.top) / bounds.height * 2 - 1;
      if (dragging) { targetYaw += (event.clientX - lastX) * .009; if (event.pointerType === "mouse") targetPitch = Math.max(-.7, Math.min(.7, targetPitch + (event.clientY - lastY) * .006)); lastX = event.clientX; lastY = event.clientY; }
      schedule();
    });
    const release = event => {
      if (!dragging) return;
      dragging = false; root.classList.remove("is-dragging");
      if (event.type === "pointerup" && Math.hypot(event.clientX - startX, event.clientY - startY) < 6) {
        const bounds = canvas.getBoundingClientRect();
        raycaster.setFromCamera(new T.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -((event.clientY - bounds.top) / bounds.height * 2 - 1)), camera);
        const hit = raycaster.intersectObjects(nodes)[0];
        if (hit) document.querySelector('.focus-tabs button[data-focus="' + hit.object.userData.focus + '"]')?.click();
      }
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      schedule();
    };
    canvas.addEventListener("pointerup", release); canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("lostpointercapture", () => { dragging = false; root.classList.remove("is-dragging"); });
    canvas.addEventListener("pointerleave", () => { if (!dragging) { pointerX = pointerY = 0; schedule(); } });
    canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); if (frame) cancelAnimationFrame(frame); frame = 0; fallback(); });
    canvas.addEventListener("webglcontextrestored", () => { root.dataset.sceneState = "ready"; resize(); });
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(root);
    else window.addEventListener("resize", resize, { passive: true });
    if ("IntersectionObserver" in window) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (!visible && frame) { cancelAnimationFrame(frame); frame = 0; lastTime = 0; } else schedule(); }, { rootMargin: "80px" }).observe(root);
    document.addEventListener("visibilitychange", () => { if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; lastTime = 0; } else schedule(); });
    reduced.addEventListener("change", () => setMotion(!reduced.matches));
    root.dataset.sceneState = "ready"; root.dataset.form = initialFocus;
    setMotion(motion); resize();
  } catch (error) {
    fallback();
    console.warn("The interactive sculpture could not start.", error.message);
  }
})();
