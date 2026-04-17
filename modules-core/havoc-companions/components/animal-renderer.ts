/**
 * Havoc Companions Module — Canvas 2D animal renderer
 *
 * Pure draw functions per species. Each draws a cute 50x50 sprite centered
 * at the supplied (cx, cy). The renderer takes positional primitives (no
 * options object) so the hot rAF loop allocates nothing per call.
 *
 * Also exports `drawSpeechBubble` for the speech bubbles that pop up over
 * walkers when they pause.
 */

import type { CompanionSpecies } from '@/modules/havoc-companions/types'

const TAU = Math.PI * 2

type Drawer = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  bob: number,
) => void

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fillStyle = fill
  ctx.fill()
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU)
  ctx.fillStyle = fill
  ctx.fill()
}

function triangle(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, cx: number, cy: number, fill: string) {
  ctx.beginPath()
  ctx.fillStyle = fill
  ctx.moveTo(ax, ay)
  ctx.lineTo(bx, by)
  ctx.lineTo(cx, cy)
  ctx.closePath()
  ctx.fill()
}

function drawEyes(ctx: CanvasRenderingContext2D, x: number, y: number, spread: number, eyeR = 1.6) {
  circle(ctx, x - spread, y, eyeR, '#1a1a1a')
  circle(ctx, x + spread, y, eyeR, '#1a1a1a')
  circle(ctx, x - spread + 0.4, y - 0.4, 0.5, '#ffffff')
  circle(ctx, x + spread + 0.4, y - 0.4, 0.5, '#ffffff')
}

function drawBlush(ctx: CanvasRenderingContext2D, x: number, y: number, spread: number) {
  ctx.globalAlpha = 0.55
  circle(ctx, x - spread, y, 1.6, '#ff8da1')
  circle(ctx, x + spread, y, 1.6, '#ff8da1')
  ctx.globalAlpha = 1
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  // CanvasRenderingContext2D.roundRect is standard in modern browsers but
  // fall back to a manual path for safety.
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r)
    return
  }
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

const drawCat: Drawer = (ctx, cx, cy, bob) => {
  const yOff = Math.sin(bob) * 0.6
  ellipse(ctx, cx, cy + 6 + yOff * 0.3, 11, 8, '#f4b860')
  ctx.beginPath()
  ctx.strokeStyle = '#f4b860'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.moveTo(cx + 9, cy + 6)
  ctx.quadraticCurveTo(cx + 16, cy + 4, cx + 14, cy - 4)
  ctx.stroke()
  circle(ctx, cx, cy - 2 + yOff, 10, '#f9c97a')
  triangle(ctx, cx - 8, cy - 8 + yOff, cx - 4, cy - 13 + yOff, cx - 3, cy - 7 + yOff, '#f4b860')
  triangle(ctx, cx + 8, cy - 8 + yOff, cx + 4, cy - 13 + yOff, cx + 3, cy - 7 + yOff, '#f4b860')
  drawEyes(ctx, cx, cy - 1 + yOff, 3)
  triangle(ctx, cx - 1, cy + 2 + yOff, cx + 1, cy + 2 + yOff, cx, cy + 3.5 + yOff, '#d96b7a')
  drawBlush(ctx, cx, cy + 4 + yOff, 5)
}

const drawDog: Drawer = (ctx, cx, cy, bob) => {
  const yOff = Math.sin(bob) * 0.6
  ellipse(ctx, cx, cy + 6 + yOff * 0.3, 11, 8, '#c98454')
  ellipse(ctx, cx + 11, cy + 7, 3, 2, '#c98454')
  circle(ctx, cx, cy - 2 + yOff, 10, '#deaa7c')
  ellipse(ctx, cx - 9, cy - 1 + yOff, 3.5, 6, '#9b5d3a')
  ellipse(ctx, cx + 9, cy - 1 + yOff, 3.5, 6, '#9b5d3a')
  ellipse(ctx, cx, cy + 3 + yOff, 5, 3.5, '#f1d5b8')
  drawEyes(ctx, cx, cy - 2 + yOff, 3)
  circle(ctx, cx, cy + 1.5 + yOff, 1.4, '#1a1a1a')
  drawBlush(ctx, cx, cy + 4 + yOff, 6)
}

