<script lang="ts">
  import type { Bird } from "./game";
  export let bird: Bird;
  export let tilt = 0;
  export let flapping = false;
</script>

<div
  class="bird"
  class:flapping
  style="width: {bird.size}px; height: {bird.size}px; top: {bird.top}px; left: {bird.left}px; transform: rotate({tilt}deg);"
  aria-hidden="true"
>
  <span class="wing"></span>
  <span class="eye"></span>
  <span class="beak"></span>
</div>

<style>
  .bird {
    position: absolute;
    z-index: 3;
    border-radius: 45% 50% 45% 45%;
    background: radial-gradient(circle at 35% 30%, #fff6a8, #ffd60a 55%, #e0a800);
    box-shadow: 0 0 18px rgba(255, 214, 10, 0.55);
    transition: transform 0.08s linear;
  }
  .eye {
    position: absolute;
    top: 22%;
    right: 16%;
    width: 26%;
    height: 26%;
    border-radius: 50%;
    background: #111;
    box-shadow: 0 0 0 2px #fff;
  }
  .beak {
    position: absolute;
    top: 48%;
    right: -22%;
    width: 38%;
    height: 24%;
    border-radius: 0 50% 50% 0;
    background: #ff7a00;
  }
  .wing {
    position: absolute;
    left: 8%;
    top: 46%;
    width: 46%;
    height: 32%;
    border-radius: 50%;
    background: #f2b600;
    transform-origin: 80% 30%;
  }
  .flapping .wing {
    animation: flap 0.22s ease-in-out infinite alternate;
  }
  @keyframes flap {
    to {
      transform: rotate(-35deg) translateY(-2px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .flapping .wing {
      animation: none;
    }
  }
</style>
