const pool = require('../src/config/database');

afterAll(async () => {
  // Close the database pool after all tests have run
  await pool.end();
});