const drawBunny: Drawer = (ctx, cx, cy, bob) => {
  const yOff = Math.sin(bob) * 0.7
  ellipse(ctx, cx, cy + 7 + yOff * 0.3, 9, 7, '#f0e6d2')
  circle(ctx, cx + 9, cy + 8, 2.5, '#ffffff')
  ellipse(ctx, cx - 4, cy - 12 + yOff, 2, 8, '#f0e6d2')
  ellipse(ctx, cx + 4, cy - 12 + yOff, 2, 8, '#f0e6d2')
  ellipse(ctx, cx - 4, cy - 12 + yOff, 1, 6, '#f7c4d4')
  ellipse(ctx, cx + 4, cy - 12 + yOff, 1, 6, '#f7c4d4')
  circle(ctx, cx, cy - 1 + yOff, 9, '#fefefe')
  drawEyes(ctx, cx, cy - 1 + yOff, 2.8)
  triangle(ctx, cx - 1, cy + 2 + yOff, cx + 1, cy + 2 + yOff, cx, cy + 3.5 + yOff, '#f7a4b8')
  drawBlush(ctx, cx, cy + 4 + yOff, 5)
}

const drawFox: Drawer = (ctx, cx, cy, bob) => {
  const yOff = Math.sin(bob) * 0.6
  ellipse(ctx, cx, cy + 6 + yOff * 0.3, 10, 7, '#e8703a')
  ellipse(ctx, cx + 12, cy + 3, 4, 6, '#e8703a')
  circle(ctx, cx + 14, cy - 1, 2.5, '#ffffff')
  circle(ctx, cx, cy - 2 + yOff, 9, '#f08850')
  triangle(ctx, cx - 8, cy - 6 + yOff, cx - 5, cy - 14 + yOff, cx - 2, cy - 7 + yOff, '#c95a25')
  triangle(ctx, cx + 8, cy - 6 + yOff, cx + 5, cy - 14 + yOff, cx + 2, cy - 7 + yOff, '#c95a25')
  ellipse(ctx, cx, cy + 3 + yOff, 4, 3, '#ffffff')
  drawEyes(ctx, cx, cy - 2 + yOff, 3)
  circle(ctx, cx, cy + 2 + yOff, 1.2, '#1a1a1a')
  drawBlush(ctx, cx, cy + 4 + yOff, 5)
}

const drawHamster: Drawer = (ctx, cx, cy, bob) => {
  const yOff = Math.sin(bob) * 0.5
  ellipse(ctx, cx, cy + 4 + yOff * 0.3, 11, 9, '#e8c89a')
  ellipse(ctx, cx, cy + 8, 6, 3, '#fff2dc')
  circle(ctx, cx - 7, cy - 6 + yOff, 2.5, '#c99c6e')
  circle(ctx, cx + 7, cy - 6 + yOff, 2.5, '#c99c6e')
  drawEyes(ctx, cx, cy - 1 + yOff, 3)
  circle(ctx, cx, cy + 2 + yOff, 0.9, '#1a1a1a')
  drawBlush(ctx, cx, cy + 4 + yOff, 5.5)
}

const drawDuck: Drawer = (ctx, cx, cy, bob) => {
  const yOff = Math.sin(bob) * 0.6
  ellipse(ctx, cx, cy + 6 + yOff * 0.3, 11, 8, '#fce473')
  ellipse(ctx, cx - 10, cy + 5, 3, 2, '#fce473')
  circle(ctx, cx + 4, cy - 3 + yOff, 7, '#fce473')
  ellipse(ctx, cx + 11, cy - 1 + yOff, 4, 2, '#f5a623')
  drawEyes(ctx, cx + 4, cy - 4 + yOff, 2.2)
  drawBlush(ctx, cx + 4, cy - 1 + yOff, 4)
}

