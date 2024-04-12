const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const nodemailer = require('nodemailer'); // Importa la biblioteca de Nodemailer
const moment = require('moment-timezone'); // Importa moment-timezone
require('dotenv').config();

// Configura la zona horaria para Argentina
moment.tz.setDefault('America/Argentina/Buenos_Aires');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('Conexión a MongoDB establecida'))
    .catch((err) => console.error('Error al conectar a MongoDB:', err));

// Configura el transporte de correo con Nodemailer
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const turnoSchema = new mongoose.Schema({
    fechaHora: { type: Date, required: true },
    estado: { type: String, enum: ['disponible', 'reservado', 'cancelado'], default: 'disponible' },
    cliente: { type: String, default: null },
});

const Turno = mongoose.model('Turno', turnoSchema);

// Función para enviar correo electrónico al cliente con la fecha y hora del turno
const enviarCorreoElectronico = async (fechaFormateada) => {
    try {
        const mensaje = `Tu turno ha sido reservado para el ${fechaFormateada}.`;
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_CONTACTO,
            subject: 'Turno reservado exitosamente',
            text: mensaje,
        });
        console.log('Correo electrónico enviado correctamente');
    } catch (err) {
        console.error('Error al enviar correo electrónico:', err);
    }
};

// Función para eliminar turnos pasados de la fecha actual
const eliminarTurnosPasados = async () => {
    const fechaActual = new Date();
    try {
        await Turno.deleteMany({ fechaHora: { $lt: fechaActual } });
        console.log('Turnos pasados eliminados correctamente');
    } catch (err) {
        console.error('Error al eliminar turnos pasados:', err);
    }
};

// Función para obtener horarios disponibles para nuevos turnos
const obtenerHorariosDisponibles = async () => {
    const turnos = await Turno.find();
    const horariosReservados = turnos.map(turno => turno.fechaHora.getHours() + ':' + turno.fechaHora.getMinutes());
    const horariosDisponibles = [];

    for (let hora = 8; hora <= 20; hora++) {
        for (let minuto of ['00', '30']) {
            const horario = hora + ':' + minuto;
            if (!horariosReservados.includes(horario)) {
                horariosDisponibles.push(horario);
            }
        }
    }

    return horariosDisponibles;
};

// Configurar el cron job para ejecutar la función cada día a la medianoche
cron.schedule('*/30 * * * *', eliminarTurnosPasados);

app.get('/turnos', async (req, res) => {
    try {
        const turnos = await Turno.find();
        res.json(turnos);
    } catch (err) {
        res.status(500).json({ message: 'Error al obtener los turnos' });
    }
});

app.get('/horarios-disponibles', async (req, res) => {
    try {
        const horarios = await obtenerHorariosDisponibles();
        res.json(horarios);
    } catch (err) {
        res.status(500).json({ message: 'Error al obtener los horarios disponibles' });
    }
});

app.post('/turnos/reservar', async (req, res) => {
    const { fechaHora } = req.body;

    try {
        const turnoExistente = await Turno.findOne({ fechaHora });

        if (turnoExistente) {
            return res.status(400).json({ message: 'El turno para esta fecha y hora ya está reservado' });
        }

        const nuevoTurno = new Turno({ fechaHora });
        await nuevoTurno.save();

        // Formatear la fecha y hora en la zona horaria deseada (Argentina)
        const fechaFormateada = moment(fechaHora).format('DD-MM-YYYY HH:mm');

        // Enviar correo electrónico al cliente con la fecha y hora del turno
        await enviarCorreoElectronico(fechaFormateada); // Pasar la fecha formateada a la función

        // Después de guardar el nuevo turno y enviar el correo electrónico, obtener los horarios disponibles actualizados
        const horariosDisponiblesActualizados = await obtenerHorariosDisponibles();
        res.status(201).json({ message: 'Turno reservado exitosamente', horariosDisponibles: horariosDisponiblesActualizados });
    } catch (err) {
        console.error('Error al reservar el turno:', err); // Registrar el error en los registros del servidor
        res.status(500).json({ message: 'Error interno al procesar la solicitud' }); // Devolver una respuesta descriptiva al cliente
    }
});


app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});
