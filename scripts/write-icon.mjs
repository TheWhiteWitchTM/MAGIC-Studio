import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const size = 256;
const raw = Buffer.alloc((size * 4 + 1) * size);
const points = star(128, 122, 78);

for (let y = 0; y < size; y += 1) {
  const row = y * (size * 4 + 1);
  raw[row] = 0;
  for (let x = 0; x < size; x += 1) {
    const inside = roundRect(x, y, 18);
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    if (inside) {
      r = 30;
      g = 31;
      b = 34;
      a = 255;
      if (pointInPoly(x + 0.5, y + 0.5, points)) {
        r = 231;
        g = 201;
        b = 138;
      } else if ((x - 128) ** 2 + (y - 122) ** 2 < 14 ** 2) {
        r = 53;
        g = 116;
        b = 240;
      }
    }
    const i = row + 1 + x * 4;
    raw[i] = r;
    raw[i + 1] = g;
    raw[i + 2] = b;
    raw[i + 3] = a;
  }
}

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', Buffer.from([
    0, 0, 1, 0,
    0, 0, 1, 0,
    8, 6, 0, 0, 0,
  ])),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icon.png');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, png);

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc(body), 8 + data.length);
  return out;
}

function crc(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function roundRect(x, y, radius) {
  const left = 8;
  const top = 8;
  const right = size - 9;
  const bottom = size - 9;
  if (x < left || y < top || x > right || y > bottom) return false;
  const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function star(cx, cy, radius) {
  const pts = [];
  for (let i = 0; i < 8; i += 1) {
    const arm = i % 2 === 0 ? radius : radius * 0.42;
    const angle = -Math.PI / 2 + (i * Math.PI) / 4;
    pts.push([cx + Math.cos(angle) * arm, cy + Math.sin(angle) * arm]);
  }
  return pts;
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.00001) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}