const drawPanda: Drawer = (ctx, cx, cy, bob) => {
  const yOff = Math.sin(bob) * 0.5
  ellipse(ctx, cx, cy + 6 + yOff * 0.3, 11, 8, '#ffffff')
  circle(ctx, cx - 9, cy + 9, 3, '#1f1f1f')
  circle(ctx, cx + 9, cy + 9, 3, '#1f1f1f')
  circle(ctx, cx, cy - 1 + yOff, 10, '#ffffff')
  circle(ctx, cx - 8, cy - 9 + yOff, 3, '#1f1f1f')
  circle(ctx, cx + 8, cy - 9 + yOff, 3, '#1f1f1f')
  ellipse(ctx, cx - 4, cy - 1 + yOff, 2.6, 3, '#1f1f1f')
  ellipse(ctx, cx + 4, cy - 1 + yOff, 2.6, 3, '#1f1f1f')
  circle(ctx, cx - 4, cy - 1 + yOff, 1.1, '#ffffff')
  circle(ctx, cx + 4, cy - 1 + yOff, 1.1, '#ffffff')
  circle(ctx, cx - 4, cy - 1 + yOff, 0.6, '#1a1a1a')
  circle(ctx, cx + 4, cy - 1 + yOff, 0.6, '#1a1a1a')
  circle(ctx, cx, cy + 3 + yOff, 1.1, '#1a1a1a')
}

const drawSheep: Drawer = (ctx, cx, cy, bob) => {
  const yOff = Math.sin(bob) * 0.5
  for (let i = -1; i <= 1; i++) {
    circle(ctx, cx + i * 5, cy + 6 + yOff * 0.3, 5.5, '#f4f1ec')
  }
  circle(ctx, cx - 7, cy + 3, 4, '#f4f1ec')
  circle(ctx, cx + 7, cy + 3, 4, '#f4f1ec')
  ctx.fillStyle = '#3a3a3a'
  ctx.fillRect(cx - 5, cy + 10, 1.6, 4)
  ctx.fillRect(cx + 4, cy + 10, 1.6, 4)
  circle(ctx, cx, cy - 2 + yOff, 7, '#3a3a3a')
  ellipse(ctx, cx, cy - 1 + yOff, 5, 5, '#5a4a3a')
  ellipse(ctx, cx - 6, cy - 1 + yOff, 2, 3, '#3a3a3a')
  ellipse(ctx, cx + 6, cy - 1 + yOff, 2, 3, '#3a3a3a')
  drawEyes(ctx, cx, cy - 2 + yOff, 2.4)
  drawBlush(ctx, cx, cy + 1 + yOff, 4)
}

const drawPig: Drawer = (ctx, cx, cy, bob) => {
  const yOff = Math.sin(bob) * 0.6
  ellipse(ctx, cx, cy + 6 + yOff * 0.3, 11, 8, '#f7b6c8')
  triangle(ctx, cx - 8, cy - 7 + yOff, cx - 4, cy - 12 + yOff, cx - 3, cy - 6 + yOff, '#e591a8')
  triangle(ctx, cx + 8, cy - 7 + yOff, cx + 4, cy - 12 + yOff, cx + 3, cy - 6 + yOff, '#e591a8')
  circle(ctx, cx, cy - 1 + yOff, 9, '#f7b6c8')
  ellipse(ctx, cx, cy + 3 + yOff, 4, 2.6, '#e591a8')
  circle(ctx, cx - 1.4, cy + 3 + yOff, 0.6, '#1a1a1a')
  circle(ctx, cx + 1.4, cy + 3 + yOff, 0.6, '#1a1a1a')
  drawEyes(ctx, cx, cy - 2 + yOff, 3)
  drawBlush(ctx, cx, cy + 5 + yOff, 6)
}

