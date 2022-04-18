<script lang="ts">
import Bird from "./Bird.svelte";
import { GameController } from "./game";
import Pipe from "./Pipe.svelte";

  const game = new GameController();
  let frame = game.newGame();
  setInterval(() => {
     frame = game.nextFrame();
  }, 1000 / 90); 
  function jump() {
      game.jump();
  } 
  function startGame() {
      game.start();
  } 
</script>

<svelte:window on:click="{jump}" />

<style>
    container{
        width: 100%;
        height: calc(100vh);
        display: flex;
        overflow: hidden;
        position: relative;
    }
    card{
        flex:1;
        padding: 100px;
        padding-right: 0;
        display: flex;
        flex-direction: column;
        justify-content: space-around;
        position: relative;
        overflow: hidden;
        border: solid white 3px;
        overflow: hidden;
        background-color: black;
    }

    #ground {
        background-color: brown;
        width: 100%;
        position: absolute;
        bottom: 0;
        left: 0;
    }
    #init-screen {
    user-select: none;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translateX(-50%) translateY(-50%);
    font-family: monospace;
  }
  #init-screen h2 {
    text-align: center;
  }
  #init-screen button {
    font-family: monospace;
    font-size: 16px;
    border: none;
    border-radius: none;
    background-color: ghostwhite;
    padding: 10px;
    cursor: pointer;
    outline: none;
    transition: ease-in-out 0.2s font-size;
    display: block;
    margin: 0 auto;
  }

  #init-screen button:active,
  #init-screen button:focus {
    outline: none;
    font-size: 15px;
  }
  #score {
    position: absolute;
    right: 10px;
    top: 10px;
    font-size: 20px;
    z-index: 10;
    padding: 5px;
    font-family: cursive;
    background-color: white;
    user-select: none;
  }
  #character {
    position: absolute;
    left: 10px;
    bottom: 10px;
    font-size: 13px;
    z-index: 0;
    padding: 15px;
    font-family: cursive;
    background-color: white;
    user-select: none;
  }
</style>
<container class="container">

<card class="card"></card>
{#if frame.gameOver || !frame.gameStarted}
<section id="init-screen">
  {#if frame.gameOver}
  <h2>Game Over</h2>
  <h2>Score {frame.score}</h2>
  {/if}
  <button on:click="{startGame}">Start Game</button>
</section>
{/if}

<card class="card">
  <section id="score">{frame.score}</section>
  <Bird bird="{frame.bird}" />
  <Pipe pipe="{frame.firstPipe}" />
  <Pipe pipe="{frame.secondPipe}" />
  <section id="character">
    <div>Name: <span>Zdappy no. 1</span></div>
    <div>Level: <span>1</span></div>
    <div>Experience: <span>2</span></div>
    <div>Endurance: <span>10</span></div>
    <div>Last Meal: <span>10</span></div>
  </section>
  {#if frame.gameOver || !frame.gameStarted}
  <section id="init-screen">
    <button on:click="{startGame}">Start Game</button>
  </section>
  {/if}
  <section style="height: {frame.ground.height}px;" id="ground"></section>
</card>
<card class="card"></card>
</container>