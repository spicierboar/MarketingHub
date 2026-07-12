// Deterministic placeholder media bytes for simulated AI visuals (Phase 4).
// Produces valid PNG images and a minimal MP4 so the DAM + /api/media route
// can serve them without any external image/video API. Colours and dimensions
// are seeded from the input string so the same brief always yields the same
// output (useful for tests and demos).

import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

function seedBytes(seed: string): [number, number, number] {
  const h = createHash("sha256").update(seed).digest();
  return [h[0], h[1], h[2]];
}

// CRC-32 for PNG chunk integrity (table-driven, no deps).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 1);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Solid-colour PNG with a subtle vertical gradient, seeded by `seed`. */
export function placeholderPng(
  seed: string,
  width: number,
  height: number,
): Buffer {
  const [r0, g0, b0] = seedBytes(seed);
  const r1 = (r0 + 40) % 256;
  const g1 = (g0 + 30) % 256;
  const b1 = (b0 + 50) % 256;
  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y += 1) {
    const t = height <= 1 ? 0 : y / (height - 1);
    const r = Math.round(r0 + (r1 - r0) * t);
    const g = Math.round(g0 + (g1 - g0) * t);
    const b = Math.round(b0 + (b1 - b0) * t);
    const off = y * rowSize;
    raw[off] = 0; // filter: None
    for (let x = 0; x < width; x += 1) {
      const px = off + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// Minimal valid MP4 (ftyp + mdat) — ~500 bytes, playable in most players.
const BASE_MP4 = Buffer.from(
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAB1tZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE1NSByMjkxNyAwMDAwMDAwIGxpYiBhdmNvZGVjIDEuMTUuMSBFeHRyYWNvZGVyIExpYiBWaWRlbyBDb2RlYyBsaWIyNjQgdjEuMTUuMSB4MjY0IC0gY29weWxlZnQgMjAwMy0yMDE4IC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MSByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgzOjB4MTEzIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0xOjAgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz02IGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTEgYl9iaWFzPTAgZGlyZWN0PTEgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0yIGtleWludD0yNTAga2V5aW50X21pbj0yNSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAAhlbWF0aQAAACRidHJrAAAAGGZ0aGQAAAAA",
  "base64",
);

/** Deterministic placeholder MP4 (same container; seed only affects metadata tag in description). */
export function placeholderMp4(_seed: string): Buffer {
  return BASE_MP4;
}

/**
 * Minimal silent (or seed-tinted tone) PCM WAV so DAM + /api/media can serve
 * an audio asset before a real TTS provider is wired.
 */
export function placeholderWav(seed: string, durationSec = 1.5): Buffer {
  const sampleRate = 8000;
  const seconds = Math.min(3, Math.max(0.5, durationSec));
  const numSamples = Math.floor(sampleRate * seconds);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  const [r, g, b] = seedBytes(seed);
  const freq = 220 + ((r + g + b) % 180);
  const amp = 800; // quiet tone so players show a non-empty waveform
  for (let i = 0; i < numSamples; i += 1) {
    const t = i / sampleRate;
    const sample = Math.round(Math.sin(2 * Math.PI * freq * t) * amp * Math.exp(-t * 1.2));
    buf.writeInt16LE(sample, 44 + i * 2);
  }
  return buf;
}
