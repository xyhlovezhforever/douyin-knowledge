import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const baseUrl = 'http://127.0.0.1:5173';
const outputDir = new URL('../.qa/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
});

async function assertNoHorizontalOverflow(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.content <= dimensions.viewport + 1, `${label} horizontal overflow: ${dimensions.content} > ${dimensions.viewport}`);
}

try {
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await desktop.goto(baseUrl, { waitUntil: 'networkidle' });
  await desktop.getByRole('heading', { name: '点赞与收藏监测' }).waitFor();
  await assertNoHorizontalOverflow(desktop, 'desktop monitor');
  await desktop.screenshot({ path: fileURLToPath(new URL('monitor-desktop.png', outputDir)), fullPage: true });
  if (await desktop.locator('.library-item').count()) {
    await desktop.getByRole('button', { name: '查看分析' }).first().click();
    await desktop.locator('.analysis-panel').waitFor();
    assert.match(await desktop.locator('.analysis-status').innerText(), /图文作品|语音已转写|画面文字已识别/);
    await desktop.screenshot({ path: fileURLToPath(new URL('analysis-panel.png', outputDir)), fullPage: true });
    await desktop.getByRole('button', { name: '关闭分析' }).click();
  }

  await desktop.getByRole('button', { name: 'AI 配置' }).click();
  await desktop.getByRole('heading', { name: 'AI 分析配置' }).waitFor();
  assert.equal(await desktop.locator('.provider-switch button').count(), 2);
  assert.equal(await desktop.locator('input[type="password"]').count(), 1);
  assert.equal(await desktop.locator('input').first().inputValue(), '');
  await desktop.getByRole('button', { name: 'DeepSeek' }).click();
  await desktop.getByRole('button', { name: '阿里云百炼' }).click();
  await assertNoHorizontalOverflow(desktop, 'desktop AI config');
  await desktop.screenshot({ path: fileURLToPath(new URL('ai-config-desktop.png', outputDir)), fullPage: true });

  await desktop.getByRole('button', { name: '连接器设置' }).click();
  await desktop.getByRole('heading', { name: '连接器' }).waitFor();
  assert.equal(await desktop.locator('.connector-item').count(), 4);
  await desktop.getByRole('button', { name: '关闭设置' }).click();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
  await mobile.getByRole('heading', { name: '点赞与收藏监测' }).waitFor();
  await mobile.waitForTimeout(800);
  await assertNoHorizontalOverflow(mobile, 'mobile');
  await mobile.screenshot({ path: fileURLToPath(new URL('monitor-mobile.png', outputDir)), fullPage: true });
  await mobile.getByRole('button', { name: 'AI 配置' }).click();
  await mobile.getByRole('heading', { name: 'AI 分析配置' }).waitFor();
  await assertNoHorizontalOverflow(mobile, 'mobile AI config');
  await mobile.screenshot({ path: fileURLToPath(new URL('ai-config-mobile.png', outputDir)), fullPage: true });

  console.log(JSON.stringify({ monitorDesktop: '.qa/monitor-desktop.png', analysisPanel: '.qa/analysis-panel.png', aiConfigDesktop: '.qa/ai-config-desktop.png', monitorMobile: '.qa/monitor-mobile.png', aiConfigMobile: '.qa/ai-config-mobile.png', status: 'passed' }));
} finally {
  await browser.close();
}
