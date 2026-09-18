/**
 * Builds the aircraft marker as an SDF image.
 *
 * MapLibre can recolour a symbol per-feature only when the icon is registered
 * as a signed-distance-field image, so the plane is drawn to a canvas and
 * handed over with `sdf: true`. That is what allows a single icon to be tinted
 * by altitude through a data-driven `icon-color` expression, instead of
 * registering one pre-coloured PNG per altitude band.
 */

const SIZE = 64;

/** Plane silhouette pointing north, in a 0-64 coordinate space. */
function drawPlane(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();

  ctx.moveTo(32, 4); // nose
  ctx.lineTo(36, 18); // right side of fuselage
  ctx.lineTo(60, 36); // right wingtip
  ctx.lineTo(60, 42);
  ctx.lineTo(36, 34); // wing trailing edge
  ctx.lineTo(36, 48);
  ctx.lineTo(45, 56); // right tailplane
  ctx.lineTo(45, 60);
  ctx.lineTo(32, 55); // tail centre
  ctx.lineTo(19, 60); // left tailplane
  ctx.lineTo(19, 56);
  ctx.lineTo(28, 48);
  ctx.lineTo(28, 34);
  ctx.lineTo(4, 42); // left wingtip
  ctx.lineTo(4, 36);
  ctx.lineTo(28, 18);

  ctx.closePath();
  ctx.fill();
}

export function createAircraftIcon(): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  drawPlane(ctx);
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

export const AIRCRAFT_ICON_ID = "aircraft";
