import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {HOLO_EFFECTS} from '@kongyo2/cards-css';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:3000/debug/foil');await page.locator('.bp-full-foil').last().waitFor();
 assert.equal(await page.locator('.bp-full-foil').count(),15);
 const signatures=[];mkdirSync('docs/screenshots',{recursive:true});
 for(const effect of HOLO_EFFECTS){
  const card=page.locator(`[data-material="${effect}"]`);await card.scrollIntoViewIfNeeded();
  assert.equal(await card.getAttribute('data-effect'),effect);
  if(effect==='none'){assert.equal(await card.locator('.holo-card__shine').evaluate(e=>getComputedStyle(e).display),'none');continue;}
  const b=await card.boundingBox();await page.mouse.move(b.x+b.width*.15,b.y+b.height*.22);await page.waitForTimeout(220);
  const a=await card.evaluate(e=>({x:e.style.getPropertyValue('--pointer-x'),bg:getComputedStyle(e.querySelector('.holo-card__shine')).backgroundImage}));
  assert.notEqual(a.bg,'none',effect+' has recipe');signatures.push(a.bg);
  await page.mouse.move(b.x+b.width*.85,b.y+b.height*.7);await page.waitForTimeout(220);
  assert.notEqual(a.x,await card.evaluate(e=>e.style.getPropertyValue('--pointer-x')),effect+' moves');
  assert.ok(Number(await card.locator('.holo-card__shine').evaluate(e=>getComputedStyle(e).opacity))>.5,effect+' full-face reflection');
  if(['holo','gold','cosmos','prism','oilslick','mosaic'].includes(effect))await card.screenshot({path:`docs/screenshots/foil-${effect}-strong.png`});
 }
 assert.equal(new Set(signatures).size,14,'all 14 have distinct recipes');
 await page.getByRole('slider',{name:'彩色透明度',exact:true}).fill('0');
 assert.equal(await page.locator('[data-material="gold"] .holo-card__shine').evaluate(e=>getComputedStyle(e).opacity),'0');
 await page.getByRole('slider',{name:'白光透明度',exact:true}).fill('0.81');
 await page.getByRole('slider',{name:'光带宽度',exact:true}).fill('42');
 await page.getByLabel('彩色混合方式',{exact:true}).selectOption('overlay');
 await page.reload();await page.locator('.bp-full-foil').last().waitFor();
 assert.equal(await page.getByRole('slider',{name:'白光透明度',exact:true}).inputValue(),'0.81');
 assert.equal(await page.getByRole('slider',{name:'光带宽度',exact:true}).inputValue(),'42');
 assert.equal(await page.locator('[data-material="holo"] .holo-card__glare').evaluate(e=>getComputedStyle(e).opacity),'0.81');
 assert.equal(await page.locator('[data-material="holo"] .holo-card__shine').evaluate(e=>getComputedStyle(e).mixBlendMode),'overlay');
 await page.getByRole('button',{name:'复制参数',exact:true}).click();
 await page.getByText('参数已复制，可以粘贴到对话里').waitFor({state:'visible'});
 await page.getByRole('button',{name:'恢复默认',exact:true}).click();
 const gold=page.locator('[data-material="gold"]');await gold.locator('..').locator('..').getByRole('button',{name:'翻到卡背'}).click();
 assert.equal(await page.locator('[data-material="gold"] .holo-card__shine').evaluate(e=>getComputedStyle(e).display),'none');
 await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(250);
 const holo=page.locator('[data-material="holo"]');await holo.scrollIntoViewIfNeeded();const initial=await holo.getAttribute('style');const b=await holo.boundingBox();await page.mouse.move(b.x+30,b.y+30);await page.waitForTimeout(200);assert.equal(await holo.getAttribute('style'),initial);
 assert.deepEqual(errors,[]);
 await page.emulateMedia({reducedMotion:'no-preference'});await page.getByRole('button',{name:'恢复默认',exact:true}).click();await page.waitForTimeout(250);
 await page.screenshot({path:'docs/screenshots/cards-css-all-14.png',fullPage:true});
 console.log('PASS: all 14 distinct recipes + none, every pointer response, strong opacity, tuning controls, persistence, copy, reset, flip, reduced motion, zero browser errors');
}finally{await browser.close();}
