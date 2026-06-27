// server.js
// Serverul principal Node.js + Express (vezi subcap. 2.1).

const express = require('express');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
require('dotenv').config();

const pool = require('./db');
const auth = require('./routes/auth');
const evenimente = require('./routes/evenimente');
const rezervari = require('./routes/rezervari');
const plati = require('./routes/plati');
const favorite = require('./routes/favorite');
const admin = require('./routes/admin');

const app = express();

// Comprima raspunsurile (gzip) ca sa se incarce mai repede CSS-ul si JS-ul.
app.use(compression());
app.use(cors());
app.use(express.json());

// Servire fisiere frontend (HTML, CSS, JS) din folderul "public"
app.use(express.static(path.join(__dirname, 'public')));

// Ruta de test pentru baza de date
app.get('/test-db', async (req, res) => {
    try {
        const rezultat = await pool.query('SELECT COUNT(*) FROM evenimente');
        res.json({ numar_evenimente: rezultat.rows[0].count });
    } catch (err) {
        res.status(500).json({ eroare: err.message });
    }
});

// Rutele API ale aplicatiei
app.use('/api/auth', auth);
app.use('/api/evenimente', evenimente);
app.use('/api/rezervari', rezervari);
app.use('/api/plati', plati);
app.use('/api/favorite', favorite);
app.use('/api/admin', admin);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serverul ruleaza pe http://localhost:${PORT}`);
});