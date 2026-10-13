/** OpenRaster helpers: stack.xml, XMP pinta:metadata, blend-mode map. */

export const ORA_MIME = 'image/openraster';
export const PINTA_ORA_NS = 'https://pinta-project.com/ora/1.0';

const BLEND_TO_ORA: Record<string, string> = {
  normal: 'svg:src-over',
  multiply: 'svg:multiply',
  screen: 'svg:screen',
  overlay: 'svg:overlay',
  darken: 'svg:darken',
  lighten: 'svg:lighten',
  'color-dodge': 'svg:color-dodge',
  'color-burn': 'svg:color-burn',
  'hard-light': 'svg:hard-light',
  'soft-light': 'svg:soft-light',
  difference: 'svg:difference',
  exclusion: 'svg:exclusion',
  hue: 'svg:hue',
  saturation: 'svg:saturation',
  color: 'svg:color',
  luminosity: 'svg:luminosity',
};

const ORA_TO_BLEND: Record<string, string> = Object.fromEntries(
  Object.entries(BLEND_TO_ORA).map(([blend, ora]) => [ora, blend]),
);

export function oraCompositeOp(blend: string): string {
  return BLEND_TO_ORA[blend] ?? 'svg:src-over';
}

export function blendFromOra(op: string | null | undefined): string {
  if (!op) return 'normal';
  return ORA_TO_BLEND[op] ?? ORA_TO_BLEND[`svg:${op}`] ?? 'normal';
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface OraLayerOut {
  id: number;
  name: string;
  visible: boolean;
  opacity: number;
  blend: string;
  src: string;
  parent: number | null;
}

export interface OraGroupOut {
  id: number;
  name: string;
  visible: boolean;
  parent: number | null;
}

/** Build stack.xml. Layer list is bottom→top (Pinta order); ORA wants topmost first. */
export function buildStackXml(
  width: number,
  height: number,
  layers: OraLayerOut[],
  groups: OraGroupOut[],
): string {
  const byParent = new Map<number | null, OraLayerOut[]>();
  for (const layer of layers) {
    const key = layer.parent;
    const list = byParent.get(key) ?? [];
    list.push(layer);
    byParent.set(key, list);
  }
  const groupKids = new Map<number | null, OraGroupOut[]>();
  for (const group of groups) {
    const key = group.parent;
    const list = groupKids.get(key) ?? [];
    list.push(group);
    groupKids.set(key, list);
  }

  const layerXml = (layer: OraLayerOut): string => {
    const opacity = Math.max(0, Math.min(1, layer.opacity / 100));
    return `<layer name="${esc(layer.name)}" composite-op="${oraCompositeOp(layer.blend)}" opacity="${opacity.toFixed(4)}" visibility="${layer.visible ? 'visible' : 'hidden'}" src="${esc(layer.src)}"/>`;
  };

  const renderStack = (parent: number | null): string => {
    const kids: string[] = [];
    const nested = [...(groupKids.get(parent) ?? [])].reverse();
    for (const group of nested) {
      kids.push(`<stack name="${esc(group.name)}" visibility="${group.visible ? 'visible' : 'hidden'}">${renderStack(group.id)}</stack>`);
    }
    const flat = [...(byParent.get(parent) ?? [])].reverse();
    for (const layer of flat) kids.push(layerXml(layer));
    return kids.join('');
  };

  return `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<image version="0.0.3" w="${width}" h="${height}">`
    + `<stack>${renderStack(null)}</stack>`
    + `</image>\n`;
}

export function buildPintaXmp(manifestJson: string): string {
  const safe = manifestJson.replace(/]]>/g, ']]]]><![CDATA[>');
  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>\n`
    + `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n`
    + `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n`
    + `<rdf:Description rdf:about="" xmlns:pinta="${PINTA_ORA_NS}">\n`
    + `<pinta:metadata><![CDATA[${safe}]]></pinta:metadata>\n`
    + `</rdf:Description>\n`
    + `</rdf:RDF>\n`
    + `</x:xmpmeta>\n`
    + `<?xpacket end="w"?>\n`;
}

export function extractPintaMetadata(xmp: string): string | null {
  const cdata = xmp.match(/<pinta:metadata[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/pinta:metadata>/i);
  if (cdata) return cdata[1];
  const plain = xmp.match(/<pinta:metadata[^>]*>([\s\S]*?)<\/pinta:metadata>/i);
  if (!plain) return null;
  return plain[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
}

export interface OraStackLayer {
  name: string;
  visible: boolean;
  opacity: number;
  blend: string;
  src: string;
  parent: number | null;
}

export interface OraStackGroup {
  id: number;
  name: string;
  visible: boolean;
  parent: number | null;
}

export interface OraStack {
  width: number;
  height: number;
  layers: OraStackLayer[];
  groups: OraStackGroup[];
}

/** Parse a minimal ORA stack.xml into bottom→top layers. */
export function parseStackXml(xml: string): OraStack | null {
  const image = xml.match(/<image\b([^>]*)>/i);
  if (!image) return null;
  const width = Number(/[^\w]w=["']?(\d+)/i.exec(image[1])?.[1]);
  const height = Number(/[^\w]h=["']?(\d+)/i.exec(image[1])?.[1]);
  if (!width || !height) return null;

  const groups: OraStackGroup[] = [];
  const layers: OraStackLayer[] = [];
  let groupSerial = 1;
  const stack: Array<{ id: number | null; kind: 'root' | 'group' }> = [{ id: null, kind: 'root' }];

  const token = /<\/?stack\b[^>]*>|<layer\b[^>]*\/?>/gi;
  let match: RegExpExecArray | null;
  while ((match = token.exec(xml))) {
    const tag = match[0];
    if (/^<\/stack/i.test(tag)) {
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (/^<stack\b/i.test(tag)) {
      const name = /name=["']([^"']*)["']/i.exec(tag)?.[1] ?? 'Group';
      const visible = !/visibility=["']hidden["']/i.test(tag);
      const id = groupSerial++;
      const parent = stack[stack.length - 1]?.id ?? null;
      groups.push({ id, name: decodeXml(name), visible, parent });
      stack.push({ id, kind: 'group' });
      continue;
    }
    if (/^<layer\b/i.test(tag)) {
      const name = /name=["']([^"']*)["']/i.exec(tag)?.[1] ?? 'Layer';
      const src = /src=["']([^"']*)["']/i.exec(tag)?.[1];
      if (!src) continue;
      const opacityAttr = /opacity=["']([^"']*)["']/i.exec(tag)?.[1];
      const opacity = opacityAttr != null ? Math.round(Math.max(0, Math.min(1, Number(opacityAttr))) * 100) : 100;
      const visible = !/visibility=["']hidden["']/i.test(tag);
      const op = /composite-op=["']([^"']*)["']/i.exec(tag)?.[1];
      layers.push({
        name: decodeXml(name),
        visible,
        opacity: Number.isFinite(opacity) ? opacity : 100,
        blend: blendFromOra(op),
        src: decodeXml(src),
        parent: stack[stack.length - 1]?.id ?? null,
      });
    }
  }

  // ORA lists topmost first; Pinta wants bottom→top.
  layers.reverse();
  return { width, height, layers, groups };
}

function decodeXml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
