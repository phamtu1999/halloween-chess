/**
 * Halloween 3D Chess — Professional WebSocket Client & Game Engine
 */

const chess = new Chess();
let gameMode = 'ai'; // 'ai', 'pvp', 'online'
let aiDifficulty = 2; // 1: Easy, 2: Med, 3: Hard
let playerSideAI = 'w'; // 'w' (White) or 'b' (Black)
let soundEnabled = true;
let isAnimating = false;
let pendingPromotion = null;

// Online Multiplayer state via WebRTC P2P (PeerJS - 100% Serverless)
let peer = null;
let peerConn = null;
let isHost = false;
let clockInterval = null;
let hostColorPref = 'random';
let currentRoomId = null;
let myOnlineColor = 'w'; // 'w' or 'b'
let whitePlayerName = 'Trắng';
let blackPlayerName = 'Đen';
let onlineActive = false;

// Timers
let whiteRemaining = 300;
let blackRemaining = 300;
let timeControl = 300;

const SQUARE_SIZE = 0.5;
const BOARD_OFFSET = 3.5;
const PIECE_Y = 0.08;

let scene, camera, renderer, controls;
let raycaster, mouse;
let boardGroup, piecesGroup, markersGroup, fxGroup;

const models = {};
const pieceInstances = {};

let selectedSquare = null;
let validMoves = [];

// ── Sound Synth ──────────────────────────────────────────────────────────────
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
  if (!audioCtx) audioCtx = new AudioContext();
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    initAudio();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'select') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.08);
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
      osc.start(t);
      osc.stop(t + 0.08);
    } else if (type === 'move') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.15);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
      osc.start(t);
      osc.stop(t + 0.15);
    } else if (type === 'capture') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.linearRampToValueAtTime(40, t + 0.25);
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
      osc.start(t);
      osc.stop(t + 0.25);
    } else if (type === 'check') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(580, t);
      osc.frequency.exponentialRampToValueAtTime(280, t + 0.3);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
      osc.start(t);
      osc.stop(t + 0.3);
    } else if (type === 'win') {
      [440, 554, 659, 880].forEach((freq, i) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.connect(g);
        g.connect(audioCtx.destination);
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.25, t + i * 0.15);
        g.gain.exponentialRampToValueAtTime(0.01, t + i * 0.15 + 0.4);
        o.start(t + i * 0.15);
        o.stop(t + i * 0.15 + 0.4);
      });
    }
  } catch (e) {}
}

