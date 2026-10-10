import { expect, test, type Page } from '@playwright/test';

const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  (page as Page & { __errors?: string[] }).__errors = errors;
});

test.afterEach(async ({ page }) => {
  const errors = (page as Page & { __errors?: string[] }).__errors ?? [];
  expect(errors, errors.join('\n')).toEqual([]);
});

async function ready(page: Page): Promise<void> {
  await page.goto('/?fresh=1');
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready');
}

async function newCanvas(page: Page, width = 64, height = 64): Promise<void> {
  await page.locator('#menu-file').click();
  await page.locator('[data-command="new"]').click();
  await page.locator('#new-width').fill(String(width));
  await page.locator('#new-height').fill(String(height));
  await page.locator('#new-background').selectOption('white');
  await page.locator('#create-canvas').click();
  await expect(page.locator('#image-dimensions')).toHaveText(`${width} × ${height}`);
}

async function paperPoint(page: Page, xRatio: number, yRatio: number): Promise<{ x: number; y: number }> {
  const box = await page.locator('#paper').boundingBox();
  if (!box) throw new Error('The canvas is not visible.');
  return { x: box.x + box.width * xRatio, y: box.y + box.height * yRatio };
}

async function drag(page: Page, fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
  const start = await paperPoint(page, fromX, fromY);
  const end = await paperPoint(page, toX, toY);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
}

async function pixel(page: Page, xRatio: number, yRatio: number): Promise<number[]> {
  return page.evaluate(({ xRatio, yRatio }) => {
    const canvas = document.querySelector('#image-canvas') as HTMLCanvasElement;
    if (!canvas?.width || !canvas.height) return [255, 255, 255, 0, 0, 0];
    const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(canvas.width * xRatio)));
    const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(canvas.height * yRatio)));
    const data = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data;
    return [data[0], data[1], data[2], data[3], canvas.width, canvas.height];
  }, { xRatio, yRatio });
}

test('switches to dark mode and keeps the choice', async ({ page }) => {
  await ready(page);
  await page.locator('#menu-view').click();
  await page.locator('[data-command="theme-dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#theme-mark')).toHaveText('On');
  const background = await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor);
  expect(background).toBe('rgb(36, 36, 36)');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('starts the pixel engine and lists every tool', async ({ page }) => {
  await ready(page);
  const tools = page.locator('#tool-list [data-tool]');
  await expect(tools).toHaveCount(26);
  const ids = await tools.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-tool')));
  expect(new Set(ids).size).toBe(26);
  expect(ids).not.toContain('clone');
  for (let index = 0; index < 26; index++) {
    await tools.nth(index).click();
    await expect(tools.nth(index)).toHaveAttribute('aria-pressed', 'true');
  }
});

test('draws, undoes, fills, selects, and inverts', async ({ page }) => {
  await ready(page);
  await newCanvas(page);
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#size-slider').fill('12');
  await drag(page, 0.5, 0.5, 0.5, 0.5);
  const drawn = await pixel(page, 0.5, 0.5);
  expect(drawn[0]).toBeLessThan(40);
  await page.locator('#undo').click();
  const undone = await pixel(page, 0.5, 0.5);
  expect(undone[0]).toBeGreaterThan(240);
  await page.locator('#redo').click();
  const redone = await pixel(page, 0.5, 0.5);
  expect(redone[0]).toBeLessThan(40);

  await page.locator('#undo').click();
  await page.locator('#primary-input').fill('#ff0000');
  await page.locator('[data-tool="bucket"]').click();
  const point = await paperPoint(page, 0.5, 0.5);
  await page.mouse.click(point.x, point.y);
  const filled = await pixel(page, 0, 0);
  expect(filled[0]).toBeGreaterThan(200);
  expect(filled[1]).toBeLessThan(30);
  expect(filled[2]).toBeLessThan(30);

  await newCanvas(page);
  await page.locator('[data-tool="rectangle"]').click();
  await page.locator('#size-slider').fill('8');
  await drag(page, 0.15, 0.15, 0.8, 0.7);
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector('#image-canvas') as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 250 || data[i + 1] < 250 || data[i + 2] < 250) return true;
    return false;
  });
  expect(painted).toBe(true);

  await newCanvas(page);
  await page.locator('[data-tool="wand"]').click();
  const wand = await paperPoint(page, 0.4, 0.4);
  await page.mouse.click(wand.x, wand.y);
  await expect(page.locator('#selection-status')).toContainText('×');

  await page.locator('#menu-adjustments').click();
  await page.locator('[data-effect="invert"]').click();
  const inverted = await pixel(page, 0, 0);
  expect(inverted[0]).toBeLessThan(5);
  expect(inverted[1]).toBeLessThan(5);
  expect(inverted[2]).toBeLessThan(5);
});

async function effectsIn(page: Page, selector: string): Promise<{ id: string; dialog: string | null }[]> {
  return page.locator(selector).evaluateAll(nodes => nodes.map(node => ({
    id: node.getAttribute('data-effect') ?? '',
    dialog: node.getAttribute('data-dialog'),
  })));
}

async function showMenu(page: Page, id: string): Promise<void> {
  const panel = page.locator(`#panel-${id}`);
  if (!(await panel.isVisible())) await page.locator(`#menu-${id}`).click();
  await expect(panel).toBeVisible();
}

test('applies every adjustment and effect', async ({ page }) => {
  await ready(page);
  await newCanvas(page, 48, 48);
  const adjustments = await effectsIn(page, '#panel-adjustments [data-effect]');
  const grouped = await effectsIn(page, '#panel-effects [data-effect]');
  expect(adjustments.length + grouped.length).toBeGreaterThanOrEqual(46);
  for (const effect of adjustments) {
    await showMenu(page, 'adjustments');
    await page.locator(`#panel-adjustments [data-effect="${effect.id}"]`).click();
    if (effect.dialog === '1') await page.locator('#adjust-ok').click();
  }
  const categories = await page.locator('#panel-effects [data-category-toggle]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-category-toggle') ?? ''));
  for (const category of categories) {
    const effects = await effectsIn(page, `#panel-effects [data-category="${category}"]`);
    for (const effect of effects) {
      await showMenu(page, 'effects');
      const toggle = page.locator(`[data-category-toggle="${category}"]`);
      const submenu = toggle.locator('xpath=following-sibling::*[1]');
      if (!(await submenu.isVisible())) await toggle.click();
      await page.locator(`#panel-effects [data-effect="${effect.id}"]`).click();
      if (effect.dialog === '1') await page.locator('#adjust-ok').click();
    }
  }
  await expect(page.locator('#image-dimensions')).toHaveText('48 × 48');
});

test('imports and exports an image', async ({ page }) => {
  await ready(page);
  await page.locator('#file-input').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: RED_PNG });
  await expect(page.locator('#image-dimensions')).toHaveText('1 × 1');
  const imported = await pixel(page, 0, 0);
  expect(imported[0]).toBeGreaterThan(200);
  expect(imported[1]).toBeLessThan(40);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#menu-file').click();
  await page.locator('[data-command="save-as"]').click();
  await page.locator('#export-name').fill('test-image');
  await page.locator('#export-format').selectOption('image/png');
  await page.locator('#confirm-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('test-image.png');
  expect((await download.createReadStream()) !== null).toBe(true);
});

test('adds a layer and restores the image from IndexedDB', async ({ page }) => {
  await ready(page);
  await newCanvas(page);
  await page.locator('#menu-layers').click();
  await page.locator('#panel-layers [data-command="layer-add"]').click();
  await expect(page.locator('#layer-list .layer')).toHaveCount(2);

  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#size-slider').fill('16');
  await expect(page.locator('#app')).toHaveAttribute('data-save-state', 'Saved locally');
  const serial = await page.locator('#app').getAttribute('data-save-serial');
  await drag(page, 0.5, 0.5, 0.52, 0.52);
  await page.waitForFunction(previous => {
    const app = document.querySelector('#app');
    return app?.getAttribute('data-save-state') === 'Saved locally' && app.getAttribute('data-save-serial') !== previous;
  }, serial);
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready');
  await expect.poll(async () => (await pixel(page, 0.5, 0.5))[0]).toBeLessThan(40);
});

test('can use every tool without a script error', async ({ page }) => {
  await ready(page);
  await newCanvas(page);
  const ids = await page.locator('#tool-list [data-tool]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-tool') ?? ''));
  for (const id of ids) {
    await page.locator(`[data-tool="${id}"]`).click();
    if (id === 'bucket' || id === 'wand' || id === 'picker') {
      const point = await paperPoint(page, 0.3, 0.3);
      await page.mouse.click(point.x, point.y);
    } else if (id === 'text') {
      const point = await paperPoint(page, 0.2, 0.2);
      await page.mouse.click(point.x, point.y);
      await page.locator('#text-editor').fill('Pinta');
      await page.locator('#text-editor').press('Enter');
    } else await drag(page, 0.2, 0.2, 0.7, 0.6);
    await expect(page.locator('#image-canvas')).toBeVisible();
  }
});

