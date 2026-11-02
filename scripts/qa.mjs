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

  await desktop.getByRole('button', { name: '单条分析' }).click();
  await desktop.getByRole('button', { name: '载入示例' }).click();
  await desktop.getByRole('heading', { name: /从视频研究到可执行结论/ }).waitFor();
  await desktop.waitForTimeout(800);
  assert.equal(await desktop.locator('.comment-card').count(), 4);
  await assertNoHorizontalOverflow(desktop, 'desktop');
  await desktop.screenshot({ path: fileURLToPath(new URL('desktop.png', outputDir)), fullPage: true });

  await desktop.getByRole('button', { name: '转写' }).click();
  await desktop.getByRole('textbox', { name: '搜索转写' }).fill('评论区');
  assert.ok(await desktop.locator('.transcript-row').count() >= 1);
  await desktop.getByRole('button', { name: /评论/ }).click();
  await desktop.getByRole('button', { name: '纠错' }).click();
  assert.equal(await desktop.locator('.comment-card').count(), 1);
  await desktop.getByRole('button', { name: '连接器设置' }).click();
  await desktop.getByRole('heading', { name: '连接器' }).waitFor();
  assert.equal(await desktop.locator('.connector-item').count(), 4);
  await desktop.getByRole('button', { name: '关闭设置' }).click();

  await desktop.getByRole('textbox', { name: '视频链接' }).fill('https://weixin.qq.com/sph/ACk7oojJzJ');
  await desktop.getByRole('button', { name: '开始分析' }).click();
  await desktop.getByRole('alert').getByText('该视频号内容在网页端暂时无法播放，可能已失效、需要登录或仅可在微信内查看。').waitFor();
  assert.equal(await desktop.getByRole('button', { name: '查看连接器' }).count(), 0);
  await desktop.screenshot({ path: fileURLToPath(new URL('wechat-error.png', outputDir)), fullPage: true });

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await mobile.goto(baseUrl, { waitUntil: 'networkidle' });
  await mobile.getByRole('heading', { name: '点赞与收藏监测' }).waitFor();
  await mobile.waitForTimeout(800);
  await assertNoHorizontalOverflow(mobile, 'mobile');
  await mobile.screenshot({ path: fileURLToPath(new URL('monitor-mobile.png', outputDir)), fullPage: true });

  console.log(JSON.stringify({ monitorDesktop: '.qa/monitor-desktop.png', desktop: '.qa/desktop.png', monitorMobile: '.qa/monitor-mobile.png', wechatError: '.qa/wechat-error.png', status: 'passed' }));
} finally {
  await browser.close();
}