// ── Custom Toast & Dialog System (100% Native-Popup Free) ───────────────────
function showToast(text, type = 'info', icon = '🎃') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-msg ${type}`;
  
  const iconSpan = document.createElement('span');
  iconSpan.style.fontSize = '16px';
  iconSpan.textContent = icon;
  
  const textSpan = document.createElement('span');
  textSpan.textContent = ' ' + text;
  
  toast.appendChild(iconSpan);
  toast.appendChild(textSpan);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(120%)';
    setTimeout(() => toast.remove(), 400);
  }, 3200);
}

function showCustomAlert(title, message, icon = '🎃') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('custom-dialog-overlay');
    const titleEl = document.getElementById('dialog-title');
    const msgEl = document.getElementById('dialog-message');
    const inputCont = document.getElementById('dialog-input-container');
    const cancelBtn = document.getElementById('dialog-cancel-btn');
    const confirmBtn = document.getElementById('dialog-confirm-btn');

    titleEl.textContent = `${icon} ${title}`;
    msgEl.textContent = message;
    inputCont.style.display = 'none';
    cancelBtn.style.display = 'none';
    confirmBtn.textContent = 'Đã hiểu';

    overlay.style.display = 'flex';

    confirmBtn.onclick = () => {
      overlay.style.display = 'none';
      resolve(true);
    };
  });
}

function showCustomConfirm(title, message, icon = '⚠️', confirmText = 'Đồng ý', cancelText = 'Hủy bỏ') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('custom-dialog-overlay');
    const titleEl = document.getElementById('dialog-title');
    const msgEl = document.getElementById('dialog-message');
    const inputCont = document.getElementById('dialog-input-container');
    const cancelBtn = document.getElementById('dialog-cancel-btn');
    const confirmBtn = document.getElementById('dialog-confirm-btn');

    titleEl.textContent = `${icon} ${title}`;
    msgEl.textContent = message;
    inputCont.style.display = 'none';
    cancelBtn.style.display = 'inline-block';
    cancelBtn.textContent = cancelText;
    confirmBtn.textContent = confirmText;

    overlay.style.display = 'flex';

    confirmBtn.onclick = () => {
      overlay.style.display = 'none';
      resolve(true);
    };

    cancelBtn.onclick = () => {
      overlay.style.display = 'none';
      resolve(false);
    };
  });
}

function showCustomPrompt(title, message, placeholder = 'HLW-XXXX', defaultVal = '', icon = '🔑') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('custom-dialog-overlay');
    const titleEl = document.getElementById('dialog-title');
    const msgEl = document.getElementById('dialog-message');
    const inputCont = document.getElementById('dialog-input-container');
    const input = document.getElementById('dialog-input');
    const cancelBtn = document.getElementById('dialog-cancel-btn');
    const confirmBtn = document.getElementById('dialog-confirm-btn');

    titleEl.textContent = `${icon} ${title}`;
    msgEl.textContent = message;
    inputCont.style.display = 'block';
    input.placeholder = placeholder;
    input.value = defaultVal;
    cancelBtn.style.display = 'inline-block';
    cancelBtn.textContent = 'Hủy bỏ';
    confirmBtn.textContent = 'Vào phòng';

    overlay.style.display = 'flex';
    setTimeout(() => input.focus(), 60);

    const submit = () => {
      const val = input.value.trim();
      overlay.style.display = 'none';
      resolve(val || null);
    };

    confirmBtn.onclick = submit;
    input.onkeydown = (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') {
        overlay.style.display = 'none';
        resolve(null);
      }
    };

    cancelBtn.onclick = () => {
      overlay.style.display = 'none';
      resolve(null);
    };
  });
}

// ── Coordinate Mapping ───────────────────────────────────────────────────────
function squareToCoords(sq) {
  const col = sq.charCodeAt(0) - 97;
  const row = parseInt(sq[1]) - 1;
  return { col, row };
}

function squareToWorld(sq) {
  const { col, row } = squareToCoords(sq);
  const x = (col - BOARD_OFFSET) * SQUARE_SIZE;
  const z = -(row - BOARD_OFFSET) * SQUARE_SIZE;
  return new THREE.Vector3(x, PIECE_Y, z);
}

function worldToSquare(worldPos) {
  const col = Math.round(worldPos.x / SQUARE_SIZE + BOARD_OFFSET);
  const row = Math.round(-worldPos.z / SQUARE_SIZE + BOARD_OFFSET);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  return String.fromCharCode(97 + col) + (row + 1);
}

function initScene() {
  const canvas = document.getElementById('webgl-canvas');
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0610);
  scene.fog = new THREE.FogExp2(0x0a0610, 0.05);

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 - 0.05;
  controls.minDistance = 2.5;
  controls.maxDistance = 15;
  controls.target.set(0, 0.2, 0);

  setCameraPreset('persp');

  boardGroup = new THREE.Group();
  piecesGroup = new THREE.Group();
  markersGroup = new THREE.Group();
  fxGroup = new THREE.Group();
  scene.add(boardGroup);
  scene.add(piecesGroup);
  scene.add(markersGroup);
  scene.add(fxGroup);

  const ambient = new THREE.AmbientLight(0x28183c, 1.2);
  scene.add(ambient);

  const torchKey = new THREE.DirectionalLight(0xff7b1a, 2.2);
  torchKey.position.set(4, 6, 5);
  torchKey.castShadow = true;
  torchKey.shadow.mapSize.width = 1024;
  torchKey.shadow.mapSize.height = 1024;
  scene.add(torchKey);

  const moonFill = new THREE.DirectionalLight(0x8a2be2, 1.4);
  moonFill.position.set(-5, 4, -4);
  scene.add(moonFill);

  const toxicRim = new THREE.PointLight(0x2bf4c3, 2.0, 10);
  toxicRim.position.set(0, 4, -4.5);
  scene.add(toxicRim);

  createEmbers();

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  window.addEventListener('resize', onWindowResize);
  canvas.addEventListener('pointerdown', onCanvasClick);
}

function createEmbers() {
  const count = 120;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * 10;
    positions[i + 1] = Math.random() * 4;
    positions[i + 2] = (Math.random() - 0.5) * 10;
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xff7b1a,
    size: 0.06,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending
  });
  const points = new THREE.Points(geom, mat);
  fxGroup.add(points);
}

const modelFiles = {
  board: 'models 3d glb/board.glb',
  p_w: 'models 3d glb/pawn_w.glb',
  p_b: 'models 3d glb/pawn_b.glb',
  r_w: 'models 3d glb/rook_w.glb',
  r_b: 'models 3d glb/rook_b.glb',
  n_w: 'models 3d glb/knight_w.glb',
  n_b: 'models 3d glb/knight_b.glb',
  b_w: 'models 3d glb/bishop_w.glb',
  b_b: 'models 3d glb/bishop_b.glb',
  q_w: 'models 3d glb/queen_w.glb',
  q_b: 'models 3d glb/queen_b.glb',
  k_w: 'models 3d glb/king_w.glb',
  k_b: 'models 3d glb/king_b.glb',
};

function loadAllModels() {
  const loader = new THREE.GLTFLoader();
  const total = Object.keys(modelFiles).length;
  let loaded = 0;

  const progressBar = document.getElementById('progress-bar');
  const loadingText = document.getElementById('loading-text');

  Object.entries(modelFiles).forEach(([key, path]) => {
    loader.load(
      path,
      (gltf) => {
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        models[key] = gltf.scene;
        loaded++;
        const pct = Math.round((loaded / total) * 100);
        if (progressBar) progressBar.style.width = pct + '%';
        if (loadingText) loadingText.textContent = `Đang tải mô hình 3D... (${loaded}/${total})`;

        if (loaded === total) {
          setTimeout(onModelsReady, 400);
        }
      },
      undefined,
      (err) => console.error('Error loading', path, err)
    );
  });
}

function onModelsReady() {
  const screen = document.getElementById('loading-screen');
  if (screen) {
    screen.style.opacity = '0';
    setTimeout(() => screen.style.display = 'none', 600);
  }

  if (models.board) {
    boardGroup.add(models.board);
  }

  createBoardClickPlane();
  syncBoardFromChess();
  updateUI();

  checkUrlParams();
}

function createBoardClickPlane() {
  const geom = new THREE.PlaneGeometry(SQUARE_SIZE * 8, SQUARE_SIZE * 8);
  const mat = new THREE.MeshBasicMaterial({ visible: false });
  const plane = new THREE.Mesh(geom, mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = PIECE_Y;
  plane.name = "BoardClickPlane";
  boardGroup.add(plane);
}

function syncBoardFromChess() {
  while (piecesGroup.children.length > 0) {
    piecesGroup.remove(piecesGroup.children[0]);
  }
  Object.keys(pieceInstances).forEach(k => delete pieceInstances[k]);

  const boardState = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = boardState[r][c];
      if (piece) {
        const sq = String.fromCharCode(97 + c) + (8 - r);
        spawnPiece(piece.type, piece.color, sq);
      }
    }
  }
}

function spawnPiece(type, color, square) {
  const modelKey = `${type}_${color}`;
  const proto = models[modelKey];
  if (!proto) return;

  const clone = proto.clone(true);
  const pos = squareToWorld(square);
  clone.position.copy(pos);

  if (color === 'w') {
    clone.rotation.y = 0;
  } else {
    clone.rotation.y = Math.PI;
  }

  clone.userData = { square, type, color };
  piecesGroup.add(clone);
  pieceInstances[square] = clone;
}

function onCanvasClick(e) {
  if (isAnimating) return;
  if (gameMode === 'ai') {
    const aiColor = (playerSideAI === 'w') ? 'b' : 'w';
    if (chess.turn() === aiColor) return; // AI turn
  }
  if (gameMode === 'online') {
    if (!onlineActive) return;
    if (chess.turn() !== myOnlineColor) return;
  }

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects([...piecesGroup.children, ...boardGroup.children], true);
  if (intersects.length === 0) {
    clearSelection();
    return;
  }

  const hit = intersects[0];
  let clickedSq = null;

  let pObj = hit.object;
  while (pObj && pObj.parent && pObj.parent !== piecesGroup) {
    pObj = pObj.parent;
  }

  if (pObj && pObj.userData && pObj.userData.square) {
    clickedSq = pObj.userData.square;
  } else if (hit.point) {
    clickedSq = worldToSquare(hit.point);
  }

  if (!clickedSq) {
    clearSelection();
    return;
  }

  handleSquareClick(clickedSq);
}

function handleSquareClick(sq) {
  const currentTurn = chess.turn();

  if (selectedSquare) {
    const move = validMoves.find(m => m.to === sq);
    if (move) {
      if (move.flags.includes('p')) {
        promptPromotion(selectedSquare, sq);
        return;
      }
      executeMove(selectedSquare, sq, 'q', true);
      clearSelection();
      return;
    }
  }

  const pieceAtSq = chess.get(sq);
  if (pieceAtSq && pieceAtSq.color === currentTurn) {
    if (gameMode === 'online' && pieceAtSq.color !== myOnlineColor) return;
    if (gameMode === 'ai' && pieceAtSq.color !== playerSideAI) return;

    selectSquare(sq);
    playSound('select');
  } else {
    clearSelection();
  }
}

function selectSquare(sq) {
  selectedSquare = sq;
  validMoves = chess.moves({ square: sq, verbose: true });
  renderMarkers();
}

function clearSelection() {
  selectedSquare = null;
  validMoves = [];
  renderMarkers();
}

function renderMarkers() {
  while (markersGroup.children.length > 0) {
    markersGroup.remove(markersGroup.children[0]);
  }

  if (!selectedSquare) return;

  const selPos = squareToWorld(selectedSquare);
  const selRing = createRingMarker(selPos, 0xf4c042, 0.22);
  markersGroup.add(selRing);

  validMoves.forEach((m) => {
    const targetPos = squareToWorld(m.to);
    const isCapture = m.captured || m.flags.includes('e');
    const color = isCapture ? 0xf42b42 : 0x2bf4c3;
    const marker = isCapture ? createCaptureMarker(targetPos, color) : createDotMarker(targetPos, color);
    markersGroup.add(marker);
  });
}

function createRingMarker(pos, color, radius) {
  const geom = new THREE.RingGeometry(radius * 0.75, radius, 32);
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(pos.x, PIECE_Y + 0.005, pos.z);
  return mesh;
}

function createDotMarker(pos, color) {
  const geom = new THREE.CircleGeometry(0.08, 24);
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(pos.x, PIECE_Y + 0.005, pos.z);
  return mesh;
}

function createCaptureMarker(pos, color) {
  const geom = new THREE.RingGeometry(0.16, 0.22, 24);
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(pos.x, PIECE_Y + 0.005, pos.z);
  return mesh;
}

function executeMove(from, to, promo = 'q', broadcast = false) {
  const pieceObj = pieceInstances[from];
  let victimSquare = to;
  const moveResult = chess.move({ from, to, promotion: promo });

  if (!moveResult) return;

  if (moveResult.flags.includes('e')) {
    victimSquare = to[0] + from[1];
  }
  const victimObj = pieceInstances[victimSquare];

  if (broadcast && gameMode === 'online') {
    sendPeerMsg({
      type: 'move',
      from,
      to,
      promo,
      white_time: whiteRemaining,
      black_time: blackRemaining
    });
  }

  isAnimating = true;
  clearSelection();

  const startPos = squareToWorld(from);
  const endPos = squareToWorld(to);
  const duration = 280;
  const startTime = performance.now();

  if (moveResult.captured) {
    playSound('capture');
    if (victimObj) {
      delete pieceInstances[victimSquare];
      animateCapture(victimObj);
    }
  } else {
    playSound('move');
  }

  if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) {
    handleCastlingRook(moveResult);
  }

  function animateMove(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);

    const currentX = THREE.MathUtils.lerp(startPos.x, endPos.x, t);
    const currentZ = THREE.MathUtils.lerp(startPos.z, endPos.z, t);
    const jumpH = Math.sin(t * Math.PI) * 0.45;

    if (pieceObj) {
      pieceObj.position.set(currentX, PIECE_Y + jumpH, currentZ);
    }

    if (t < 1) {
      requestAnimationFrame(animateMove);
    } else {
      if (pieceObj) {
        pieceObj.position.copy(endPos);
        pieceObj.userData.square = to;
      }
      delete pieceInstances[from];
      pieceInstances[to] = pieceObj;

      if (moveResult.flags.includes('p')) {
        if (pieceObj) piecesGroup.remove(pieceObj);
        spawnPiece(promo, moveResult.color, to);
      }

      isAnimating = false;
      onMoveCompleted();
    }
  }

  requestAnimationFrame(animateMove);
}

function handleCastlingRook(moveResult) {
  let rFrom, rTo;
  if (moveResult.to === 'g1') { rFrom = 'h1'; rTo = 'f1'; }
  else if (moveResult.to === 'c1') { rFrom = 'a1'; rTo = 'd1'; }
  else if (moveResult.to === 'g8') { rFrom = 'h8'; rTo = 'f8'; }
  else if (moveResult.to === 'c8') { rFrom = 'a8'; rTo = 'd8'; }

  const rookObj = pieceInstances[rFrom];
  if (rookObj) {
    const rEndPos = squareToWorld(rTo);
    rookObj.position.copy(rEndPos);
    rookObj.userData.square = rTo;
    delete pieceInstances[rFrom];
    pieceInstances[rTo] = rookObj;
  }
}

function animateCapture(victimObj) {
  const startTime = performance.now();
  const dur = 200;
  function shrink(now) {
    const t = (now - startTime) / dur;
    if (t < 1) {
      const s = 1 - t;
      victimObj.scale.set(s, s, s);
      victimObj.position.y = PIECE_Y - t * 0.3;
      requestAnimationFrame(shrink);
    } else {
      piecesGroup.remove(victimObj);
    }
  }
  requestAnimationFrame(shrink);
}

function onMoveCompleted() {
  updateUI();

  if (chess.in_checkmate()) {
    playSound('win');
    const winner = chess.turn() === 'w' ? 'Đen (Obsidian)' : 'Trắng (Ghost Bone)';
    showBanner('CHIẾN THẮNG!', `${winner} đã chiếu bí đối thủ!`, true);
    return;
  }

  if (chess.in_draw() || chess.in_stalemate()) {
    showBanner('HÒA CỜ!', 'Ván cờ kết thúc với kết quả hòa.', true);
    return;
  }

  if (chess.in_check()) {
    playSound('check');
  }

  // Trigger AI if applicable
  if (gameMode === 'ai') {
    const aiColor = (playerSideAI === 'w') ? 'b' : 'w';
    if (chess.turn() === aiColor) {
      const statusEl = document.getElementById('ai-status-text');
      if (statusEl) statusEl.textContent = '🔮 Lich King đang tính nước đi...';
      setTimeout(makeAIMove, 400);
    } else {
      const statusEl = document.getElementById('ai-status-text');
      if (statusEl) statusEl.textContent = '✨ Lượt của bạn — Hãy ra đòn!';
    }
  }
}

// ── AI Engine (Minimax + Positional Evaluation) ──────────────────────────────
const pieceValues = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const pawnTable = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5,  5, 10, 25, 25, 10,  5,  5],
  [0,  0,  0, 20, 20,  0,  0,  0],
  [5, -5,-10,  0,  0,-10, -5,  5],
  [5, 10, 10,-20,-20, 10, 10,  5],
  [0,  0,  0,  0,  0,  0,  0,  0]
];

function evaluateBoard() {
  let score = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p) {
        let val = pieceValues[p.type];
        if (p.type === 'p') {
          val += (p.color === 'w' ? pawnTable[r][c] : pawnTable[7 - r][c]);
        }
        score += (p.color === 'w' ? val : -val);
      }
    }
  }
  return score;
}

function minimax(depth, isMax, alpha, beta) {
  if (depth === 0 || chess.game_over()) {
    return evaluateBoard();
  }

  const moves = chess.moves({ verbose: true });
  if (isMax) {
    let maxEval = -Infinity;
    for (let m of moves) {
      chess.move(m);
      let ev = minimax(depth - 1, false, alpha, beta);
      chess.undo();
      maxEval = Math.max(maxEval, ev);
      alpha = Math.max(alpha, ev);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (let m of moves) {
      chess.move(m);
      let ev = minimax(depth - 1, true, alpha, beta);
      chess.undo();
      minEval = Math.min(minEval, ev);
      beta = Math.min(beta, ev);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function getBestMove(depth, forColor) {
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return null;

  let bestMove = null;
  const isWhite = (forColor === 'w');
  let bestVal = isWhite ? -Infinity : Infinity;

  for (let m of moves) {
    chess.move(m);
    let val = minimax(depth - 1, !isWhite, -Infinity, Infinity);
    chess.undo();

    if (isWhite) {
      if (val > bestVal) { bestVal = val; bestMove = m; }
    } else {
      if (val < bestVal) { bestVal = val; bestMove = m; }
    }
  }
  return bestMove;
}

function makeAIMove() {
  if (chess.game_over()) return;
  const moves = chess.moves({ verbose: true });
  if (moves.length === 0) return;

  const aiColor = (playerSideAI === 'w') ? 'b' : 'w';
  let bestMove = null;

  if (aiDifficulty === 1) {
    const captures = moves.filter(m => m.captured);
    bestMove = (captures.length > 0 && Math.random() > 0.4) 
      ? captures[Math.floor(Math.random() * captures.length)] 
      : moves[Math.floor(Math.random() * moves.length)];
  } else {
    const depth = aiDifficulty === 2 ? 2 : 3;
    bestMove = getBestMove(depth, aiColor);
  }

  if (bestMove) {
    executeMove(bestMove.from, bestMove.to, bestMove.promotion || 'q');
  }
}

// ── Promotion Dialog ─────────────────────────────────────────────────────────
function promptPromotion(from, to) {
  pendingPromotion = { from, to };
  const modal = document.getElementById('banner-modal');
  const title = document.getElementById('banner-title');
  const desc = document.getElementById('banner-desc');
  const promoContainer = document.getElementById('promo-container');
  const btnRow = document.getElementById('modal-btn-row');

  title.textContent = 'PHONG CẤP TỐT';
  desc.textContent = 'Chọn quân cờ ma quái để biến hình:';
  promoContainer.style.display = 'flex';
  btnRow.style.display = 'none';
  modal.style.display = 'block';
}

document.querySelectorAll('.promo-btn').forEach(btn => {
  btn.onclick = () => {
    const promoPiece = btn.dataset.piece;
    document.getElementById('banner-modal').style.display = 'none';
    if (pendingPromotion) {
      executeMove(pendingPromotion.from, pendingPromotion.to, promoPiece, true);
      pendingPromotion = null;
    }
  };
});

function showBanner(titleText, descText, showRematch = false) {
  const modal = document.getElementById('banner-modal');
  const title = document.getElementById('banner-title');
  const desc = document.getElementById('banner-desc');
  const promoContainer = document.getElementById('promo-container');
  const btnRow = document.getElementById('modal-btn-row');
  const rematchBtn = document.getElementById('banner-rematch-btn');

  title.textContent = titleText;
  desc.textContent = descText;
  promoContainer.style.display = 'none';
  btnRow.style.display = 'flex';
  rematchBtn.style.display = (showRematch && gameMode === 'online') ? 'inline-block' : 'none';
  modal.style.display = 'block';
}

document.getElementById('banner-ok-btn').onclick = () => {
  document.getElementById('banner-modal').style.display = 'none';
};

document.getElementById('banner-rematch-btn').onclick = () => {
  document.getElementById('banner-modal').style.display = 'none';
  if (gameMode === 'online') {
    sendPeerMsg({ type: 'rematch_request' });
    addChatMessage('Hệ thống', 'Đã gửi yêu cầu tái đấu...', 'sys');
    showToast('Đã gửi lời mời tái đấu tới đối thủ!', 'info', '🔄');
  }
};

function formatTime(seconds) {
  if (seconds === 0 || seconds == null) return "∞";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateUI() {
  const turnBadge = document.getElementById('turn-display');
  const turnText = document.getElementById('turn-text');
  const isWhite = chess.turn() === 'w';

  turnBadge.className = 'turn-badge ' + (isWhite ? 'white' : 'black');
  if (gameMode === 'online') {
    const isMe = (isWhite && myOnlineColor === 'w') || (!isWhite && myOnlineColor === 'b');
    turnText.textContent = isWhite ? `Trắng (Ghost) ${isMe ? '— Lượt BẠN' : '— Đối thủ'}` : `Đen (Obsidian) ${isMe ? '— Lượt BẠN' : '— Đối thủ'}`;
  } else if (gameMode === 'ai') {
    const isMe = (isWhite && playerSideAI === 'w') || (!isWhite && playerSideAI === 'b');
    turnText.textContent = isWhite ? `Trắng (Ghost) ${isMe ? '— Lượt BẠN' : '— Lich King'}` : `Đen (Obsidian) ${isMe ? '— Lượt BẠN' : '— Lich King'}`;
  } else {
    turnText.textContent = isWhite ? 'Lượt Trắng (Ghost Bone)' : 'Lượt Đen (Obsidian Dark)';
  }

  // Clocks
  const wClock = document.getElementById('clock-white');
  const bClock = document.getElementById('clock-black');

  if (gameMode === 'online') {
    wClock.textContent = `⚪ ${whitePlayerName}: ${formatTime(whiteRemaining)}`;
    bClock.textContent = `⚫ ${blackPlayerName}: ${formatTime(blackRemaining)}`;
  } else {
    wClock.textContent = '⚪ ' + formatTime(whiteRemaining);
    bClock.textContent = '⚫ ' + formatTime(blackRemaining);
  }

  wClock.className = 'chess-clock ' + (isWhite ? 'active-w' : '') + (whiteRemaining <= 30 && whiteRemaining > 0 ? ' low-time' : '');
  bClock.className = 'chess-clock ' + (!isWhite ? 'active-b' : '') + (blackRemaining <= 30 && blackRemaining > 0 ? ' low-time' : '');

  // Move History
  const historyEl = document.getElementById('move-history');
  historyEl.innerHTML = '';
  const history = chess.history({ verbose: true });
  for (let i = 0; i < history.length; i += 2) {
    const row = document.createElement('div');
    row.className = 'move-row';
    const num = Math.floor(i / 2) + 1;
    const wMove = history[i] ? history[i].san : '';
    const bMove = history[i + 1] ? history[i + 1].san : '';
    row.innerHTML = `<span class="move-num">${num}.</span><span class="move-w">${wMove}</span><span class="move-b">${bMove}</span>`;
    historyEl.appendChild(row);
  }
  historyEl.scrollTop = historyEl.scrollHeight;

  // Graveyard
  const pieceSymbols = { p: '🎃', n: '🐴', b: '🧙', r: '🏰', q: '👑', k: '☠️' };
  let capW = '', capB = '';
  const fullPieces = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const currentCount = { w: { p:0, n:0, b:0, r:0, q:0 }, b: { p:0, n:0, b:0, r:0, q:0 } };
  
  chess.board().flat().forEach(p => {
    if (p && p.type !== 'k') currentCount[p.color][p.type]++;
  });

  Object.keys(fullPieces).forEach(t => {
    const lostW = fullPieces[t] - currentCount.w[t];
    const lostB = fullPieces[t] - currentCount.b[t];
    for (let i = 0; i < lostW; i++) capW += pieceSymbols[t] + ' ';
    for (let i = 0; i < lostB; i++) capB += pieceSymbols[t] + ' ';
  });

  document.getElementById('captured-white').textContent = capW || '—';
  document.getElementById('captured-black').textContent = capB || '—';
}

// ── WebRTC PeerJS Multiplayer Engine (100% Serverless / Vercel-Ready) ───────
const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  }
};

function getMyPlayerName() {
  const input = document.getElementById('input-player-name');
  let name = input ? input.value.trim() : '';
  if (!name) name = 'Kỵ Sĩ ' + Math.floor(10 + Math.random() * 90);
  try { localStorage.setItem('halloween_chess_name', name); } catch(e){}
  return name;
}

let wsClient = null;
let lockedRemotePeerId = null;
let drawOfferedByMe = false;
let rematchRequestedByMe = false;
let lastEmoteTime = 0;
let emoteCountWindow = 0;
let lastChatTime = 0;
let chatCountWindow = 0;

function checkEmoteRateLimit() {
  const now = Date.now();
  if (now - lastEmoteTime > 3000) {
    lastEmoteTime = now;
    emoteCountWindow = 0;
  }
  emoteCountWindow++;
  return emoteCountWindow <= 6;
}

function checkChatRateLimit() {
  const now = Date.now();
  if (now - lastChatTime > 3000) {
    lastChatTime = now;
    chatCountWindow = 0;
  }
  chatCountWindow++;
  return chatCountWindow <= 6;
}

function getWebSocketUrl() {
  const isHttps = window.location.protocol === 'https:';
  const host = window.location.hostname || 'localhost';
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'ws://localhost:8081';
  }
  return (isHttps ? 'wss://' : 'ws://') + host + ':8081';
}

function initWebSocketClient() {
  if (wsClient && (wsClient.readyState === WebSocket.OPEN || wsClient.readyState === WebSocket.CONNECTING)) {
    return Promise.resolve(wsClient);
  }
  return new Promise((resolve, reject) => {
    try {
      const url = getWebSocketUrl();
      const ws = new WebSocket(url);
      
      ws.onopen = () => {
        console.log('⚡ Connected to Authoritative WebSocket Server:', url);
        wsClient = ws;
        resolve(ws);
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          handleWebSocketMessage(data);
        } catch(e){}
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (onlineActive) {
          onlineActive = false;
          stopClockTimer();
          updateOnlineBadge('🔴 Máy chủ WebSocket ngắt kết nối');
          showToast('Mất kết nối máy chủ!', 'error', '⚠️');
        }
        wsClient = null;
      };

      ws.onerror = (err) => {
        console.warn('WebSocket error / offline:', err);
        wsClient = null;
        reject(err);
      };
    } catch(err) {
      reject(err);
    }
  });
}

function sendOnlineMsg(obj) {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    const action = obj.action || (obj.type === 'move' ? 'move' : 
                   obj.type === 'resign' ? 'resign' : 
                   obj.type === 'offer_draw' ? 'offer_draw' : 
                   obj.type === 'draw_response' ? 'draw_response' : 
                   obj.type === 'rematch_request' ? 'rematch' : 
                   obj.type === 'chat' ? 'chat' : 
                   obj.type === 'emote' ? 'emote' : obj.type);
    wsClient.send(JSON.stringify({ ...obj, action }));
  } else if (peerConn && peerConn.open) {
    peerConn.send(obj);
  }
}

function sendPeerMsg(obj) {
  sendOnlineMsg(obj);
}

function handleWebSocketMessage(data) {
  if (!data || typeof data !== 'object') return;
  const type = data.type;

  if (type === 'room_created') {
    currentRoomId = data.room_id;
    myOnlineColor = data.color;
    document.getElementById('display-room-id').textContent = currentRoomId;
    document.getElementById('room-info-box').style.display = 'block';
    updateOnlineBadge(`🟡 Phòng ${currentRoomId} (Chờ đối thủ)`);
    addChatMessage('Hệ thống', `Đã mở phòng ${currentRoomId}. Hãy gửi mã cho đối thủ!`, 'sys');
    showToast(`Đã tạo phòng ${currentRoomId}!`, 'success', '🏰');
  }
  else if (type === 'queue_waiting') {
    updateOnlineBadge('🔍 Đang tìm kiếm đối thủ...');
    showToast(data.message || 'Đang tìm kiếm đối thủ...', 'info', '⏳');
  }
  else if (type === 'game_start') {
    currentRoomId = data.room_id || currentRoomId;
    onlineActive = true;
    whitePlayerName = data.white_name || 'Trắng';
    blackPlayerName = data.black_name || 'Đen';
    timeControl = data.time_control || 300;
    whiteRemaining = data.white_time != null ? data.white_time : timeControl;
    blackRemaining = data.black_time != null ? data.black_time : timeControl;

    const myName = getMyPlayerName();
    if (!myOnlineColor) {
      myOnlineColor = (whitePlayerName === myName) ? 'w' : 'b';
    }

    chess.reset();
    syncBoardFromChess();
    clearSelection();
    updateUI();

    document.getElementById('in-game-actions').style.display = 'block';
    document.getElementById('chat-section').style.display = 'flex';
    document.getElementById('room-info-box').style.display = 'none';
    updateOnlineBadge(`🟢 Đang đấu: ${currentRoomId}`);
    
    addChatMessage('Hệ thống', `Trận đấu bắt đầu! ⚪ ${whitePlayerName} vs ⚫ ${blackPlayerName}`, 'sys');
    showToast('Đối thủ đã vào bàn! Bắt đầu trận đấu!', 'success', '⚔️');

    if (myOnlineColor === 'w') setCameraPreset('white');
    else setCameraPreset('black');

    startClockTimer();
  }
  else if (type === 'move_made') {
    executeMove(data.from, data.to, data.promo || 'q', false);
    if (data.white_time != null) whiteRemaining = data.white_time;
    if (data.black_time != null) blackRemaining = data.black_time;
    updateUI();
  }
  else if (type === 'time_sync') {
    if (data.white_time != null) whiteRemaining = data.white_time;
    if (data.black_time != null) blackRemaining = data.black_time;
    updateUI();
  }
  else if (type === 'game_over') {
    onlineActive = false;
    stopClockTimer();
    let title = 'KẾT THÚC TRẬN ĐẤU';
    let desc = '';
    if (data.reason === 'timeout') {
      const winName = data.winner === 'w' ? whitePlayerName : blackPlayerName;
      desc = `${winName} chiến thắng do đối thủ hết giờ!`;
      title = 'HẾT GIỜ!';
    } else if (data.reason === 'resigned') {
      const winName = data.winner === 'w' ? whitePlayerName : blackPlayerName;
      desc = `${winName} chiến thắng do đối thủ đầu hàng!`;
      title = (data.winner === myOnlineColor) ? 'CHIẾN THẮNG!' : 'KẾT THÚC';
    } else if (data.reason === 'checkmate') {
      const winName = data.winner === 'w' ? whitePlayerName : blackPlayerName;
      desc = `${winName} chiến thắng bằng chiếu bí!`;
      title = (data.winner === myOnlineColor) ? 'CHIẾN THẮNG!' : 'THẤT BẠI';
    } else if (data.reason === 'draw' || data.reason === 'draw_agreed') {
      desc = 'Trận đấu kết thúc với kết quả Hòa.';
      title = 'HÒA CỜ';
    }
    showBanner(title, desc, true);
    addChatMessage('Hệ thống', desc, 'sys');
  }
  else if (type === 'draw_offered') {
    playSound('check');
    showCustomConfirm('LỜI MỜI HÒA CỜ', 'Đối thủ gửi lời xin hòa cờ. Bạn có đồng ý kết thúc hòa không?', '🤝', 'Đồng ý hòa', 'Từ chối').then(ok => {
      sendOnlineMsg({ action: 'draw_response', accept: ok });
      if (ok) {
        onlineActive = false;
        stopClockTimer();
        showBanner('HÒA CỜ', 'Hai bên đã đồng ý hòa cờ.', true);
        addChatMessage('Hệ thống', 'Trận đấu kết thúc với kết quả Hòa.', 'sys');
      }
    });
  }
  else if (type === 'draw_declined') {
    addChatMessage('Hệ thống', 'Đối thủ đã từ chối lời xin hòa.', 'sys');
    showToast('Đối thủ từ chối hòa cờ!', 'error', '❌');
  }
  else if (type === 'rematch_requested') {
    playSound('win');
    showCustomConfirm('YÊU CẦU TÁI ĐẤU', 'Đối thủ muốn tái đấu (sẽ đổi phe Trắng / Đen). Bạn có đồng ý không?', '🔄', 'Chấp nhận', 'Từ chối').then(ok => {
      if (ok) {
        sendOnlineMsg({ action: 'rematch' });
      }
    });
  }
  else if (type === 'emote_sent') {
    spawnFloatingEmote(data.icon, data.color);
  }
  else if (type === 'chat_msg') {
    const isMe = (data.color === myOnlineColor);
    addChatMessage(data.sender, data.text, isMe ? 'me' : 'opp');
    playSound('select');
  }
  else if (type === 'opponent_disconnected') {
    onlineActive = false;
    stopClockTimer();
    updateOnlineBadge('🔴 Đối thủ đã mất kết nối');
    addChatMessage('Hệ thống', 'Đối thủ đã mất kết nối khỏi máy chủ.', 'sys');
    showToast('Đối thủ đã rời phòng!', 'error', '⚠️');
  }
  else if (type === 'error') {
    showToast(data.message || 'Lỗi từ máy chủ!', 'error', '⚠️');
  }
}

function startClockTimer() {
  stopClockTimer();
  clockInterval = setInterval(() => {
    if (!onlineActive || chess.game_over()) return;
    const currentTurn = chess.turn();
    if (currentTurn === 'w') {
      whiteRemaining = Math.max(0, whiteRemaining - 1);
      if (whiteRemaining <= 0) {
        handleTimeout('b');
      }
    } else {
      blackRemaining = Math.max(0, blackRemaining - 1);
      if (blackRemaining <= 0) {
        handleTimeout('w');
      }
    }
    updateUI();

    // In P2P host mode, sync clocks to guest
    if (isHost && peerConn && peerConn.open) {
      sendPeerMsg({
        type: 'time_sync',
        white_time: whiteRemaining,
        black_time: blackRemaining
      });
    }
  }, 1000);
}

function stopClockTimer() {
  if (clockInterval) {
    clearInterval(clockInterval);
    clockInterval = null;
  }
}

function handleTimeout(winnerColor) {
  onlineActive = false;
  stopClockTimer();
  const winName = (winnerColor === 'w') ? whitePlayerName : blackPlayerName;
  const desc = `${winName} chiến thắng do đối thủ hết giờ!`;
  showBanner('HẾT GIỜ!', desc, true);
  addChatMessage('Hệ thống', desc, 'sys');
  if (isHost) {
    sendPeerMsg({ type: 'game_over', reason: 'timeout', winner: winnerColor });
  }
}

function generateSecureRoomCode(length = 6) {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const randomBytes = new Uint8Array(length);
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < length; i++) randomBytes[i] = Math.floor(Math.random() * 256);
  }
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[randomBytes[i] % chars.length];
  }
  return code;
}

function getPeerRoomInfo(rawCode) {
  let clean = (rawCode || '').trim().toUpperCase().replace(/^HLW-?/i, '').replace(/[^A-Z0-9]/g, '');
  if (!clean) clean = generateSecureRoomCode(6);
  return {
    displayCode: `HLW-${clean}`,
    peerId: `hlw-chess-room-${clean.toLowerCase()}`,
    codeOnly: clean
  };
}

function createRoomP2P(timeCtl, colorPref) {
  stopClockTimer();
  lockedRemotePeerId = null;
  if (peerConn) { try { peerConn.close(); } catch(e){} peerConn = null; }
  if (peer) { try { peer.destroy(); } catch(e){} peer = null; }

  timeControl = timeCtl;
  whiteRemaining = timeControl;
  blackRemaining = timeControl;
  hostColorPref = colorPref;
  isHost = true;

  const roomInfo = getPeerRoomInfo(generateSecureRoomCode(6));
  currentRoomId = roomInfo.displayCode;

  updateOnlineBadge(`🟡 Đang mở phòng ${currentRoomId}...`);

  try {
    peer = new Peer(roomInfo.peerId, PEER_CONFIG);

    peer.on('open', (id) => {
      console.log('PeerJS Host open:', id);
      document.getElementById('display-room-id').textContent = currentRoomId;
      document.getElementById('room-info-box').style.display = 'block';
      updateOnlineBadge(`🟡 Phòng ${currentRoomId} (Chờ đối thủ)`);
      addChatMessage('Hệ thống', `Đã mở phòng ${currentRoomId}. Hãy gửi mã hoặc copy link cho bạn bè!`, 'sys');
      showToast(`Đã tạo phòng ${currentRoomId}!`, 'success', '🏰');
    });

    peer.on('connection', (conn) => {
      if (peerConn && peerConn.open && lockedRemotePeerId && conn.peer !== lockedRemotePeerId) {
        console.warn('Rejecting extra incoming connection from:', conn.peer);
        try { conn.close(); } catch(e){}
        return;
      }
      peerConn = conn;
      setupPeerConnectionHandlers(conn);
    });

    peer.on('error', (err) => {
      console.error('PeerJS Host error:', err);
      if (err.type === 'unavailable-id') {
        createRoomP2P(timeCtl, colorPref);
      } else {
        showToast('Lỗi P2P: ' + (err.type || err.message), 'error', '⚠️');
        updateOnlineBadge('🔴 Không thể mở phòng P2P');
      }
    });
  } catch(err) {
    console.error(err);
  }
}

function joinRoomP2P(roomCode) {
  stopClockTimer();
  lockedRemotePeerId = null;
  if (peerConn) { try { peerConn.close(); } catch(e){} peerConn = null; }
  if (peer) { try { peer.destroy(); } catch(e){} peer = null; }

  isHost = false;
  const roomInfo = getPeerRoomInfo(roomCode);
  currentRoomId = roomInfo.displayCode;
  const hostPeerId = roomInfo.peerId;

  updateOnlineBadge(`🟡 Đang kết nối tới ${currentRoomId}...`);
  showToast(`Đang kết nối vào phòng ${currentRoomId}...`, 'info', '⏳');

  try {
    peer = new Peer(PEER_CONFIG);

    peer.on('open', (id) => {
      console.log('Guest peer ready with ID:', id, 'Connecting to:', hostPeerId);
      const conn = peer.connect(hostPeerId, { reliable: true });
      peerConn = conn;
      setupPeerConnectionHandlers(conn);
    });

    peer.on('error', (err) => {
      console.error('Guest Peer error:', err);
      showToast('Không tìm thấy phòng hoặc phòng đã đóng!', 'error', '❌');
      updateOnlineBadge('🔴 Không tìm thấy phòng: ' + currentRoomId);
    });
  } catch(err) {
    console.error(err);
  }
}

function setupPeerConnectionHandlers(conn) {
  conn.on('open', () => {
    if (lockedRemotePeerId && lockedRemotePeerId !== conn.peer) {
      console.warn('Rejecting connection from unverified peer:', conn.peer);
      try { conn.close(); } catch(e){}
      return;
    }
    lockedRemotePeerId = conn.peer;
    console.log('P2P DataConnection locked to peer:', lockedRemotePeerId);
    if (!isHost) {
      conn.send({
        type: 'guest_hello',
        name: getMyPlayerName()
      });
    }
  });

  conn.on('data', async (data) => {
    await handlePeerMessage(data, conn);
  });

  conn.on('close', () => {
    console.log('P2P connection closed');
    onlineActive = false;
    stopClockTimer();
    lockedRemotePeerId = null;
    updateOnlineBadge('🔴 Đối thủ đã ngắt kết nối');
    addChatMessage('Hệ thống', 'Đối thủ đã rời khỏi phòng đấu.', 'sys');
    showToast('Đối thủ đã rời phòng!', 'error', '⚠️');
  });

  conn.on('error', (err) => {
    console.error('Connection error:', err);
    updateOnlineBadge('🔴 Lỗi kết nối P2P');
  });
}

async function handlePeerMessage(data, conn) {
  if (!data || typeof data !== 'object') return;
  if (conn && lockedRemotePeerId && conn.peer !== lockedRemotePeerId) {
    console.warn('Rejected P2P packet from unverified peer:', conn.peer);
    return;
  }
  const type = data.type;

  if (type === 'guest_hello' && isHost) {
    if (onlineActive) return;
    const guestName = (typeof data.name === 'string' ? data.name.trim().slice(0, 25) : '') || 'Khách';
    const hostName = getMyPlayerName();

    let hostColor = 'w';
    let guestColor = 'b';
    if (hostColorPref === 'b') {
      hostColor = 'b';
      guestColor = 'w';
    } else if (hostColorPref === 'random') {
      const randomBuf = new Uint8Array(1);
      if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(randomBuf);
      } else {
        randomBuf[0] = Math.floor(Math.random() * 256);
      }
      if (randomBuf[0] % 2 === 1) {
        hostColor = 'b';
        guestColor = 'w';
      }
    }

    myOnlineColor = hostColor;
    whitePlayerName = (hostColor === 'w') ? hostName : guestName;
    blackPlayerName = (hostColor === 'b') ? hostName : guestName;

    const startPayload = {
      type: 'game_start',
      room_id: currentRoomId,
      white_name: whitePlayerName,
      black_name: blackPlayerName,
      white_time: timeControl,
      black_time: timeControl,
      time_control: timeControl,
      guest_color: guestColor
    };

    sendPeerMsg(startPayload);
    initOnlineGame(startPayload, hostColor);
  }
  else if (type === 'game_start') {
    if (onlineActive) return;
    if (data.guest_color !== 'w' && data.guest_color !== 'b') return;
    myOnlineColor = data.guest_color;
    initOnlineGame(data, myOnlineColor);
  }
  else if (type === 'move') {
    if (!onlineActive || chess.game_over()) return;
    if (typeof data.from !== 'string' || typeof data.to !== 'string') return;
    
    const currentTurn = chess.turn();
    if (currentTurn === myOnlineColor) return;
    
    const promo = (typeof data.promo === 'string' && ['q', 'r', 'b', 'n'].includes(data.promo.toLowerCase()))
      ? data.promo.toLowerCase()
      : 'q';

    const testMove = chess.move({ from: data.from, to: data.to, promotion: promo });
    if (!testMove) {
      console.warn('Illegal move received from peer:', data);
      showToast('Nước cờ đối thủ không hợp lệ!', 'error', '⚠️');
      return;
    }
    chess.undo();

    executeMove(data.from, data.to, promo, false);

    updateUI();
  }
  else if (type === 'time_sync') {
    if (!onlineActive || isHost) return;
    updateUI();
  }
  else if (type === 'game_over') {
    if (!onlineActive) return;
    if (data.reason === 'timeout') {
      const timedOutColor = (data.winner === 'w') ? 'b' : 'w';
      const rem = (timedOutColor === 'w') ? whiteRemaining : blackRemaining;
      if (rem > 3) return;
      onlineActive = false;
      stopClockTimer();
      const winName = data.winner === 'w' ? whitePlayerName : blackPlayerName;
      const desc = `${winName} chiến thắng do đối thủ hết giờ!`;
      showBanner('HẾT GIỜ!', desc, true);
      addChatMessage('Hệ thống', desc, 'sys');
    }
  }
  else if (type === 'offer_draw') {
    if (!onlineActive) return;
    playSound('check');
    const ok = await showCustomConfirm('LỜI MỜI HÒA CỜ', 'Đối thủ gửi lời xin hòa cờ. Bạn có đồng ý kết thúc hòa không?', '🤝', 'Đồng ý hòa', 'Từ chối');
    if (ok) {
      sendPeerMsg({ type: 'draw_response', accept: true });
      onlineActive = false;
      stopClockTimer();
      showBanner('HÒA CỜ', 'Hai bên đã đồng ý hòa cờ.', true);
      addChatMessage('Hệ thống', 'Trận đấu kết thúc với kết quả Hòa.', 'sys');
    } else {
      sendPeerMsg({ type: 'draw_response', accept: false });
    }
  }
  else if (type === 'draw_response') {
    if (!drawOfferedByMe || !onlineActive) return;
    drawOfferedByMe = false;
    if (data.accept) {
      onlineActive = false;
      stopClockTimer();
      showBanner('HÒA CỜ', 'Đối thủ đã chấp nhận lời mời hòa cờ!', true);
      addChatMessage('Hệ thống', 'Hai bên đã đồng ý hòa cờ.', 'sys');
    } else {
      addChatMessage('Hệ thống', 'Đối thủ đã từ chối lời xin hòa.', 'sys');
      showToast('Đối thủ từ chối hòa cờ!', 'error', '❌');
    }
  }
  else if (type === 'resign') {
    if (!onlineActive) return;
    onlineActive = false;
    stopClockTimer();
    const winnerName = (myOnlineColor === 'w') ? whitePlayerName : blackPlayerName;
    const desc = `${winnerName} chiến thắng do đối thủ đầu hàng!`;
    playSound('win');
    showBanner('CHIẾN THẮNG!', desc, true);
    addChatMessage('Hệ thống', desc, 'sys');
  }
  else if (type === 'rematch_request') {
    playSound('win');
    const ok = await showCustomConfirm('YÊU CẦU TÁI ĐẤU', 'Đối thủ muốn tái đấu (sẽ đổi phe Trắng / Đen). Bạn có đồng ý không?', '🔄', 'Chấp nhận', 'Từ chối');
    if (ok) {
      const newMyColor = (myOnlineColor === 'w') ? 'b' : 'w';
      myOnlineColor = newMyColor;
      whiteRemaining = timeControl;
      blackRemaining = timeControl;
      const swapPayload = {
        type: 'rematch_start',
        white_name: (newMyColor === 'w') ? getMyPlayerName() : whitePlayerName,
        black_name: (newMyColor === 'b') ? getMyPlayerName() : blackPlayerName
      };
      sendPeerMsg(swapPayload);
      startRematchLocal();
    }
  }
  else if (type === 'rematch_start') {
    if (!rematchRequestedByMe) return;
    rematchRequestedByMe = false;
    myOnlineColor = (myOnlineColor === 'w') ? 'b' : 'w';
    whiteRemaining = timeControl;
    blackRemaining = timeControl;
    startRematchLocal();
    showToast('Tái đấu đã bắt đầu! Đổi phe cờ!', 'success', '🔄');
  }
  else if (type === 'emote') {
    if (!checkEmoteRateLimit()) return;
    const allowedIcons = ['🎃', '👻', '💀', '🧙', '🦇', '🕷️', '🔥', '👏'];
    if (typeof data.icon === 'string' && allowedIcons.includes(data.icon)) {
      spawnFloatingEmote(data.icon, data.color === 'w' ? 'w' : 'b');
    }
  }
  else if (type === 'chat') {
    if (!checkChatRateLimit()) return;
    if (typeof data.text === 'string' && data.text.trim().length > 0) {
      const sanitizedText = data.text.slice(0, 150);
      const senderName = typeof data.sender === 'string' ? data.sender.slice(0, 25) : 'Đối thủ';
      const isMe = (data.color === myOnlineColor);
      addChatMessage(senderName, sanitizedText, isMe ? 'me' : 'opp');
      playSound('select');
    }
  }
}

function initOnlineGame(data, myColor) {
  onlineActive = true;
  whitePlayerName = data.white_name || 'Trắng';
  blackPlayerName = data.black_name || 'Đen';
  timeControl = data.time_control || 300;
  whiteRemaining = data.white_time || timeControl;
  blackRemaining = data.black_time || timeControl;

  chess.reset();
  syncBoardFromChess();
  clearSelection();
  updateUI();

  document.getElementById('in-game-actions').style.display = 'block';
  document.getElementById('chat-section').style.display = 'flex';
  updateOnlineBadge(`🟢 Đang đấu: ${currentRoomId}`);
  
  addChatMessage('Hệ thống', `Trận đấu bắt đầu! ⚪ ${whitePlayerName} vs ⚫ ${blackPlayerName}`, 'sys');
  showToast('Đối thủ đã vào bàn! Bắt đầu trận đấu!', 'success', '⚔️');

  if (myColor === 'w') setCameraPreset('white');
  else setCameraPreset('black');

  startClockTimer();
}

function startRematchLocal() {
  onlineActive = true;
  chess.reset();
  syncBoardFromChess();
  clearSelection();
  updateUI();

  if (myOnlineColor === 'w') setCameraPreset('white');
  else setCameraPreset('black');

  startClockTimer();
  addChatMessage('Hệ thống', 'Ván tái đấu đã bắt đầu!', 'sys');
}

function updateOnlineBadge(txt) {
  const el = document.getElementById('online-status');
  if (el) el.textContent = txt;
}

function addChatMessage(sender, text, cls) {
  const box = document.getElementById('chat-messages');
  if (!box) return;
  const msg = document.createElement('div');
  msg.className = `chat-msg ${cls}`;
  msg.textContent = `${sender}: ${text}`;
  box.appendChild(msg);
  box.scrollTop = box.scrollHeight;
}

function spawnFloatingEmote(icon, color) {
  const el = document.createElement('div');
  el.className = 'floating-emote';
  el.textContent = icon;
  el.style.left = (window.innerWidth / 2 + (Math.random() - 0.5) * 120) + 'px';
  el.style.top = (window.innerHeight / 2 + (Math.random() - 0.5) * 60) + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room');
  if (roomId) {
    document.getElementById('mode-online').click();
    setTimeout(async () => {
      try {
        const ws = await initWebSocketClient();
        ws.send(JSON.stringify({ action: 'join_room', room_id: roomId.toUpperCase(), name: getMyPlayerName() }));
      } catch(e) {
        joinRoomP2P(roomId);
      }
    }, 500);
  }
}

// ── Event Handlers: Online Section ───────────────────────────────────────────
document.getElementById('btn-quick-match').onclick = async () => {
  const timeCtl = parseInt(document.getElementById('select-time-control').value);
  showToast('Đang tìm kiếm đối thủ...', 'info', '🔍');
  updateOnlineBadge('🔍 Đang tìm kiếm đối thủ...');

  try {
    const ws = await initWebSocketClient();
    ws.send(JSON.stringify({
      action: 'quick_match',
      time_control: timeCtl,
      name: getMyPlayerName()
    }));
  } catch(err) {
    console.warn('WebSocket unavailable, creating P2P room...', err);
    createRoomP2P(timeCtl, 'random');
  }
};

document.getElementById('btn-create-room').onclick = async () => {
  const timeCtl = parseInt(document.getElementById('select-time-control').value);
  const prefColor = document.getElementById('select-color').value;

  try {
    const ws = await initWebSocketClient();
    ws.send(JSON.stringify({
      action: 'create_room',
      time_control: timeCtl,
      color: prefColor,
      name: getMyPlayerName()
    }));
  } catch(err) {
    console.warn('WebSocket unavailable, creating P2P room...', err);
    createRoomP2P(timeCtl, prefColor);
  }
};

document.getElementById('btn-join-modal').onclick = async () => {
  const code = await showCustomPrompt('VÀO PHÒNG ĐẤU', 'Nhập mã phòng cờ 6 ký tự để tham chiến:', 'HLW-XXXX', '', '🔑');
  if (!code || !code.trim()) return;
  const cleanCode = code.trim().toUpperCase();

  try {
    const ws = await initWebSocketClient();
    ws.send(JSON.stringify({
      action: 'join_room',
      room_id: cleanCode,
      name: getMyPlayerName()
    }));
  } catch(err) {
    console.warn('WebSocket unavailable, joining P2P room...', err);
    joinRoomP2P(cleanCode);
  }
};

document.getElementById('btn-copy-link').onclick = () => {
  if (!currentRoomId) return;
  const link = `${window.location.origin}${window.location.pathname}?room=${currentRoomId.replace('HLW-', '')}`;
  navigator.clipboard.writeText(link);
  showToast('Đã sao chép Link phòng vào bộ nhớ tạm!', 'success', '📋');
};

document.getElementById('btn-copy-code').onclick = () => {
  if (!currentRoomId) return;
  navigator.clipboard.writeText(currentRoomId);
  showToast('Đã sao chép Mã phòng: ' + currentRoomId, 'success', '🔑');
};

document.getElementById('btn-resign').onclick = async () => {
  const ok = await showCustomConfirm('ĐẦU HÀNG', 'Bạn có chắc chắn muốn đầu hàng đối thủ trong ván này không?', '🏳️', 'Đầu hàng', 'Tiếp tục đấu');
  if (ok && gameMode === 'online') {
    sendOnlineMsg({ type: 'resign' });
    onlineActive = false;
    stopClockTimer();
    const oppName = (myOnlineColor === 'w') ? blackPlayerName : whitePlayerName;
    showBanner('KẾT THÚC', `Bạn đã đầu hàng. ${oppName} giành chiến thắng!`, true);
    addChatMessage('Hệ thống', 'Bạn đã đầu hàng.', 'sys');
  }
};

document.getElementById('btn-offer-draw').onclick = () => {
  if (gameMode === 'online' && onlineActive) {
    drawOfferedByMe = true;
    sendOnlineMsg({ type: 'offer_draw' });
    addChatMessage('Hệ thống', 'Đã gửi lời xin hòa tới đối thủ...', 'sys');
    showToast('Đã gửi lời xin hòa!', 'info', '🤝');
  }
};

// ── Event Handlers: AI Lich King Section ─────────────────────────────────────
document.querySelectorAll('.diff-card').forEach(card => {
  card.onclick = function() {
    document.querySelectorAll('.diff-card').forEach(c => c.classList.remove('active'));
    this.classList.add('active');
    aiDifficulty = parseInt(this.dataset.diff);
    const titles = { 1: 'Hồn Ma Tập Sự', 2: 'Kỵ Sĩ Bóng Đêm', 3: 'Chúa Tể Lich King' };
    showToast(`Đã chọn cấp độ: ${titles[aiDifficulty]}`, 'info', '🤖');
  };
});

document.getElementById('ai-side-white').onclick = function() {
  playerSideAI = 'w';
  this.classList.add('active');
  document.getElementById('ai-side-black').classList.remove('active');
  setCameraPreset('white');
  showToast('Bạn cầm quân Trắng (Đi trước)', 'info', '⚪');
  if (chess.history().length === 0) updateUI();
};

document.getElementById('ai-side-black').onclick = function() {
  playerSideAI = 'b';
  this.classList.add('active');
  document.getElementById('ai-side-white').classList.remove('active');
  setCameraPreset('black');
  showToast('Bạn cầm quân Đen (AI đi trước)', 'info', '⚫');
  
  if (chess.history().length === 0 && chess.turn() === 'w') {
    const statusEl = document.getElementById('ai-status-text');
    if (statusEl) statusEl.textContent = '🔮 Lich King đang đi nước mở màn...';
    setTimeout(makeAIMove, 500);
  }
};

document.getElementById('btn-ai-hint').onclick = () => {
  if (chess.game_over()) return;
  const currentTurn = chess.turn();
  const hintMove = getBestMove(3, currentTurn);
  if (hintMove) {
    selectSquare(hintMove.from);
    showToast(`Gợi ý: Đi từ ${hintMove.from.toUpperCase()} tới ${hintMove.to.toUpperCase()}`, 'success', '💡');
  }
};

document.getElementById('btn-ai-undo').onclick = () => {
  if (isAnimating) return;
  chess.undo(); // Undo AI
  chess.undo(); // Undo Player
  syncBoardFromChess();
  clearSelection();
  updateUI();
  showToast('Đã lùi lại 1 nước!', 'info', '↩');
};

// ── General Emote & Controls ────────────────────────────────────────────────
document.querySelectorAll('.emote-btn').forEach(btn => {
  btn.onclick = () => {
    const icon = btn.dataset.emote;
    spawnFloatingEmote(icon, myOnlineColor);
    if (gameMode === 'online') {
      sendPeerMsg({ type: 'emote', icon, color: myOnlineColor });
    }
  };
});

function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text) return;
  if (gameMode === 'online') {
    const sender = getMyPlayerName();
    addChatMessage(sender, text, 'me');
    sendPeerMsg({ type: 'chat', text, sender, color: myOnlineColor });
    input.value = '';
    playSound('select');
  }
}

document.getElementById('btn-send-chat').onclick = sendChat;
document.getElementById('chat-input').onkeydown = (e) => {
  if (e.key === 'Enter') sendChat();
};

function setCameraPreset(preset) {
  if (!controls) return;
  if (preset === 'persp') {
    camera.position.set(0, 5.5, 6.5);
    controls.target.set(0, 0.2, 0);
  } else if (preset === 'top') {
    camera.position.set(0, 7.5, 0.01);
    controls.target.set(0, 0, 0);
  } else if (preset === 'white') {
    camera.position.set(0, 3.5, 4.8);
    controls.target.set(0, 0.5, 0);
  } else if (preset === 'black') {
    camera.position.set(0, 3.5, -4.8);
    controls.target.set(0, 0.5, 0);
  } else if (preset === 'side') {
    camera.position.set(5.5, 2.5, 0);
    controls.target.set(0, 0.5, 0);
  }
  controls.update();
}

document.getElementById('cam-persp').onclick = () => setCameraPreset('persp');
document.getElementById('cam-top').onclick = () => setCameraPreset('top');
document.getElementById('cam-white').onclick = () => setCameraPreset('white');
document.getElementById('cam-black').onclick = () => setCameraPreset('black');
document.getElementById('cam-side').onclick = () => setCameraPreset('side');
document.getElementById('cam-free').onclick = () => {};

document.getElementById('mode-ai').onclick = function() {
  gameMode = 'ai';
  this.classList.add('active');
  document.getElementById('mode-pvp').classList.remove('active');
  document.getElementById('mode-online').classList.remove('active');
  document.getElementById('ai-panel').style.display = 'flex';
  document.getElementById('online-panel').style.display = 'none';
  document.getElementById('chat-section').style.display = 'none';
  document.getElementById('in-game-actions').style.display = 'none';
  updateUI();
};

document.getElementById('mode-pvp').onclick = function() {
  gameMode = 'pvp';
  this.classList.add('active');
  document.getElementById('mode-ai').classList.remove('active');
  document.getElementById('mode-online').classList.remove('active');
  document.getElementById('ai-panel').style.display = 'none';
  document.getElementById('online-panel').style.display = 'none';
  document.getElementById('chat-section').style.display = 'none';
  document.getElementById('in-game-actions').style.display = 'none';
  updateUI();
};

document.getElementById('mode-online').onclick = function() {
  gameMode = 'online';
  this.classList.add('active');
  document.getElementById('mode-ai').classList.remove('active');
  document.getElementById('mode-pvp').classList.remove('active');
  document.getElementById('ai-panel').style.display = 'none';
  document.getElementById('online-panel').style.display = 'flex';
  document.getElementById('chat-section').style.display = 'flex';
  updateOnlineBadge('🟢 Sẵn sàng tạo hoặc vào phòng P2P');
  updateUI();
};

document.getElementById('btn-sound').onclick = function() {
  soundEnabled = !soundEnabled;
  this.textContent = soundEnabled ? '🔊 Âm thanh' : '🔇 Tắt tiếng';
  showToast(soundEnabled ? 'Đã bật âm thanh' : 'Đã tắt âm thanh', 'info', soundEnabled ? '🔊' : '🔇');
};

document.getElementById('btn-undo').onclick = () => {
  if (isAnimating) return;
  if (gameMode === 'online') {
    showToast('Không thể đi lại trong chế độ Online!', 'error', '⚠️');
    return;
  }
  if (gameMode === 'ai') {
    chess.undo();
    chess.undo();
  } else {
    chess.undo();
  }
  syncBoardFromChess();
  clearSelection();
  updateUI();
  showToast('Đã lùi lại nước đi!', 'info', '↩');
};

document.getElementById('btn-restart').onclick = async () => {
  const ok = await showCustomConfirm('VÁN MỚI', 'Bạn có muốn đặt lại bàn cờ và bắt đầu ván mới không?', '🔄', 'Bắt đầu lại', 'Hủy');
  if (ok) {
    chess.reset();
    syncBoardFromChess();
    clearSelection();
    updateUI();
    showToast('Đã bắt đầu ván cờ mới!', 'info', '🔄');
  }
};

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);

  if (controls) controls.update();

  if (fxGroup && fxGroup.children[0]) {
    const pts = fxGroup.children[0];
    const pos = pts.geometry.attributes.position.array;
    for (let i = 1; i < pos.length; i += 3) {
      pos[i] += 0.005;
      if (pos[i] > 4) pos[i] = 0;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  }

  if (selectedSquare && pieceInstances[selectedSquare]) {
    const p = pieceInstances[selectedSquare];
    p.position.y = PIECE_Y + Math.sin(performance.now() * 0.006) * 0.04 + 0.05;
  }

  renderer.render(scene, camera);
}

window.onload = () => {
  try {
    const savedName = localStorage.getItem('halloween_chess_name');
    const nameInput = document.getElementById('input-player-name');
    if (savedName && nameInput) nameInput.value = savedName;
  } catch(e){}

  initScene();
  loadAllModels();
  animate();
};
