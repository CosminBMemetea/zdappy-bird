<script lang="ts">
  import type { PipePair } from "./game";
  export let pipe: PipePair;
</script>

{#if pipe.show}
  <div
    class="pipe top"
    style="left: {pipe.left}px; top: {pipe.topPipe.top}px; width: {pipe.width}px; height: {pipe.topPipe.height}px;"
    aria-hidden="true"
  ></div>
  <div
    class="pipe bottom"
    style="left: {pipe.left}px; top: {pipe.bottomPipe.top}px; width: {pipe.width}px; height: {pipe.bottomPipe.height}px;"
    aria-hidden="true"
  ></div>
{/if}

<style>
  .pipe {
    position: absolute;
    z-index: 2;
    background: linear-gradient(90deg, #00a83a 0%, #00ff41 45%, #7dffa0 60%, #00c853 100%);
    box-shadow: 0 0 22px rgba(0, 255, 65, 0.35);
  }
  .pipe::after {
    content: "";
    position: absolute;
    left: -5px;
    right: -5px;
    height: 18px;
    border-radius: 6px;
    background: linear-gradient(90deg, #00b33f 0%, #3dff6e 45%, #b4ffc8 60%, #00d659 100%);
    box-shadow: 0 0 12px rgba(0, 255, 65, 0.5);
  }
  .top {
    border-radius: 0 0 4px 4px;
  }
  .top::after {
    bottom: 0;
  }
  .bottom {
    border-radius: 4px 4px 0 0;
  }
  .bottom::after {
    top: 0;
  }
</style>
