import pool from '../config/db.js';

/**
 * Obtiene y lista todos los usuarios de la base de datos.
 * 
 * @async
 * @function listarUsuarios
 * @param {import('express').Request} req - Objeto de petición Express.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 * @returns {Promise<void>}
 */
export const listarUsuarios = async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM usuarios');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

/**
 * Obtiene un usuario específico por su ID.
 * 
 * @async
 * @function obtenerUsuario
 * @param {import('express').Request} req - Objeto de petición Express con req.params.id.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 * @returns {Promise<void>}
 */
export const obtenerUsuario = async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query(
            'SELECT * FROM usuarios WHERE id = ?',
            [id] 
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json(rows[0]);
    } catch (error) {
        res.status(500).json({ error: error.message });
    };
}

/**
 * Registra un nuevo usuario en la base de datos.
 * 
 * @async
 * @function crearUsuario
 * @param {import('express').Request} req - Objeto de petición Express con req.body conteniendo nombre, email y password.
 * @param {import('express').Response} res - Objeto de respuesta Express.
 * @returns {Promise<void>}
 */
export const crearUsuario = async (req, res) => {
    try {
        const { nombre, email, password } = req.body;
        const [result] = await pool.query(
            'INSERT INTO usuarios (nombre, email, password) VALUES (?, ?, ?)',
            [nombre, email, password]
        );
        res.status(201).json({
            id: result.insertId,
            nombre,
            email
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    };
}