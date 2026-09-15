import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { server, renderStore } from './server.mjs';
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(() => server.close());
test('partner storefront shares products and changes branding', async () => {
  const original = await (await fetch(base)).text();
  const partner = await (await fetch(base + '/shop/home-helper')).text();
  for (const product of ['Silicone Stove-Gap Covers', 'Vegetable Chopper', 'Pull-Out Cabinet Organizer']) {
    assert.ok(original.includes(product)); assert.ok(partner.includes(product));
  }
  assert.ok(partner.includes('Home Helper'));
  assert.ok(partner.includes('commissions are not enabled'));
  assert.ok(partner.includes('href="/site.css"'));
  assert.ok(!partner.includes('href="https://www.amazon.com'));
});
test('unknown stores and private files are not served', async () => {
  for (const path of ['/shop/unknown', '/stores.json', '/server.mjs', '/.env', '/package.json']) {
    assert.equal((await fetch(base + path)).status, 404);
  }
});
test('branding cannot inject markup', () => {
  const html = renderStore({slug:'test', name:'<script>alert(1)</script>',tagline:'<img src=x onerror=alert(1)>',accent:'#167164'});
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x'));
});
