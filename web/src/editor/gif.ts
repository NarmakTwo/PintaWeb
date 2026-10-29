/** Minimal GIF89a encoder for animation export. */

function quantize(frame: ImageData, colors = 128): { palette: number[]; indexes: Uint8Array } {
  const palette: number[] = [0]; // transparent index 0
  const map = new Map<number, number>();
  map.set(0, 0);
  const indexes = new Uint8Array(frame.width * frame.height);
  for (let i = 0, p = 0; i < frame.data.length; i += 4, p++) {
    const a = frame.data[i + 3];
    if (a < 16) {
      indexes[p] = 0;
      continue;
    }
    const key = (frame.data[i] << 16) | (frame.data[i + 1] << 8) | frame.data[i + 2];
    let index = map.get(key);
    if (index == null) {
      if (palette.length >= colors) {
        index = 1 + (key % (colors - 1));
      } else {
        index = palette.length;
        palette.push(key);
        map.set(key, index);
      }
    }
    indexes[p] = index;
  }
  while (palette.length < 2) palette.push(0);
  const size = 1 << Math.ceil(Math.log2(Math.max(2, palette.length)));
  while (palette.length < size) palette.push(0);
  return { palette, indexes };
}

function lzw(indexes: Uint8Array, minCodeSize: number): Uint8Array {
  const clear = 1 << minCodeSize;
  const end = clear + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = end + 1;
  const dict = new Map<string, number>();
  const out: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const write = (code: number, size: number) => {
    bitBuffer |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      out.push(bitBuffer & 255);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };
  const reset = () => {
    dict.clear();
    codeSize = minCodeSize + 1;
    nextCode = end + 1;
  };
  reset();
  write(clear, codeSize);
  let w = String.fromCharCode(indexes[0]);
  for (let i = 1; i < indexes.length; i++) {
    const k = String.fromCharCode(indexes[i]);
    const wk = w + k;
    if (dict.has(wk)) w = wk;
    else {
      const code = w.length === 1 ? w.charCodeAt(0) : dict.get(w)!;
      write(code, codeSize);
      if (nextCode < 4096) {
        dict.set(wk, nextCode++);
        if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        write(clear, codeSize);
        reset();
      }
      w = k;
    }
  }
  write(w.length === 1 ? w.charCodeAt(0) : dict.get(w)!, codeSize);
  write(end, codeSize);
  if (bitCount) out.push(bitBuffer & 255);
  return Uint8Array.from(out);
}

export function encodeGif(frames: ImageData[], fps: number): Blob {
  const width = frames[0]?.width ?? 1;
  const height = frames[0]?.height ?? 1;
  const delay = Math.max(2, Math.round(100 / Math.max(1, fps)));
  const parts: number[] = [];
  const push = (...bytes: number[]) => parts.push(...bytes);
  const pushStr = (text: string) => {
    for (let i = 0; i < text.length; i++) parts.push(text.charCodeAt(i));
  };
  pushStr('GIF89a');
  push(width & 255, width >> 8, height & 255, height >> 8, 0x70, 0, 0);
  push(0x21, 0xff, 0x0b);
  pushStr('NETSCAPE2.0');
  push(0x03, 0x01, 0x00, 0x00, 0x00);
  for (const frame of frames) {
    const { palette, indexes } = quantize(frame);
    const gctSize = Math.log2(palette.length) - 1;
    push(0x21, 0xf9, 0x04, 0x09, delay & 255, delay >> 8, 0, 0);
    push(0x2c, 0, 0, 0, 0, width & 255, width >> 8, height & 255, height >> 8, 0x80 | gctSize);
    for (const color of palette) {
      push((color >> 16) & 255, (color >> 8) & 255, color & 255);
    }
    const minCode = Math.max(2, Math.ceil(Math.log2(palette.length)));
    const data = lzw(indexes, minCode);
    push(minCode);
    for (let i = 0; i < data.length; i += 255) {
      const chunk = data.subarray(i, i + 255);
      push(chunk.length, ...chunk);
    }
    push(0);
  }
  push(0x3b);
  return new Blob([Uint8Array.from(parts)], { type: 'image/gif' });
}
