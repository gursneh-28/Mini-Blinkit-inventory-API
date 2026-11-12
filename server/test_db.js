
const { query, pool } = require("./db");

async function testConnection() {
    try {
        const result = await query(`
            SELECT
                NOW() AS current_time,
                current_database() AS database_name
        `);

        console.log("Connected to Neon PostgreSQL successfully!");
        console.log(result.rows[0]);

    } catch (error) {
        console.error("Database connection failed:", error.message);
        process.exitCode = 1;

    } finally {
        await pool.end();
    }
}

testConnection();