test('scales a selection and deselects with Ctrl+D', async ({ page }) => {
  await ready(page);
  await newCanvas(page);
  await page.locator('[data-tool="rect-select"]').click();
  await drag(page, 0.2, 0.2, 0.8, 0.8);
  await expect(page.locator('[data-tool="move-pixels"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Control+d');
  await expect(page.locator('#selection-status')).toHaveText('No selection');

  await page.locator('#primary-input').fill('#ff0000');
  await page.locator('[data-tool="bucket"]').click();
  const point = await paperPoint(page, 0.5, 0.5);
  await page.mouse.click(point.x, point.y);
  await page.keyboard.press('Control+a');
  await expect(page.locator('[data-tool="move-pixels"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.down('Control');
  await drag(page, 0.02, 0.02, 0.35, 0.35);
  await page.keyboard.up('Control');
  const corner = await pixel(page, 0, 0);
  const center = await pixel(page, 0.5, 0.5);
  expect(corner[3]).toBeLessThan(10);
  expect(center[0]).toBeGreaterThan(200);
  expect(center[1]).toBeLessThan(40);
});

test('shift during a scale or rotation constrains the original image', async ({ page }) => {
  await ready(page);
  await newCanvas(page);
  await page.locator('#primary-input').fill('#ff0000');
  await page.locator('[data-tool="bucket"]').click();
  const fill = await paperPoint(page, 0.5, 0.5);
  await page.mouse.click(fill.x, fill.y);
  await page.keyboard.press('Control+a');

  await page.keyboard.down('Control');
  const scaleStart = await paperPoint(page, 0.02, 0.5);
  const scaleEnd = await paperPoint(page, 0.45, 0.5);
  await page.mouse.move(scaleStart.x, scaleStart.y);
  await page.mouse.down();
  await page.mouse.move(scaleEnd.x, scaleEnd.y, { steps: 6 });
  await page.keyboard.down('Shift');
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.keyboard.up('Control');
  const scaledEdge = await pixel(page, 0.5, 0);
  expect(scaledEdge[3]).toBeLessThan(10);

  await newCanvas(page);
  await page.locator('#primary-input').fill('#ff0000');
  await page.locator('[data-tool="bucket"]').click();
  const refill = await paperPoint(page, 0.5, 0.5);
  await page.mouse.click(refill.x, refill.y);
  await page.keyboard.press('Control+a');
  await page.keyboard.down('Alt');
  const rotateStart = await paperPoint(page, 0.9, 0.5);
  const rotateEnd = await paperPoint(page, 0.9, 0.54);
  await page.mouse.move(rotateStart.x, rotateStart.y);
  await page.mouse.down();
  await page.mouse.move(rotateEnd.x, rotateEnd.y, { steps: 4 });
  await page.keyboard.down('Shift');
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');
  const corner = await pixel(page, 0, 0);
  expect(corner[0]).toBeGreaterThan(200);
  expect(corner[3]).toBeGreaterThan(200);
});

test('layers, eyedropper, transparency, and pinta export', async ({ page }) => {
  await ready(page);
  await expect(page.locator('#engine-status')).toHaveCount(0);
  await expect(page.locator('#save-state')).toHaveCount(0);
  await expect(page.locator('#tool-context')).toHaveCount(0);
  await expect(page.locator('#alpha-slider')).toBeVisible();

  await newCanvas(page, 48, 48);
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('[data-tool="picker"]').click();
  await expect(page.locator('[data-tool="picker"]')).toHaveAttribute('aria-pressed', 'true');
  const sample = await paperPoint(page, 0.5, 0.5);
  await page.mouse.click(sample.x, sample.y);
  await expect(page.locator('[data-tool="pencil"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#primary-input')).toHaveValue('#ffffff');
  await page.locator('#alpha-slider').fill('128');
  const swatch = await page.locator('#primary-swatch').evaluate(element => getComputedStyle(element).backgroundColor);
  const channels = swatch.match(/[\d.]+/g)?.map(Number) ?? [];
  expect(channels[3] ?? 1).toBeGreaterThan(0.4);
  expect(channels[3] ?? 1).toBeLessThan(0.6);
  await page.locator('#alpha-slider').fill('255');
  await page.locator('#primary-input').fill('#ff0000');
  await page.locator('[data-tool="bucket"]').click();
  await page.mouse.click(sample.x, sample.y);
  await page.locator('#primary-input').fill('#000000');
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#size-slider').fill('3');
  const mark = await paperPoint(page, 0.2, 0.25);
  await page.mouse.click(mark.x, mark.y);
  expect((await pixel(page, 0.2, 0.25))[0]).toBeLessThan(40);
  expect((await pixel(page, 0.7, 0.7))[0]).toBeGreaterThan(200);

  const rows = () => page.locator('#layer-list .layer-row[data-layer]');
  const menu = page.locator('#context-menu');
  const openLayer = async (nth = 0) => {
    await rows().nth(nth).click({ button: 'right' });
    await expect(menu).toBeVisible();
  };
  const choose = async (name: string) => {
    await menu.getByRole('button', { name, exact: true }).click();
    await expect(menu).toBeHidden();
  };

  const onScreen = async (locator: ReturnType<Page['locator']>) => {
    const box = await locator.boundingBox();
    const view = page.viewportSize();
    expect(box).toBeTruthy();
    expect(view).toBeTruthy();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual((view?.width ?? 0) + 1);
    expect(box!.y + box!.height).toBeLessThanOrEqual((view?.height ?? 0) + 1);
    const scroll = await locator.evaluate(element => element.scrollHeight - element.clientHeight);
    expect(scroll).toBeLessThanOrEqual(1);
  };

  await openLayer();
  await onScreen(menu);
  await menu.locator('.menu-sub', { hasText: 'Blending mode' }).hover();
  const blend = menu.locator('.menu-sub', { hasText: 'Blending mode' });
  const blendMenu = blend.locator('.submenu');
  await expect(blendMenu).toBeVisible();
  await onScreen(blendMenu);
  const blendBox = await blend.boundingBox();
  const blendMenuBox = await blendMenu.boundingBox();
  expect(blendMenuBox!.x).toBeLessThan(blendBox!.x);
  await menu.locator('.menu-sub', { hasText: 'Color tag' }).hover();
  const tags = menu.locator('.menu-sub', { hasText: 'Color tag' }).locator('.submenu');
  await expect(tags.getByRole('button', { name: 'White', exact: true })).toBeVisible();
  await expect(tags.getByRole('button', { name: 'Red', exact: true })).toBeVisible();
  await expect(tags.getByRole('button', { name: 'None', exact: true })).toHaveCount(0);
  await expect(page.locator('#layer-list .tag').first()).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.keyboard.press('Escape');

  await openLayer();
  const theme = await page.locator('html').getAttribute('data-theme');
  await expect(menu).toHaveCSS('background-color', theme === 'dark' ? 'rgb(48, 48, 48)' : 'rgb(255, 255, 255)');
  await page.keyboard.press('Escape');
  await page.locator('#menu-view').click();
  await page.locator('[data-command="theme-dark"]').click();
  await openLayer();
  await expect(menu).toHaveCSS('background-color', theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(48, 48, 48)');
  await page.keyboard.press('Escape');
  await page.locator('#menu-view').click();
  await page.locator('[data-command="theme-dark"]').click();

  await openLayer();
  await choose('Duplicate layer');
  await expect(rows()).toHaveCount(2);

  await openLayer();
  await choose('Invert colors');
  const inverted = await pixel(page, 0.7, 0.7);
  expect(inverted[0]).toBeLessThan(20);
  expect(inverted[1]).toBeGreaterThan(200);
  expect(inverted[2]).toBeGreaterThan(200);
  const whitened = await pixel(page, 0.2, 0.25);
  expect(whitened[0]).toBeGreaterThan(200);
  expect(whitened[1]).toBeGreaterThan(200);
  expect(whitened[2]).toBeGreaterThan(200);

  await openLayer();
  await choose('Flip horizontal');
  const flipped = await pixel(page, 0.8, 0.25);
  expect(flipped[0]).toBeGreaterThan(200);
  expect(flipped[1]).toBeGreaterThan(200);
  expect((await pixel(page, 0.2, 0.25))[1]).toBeGreaterThan(200);
  expect((await pixel(page, 0.2, 0.25))[0]).toBeLessThan(20);
  await openLayer();
  await choose('Flip vertical');
  expect((await pixel(page, 0.8, 0.73))[0]).toBeGreaterThan(200);
  expect((await pixel(page, 0.8, 0.25))[0]).toBeLessThan(20);

  await openLayer();
  await choose('Select pixels');
  await expect(page.locator('#selection-status')).toContainText('×');
  await page.keyboard.press('Control+d');
  await expect(page.locator('#selection-status')).toHaveText('No selection');

  await openLayer();
  await menu.locator('.menu-sub', { hasText: 'Blending mode' }).hover();
  await choose('multiply');
  expect((await pixel(page, 0.7, 0.7))[0]).toBeLessThan(20);
  expect((await pixel(page, 0.7, 0.7))[1]).toBeLessThan(20);
  await openLayer();
  await menu.locator('.menu-sub', { hasText: 'Blending mode' }).hover();
  await choose('normal');
  expect((await pixel(page, 0.7, 0.7))[1]).toBeGreaterThan(200);
  await openLayer();
  await menu.locator('.menu-slider input').evaluate((input: HTMLInputElement) => {
    input.value = '40';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const faded = await pixel(page, 0.7, 0.7);
  expect(faded[0]).toBeGreaterThan(120);
  expect(faded[0]).toBeLessThan(190);
  expect(faded[1]).toBeGreaterThan(70);
  expect(faded[1]).toBeLessThan(140);
  await openLayer();
  await menu.locator('.menu-slider input').evaluate((input: HTMLInputElement) => {
    input.value = '100';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect((await pixel(page, 0.7, 0.7))[1]).toBeGreaterThan(200);

  await openLayer(1);
  await choose('Clear layer');
  await rows().nth(1).locator('.layer').click();
  await page.locator('#primary-input').fill('#ff0000');
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#size-slider').fill('8');
  const dot = await paperPoint(page, 0.5, 0.5);
  await page.mouse.click(dot.x, dot.y);
  await openLayer(0);
  await choose('Clipping mask');
  expect((await pixel(page, 0.08, 0.08))[3]).toBeLessThan(10);
  expect((await pixel(page, 0.5, 0.5))[3]).toBeGreaterThan(200);
  await openLayer(0);
  await choose('Clipping mask');
  expect((await pixel(page, 0.08, 0.08))[3]).toBeGreaterThan(200);
  await rows().nth(1).locator('.layer').click();
  await page.locator('[data-tool="bucket"]').click();
  const empty = await paperPoint(page, 0.08, 0.08);
  await page.mouse.click(empty.x, empty.y);
  await page.locator('#layer-list input[data-visible]').first().uncheck();
  expect((await pixel(page, 0.7, 0.7))[0]).toBeGreaterThan(200);
  expect((await pixel(page, 0.7, 0.7))[1]).toBeLessThan(30);
  await page.locator('#layer-list input[data-visible]').first().check();
  expect((await pixel(page, 0.7, 0.7))[1]).toBeGreaterThan(200);

  await openLayer();
  await choose('Group layer');
  await expect(page.locator('.group-row')).toHaveCount(1);
  await page.locator('.group-row').click({ button: 'right' });
  await choose('Rename');
  await page.locator('.layer-rename').fill('Folder');
  await page.locator('.layer-rename').press('Enter');
  await expect(page.locator('.group-row .layer-name')).toHaveText('Folder');
  await page.locator('.group-row').click({ button: 'right' });
  await menu.locator('.menu-sub', { hasText: 'Color tag' }).hover();
  await choose('Green');
  await expect(page.locator('.group-row .tag')).toHaveCSS('background-color', 'rgb(46, 194, 126)');
  await page.locator('[data-group-visible]').uncheck();
  expect((await pixel(page, 0.7, 0.7))[0]).toBeGreaterThan(200);
  expect((await pixel(page, 0.7, 0.7))[1]).toBeLessThan(30);
  await page.locator('[data-group-visible]').check();
  expect((await pixel(page, 0.7, 0.7))[1]).toBeGreaterThan(200);
  await page.locator('[data-collapse]').click();
  await expect(rows()).toHaveCount(1);
  expect((await pixel(page, 0.7, 0.7))[1]).toBeGreaterThan(200);
  await page.locator('[data-collapse]').click();
  await page.locator('.group-row').click({ button: 'right' });
  await choose('Add layer inside');
  await expect(rows()).toHaveCount(3);
  await openLayer();
  await choose('Remove from group');
  await page.locator('.group-row').click({ button: 'right' });
  await choose('Ungroup');
  await expect(page.locator('.group-row')).toHaveCount(0);
  await openLayer();
  await choose('Group layer');
  await page.locator('.group-row').click({ button: 'right' });
  await choose('Flatten group');
  await expect(page.locator('.group-row')).toHaveCount(0);
  await expect(rows()).toHaveCount(3);

  await openLayer();
  await menu.locator('.menu-sub', { hasText: 'Blending mode' }).hover();
  await choose('multiply');
  await openLayer();
  await menu.locator('.menu-sub', { hasText: 'Color tag' }).hover();
  await choose('Red');
  await expect(page.locator('#layer-list .layer-row[data-layer] .tag').first()).toHaveCSS('background-color', 'rgb(192, 28, 40)');
  await openLayer();
  await menu.locator('.menu-slider input').evaluate((input: HTMLInputElement) => {
    input.value = '40';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(menu).toBeHidden();
  await expect(page.locator('.layer-row[data-layer] .layer-meta').first()).toHaveText('40%');

  await openLayer();
  await choose('Rename');
  await page.locator('.layer-rename').fill('Ink');
  await page.locator('.layer-rename').press('Enter');
  await expect(page.locator('.layer-row[data-layer] .layer-name').first()).toHaveText('Ink');

  const topName = await page.locator('.layer-row[data-layer] .layer-name').first().innerText();
  const nextName = await page.locator('.layer-row[data-layer] .layer-name').nth(1).innerText();
  await rows().first().dragTo(rows().nth(1));
  await expect(page.locator('.layer-row[data-layer] .layer-name').first()).toHaveText(nextName);
  await expect(page.locator('.layer-row[data-layer] .layer-name').nth(1)).toHaveText(topName);

  const checks = page.locator('#layer-list input[data-visible]');
  const visibleCount = await checks.count();
  for (let index = 0; index < visibleCount; index++) await checks.nth(index).uncheck();
  expect((await pixel(page, 0.7, 0.7))[3]).toBeLessThan(10);
  for (let index = 0; index < visibleCount; index++) await checks.nth(index).check();
  expect((await pixel(page, 0.7, 0.7))[3]).toBeGreaterThan(200);

  const beforeAdd = await rows().count();
  await openLayer();
  await choose('Add layer above');
  await expect(rows()).toHaveCount(beforeAdd + 1);
  await openLayer();
  await choose('Add layer below');
  await expect(rows()).toHaveCount(beforeAdd + 2);
  await openLayer();
  await choose('Merge layer below');
  await expect(rows()).toHaveCount(beforeAdd + 1);
  await openLayer();
  await choose('Clear layer');
  await openLayer();
  await choose('Delete layer');
  await expect(rows()).toHaveCount(beforeAdd);
  await page.locator('#layer-list').click({ button: 'right', position: { x: 8, y: 8 } });
  await choose('Flatten image');
  await expect(rows()).toHaveCount(1);

  await page.locator('#history-list .history-item').first().click({ button: 'right' });
  await expect(menu).toContainText('Revert to here');
  await page.keyboard.press('Escape');
  await page.locator('.tab').first().click({ button: 'right' });
  await expect(menu).toContainText('Close');
  await page.keyboard.press('Escape');
  const colorSwatch = page.locator('#palette button').first();
  await colorSwatch.click({ button: 'right' });
  await expect(menu).toContainText('Use as primary');
  await page.keyboard.press('Escape');
  await page.locator('#paper').click({ button: 'right' });
  await expect(menu).toBeHidden();

  await page.locator('#layer-list input[data-visible]').uncheck();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#menu-file').click();
  await page.locator('[data-command="save-as"]').click();
  await page.locator('#export-name').fill('stack');
  await page.locator('#export-format').selectOption('application/pinta');
  await page.locator('#confirm-export').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('stack.pinta');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  if (!stream) throw new Error('The .pinta download was empty.');
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const archive = Buffer.concat(chunks);
  const text = archive.toString('utf8');
  const currentLayers = text.slice(text.indexOf('"layers":['), text.indexOf('"history"'));
  expect(archive.subarray(0, 2).toString()).toBe('PK');
  expect(text).toContain('manifest.json');
  expect(text).toContain('"format":"pinta"');
  expect(text).toContain('"width":48');
  expect(text).toContain('"settings"');
  expect(text).toContain('"history"');
  expect(currentLayers).toContain('"visible":false');
  expect(currentLayers).toMatch(/"file":"\d+\.png"/);
});

test('pen, tone tools, lasso, outlines, selection transforms, and title rename', async ({ page }) => {
  await ready(page);
  await expect(page.locator('[data-tool="clone"]')).toHaveCount(0);
  for (const id of ['pen', 'lasso', 'lasso-draw', 'lighten', 'darken', 'dither']) {
    await expect(page.locator(`[data-tool="${id}"] svg`)).toHaveCount(1);
  }
  const pen = page.locator('[data-tool="pen"] svg');
  await expect(pen).toHaveCSS('width', '18px');
  await expect(pen).toHaveCSS('height', '18px');
  const penFill = await page.locator('[data-tool="pen"] path').evaluate(element => getComputedStyle(element).fill);
  expect(penFill).toBe('rgb(36, 31, 49)');
  const lassoDash = await page.locator('[data-tool="lasso"] path').first().evaluate(element => element.getAttribute('stroke-dasharray'));
  expect(lassoDash).toBeTruthy();
  await expect(page.locator('[data-tool="lasso-draw"] svg')).toHaveAttribute('class', /lucide-lasso/);
  await page.locator('#menu-view').click();
  await page.locator('[data-command="theme-dark"]').click();
  const darkFill = await page.locator('[data-tool="pen"] path').evaluate(element => getComputedStyle(element).fill);
  expect(darkFill).toBe('rgb(255, 255, 255)');
  await page.locator('#menu-view').click();
  await page.locator('[data-command="theme-dark"]').click();

  await newCanvas(page, 64, 64);
  await page.locator('#document-name').dblclick();
  const rename = page.locator('.document-rename');
  await rename.fill('Harbor');
  await rename.press('Enter');
  await expect(page.locator('#document-name')).toContainText('Harbor');
  await page.locator('#document-name').dblclick();
  await page.locator('.document-rename').fill('   ');
  await page.locator('.document-rename').press('Enter');
  await expect(page.locator('#document-name')).toContainText('Harbor');
  await page.locator('#document-name').dblclick();
  await page.locator('.document-rename').fill('Nope');
  await page.locator('.document-rename').press('Escape');
  await expect(page.locator('#document-name')).toContainText('Harbor');

  await page.locator('#primary-input').fill('#ff0000');
  await page.locator('#secondary-input').fill('#0000ff');
  await page.locator('[data-tool="rectangle"]').click();
  await page.locator('#shape-select').selectOption('both');
  await page.locator('#size-slider').fill('8');
  await drag(page, 0.2, 0.2, 0.8, 0.8);
  const colors = await page.evaluate(() => {
    const canvas = document.querySelector('#image-canvas') as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0;
    let blue = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 180 && data[i + 2] < 80) red += 1;
      if (data[i + 2] > 180 && data[i] < 80) blue += 1;
    }
    return { red, blue };
  });
  expect(colors.red).toBeGreaterThan(20);
  expect(colors.blue).toBeGreaterThan(8);

  await newCanvas(page, 64, 64);
  await page.locator('#primary-input').fill('#000000');
  await page.locator('[data-tool="pen"]').click();
  await page.locator('#size-slider').fill('22');
  const slowStart = await paperPoint(page, 0.15, 0.35);
  const slowEnd = await paperPoint(page, 0.85, 0.35);
  await page.mouse.move(slowStart.x, slowStart.y);
  await page.mouse.down();
  await page.mouse.move(slowEnd.x, slowEnd.y, { steps: 40 });
  await page.mouse.up();
  const slow = await pixel(page, 0.5, 0.47);
  await page.locator('#undo').click();
  const fastStart = await paperPoint(page, 0.15, 0.35);
  const fastEnd = await paperPoint(page, 0.85, 0.35);
  await page.mouse.move(fastStart.x, fastStart.y);
  await page.mouse.down();
  await page.mouse.move(fastEnd.x, fastEnd.y, { steps: 1 });
  await page.mouse.up();
  const fast = await pixel(page, 0.5, 0.47);
  expect(slow[0]).toBeLessThan(40);
  expect(fast[0]).toBeGreaterThan(200);

  await newCanvas(page, 64, 64);
  await page.locator('[data-tool="brush"]').click();
  await page.locator('#size-slider').fill('6');
  await drag(page, 0.1, 0.5, 0.9, 0.5);
  expect((await pixel(page, 0.5, 0.5))[0]).toBeLessThan(40);

  await newCanvas(page, 64, 64);
  await page.locator('#primary-input').fill('#ff0000');
  await page.locator('[data-tool="bucket"]').click();
  await page.mouse.click((await paperPoint(page, 0.5, 0.5)).x, (await paperPoint(page, 0.5, 0.5)).y);
  await page.locator('[data-tool="lighten"]').click();
  await page.locator('#size-slider').fill('16');
  await page.mouse.click((await paperPoint(page, 0.5, 0.5)).x, (await paperPoint(page, 0.5, 0.5)).y);
  const lifted = await pixel(page, 0.5, 0.5);
  expect(lifted[1]).toBeGreaterThan(40);
  expect(lifted[0]).toBeGreaterThan(200);
  await page.locator('[data-tool="darken"]').click();
  await page.mouse.click((await paperPoint(page, 0.2, 0.2)).x, (await paperPoint(page, 0.2, 0.2)).y);
  expect((await pixel(page, 0.2, 0.2))[0]).toBeLessThan(200);

  await newCanvas(page, 64, 64);
  await page.locator('#primary-input').fill('#000000');
  await page.locator('[data-tool="dither"]').click();
  await page.locator('#size-slider').fill('18');
  await page.mouse.click((await paperPoint(page, 0.5, 0.5)).x, (await paperPoint(page, 0.5, 0.5)).y);
  const stipple = await page.evaluate(() => {
    const canvas = document.querySelector('#image-canvas') as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    let paper = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 40 && data[i + 3] > 200) ink += 1;
      else paper += 1;
    }
    return { ink, paper };
  });
  expect(stipple.ink).toBeGreaterThan(8);
  expect(stipple.paper).toBeGreaterThan(stipple.ink);

  await newCanvas(page, 64, 64);
  await page.locator('[data-tool="lasso"]').click();
  const lassoStart = await paperPoint(page, 0.2, 0.2);
  await page.mouse.move(lassoStart.x, lassoStart.y);
  await page.mouse.down();
  await page.mouse.move((await paperPoint(page, 0.75, 0.3)).x, (await paperPoint(page, 0.75, 0.3)).y, { steps: 4 });
  await page.mouse.move((await paperPoint(page, 0.6, 0.8)).x, (await paperPoint(page, 0.6, 0.8)).y, { steps: 4 });
  const ants = await page.evaluate(() => {
    const canvas = document.querySelector('#overlay-canvas') as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let marks = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) marks += 1;
    return marks;
  });
  expect(ants).toBeGreaterThan(8);
  await page.mouse.up();
  await expect(page.locator('#selection-status')).toContainText('×');

  await newCanvas(page, 64, 64);
  await page.locator('#primary-input').fill('#000000');
  await page.locator('[data-tool="lasso-draw"]').click();
  await page.locator('#shape-select').selectOption('outline');
  await drag(page, 0.2, 0.2, 0.7, 0.6);
  expect((await pixel(page, 0.2, 0.2))[0]).toBeLessThan(80);

  await newCanvas(page, 64, 64);
  await page.locator('#primary-input').fill('#ff0000');
  await page.locator('[data-tool="bucket"]').click();
  await page.mouse.click((await paperPoint(page, 0.5, 0.5)).x, (await paperPoint(page, 0.5, 0.5)).y);
  await page.locator('[data-tool="rect-select"]').click();
  await drag(page, 0.25, 0.35, 0.75, 0.65);
  await page.locator('[data-tool="move-selection"]').click();
  const before = await page.locator('#selection-status').innerText();
  const readBox = (text: string) => {
    const match = text.match(/(\d+),\s*(\d+),\s*(\d+)\s*×\s*(\d+)/);
    if (!match) throw new Error(text);
    return { w: Number(match[3]), h: Number(match[4]) };
  };
  await drag(page, 0.4, 0.5, 0.55, 0.5);
  expect((await pixel(page, 0.1, 0.1))[0]).toBeGreaterThan(200);
  const moved = readBox(await page.locator('#selection-status').innerText());
  const original = readBox(before);
  expect(moved.w).toBe(original.w);
  await page.keyboard.down('Control');
  await drag(page, 0.75, 0.65, 0.95, 0.9);
  await page.keyboard.up('Control');
  const scaled = readBox(await page.locator('#selection-status').innerText());
  expect(Math.max(scaled.w, scaled.h)).toBeGreaterThan(Math.max(original.w, original.h));
  await page.keyboard.down('Alt');
  await drag(page, 0.7, 0.35, 0.9, 0.15);
  await page.keyboard.up('Alt');
  const rotated = readBox(await page.locator('#selection-status').innerText());
  expect(rotated.w !== scaled.w || rotated.h !== scaled.h).toBe(true);
  expect((await pixel(page, 0.1, 0.1))[0]).toBeGreaterThan(200);
});

test('tool options give focus back so undo still works', async ({ page }) => {
  await ready(page);
  await newCanvas(page, 64, 64);
  await page.locator('[data-tool="brush"]').click();
  await page.locator('#primary-input').fill('#000000');
  await drag(page, 0.2, 0.2, 0.6, 0.6);
  expect((await pixel(page, 0.4, 0.4))[0]).toBeLessThan(40);
  await page.locator('#brush-select').selectOption('squares');
  await expect(page.locator('#brush-select')).not.toBeFocused();
  await page.keyboard.press('Control+z');
  expect((await pixel(page, 0.4, 0.4))[0]).toBeGreaterThan(200);
});

test('lasso even-odd, inverse dither, global recolor, tone amount, and random brush', async ({ page }) => {
  await ready(page);
  await expect(page.locator('[data-tool="freeform"]')).toHaveCount(0);
  const icon = page.locator('[data-tool="random"] svg');
  await expect(icon).toHaveCount(1);
  await expect(icon).toHaveAttribute('fill', 'currentColor');
  const iconBox = await icon.boundingBox();
  expect(iconBox?.width ?? 0).toBeGreaterThan(16);
  expect(iconBox?.width ?? 0).toBeLessThan(20);

  const star = Array.from({ length: 5 }, (_, index) => {
    const angle = -Math.PI / 2 + index * (4 * Math.PI / 5);
    return { x: 0.5 + 0.34 * Math.cos(angle), y: 0.5 + 0.34 * Math.sin(angle) };
  });
  const traceStar = async () => {
    const first = await paperPoint(page, star[0].x, star[0].y);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const point of [...star.slice(1), star[0]]) {
      const next = await paperPoint(page, point.x, point.y);
      await page.mouse.move(next.x, next.y, { steps: 3 });
    }
    await page.mouse.up();
  };

  await newCanvas(page, 64, 64);
  await page.locator('[data-tool="lasso-draw"]').click();
  await page.locator('#shape-select').selectOption('fill');
  await page.locator('#primary-input').fill('#ff0000');
  await traceStar();
  const drawnArm = await pixel(page, 0.5, 0.28);
  const drawnHole = await pixel(page, 0.5, 0.5);
  expect(drawnArm[0]).toBeGreaterThan(200);
  expect(drawnArm[1]).toBeLessThan(40);
  expect(drawnHole[0]).toBeGreaterThan(200);
  expect(drawnHole[1]).toBeGreaterThan(200);

  await newCanvas(page, 64, 64);
  await page.locator('[data-tool="lasso"]').click();
  await page.locator('#primary-input').fill('#ff0000');
  await traceStar();
  await page.locator('#menu-edit').click();
  await page.locator('[data-command="fill-selection"]').click();
  const selectedArm = await pixel(page, 0.5, 0.28);
  const selectedHole = await pixel(page, 0.5, 0.5);
  expect(selectedArm[0]).toBeGreaterThan(200);
  expect(selectedArm[1]).toBeLessThan(40);
  expect(selectedHole[1]).toBeGreaterThan(200);

  await newCanvas(page, 64, 64);
  await page.locator('[data-tool="dither"]').click();
  await page.locator('#size-slider').fill('20');
  await page.locator('#primary-input').fill('#ff0000');
  await page.locator('#secondary-input').fill('#000000');
  const ditherAt = await paperPoint(page, 0.5, 0.5);
  await page.mouse.click(ditherAt.x, ditherAt.y);
  const leftPrimary = await pixel(page, 32 / 64, 32 / 64);
  const leftSecondary = await pixel(page, 33 / 64, 32 / 64);
  expect(leftPrimary[0]).toBeGreaterThan(200);
  expect(leftPrimary[1]).toBeLessThan(40);
  expect(leftSecondary[0]).toBeGreaterThan(200);
  expect(leftSecondary[1]).toBeGreaterThan(200);

  await newCanvas(page, 64, 64);
  const rightAt = await paperPoint(page, 0.5, 0.5);
  await page.mouse.click(rightAt.x, rightAt.y, { button: 'right' });
  const rightPrimary = await pixel(page, 32 / 64, 32 / 64);
  const rightSecondary = await pixel(page, 33 / 64, 32 / 64);
  expect(rightPrimary[0]).toBeGreaterThan(200);
  expect(rightPrimary[1]).toBeGreaterThan(200);
  expect(rightSecondary[0]).toBeLessThan(40);

  await newCanvas(page, 64, 64);
  const bothAt = await paperPoint(page, 0.5, 0.5);
  await page.mouse.move(bothAt.x, bothAt.y);
  await page.mouse.down();
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await page.mouse.up();
  const bothPrimary = await pixel(page, 32 / 64, 32 / 64);
  const bothSecondary = await pixel(page, 33 / 64, 32 / 64);
  expect(bothPrimary[0]).toBeGreaterThan(200);
  expect(bothPrimary[1]).toBeLessThan(40);
  expect(bothSecondary[0]).toBeLessThan(40);

  const bucket = async (color: string) => {
    await page.locator('#primary-input').fill(color);
    await page.locator('[data-tool="bucket"]').click();
    const point = await paperPoint(page, 0.5, 0.5);
    await page.mouse.click(point.x, point.y);
  };

  await newCanvas(page, 64, 64);
  await bucket('#ff0000');
  await page.locator('[data-tool="lighten"]').click();
  await page.locator('#tone-amount').fill('50');
  await page.locator('#tone-rate').fill('0');
  await page.locator('#size-slider').fill('16');
  const toneStart = await paperPoint(page, 0.4, 0.5);
  const toneEnd = await paperPoint(page, 0.7, 0.5);
  await page.mouse.move(toneStart.x, toneStart.y);
  await page.mouse.down();
  await page.mouse.move(toneEnd.x, toneEnd.y, { steps: 6 });
  await page.mouse.move(toneStart.x, toneStart.y, { steps: 6 });
  await page.mouse.up();
  const even = await pixel(page, 0.5, 0.5);
  expect(even[1]).toBeGreaterThan(100);
  expect(even[1]).toBeLessThan(160);

  await page.locator('#tone-rate').fill('10');
  const hold = await paperPoint(page, 0.2, 0.2);
  await page.mouse.move(hold.x, hold.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  expect((await pixel(page, 0.2, 0.2))[1]).toBeGreaterThan(170);

  await newCanvas(page, 64, 64);
  await page.locator('[data-tool="darken"]').click();
  await page.locator('#tone-amount').fill('100');
  await page.locator('#tone-rate').fill('0');
  await page.locator('#size-slider').fill('8');
  const toneClick = await paperPoint(page, 0.5, 0.5);
  await page.mouse.click(toneClick.x, toneClick.y);
  expect((await pixel(page, 0.5, 0.5))[0]).toBe(0);

  await newCanvas(page, 64, 64);
  await bucket('#000000');
  await page.locator('[data-tool="lighten"]').click();
  await page.locator('#tone-amount').fill('100');
  await page.mouse.click((await paperPoint(page, 0.5, 0.5)).x, (await paperPoint(page, 0.5, 0.5)).y);
  expect((await pixel(page, 0.5, 0.5))[0]).toBe(255);

  await newCanvas(page, 64, 64);
  await bucket('#000000');
  await page.locator('[data-tool="lighten"]').click();
  await page.locator('#tone-amount').fill('1');
  await page.mouse.click((await paperPoint(page, 0.5, 0.5)).x, (await paperPoint(page, 0.5, 0.5)).y);
  const faint = (await pixel(page, 0.5, 0.5))[0];
  expect(faint).toBeGreaterThanOrEqual(1);
  expect(faint).toBeLessThanOrEqual(10);

  const setRange = async (low: string, high: string) => {
    await page.locator('#random-low').fill(low);
    await page.locator('#random-high').fill(high);
  };
  await newCanvas(page, 64, 64);
  await bucket('#808080');
  await page.locator('[data-tool="random"]').click();
  await page.locator('#size-slider').fill('4');
  await page.locator('#random-rate').fill('0');
  await setRange('20', '20');
  const randomAt = await paperPoint(page, 0.5, 0.5);
  const randomFar = await paperPoint(page, 0.8, 0.5);
  await page.mouse.move(randomAt.x, randomAt.y);
  await page.mouse.down();
  await page.mouse.move(randomFar.x, randomFar.y, { steps: 4 });
  await page.mouse.move(randomAt.x, randomAt.y, { steps: 4 });
  await page.mouse.up();
  const once = await pixel(page, 0.5, 0.5);
  expect(once[0]).toBe(148);
  expect(once[1]).toBe(148);
  expect(once[2]).toBe(148);
  expect(once[3]).toBe(255);

  await setRange('-30', '-30');
  const negativeAt = await paperPoint(page, 0.5, 0.2);
  await page.mouse.click(negativeAt.x, negativeAt.y);
  const lowered = await pixel(page, 0.5, 0.2);
  expect(lowered[0]).toBe(98);

  await newCanvas(page, 64, 64);
  await page.locator('[data-tool="random"]').click();
  await setRange('100', '100');
  await page.mouse.click((await paperPoint(page, 0.5, 0.5)).x, (await paperPoint(page, 0.5, 0.5)).y);
  expect((await pixel(page, 0.5, 0.5))[0]).toBe(255);

  await newCanvas(page, 64, 64);
  await bucket('#000000');
  await page.locator('[data-tool="random"]').click();
  await setRange('-255', '-255');
  await page.mouse.click((await paperPoint(page, 0.5, 0.5)).x, (await paperPoint(page, 0.5, 0.5)).y);
  expect((await pixel(page, 0.5, 0.5))[0]).toBe(0);
  expect((await pixel(page, 0.5, 0.5))[3]).toBe(255);

  await newCanvas(page, 64, 64);
  await bucket('#808080');
  await page.locator('[data-tool="random"]').click();
  await setRange('-40', '-40');
  await page.locator('#random-alpha').check();
  await page.mouse.click((await paperPoint(page, 0.5, 0.5)).x, (await paperPoint(page, 0.5, 0.5)).y);
  const faded = await pixel(page, 0.5, 0.5);
  expect(faded[0]).toBe(88);
  expect(faded[3]).toBe(215);

  await page.locator('#random-alpha').uncheck();
  await page.locator('#random-rate').fill('10');
  await setRange('20', '20');
  const rateAt = await paperPoint(page, 0.2, 0.8);
  await page.mouse.move(rateAt.x, rateAt.y);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.mouse.up();
  expect((await pixel(page, 0.2, 0.8))[0]).toBeGreaterThan(170);

  await newCanvas(page, 64, 64);
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#size-slider').fill('4');
  await page.locator('#primary-input').fill('#ff0000');
  const near = await paperPoint(page, 0.2, 0.2);
  const far = await paperPoint(page, 0.8, 0.8);
  await page.mouse.click(near.x, near.y);
  await page.mouse.click(far.x, far.y);
  await page.locator('#primary-input').fill('#0000ff');
  await page.locator('[data-tool="recolor"]').click();
  await page.locator('#tolerance-slider').fill('0');
  await page.mouse.click(near.x, near.y);
  expect((await pixel(page, 0.2, 0.2))[2]).toBeGreaterThan(200);
  expect((await pixel(page, 0.8, 0.8))[0]).toBeGreaterThan(200);
  await page.keyboard.press('Control+z');
  await page.locator('#recolor-global').check();
  await page.mouse.click(near.x, near.y);
  expect((await pixel(page, 0.2, 0.2))[2]).toBe(255);
  expect((await pixel(page, 0.2, 0.2))[0]).toBe(0);
  expect((await pixel(page, 0.8, 0.8))[2]).toBe(255);
  expect((await pixel(page, 0.8, 0.8))[0]).toBe(0);
  expect((await pixel(page, 0.5, 0.5))[0]).toBeGreaterThan(200);
});

test('the color picker keeps alpha, and transparent ink erases', async ({ page }) => {
  await ready(page);
  await newCanvas(page, 64, 64);
  await page.locator('#primary-input').fill('#ff0000');
  await page.locator('#alpha-slider').fill('128');
  await page.locator('[data-tool="bucket"]').click();
  const center = await paperPoint(page, 0.5, 0.5);
  await page.mouse.click(center.x, center.y);
  const translucent = await pixel(page, 0.5, 0.5);
  expect(translucent[0]).toBeGreaterThan(200);
  expect(translucent[1]).toBeLessThan(40);
  expect(translucent[3]).toBeGreaterThan(100);
  expect(translucent[3]).toBeLessThan(160);

  await page.locator('[data-tool="picker"]').click();
  await page.mouse.click(center.x, center.y);
  await expect(page.locator('#alpha-slider')).toHaveValue('128');
  await expect(page.locator('#primary-input')).toHaveValue('#ff0000');
  await page.locator('#secondary-input').fill('#00ff00');
  await expect(page.locator('#alpha-slider')).toHaveValue('128');

  await newCanvas(page, 64, 64);
  await page.locator('#alpha-slider').fill('0');
  await page.locator('[data-tool="bucket"]').click();
  const cleared = await paperPoint(page, 0.5, 0.5);
  await page.mouse.click(cleared.x, cleared.y);
  expect((await pixel(page, 0.5, 0.5))[3]).toBe(0);

  await newCanvas(page, 64, 64);
  await page.locator('#alpha-slider').fill('255');
  await page.locator('#primary-input').fill('#ff0000');
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#size-slider').fill('4');
  const near = await paperPoint(page, 0.25, 0.5);
  const far = await paperPoint(page, 0.75, 0.5);
  await page.mouse.click(near.x, near.y);
  await page.mouse.click(far.x, far.y);
  await page.locator('#primary-input').fill('#0000ff');
  await page.locator('#alpha-slider').fill('0');
  await page.locator('[data-tool="recolor"]').click();
  await page.locator('#tolerance-slider').fill('0');
  await page.locator('#size-slider').fill('8');
  await page.mouse.click(near.x, near.y);
  expect((await pixel(page, 0.25, 0.5))[3]).toBe(0);
  expect((await pixel(page, 0.75, 0.5))[0]).toBeGreaterThan(200);
  expect((await pixel(page, 0.75, 0.5))[3]).toBe(255);
  await page.keyboard.press('Control+z');
  await page.locator('#recolor-global').check();
  await page.mouse.click(near.x, near.y);
  expect((await pixel(page, 0.25, 0.5))[3]).toBe(0);
  expect((await pixel(page, 0.75, 0.5))[3]).toBe(0);
  expect((await pixel(page, 0.5, 0.2))[3]).toBe(255);

  await newCanvas(page, 64, 64);
  await page.locator('#primary-input').fill('#ff0000');
  await page.locator('#alpha-slider').fill('128');
  await page.locator('[data-tool="brush"]').click();
  await page.locator('#size-slider').fill('16');
  const brushed = await paperPoint(page, 0.5, 0.5);
  await page.mouse.click(brushed.x, brushed.y);
  const pink = await pixel(page, 0.5, 0.5);
  expect(pink[0]).toBeGreaterThan(200);
  expect(pink[1]).toBeGreaterThan(40);
  expect(pink[1]).toBeLessThan(200);
  expect(pink[3]).toBeGreaterThan(200);
});

test('hidden controls for selection, paint, text, and layers', async ({ page }) => {
  await ready(page);
  await newCanvas(page, 64, 64);
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#size-slider').fill('1');
  await page.locator('#primary-input').fill('#ff0000');
  const start = await paperPoint(page, 10.5 / 64, 16.5 / 64);
  const elbow = await paperPoint(page, 18.5 / 64, 16.5 / 64);
  const end = await paperPoint(page, 18.5 / 64, 24.5 / 64);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(elbow.x, elbow.y, { steps: 6 });
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  expect((await pixel(page, 14.5 / 64, 16.5 / 64))[1]).toBeLessThan(30);
  expect((await pixel(page, 18.5 / 64, 20.5 / 64))[1]).toBeLessThan(30);
  expect((await pixel(page, 18.5 / 64, 16.5 / 64))[1]).toBeGreaterThan(200);

  await page.locator('#symmetry-select').selectOption('vertical');
  const mirror = await paperPoint(page, 8.5 / 64, 40.5 / 64);
  await page.mouse.click(mirror.x, mirror.y);
  expect((await pixel(page, 8.5 / 64, 40.5 / 64))[1]).toBeLessThan(30);
  expect((await pixel(page, 55.5 / 64, 40.5 / 64))[1]).toBeLessThan(30);
  await page.locator('#symmetry-select').selectOption('horizontal');
  const across = await paperPoint(page, 8.5 / 64, 6.5 / 64);
  await page.mouse.click(across.x, across.y);
  expect((await pixel(page, 8.5 / 64, 6.5 / 64))[1]).toBeLessThan(30);
  expect((await pixel(page, 8.5 / 64, 57.5 / 64))[1]).toBeLessThan(30);
  await page.locator('#symmetry-select').selectOption('orthogonal');
  const both = await paperPoint(page, 3.5 / 64, 50.5 / 64);
  await page.mouse.click(both.x, both.y);
  expect((await pixel(page, 3.5 / 64, 50.5 / 64))[1]).toBeLessThan(30);
  expect((await pixel(page, 60.5 / 64, 50.5 / 64))[1]).toBeLessThan(30);
  expect((await pixel(page, 3.5 / 64, 13.5 / 64))[1]).toBeLessThan(30);
  expect((await pixel(page, 60.5 / 64, 13.5 / 64))[1]).toBeLessThan(30);
  await page.locator('[data-tool="pen"]').click();
  await page.locator('#size-slider').fill('4');
  const penAt = await paperPoint(page, 6.5 / 64, 30.5 / 64);
  await page.mouse.click(penAt.x, penAt.y);
  expect((await pixel(page, 6.5 / 64, 30.5 / 64))[1]).toBeLessThan(40);
  expect((await pixel(page, 57.5 / 64, 30.5 / 64))[1]).toBeLessThan(40);

  await newCanvas(page, 64, 64);
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#symmetry-select').selectOption('off');
  await page.locator('#size-slider').fill('4');
  await page.locator('#primary-input').fill('#ff0000');
  const axis = await paperPoint(page, 16 / 64, 32 / 64);
  const off = await paperPoint(page, 44 / 64, 36 / 64);
  await page.keyboard.down('Shift');
  await page.mouse.move(axis.x, axis.y);
  await page.mouse.down();
  await page.mouse.move(off.x, off.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect((await pixel(page, 40.5 / 64, 32.5 / 64))[1]).toBeLessThan(40);
  expect((await pixel(page, 40.5 / 64, 48.5 / 64))[1]).toBeGreaterThan(200);

  await page.locator('[data-tool="brush"]').click();
  await expect(page.locator('#brush-select option[value="smudge"]')).toHaveCount(1);
  await page.locator('#primary-input').fill('#0000ff');
  await page.locator('#size-slider').fill('4');
  const brushFrom = await paperPoint(page, 12.5 / 64, 8.5 / 64);
  const brushTo = await paperPoint(page, 40.5 / 64, 14.5 / 64);
  await page.keyboard.down('Shift');
  await page.mouse.move(brushFrom.x, brushFrom.y);
  await page.mouse.down();
  await page.mouse.move(brushTo.x, brushTo.y, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect((await pixel(page, 32.5 / 64, 8.5 / 64))[2]).toBeGreaterThan(180);
  expect((await pixel(page, 32.5 / 64, 8.5 / 64))[0]).toBeLessThan(40);
  expect((await pixel(page, 32.5 / 64, 18.5 / 64))[0]).toBeGreaterThan(200);
  await page.locator('[data-tool="eraser"]').click();
  await expect(page.locator('#brush-select option[value="smudge"]')).toHaveCount(0);
  await page.locator('[data-tool="brush"]').click();
  await page.locator('#brush-select').selectOption('smudge');
  await page.locator('#primary-input').fill('#0000ff');
  await page.locator('#size-slider').fill('8');
  const smearFrom = await paperPoint(page, 32 / 64, 32 / 64);
  const smearTo = await paperPoint(page, 48 / 64, 32 / 64);
  await page.mouse.move(smearFrom.x, smearFrom.y);
  await page.mouse.down();
  await page.mouse.move(smearTo.x, smearTo.y, { steps: 8 });
  await page.mouse.up();
  const smeared = await pixel(page, 46 / 64, 32 / 64);
  expect(smeared[0]).toBeGreaterThan(80);
  expect(smeared[2]).toBeLessThan(smeared[0]);

  await page.locator('[data-tool="rectangle"]').click();
  await page.locator('#shape-select').selectOption('fill');
  await page.locator('#primary-input').fill('#00ff00');
  const center = await paperPoint(page, 32.5 / 64, 48.5 / 64);
  const corner = await paperPoint(page, 44.5 / 64, 56.5 / 64);
  await page.keyboard.down('Alt');
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(corner.x, corner.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  expect((await pixel(page, 40.5 / 64, 48.5 / 64))[0]).toBeLessThan(40);
  expect((await pixel(page, 22.5 / 64, 48.5 / 64))[0]).toBeLessThan(40);
  expect((await pixel(page, 8.5 / 64, 48.5 / 64))[0]).toBeGreaterThan(200);

  await page.locator('[data-tool="line"]').click();
  await page.locator('#alias-check').uncheck();
  await page.locator('#primary-input').fill('#0000ff');
  await page.locator('#size-slider').fill('1');
  const lineStart = await paperPoint(page, 4.5 / 64, 20.5 / 64);
  const lineEnd = await paperPoint(page, 20.5 / 64, 29.5 / 64);
  await page.keyboard.down('Shift');
  await page.mouse.move(lineStart.x, lineStart.y);
  await page.mouse.down();
  await page.mouse.move(lineEnd.x, lineEnd.y, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  expect((await pixel(page, 12.5 / 64, 28.5 / 64))[2]).toBeGreaterThan(200);
  expect((await pixel(page, 12.5 / 64, 28.5 / 64))[0]).toBeLessThan(40);
  expect((await pixel(page, 12.5 / 64, 25.5 / 64))[0]).toBeGreaterThan(200);

  await newCanvas(page, 64, 64);
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#size-slider').fill('1');
  await page.locator('#primary-input').fill('#ff0000');
  await page.mouse.click((await paperPoint(page, 12.5 / 64, 12.5 / 64)).x, (await paperPoint(page, 12.5 / 64, 12.5 / 64)).y);
  await page.mouse.click((await paperPoint(page, 40.5 / 64, 40.5 / 64)).x, (await paperPoint(page, 40.5 / 64, 40.5 / 64)).y);
  await page.locator('[data-tool="wand"]').click();
  await expect(page.locator('#wand-contiguous')).toBeChecked();
  await page.mouse.click((await paperPoint(page, 12.5 / 64, 12.5 / 64)).x, (await paperPoint(page, 12.5 / 64, 12.5 / 64)).y);
  await page.locator('#primary-input').fill('#0000ff');
  await page.locator('#menu-edit').click();
  await page.locator('[data-command="fill-selection"]').click();
  expect((await pixel(page, 12.5 / 64, 12.5 / 64))[0]).toBeLessThan(40);
  expect((await pixel(page, 40.5 / 64, 40.5 / 64))[0]).toBeGreaterThan(200);
  expect((await pixel(page, 40.5 / 64, 40.5 / 64))[2]).toBeLessThan(40);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await pixel(page, 12.5 / 64, 12.5 / 64))[0]).toBeGreaterThan(200);
  await page.locator('[data-tool="wand"]').click();
  await page.locator('#wand-contiguous').uncheck();
  await page.mouse.click((await paperPoint(page, 12.5 / 64, 12.5 / 64)).x, (await paperPoint(page, 12.5 / 64, 12.5 / 64)).y);
  await page.locator('#menu-edit').click();
  await page.locator('[data-command="fill-selection"]').click();
  expect((await pixel(page, 12.5 / 64, 12.5 / 64))[2]).toBeGreaterThan(200);
  expect((await pixel(page, 12.5 / 64, 12.5 / 64))[0]).toBeLessThan(40);
  expect((await pixel(page, 40.5 / 64, 40.5 / 64))[2]).toBeGreaterThan(200);
  expect((await pixel(page, 40.5 / 64, 40.5 / 64))[0]).toBeLessThan(40);

  await newCanvas(page, 48, 48);
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#size-slider').fill('6');
  await page.locator('#primary-input').fill('#ff0000');
  await page.locator('#layer-list button.layer[data-layer="0"]').click();
  await page.mouse.click((await paperPoint(page, 0.5, 0.5)).x, (await paperPoint(page, 0.5, 0.5)).y);
  await page.locator('#menu-layers').click();
  await page.locator('#panel-layers [data-command="layer-add"]').click();
  await page.locator('[data-tool="picker"]').click();
  await expect(page.locator('#sample-size')).toHaveValue('1');
  await page.mouse.click((await paperPoint(page, 0.5, 0.5)).x, (await paperPoint(page, 0.5, 0.5)).y);
  await expect(page.locator('#primary-input')).not.toHaveValue('#ff0000');
  await page.locator('[data-tool="picker"]').click();
  await page.locator('#sample-all').check();
  await page.mouse.click((await paperPoint(page, 0.5, 0.5)).x, (await paperPoint(page, 0.5, 0.5)).y);
  await expect(page.locator('#primary-input')).toHaveValue('#ff0000');
  await expect(page.locator('#recent-colors')).toBeVisible();
  await expect(page.locator('#palette-divider')).toBeVisible();
  const recentBox = await page.locator('#recent-colors').boundingBox();
  const dividerBox = await page.locator('#palette-divider').boundingBox();
  const paletteBox = await page.locator('#palette').boundingBox();
  if (!recentBox || !dividerBox || !paletteBox) throw new Error('The palette is not visible.');
  expect(recentBox.y).toBeLessThan(dividerBox.y);
  expect(dividerBox.y).toBeLessThan(paletteBox.y);

  await page.locator('#layer-list button.layer[data-layer="0"]').click();
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#size-slider').fill('1');
  await page.locator('#primary-input').fill('#00ff00');
  await page.mouse.click((await paperPoint(page, 0.25, 0.25)).x, (await paperPoint(page, 0.25, 0.25)).y);
  await page.locator('[data-tool="picker"]').click();
  await page.locator('#sample-all').uncheck();
  await page.locator('#sample-size').fill('1');
  await page.mouse.click((await paperPoint(page, 0.25, 0.25)).x, (await paperPoint(page, 0.25, 0.25)).y);
  await expect(page.locator('#primary-input')).toHaveValue('#00ff00');
  await page.locator('[data-tool="picker"]').click();
  await page.locator('#sample-size').fill('5');
  await page.mouse.click((await paperPoint(page, 0.25, 0.25)).x, (await paperPoint(page, 0.25, 0.25)).y);
  const averaged = await page.locator('#primary-swatch').evaluate(element => getComputedStyle(element).backgroundColor);
  const channels = averaged.match(/[\d.]+/g)?.map(Number) ?? [];
  expect(channels[0]).toBeGreaterThan(40);
  expect(channels[1]).toBeGreaterThan(40);

  await page.locator('#layer-list button.layer[data-layer="1"]').click();
  await page.locator('[data-tool="bucket"]').click();
  await page.locator('#sample-all').check();
  await page.locator('#primary-input').fill('#0000ff');
  await page.mouse.click((await paperPoint(page, 0.5, 0.5)).x, (await paperPoint(page, 0.5, 0.5)).y);
  expect((await pixel(page, 0.5, 0.5))[2]).toBeGreaterThan(200);
  expect((await pixel(page, 0.5, 0.5))[0]).toBeLessThan(40);
  expect((await pixel(page, 0.05, 0.05))[0]).toBeGreaterThan(240);
  await page.locator('[data-tool="wand"]').click();
  await page.locator('#sample-all').check();
  await page.locator('#wand-contiguous').check();
  await page.mouse.click((await paperPoint(page, 0.25, 0.25)).x, (await paperPoint(page, 0.25, 0.25)).y);
  await page.locator('#primary-input').fill('#ff00ff');
  await page.locator('#menu-edit').click();
  await page.locator('[data-command="fill-selection"]').click();
  expect((await pixel(page, 0.25, 0.25))[0]).toBeGreaterThan(200);
  expect((await pixel(page, 0.25, 0.25))[1]).toBeLessThan(40);
  expect((await pixel(page, 0.25, 0.25))[2]).toBeGreaterThan(200);
  expect((await pixel(page, 0.9, 0.9))[1]).toBeGreaterThan(200);
  expect((await pixel(page, 0.5, 0.5))[2]).toBeGreaterThan(200);

  await newCanvas(page, 64, 64);
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#size-slider').fill('1');
  await page.locator('#alpha-slider').fill('0');
  await page.mouse.click((await paperPoint(page, 20.5 / 64, 20.5 / 64)).x, (await paperPoint(page, 20.5 / 64, 20.5 / 64)).y);
  expect((await pixel(page, 20.5 / 64, 20.5 / 64))[3]).toBe(0);
  await page.locator('#alpha-slider').fill('255');
  await page.locator('#menu-layers').click();
  await page.locator('[data-command="layer-properties"]').click();
  await page.locator('#layer-alpha-lock').check();
  await page.locator('#layer-ok').click();
  await page.locator('#primary-input').fill('#ff0000');
  await page.mouse.click((await paperPoint(page, 20.5 / 64, 20.5 / 64)).x, (await paperPoint(page, 20.5 / 64, 20.5 / 64)).y);
  expect((await pixel(page, 20.5 / 64, 20.5 / 64))[3]).toBe(0);
  await page.mouse.click((await paperPoint(page, 30.5 / 64, 30.5 / 64)).x, (await paperPoint(page, 30.5 / 64, 30.5 / 64)).y);
  expect((await pixel(page, 30.5 / 64, 30.5 / 64))[0]).toBeGreaterThan(200);
  expect((await pixel(page, 30.5 / 64, 30.5 / 64))[1]).toBeLessThan(30);

  const countInk = () => page.evaluate(() => {
    const canvas = document.querySelector('#image-canvas') as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] < 250 || data[index + 1] < 250 || data[index + 2] < 250) count++;
    }
    return count;
  });
  await page.locator('#alpha-slider').fill('255');
  await newCanvas(page, 96, 64);
  await page.locator('[data-tool="text"]').click();
  await page.locator('#text-style').selectOption('stroke');
  await page.locator('#size-slider').fill('28');
  await page.locator('#stroke-width').fill('1');
  await page.locator('#primary-input').fill('#000000');
  let textAt = await paperPoint(page, 0.1, 0.2);
  await page.mouse.click(textAt.x, textAt.y);
  await page.locator('#text-editor').fill('H');
  await page.locator('#text-editor').press('Enter');
  const thin = await countInk();
  await newCanvas(page, 96, 64);
  await page.locator('[data-tool="text"]').click();
  await page.locator('#text-style').selectOption('stroke');
  await page.locator('#size-slider').fill('28');
  await page.locator('#stroke-width').fill('12');
  textAt = await paperPoint(page, 0.1, 0.2);
  await page.mouse.click(textAt.x, textAt.y);
  await page.locator('#text-editor').fill('H');
  await page.locator('#text-editor').press('Enter');
  expect(await countInk()).toBeGreaterThan(thin + 20);
  await newCanvas(page, 96, 64);
  await page.locator('[data-tool="text"]').click();
  await page.locator('#text-style').selectOption('both');
  await page.locator('#size-slider').fill('28');
  await page.locator('#stroke-width').fill('2');
  await page.locator('#primary-input').fill('#000000');
  await page.locator('#secondary-input').fill('#ff0000');
  textAt = await paperPoint(page, 0.1, 0.2);
  await page.mouse.click(textAt.x, textAt.y);
  await page.locator('#text-editor').fill('H');
  await page.locator('#text-editor').press('Enter');
  const styled = await page.evaluate(() => {
    const canvas = document.querySelector('#image-canvas') as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    let red = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] < 80 && data[index + 1] < 80 && data[index + 2] < 80) dark++;
      if (data[index] > 160 && data[index + 1] < 80 && data[index + 2] < 80) red++;
    }
    return { dark, red };
  });
  expect(styled.dark).toBeGreaterThan(10);
  expect(styled.red).toBeGreaterThan(10);
});

test('the swatch color picker sets transparency', async ({ page }) => {
  await ready(page);
  await newCanvas(page, 64, 64);
  await page.locator('[data-color-slot="primary"]').click();
  const picker = page.locator('#color-picker');
  await expect(picker).toBeVisible();
  const thumb = await page.locator('#color-hue').evaluate(element => {
    const style = getComputedStyle(element, '::-webkit-slider-thumb');
    return { width: Number.parseFloat(style.width), background: style.backgroundColor };
  });
  expect(thumb.width).toBeGreaterThan(8);
  await page.locator('#color-hue').fill('120');
  const hue = await page.locator('#color-sv').evaluate(canvas => {
    const image = canvas as HTMLCanvasElement;
    return Array.from(image.getContext('2d')!.getImageData(image.width - 2, 2, 1, 1).data);
  });
  expect(hue[1]).toBeGreaterThan(200);
  expect(hue[0]).toBeLessThan(40);
  await page.locator('#color-hue').fill('0');
  const field = await page.locator('#color-sv').boundingBox();
  if (!field) throw new Error('The color field is not visible.');
  await page.mouse.click(field.x + field.width - 4, field.y + 4);
  await page.locator('#color-alpha').fill('128');
  await expect(picker).toBeVisible();
  const swatch = await page.locator('#primary-swatch').evaluate(element => getComputedStyle(element).backgroundColor);
  const channels = swatch.match(/[\d.]+/g)?.map(Number) ?? [];
  expect(channels[0]).toBeGreaterThan(200);
  expect(channels[1]).toBeLessThan(40);
  expect(channels[3] ?? 1).toBeGreaterThan(0.4);
  expect(channels[3] ?? 1).toBeLessThan(0.6);
  await page.locator('#color-hex').fill('#00ff00');
  await page.locator('#color-hex').blur();
  await expect(page.locator('#color-hex')).toHaveValue('#00ff0080');
  const kept = await page.locator('#primary-swatch').evaluate(element => getComputedStyle(element).backgroundColor);
  const green = kept.match(/[\d.]+/g)?.map(Number) ?? [];
  expect(green[0]).toBeLessThan(40);
  expect(green[1]).toBeGreaterThan(200);
  expect(green[3] ?? 1).toBeGreaterThan(0.4);
  expect(green[3] ?? 1).toBeLessThan(0.6);
  await page.locator('#color-hex').fill('#0000ff00');
  await page.locator('#color-hex').blur();
  await expect(page.locator('#color-alpha')).toHaveValue('0');
  await page.locator('#color-hex').fill('nope');
  await page.locator('#color-hex').blur();
  await expect(page.locator('#color-hex')).toHaveValue('#0000ff00');
  await page.locator('#color-alpha').fill('0');
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await page.locator('[data-tool="bucket"]').click();
  const point = await paperPoint(page, 0.5, 0.5);
  await page.mouse.click(point.x, point.y);
  expect((await pixel(page, 0.5, 0.5))[3]).toBe(0);
});

test('loads the editor from the service worker while offline', async ({ page, context }) => {
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-engine', 'ready');
  await newCanvas(page, 64, 64);
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#size-slider').fill('8');
  await page.locator('#primary-input').fill('#ff0000');
  const point = await paperPoint(page, 0.5, 0.5);
  await page.mouse.click(point.x, point.y);
  expect((await pixel(page, 0.5, 0.5))[0]).toBeGreaterThan(200);
});

test('zoom shortcuts change the canvas and leave the page scale alone', async ({ page }) => {
  await ready(page);
  await newCanvas(page, 64, 64);
  const percent = () => page.locator('#zoom-label').innerText().then(text => Number(text.replace('%', '')));
  const pageScale = () => page.evaluate(() => window.visualViewport?.scale ?? 1);
  const start = await percent();
  await page.locator('#menubar').evaluate(element => {
    const fire = (type: string, id: number, x: number, y: number) => element.dispatchEvent(new PointerEvent(type, {
      pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch',
    }));
    fire('pointerdown', 7, 40, 24);
    fire('pointerdown', 8, 70, 24);
    fire('pointermove', 8, 120, 24);
    fire('pointerup', 8, 120, 24);
    fire('pointerup', 7, 40, 24);
  });
  const pinched = await percent();
  expect(pinched).toBeGreaterThan(start);
  await page.locator('#menubar').evaluate(element => {
    element.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, ctrlKey: true, bubbles: true, cancelable: true, clientX: 24, clientY: 24 }));
  });
  const zoomed = await percent();
  expect(zoomed).toBeGreaterThan(pinched);
  expect(await pageScale()).toBe(1);

  await page.keyboard.press('Control+Minus');
  const reduced = await percent();
  expect(reduced).toBeLessThan(zoomed);
  expect(await pageScale()).toBe(1);
  await page.keyboard.press('Control+Equal');
  expect(await percent()).toBeGreaterThan(reduced);
  expect(await pageScale()).toBe(1);
});

