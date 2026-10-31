import {chromium} from '@playwright/test'
import assert from 'node:assert/strict'
const base=process.env.QA_BASE_URL||'http://127.0.0.1:5174/'
const browser=await chromium.launch()
try{
 const page=await browser.newPage({viewport:{width:1440,height:900},colorScheme:'dark'});if(process.env.QA_FIXTURE_PENDING==='1')await page.route('**/rest/v1/potential_incidents?*',route=>{const url=new URL(route.request().url());if(url.searchParams.get('dismissed_at')==='is.null')return route.fulfill({json:[{id:'qa-pending',name:'Pending verification test',summary:'Simulation',starts_at:new Date().toISOString(),fallback:true,corroborated:false,sources:[],area:{type:'Polygon',coordinates:[[[-112.1,36.1],[-112.09,36.1],[-112.09,36.11],[-112.1,36.1]]]},earlier:null}]});return route.continue()});await page.goto(base+'#/signin');await page.getByLabel('Email',{exact:true}).fill('coordinator@demo.together.example.com');await page.getByLabel('Password',{exact:true}).fill(process.env.DEMO_PASSWORD);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/#/coordinator',{timeout:20000});await page.locator('.potential-review').first().waitFor()
 const before=await page.locator('.detail-container').evaluate(e=>({top:e.getBoundingClientRect().top,position:getComputedStyle(e).position}))
 await page.evaluate(()=>scrollTo(0,600))
 const after=await page.locator('.detail-container').evaluate(e=>({top:e.getBoundingClientRect().top,y:scrollY}))
 assert.equal(Math.round(before.top-after.top),Math.round(after.y),'Case detail must move with the page when verification is pending')
 assert.equal(before.position,'static')
 console.log('PASS pending verification: Case detail scrolls normally with the page')
}finally{await browser.close()}
