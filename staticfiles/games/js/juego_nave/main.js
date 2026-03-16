import { runGame } from "./game.js";
import { ASSET_PATHS } from "./settings.js";
import { MenuSystem } from "./menu.js";

// Carga una imagen y la devuelve lista para dibujar.
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar imagen: ${src}`));
    img.src = src;
  });
}

// Registra la fuente arcade usada en menu y HUD.
async function loadFont() {
  const font = new FontFace("Arcade", `url(${ASSET_PATHS.font})`);
  const loaded = await font.load();
  document.fonts.add(loaded);
}

// Precarga todos los recursos del juego original.
async function loadAssets() {
  await loadFont();
  const [backgroundImage, playerImage, enemy1, enemy2, enemy3] = await Promise.all([
    loadImage(ASSET_PATHS.background),
    loadImage(ASSET_PATHS.player),
    loadImage(ASSET_PATHS.enemies[0]),
    loadImage(ASSET_PATHS.enemies[1]),
    loadImage(ASSET_PATHS.enemies[2]),
  ]);

  return {
    backgroundImage,
    playerImage,
    enemyImages: [enemy1, enemy2, enemy3],
  };
}

// Orquestador: menu -> juego -> menu.
export async function run(canvas) {
  if (!canvas) return;
  const assets = await loadAssets();
  const menu = new MenuSystem(canvas, assets.backgroundImage);
  let mode = "menu";
  let gameController = null;
  let menuRaf = 0;

  function startMenuLoop() {
    cancelAnimationFrame(menuRaf);
    const drawLoop = () => {
      if (mode !== "menu") return;
      menu.draw();
      menuRaf = requestAnimationFrame(drawLoop);
    };
    menuRaf = requestAnimationFrame(drawLoop);
  }

  // Arranca la partida y vuelve al menu al salir.
  function startGame() {
    mode = "game";
    cancelAnimationFrame(menuRaf);
    gameController = runGame(canvas, assets, {
      onMatchEnd: (stats) => {
        if (typeof window.registrarPartida === "function") {
          window.registrarPartida(stats);
        }
      },
      onExit: () => {
        mode = "menu";
        menu.setScreen("menu");
        startMenuLoop();
      },
    });
  }

  menu.setOnSelect((selected) => {
    if (selected === "JUGAR") {
      startGame();
    } else if (selected === "CONTROLES") {
      menu.setScreen("controls");
    } else if (selected === "CONFIGURACION") {
      menu.setScreen("config");
    } else if (selected === "SALIR") {
      window.location.href = "/dashboard/";
    }
  });

  // Solo delega teclas al menu cuando el menu esta activo.
  function keydownHandler(event) {
    if (!canvas.isConnected) {
      document.removeEventListener("keydown", keydownHandler);
      return;
    }
    if (
      event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === " " ||
      event.key === "Enter" ||
      event.key === "Escape"
    ) {
      event.preventDefault();
    }
    if (mode !== "menu") return;
    menu.handleKey(event);
  }

  document.addEventListener("keydown", keydownHandler);
  startMenuLoop();

  return {
    // Limpieza manual si se necesita detener desde afuera.
    stop: () => {
      cancelAnimationFrame(menuRaf);
      document.removeEventListener("keydown", keydownHandler);
      if (gameController && typeof gameController.stop === "function") {
        gameController.stop();
      }
    },
  };
}

// Auto inicio en la pantalla de juego.
const canvas = document.getElementById("spaceInvadersCanvas");
if (canvas) {
  run(canvas).catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
  });
}
