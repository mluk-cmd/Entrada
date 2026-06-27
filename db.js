const { Pool } = require('pg');
require('dotenv').config();

// Railway oferă DATABASE_URL automat. Dacă nu e setată (local dev),
// se folosesc variabilele individual din .env
const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
    : new Pool({
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'evenimente_db',
    });

pool.connect((err, client, release) => {
    if (err) {
        console.error('Eroare la conectarea cu baza de date:', err.message);
    } else {
        console.log('Conectat cu succes la PostgreSQL.');
        release();
    }
});

module.exports = pool;