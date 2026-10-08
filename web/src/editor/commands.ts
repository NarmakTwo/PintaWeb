import type { Editor } from './document.ts';

export interface Field {
  key: 'a' | 'b' | 'c';
  label: string;
  min: number;
  max: number;
  value: number;
}

export interface AdjustValues {
  a: number;
  b: number;
  c: number;
}

export interface EffectSpec {
  id: string;
  label: string;
  category?: string;
  wasm: number;
  p1: number;
  p2: number;
  p3: number;
  fields?: Field[];
  special?: 'align' | 'feather';
}

const field = (key: Field['key'], label: string, min: number, max: number, value: number): Field => ({ key, label, min, max, value });

export const ADJUSTMENTS: EffectSpec[] = [
  { id: 'auto-level', label: 'Auto Level', wasm: 3, p1: 0, p2: 0, p3: 0 },
  { id: 'black-and-white', label: 'Black and White', wasm: 1, p1: 0, p2: 0, p3: 0 },
  { id: 'brightness-contrast', label: 'Brightness / Contrast', wasm: 4, p1: 0, p2: 0, p3: 0, fields: [field('a', 'Brightness', -100, 100, 0), field('b', 'Contrast', -100, 100, 0)] },
  { id: 'curves', label: 'Curves', wasm: 37, p1: 60, p2: 0, p3: 0, fields: [field('a', 'S-curve', -100, 100, 60)] },
  { id: 'hue-saturation', label: 'Hue / Saturation', wasm: 5, p1: 0, p2: 0, p3: 0, fields: [field('a', 'Hue', -180, 180, 0), field('b', 'Saturation', -100, 100, 0), field('c', 'Lightness', -100, 100, 0)] },
  { id: 'invert', label: 'Invert Colors', wasm: 0, p1: 0, p2: 0, p3: 0 },
  { id: 'levels', label: 'Levels', wasm: 36, p1: 0, p2: 255, p3: 100, fields: [field('a', 'Black point', 0, 254, 0), field('b', 'White point', 1, 255, 255), field('c', 'Gamma', 10, 300, 100)] },
  { id: 'posterize', label: 'Posterize', wasm: 6, p1: 4, p2: 0, p3: 0, fields: [field('a', 'Levels', 2, 32, 4)] },
  { id: 'sepia', label: 'Sepia', wasm: 2, p1: 0, p2: 0, p3: 0 },
];