const drawRaccoon: Drawer = (ctx, cx, cy, bob) => {
  const yOff = Math.sin(bob) * 0.5
  ellipse(ctx, cx, cy + 6 + yOff * 0.3, 11, 8, '#9a9aa3')
  ellipse(ctx, cx + 12, cy + 4, 3.5, 5, '#9a9aa3')
  ctx.fillStyle = '#3a3a3a'
  ctx.fillRect(cx + 9, cy + 4, 6, 1.5)
  ctx.fillRect(cx + 9, cy + 1, 6, 1.5)
  circle(ctx, cx, cy - 2 + yOff, 9, '#b8b8c0')
  circle(ctx, cx - 7, cy - 8 + yOff, 2.5, '#9a9aa3')
  circle(ctx, cx + 7, cy - 8 + yOff, 2.5, '#9a9aa3')
  ellipse(ctx, cx, cy - 1 + yOff, 7, 2.5, '#1f1f1f')
  circle(ctx, cx - 3.5, cy - 1 + yOff, 1.4, '#ffffff')
  circle(ctx, cx + 3.5, cy - 1 + yOff, 1.4, '#ffffff')
  circle(ctx, cx - 3.5, cy - 1 + yOff, 0.7, '#1a1a1a')
  circle(ctx, cx + 3.5, cy - 1 + yOff, 0.7, '#1a1a1a')
  circle(ctx, cx, cy + 3 + yOff, 1.1, '#1a1a1a')
}

const drawTiger: Drawer = (ctx, cx, cy, bob) => {
  const yOff = Math.sin(bob) * 0.6
  ellipse(ctx, cx, cy + 6 + yOff * 0.3, 11, 8, '#f4a23c')
  ctx.fillStyle = '#1f1f1f'
  ctx.fillRect(cx - 8, cy + 4, 1.5, 5)
  ctx.fillRect(cx - 3, cy + 3, 1.5, 6)
  ctx.fillRect(cx + 2, cy + 3, 1.5, 6)
  ctx.fillRect(cx + 7, cy + 4, 1.5, 5)
  ctx.beginPath()
  ctx.strokeStyle = '#f4a23c'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.moveTo(cx + 9, cy + 6)
  ctx.quadraticCurveTo(cx + 16, cy + 5, cx + 15, cy - 3)
  ctx.stroke()
  ctx.fillStyle = '#1f1f1f'
  ctx.fillRect(cx + 13, cy - 1, 1.5, 2)
  circle(ctx, cx, cy - 2 + yOff, 10, '#f6b755')
  triangle(ctx, cx - 8, cy - 8 + yOff, cx - 5, cy - 13 + yOff, cx - 3, cy - 7 + yOff, '#d97f1d')
  triangle(ctx, cx + 8, cy - 8 + yOff, cx + 5, cy - 13 + yOff, cx + 3, cy - 7 + yOff, '#d97f1d')
  ctx.fillStyle = '#1f1f1f'
  ctx.fillRect(cx - 6, cy - 9 + yOff, 1.2, 3)
  ctx.fillRect(cx - 2, cy - 10 + yOff, 1.2, 3)
  ctx.fillRect(cx + 1, cy - 10 + yOff, 1.2, 3)
  ctx.fillRect(cx + 5, cy - 9 + yOff, 1.2, 3)
  ellipse(ctx, cx, cy + 2 + yOff, 4, 2.6, '#ffffff')
  drawEyes(ctx, cx, cy - 2 + yOff, 3)
  triangle(ctx, cx - 1.2, cy + 1 + yOff, cx + 1.2, cy + 1 + yOff, cx, cy + 2.5 + yOff, '#d96b7a')
}

const drawLion: Drawer = (ctx, cx, cy, bob) => {
  const yOff = Math.sin(bob) * 0.5
  ellipse(ctx, cx, cy + 6 + yOff * 0.3, 10, 7, '#e6a851')
  ctx.beginPath()
  ctx.strokeStyle = '#e6a851'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.moveTo(cx + 9, cy + 6)
  ctx.quadraticCurveTo(cx + 16, cy + 4, cx + 15, cy - 3)
  ctx.stroke()
  circle(ctx, cx + 15, cy - 4, 2, '#8c5a1a')
  const maneR = 11
  const maneColor = '#a06325'
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * TAU
    circle(ctx, cx + Math.cos(angle) * maneR, cy - 1 + yOff + Math.sin(angle) * maneR, 3.2, maneColor)
  }
  circle(ctx, cx, cy - 1 + yOff, 8.5, '#f1c073')
  circle(ctx, cx - 7, cy - 8 + yOff, 2, '#a06325')
  circle(ctx, cx + 7, cy - 8 + yOff, 2, '#a06325')
  ellipse(ctx, cx, cy + 2 + yOff, 3.5, 2.4, '#fff2dc')
  drawEyes(ctx, cx, cy - 2 + yOff, 3)
  triangle(ctx, cx - 1.2, cy + 1 + yOff, cx + 1.2, cy + 1 + yOff, cx, cy + 2.5 + yOff, '#1a1a1a')
}

