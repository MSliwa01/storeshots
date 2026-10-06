// Minimal PNG reader: header for the store checks, RGBA pixels for measuring bezels.
// Handles 8-bit, non-interlaced grey/RGB/RGBA, which covers simulator captures,
// Chrome screenshots and Apple's bezel PNGs.
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = 0x89504e47;
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

function chunks(buf) {
  if (buf.readUInt32BE(0) !== SIGNATURE) throw new Error('not a PNG');
  const list = [];
  for (let pos = 8; pos < buf.length;) {
    const length = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    list.push({ type, data: buf.subarray(pos + 8, pos + 8 + length) });
    if (type === 'IEND') break;
    pos += 12 + length;
  }
  return list;
}

/** { width, height, depth, colorType, interlace, hasAlpha } from the IHDR chunk. */
export function pngInfo(buf) {
  const ihdr = chunks(buf).find(c => c.type === 'IHDR').data;
  const colorType = ihdr[9];
  return { width: ihdr.readUInt32BE(0), height: ihdr.readUInt32BE(4), depth: ihdr[8], colorType, interlace: ihdr[12], hasAlpha: colorType === 4 || colorType === 6 };
}

/** Decodes to { width, height, rgba: Uint8Array(width * height * 4) }. */
export function decodePng(buf) {
  const info = pngInfo(buf), channels = CHANNELS[info.colorType];
  if (info.depth !== 8 || info.interlace || !channels) throw new Error(`unsupported PNG (depth ${info.depth}, colour type ${info.colorType}, interlace ${info.interlace})`);
  const raw = inflateSync(Buffer.concat(chunks(buf).filter(c => c.type === 'IDAT').map(c => c.data)));
  const { width, height } = info, stride = width * channels, pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride), prev = y ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0, b = prev ? prev[x] : 0, c = prev && x >= channels ? prev[x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[x] = value;
    }
  }
  if (channels === 4) return { width, height, rgba: pixels };
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    if (channels === 1) rgba.set([pixels[s], pixels[s], pixels[s], 255], i * 4);
    else if (channels === 2) rgba.set([pixels[s], pixels[s], pixels[s], pixels[s + 1]], i * 4);
    else rgba.set([pixels[s], pixels[s + 1], pixels[s + 2], 255], i * 4);
  }
  return { width, height, rgba };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** Encodes 8-bit RGBA (or RGB with alpha: false) pixels as a PNG (filter 0). For fixtures and small assets. */
export function encodePng(width, height, rgba, { alpha = true } = {}) {
  const channels = alpha ? 4 : 3, stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = (y * width + x) * 4, dst = y * (stride + 1) + 1 + x * channels;
    for (let c = 0; c < channels; c++) raw[dst + c] = rgba[src + c];
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