test('rounds a fast brush stroke instead of leaving straight segments', async ({ page }) => {
  await ready(page);
  await newCanvas(page, 80, 80);
  await page.locator('[data-tool="brush"]').click();
  await page.locator('#size-slider').fill('3');
  const ratios: [number, number][] = [[0.1, 0.75], [0.5, 0.1], [0.9, 0.75]];
  const box = await page.locator('#paper').boundingBox();
  if (!box) throw new Error('The canvas is not visible.');
  const at = (x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
  const start = at(ratios[0][0], ratios[0][1]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const ratio of ratios.slice(1)) {
    const point = at(ratio[0], ratio[1]);
    await page.mouse.move(point.x, point.y);
  }
  await page.mouse.up();
  const offChord = await page.evaluate(() => {
    const canvas = document.querySelector('#image-canvas') as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const chords: [number, number, number, number][] = [[8, 60, 40, 8], [40, 8, 72, 60]];
    const distance = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const length = Math.hypot(dx, dy) || 1;
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (length * length)));
      return Math.hypot(x - (x0 + dx * t), y - (y0 + dy * t));
    };
    let found = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const index = (y * canvas.width + x) * 4;
        if (data[index] > 80) continue;
        const nearest = Math.min(...chords.map(chord => distance(x, y, chord[0], chord[1], chord[2], chord[3])));
        if (nearest > 3) found++;
      }
    }
    return found;
  });
  expect(offChord).toBeGreaterThan(0);
});