const DRAWERS: Record<CompanionSpecies, Drawer> = {
  cat: drawCat,
  dog: drawDog,
  bunny: drawBunny,
  fox: drawFox,
  hamster: drawHamster,
  duck: drawDuck,
  panda: drawPanda,
  sheep: drawSheep,
  pig: drawPig,
  raccoon: drawRaccoon,
  tiger: drawTiger,
  lion: drawLion,
}

/**
 * Draw a single 50x50 cute animal sprite centered at (cx, cy).
 *
 * Positional args (no opts object) so the rAF hot loop allocates nothing.
 * `facing === -1` flips the sprite horizontally; `scale` scales it.
 */
export function drawAnimal(
  species: CompanionSpecies,
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  bob: number,
  facing: 1 | -1,
  scale = 1,
) {
  const draw = DRAWERS[species]
  if (scale === 1 && facing === 1) {
    draw(ctx, cx, cy, bob)
    return
  }
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(facing * scale, scale)
  draw(ctx, 0, 0, bob)
  ctx.restore()
}

const SPEECH_FONT = '14px system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", sans-serif'

/**
 * Draw a speech bubble above a sprite at (cx, cy). Bubble auto-clamps
 * horizontally to the viewport. If there's not enough vertical room above
 * the sprite, the bubble is silently skipped (the speech is still active
 * in walker state and will draw on a later frame once the walker moves).
 */
export function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  text: string,
  viewportWidth: number,
) {
  ctx.save()
  ctx.font = SPEECH_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const textWidth = ctx.measureText(text).width
  const padX = 10
  const bubbleW = Math.max(40, textWidth + padX * 2)
  const bubbleH = 24
  const tailH = 7
  const bubbleBottom = cy - 28
  const bubbleTop = bubbleBottom - bubbleH

  if (bubbleTop < 4) {
    ctx.restore()
    return
  }

  let bubbleLeft = cx - bubbleW / 2
  if (bubbleLeft < 8) bubbleLeft = 8
  if (bubbleLeft + bubbleW > viewportWidth - 8) bubbleLeft = viewportWidth - bubbleW - 8

  // Drop shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
  roundRectPath(ctx, bubbleLeft + 1, bubbleTop + 2, bubbleW, bubbleH, 10)
  ctx.fill()

  // Bubble background + outline
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 1.5
  roundRectPath(ctx, bubbleLeft, bubbleTop, bubbleW, bubbleH, 10)
  ctx.fill()
  ctx.stroke()

  // Tail — clamp tip x within bubble bounds so it doesn't dangle off the edge
  const tailTipX = Math.max(bubbleLeft + 8, Math.min(bubbleLeft + bubbleW - 8, cx))
  const tailBaseLeft = tailTipX - 5
  const tailBaseRight = tailTipX + 5

  ctx.beginPath()
  ctx.moveTo(tailBaseLeft, bubbleBottom)
  ctx.lineTo(tailTipX, bubbleBottom + tailH)
  ctx.lineTo(tailBaseRight, bubbleBottom)
  ctx.closePath()
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // Stroke only the diagonal edges, then cover the bubble's bottom border
  // under the tail base with white so the bubble + tail merge cleanly.
  ctx.beginPath()
  ctx.moveTo(tailBaseLeft, bubbleBottom)
  ctx.lineTo(tailTipX, bubbleBottom + tailH)
  ctx.lineTo(tailBaseRight, bubbleBottom)
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(tailBaseLeft + 0.5, bubbleBottom - 1, tailBaseRight - tailBaseLeft - 1, 2)

  // Text
  ctx.fillStyle = '#1a1a1a'
  ctx.fillText(text, bubbleLeft + bubbleW / 2, bubbleTop + bubbleH / 2 + 0.5)

  ctx.restore()
}
