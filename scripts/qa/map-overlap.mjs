import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
const base=process.env.QA_BASE_URL||'http://127.0.0.1:5174/'
const out=process.env.QA_OUTPUT||'/tmp/together-map-overlap';await mkdir(out,{recursive:true})
const browser=await chromium.launch()
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark'})
 const page=await context.newPage();await page.goto(base+'#/signin');await page.getByLabel('Email',{exact:true}).fill('coordinator@demo.together.example.com');await page.getByLabel('Password',{exact:true}).fill(process.env.DEMO_PASSWORD);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/#/coordinator',{timeout:20000});await page.goto(base+'#/');await page.getByRole('region',{name:'Coordinator Incident controls'}).waitFor();await page.waitForTimeout(1500)
 for(const width of [1440,1280,1024,912,768,390,360]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100)
  const height=await page.evaluate(()=>document.documentElement.scrollHeight)
  for(let y=0;y<height;y+=160){
   await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(30)
   const geometry=await page.evaluate(()=>{const map=document.querySelector('.incident-map').getBoundingClientRect(),cases=document.querySelector('.incident-management').getBoundingClientRect();const overlap=Math.max(0,Math.min(map.right,cases.right)-Math.max(map.left,cases.left))*Math.max(0,Math.min(map.bottom,cases.bottom)-Math.max(map.top,cases.top));return{overlap,map:{top:map.top,bottom:map.bottom},cases:{top:cases.top,bottom:cases.bottom}}})
   if(geometry.overlap>1){await page.screenshot({path:`${out}/overlap-${width}.png`});console.log('FAIL map overlaps Case summary',JSON.stringify({width,y,...geometry}));assert.equal(geometry.overlap,0)}
  }
  await page.evaluate(()=>{const rect=document.querySelector('.incident-management').getBoundingClientRect();scrollBy(0,rect.top-360)})
  await page.screenshot({path:`${out}/resolved-${width}.png`})
  console.log(`PASS map and Case summary never overlap while scrolling at ${width}px`)
 }
}finally{await browser.close()}
