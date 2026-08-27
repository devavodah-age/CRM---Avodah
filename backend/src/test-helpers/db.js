const { Pool } = require('pg');

const testPool = new Pool({
  connectionString: process.env.TEST_DATABASE_URL || process.env.DATABASE_URL,
});

async function cleanDb() {
  await testPool.query('DELETE FROM messages');
  await testPool.query('DELETE FROM leads');
  await testPool.query('DELETE FROM companies');
  await testPool.query('DELETE FROM users');
}

module.exports = { testPool, cleanDb };
