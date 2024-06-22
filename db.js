const mysql = require('mysql2/promise');
require('dotenv').config();

let connection;

const connectToDatabase = async () => {
    if (!connection) {
        try {
            connection = await mysql.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
            });
            console.log('Conexión a la base de datos exitosa');
        } catch (error) {
            console.error('Error al conectar a la base de datos:', error);
            throw error;
        }
    }
    return connection;
};

module.exports = connectToDatabase;