test('unserrate is on for the brushes and off for the pencil', async ({ page }) => {
  await ready(page);
  await newCanvas(page, 80, 80);
  const offChord = async () => page.evaluate(() => {
    const canvas = document.querySelector('#image-canvas') as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const chords: [number, number, number, number][] = [[8, 60, 40, 8], [40, 8, 72, 60]];
    const distance = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const length = Math.hypot(dx, dy) || 1;
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (length * length)));
      return Math.hypot(x - (x0 + dx * t), y - (y0 + dy * t));
    };
    let found = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const index = (y * canvas.width + x) * 4;
        if (data[index] > 80) continue;
        const nearest = Math.min(...chords.map(chord => distance(x, y, chord[0], chord[1], chord[2], chord[3])));
        if (nearest > 5) found++;
      }
    }
    return found;
  });
  const flick = async () => {
    const ratios: [number, number][] = [[0.1, 0.75], [0.5, 0.1], [0.9, 0.75]];
    const box = await page.locator('#paper').boundingBox();
    if (!box) throw new Error('The canvas is not visible.');
    const at = (x: number, y: number) => ({ x: box.x + box.width * x, y: box.y + box.height * y });
    const start = at(ratios[0][0], ratios[0][1]);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (const ratio of ratios.slice(1)) {
      const point = at(ratio[0], ratio[1]);
      await page.mouse.move(point.x, point.y);
    }
    await page.mouse.up();
  };
  await page.locator('[data-tool="brush"]').click();
  await expect(page.locator('#unserrate')).toBeChecked();
  await page.locator('[data-tool="eraser"]').click();
  await expect(page.locator('#unserrate')).toBeChecked();
  await page.locator('[data-tool="pen"]').click();
  await expect(page.locator('#unserrate')).toBeChecked();
  await page.locator('[data-tool="pencil"]').click();
  await expect(page.locator('#unserrate')).not.toBeChecked();
  await page.locator('#size-slider').fill('4');
  await flick();
  expect(await offChord()).toBe(0);
  await page.locator('#unserrate').check();
  await page.locator('#smooth-slider').fill('70');
  await newCanvas(page, 80, 80);
  await flick();
  expect(await offChord()).toBeGreaterThan(0);
  await page.locator('[data-tool="brush"]').click();
  await expect(page.locator('#unserrate')).toBeChecked();
  await page.locator('#unserrate').uncheck();
  await newCanvas(page, 80, 80);
  await page.locator('#size-slider').fill('3');
  await flick();
  const painted = await page.evaluate(() => {
    const canvas = document.querySelector('#image-canvas') as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let index = 0; index < data.length; index += 4) if (data[index] < 80) dark++;
    return dark;
  });
  expect(painted).toBeGreaterThan(10);
});

