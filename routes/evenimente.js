// routes/evenimente.js
// Rutele pentru evenimente 
//   GET  /api/evenimente      - lista evenimentelor (public)
//   GET  /api/evenimente/:id  - detaliile unui eveniment (public)
//   POST /api/evenimente      - creare eveniment (protejat cu token JWT)

const express = require('express');
const pool = require('../db');
const verificaToken = require('../middleware/auth');
const verificaAdmin = require('../middleware/admin');

const router = express.Router();

// Lista evenimentelor (GET, public)
router.get('/', async (req, res) => {
    try {
        const rezultat = await pool.query(
            'SELECT * FROM evenimente ORDER BY data_eveniment ASC'
        );
        res.json(rezultat.rows);
    } catch (err) {
        res.status(500).json({ eroare: err.message });
    }
});

// Detalii eveniment (GET, public)
router.get('/:id', async (req, res) => {
    try {
        const rezultat = await pool.query(
            'SELECT * FROM evenimente WHERE id = $1',
            [req.params.id]
        );
        if (rezultat.rows.length === 0) {
            return res.status(404).json({ eroare: 'Evenimentul nu exista.' });
        }
        res.json(rezultat.rows[0]);
    } catch (err) {
        res.status(500).json({ eroare: err.message });
    }
});

// Creare eveniment (POST, doar admin)
// verificaToken + verificaAdmin: doar un administrator poate crea evenimente.
router.post('/', verificaToken, verificaAdmin, async (req, res) => {
    const { titlu, descriere, data_eveniment, locatie, locuri_totale, pret } = req.body;

    if (!titlu || !data_eveniment || locuri_totale == null) {
        return res.status(400).json({ eroare: 'Titlu, data si numarul de locuri sunt obligatorii.' });
    }
    // fara evenimente in trecut sau cu valori negative
    if (new Date(data_eveniment) < new Date()) {
        return res.status(400).json({ eroare: 'Data evenimentului nu poate fi in trecut.' });
    }
    if (parseInt(locuri_totale, 10) < 1) {
        return res.status(400).json({ eroare: 'Trebuie cel putin un loc.' });
    }
    if (pret != null && Number(pret) < 0) {
        return res.status(400).json({ eroare: 'Pretul nu poate fi negativ.' });
    }

    try {
        // La creare, locurile disponibile sunt egale cu cele totale.
        const rezultat = await pool.query(
            `INSERT INTO evenimente (titlu, descriere, data_eveniment, locatie, locuri_totale, locuri_disponibile, pret)
             VALUES ($1, $2, $3, $4, $5, $5, $6) RETURNING *`,
            [titlu, descriere, data_eveniment, locatie, locuri_totale, pret || 0]
        );
        res.status(201).json({ mesaj: 'Eveniment creat.', eveniment: rezultat.rows[0] });
    } catch (err) {
        res.status(500).json({ eroare: err.message });
    }
});

// Editare eveniment (PATCH, doar admin)
// Permite modificarea campurilor trimise. Daca se schimba "locuri_totale",
// se ajusteaza si "locuri_disponibile" cu aceeasi diferenta, ca sa nu se piarda
// locurile deja vandute.
router.patch('/:id', verificaToken, verificaAdmin, async (req, res) => {
    const { titlu, descriere, data_eveniment, locatie, locuri_totale, pret } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const ev = await client.query('SELECT * FROM evenimente WHERE id = $1 FOR UPDATE', [req.params.id]);
        if (ev.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ eroare: 'Evenimentul nu exista.' });
        }
        const curent = ev.rows[0];

        // Calculare valori noi (valoarea curenta e pastrata daca un camp nu a fost trimis).
        const nouTitlu = titlu != null ? titlu : curent.titlu;
        const nouDescriere = descriere != null ? descriere : curent.descriere;
        const nouData = data_eveniment != null ? data_eveniment : curent.data_eveniment;
        const nouLocatie = locatie != null ? locatie : curent.locatie;
        const nouPret = pret != null ? pret : curent.pret;

        let nouTotale = curent.locuri_totale;
        let nouDisponibile = curent.locuri_disponibile;
        if (locuri_totale != null) {
            const totaleCerute = parseInt(locuri_totale, 10);
            const vandute = curent.locuri_totale - curent.locuri_disponibile;
            if (Number.isNaN(totaleCerute) || totaleCerute < vandute) {
                await client.query('ROLLBACK');
                return res.status(400).json({ eroare: `Locurile totale nu pot fi mai mici decat cele deja vandute (${vandute}).` });
            }
            nouTotale = totaleCerute;
            nouDisponibile = totaleCerute - vandute;
        }

        const rezultat = await client.query(
            `UPDATE evenimente
             SET titlu = $1, descriere = $2, data_eveniment = $3, locatie = $4,
                 locuri_totale = $5, locuri_disponibile = $6, pret = $7
             WHERE id = $8 RETURNING *`,
            [nouTitlu, nouDescriere, nouData, nouLocatie, nouTotale, nouDisponibile, nouPret, req.params.id]
        );
        await client.query('COMMIT');
        res.json({ mesaj: 'Eveniment actualizat.', eveniment: rezultat.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ eroare: err.message });
    } finally {
        client.release();
    }
});

// Stergere eveniment (DELETE, doar admin)
// Nu permite stergerea daca exista bilete vandute (ar lasa rezervari orfane).
router.delete('/:id', verificaToken, verificaAdmin, async (req, res) => {
    try {
        const rez = await pool.query('SELECT COUNT(*) FROM rezervari WHERE eveniment_id = $1', [req.params.id]);
        if (parseInt(rez.rows[0].count, 10) > 0) {
            return res.status(409).json({ eroare: 'Nu poti sterge un eveniment care are bilete vandute. Anuleaza intai biletele.' });
        }
        const del = await pool.query('DELETE FROM evenimente WHERE id = $1 RETURNING id', [req.params.id]);
        if (del.rows.length === 0) {
            return res.status(404).json({ eroare: 'Evenimentul nu exista.' });
        }
        res.json({ mesaj: 'Eveniment sters.' });
    } catch (err) {
        res.status(500).json({ eroare: err.message });
    }
});

module.exports = router;