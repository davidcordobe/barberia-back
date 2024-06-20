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

// Configurar MercadoPago
mercadopago.configure({
    access_token: process.env.MERCADOPAGO_ACCESS_TOKEN
});

// Configurar nodemailer
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Endpoint para reservar turno
app.post('/turnos/reservar', async (req, res) => {
    const { fechaHora, nombreCliente, tipoServicio, montoSeña, emailCliente } = req.body;

    try {
        const db = await connectToDatabase();
        const turnosCollection = db.collection('turnos');

        // Verificar si el turno ya está reservado
        const turnoExistente = await turnosCollection.findOne({ fechaHora });
        if (turnoExistente) {
            return res.status(400).json({ message: 'El turno para esta fecha y hora ya está reservado' });
        }

        // Convertir montoSeña a número
        const montoSeñaNumero = Number(montoSeña);
        if (isNaN(montoSeñaNumero)) {
            throw new Error('El monto de la seña debe ser un número válido');
        }

        // Crear preferencia de pago en MercadoPago
        const preference = {
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

        // Crear la preferencia en MercadoPago
        const response = await mercadopago.preferences.create(preference);

        // Enviar respuesta con el init_point de MercadoPago
        res.status(200).json({
            message: 'Inicie el pago de la seña para confirmar la reserva',
            init_point: response.body.init_point
        });
    } catch (error) {
        console.error('Error al reservar el turno:', error);
        res.status(500).json({ message: 'Error interno al procesar la solicitud' });
    }
});

// Endpoint para confirmar el turno después del pago
app.get('/turnos/confirmar', async (req, res) => {
    const { payment_id, status, external_reference, nombreCliente, tipoServicio, emailCliente } = req.query;

    if (status !== 'approved') {
        return res.status(400).json({ message: 'El pago no fue aprobado' });
    }

    try {
        const db = await connectToDatabase();
        const turnosCollection = db.collection('turnos');

        // Insertar nuevo turno reservado
        await turnosCollection.insertOne({
            fechaHora: external_reference,
            nombreCliente,
            tipoServicio
        });

        // Formatear fecha y enviar correo electrónico de confirmación
        const fechaFormateada = moment(external_reference).format('DD-MM-YYYY HH:mm');
        await enviarCorreoElectronico(nombreCliente, fechaFormateada, tipoServicio, emailCliente);

        res.status(201).json({ message: 'Turno reservado exitosamente' });
    } catch (error) {
        console.error('Error al confirmar el turno:', error);
        res.status(500).json({ message: 'Error interno al procesar la solicitud' });
    }
});

// Endpoint para obtener los horarios disponibles
app.get('/turnos/horarios-disponibles', async (req, res) => {
    const { fecha } = req.query;

    if (!fecha) {
        return res.status(400).json({ message: 'Se requiere la fecha para obtener los horarios disponibles' });
    }

    try {
        const db = await connectToDatabase();
        const turnosCollection = db.collection('turnos');

        console.log("Fecha recibida en el backend:", fecha); // Debug
        // Obtener el día de la semana para la fecha especificada
        const diaSemana = moment(fecha).format('dddd');
        console.log("Día de la semana calculado:", diaSemana); // Debug

        // Verificar si es domingo y retornar un error si es así
        if (diaSemana.toLowerCase() === 'domingo') {
            return res.status(400).json({ message: 'No se permiten reservas los días domingos' });
        }

        // Obtener los horarios disponibles para el día de la semana
        const horariosDia = obtenerHorariosDisponibles(diaSemana);
        console.log("Horarios disponibles para el día:", horariosDia); // Debug

        // Obtener los turnos reservados para la fecha especificada
        const turnosReservados = await turnosCollection.find({ fechaHora: { $regex: `^${fecha}` } }).toArray();
        console.log("Turnos reservados para la fecha:", turnosReservados); // Debug

        const horasReservadas = turnosReservados.map(turno => new Date(turno.fechaHora).getHours());
        console.log("Horas reservadas:", horasReservadas); // Debug

        // Filtrar los horarios disponibles basados en los turnos reservados
        const horariosDisponiblesFiltrados = horariosDia.filter(hora => {
            const hour = Number(hora.split(':')[0]);
            return !horasReservadas.includes(hour);
        });

        console.log("Horarios disponibles filtrados:", horariosDisponiblesFiltrados); // Debug
        res.status(200).json(horariosDisponiblesFiltrados);
    } catch (error) {
        console.error('Error al obtener los horarios disponibles:', error);
        res.status(500).json({ message: 'Error interno al procesar la solicitud' });
    }
});

// Función para obtener los horarios disponibles según el día de la semana
const obtenerHorariosDisponibles = (diaSemana) => {
    const horariosDisponibles = {
        "Lunes": ["08:00", "09:00", "10:00", "11:00"],
        "Martes": ["08:00", "09:00", "10:00", "11:00"],
        "Miércoles": ["08:00", "09:00", "10:00", "11:00"],
        "Jueves": ["08:00", "09:00", "10:00", "11:00"],
        "Viernes": ["08:00", "09:00", "10:00", "11:00"],
        "Sábado": ["08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"],
        // Puedes añadir más días y horarios según tu disponibilidad
    };

    return horariosDisponibles[diaSemana] || [];
};

// Función para borrar turnos antiguos
const borrarTurnosAntiguos = async () => {
    try {
        const db = await connectToDatabase();
        const turnosCollection = db.collection('turnos');

        // Borrar turnos antiguos (mayores a 24 horas)
        const resultado = await turnosCollection.deleteMany({ fechaHora: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
        console.log(`Se han borrado ${resultado.deletedCount} turnos antiguos`);
    } catch (error) {
        console.error('Error al borrar turnos antiguos:', error);
    }
};

// Ejecutar la función para borrar turnos antiguos cada hora
setInterval(borrarTurnosAntiguos, 60 * 60 * 1000); // Cada 60 minutos * 60 segundos * 1000 milisegundos

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