test('nudges selected pixels with the arrow keys', async ({ page }) => {
  await ready(page);
  await newCanvas(page);
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#size-slider').fill('1');
  await page.locator('#primary-input').fill('#ff0000');
  const dot = await paperPoint(page, 0.25, 0.5);
  await page.mouse.click(dot.x, dot.y);
  await page.keyboard.press('Control+a');
  const before = await page.evaluate(() => {
    const canvas = document.querySelector('#image-canvas') as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const index = (y * canvas.width + x) * 4;
        if (data[index] > 200 && data[index + 1] < 40) return x;
      }
    }
    return -1;
  });
  await page.keyboard.press('ArrowRight');
  const after = await page.evaluate(() => {
    const canvas = document.querySelector('#image-canvas') as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const index = (y * canvas.width + x) * 4;
        if (data[index] > 200 && data[index + 1] < 40) return x;
      }
    }
    return -1;
  });
  expect(before).toBeGreaterThan(-1);
  expect(after).toBe(before + 1);
});

test('solos a layer from its eye and restores the others', async ({ page }) => {
  await ready(page);
  await newCanvas(page);
  await page.locator('button[aria-label="Add layer"]').click();
  const top = page.locator('#layer-list input[data-visible][data-layer="1"]');
  const bottom = page.locator('#layer-list input[data-visible][data-layer="0"]');
  await top.click({ modifiers: ['Alt'] });
  await expect(bottom).not.toBeChecked();
  await expect(top).toBeChecked();
  await top.click({ modifiers: ['Alt'] });
  await expect(bottom).toBeChecked();
});

