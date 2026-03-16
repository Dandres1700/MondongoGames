// Tamano del canvas.
export const ANCHO_VENTANA = 1500;
export const ALTO_VENTANA = 800;

// Escalas.
export const ESCALA_PERSONAJE = 0.8;
export const ESCALA_ARMA = 0.05;
export const ESCALA_ENEMIGOS = 1.1;
export const SCALA_CORAZON = 2;

// Juego.
export const FPS = 120;
export const VELOCIDAD = 2;
export const VELOCIDAD2 = -2;
export const VELOCIDAD_ENEMIGO = 1;
export const RANGO = 150;
export const RANGO_ATAQUE = 50;
export const COOLDOWN_BALA = 400;
export const VELOCIDAD_BALA = 10;

// Mapa.
export const TILE_SIZE = 50;
export const TILE_TYPES = 114;
export const FILAS = 40;
export const COLUMNAS = 40;
export const LIMITE_PANTALLA = 150;
export const NIVEL_MAXIMO = 5;

// Colores.
export const COLOR_FONDO = "#0f0f14";
export const COLOR_TEXTO = "#f0f0f0";
export const COLOR_SELEC = "#78c8ff";
export const COLOR_PLACEHOLDER = "#b4b4c8";
export const ROJO = "#e63234";
export const BLANCO = "#ffffff";
export const NEGRO = "#000000";
export const AMARILLO_DORADO = "#daa520";
export const ROJO_OSCURO = "#8a0303";

export const WALL_BLOOD_FONT = "WallBlood";

// Spawn por nivel.
export const COORDENADAS = {
  1: [100, 50],
  2: [1675, 50],
  3: [100, 50],
  4: [100, 200],
  5: [100, 200],
};

// Rutas de assets.
export const ASSET_PATHS = {
  font: "/static/games/wall_blood/fonts/Blazma-Italic.ttf",
  niveles: (nivel) => `/static/games/wall_blood/niveles/nivel_${nivel}.csv`,
  tile: (id) => `/static/games/wall_blood/images/tiles/tile_${id}.png`,
  playerFrames: Array.from({ length: 7 }, (_, i) => `/static/games/wall_blood/images/player/Foto_${i}.png`),
  enemyFrames: {
    gobling: Array.from({ length: 8 }, (_, i) => `/static/games/wall_blood/images/enemy/gobling/gobling_${i + 1}.png`),
    hongo: Array.from({ length: 8 }, (_, i) => `/static/games/wall_blood/images/enemy/hongo/hongo_${i + 1}.png`),
    esqueleto: Array.from({ length: 4 }, (_, i) => `/static/games/wall_blood/images/enemy/esqueleto/esqueleto_${i + 1}.png`),
    jefe1: Array.from({ length: 8 }, (_, i) => `/static/games/wall_blood/images/jefes/jefe1/idle/Idle_${i + 1}.png`),
    jefe2: Array.from({ length: 8 }, (_, i) => `/static/games/wall_blood/images/jefes/jefe2/idle/Idle_${i + 1}.png`),
    jefe3: Array.from({ length: 9 }, (_, i) => `/static/games/wall_blood/images/jefes/jefe3/idle/Idle_${i + 1}.png`),
  },
  arma: "/static/games/wall_blood/images/weapon/arma2.png",
  bala: "/static/games/wall_blood/images/weapon/bala1.png",
  hearts: {
    empty: "/static/games/wall_blood/images/items/Corazon_enti.png",
    half: "/static/games/wall_blood/images/items/Corazon_med.png",
    full: "/static/games/wall_blood/images/items/Corazon_full.png",
  },
  pocion: "/static/games/wall_blood/images/items/pocion_1.png",
  coinFrames: Array.from({ length: 5 }, (_, i) => `/static/games/wall_blood/images/items/coin/coin_${i + 1}.png`),
};

export function crearRect(x, y, w, h) {
  // Rect tipo pygame.
  return {
    x,
    y,
    w,
    h,
    get left() { return this.x; },
    set left(v) { this.x = v; },
    get right() { return this.x + this.w; },
    set right(v) { this.x = v - this.w; },
    get top() { return this.y; },
    set top(v) { this.y = v; },
    get bottom() { return this.y + this.h; },
    set bottom(v) { this.y = v - this.h; },
    get centerx() { return this.x + this.w / 2; },
    set centerx(v) { this.x = v - this.w / 2; },
    get centery() { return this.y + this.h / 2; },
    set centery(v) { this.y = v - this.h / 2; },
    get center() { return [this.centerx, this.centery]; },
    set center(v) { this.centerx = v[0]; this.centery = v[1]; },
  };
}

export function rectCollide(a, b) {
  // Colision AABB.
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
