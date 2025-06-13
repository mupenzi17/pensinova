const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();


const pool = new Pool({
     connectionString: process.env.DATABASE_URL || 'postgres://postgres:12345678@localhost:5432/pensinova_db',
    
});

module.exports = pool;
// This code sets up a connection pool to a PostgreSQL database using the 'pg' library.

