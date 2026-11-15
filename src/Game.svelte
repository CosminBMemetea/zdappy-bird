<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import Bird from "./Bird.svelte";
  import Pipe from "./Pipe.svelte";
  import { GameController } from "./game";
  import Wallet from "./Wallet.svelte";

  const TICK_MS = 1000 / 90; // physics runs at a fixed 90 ticks per second

  // Size the board to the visible screen; physics width/height match what's drawn.
  // visualViewport tracks the real visible area on phones (URL bar, keyboard).
  const groundHeight = 28;
  const pipeGap = 160;
  function measure() {
    const vw = window.visualViewport?.width ?? window.innerWidth;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const narrow = vw <= 980;
    const short = vh <= 500; // phone in landscape: compact header (see @media max-height)
    const reserved = short ? 72 : narrow ? 96 : 170; // header + padding above/below the board
    return {
      width: Math.round(Math.max(260, Math.min(420, vw - (narrow ? 24 : 32)))),
      height: Math.round(Math.max(short ? 280 : 320, Math.min(720, vh - reserved))),
    };
  }
  function makeGame(width: number, height: number) {
    return new GameController(
      height,
      width,
      56, // pipe width
      pipeGap,
      60, // min top pipe height
      height - groundHeight - pipeGap - 60, // max top pipe height
      0.6, // spawn the next pipe after 60% of the board
      1.5, // speed
      groundHeight,
      Math.round(width * 0.22), // bird x
      26, // bird size
      1.5, // gravity
      7.5 // jump velocity
    );
  }
  let { width: boardWidth, height: boardHeight } = measure();
  let game = makeGame(boardWidth, boardHeight);

  let frame = game.newGame();
  let best = 0; // kept in memory only, never stored or sent
  let newBest = false;
  let prevTop = frame.bird.top;
  let tilt = 0;
  let overAt = 0; // when the last run ended; blocks accidental instant restarts

  let raf = 0;
  let last = 0;
  let acc = 0;
  function loop(t: number) {
    if (!last) last = t;
    acc += Math.min(t - last, 250);
    last = t;
    while (acc >= TICK_MS) {
      frame = game.nextFrame();
      acc -= TICK_MS;
    }
    const dy = frame.bird.top - prevTop;
    prevTop = frame.bird.top;
    if (frame.gameStarted && !frame.gameOver) tilt = Math.max(-25, Math.min(70, dy * 9));
    if (frame.gameOver && !overAt) overAt = t;
    if (frame.gameOver && frame.score >= best && frame.score > 0) {
      newBest = frame.score > best || newBest;
      best = frame.score;
    }
    raf = requestAnimationFrame(loop);
  }
  // Re-fit the board after rotation or a viewport change. Never mid-run: the new size
  // waits until the current run is over so the physics don't jump.
  let resizePending = false;
  let resizeTimer = 0;
  function refit() {
    if (running) {
      resizePending = true;
      return;
    }
    resizePending = false;
    const next = measure();
    if (next.width === boardWidth && next.height === boardHeight) return;
    boardWidth = next.width;
    boardHeight = next.height;
    game = makeGame(boardWidth, boardHeight);
    frame = game.newGame();
    prevTop = frame.bird.top;
  }
  function scheduleRefit() {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(refit, 150);
  }

  let board: HTMLElement;
  // Non-passive listeners only on the board, only to stop browser gestures there.
  const stopGesture = (e: Event) => e.preventDefault();
  const onBoardTouchStart = (e: TouchEvent) => {
    // Let taps on overlay buttons through so they still click; block zoom/scroll/callouts elsewhere.
    if (e.target instanceof Element && e.target.closest("button")) return;
    e.preventDefault();
  };

  onMount(() => {
    raf = requestAnimationFrame(loop);
    board.addEventListener("touchstart", onBoardTouchStart, { passive: false });
    board.addEventListener("touchmove", stopGesture, { passive: false });
    board.addEventListener("gesturestart", stopGesture, { passive: false }); // iOS Safari pinch
    board.addEventListener("contextmenu", stopGesture); // long-press menu
    window.addEventListener("resize", scheduleRefit);
    window.addEventListener("orientationchange", scheduleRefit);
    window.visualViewport?.addEventListener("resize", scheduleRefit);
  });
  onDestroy(() => {
    cancelAnimationFrame(raf);
    clearTimeout(resizeTimer);
    window.removeEventListener("resize", scheduleRefit);
    window.removeEventListener("orientationchange", scheduleRefit);
    window.visualViewport?.removeEventListener("resize", scheduleRefit);
    document.documentElement.classList.remove("playing");
  });

  $: running = frame.gameStarted && !frame.gameOver;
  // While a run is live, lock page scrolling so a stray swipe can't move the board.
  $: document.documentElement.classList.toggle("playing", running);
  $: if (!running && resizePending) refit();

  function start() {
    overAt = 0;
    newBest = false;
    tilt = 0;
    frame = game.start();
    game.jump();
  }
  function flap() {
    if (running) game.jump();
  }
  const restartLocked = () => frame.gameOver && performance.now() - overAt < 600;
  function onBoardPointer(e: PointerEvent) {
    if (e.target instanceof Element && e.target.closest("button")) return;
    if (e.pointerType !== "mouse" || e.button === 0) e.preventDefault(); // no focus/selection/emulated mouse
    else return;
    if (running) flap();
    else if (!restartLocked()) start();
  }
  function onKey(e: KeyboardEvent) {
    const el = e.target;
    if (el instanceof Element && el.closest("button, a, input, select, textarea, pre")) return;
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault();
      if (running) flap();
      else if (!restartLocked()) start();
    } else if (e.code === "Enter" && !running && !restartLocked()) {
      start();
    }
  }

  // Character sheet for the NFT bird (mirrors the stats in contracts/Token.sol)
  const stats = [
    { label: "Level", value: 1, max: 10 },
    { label: "Experience", value: 2, max: 10 },
    { label: "Endurance", value: 10, max: 10 },
    { label: "Last meal", value: 10, max: 10 },
  ];
  const debouncers = ["Deegle", "Kioko", "Faang"];
  const armours = ["Tier Gamma", "Tier Beta", "Tier Alpha"];
  let debouncer = debouncers[0];
  let armour = armours[0];
