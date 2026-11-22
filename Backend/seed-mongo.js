// Injects the demo data into MongoDB Atlas. Destructive: drops the FoundIT collections first.
// Usage: npm run seed:mongo
require('dotenv').config();
const { connect, close, getDb, seedDatabase } = require('./db');

(async () => {
  await connect();
  const db = getDb();
  await seedDatabase(db, { reset: true });

  const counts = {};
  for (const name of ['students', 'users', 'posts', 'conversations', 'messages', 'counters']) {
    counts[name] = await db.collection(name).countDocuments();
  }
  console.log('Seeded database "' + db.databaseName + '":');
  for (const [name, n] of Object.entries(counts)) console.log('  ' + name.padEnd(14) + n);
  console.log('\nDemo logins: maria.santos24@bicol-u.edu.ph / Password123, admin@bicol-u.edu.ph / Password123');
  await close();
})().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await close().catch(() => {});
  process.exitCode = 1;
});
