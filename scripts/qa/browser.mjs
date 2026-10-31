import { chromium } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const base=process.env.QA_BASE_URL||'http://127.0.0.1:5174/'
const out=process.env.QA_OUTPUT||'/tmp/together-qa'
await mkdir(out+'/screenshots',{recursive:true})
const browser=await chromium.launch({headless:true})
const results=[]
try {
for(const role of ['visitor','maya','sam','coordinator']){
 const context=await browser.newContext({viewport:{width:1440,height:1000}})
 const page=await context.newPage()
 page.on('dialog',dialog=>dialog.accept())
 if(role!=='visitor'){
  await page.goto(base+'#/signin')
  await page.getByLabel('Email',{exact:true}).fill(`${role}@demo.together.example.com`)
  await page.getByLabel('Password',{exact:true}).fill(process.env.DEMO_PASSWORD)
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  await page.waitForURL(role==='coordinator'?'**/#/coordinator':role==='sam'?'**/#/contact':'**/#/traveler',{timeout:20000})
 }
 for(const route of ['','traveler','contact','coordinator']){
  await page.goto(base+'#/'+route)
  await page.locator('h1').waitFor({timeout:20000})
  if(role==='visitor'&&route)assert.match(await page.locator('h1').innerText(),/Welcome back/)
  if(role==='coordinator'&&['traveler','contact'].includes(route)){assert.match(await page.locator('h1').innerText(),/Coordinator accounts can't use this page/);assert.equal(await page.locator('main form').count(),0)}
  if(['maya','sam'].includes(role)&&route==='coordinator'){assert.match(await page.locator('h1').innerText(),/Coordinator access required/);assert.equal(await page.locator('main form').count(),0)}
  await page.waitForTimeout(1000)
  for(const width of [1440,1280,1024,912,768,390,360]){
   await page.setViewportSize({width,height:1000})
   await page.waitForTimeout(100)
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)
   results.push({role,route:route||'incident',width,overflow})
   await page.screenshot({path:`${out}/screenshots/${role}-${route||'incident'}-${width}.png`,fullPage:true})
  }
  await page.setViewportSize({width:1440,height:1000})
  const axe=await new AxeBuilder({page}).analyze()
  results.push({role,route:route||'incident',axe:axe.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>n.target)}))})
 }
 if(role!=='visitor'){
  await page.setViewportSize({width:1440,height:1000})
  await page.getByRole('button',{name:'Log out',exact:true}).click()
  await page.waitForURL('**/#/')
  await page.goBack()
  await page.locator('h1').waitFor()
  assert.equal(await page.locator('main form.case-action').count(),0)
  assert.equal(await page.getByRole('link',{name:'Sign in',exact:true}).count(),1)
 }
 await context.close()
 console.log(`PASS route protection, login/logout/back, screenshots: ${role}`)
}
} finally {await writeFile(out+'/browser-results.json',JSON.stringify(results,null,2));await browser.close()}
console.log('Overflow findings:',results.filter(r=>r.overflow).length)
console.log('Serious axe findings:',results.flatMap(r=>r.axe??[]).filter(v=>['serious','critical'].includes(v.impact)).length)