test('shows the dab size in the middle of the canvas while the size changes', async ({ page }) => {
  await ready(page);
  await newCanvas(page);
  await page.locator('#menu-view').click();
  await expect(page.locator('#cursor-mark')).toHaveText('Off');
  await page.keyboard.press('Escape');
  await page.locator('#size-slider').fill('48');
  const cursor = page.locator('#dab-cursor');
  await expect(cursor).toBeVisible();
  const paper = await page.locator('#paper').boundingBox();
  const mark = await cursor.boundingBox();
  if (!paper || !mark) throw new Error('The canvas is not visible.');
  const centerX = mark.x + mark.width / 2;
  const centerY = mark.y + mark.height / 2;
  expect(Math.abs(centerX - (paper.x + paper.width / 2))).toBeLessThan(3);
  expect(Math.abs(centerY - (paper.y + paper.height / 2))).toBeLessThan(3);
});

test('keeps Install Pinta in the Window menu until the browser offers it', async ({ page }) => {
  await ready(page);
  await page.locator('#menu-window').click();
  const item = page.locator('[data-command="install"]');
  await expect(item).toHaveText('Install Pinta');
  await expect(item).toBeDisabled();
});

test('keeps the smoothing number when Unserrate is turned off', async ({ page }) => {
  await ready(page);
  await newCanvas(page);
  await page.locator('[data-tool="brush"]').click();
  await expect(page.locator('#smooth-slider')).toHaveValue('70');
  await expect(page.locator('#unserrate')).toBeChecked();
  await expect(page.locator('#status-note')).toHaveText('Smoothing rounds a fast stroke');
  await page.locator('#unserrate').uncheck();
  await expect(page.locator('#smooth-slider')).toHaveValue('70');
  await expect(page.locator('#status-note')).toHaveText('');
  await page.locator('[data-tool="pencil"]').click();
  await expect(page.locator('#smooth-slider')).toHaveValue('0');
  await expect(page.locator('#unserrate')).not.toBeChecked();
  await page.locator('[data-tool="bucket"]').click();
  await expect(page.locator('#smooth-edges')).toBeChecked();
  await expect(page.locator('#status-note')).toHaveText('Fills the soft edge.');
});

