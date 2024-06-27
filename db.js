const { MongoClient } = require('mongodb');
require('dotenv').config();

console.log('DB_URI:', process.env.DB_URI);

const connectToDatabase = async () => {
    try {
        const client = new MongoClient(process.env.DB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        await client.connect();
        console.log('Conexión a la base de datos exitosa');
        return client;
    } catch (error) {
        console.error('Error al conectar a la base de datos:', error);
        throw error;
    }
};

connectToDatabase();

module.exports = connectToDatabase;
