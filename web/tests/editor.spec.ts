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
  await expect(page.locator('#engine-status')).toHaveAttribute('data-state', 'ready');
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

test('starts the pixel engine and lists every tool', async ({ page }) => {
  await ready(page);
  const tools = page.locator('#tool-list [data-tool]');
  await expect(tools).toHaveCount(22);
  const ids = await tools.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-tool')));
  expect(new Set(ids).size).toBe(22);
  for (let index = 0; index < 22; index++) {
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
  await expect(page.locator('#save-state')).toHaveText('Saved locally');
  const serial = await page.locator('#save-state').getAttribute('data-serial');
  await drag(page, 0.5, 0.5, 0.52, 0.52);
  await page.waitForFunction(previous => {
    const label = document.querySelector('#save-state');
    return label?.textContent === 'Saved locally' && label.getAttribute('data-serial') !== previous;
  }, serial);
  await page.goto('/');
  await expect(page.locator('#engine-status')).toHaveAttribute('data-state', 'ready');
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
    } else if (id === 'clone') {
      const source = await paperPoint(page, 0.25, 0.25);
      await page.keyboard.down('Alt');
      await page.mouse.click(source.x, source.y);
      await page.keyboard.up('Alt');
      await drag(page, 0.4, 0.4, 0.55, 0.5);
    } else await drag(page, 0.2, 0.2, 0.7, 0.6);
    await expect(page.locator('#image-canvas')).toBeVisible();
  }
});