export const EFFECTS: EffectSpec[] = [
  { id: 'ink-sketch', label: 'Ink Sketch', category: 'Artistic', wasm: 29, p1: 0, p2: 0, p3: 0 },
  { id: 'oil-painting', label: 'Oil Painting', category: 'Artistic', wasm: 19, p1: 2, p2: 0, p3: 0, fields: [field('a', 'Radius', 1, 3, 2)] },
  { id: 'pencil-sketch', label: 'Pencil Sketch', category: 'Artistic', wasm: 30, p1: 0, p2: 0, p3: 0 },
  { id: 'fragment', label: 'Fragment', category: 'Blurs', wasm: 21, p1: 4, p2: 0, p3: 0, fields: [field('a', 'Distance', 1, 20, 4)] },
  { id: 'gaussian-blur', label: 'Gaussian Blur', category: 'Blurs', wasm: 7, p1: 2, p2: 0, p3: 0, fields: [field('a', 'Radius', 1, 8, 2)] },
  { id: 'motion-blur', label: 'Motion Blur', category: 'Blurs', wasm: 14, p1: 8, p2: 0, p3: 0, fields: [field('a', 'Distance', 1, 40, 8), field('b', 'Angle', 0, 360, 0)] },
  { id: 'radial-blur', label: 'Radial Blur', category: 'Blurs', wasm: 32, p1: 8, p2: 0, p3: 0, fields: [field('a', 'Amount', 1, 40, 8)] },
  { id: 'unfocus', label: 'Unfocus', category: 'Blurs', wasm: 38, p1: 3, p2: 0, p3: 0, fields: [field('a', 'Radius', 1, 8, 3)] },
  { id: 'zoom-blur', label: 'Zoom Blur', category: 'Blurs', wasm: 15, p1: 8, p2: 0, p3: 0, fields: [field('a', 'Amount', 1, 40, 8)] },
  { id: 'dithering', label: 'Dithering', category: 'Color', wasm: 24, p1: 2, p2: 0, p3: 0, fields: [field('a', 'Levels', 2, 16, 2)] },
  { id: 'bulge', label: 'Bulge', category: 'Distort', wasm: 16, p1: 40, p2: 0, p3: 0, fields: [field('a', 'Amount', -100, 100, 40)] },
  { id: 'dents', label: 'Dents', category: 'Distort', wasm: 35, p1: 6, p2: 4, p3: 0, fields: [field('a', 'Strength', 1, 30, 6), field('b', 'Seed', 1, 99, 4)] },
  { id: 'frosted-glass', label: 'Frosted Glass', category: 'Distort', wasm: 23, p1: 4, p2: 3, p3: 0, fields: [field('a', 'Distance', 1, 20, 4), field('b', 'Seed', 1, 99, 3)] },
  { id: 'pixelate', label: 'Pixelate', category: 'Distort', wasm: 9, p1: 6, p2: 0, p3: 0, fields: [field('a', 'Cell size', 2, 64, 6)] },
  { id: 'polar-inversion', label: 'Polar Inversion', category: 'Distort', wasm: 33, p1: 50, p2: 0, p3: 0, fields: [field('a', 'Amount', 10, 100, 50)] },
  { id: 'tile-reflection', label: 'Tile Reflection', category: 'Distort', wasm: 22, p1: 16, p2: 0, p3: 0, fields: [field('a', 'Tile size', 2, 128, 16)] },
  { id: 'twist', label: 'Twist', category: 'Distort', wasm: 17, p1: 40, p2: 0, p3: 0, fields: [field('a', 'Amount', -100, 100, 40)] },
  { id: 'add-noise', label: 'Add Noise', category: 'Noise', wasm: 10, p1: 25, p2: 1, p3: 0, fields: [field('a', 'Amount', 1, 100, 25), field('b', 'Seed', 1, 99, 1)] },
  { id: 'median', label: 'Median', category: 'Noise', wasm: 20, p1: 1, p2: 0, p3: 0, fields: [field('a', 'Radius', 1, 2, 1)] },
  { id: 'reduce-noise', label: 'Reduce Noise', category: 'Noise', wasm: 40, p1: 1, p2: 0, p3: 0, fields: [field('a', 'Radius', 1, 2, 1)] },
  { id: 'align-object', label: 'Align Object', category: 'Object', wasm: -1, p1: 0, p2: 0, p3: 0, special: 'align' },
  { id: 'feather-object', label: 'Feather Object', category: 'Object', wasm: -1, p1: 4, p2: 0, p3: 0, special: 'feather', fields: [field('a', 'Radius', 1, 24, 4)] },
  { id: 'outline-object', label: 'Outline Object', category: 'Object', wasm: 43, p1: 2, p2: 0, p3: 0, fields: [field('a', 'Width', 1, 8, 2)] },
  { id: 'glow', label: 'Glow', category: 'Photo', wasm: 31, p1: 3, p2: 0, p3: 0, fields: [field('a', 'Radius', 1, 8, 3)] },
  { id: 'red-eye', label: 'Red Eye Removal', category: 'Photo', wasm: 28, p1: 0, p2: 0, p3: 0 },
  { id: 'sharpen', label: 'Sharpen', category: 'Photo', wasm: 8, p1: 4, p2: 0, p3: 0, fields: [field('a', 'Amount', 1, 20, 4)] },
  { id: 'soften-portrait', label: 'Soften Portrait', category: 'Photo', wasm: 39, p1: 3, p2: 0, p3: 0, fields: [field('a', 'Radius', 1, 8, 3)] },
  { id: 'vignette', label: 'Vignette', category: 'Photo', wasm: 18, p1: 60, p2: 0, p3: 0, fields: [field('a', 'Amount', 0, 100, 60)] },
  { id: 'cells', label: 'Cells', category: 'Render', wasm: 41, p1: 24, p2: 5, p3: 0, fields: [field('a', 'Cell size', 4, 80, 24), field('b', 'Seed', 1, 99, 5)] },
  { id: 'clouds', label: 'Clouds', category: 'Render', wasm: 25, p1: 32, p2: 2, p3: 0, fields: [field('a', 'Scale', 4, 128, 32), field('b', 'Seed', 1, 99, 2)] },
  { id: 'julia-fractal', label: 'Julia Fractal', category: 'Render', wasm: 26, p1: -800, p2: 156, p3: 0, fields: [field('a', 'Real', -2000, 2000, -800), field('b', 'Imaginary', -2000, 2000, 156)] },
  { id: 'mandelbrot-fractal', label: 'Mandelbrot Fractal', category: 'Render', wasm: 27, p1: 0, p2: 0, p3: 0 },
  { id: 'voronoi', label: 'Voronoi Diagram', category: 'Render', wasm: 42, p1: 16, p2: 7, p3: 0, fields: [field('a', 'Sites', 4, 28, 16), field('b', 'Seed', 1, 99, 7)] },
  { id: 'edge-detect', label: 'Edge Detect', category: 'Stylize', wasm: 12, p1: 0, p2: 0, p3: 0 },
  { id: 'emboss', label: 'Emboss', category: 'Stylize', wasm: 11, p1: 0, p2: 0, p3: 0 },
  { id: 'outline-edge', label: 'Outline Edge', category: 'Stylize', wasm: 34, p1: 0, p2: 0, p3: 0 },
  { id: 'relief', label: 'Relief', category: 'Stylize', wasm: 13, p1: 0, p2: 0, p3: 0 },
];

export const ALL_EFFECTS = [...ADJUSTMENTS, ...EFFECTS];

export function valuesFrom(fields: Field[] | undefined): AdjustValues {
  const values = { a: 0, b: 0, c: 0 };
  for (const item of fields ?? []) values[item.key] = item.value;
  return values;
}

export async function performEffect(
  editor: Editor,
  spec: EffectSpec,
  adjust: (title: string, fields: Field[], preview: ((values: AdjustValues) => void) | null) => Promise<AdjustValues | null>,
): Promise<void> {
  if (!editor.doc) return;
  try {
    if (spec.special === 'align') {
      editor.alignObject();
      return;
    }
    if (spec.fields) {
      const preview = spec.special === 'feather' ? null : (values: AdjustValues) => editor.previewRun(spec.wasm, values.a, values.b, values.c);
      if (preview) {
        editor.beginPreview();
        preview(valuesFrom(spec.fields));
      }
      const values = await adjust(spec.label, spec.fields, preview);
      if (!values) {
        editor.cancelPreview();
        return;
      }
      if (spec.special === 'feather') {
        editor.feather(values.a);
        return;
      }
      preview?.(values);
      editor.commitPreview(spec.label);
      return;
    }
    editor.edit(spec.label, data => {
      editor.engine.setColor(editor.primary);
      editor.engine.run(data, spec.wasm, spec.p1, spec.p2, spec.p3);
    });
  } catch (error) {
    editor.cancelPreview();
    editor.toast(error instanceof Error ? error.message : 'The effect could not be applied.');
  }
}
