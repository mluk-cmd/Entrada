// Verifica semnatura token-ului JWT la fiecare cerere protejata.
// Foloseste jwt.verify (nu jwt.decode), tocmai pentru a valida semnatura,

const jwt = require('jsonwebtoken');
require('dotenv').config();

function verificaToken(req, res, next) {
    //token in antet
    const antet = req.headers['authorization'];

    if (!antet) {
        return res.status(401).json({ eroare: 'Lipseste token-ul de autentificare.' });
    }

    const token = antet.split(' ')[1]; // doar partea de dupa "Bearer"

    if (!token) {
        return res.status(401).json({ eroare: 'Format de token invalid.' });
    }

    try {
        // Daca token-ul e modificat sau expirat, arunca eroare.
        const date = jwt.verify(token, process.env.JWT_SECRET);
        req.utilizator = date; 
        next();
    } catch (err) {
        return res.status(403).json({ eroare: 'Token invalid sau expirat.' });
    }
}

module.exports = verificaToken;