/* npm run db:migrate — สร้างตารางทั้งหมดจาก db/schema.sql (รันซ้ำได้) */
'use strict';

require('./env');
const fs = require('fs');
const path = require('path');
const db = require('../server/db');

async function migrate() {
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
}

if (require.main === module) {
  migrate().then(() => { console.log('migrate: schema พร้อมใช้งาน'); process.exit(0); })
    .catch((e) => { console.error('migrate ล้มเหลว:', e.message); process.exit(1); });
}

module.exports = { migrate };
