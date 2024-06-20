const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

let db;

const connectToDatabase = async () => {
    if (!db) {
        try {
            await client.connect();
            db = client.db(process.env.DB_NAME);
            console.log('Conexión a la base de datos exitosa');
        } catch (error) {
            console.error('Error al conectar a la base de datos:', error);
            throw error;
        }
    }
    return db;
};

module.exports = connectToDatabase;