test('softens the edge of a fill and leaves the dark core', async ({ page }) => {
  await ready(page);
  await newCanvas(page, 80, 80);
  await page.locator('[data-tool="line"]').click();
  await page.locator('#size-slider').fill('14');
  await page.locator('#primary-input').fill('#000000');
  await drag(page, 0.1, 0.5, 0.9, 0.5);
  const before = await page.evaluate(() => {
    const canvas = document.querySelector('#image-canvas') as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    let core: number[] | null = null;
    let fringe: number[] | null = null;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const index = (y * canvas.width + x) * 4;
        const red = data[index];
        if (red < 20 && !core) core = [x, y, red];
        if (red > 50 && red < 210 && !fringe) fringe = [x, y, red];
      }
    }
    return { core, fringe, width: canvas.width, height: canvas.height };
  });
  expect(before.core).toBeTruthy();
  expect(before.fringe).toBeTruthy();
  await page.locator('[data-tool="bucket"]').click();
  await page.locator('#primary-input').fill('#ff0000');
  const spot = await paperPoint(page, 0.5, 0.15);
  await page.mouse.click(spot.x, spot.y);
  const after = await page.evaluate(({ core, fringe }) => {
    const canvas = document.querySelector('#image-canvas') as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const at = (point: number[]) => {
      const index = (point[1] * canvas.width + point[0]) * 4;
      return [data[index], data[index + 1], data[index + 2]];
    };
    return { core: at(core!), fringe: at(fringe!) };
  }, { core: before.core, fringe: before.fringe });
  expect(after.core![0]).toBeLessThan(40);
  expect(after.fringe![0]).toBeGreaterThan(after.fringe![1] + 30);
});

