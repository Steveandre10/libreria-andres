import pool from './db.js';
import bcrypt from 'bcryptjs';

/**
 * Inicializa y sincroniza las tablas de la base de datos (usuarios, libros, reseñas)
 * garantizando que existan las columnas necesarias y sembrando datos de prueba si están vacías.
 */
export async function inicializarBaseDeDatos() {
  try {
    // 1. Asegurar columna 'rol' en tabla usuarios
    const [colsUsuario] = await pool.query("SHOW COLUMNS FROM usuarios LIKE 'rol'");
    if (colsUsuario.length === 0) {
      await pool.query("ALTER TABLE usuarios ADD COLUMN rol VARCHAR(20) NOT NULL DEFAULT 'usuario'");
      console.log('✓ Columna "rol" agregada exitosamente a la tabla usuarios.');
    }

    // 2. Crear tabla libros si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS libros (
        id_libro INT AUTO_INCREMENT PRIMARY KEY,
        titulo VARCHAR(200) NOT NULL,
        ISBN VARCHAR(20) DEFAULT NULL,
        genero VARCHAR(50) DEFAULT NULL,
        autor VARCHAR(100) DEFAULT NULL,
        precio DECIMAL(10,2) NOT NULL DEFAULT 19.99,
        portada VARCHAR(500) DEFAULT NULL,
        descripcion TEXT DEFAULT NULL,
        promedio_reseña DECIMAL(3,2) DEFAULT 5.00,
        disponibilidad ENUM('Disponible', 'Agotado') NOT NULL DEFAULT 'Disponible',
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
        id_libreria INT DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Comprobar y agregar columnas opcionales en libros si la tabla ya existía
    const [colsLibro] = await pool.query('SHOW COLUMNS FROM libros');
    const nombresCols = colsLibro.map(c => c.Field.toLowerCase());

    if (!nombresCols.includes('titulo')) {
      await pool.query("ALTER TABLE libros ADD COLUMN titulo VARCHAR(200) NOT NULL DEFAULT 'Sin título' AFTER id_libro");
      console.log('✓ Columna "titulo" añadida a la tabla libros.');
    }
    if (!nombresCols.includes('precio')) {
      await pool.query("ALTER TABLE libros ADD COLUMN precio DECIMAL(10,2) NOT NULL DEFAULT 19.99 AFTER autor");
      console.log('✓ Columna "precio" añadida a la tabla libros.');
    }
    if (!nombresCols.includes('portada')) {
      await pool.query("ALTER TABLE libros ADD COLUMN portada VARCHAR(500) DEFAULT NULL AFTER precio");
      console.log('✓ Columna "portada" añadida a la tabla libros.');
    }
    if (!nombresCols.includes('descripcion')) {
      await pool.query("ALTER TABLE libros ADD COLUMN descripcion TEXT DEFAULT NULL AFTER portada");
      console.log('✓ Columna "descripcion" añadida a la tabla libros.');
    }

    // 3. Crear tabla reseñas si no existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reseñas (
        id_reseña INT AUTO_INCREMENT PRIMARY KEY,
        reseña VARCHAR(500) DEFAULT NULL,
        fecha DATE DEFAULT NULL,
        calificacion DECIMAL(3,2) DEFAULT 5.00,
        id INT DEFAULT NULL,
        id_libro INT DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Sembrar usuarios de prueba si la tabla usuarios está vacía
    const [usuariosRows] = await pool.query('SELECT COUNT(*) as count FROM usuarios');
    if (usuariosRows[0].count === 0) {
      const passwordAdmin = await bcrypt.hash('admin123', 10);
      const passwordDemo = await bcrypt.hash('demo123', 10);

      await pool.query(
        'INSERT INTO usuarios (nombre, email, password, rol) VALUES (?, ?, ?, ?), (?, ?, ?, ?)',
        [
          'Administrador Adrián', 'admin@libreria.com', passwordAdmin, 'admin',
          'Lector Demo', 'demo@libreria.com', passwordDemo, 'usuario'
        ]
      );
      console.log('✓ Usuarios de prueba creados (admin@libreria.com / admin123 [Rol: admin], demo@libreria.com / demo123 [Rol: usuario]).');
    }

    // 5. Sembrar libros de prueba si la tabla libros está vacía
    const [librosRows] = await pool.query('SELECT COUNT(*) as count FROM libros');
    if (librosRows[0].count === 0) {
      await pool.query(`
        INSERT INTO libros (titulo, ISBN, genero, autor, precio, portada, descripcion, promedio_reseña, disponibilidad) VALUES
        (
          'Cien años de soledad',
          '978-0307474728',
          'Realismo Mágico',
          'Gabriel García Márquez',
          24.99,
          'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=600',
          'La obra cumbre de Gabriel García Márquez narra la historia de la familia Buendía a lo largo de siete generaciones en el mítico pueblo de Macondo.',
          4.90,
          'Disponible'
        ),
        (
          'Don Quijote de la Mancha',
          '978-8424115456',
          'Clásico',
          'Miguel de Cervantes',
          28.50,
          'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=600',
          'Las cómicas y reflexivas aventuras del ingenioso hidalgo Don Quijote de la Mancha y su fiel escudero Sancho Panza.',
          4.80,
          'Disponible'
        ),
        (
          'El Principito',
          '978-0156013987',
          'Filosofía / Infantil',
          'Antoine de Saint-Exupéry',
          14.99,
          'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&q=80&w=600',
          'Un piloto varado en el desierto conoce a un pequeño príncipe venido de un asteroide lejano, aprendiendo valiosas lecciones sobre el amor y la vida.',
          4.95,
          'Disponible'
        ),
        (
          '1984',
          '978-0451524935',
          'Ciencia Ficción / Distopía',
          'George Orwell',
          18.00,
          'https://images.unsplash.com/photo-1532012164546-f432f2e3edd4?auto=format&fit=crop&q=80&w=600',
          'Una inquietante visión de un futuro totalitario dominado por el Gran Hermano, la manipulación de la verdad y el control de la mente humana.',
          4.75,
          'Disponible'
        ),
        (
          'Rayuela',
          '978-8437604572',
          'Ficción Latinoamericana',
          'Julio Cortázar',
          21.50,
          'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&q=80&w=600',
          'Una novela revolucionaria con múltiples formas de lectura que explora el amor entre Horacio Oliveira y La Maga en París y Buenos Aires.',
          4.60,
          'Agotado'
        );
      `);
      console.log('✓ Libros iniciales sembrados en la base de datos.');

      // Sembrar un par de reseñas de prueba
      const [primerosLibros] = await pool.query('SELECT id_libro FROM libros LIMIT 2');
      const [primerUsuario] = await pool.query('SELECT id FROM usuarios LIMIT 1');

      if (primerosLibros.length > 0 && primerUsuario.length > 0) {
        await pool.query(`
          INSERT INTO reseñas (reseña, fecha, calificacion, id, id_libro) VALUES
          ('¡Una obra de arte inigualable! Cada capítulo te transporta a un mundo fascinante.', CURDATE(), 5.00, ?, ?),
          ('Excelente edición, la tipografía y calidad de impresión son perfectas.', CURDATE(), 4.80, ?, ?)
        `, [
          primerUsuario[0].id, primerosLibros[0].id_libro,
          primerUsuario[0].id, primerosLibros[0].id_libro
        ]);
        console.log('✓ Reseñas de prueba iniciales creadas.');
      }
    }

    console.log('✓ Inicialización de base de datos completada satisfactoriamente.');
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error.message);
  }
}
