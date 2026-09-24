import {test,expect}from'@playwright/test';
import{readFile}from'node:fs/promises';
test('image → ASCII → exported text JSON → import → save/open project',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.locator('#imageInput').setInputFiles('fixtures/converter_probe.png');await expect(page.locator('#imageInfo')).toContainText('160');
 await page.locator('#mode').selectOption('ascii');await page.locator('#quality').selectOption('low');await page.locator('#convert').click();await expect(page.locator('#message')).toContainText('Создано');
 await page.locator('#previewMode').selectOption('dota');const pending=page.waitForEvent('download');await page.locator('#export').click();const file=await pending;const json=JSON.parse(await readFile(await file.path(),'utf8'));
 expect(json.configs[0].categories.length).toBeGreaterThan(0);expect(json.configs[0].categories.every(c=>c.width===0&&c.height===0&&c.hero_ids.length===0)).toBeTruthy();
 await page.locator('#fileInput').setInputFiles({name:'hero_grid_config.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))});await expect(page.locator('#message')).toContainText('Открыт');
 await page.locator('.cat').first().click();await expect(page.locator('#inspector')).toContainText('Type: Text');
 const saved=page.waitForEvent('download');await page.locator('#save').click();const project=await saved;const body=await readFile(await project.path());await page.locator('#fileInput').setInputFiles({name:'roundtrip.dotagrid',mimeType:'application/json',buffer:body});await expect(page.locator('#message')).toContainText('roundtrip');expect(errors).toEqual([]);
});
test('Line Art export, budget gate, calibration, and JSON dialog',async({page})=>{
 await page.goto('/');await page.locator('#imageInput').setInputFiles('fixtures/converter_probe.png');await expect(page.locator('#imageInfo')).toContainText('160');await page.locator('#convert').click();await expect(page.locator('#message')).toContainText('Создано');
 await page.locator('#budget').fill('1');await page.locator('#budget').blur();await page.locator('#export').click();await expect(page.locator('#message')).toContainText('бюджете');
 page.on('dialog',d=>d.accept());await page.locator('#calibrate').click();await expect(page.locator('#name')).toHaveValue('Dota Glyph Calibration v0.2');await page.locator('#jsonPreview').click();await expect(page.locator('#jsonText')).toContainText('ABCDEFGHIJKLMNOPQRSTUVWXYZ');await page.locator('#closeJson').click();
 await page.screenshot({path:'test-results/calibration.png',fullPage:true});
});
test('install invokes the same generated text config',async({page})=>{
 await page.addInitScript(()=>{window.__TAURI__={core:{invoke:async(cmd,args)=>{if(cmd==='find_accounts')return[{account:'123',path:'C:/Steam/userdata/123/570/remote/cfg/hero_grid_config.json',exists:false}];if(cmd==='install_grid'){window.installed=args;return{name:args.grid.config_name,backup:'test.json',categories:args.grid.categories.length};}return[];}}};});
 await page.goto('/');await page.locator('#calibrate').click();await page.locator('#refreshAccounts').click();await page.locator('#account').selectOption({index:1});await page.locator('#install').click();await expect(page.locator('#message')).toContainText('Установлена');const data=await page.evaluate(()=>window.installed);expect(data.grid.categories.some(c=>c.category_name==='█')).toBeTruthy();expect(data.grid.categories.every(c=>c.hero_ids.length===0)).toBeTruthy();
});
test('category edits undo and redo and invalid files do not replace project',async({page})=>{
 await page.goto('/');await page.locator('#addCategory').click();await page.locator('[data-key="category_name"]').fill('Changed');await page.locator('[data-key="category_name"]').blur();await page.locator('#undo').click();await expect(page.locator('.cat')).toContainText('New category');await page.locator('#redo').click();await expect(page.locator('.cat')).toContainText('Changed');await page.locator('#fileInput').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{')});await expect(page.locator('.cat')).toContainText('Changed');
});
