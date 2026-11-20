import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {normalizeUrl, parseHeaders, parseForm, interpolate, columnList, replaceSelection, validateRequest, editableHeaders, mergeHeaders, resolveFollowUp, readResponseField, nextRedirectRequest} from '../src/core.js';
import {transform, md5} from '../src/transforms.js';
import {PAYLOADS, CATEGORIES, searchPayloads} from '../src/payloads.js';
import {formatBody} from '../src/body-format.js';
import {importRequest} from '../src/request-import.js';

test('URLs normalize without enabling executable or privileged schemes', () => {
  assert.equal(normalizeUrl('example.com/a\n?x=1'), 'https://example.com/a?x=1');
  assert.equal(normalizeUrl('localhost:3000/test'), 'https://localhost:3000/test');
  assert.equal(normalizeUrl('http://127.0.0.1:1234/'), 'http://127.0.0.1:1234/');
  for (const url of ['', 'javascript:alert(1)', 'file:///etc/passwd', 'chrome://extensions', 'https://a:b@example.com']) assert.throws(() => normalizeUrl(url));
});
test('headers preserve values, reject duplicates and browser framing overrides', () => {
  assert.deepEqual(parseHeaders('Cookie: a=b; c=d\r\nReferer: https://example.com/a:b\nX-Empty:'), [{name:'Cookie',value:'a=b; c=d'},{name:'Referer',value:'https://example.com/a:b'},{name:'X-Empty',value:''}]);
  for (const text of ['broken', 'Bad Name: x', 'X: a\nX: b', 'Content-Length: 4', 'Host: other.test', 'X: nul\0']) assert.throws(() => parseHeaders(text));
});
test('form parsing handles empty, repeated, escaped and Unicode values', () => {
  assert.deepEqual(parseForm(''), []);
  assert.deepEqual(parseForm('a=hello+world&a=x%26y&empty=&flag&%E2%9C%93=ok'), [{name:'a',value:'hello world'},{name:'a',value:'x&y'},{name:'empty',value:''},{name:'flag',value:''},{name:'✓',value:'ok'}]);
});
test('templates validate required options and column count bounds', () => {
  assert.equal(columnList(3), '1,2,3'); assert.equal(columnList(2, 'null'), 'NULL,NULL');
  for (const count of [0, -1, 101, 1.2, 'NaN']) assert.throws(() => columnList(count));
  assert.equal(interpolate('{{table}} / {{table}}', {table:'users'}), 'users / users');
  assert.throws(() => interpolate('{{host}}', {}));
  assert.equal(interpolate('{{config}} {{self}} {{this}} {{7*7}}', {}), '{{config}} {{self}} {{this}} {{7*7}}');
  assert.deepEqual(replaceSelection('abcXYZdef', 3, 6, 'ok'), {text:'abcokdef',start:3,end:5});
});
test('request validation catches incompatible mode and body combinations', () => {
  const request = {url:'https://example.com',method:'GET',mode:'navigate',bodyType:'form',tabId:2};
  assert.equal(validateRequest(request).url, 'https://example.com/');
  assert.throws(() => validateRequest({...request,method:'PUT'}));
  assert.throws(() => validateRequest({...request,method:'POST',bodyType:'json',mode:'fetch',body:'{'}));
  assert.throws(() => validateRequest({...request,tabId:-1}));
  assert.equal(validateRequest({...request,method:'PATCH',mode:'fetch',bodyType:'json',body:'{}'}).method, 'PATCH');
});
test('UTF-8 encoders round trip and reject malformed data', async () => {
  for (const text of ['', 'hello world + / &', '✓ 中文 😀', 'a'.repeat(20000)]) {
    for (const [encode, decode] of [['base64-encode','base64-decode'],['base64url-encode','base64-decode'],['hex-encode','hex-decode'],['unicode-escape','unicode-unescape'],['html-encode','html-decode'],['url-encode','url-decode']]) assert.equal(await transform(decode, await transform(encode, text)), text);
  }
  for (const text of ['f', 'gg', '0xff0']) await assert.rejects(transform('hex-decode', text));
  await assert.rejects(transform('base64-decode', '%%%'));
  assert.equal(await transform('html-decode', '&lt;&amp;&#x1f600;'), '<&😀');
});
test('hashes match Node reference vectors including block boundaries', async () => {
  for (const text of ['', 'abc', '✓😀', ...[55,56,63,64,65,127,128,1000].map(size => 'x'.repeat(size))]) {
    assert.equal(md5(text), createHash('md5').update(text).digest('hex'));
    for (const algorithm of ['sha1','sha256','sha512']) assert.equal(await transform(algorithm, text), createHash(algorithm).update(text).digest('hex'));
  }
});
test('JWT decoding is explicitly unverified and parses UTF-8', async () => {
  const jwt = [JSON.stringify({alg:'none'}), JSON.stringify({name:'✓'})].map(text => Buffer.from(text).toString('base64url')).join('.') + '.';
  const result = JSON.parse(await transform('jwt-decode', jwt));
  assert.equal(result.payload.name, '✓'); assert.equal(result.verified, false);
  await assert.rejects(transform('jwt-decode', 'invalid'));
});
test('catalog has unique searchable entries and resolvable templates', () => {
  assert(PAYLOADS.length >= 625);
  assert.deepEqual(CATEGORIES.slice(0,2),['All','Templates']);
  assert.equal(PAYLOADS[0].category,'Templates');
  assert.equal(new Set(PAYLOADS.map(entry => entry.id)).size, PAYLOADS.length);
  const values = {column_count:3,number_columns:'1,2,3',null_columns:'NULL,NULL,NULL',seconds:3,database:'app',table:'users',columns:'id',file:'/etc/passwd',relative_file:'etc/passwd',host:'127.0.0.1',port:4444,selected:'probe',origin:'https://example.com',path:'/admin',value:'probe'};
  for (const entry of PAYLOADS) {
    const resolved = interpolate(entry.template, values);
    assert(!/\{\{(?:column_count|number_columns|null_columns|seconds|database|table|columns|file|relative_file|host|port|selected|origin|path|value)\}\}/.test(resolved));
  }
  assert(searchPayloads('version', 'SQL-PostgreSQL').length > 0);
  assert.equal(searchPayloads('', 'SQL').length, 0);
  assert.equal(searchPayloads('UNION', 'XXE').length, 0);
  for (const category of ['SQL-MySQL','SQL-PostgreSQL','SQL-MSSQL','SQL-Oracle','SQL-SQLite','SQL-DB2','SQL-BigQuery','NoSQL-MongoDB','CORS','CMD','CRLF','CSS','CSV','Encoding','GraphQL','HPP','LDAP','SAML','Upload','WebSocket','XPath']) {
    assert(searchPayloads('',category).length>=4,category);
  }
  for (const category of ['SSTI','SSRF','403-bypass']) assert(searchPayloads('',category).length>=30);
  for (const entry of PAYLOADS.filter(entry=>entry.target==='headers')) parseHeaders(interpolate(entry.template,values));
});
test('Unicode transforms distinguish visual confusables from compatibility normalization', async () => {
  assert.equal(await transform('latin-o-greek','logo'),'lοgο');
  assert.equal(await transform('latin-o-cyrillic','logo'),'lоgо');
  assert.equal(await transform('latin-o-fullwidth','logo'),'lｏgｏ');
  assert.equal(await transform('unicode-nfkc','lｏgｏ'),'logo');
  assert.equal(await transform('unicode-nfkc','lοgο'),'lοgο');
  assert.equal(await transform('latin-cyrillic-lookalikes','aceop'),'асеор');
});
test('captured headers become editable without browser framing or duplicates', () => {
  const text = editableHeaders([{name:'Host',value:'example.com'},{name:':method',value:'GET'},{name:'Sec-Fetch-Site',value:'none'},{name:'User-Agent',value:'Chrome'},{name:'Cookie',value:'session=test'},{name:'X-Test',value:'one'},{name:'x-test',value:'two'}]);
  assert.deepEqual(parseHeaders(text),[{name:'User-Agent',value:'Chrome'},{name:'Cookie',value:'session=test'},{name:'x-test',value:'two'}]);
  assert.equal(mergeHeaders('X-Test: one\nCookie: session=test','x-test: two'), 'x-test: two\nCookie: session=test');
});
test('follow-up URLs resolve JSON fields within the response origin', () => {
  const response={url:'https://example.com/api/check-in',body:JSON.stringify({job_id:'a/b',status_url:'/api/jobs/a%2Fb',nested:{token:'x y'}})};
  assert.equal(resolveFollowUp('/api/jobs/{{response.job_id}}',response),'https://example.com/api/jobs/a%2Fb');
  assert.equal(resolveFollowUp('{{response.status_url}}',response),'https://example.com/api/jobs/a%2Fb');
  assert.equal(resolveFollowUp('/api/jobs?token={{response.nested.token}}',response),'https://example.com/api/jobs?token=x%20y');
  assert.throws(()=>resolveFollowUp('https://other.example/api/jobs/{{response.job_id}}',response));
  assert.throws(()=>resolveFollowUp('/api/jobs/{{response.missing}}',response));
  assert.equal(readResponseField('{"state":"ready","result":{"receipt_text":"hello"}}','result.receipt_text'),'hello');
  assert.throws(()=>readResponseField('{}','receipt_text'));
});
test('redirect hops preserve method semantics and avoid cross-origin credential forwarding', () => {
  const request={url:'https://example.com/post',method:'POST',body:'{"x":1}',bodyType:'json',headersText:'Content-Type: application/json\nAuthorization: Bearer secret\nCookie: sid=abc\nX-Probe: yes',pauseRedirects:true};
  const hop=(status,location)=>({manualRedirect:true,status,location});
  const moved=nextRedirectRequest(request,hop(302,'/result'));
  assert.equal(moved.method,'GET'); assert.equal(moved.body,''); assert.equal(moved.url,'https://example.com/result');
  assert(!/content-type/i.test(moved.headersText));
  const preserved=nextRedirectRequest(request,hop(307,'/result'));
  assert.equal(preserved.method,'POST'); assert.equal(preserved.body,request.body);
  const external=nextRedirectRequest(request,hop(302,'https://other.example/result'));
  assert(!/authorization|cookie/i.test(external.headersText));
  assert.match(external.headersText,/X-Probe: yes/);
  assert.equal(nextRedirectRequest({...request,method:'PUT'},hop(303,'/result')).method,'GET');
  assert.throws(()=>nextRedirectRequest(request,hop(302,'javascript:alert(1)')));
  assert.throws(()=>nextRedirectRequest(request,hop(302,'https://user:pass@example.com/result')));
});
test('body formatter converts DevTools object notation and line-based form data', () => {
  const formatted=formatBody('json',`{reservation: "A7K-204", family_name: 'Lee', receipt_layout: "large.ticket",}`);
  assert.deepEqual(JSON.parse(formatted),{reservation:'A7K-204',family_name:'Lee',receipt_layout:'large.ticket'});
  assert.equal(formatBody('form','name: Lee\nname: Morgan\nnote: hello world'),'name=Lee&name=Morgan&note=hello+world');
  assert.equal(formatBody('form','family_name: Lee'),'family_name=Lee');
  assert.equal(formatBody('form','name=hello+world&name=x%26y'),'name=hello+world&name=x%26y');
  assert.throws(()=>formatBody('json','{a: process.exit(1)}'));
  assert.throws(()=>formatBody('json','{a: NaN}'));
});
test('loads Chrome cURL, PowerShell, and Fetch copies without executing them', () => {
  const curl = String.raw`curl --url 'http\://example\.com/api/check-in' \
  -H 'Accept: \*/\*' -H 'Connection: keep-alive' -H 'Content-Type: application/json' \
  --data-raw '{"reservation":"A7K-204"}' --insecure`;
  const curlResult = importRequest(curl);
  assert.equal(curlResult.request.url, 'http://example.com/api/check-in');
  assert.equal(curlResult.request.method, 'POST');
  assert.equal(curlResult.request.bodyType, 'json');
  assert.equal(curlResult.request.body, '{"reservation":"A7K-204"}');
  assert.equal(curlResult.request.credentials, 'omit');
  assert.match(curlResult.request.headersText, /Accept: \*\/\*/);
  assert(!/Connection:/.test(curlResult.request.headersText));
  assert(curlResult.warnings.some(warning => warning.includes('--insecure')));

  const powershell = [
    '$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession',
    '$session.UserAgent = "Test/1.0"',
    'Invoke-WebRequest -Uri "http\\://example\\.com/api/check-in" `',
    '-Method "POST" -WebSession $session `',
    '-Headers @{"Accept"="*/*" "Origin"="http://example.com"} `',
    '-ContentType "application/json" `',
    '-Body "{`"reservation`":`"A7K-204`"}"'
  ].join('\n');
  const psResult = importRequest(powershell);
  assert.equal(psResult.request.method, 'POST');
  assert.equal(psResult.request.url, 'http://example.com/api/check-in');
  assert.equal(psResult.request.body, '{"reservation":"A7K-204"}');
  assert.match(psResult.request.headersText, /User-Agent: Test\/1\.0/);
  assert.match(psResult.request.headersText, /Content-Type: application\/json/);

  const fetchSource = `fetch("http://example.com/api/check-in", ${JSON.stringify({headers:{accept:'*/*','content-type':'application/json'},referrer:'http://example.com/reservations',body:'{"reservation":"A7K-204"}',method:'POST',mode:'cors',credentials:'omit'})});`;
  const fetchResult = importRequest(fetchSource);
  assert.equal(fetchResult.request.body, '{"reservation":"A7K-204"}');
  assert.equal(fetchResult.request.credentials, 'omit');
  assert.match(fetchResult.request.headersText, /Referer: http:\/\/example\.com\/reservations/);
  assert.throws(() => importRequest('fetch(getUrl(), {method:"POST"})'));
  assert.throws(() => importRequest("curl https://example.com --data-binary @body.json"));
});
