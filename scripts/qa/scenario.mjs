import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const base=process.env.QA_BASE_URL||'http://127.0.0.1:5174/'
const browser=await chromium.launch()
const pages={}
try{
for(const role of ['maya','sam','coordinator']){
 const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark'})
 const page=await context.newPage();page.on('dialog',d=>d.accept());pages[role]=page
 await page.goto(base+'#/signin');await page.getByLabel('Email',{exact:true}).fill(`${role}@demo.together.example.com`);await page.getByLabel('Password',{exact:true}).fill(process.env.DEMO_PASSWORD);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(role==='sam'?'**/#/contact':role==='maya'?'**/#/traveler':'**/#/coordinator',{timeout:20000})
}
const {maya,sam,coordinator}=pages
const change=maya.getByRole('button',{name:'Change answer',exact:true})
await maya.getByRole('heading',{name:/Hi /}).waitFor()
await maya.waitForTimeout(2000)
if(await change.count())await change.click()
await maya.getByRole('button',{name:'Safe',exact:true}).click()
await maya.getByRole('heading',{name:'You checked in Safe'}).waitFor()
await maya.getByText('Check-in sent.',{exact:true}).waitFor()
console.log('PASS Maya Safe check-in collapses')
await sam.getByRole('button',{name:/I can't reach Maya/}).click()
await sam.getByRole('dialog').waitFor()
assert.match(await sam.getByRole('dialog').innerText(),/checked in Safe/)
await sam.getByRole('button',{name:'Yes, report it'}).click()
await sam.getByRole('button',{name:'Cancel report'}).waitFor()
console.log('PASS Sam recent-Safe confirmation and cancel window')
await coordinator.getByRole('button',{name:/Maya/}).first().click()
await coordinator.getByRole('region',{name:/Case: Maya/}).waitFor()
await coordinator.getByText(/contact reported can't reach/).waitFor({timeout:15000})
console.log('PASS coordinator conflict banner updates without reload')
await coordinator.getByRole('tab',{name:'Contact attempt',exact:true}).click()
await coordinator.getByLabel('Reached',{exact:true}).check()
await coordinator.getByLabel('Note',{exact:true}).fill('QA private coordinator note')
await coordinator.getByRole('button',{name:'Record',exact:true}).click()
await sam.getByText(/A coordinator reached Maya/).first().waitFor({timeout:15000})
assert(!await sam.locator('main').innerText().then(t=>t.includes('QA private coordinator note')))
console.log('PASS attempt reaches contact without private note')
await coordinator.getByRole('button',{name:'Post update',exact:true}).click()
await coordinator.getByLabel(/General Update for/).fill('Simulation: shelter open. Please check with staff for availability.')
await coordinator.getByRole('button',{name:'Preview update'}).click()
await coordinator.getByRole('dialog',{name:'Post publicly?',exact:true}).waitFor()
await coordinator.getByRole('button',{name:'Post publicly',exact:true}).click()
await maya.getByText('Simulation: shelter open. Please check with staff for availability.',{exact:true}).first().waitFor({timeout:15000})
await sam.getByText('Simulation: shelter open. Please check with staff for availability.',{exact:true}).first().waitFor({timeout:15000})
console.log('PASS preview and public post propagate to Maya and Sam without reload')
await mkdir('/tmp/together-qa/scenario',{recursive:true})
for(const [role,page]of Object.entries(pages))await page.screenshot({path:`/tmp/together-qa/scenario/${role}.png`,fullPage:true})
}finally{await browser.close()}
