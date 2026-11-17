import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'work');
fs.mkdirSync(output, {recursive:true});
const profile = path.join(output, 'chrome-' + randomUUID());
const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const requests = [], exceptions = [];
let printPolls=0;
const server = http.createServer((request, response) => {
  let body = '';
  request.on('data', data => body += data);
  request.on('end', () => {
    requests.push({url:request.url, method:request.method, headers:request.headers, body});
    if (request.url === '/api/check-in') {response.writeHead(202,{'Content-Type':'application/json'}); response.end(JSON.stringify({job_id:'local-job-1',state:'queued'})); return;}
    if (request.url === '/api/print-jobs/local-job-1') {printPolls++; response.setHeader('Content-Type','application/json'); response.end(JSON.stringify(printPolls>=2?{state:'ready',receipt_text:'ROOM 608\nGUEST Lee'}:{state:'queued'})); return;}
    if (request.url === '/redirect') {response.writeHead(302,{Location:'http://localhost:'+server.address().port+'/redirected'}); response.end(); return;}
    if (request.url === '/redirect-post') {response.writeHead(302,{Location:'/redirect-post-final'}); response.end(); return;}
    if (request.url === '/large') {response.setHeader('Content-Type','text/plain'); response.end('x'.repeat(1048600)); return;}
    if (request.url === '/json') {response.setHeader('Content-Type','application/json'); response.end(JSON.stringify({received:body})); return;}
    response.setHeader('Content-Type','text/html; charset=utf-8');
    response.end('<!doctype html><title>Local test</title><body>HackTab local test</body>');
  });
});
const child = spawn(chromePath, ['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-pipe','--enable-unsafe-extension-debugging','--user-data-dir='+profile,'about:blank'], {windowsHide:true,stdio:['ignore','ignore','ignore','pipe','pipe']});
let sequence=0, buffer='';
const pending=new Map();
child.stdio[4].on('data',data=>{
  buffer+=data;
  let end;
  while((end=buffer.indexOf('\0'))>=0){
    const message=JSON.parse(buffer.slice(0,end)); buffer=buffer.slice(end+1);
    if(message.method==='Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    const item=pending.get(message.id);
    if(item){pending.delete(message.id); clearTimeout(item.timer); message.error?item.reject(new Error(JSON.stringify(message.error))):item.resolve(message.result);}
  }
});
function call(method,params={},sessionId){
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id); reject(new Error('Timeout: '+method));},15000);
    pending.set(id,{resolve,reject,timer});
    child.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');
  });
}
async function evaluate(session,expression){
  const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},session);
  if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(check,label){
  const deadline=Date.now()+10000;
  while(Date.now()<deadline){const value=await check(); if(value)return value; await new Promise(resolve=>setTimeout(resolve,40));}
  throw new Error('Timeout: '+label);
}
async function page(url){
  const {targetId}=await call('Target.createTarget',{url});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  await call('Page.enable',{},sessionId); await call('Runtime.enable',{},sessionId);
  return {targetId,sessionId};
}
let panel, inspected, base;
async function rpc(action,extra={}){
  const result=await evaluate(panel.sessionId,`chrome.runtime.sendMessage(${JSON.stringify({action,...extra})})`);
  assert.equal(result.ok,true,result.error);
  return result.result;
}
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
  console.log('Chrome:',(await call('Browser.getVersion')).product);
  const {id}=await call('Extensions.loadUnpacked',{path:root});
  console.log('PASS: Chrome loaded HackTab:',id);
  inspected=await page(base+'/start');
  await until(()=>requests.find(request=>request.url==='/start'),'initial page');
  // Supply the inspected tab ID normally provided to a DevTools panel.
  panel=await page('about:blank');
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`chrome.devtools={inspectedWindow:{tabId:-1}};`},panel.sessionId);
  await call('Page.navigate',{url:`chrome-extension://${id}/panel.html`},panel.sessionId);
  await until(()=>evaluate(panel.sessionId,"document.documentElement.dataset.ready==='true'"),'panel ready');
  const tabId=await evaluate(panel.sessionId,`chrome.tabs.query({}).then(tabs=>tabs.find(tab=>tab.url===${JSON.stringify(base+'/start')}).id)`);
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`chrome.devtools={inspectedWindow:{tabId:${tabId}}};`},panel.sessionId);
  await call('Page.reload',{},panel.sessionId);
  await until(()=>evaluate(panel.sessionId,"document.documentElement.dataset.ready==='true'"),'panel reload');
  const defaults={tabId,url:base+'/get',method:'GET',mode:'navigate',bodyType:'form',body:'',headersText:''};
  const headers='Referer: https://request-test.invalid/source\nUser-Agent: HackTab-Test/1.0\nCookie: hacktab_test=ok';
  async function execute(overrides){return rpc('execute',{request:{...defaults,...overrides}});}
  async function getRequest(route){return until(()=>requests.find(request=>request.url===route),route);}
  await execute({headersText:headers});
  const get=await getRequest('/get');
  assert.equal(get.headers['user-agent'],'HackTab-Test/1.0');
  assert.equal(get.headers.referer,'https://request-test.invalid/source');
  assert.equal(get.headers.cookie,'hacktab_test=ok');
  const other=await page(base+'/other');
  assert.notEqual((await getRequest('/other')).headers['user-agent'],'HackTab-Test/1.0');
  await until(()=>evaluate(inspected.sessionId,"document.readyState==='complete'"),'GET complete');
  await execute({url:base+'/post',method:'POST',body:'submit=ok&name=hello+world&repeat=one&repeat=two&encoded=a%26b&empty=&utf8=%E2%9C%93',headersText:headers});
  const post=await getRequest('/post');
  assert.equal(post.method,'POST');
  const values=new URLSearchParams(post.body);
  assert.equal(values.get('submit'),'ok'); assert.equal(values.get('name'),'hello world'); assert.equal(values.get('encoded'),'a&b'); assert.equal(values.get('empty'),''); assert.equal(values.get('utf8'),'✓'); assert.deepEqual(values.getAll('repeat'),['one','two']);
  await until(()=>evaluate(inspected.sessionId,"document.readyState==='complete'"),'POST complete');
  const loaded=await rpc('load',{tabId});
  assert.equal(loaded.url,base+'/post'); assert.equal(new URLSearchParams(loaded.body).get('utf8'),'✓');
  console.log('PASS: Navigate GET / POST, header overrides, tab isolation, and captured form data');

  const fetched=await execute({url:base+'/json',mode:'fetch',method:'PATCH',bodyType:'json',body:'{"value":"✓"}',headersText:headers+'\nX-Probe: raw'});
  const raw=await getRequest('/json');
  assert.equal(raw.method,'PATCH'); assert.equal(raw.body,'{"value":"✓"}'); assert.equal(raw.headers['content-type'],'application/json'); assert.equal(raw.headers['x-probe'],'raw'); assert.equal(raw.headers.cookie,'hacktab_test=ok'); assert.equal(raw.headers['user-agent'],'HackTab-Test/1.0');
  assert.equal(fetched.status,200); assert.equal(JSON.parse(fetched.body).received,raw.body);
  await execute({url:base+'/redirect',mode:'fetch',headersText:headers+'\nX-Probe: redirect'});
  const redirected=await getRequest('/redirected');
  assert.notEqual(redirected.headers['user-agent'],'HackTab-Test/1.0');
  assert(!redirected.headers['x-probe']); assert(!redirected.headers.cookie);
  const postRedirect=await execute({url:base+'/redirect-post',mode:'fetch',method:'POST',bodyType:'json',body:'{"probe":true}',headersText:'Content-Type: application/json'});
  assert.equal(postRedirect.redirected,true);
  assert.equal(postRedirect.url,base+'/redirect-post-final');
  assert.equal((await getRequest('/redirect-post-final')).method,'GET');
  const [first,second]=await Promise.all([
    execute({url:base+'/parallel-one',mode:'fetch',headersText:'X-Probe: one'}),
    execute({url:base+'/parallel-two',mode:'fetch',headersText:'X-Probe: two'})
  ]);
  assert.equal(first.status,200); assert.equal(second.status,200);
  assert.equal((await getRequest('/parallel-one')).headers['x-probe'],'one'); assert.equal((await getRequest('/parallel-two')).headers['x-probe'],'two');
  const large=await execute({url:base+'/large',mode:'fetch'});
  assert.equal(large.truncated,true); assert.equal(large.body.length,1048576);
  console.log('PASS: Fetch raw JSON, custom headers, serialized requests, and bounded response previews');

  await rpc('reset-headers',{tabId});
  await call('Page.navigate',{url:base+'/reset'},inspected.sessionId);
  assert.notEqual((await getRequest('/reset')).headers['user-agent'],'HackTab-Test/1.0');
  const history=await rpc('history',{tabId});
  assert(history.length>=6);
  await call('ServiceWorker.enable',{},inspected.sessionId); await call('ServiceWorker.stopAllWorkers',{},inspected.sessionId);
  assert.equal((await rpc('history',{tabId})).length,history.length);
  const invalid=await evaluate(panel.sessionId,`chrome.runtime.sendMessage(${JSON.stringify({action:'execute',request:{...defaults,url:'javascript:alert(1)'}})})`);
  assert.equal(invalid.ok,false);
  console.log('PASS: Header reset, worker restart, session history, and rejected invalid requests');

  const documentUrl=await evaluate(inspected.sessionId,'location.href');
  const requestCount=requests.length;
  const fetchedHeaders=await rpc('fetch-headers',{tabId});
  assert.equal(await evaluate(inspected.sessionId,'location.href'),documentUrl);
  const backgroundRequest=requests.slice(requestCount).find(request=>request.url==='/reset');
  assert(backgroundRequest); assert.equal(backgroundRequest.method,'GET'); assert.equal(backgroundRequest.body,'');
  assert(/user-agent:/i.test(fetchedHeaders.headersText));
  assert(!/^(?:host|sec-fetch-site|content-length):/im.test(fetchedHeaders.headersText));
  console.log('PASS: Background header Fetch captures editable request headers without navigating the page');
  await call('Network.enable',{},inspected.sessionId);
  await call('Network.setCookie',{name:'header_fetch_test',value:'session',url:base+'/'},inspected.sessionId);
  await call('Network.setExtraHTTPHeaders',{headers:{Authorization:'Bearer local-header-test'}},inspected.sessionId);
  await call('Page.navigate',{url:base+'/authenticated'},inspected.sessionId);
  await getRequest('/authenticated');
  await until(()=>evaluate(inspected.sessionId,"document.readyState==='complete'"),'authenticated document');
  const authHeaders=await rpc('fetch-headers',{tabId});
  const authGet=requests.filter(request=>request.url==='/authenticated').at(-1);
  assert.equal(authGet.method,'GET');
  assert.equal(authGet.headers.authorization,'Bearer local-header-test');
  assert(authGet.headers.cookie.includes('header_fetch_test=session'));
  assert(/authorization: Bearer local-header-test/i.test(authHeaders.headersText));
  assert(/header_fetch_test=session/.test(authHeaders.headersText));
  await evaluate(inspected.sessionId,"location.hash='section'");
  const hashHeaders=await rpc('fetch-headers',{tabId});
  assert(/authorization: Bearer local-header-test/i.test(hashHeaders.headersText));
  assert((await evaluate(inspected.sessionId,'location.href')).endsWith('#section'));
  console.log('PASS: Header Fetch preserves page authorization and session cookies');

  await call('Page.bringToFront',{},panel.sessionId);
  await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false},panel.sessionId);
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]},panel.sessionId);
  assert.equal(await evaluate(panel.sessionId,"document.documentElement.dataset.theme"),'system');
  const dark=await evaluate(panel.sessionId,"getComputedStyle(document.body).backgroundColor");
  await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]},panel.sessionId);
  assert.notEqual(await evaluate(panel.sessionId,"getComputedStyle(document.body).backgroundColor"),dark);
  await evaluate(panel.sessionId,"document.getElementById('theme').value='dark';document.getElementById('theme').dispatchEvent(new Event('change'));");
  assert.equal(await evaluate(panel.sessionId,"getComputedStyle(document.body).backgroundColor"),dark);
  assert.equal(await evaluate(panel.sessionId,"document.querySelector('.brand span').textContent"),'Designed for web pentest');
  assert.equal(await evaluate(panel.sessionId,"document.querySelector('footer,#target-label')"),null);
  assert.equal(await evaluate(panel.sessionId,"document.getElementById('status').hidden"),true);
  assert.equal(await evaluate(panel.sessionId,"document.getElementById('status').parentElement.className"),'header-tools');
  assert.equal(await evaluate(panel.sessionId,"Boolean(document.getElementById('response-pane').compareDocumentPosition(document.getElementById('scratch')) & Node.DOCUMENT_POSITION_FOLLOWING)"),true);
  assert.equal(await evaluate(panel.sessionId,"Boolean(document.getElementById('history-pane').compareDocumentPosition(document.getElementById('scratch')) & Node.DOCUMENT_POSITION_FOLLOWING)"),true);
  await evaluate(panel.sessionId,"document.getElementById('fetch-headers').click()");
  await until(()=>evaluate(panel.sessionId,"!document.getElementById('fetch-headers').disabled && /user-agent:/i.test(document.getElementById('headers').value)"),'Fetch headers button');
  await evaluate(panel.sessionId,"document.getElementById('reset-headers').click()");
  await until(()=>evaluate(panel.sessionId,"document.getElementById('headers').value===''"),'Reset headers button');
  await evaluate(panel.sessionId,"document.getElementById('scratch').focus();document.getElementById('scratch').value='abcXYZdef';document.getElementById('scratch').setSelectionRange(3,6);document.getElementById('search').value='script element';document.getElementById('search').dispatchEvent(new Event('input'));document.querySelector('.payload').click();");
  assert.equal(await evaluate(panel.sessionId,"document.getElementById('scratch').value"),'abc<script>alert(1)</script>def',await evaluate(panel.sessionId,"document.getElementById('status').textContent"));
  assert.equal(await evaluate(panel.sessionId,"document.querySelector('#payload-list script')===null"),true);
  await evaluate(panel.sessionId,"document.getElementById('undo').click()");
  assert.equal(await evaluate(panel.sessionId,"document.getElementById('scratch').value"),'abcXYZdef');
  await evaluate(panel.sessionId,"document.getElementById('transform').value='base64-encode';document.getElementById('apply-transform').click()");
  await until(()=>evaluate(panel.sessionId,"document.getElementById('scratch').value==='abcWFla def'.replace(' ','')"),'selection transform');
  console.log('PASS: Live system appearance, explicit theme, safe payload insertion, selection transforms, and undo');

  await evaluate(panel.sessionId,"document.getElementById('search').value='Jinja config object';document.getElementById('search').dispatchEvent(new Event('input'));document.querySelector('.payload').click();");
  assert((await evaluate(panel.sessionId,"document.getElementById('scratch').value")).includes('{{config}}'));
  await evaluate(panel.sessionId,"document.getElementById('search').value='Original URL override';document.getElementById('search').dispatchEvent(new Event('input'));document.querySelector('.payload').click();document.querySelector('.payload').click();");
  assert.equal(await evaluate(panel.sessionId,"document.getElementById('headers').value"),'X-Original-URL: /admin');
  await evaluate(panel.sessionId,"document.getElementById('search').value='Trailing slash';document.getElementById('search').dispatchEvent(new Event('input'));document.querySelector('.payload').click();");
  assert.equal(await evaluate(panel.sessionId,"document.getElementById('url').value"),base+'/admin/');
  console.log('PASS: SSTI native braces preserved and 403 header/path payloads route to the correct fields');

  await evaluate(panel.sessionId,`(() => {
    const set=(id,value)=>{const field=document.getElementById(id);field.value=value;field.dispatchEvent(new Event('change'));};
    set('url',${JSON.stringify(base+'/ui-send')});set('method','POST');set('mode','fetch');set('body-type','xml');set('body','<probe>✓</probe>');set('headers','X-Probe: ui');document.getElementById('send').click();
  })()`);
  await until(()=>evaluate(panel.sessionId,"document.getElementById('status').textContent==='Response 200 received.'"),'UI send');
  assert.equal((await getRequest('/ui-send')).body,'<probe>✓</probe>');
  assert.equal(await evaluate(panel.sessionId,"document.getElementById('response-pane').hidden"),false);
  assert((await evaluate(panel.sessionId,"document.getElementById('response-body').value")).includes('<!doctype html>'));
  await evaluate(panel.sessionId,"document.getElementById('history-toggle').click()");
  await until(()=>evaluate(panel.sessionId,"document.querySelectorAll('.history-entry').length>0"),'UI history');
  await evaluate(panel.sessionId,"document.getElementById('theme').value='light';document.getElementById('theme').dispatchEvent(new Event('change'));document.getElementById('scratch').value='draft persistence';document.getElementById('scratch').dispatchEvent(new Event('input'));");
  await until(()=>evaluate(panel.sessionId,`chrome.storage.session.get('draft:${tabId}').then(data=>data['draft:${tabId}']?.scratch==='draft persistence')`),'draft saved');
  await call('Page.reload',{},panel.sessionId);
  await until(()=>evaluate(panel.sessionId,"document.documentElement.dataset.ready==='true'"),'restored panel');
  assert.equal(await evaluate(panel.sessionId,"document.getElementById('scratch').value"),'draft persistence');
  assert.equal(await evaluate(panel.sessionId,"document.documentElement.dataset.theme"),'light');
  console.log('PASS: Send-button XML request, inert response rendering, history UI, and persisted theme/draft');

  await call('Page.bringToFront',{},panel.sessionId);
  await evaluate(panel.sessionId,`(() => {
    const set=(id,value)=>{const field=document.getElementById(id);field.value=value;field.dispatchEvent(new Event('change'));};
    set('url',${JSON.stringify(base+'/api/check-in')});set('method','POST');set('mode','fetch');set('body-type','json');
    set('body','{"reservation":"A7K-204","family_name":"Lee","receipt_layout":"standard.ticket"}');
    set('headers','Content-Type: application/json');document.getElementById('send').click();
  })()`);
  await until(()=>evaluate(panel.sessionId,"document.getElementById('response-meta').textContent.includes('202')"),'queued job response');
  assert.equal(await evaluate(panel.sessionId,"document.getElementById('follow-url').value"),'/api/print-jobs/{{response.job_id}}');
  await evaluate(panel.sessionId,"document.getElementById('follow-poll').click()");
  await until(()=>evaluate(panel.sessionId,"!document.getElementById('result-pane').hidden"),'printed receipt result');
  assert.equal(await evaluate(panel.sessionId,"document.getElementById('result-text').textContent"),'ROOM 608\nGUEST Lee');
  assert(printPolls>=2);
  const historyAfterPoll=await rpc('history',{tabId});
  assert.equal(historyAfterPoll[0].url,base+'/api/check-in');
  await evaluate(panel.sessionId,"document.getElementById('open-result').click()");
  const viewerTab=await until(()=>evaluate(panel.sessionId,"chrome.tabs.query({}).then(tabs=>tabs.find(tab=>tab.url?.includes('/viewer.html#result:'))?.id)"),'result viewer');
  assert(Number.isInteger(viewerTab));
  const viewerInfo=await evaluate(panel.sessionId,`chrome.tabs.get(${viewerTab})`);
  const targets=await call('Target.getTargets');
  const viewerTarget=targets.targetInfos.find(info=>info.url===viewerInfo.url);
  assert(viewerTarget);
  const {sessionId:viewerSession}=await call('Target.attachToTarget',{targetId:viewerTarget.targetId,flatten:true});
  await until(()=>evaluate(viewerSession,"document.getElementById('content')?.textContent==='ROOM 608\\nGUEST Lee'"),'viewer result');
  assert.equal(await evaluate(viewerSession,"document.documentElement.dataset.theme"),'light');
  await call('Target.closeTarget',{targetId:viewerTarget.targetId});
  await until(()=>evaluate(panel.sessionId,`chrome.storage.session.get('viewer:${viewerTab}').then(data=>!data['viewer:${viewerTab}'])`),'viewer cleanup');
  console.log('PASS: JSON check-in, async job polling, receipt extraction, and opening the result in a tab');

  await call('Page.bringToFront',{},panel.sessionId);
  await evaluate(panel.sessionId,`(() => {
    const set=(id,value)=>{const field=document.getElementById(id);field.value=value;field.dispatchEvent(new Event('change'));};
    set('url',${JSON.stringify(base+'/redirect')});set('method','GET');set('mode','fetch');set('body-type','text');set('body','');set('headers','');document.getElementById('send').click();
  })()`);
  await until(()=>evaluate(panel.sessionId,"document.getElementById('response-url').textContent.endsWith('/redirected')"),'redirect response');
  assert.equal(await evaluate(panel.sessionId,"document.getElementById('open-destination').hidden"),false);
  const destinationUrl=await evaluate(panel.sessionId,"document.getElementById('response-url').textContent");
  await evaluate(panel.sessionId,"document.getElementById('open-destination').click()");
  const destinationTab=await until(()=>evaluate(panel.sessionId,`chrome.tabs.query({}).then(tabs=>tabs.find(tab=>tab.url===${JSON.stringify(destinationUrl)})?.id)`),'destination tab');
  assert(Number.isInteger(destinationTab));
  await evaluate(panel.sessionId,`chrome.tabs.remove(${destinationTab})`);
  console.log('PASS: HTTP redirect exposes its final URL and opens it in a browser tab');

  if (process.env.HACKTAB_LIVE_ORIGIN) {
    const origin=process.env.HACKTAB_LIVE_ORIGIN.replace(/\/$/,'');
    const lookup=await execute({url:origin+'/api/reservations/lookup',method:'POST',mode:'fetch',bodyType:'json',body:'{"reservation":"A7K-204","family_name":"Lee"}',headersText:'Content-Type: application/json'});
    assert.equal(lookup.status,200);
    const checkin=await execute({url:origin+'/api/check-in',method:'POST',mode:'fetch',bodyType:'json',body:'{"reservation":"A7K-204","family_name":"Lee","receipt_layout":"standard.ticket"}',headersText:'Content-Type: application/json'});
    assert.equal(checkin.status,202);
    const jobId=JSON.parse(checkin.body).job_id;
    assert(jobId);
    let finished;
    for(let attempt=0;attempt<30;attempt++){
      await new Promise(resolve=>setTimeout(resolve,400));
      const result=await rpc('follow-up',{request:{tabId,url:origin+'/api/print-jobs/'+encodeURIComponent(jobId),method:'GET',mode:'fetch',bodyType:'text',body:'',headersText:''}});
      assert.equal(result.status,200);
      const job=JSON.parse(result.body);
      if(job.state==='ready'){finished=job;break;}
      if(job.state==='failed') throw new Error('Live job failed');
    }
    assert(finished?.receipt_text);
    console.log('PASS: Live reservation lookup, check-in job, and receipt polling');
  }

  await call('Page.bringToFront',{},panel.sessionId);
  await evaluate(panel.sessionId,"document.getElementById('search').value='';document.getElementById('search').dispatchEvent(new Event('input'));document.getElementById('scratch').value='Select text, then choose a payload or transformation.';scrollTo(0,0);");
  for(const theme of ['light','dark']){
    await evaluate(panel.sessionId,`document.getElementById('theme').value='${theme}';document.getElementById('theme').dispatchEvent(new Event('change'));`);
    const shot=await call('Page.captureScreenshot',{format:'png'},panel.sessionId);
    fs.writeFileSync(path.join(output,`hacktab-${theme}.png`),Buffer.from(shot.data,'base64'));
  }
  for (const width of [420,600,820,1280]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},panel.sessionId);
    for (const fontScale of [1,1.5]) {
      await evaluate(panel.sessionId,`document.getElementById('fetch-headers').style.fontSize='${13*fontScale}px';document.getElementById('reset-headers').style.fontSize='${13*fontScale}px';document.getElementById('status').hidden=false;document.getElementById('status').textContent='Fetching page headers…';`);
      const layout=await evaluate(panel.sessionId,`(() => {
        const rect=id=>document.getElementById(id).getBoundingClientRect();
        const box=rect('headers'),fetch=rect('fetch-headers'),reset=rect('reset-headers'),status=rect('status'),transform=document.querySelector('.transform-bar').getBoundingClientRect();
        return {clear:fetch.top>=box.bottom+6 && reset.top>=box.bottom+6 && fetch.right<=reset.left && status.left>=reset.right && Math.abs(status.top-reset.top)<12 && transform.top>=status.bottom,overflow:document.documentElement.scrollWidth>innerWidth};
      })()`);
      assert.equal(layout.clear,true,`Header controls overlap at ${width}px, font scale ${fontScale}`);
      assert.equal(layout.overflow,false,`Horizontal overflow at ${width}px`);
    }
  }
  await evaluate(panel.sessionId,"document.getElementById('status').hidden=true");
  await call('Emulation.setDeviceMetricsOverride',{width:600,height:900,deviceScaleFactor:1,mobile:false},panel.sessionId);
  assert.equal(await evaluate(panel.sessionId,'document.documentElement.scrollWidth<=innerWidth'),true);
  const narrow=await call('Page.captureScreenshot',{format:'png'},panel.sessionId);
  fs.writeFileSync(path.join(output,'hacktab-narrow.png'),Buffer.from(narrow.data,'base64'));
  assert.equal(exceptions.length,0,JSON.stringify(exceptions));
  console.log('PASS: Responsive layout without horizontal overflow; light/dark screenshots saved under work/');
}
try{await run();}catch(error){console.error('FAIL:',error.stack); if(exceptions.length) console.error(JSON.stringify(exceptions)); process.exitCode=1;}
finally{await call('Browser.close').catch(()=>child.kill()); server.close();}
