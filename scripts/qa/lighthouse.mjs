import lighthouse from 'lighthouse'
import * as chromeLauncher from 'chrome-launcher'
import { chromium } from '@playwright/test'
import { mkdir,writeFile } from 'node:fs/promises'
const out='/tmp/together-qa/lighthouse';await mkdir(out,{recursive:true})
const chrome=await chromeLauncher.launch({chromePath:chromium.executablePath(),chromeFlags:['--headless','--no-sandbox','--disable-dev-shm-usage']})
try{for(const route of ['','traveler','contact','coordinator']){
 const result=await lighthouse((process.env.QA_BASE_URL||'http://127.0.0.1:5174/')+'#/'+route,{port:chrome.port,output:'html',onlyCategories:['accessibility'],logLevel:'error',formFactor:'desktop',screenEmulation:{mobile:false,width:1440,height:1000,deviceScaleFactor:1,disabled:false}})
 await writeFile(`${out}/${route||'incident'}.html`,result.report)
 console.log(`Lighthouse ${route||'incident'}: ${result.lhr.categories.accessibility.score*100}`)
}}
finally{await chrome.kill()}
