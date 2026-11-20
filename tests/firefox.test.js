import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const work = path.join(root, 'work');
const target = path.resolve(work, 'firefox-smoke-extension');
if (!target.startsWith(path.resolve(work) + path.sep)) throw new Error('Smoke package must stay inside work.');
const playwrightRoot=path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
const playwrightBins=fs.existsSync(playwrightRoot) ? fs.readdirSync(playwrightRoot).filter(name=>name.startsWith('firefox-')).sort().reverse().map(name=>path.join(playwrightRoot,name,'firefox','firefox.exe')) : [];
const firefox=[process.env.FIREFOX_PATH,path.join(process.env.PROGRAMFILES || '', 'Mozilla Firefox','firefox.exe'),...playwrightBins].find(file=>file&&fs.existsSync(file));
if (!firefox) throw new Error('Set FIREFOX_PATH to a Firefox executable.');
const built = spawnSync(process.execPath, [path.join(root,'scripts/build-firefox.js')], {cwd:root,encoding:'utf8'});
assert.equal(built.status,0,built.stderr || built.stdout);
fs.rmSync(target,{recursive:true,force:true});
fs.cpSync(path.join(root,'dist/firefox-unpacked'),target,{recursive:true});
const requests=[];
let finish;
const report = new Promise(resolve => finish=resolve);
const server=http.createServer((req,res)=>{
  let body='';req.on('data',chunk=>body+=chunk);
  req.on('end',()=>{
    requests.push({url:req.url,method:req.method,headers:req.headers,body});
    if(req.url==='/report') {try{finish(JSON.parse(body));}catch(error){finish({error:error.message});}res.end('ok');return;}
    if(req.url==='/redirect') {res.writeHead(302,{Location:'/final','Set-Cookie':'firefox_hop=1; Path=/'});res.end();return;}
    res.setHeader('Content-Type',req.url==='/get'?'application/json':'text/html');
    res.end(req.url==='/get'?JSON.stringify({ok:true}):'<!doctype html><title>Firefox smoke</title><body>ok</body>');
  });
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const backgroundProbe=`
setTimeout(async()=>{
  try {
    const tab=await browser.tabs.create({url:${JSON.stringify(base+'/start')},active:false});
    await browser.storage.session.set({smokeTabId:tab.id});
    await browser.tabs.create({url:browser.runtime.getURL('panel.html'),active:true});
  } catch(error) {
    fetch(${JSON.stringify(base+'/report')},{method:'POST',body:JSON.stringify({error:'background: '+error.message})});
  }
},500);
`;
const panelProbe=`
setTimeout(async()=>{
  const smokeBase=${JSON.stringify(base)};
  let result;
  try {
    const tabId=(await browser.storage.session.get('smokeTabId')).smokeTabId;
    if(!Number.isInteger(tabId)) throw new Error('No inspected tab');
    document.getElementById('url').value=smokeBase+'/post';
    document.getElementById('method').value='POST';
    document.getElementById('mode').value='fetch';
    document.getElementById('body-type').value='json';
    document.getElementById('body').value='broken JSON';
    document.getElementById('send').click();
    await new Promise(resolve=>setTimeout(resolve,0));
    const bodyBox=document.getElementById('body').getBoundingClientRect();
    const errorBox=document.getElementById('body-error').getBoundingClientRect();
    const bodyErrorBelow=!document.getElementById('body-error').hidden && errorBox.top>=bodyBox.bottom && document.getElementById('status').hidden;
    document.getElementById('body').dispatchEvent(new Event('input'));
    const bodyErrorCleared=document.getElementById('body-error').hidden;
    document.getElementById('method').dispatchEvent(new Event('change'));
    document.getElementById('body-type').dispatchEvent(new Event('change'));
    document.getElementById('body').value='{reservation: "A7K-204", family_name: "Lee"}';
    document.getElementById('format-body').click();
    const formattedBody=JSON.parse(document.getElementById('body').value);
    document.getElementById('load-request').click();
    document.getElementById('import-input').value="curl --url '"+smokeBase+"/post' -H 'Content-Type: application/json' --data-raw '"+JSON.stringify({a:1})+"'";
    document.getElementById('import-apply').click();
    const importedRequest=document.getElementById('url').value===smokeBase+'/post' && document.getElementById('method').value==='POST' && document.getElementById('credentials').value==='omit' && !document.getElementById('import-dialog').open;
    const send=(action,request)=>browser.runtime.sendMessage({action,tabId,request});
    const pageHeaders=await browser.runtime.sendMessage({action:'fetch-headers',tabId});
    const get=await send('execute',{tabId,url:smokeBase+'/get',method:'GET',mode:'fetch',bodyType:'text',body:'',headersText:''});
    const post=await send('execute',{tabId,url:smokeBase+'/post',method:'POST',mode:'fetch',bodyType:'json',body:'{"a":1}',headersText:'Content-Type: application/json\\nX-Hack-DevTools-Test: firefox\\nUser-Agent: Hack-DevTools-Firefox-Test/1.0\\nCookie: hack-devtools_firefox=ok'});
    const manual=await send('execute',{tabId,url:smokeBase+'/redirect',method:'GET',mode:'fetch',bodyType:'text',body:'',headersText:'',pauseRedirects:true});
    const redirect=await send('execute',{tabId,url:smokeBase+'/redirect',method:'GET',mode:'fetch',bodyType:'text',body:'',headersText:''});
    const nav=await send('execute',{tabId,url:smokeBase+'/nav',method:'GET',mode:'navigate',bodyType:'text',body:'',headersText:''});
    result={pageHeaders,get,post,manual,redirect,nav,manualDisabled:document.getElementById('pause-redirects').disabled,bodyErrorBelow,bodyErrorCleared,formattedBody,importedRequest};
  } catch(error) {result={error:'panel: '+error.message};}
  await fetch(smokeBase+'/report',{method:'POST',body:JSON.stringify(result)});
},1200);
`;
fs.appendFileSync(path.join(target,'src/background.js'),backgroundProbe);
fs.appendFileSync(path.join(target,'src/panel.js'),panelProbe);
const webExt=spawn(process.execPath,[path.join(root,'node_modules/web-ext/bin/web-ext.js'),'run','--source-dir',target,'--firefox-binary',firefox,'--no-reload','--no-input'],{cwd:root,env:{...process.env,MOZ_HEADLESS:'1'},windowsHide:true,stdio:['ignore','pipe','pipe']});
let log='';for(const stream of [webExt.stdout,webExt.stderr]) stream.on('data',data=>log+=data.toString());
let watchdog;
try{
  const outcome=await Promise.race([report,new Promise((_,reject)=>watchdog=setTimeout(()=>reject(new Error('Firefox smoke timeout. '+log.slice(-1200))),30000))]);
  assert(!outcome.error,outcome.error);
  for(const key of ['pageHeaders','get','post','redirect','nav']) assert.equal(outcome[key].ok,true,`${key}: ${outcome[key].error}`);
  assert.equal(outcome.manual.ok,false);
  assert.match(outcome.manual.error,/Firefox cannot inspect intermediate redirects/);
  assert.equal(outcome.manualDisabled,true);
  assert.equal(outcome.bodyErrorBelow,true);
  assert.equal(outcome.bodyErrorCleared,true);
  assert.deepEqual(outcome.formattedBody,{reservation:'A7K-204',family_name:'Lee'});
  assert.equal(outcome.importedRequest,true);
  assert.equal(outcome.get.result.status,200);
  assert.equal(outcome.post.result.status,200);
  assert.equal(outcome.redirect.result.status,200);
  assert.equal(outcome.redirect.result.url,base+'/final');
  assert(requests.some(request=>request.url==='/post'&&request.method==='POST'&&request.body==='{"a":1}'&&request.headers['x-hack-devtools-test']==='firefox'));
  const postRequest=requests.find(request=>request.url==='/post');
  assert.equal(postRequest.headers['user-agent'],'Hack-DevTools-Firefox-Test/1.0');
  assert.equal(postRequest.headers.cookie,'hack-devtools_firefox=ok');
  assert(requests.some(request=>request.url==='/nav'&&request.method==='GET'));
  console.log('PASS: Firefox loaded Hack-DevTools, captured page headers, sent GET/POST with custom headers, followed 302, and navigated a tab.');
}finally{
  clearTimeout(watchdog);
  if (process.platform === 'win32') spawnSync('taskkill.exe',['/PID',String(webExt.pid),'/T','/F'],{stdio:'ignore'});
  else webExt.kill('SIGTERM');
  server.close();
}
