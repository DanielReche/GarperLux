const mysql = require('mysql2/promise');

async function testConnection() {
    try {
        // Conectamos al Router
        const connection = await mysql.createConnection({
            host: '127.0.0.1',
            port: 6446, 
            user: 'garperlux',
            password: 'garperlux',
            database: 'garperlux'
        });

        console.log("¡Conexión exitosa al clúster a través del Router! 🚀");

        // Hacemos una consulta de prueba
        const [rows] = await connection.execute('SELECT @@hostname as nodo_actual');
        console.log("Estás escribiendo en el nodo:", rows[0].nodo_actual);

        await connection.end();
    } catch (error) {
        console.error("Error conectando a la BBDD:", error.message);
    }
}

testConnection();