</script>

<svelte:window on:keydown={onKey} />

<div class="page">
  <header class="top">
    <div class="brand">
      <span class="logo" aria-hidden="true"><span class="logo-eye"></span></span>
      <div>
        <h1>Zdappy Bird</h1>
        <p>Flap through the neon pipes. Collect your bird as an NFT.</p>
      </div>
    </div>
    <a class="gh" href="https://github.com/CosminBMemetea/zdappy-bird" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      <span>Source</span>
    </a>
  </header>

  <main class="layout">
    <aside class="panel" aria-label="Character">
      <h2>Character</h2>
      <div class="nft">
        <div class="nft-avatar" aria-hidden="true"><span class="logo-eye"></span></div>
        <div>
          <div class="nft-name">Zdappy no. 1</div>
          <div class="nft-tag">ERC-721 · testnet concept</div>
        </div>
      </div>
      <ul class="stats">
        {#each stats as s}
          <li>
            <div class="stat-row"><span>{s.label}</span><span class="mono">{s.value}</span></div>
            <div class="bar"><span style="width: {(s.value / s.max) * 100}%"></span></div>
          </li>
        {/each}
      </ul>
    </aside>

    <section
      class="board"
      class:running
      style="width: {boardWidth}px; height: {boardHeight}px;"
      bind:this={board}
      on:pointerdown={onBoardPointer}
      aria-label="Game board"
      data-testid="board"
    >
      <div class="sky" aria-hidden="true"></div>
      {#if frame.gameStarted}<div class="score" aria-live="polite">{frame.score}</div>{/if}
      <Pipe pipe={frame.firstPipe} />
      <Pipe pipe={frame.secondPipe} />
      <Bird bird={frame.bird} {tilt} flapping={running} />
      <div class="ground" style="height: {groundHeight}px;" aria-hidden="true"></div>

      {#if !frame.gameStarted}
        <div class="overlay">
          <div class="card">
            <div class="eyebrow">Ready?</div>
            <h2>Zdappy Bird</h2>
            <p class="hint">Click, tap, or press <kbd>Space</kbd> to flap.</p>
            <button class="btn" on:click={start}>Start game</button>
          </div>
        </div>
      {:else if frame.gameOver}
        <div class="overlay">
          <div class="card">
            <div class="eyebrow">Game over</div>
            <div class="scores">
              <div><span class="big">{frame.score}</span><span class="lbl">Score</span></div>
              <div><span class="big">{best}</span><span class="lbl">Best</span></div>
            </div>
            {#if newBest}<div class="badge">New best!</div>{/if}
            <button class="btn" on:click={start}>Play again</button>
            <p class="hint small">or press <kbd>Space</kbd></p>
          </div>
        </div>
      {/if}
    </section>

    <div class="side">
    <aside class="panel" aria-label="Loadout">
      <h2>Loadout</h2>
      <label class="field">
        <span>Debouncer</span>
        <select bind:value={debouncer}>
          {#each debouncers as d}<option>{d}</option>{/each}
        </select>
      </label>
      <label class="field">
        <span>Armour</span>
        <select bind:value={armour}>
          {#each armours as a}<option>{a}</option>{/each}
        </select>
      </label>
      <p class="muted">Equipped: <strong>{debouncer}</strong> with <strong>{armour}</strong>.</p>
      <div class="howto">
        <h3>How to play</h3>
        <ol>
          <li>Start the game.</li>
          <li>Flap to stay airborne.</li>
          <li>Pass between pipes to score.</li>
        </ol>
      </div>
    </aside>
    <Wallet score={best} />
    </div>
  </main>

  <footer class="foot">
    <span>No accounts · no cookies · no tracking. Everything runs in your browser.</span>
  </footer>
</div>

<style>
  .page {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
      max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    max-width: 1120px;
    width: 100%;
    margin: 0 auto;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand h1 {
    font-size: 1.35rem;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .brand p {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .logo,
  .nft-avatar {
    position: relative;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: radial-gradient(circle at 35% 30%, #fff6a8, var(--bird) 55%, #e0a800);
    box-shadow: 0 0 24px rgba(255, 214, 10, 0.35);
    flex: none;
  }
  .logo-eye {
    position: absolute;
    top: 30%;
    right: 22%;
    width: 22%;
    height: 22%;
    border-radius: 50%;
    background: #111;
    box-shadow: 0 0 0 3px #fff;
  }
  .gh {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
    color: var(--text);
    text-decoration: none;
    font-size: 0.9rem;
    transition: border-color 0.2s, background 0.2s;
  }
  .gh:hover,
  .gh:focus-visible {
    border-color: var(--neon);
    background: rgba(0, 255, 65, 0.08);
  }

  .layout {
    flex: 1;
    display: grid;
    grid-template-columns: minmax(200px, 260px) auto minmax(200px, 260px);
    justify-content: center;
    align-items: start;
    gap: 24px;
    max-width: 1120px;
    width: 100%;
    margin: 0 auto;
  }
  .side {
    display: grid;
    gap: 16px;
  }
  .panel,
  .side :global(.panel) {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 20px;
    backdrop-filter: blur(8px);
  }
  .panel h2,
  .side :global(.panel h2) {
    margin: 0 0 16px;
    font-size: 0.8rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--neon);
  }
  .nft {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
  }
  .nft-avatar {
    width: 52px;
    height: 52px;
    border-radius: 16px;
  }
  .nft-name {
    font-weight: 700;
  }
  .nft-tag {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .stats {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 12px;
  }
  .stat-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.88rem;
    margin-bottom: 6px;
  }
  .bar {
    height: 6px;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #00c853, var(--neon));
  }
  .field {
    display: grid;
    gap: 6px;
    margin-bottom: 14px;
    font-size: 0.85rem;
    color: var(--muted);
  }
  select {
    appearance: none;
    width: 100%;
    padding: 10px 36px 10px 12px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: #0d1511
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2300FF41' stroke-width='2' fill='none'/%3E%3C/svg%3E")
      no-repeat right 12px center;
    color: var(--text);
    font: inherit;
    cursor: pointer;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  select:hover {
    border-color: rgba(0, 255, 65, 0.5);
  }
  select:focus-visible {
    outline: none;
    border-color: var(--neon);
    box-shadow: 0 0 0 3px rgba(0, 255, 65, 0.25);
  }
  .muted {
    color: var(--muted);
    font-size: 0.85rem;
    line-height: 1.5;
  }
  .muted strong {
    color: var(--text);
  }
  .howto {
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid var(--line);
  }
  .howto h3 {
    margin: 0 0 8px;
    font-size: 0.9rem;
  }
  .howto ol {
    margin: 0;
    padding-left: 18px;
    color: var(--muted);
    font-size: 0.85rem;
    line-height: 1.7;
  }

  .board {
    position: relative;
    overflow: hidden;
    border-radius: 24px;
    border: 1px solid rgba(0, 255, 65, 0.35);
    box-shadow: 0 0 0 6px rgba(0, 255, 65, 0.05), 0 30px 80px rgba(0, 0, 0, 0.6), 0 0 60px rgba(0, 255, 65, 0.12);
    cursor: pointer;
    flex: none;
    /* Mobile: the board owns every touch. No pinch/double-tap zoom, no scrolling,
       no pull-to-refresh, no long-press callout or text selection, no tap flash. */
    touch-action: none;
    overscroll-behavior: contain;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
  }
  .board :global(*) {
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }

  .sky {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(1px 1px at 20% 30%, rgba(255, 255, 255, 0.6), transparent),
      radial-gradient(1px 1px at 70% 20%, rgba(255, 255, 255, 0.5), transparent),
      radial-gradient(1.5px 1.5px at 45% 60%, rgba(255, 255, 255, 0.35), transparent),
      radial-gradient(1px 1px at 85% 75%, rgba(255, 255, 255, 0.4), transparent),
      radial-gradient(ellipse at 50% 120%, rgba(0, 255, 65, 0.18), transparent 60%),
      linear-gradient(180deg, #02040a 0%, #071a12 100%);
  }
  .score {
    position: absolute;
    top: 18px;
    left: 0;
    right: 0;
    text-align: center;
    font: 800 3rem/1 var(--mono);
    color: #fff;
    text-shadow: 0 0 18px rgba(0, 255, 65, 0.6), 0 3px 0 rgba(0, 0, 0, 0.6);
    z-index: 5;
    pointer-events: none;
  }
  .ground {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 4;
    background: repeating-linear-gradient(-45deg, #1f5f2e 0 12px, #174a23 12px 24px);
    border-top: 3px solid var(--neon);
    box-shadow: 0 -6px 24px rgba(0, 255, 65, 0.35);
  }
  .board.running .ground {
    animation: scroll 0.38s linear infinite;
  }
  @keyframes scroll {
    to {
      background-position: -34px 0;
    }
  }

  .overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(2, 6, 4, 0.45);
    backdrop-filter: blur(3px);
    animation: fade 0.25s ease-out;
  }
  .card {
    width: min(100%, 300px);
    text-align: center;
    padding: 26px 22px;
    border-radius: 20px;
    background: rgba(8, 18, 12, 0.9);
    border: 1px solid rgba(0, 255, 65, 0.35);
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
    animation: pop 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.3);
  }
  .card h2 {
    margin: 4px 0 8px;
    font-size: 1.8rem;
    letter-spacing: -0.02em;
  }
  .eyebrow {
    font-size: 0.75rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--neon);
  }
  .hint {
    color: var(--muted);
    font-size: 0.9rem;
    margin: 0 0 18px;
  }
  .hint.small {
    margin: 12px 0 0;
    font-size: 0.8rem;
  }
  kbd {
    font: 600 0.8em var(--mono);
    padding: 2px 6px;
    border-radius: 6px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.06);
    color: var(--text);
  }
  .scores {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin: 14px 0;
  }
  .scores > div {
    display: grid;
    padding: 12px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid var(--line);
  }
  .big {
    font: 800 2.2rem/1.1 var(--mono);
  }
  .lbl {
    font-size: 0.75rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .badge {
    display: inline-block;
    margin-bottom: 14px;
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--bird);
    color: #1a1400;
    font-weight: 800;
    font-size: 0.8rem;
    animation: pop 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.4);
  }
  .btn {
    display: block;
    width: 100%;
    padding: 12px 18px;
    border: 0;
    border-radius: 14px;
    background: linear-gradient(180deg, #3dff6e, #00c853);
    color: #021006;
    font: 800 1rem var(--sans);
    cursor: pointer;
    box-shadow: 0 6px 0 #00762f, 0 10px 30px rgba(0, 255, 65, 0.3);
    transition: transform 0.08s, box-shadow 0.08s, filter 0.2s;
  }
  .btn:hover {
    filter: brightness(1.08);
  }
  .btn:active {
    transform: translateY(4px);
    box-shadow: 0 2px 0 #00762f, 0 6px 18px rgba(0, 255, 65, 0.3);
  }
  .btn:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 3px;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: scale(0.9) translateY(8px);
    }
  }

  .foot {
    text-align: center;
    color: var(--muted);
    font-size: 0.8rem;
    padding: 8px 0 4px;
  }
  .mono {
    font-family: var(--mono);
  }

  @media (max-width: 980px) {
    .layout {
      grid-template-columns: 1fr;
      justify-items: center;
    }
    .board {
      order: -1;
    }
    .panel,
    .side {
      width: 100%;
      max-width: 460px;
    }
  }
  @media (max-width: 520px) {
    .page {
      gap: 12px;
      padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
        max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
    }
    .brand p {
      display: none;
    }
  }
  @media (max-height: 500px) and (orientation: landscape) {
    .page {
      gap: 8px;
      padding-top: max(8px, env(safe-area-inset-top));
      padding-bottom: max(8px, env(safe-area-inset-bottom));
    }
    .brand p {
      display: none;
    }
    .logo {
      width: 32px;
      height: 32px;
      border-radius: 10px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .board.running .ground,
    .overlay,
    .card,
    .badge {
      animation: none;
    }
  }
</style>
