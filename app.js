const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const connectToDatabase = require('./db');
const moment = require('moment');
const mercadopago = require('mercadopago');
const PORT = process.env.PORT || 5000;
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

mercadopago.configure({
    access_token: process.env.MERCADOPAGO_ACCESS_TOKEN
});

// Configuración del transporter de nodemailer
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const enviarCorreoElectronico = async (cliente, fechaFormateada, tipoServicio, emailCliente) => {
    try {
        const mensaje = `El cliente ${cliente}, reservó el turno para el día ${fechaFormateada} y para el servicio ${tipoServicio}.`;
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: [process.env.EMAIL_CONTACTO, emailCliente],
            subject: 'Turno reservado exitosamente',
            text: mensaje,
        });
        console.log('Correo electrónico enviado correctamente');
    } catch (err) {
        console.error('Error al enviar correo electrónico:', err);
    }
};

app.post('/turnos/reservar', async (req, res) => {
    const { fechaHora, nombreCliente, tipoServicio, montoSeña, emailCliente } = req.body;

    try {
        const db = await connectToDatabase();
        const turnosCollection = db.collection('turnos');

        // Verificar si el turno ya existe
        const turnoExistente = await turnosCollection.findOne({ fechaHora });
        if (turnoExistente) {
            return res.status(400).json({ message: 'El turno para esta fecha y hora ya está reservado' });
        }

        // Convertir montoSeña a número y verificar
        const montoSeñaNumero = Number(montoSeña);
        if (isNaN(montoSeñaNumero)) {
            throw new Error('montoSeña debe ser un número');
        }

        // Crear preferencia de pago en Mercado Pago
        let preference = {
            items: [{
                title: `Reserva de turno: ${tipoServicio}`,
                quantity: 1,
                currency_id: 'ARS',
                unit_price: montoSeñaNumero,
            }],
            payer: {
                name: nombreCliente,
            },
            back_urls: {
                success: `${process.env.BACKEND_URL}/turnos/confirmar`,
                failure: `${process.env.BACKEND_URL}/turnos/error`,
                pending: `${process.env.BACKEND_URL}/turnos/pendiente`
            },
            auto_return: 'approved',
            external_reference: fechaHora // Usamos fechaHora como referencia externa
        };

        console.log('Preferencia creada:', preference);

        const response = await mercadopago.preferences.create(preference);

        res.status(200).json({
            message: 'Inicie el pago de la seña para confirmar la reserva',
            init_point: response.body.init_point
        });
    } catch (err) {
        console.error('Error al reservar el turno:', err);
        res.status(500).json({ message: 'Error interno al procesar la solicitud' });
    }
});

// Endpoint para confirmar el turno después del pago
app.get('/turnos/confirmar', async (req, res) => {
    const { payment_id, status, external_reference, nombreCliente, tipoServicio, emailCliente } = req.query;

    console.log('Received parameters:', { payment_id, status, external_reference, nombreCliente, tipoServicio, emailCliente });

    if (status !== 'approved') {
        return res.status(400).json({ message: 'El pago no fue aprobado' });
    }

    try {
        const db = await connectToDatabase();
        const turnosCollection = db.collection('turnos');

        // Insertar nuevo turno
        await turnosCollection.insertOne({
            fechaHora: external_reference,
            nombreCliente,
            tipoServicio
        });

        const fechaFormateada = moment(external_reference).format('DD-MM-YYYY HH:mm');
        await enviarCorreoElectronico(nombreCliente, fechaFormateada, tipoServicio, emailCliente);

        res.status(201).json({ message: 'Turno reservado exitosamente' });
    } catch (err) {
        console.error('Error al confirmar el turno:', err);
        res.status(500).json({ message: 'Error interno al procesar la solicitud' });
    }
});

app.get('/turnos/horarios-disponibles', async (req, res) => {
    const { fecha } = req.query;

    if (!fecha) {
        return res.status(400).json({ message: 'Fecha es requerida' });
    }

    try {
        const db = await connectToDatabase();
        const turnosCollection = db.collection('turnos');

        const turnos = await turnosCollection.find({ fechaHora: { $regex: `^${fecha}` } }).toArray();
        const horasReservadas = turnos.map(turno => new Date(turno.fechaHora).getHours());

        // Obtener día de la semana y horarios disponibles
        const diaSemana = moment(fecha).format('dddd');
        const horariosDisponibles = obtenerHorariosDisponibles(diaSemana);

        // Filtrar horarios disponibles según los ya reservados
        const horariosDisponiblesFiltrados = horariosDisponibles.filter(hora => {
            const hour = Number(hora.split(':')[0]);
            return !horasReservadas.includes(hour);
        });

        res.status(200).json(horariosDisponiblesFiltrados);
    } catch (err) {
        console.error('Error al obtener horarios disponibles:', err);
        res.status(500).json({ message: 'Error interno al procesar la solicitud' });
    }
});

// Función para obtener los horarios disponibles para un día de la semana
const obtenerHorariosDisponibles = (diaSemana) => {
    const horariosDisponibles = {
        "Lunes": ["09:00", "11:30", "13:30", "17:30"],
        "Martes": ["09:00", "11:30", "15:00", "18:00"],
        "Miércoles": ["09:00", "11:30", "13:30", "17:30"],
        "Jueves": ["09:00", "11:30", "15:00", "18:00"],
        "Viernes": ["09:00", "11:30", "13:00", "15:00", "18:00"],
        "Sábado": ["10:00", "12:30", "15:00"],
        // Agrega más días y horarios según tu disponibilidad
    };

    // Obtener horarios para el día de la semana dado
    const horariosDia = horariosDisponibles[diaSemana] || [];

    return horariosDia;
};

// Función para borrar turnos antiguos
const borrarTurnosAntiguos = async () => {
    try {
        const db = await connectToDatabase();
        const turnosCollection = db.collection('turnos');

        const result = await turnosCollection.deleteMany({
            fechaHora: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        });
        console.log(`Turnos borrados: ${result.deletedCount}`);
    } catch (err) {
        console.error('Error al borrar turnos antiguos:', err);
    }
};

// Ejecutar la función de borrar turnos cada hora
setInterval(borrarTurnosAntiguos, 60 * 60 * 1000); // 60 minutos * 60 segundos * 1000 milisegundos

app.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});