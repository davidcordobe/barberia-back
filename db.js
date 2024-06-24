const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD);
console.log('DB_NAME:', process.env.DB_NAME);


const connectToDatabase = async () => {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        console.log('Conexión a la base de datos exitosa');
        return connection;
    } catch (error) {
        console.error('Error al conectar a la base de datos:', error);
        throw error;
    }
};

connectToDatabase();



module.exports = connectToDatabase;
