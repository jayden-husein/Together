import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const base=process.env.QA_BASE_URL||'http://127.0.0.1:5174/'
const browser=await chromium.launch()
async function login(page,role){await page.goto(base+'#/signin');await page.getByLabel('Email',{exact:true}).fill(`${role}@demo.together.example.com`);await page.getByLabel('Password',{exact:true}).fill(process.env.DEMO_PASSWORD);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(role==='coordinator'?'**/#/coordinator':'**/#/traveler',{timeout:20000})}
try{
 const context=await browser.newContext({colorScheme:'dark'});const page=await context.newPage();await login(page,'maya')
 await page.getByLabel('Paste your plans').fill('QA draft: Phantom Ranch tomorrow afternoon')
 page.once('dialog',d=>d.dismiss());await page.getByRole('link',{name:'Incident',exact:true}).click();assert(page.url().includes('#/traveler'))
 page.once('dialog',d=>d.accept());await page.getByRole('link',{name:'Incident',exact:true}).click();await page.waitForURL('**/#/');await page.goto(base+'#/traveler');await page.getByLabel('Paste your plans').waitFor();assert.equal(await page.getByLabel('Paste your plans').inputValue(),'QA draft: Phantom Ranch tomorrow afternoon')
 await page.getByLabel('Paste your plans').fill('')
 await context.setOffline(true);await page.getByText("You're offline. Connect to send changes. Nothing is queued.",{exact:true}).waitFor();assert(await page.getByRole('button',{name:'Fill in stops',exact:true}).isDisabled());await context.setOffline(false)
 console.log('PASS unsaved-change cancellation, draft restoration, and offline submission blocking')
 await context.close()
 const adminContext=await browser.newContext({colorScheme:'dark'});const admin=await adminContext.newPage();await login(admin,'coordinator');await admin.getByRole('heading',{name:'Cases',exact:true}).waitFor();await admin.waitForTimeout(2000)
 await admin.clock.install({time:new Date()});await admin.clock.fastForward(1740000);await admin.getByRole('dialog',{name:'Still there?',exact:true}).waitFor();await admin.clock.fastForward(61000);await admin.getByRole('dialog',{name:'Your session expired. Sign in again to continue.',exact:true}).waitFor({timeout:15000});assert.equal(await admin.getByRole('button',{name:'Post update',exact:true}).count(),0)
 console.log('PASS Coordinator 29-minute warning and 30-minute automatic sign-out')
 await adminContext.close()
}finally{await browser.close()}
