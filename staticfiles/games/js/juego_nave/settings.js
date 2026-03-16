// Configuracion base del juego en web.
export const BASE_WIDTH = 320;
export const BASE_HEIGHT = 180;
export const SCALE = 6;

// Tamaño real del canvas mostrado.
export const WIDTH = 1020;
export const HEIGHT = 640;

export const FPS = 60;
export const TITLE = "One Hit Kill - Arcade CRT";
export const ARCADE_FONT = "Arcade";

// Limites de dificultad.
export const MAX_ENEMY_SPEED = 6;
export const MIN_SPAWN_TIME = 200;
export const MAX_ENEMIES = 15;

// Rutas de recursos del juego original.
export const ASSET_PATHS = {
  background: "/static/games/juego_nave/images/background.png",
  player: "/static/games/juego_nave/images/player.png",
  enemies: [
    "/static/games/juego_nave/images/enemy1.png",
    "/static/games/juego_nave/images/enemy2.png",
    "/static/games/juego_nave/images/enemy3.png",
  ],
  font: "/static/games/juego_nave/fonts/arcade.ttf",
};
