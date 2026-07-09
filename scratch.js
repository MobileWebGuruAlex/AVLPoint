const Database = require('better-sqlite3');
const db = new Database('avlpoint.db', { readonly: true });
console.log(db.prepare('PRAGMA table_info(system_logs)').all());