test('shows width, height, and angle while a selection floats', async ({ page }) => {
  await ready(page);
  await newCanvas(page, 40, 30);
  await page.keyboard.press('Control+a');
  const start = await paperPoint(page, 0.5, 0.5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await expect(page.locator('#float-w')).toHaveValue('40');
  await expect(page.locator('#float-h')).toHaveValue('30');
  await expect(page.locator('#float-angle')).toHaveValue('0');
  await expect(page.locator('#status-note')).toHaveText('Arrow keys nudge. Shift moves ten.');
  await page.mouse.up();
  await expect(page.locator('#float-w')).toHaveCount(0);
});

test('snaps a size-1 pencil to the grid and sticks a stroke to parallel lines', async ({ page }) => {
  await ready(page);
  await newCanvas(page, 64, 64);
  await page.locator('#menu-view').click();
  await page.locator('[data-command="toggle-snap"]').click();
  await page.keyboard.press('Escape');
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#size-slider').fill('1');
  const dot = await paperPoint(page, 10 / 64, 10 / 64);
  await page.mouse.click(dot.x, dot.y);
  const snapped = await pixel(page, 16 / 64, 16 / 64);
  const missed = await pixel(page, 10 / 64, 10 / 64);
  expect(snapped[0]).toBeLessThan(40);
  expect(missed[0]).toBeGreaterThan(200);
  await page.locator('#menu-view').click();
  await page.locator('[data-command="assist-parallel"]').click();
  await page.keyboard.press('Escape');
  await drag(page, 0.2, 0.5, 0.8, 0.5);
  await expect(page.locator('#status-note')).toHaveText('Parallel lines');
  await page.locator('#menu-view').click();
  await page.locator('[data-command="toggle-snap"]').click();
  await page.keyboard.press('Escape');
  await drag(page, 0.3, 0.25, 0.7, 0.8);
  const ys = await page.evaluate(() => {
    const canvas = document.querySelector('#image-canvas') as HTMLCanvasElement;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const rows: number[] = [];
    for (let y = 0; y < canvas.height; y++) {
      for (let x = Math.floor(canvas.width * 0.35); x < canvas.width * 0.65; x++) {
        if (data[(y * canvas.width + x) * 4] < 40) rows.push(y);
      }
    }
    return rows;
  });
  expect(ys.length).toBeGreaterThan(0);
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(3);
});

test('rotates the view only for a clear twist and resets from the status bar', async ({ page }) => {
  await ready(page);
  await newCanvas(page);
  const twist = async (degrees: number) => {
    return page.evaluate(angle => {
      const fire = (type: string, id: number, x: number, y: number) => {
        window.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch' }));
      };
      fire('pointerdown', 11, 300, 400);
      fire('pointerdown', 12, 500, 400);
      const radians = angle * Math.PI / 180;
      const cx = 400;
      const cy = 400;
      const place = (radius: number, turn: number) => ({ x: cx + Math.cos(turn) * radius, y: cy + Math.sin(turn) * radius });
      const left = place(100, Math.PI + radians);
      const right = place(100, radians);
      fire('pointermove', 11, left.x, left.y);
      fire('pointermove', 12, right.x, right.y);
      fire('pointerup', 11, left.x, left.y);
      fire('pointerup', 12, right.x, right.y);
    }, degrees);
  };
  await twist(12);
  await expect(page.locator('#view-angle')).toHaveText('0°');
  await twist(36);
  const turned = await page.locator('#view-angle').textContent();
  expect(Math.abs(Number.parseInt(turned ?? '0', 10))).toBeGreaterThan(20);
  await page.locator('#view-angle').click();
  await expect(page.locator('#view-angle')).toHaveText('0°');
});

test('long-presses an eye, paints a mask, and picks from the mixer without undo', async ({ page }) => {
  await ready(page);
  await newCanvas(page, 48, 48);
  await page.locator('button[aria-label="Add layer"]').click();
  const eye = page.locator('input[data-visible][data-layer="1"]');
  const box = await eye.boundingBox();
  if (!box) throw new Error('The layer eye is not visible.');
  await eye.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: box.x + 4, clientY: box.y + 4, button: 0, pointerId: 9 });
  await expect(page.locator('#context-menu')).toContainText('Hide others', { timeout: 2000 });
  await page.keyboard.press('Escape');
  await page.locator('[data-tool="pencil"]').click();
  await page.locator('#size-slider').fill('8');
  await page.locator('#primary-input').fill('#ff0000');
  await drag(page, 0.5, 0.5, 0.52, 0.5);
  await page.locator('#menu-layers').click();
  await page.locator('[data-command="layer-mask"]').click();
  await expect(page.locator('#status-note')).toHaveText('Painting the mask');
  await page.locator('#primary-input').fill('#000000');
  await page.locator('input[data-visible][data-layer="0"]').uncheck();
  await drag(page, 0.5, 0.5, 0.52, 0.5);
  const hidden = await pixel(page, 0.5, 0.5);
  expect(hidden[3]).toBeLessThan(20);
  await page.locator('#layer-list .layer').first().click();
  await expect(page.locator('#status-note')).not.toHaveText('Painting the mask');
  const steps = await page.locator('#history-list .history-item').count();
  await page.locator('#mix-toggle').click();
  await expect(page.locator('#mixer-panel')).toBeVisible();
  await page.locator('#mixer').click();
  await expect(page.locator('#history-list .history-item')).toHaveCount(steps);
});

test.describe('touchscreen', () => {
  test.use({ hasTouch: true });

  test('draws with a finger instead of scrolling the canvas', async ({ page }) => {
    await ready(page);
    await newCanvas(page);
    await page.locator('[data-tool="pencil"]').click();
    await page.locator('#size-slider').fill('16');
    const box = await page.locator('#paper').boundingBox();
    if (!box) throw new Error('The canvas is not visible.');
    const x = box.x + box.width * 0.5;
    const y = box.y + box.height * 0.5;
    const client = await page.context().newCDPSession(page);
    const point = (type: 'touchStart' | 'touchMove' | 'touchEnd', active: boolean) => client.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: active ? [{ x, y: type === 'touchMove' ? y + 12 : y, id: 1 }] : [],
    });
    await point('touchStart', true);
    await point('touchMove', true);
    await point('touchEnd', false);
    await expect.poll(async () => (await pixel(page, 0.5, 0.5))[0]).toBeLessThan(40);
  });
});
