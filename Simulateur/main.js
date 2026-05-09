(function () {
  const stage = document.getElementById("stage");
  const world = document.getElementById("world");
  const componentsLayer = document.getElementById("components-layer");
  const circuitGrid = document.getElementById("circuit-grid");
  const pickResistorBtn = document.getElementById("pick-resistor");

  /** @typedef {'h' | 'v'} Orient */

  /** @typedef {{ id: string; rIndex: number; jx: number; jy: number; orient: Orient }} Resistor */

  const CELL = 28;
  const SPAN_CELLS = 4;
  const SPAN_PX = SPAN_CELLS * CELL;
  const BODY_ROW_H = CELL;
  const CY = BODY_ROW_H / 2;

  const PAD_L = 8;

  /** traçage horizontal ; vertical = meme logique axe Y */
  const PACK_W = PAD_L + SPAN_PX + 10;

  const JUNCTION_ROW_OFFSET_TOP = 14 + 4 + CY;

  const JOINT_R = 5;
  const JOINT_MARGIN = 1.5;
  const RECT_H = CELL;
  const RECT_W = 2 * CELL;

  const V_LABEL_SLOT = 32;
  const V_LABEL_GAP = 4;

  const MIN_SCALE = 0.2;
  const MAX_SCALE = 5;

  const OHM = "\u2126";

  /** @type {Resistor[]} */
  let resistors = [];
  let resistorSeq = 0;

  /** @type {string | null} */
  let selectedId = null;

  /** @type {null | Pick<Resistor,'orient'>} */
  let clipboardTpl = null;

  /** dernier pointeur sur la grille (pour coller) */
  let lastPointerWorld = { wx: 0, wy: 0 };

  const undoStack = [];
  const redoStack = [];

  let tx = 0;
  let ty = 0;
  let scale = 1;

  /** @type {number | null} */
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;

  /** @type {HTMLElement | null} */
  let dragGhost = null;
  /** @type {number | null} */
  let resistorPickPointerId = null;

  /** @type {null | {
   * sid: string;
   * pointerId: number;
   * jx0: number;
   * jy0: number;
   * anchorWx: number;
   * anchorWy: number;
   * baselineJson: string;
   * moved: boolean;
   * }} */
  let resistorMoveSession = null;

  function uid() {
    return globalThis.crypto && crypto.randomUUID
      ? crypto.randomUUID()
      : `r_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function snapshot() {
    return JSON.stringify(resistors);
  }

  /** @param {() => void} fn */
  function commit(fn) {
    undoStack.push(snapshot());
    redoStack.length = 0;
    fn();
    syncSeqFromModels();
    renderAll();
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(snapshot());
    resistors = JSON.parse(undoStack.pop());
    syncSeqFromModels();
    selectedId =
      selectedId && resistors.some((r) => r.id === selectedId) ? selectedId : null;
    renderAll();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(snapshot());
    resistors = JSON.parse(redoStack.pop());
    syncSeqFromModels();
    selectedId =
      selectedId && resistors.some((r) => r.id === selectedId) ? selectedId : null;
    renderAll();
  }

  function syncSeqFromModels() {
    resistorSeq = resistors.reduce((m, r) => Math.max(m, r.rIndex), 0);
  }

  function applyTransform() {
    world.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  function snapWorldFallback(v) {
    return Math.round(v / CELL) * CELL;
  }

  function snapToIntersection(wx, wy) {
    if (!circuitGrid) {
      return { x: snapWorldFallback(wx), y: snapWorldFallback(wy) };
    }
    const ox = circuitGrid.offsetLeft;
    const oy = circuitGrid.offsetTop;
    const x = Math.round((wx - ox) / CELL) * CELL + ox;
    const y = Math.round((wy - oy) / CELL) * CELL + oy;
    return { x, y };
  }

  function closeAllMenus() {
    document.querySelectorAll(".menubar details.menu-root").forEach((d) => {
      d.open = false;
    });
  }

  /** Centre géométrique des deux jonctions (snap sur intersection) puis ancrage suivant orientation */
  function setAnchorFromMidpoint(mpx, mpy, orient, m) {
    const { x: sx, y: sy } = snapToIntersection(mpx, mpy);
    if (orient === "h") {
      m.jx = sx - SPAN_PX / 2;
      m.jy = sy;
    } else {
      m.jx = sx;
      m.jy = sy - SPAN_PX / 2;
    }
  }

  /** @param {Resistor} m */
  function midPoint(m) {
    if (m.orient === "h") return { x: m.jx + SPAN_PX / 2, y: m.jy };
    return { x: m.jx, y: m.jy + SPAN_PX / 2 };
  }

  /**
   * @param {SVGElement} svg
   * @param {Orient} orient
   */
  function drawResistorSymbol(svg, orient) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const NS = "http://www.w3.org/2000/svg";

    if (orient === "h") {
      const jxL = PAD_L;
      const jxR = PAD_L + SPAN_PX;
      const innerA = jxL + JOINT_R + JOINT_MARGIN;
      const innerB = jxR - JOINT_R - JOINT_MARGIN;
      const rectW = Math.min(RECT_W, Math.max(12, innerB - innerA));
      const mid = (innerA + innerB) / 2;
      const rx0 = mid - rectW / 2;
      const rx1 = mid + rectW / 2;
      const ry = 0;

      svg.setAttribute("viewBox", `-2 0 ${PACK_W} ${BODY_ROW_H}`);
      svg.setAttribute("width", String(PACK_W));
      svg.setAttribute("height", String(BODY_ROW_H));

      const lineL = lineSeg(NS, jxL + JOINT_R, CY, rx0, CY);
      const lineR = lineSeg(NS, rx1, CY, jxR - JOINT_R, CY);
      const box = rectEl(NS, rx0, ry, rectW, RECT_H);

      svg.appendChild(lineL);
      svg.appendChild(lineR);
      svg.appendChild(box);
      svg.appendChild(circ(NS, jxL, CY));
      svg.appendChild(circ(NS, jxR, CY));
    } else {
      const jyTop = PAD_L;
      const jyBot = PAD_L + SPAN_PX;
      const innerA = jyTop + JOINT_R + JOINT_MARGIN;
      const innerB = jyBot - JOINT_R - JOINT_MARGIN;
      const rectH = Math.min(RECT_W, Math.max(12, innerB - innerA));
      const midY = (innerA + innerB) / 2;
      const ry0 = midY - rectH / 2;
      const ry1 = midY + rectH / 2;
      const rx = 0;
      const CX = CELL / 2;

      svg.setAttribute("viewBox", `-2 0 ${BODY_ROW_H} ${PACK_W}`);
      svg.setAttribute("width", String(BODY_ROW_H));
      svg.setAttribute("height", String(PACK_W));

      const lineU = vertLine(NS, CX, jyTop + JOINT_R, CX, ry0);
      const lineD = vertLine(NS, CX, ry1, CX, jyBot - JOINT_R);
      const box = rectEl(NS, rx, ry0, RECT_H, rectH);

      svg.appendChild(lineU);
      svg.appendChild(lineD);
      svg.appendChild(box);
      svg.appendChild(circ(NS, CX, jyTop));
      svg.appendChild(circ(NS, CX, jyBot));
    }
  }

  function lineSeg(NS, x1, y1, x2, y2) {
    const ln = document.createElementNS(NS, "line");
    ln.setAttribute("class", "resistor-trace");
    ln.setAttribute("x1", String(x1));
    ln.setAttribute("y1", String(y1));
    ln.setAttribute("x2", String(x2));
    ln.setAttribute("y2", String(y2));
    return ln;
  }

  function vertLine(NS, x1, y1, x2, y2) {
    return lineSeg(NS, x1, y1, x2, y2);
  }

  function rectEl(NS, x, y, w, h) {
    const box = document.createElementNS(NS, "rect");
    box.setAttribute("class", "resistor-box");
    box.setAttribute("x", String(x));
    box.setAttribute("y", String(y));
    box.setAttribute("width", String(w));
    box.setAttribute("height", String(h));
    return box;
  }

  function circ(NS, cx, cy) {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("class", "resistor-joint");
    c.setAttribute("cx", String(cx));
    c.setAttribute("cy", String(cy));
    c.setAttribute("r", String(JOINT_R));
    return c;
  }

  /**
   * @param {HTMLElement} el
   * @param {Resistor} model
   */
  function layoutResistorDOM(el, model) {
    if (model.orient === "h") {
      el.classList.remove("resistor--v");
      el.style.minWidth = `${PACK_W}px`;
      el.style.minHeight = "";
      el.style.left = `${model.jx - PAD_L}px`;
      el.style.top = `${model.jy - JUNCTION_ROW_OFFSET_TOP}px`;
    } else {
      el.classList.add("resistor--v");
      el.style.minWidth = "";
      el.style.minHeight = `${PACK_W}px`;
      const cxMid = CELL / 2;
      const leftOffset = model.jx - (V_LABEL_SLOT + V_LABEL_GAP + cxMid);
      const topOffset = model.jy - PAD_L;
      el.style.left = `${leftOffset}px`;
      el.style.top = `${topOffset}px`;
    }
  }

  /** @param {Resistor | { rIndex: number; orient?: Orient }} data */
  function buildResistorElement(data, ghost) {
    const orient =
      /** @type Orient */ ("orient" in data && data.orient === "v" ? "v" : "h");
    const rIndex =
      /** @type {number} */
      ("rIndex" in data ? data.rIndex : resistorSeq + 1);
    const id = ghost ? "" : /** @type {Resistor} */ (data).id;

    const root = document.createElement("div");
    root.className = ghost ? "resistor resistor--ghost" : "resistor";
    if (!ghost && id) root.dataset.sid = id;
    root.dataset.orient = orient;

    const idEl = document.createElement("div");
    idEl.className = "resistor-id";
    idEl.textContent = `R${rIndex}`;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "resistor-symbol");
    drawResistorSymbol(svg, orient);

    const valEl = document.createElement("div");
    valEl.className = "resistor-value";
    valEl.textContent = `1000${OHM}`;

    root.appendChild(idEl);
    root.appendChild(svg);
    root.appendChild(valEl);

    if (!ghost && "jx" in data) {
      layoutResistorDOM(root, /** @type {Resistor} */ (data));
      if (selectedId === id) root.classList.add("resistor--selected");
      root.addEventListener("pointerdown", onPlacedResistorPointerDown);
    } else if (ghost && orient === "h") {
      root.style.minWidth = `${PACK_W}px`;
    } else if (ghost && orient === "v") {
      root.style.minHeight = `${PACK_W}px`;
    }

    return root;
  }

  function renderAll() {
    componentsLayer.replaceChildren(
      ...resistors.map((m) => buildResistorElement(m, false))
    );
  }

  /** @param {string | null | undefined} id */
  function getModel(id) {
    return resistors.find((r) => r.id === id);
  }

  function clientToWorld(cx, cy) {
    const rect = stage.getBoundingClientRect();
    const mx = cx - rect.left;
    const my = cy - rect.top;
    return { wx: (mx - tx) / scale, wy: (my - ty) / scale };
  }

  /** @param {PointerEvent} e */
  function onPlacedResistorPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (dragGhost) return;
    const el = e.currentTarget;
    if (!(el instanceof HTMLElement) || !el.dataset.sid) return;
    e.stopPropagation();

    selectedId = el.dataset.sid;
    renderAll();

    if (pointerId !== null) {
      try {
        stage.releasePointerCapture(pointerId);
      } catch (_) {}
      pointerId = null;
      stage.classList.remove("dragging");
    }

    const model = getModel(selectedId);
    if (!model) return;

    const { wx, wy } = clientToWorld(e.clientX, e.clientY);

    resistorMoveSession = {
      sid: selectedId,
      pointerId: e.pointerId,
      jx0: model.jx,
      jy0: model.jy,
      anchorWx: wx,
      anchorWy: wy,
      baselineJson: snapshot(),
      moved: false,
    };
    el.classList.add("resistor--dragging");
    try {
      el.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  /** @param {PointerEvent} e */
  function onWindowResistorMove(e) {
    if (!resistorMoveSession || resistorMoveSession.pointerId !== e.pointerId) return;
    const model = getModel(resistorMoveSession.sid);
    if (!model) return;

    const { wx, wy } = clientToWorld(e.clientX, e.clientY);
    const dwx = wx - resistorMoveSession.anchorWx;
    const dwy = wy - resistorMoveSession.anchorWy;
    resistorMoveSession.moved =
      resistorMoveSession.moved || Math.abs(dwx) > 0.25 || Math.abs(dwy) > 0.25;

    const s = snapToIntersection(
      resistorMoveSession.jx0 + dwx,
      resistorMoveSession.jy0 + dwy
    );
    model.jx = s.x;
    model.jy = s.y;

    const tel =
      typeof CSS !== "undefined" && CSS.escape
        ? componentsLayer.querySelector(`[data-sid="${CSS.escape(resistorMoveSession.sid)}"]`)
        : componentsLayer.querySelector(`[data-sid="${resistorMoveSession.sid}"]`);
    if (tel) layoutResistorDOM(tel, model);
  }

  /** @param {string} sid */
  function findEl(sid) {
    return typeof CSS !== "undefined" && CSS.escape
      ? componentsLayer.querySelector(`[data-sid="${CSS.escape(sid)}"]`)
      : componentsLayer.querySelector(`[data-sid="${sid}"]`);
  }

  /** @param {PointerEvent} e */
  function onWindowResistorUp(e) {
    if (!resistorMoveSession || resistorMoveSession.pointerId !== e.pointerId) return;
    const sid = resistorMoveSession.sid;
    const baselineJson = resistorMoveSession.baselineJson;
    const moved = resistorMoveSession.moved;
    try {
      const el = findEl(sid);
      el?.releasePointerCapture(e.pointerId);
      el?.classList.remove("resistor--dragging");
    } catch (_) {}

    resistorMoveSession = null;

    if (moved && baselineJson !== snapshot()) {
      undoStack.push(baselineJson);
      redoStack.length = 0;
    }
    renderAll();
  }

  function recordPointerWorld(cx, cy) {
    Object.assign(lastPointerWorld, clientToWorld(cx, cy));
  }

  function removeSelected() {
    if (!selectedId) return;
    commit(() => {
      resistors = resistors.filter((r) => r.id !== selectedId);
      selectedId = null;
    });
  }

  function rotateSelected() {
    const m = getModel(selectedId);
    if (!m) return;
    commit(() => {
      const mp = midPoint(m);
      const nextOrient = /** @type Orient */ (m.orient === "h" ? "v" : "h");
      m.orient = nextOrient;
      setAnchorFromMidpoint(mp.x, mp.y, m.orient, m);
    });
  }

  /** @param {KeyboardEvent} e */
  function onKeyDown(e) {
    const t = e.target;
    if (
      t instanceof HTMLInputElement ||
      t instanceof HTMLTextAreaElement ||
      /** @type {HTMLElement} */ (t).isContentEditable
    ) {
      return;
    }

    const mod = e.ctrlKey || e.metaKey;

    if (mod && !e.altKey && (e.code === "KeyZ" || e.key?.toLowerCase() === "z")) {
      if (e.shiftKey) redo();
      else undo();
      e.preventDefault();
      return;
    }

    if (mod && !e.altKey && e.code === "KeyY") {
      redo();
      e.preventDefault();
      return;
    }

    if (mod && e.code === "KeyC") {
      const m = getModel(selectedId);
      if (m) {
        clipboardTpl = { orient: m.orient };
        e.preventDefault();
      }
      return;
    }

    if (mod && e.code === "KeyV") {
      if (!clipboardTpl) return;
      e.preventDefault();
      commit(() => {
        resistorSeq += 1;
        const nw = /** @type {Resistor} */ ({
          id: uid(),
          rIndex: resistorSeq,
          orient: clipboardTpl.orient,
          jx: 0,
          jy: 0,
        });
        placeModelAtPastePoint(nw);
        resistors.push(nw);
        selectedId = nw.id;
      });
      return;
    }

    if (e.code === "Delete") {
      if (selectedId) {
        removeSelected();
        e.preventDefault();
      }
      return;
    }

    if (e.code === "KeyR" && !mod && !e.altKey) {
      const m = getModel(selectedId);
      if (!m) return;
      rotateSelected();
      e.preventDefault();
    }
  }

  /** @param {Resistor} m */
  function placeModelAtPastePoint(m) {
    const { wx, wy } = lastPointerWorld;
    if (m.orient === "h") {
      const p = snapToIntersection(wx - SPAN_PX / 2, wy);
      m.jx = p.x;
      m.jy = p.y;
    } else {
      const pTop = snapToIntersection(wx, wy - SPAN_PX / 2);
      m.jx = pTop.x;
      m.jy = pTop.y;
    }
  }

  function updateGhostPosition(clientX, clientY) {
    if (!dragGhost) return;
    dragGhost.style.left = `${clientX}px`;
    dragGhost.style.top = `${clientY}px`;
  }

  function removeResistorGhost() {
    dragGhost?.remove();
    dragGhost = null;
    resistorPickPointerId = null;
    document.body.classList.remove("is-dragging-resistor");
  }

  /** @param {PointerEvent} e */
  function onPickResistorDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (dragGhost) return;

    closeAllMenus();

    resistorPickPointerId = e.pointerId;

    /** @type {Orient} orientation du fantôme : copie dernier Ctrl+C sinon horizontal */
    const paletteOrient =
      clipboardTpl?.orient ?? /** @type {Orient} */ ("h");
    dragGhost = buildResistorElement(
      {
        id: "_ghost",
        rIndex: resistorSeq + 1,
        orient: paletteOrient,
        jx: 0,
        jy: 0,
      },
      true
    );
    dragGhost.dataset.orient = paletteOrient;
    dragGhost.style.minWidth =
      paletteOrient === "h" ? `${PACK_W}px` : "";
    dragGhost.style.minHeight =
      paletteOrient === "v" ? `${PACK_W}px` : "";

    document.body.appendChild(dragGhost);
    document.body.classList.add("is-dragging-resistor");
    dragGhost.style.left = `${e.clientX}px`;
    dragGhost.style.top = `${e.clientY}px`;
    dragGhost.style.transform = "translate(-50%, -50%)";

    window.addEventListener("pointermove", onResistorPaletteDragMove);
    window.addEventListener("pointerup", onResistorPaletteDragUp);
    window.addEventListener("pointercancel", onResistorPaletteDragUp);

    try {
      pickResistorBtn.setPointerCapture(e.pointerId);
    } catch (_) {}
    e.preventDefault();
  }

  /** @param {PointerEvent} e */
  function onResistorPaletteDragMove(e) {
    if (resistorPickPointerId !== e.pointerId) return;
    updateGhostPosition(e.clientX, e.clientY);
  }

  /** @param {PointerEvent} e */
  function onResistorPaletteDragUp(e) {
    if (resistorPickPointerId !== e.pointerId) return;

    window.removeEventListener("pointermove", onResistorPaletteDragMove);
    window.removeEventListener("pointerup", onResistorPaletteDragUp);
    window.removeEventListener("pointercancel", onResistorPaletteDragUp);

    try {
      pickResistorBtn.releasePointerCapture(e.pointerId);
    } catch (_) {}

    const srect = stage.getBoundingClientRect();
    const { clientX: cx, clientY: cy } = e;
    const overStage =
      cx >= srect.left && cx <= srect.right && cy >= srect.top && cy <= srect.bottom;

    if (overStage) {
      const palettePlaceOrient =
        clipboardTpl?.orient ?? /** @type {Orient} */ ("h");
      const { wx, wy } = clientToWorld(cx, cy);
      commit(() => {
        resistorSeq += 1;
        const nw = /** @type {Resistor} */ ({
          id: uid(),
          rIndex: resistorSeq,
          orient: palettePlaceOrient,
          jx: 0,
          jy: 0,
        });
        const pMid = snapToIntersection(wx, wy);
        if (palettePlaceOrient === "h") {
          nw.jx = pMid.x - SPAN_PX / 2;
          nw.jy = pMid.y;
        } else {
          nw.jx = pMid.x;
          nw.jy = pMid.y - SPAN_PX / 2;
        }
        resistors.push(nw);
        selectedId = nw.id;
      });
    }

    removeResistorGhost();
  }

  function onPanPointerDown(e) {
    if (dragGhost) return;
    if (e.button !== undefined && e.button !== 0) return;

    if (!e.target.closest(".resistor")) {
      selectedId = null;
      renderAll();
    }

    pointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    stage.classList.add("dragging");
    stage.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onPanPointerMove(e) {
    recordPointerWorld(e.clientX, e.clientY);
    if (pointerId !== e.pointerId) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    tx += dx;
    ty += dy;
    applyTransform();
  }

  /** @param {WheelEvent} e */
  function onWheel(e) {
    e.preventDefault();
    recordPointerWorld(e.clientX, e.clientY);

    const rect = stage.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= 100;

    const oldScale = scale;
    let newScale = oldScale * Math.exp(-dy * 0.0015);
    newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
    if (newScale === oldScale) return;

    const wx = (mx - tx) / oldScale;
    const wy = (my - ty) / oldScale;
    tx = mx - wx * newScale;
    ty = my - wy * newScale;
    scale = newScale;
    applyTransform();
  }

  window.addEventListener("pointermove", onWindowResistorMove);
  window.addEventListener("pointerup", onWindowResistorUp);
  window.addEventListener("pointercancel", onWindowResistorUp);

  stage.addEventListener("pointermove", (e) => recordPointerWorld(e.clientX, e.clientY));

  pickResistorBtn.addEventListener("pointerdown", onPickResistorDown);

  stage.addEventListener("pointerdown", onPanPointerDown);
  stage.addEventListener("pointermove", onPanPointerMove);
  stage.addEventListener("pointerup", endPanDrag);
  stage.addEventListener("pointercancel", endPanDrag);
  stage.addEventListener("lostpointercapture", () => {
    pointerId = null;
    stage.classList.remove("dragging");
  });
  stage.addEventListener("wheel", onWheel, { passive: false });

  window.addEventListener("keydown", onKeyDown);

  function endPanDrag(ev) {
    if (pointerId !== ev.pointerId) return;
    pointerId = null;
    stage.classList.remove("dragging");
    try {
      stage.releasePointerCapture(ev.pointerId);
    } catch (_) {}
  }

  applyTransform();

  document.querySelectorAll(".menubar details.menu-root").forEach((root) => {
    root.addEventListener("toggle", () => {
      if (!root.open) return;
      document.querySelectorAll(".menubar details.menu-root").forEach((other) => {
        if (other !== root) other.open = false;
      });
    });
  });
})();
