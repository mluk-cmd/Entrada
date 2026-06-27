// routes/favorite.js
// Evenimente salvate (favorite) de utilizatorul curent:
//   GET    /api/favorite           - lista evenimentelor salvate (protejat)
//   GET    /api/favorite/id-uri    - doar id-urile salvate, pentru a marca inimioarele (protejat)
//   POST   /api/favorite           - salveaza un eveniment (protejat)
//   DELETE /api/favorite/:eveniment_id - scoate un eveniment de la favorite (protejat)

const express = require('express');
const pool = require('../db');
const verificaToken = require('../middleware/auth');

const router = express.Router();

// Lista favoritelor (cu detalii eveniment)
router.get('/', verificaToken, async (req, res) => {
    try {
        const rezultat = await pool.query(
            `SELECT e.*
             FROM favorite f
             JOIN evenimente e ON f.eveniment_id = e.id
             WHERE f.utilizator_id = $1
             ORDER BY f.creat_la DESC`,
            [req.utilizator.id]
        );
        res.json(rezultat.rows);
    } catch (err) {
        res.status(500).json({ eroare: err.message });
    }
});

// Doar id-urile salvate
router.get('/id-uri', verificaToken, async (req, res) => {
    try {
        const rezultat = await pool.query(
            'SELECT eveniment_id FROM favorite WHERE utilizator_id = $1',
            [req.utilizator.id]
        );
        res.json(rezultat.rows.map(r => r.eveniment_id));
    } catch (err) {
        res.status(500).json({ eroare: err.message });
    }
});

// Salvare eveniment
router.post('/', verificaToken, async (req, res) => {
    const { eveniment_id } = req.body;
    if (!eveniment_id) {
        return res.status(400).json({ eroare: 'eveniment_id este obligatoriu.' });
    }
    try {
        // ON CONFLICT DO NOTHING: daca e deja salvat, nu se creeaza un duplicat.
        await pool.query(
            `INSERT INTO favorite (utilizator_id, eveniment_id)
             VALUES ($1, $2)
             ON CONFLICT (utilizator_id, eveniment_id) DO NOTHING`,
            [req.utilizator.id, eveniment_id]
        );
        res.status(201).json({ mesaj: 'Eveniment salvat.' });
    } catch (err) {
        // 23503 = cheie straina invalida (eveniment inexistent)
        if (err.code === '23503') {
            return res.status(404).json({ eroare: 'Evenimentul nu exista.' });
        }
        res.status(500).json({ eroare: err.message });
    }
});

// Scoatere de la favorite
router.delete('/:eveniment_id', verificaToken, async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM favorite WHERE utilizator_id = $1 AND eveniment_id = $2',
            [req.utilizator.id, req.params.eveniment_id]
        );
        res.json({ mesaj: 'Eveniment scos de la favorite.' });
    } catch (err) {
        res.status(500).json({ eroare: err.message });
    }
});

module.exports = router;
