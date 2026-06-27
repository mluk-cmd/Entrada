// routes/rezervari.js
// Ruta pentru rezervari (vezi subcap. 2.2 - tranzactii "totul sau nimic"):
//   POST   /api/rezervari        - creeaza o rezervare (protejat)
//   GET    /api/rezervari/mele   - rezervarile utilizatorului curent (protejat)
//   DELETE /api/rezervari/:id    - anuleaza o rezervare si elibereaza locurile (protejat)

const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const verificaToken = require('../middleware/auth');
const { ajusteazaComanda } = require('../helpers/comenzi');

const router = express.Router();

// Creare rezervare (POST, protejat, tranzactional)
router.post('/', verificaToken, async (req, res) => {
    const { eveniment_id, nr_locuri } = req.body;
    const utilizator_id = req.utilizator.id;
    const locuriCerute = parseInt(nr_locuri, 10) || 1;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Blocare linie eveniment pana la finalul tranzactiei (FOR UPDATE)
        const ev = await client.query(
            'SELECT locuri_disponibile FROM evenimente WHERE id = $1 FOR UPDATE',
            [eveniment_id]
        );
        if (ev.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ eroare: 'Evenimentul nu exista.' });
        }
        const disponibile = ev.rows[0].locuri_disponibile;
        if (disponibile < locuriCerute) {
            await client.query('ROLLBACK');
            return res.status(409).json({ eroare: `Locuri insuficiente. Mai sunt disponibile: ${disponibile}.` });
        }

        const codBilet = crypto.randomBytes(6).toString('hex').toUpperCase();
        const rezervare = await client.query(
            `INSERT INTO rezervari (utilizator_id, eveniment_id, nr_locuri, cod_bilet)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [utilizator_id, eveniment_id, locuriCerute, codBilet]
        );
        await client.query(
            'UPDATE evenimente SET locuri_disponibile = locuri_disponibile - $1 WHERE id = $2',
            [locuriCerute, eveniment_id]
        );

        await client.query('COMMIT');
        res.status(201).json({ mesaj: 'Rezervare confirmata.', rezervare: rezervare.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ eroare: err.message });
    } finally {
        client.release();
    }
});

// Rezervarile mele (GET, protejat)
router.get('/mele', verificaToken, async (req, res) => {
    try {
        const rezultat = await pool.query(
            `SELECT r.id, r.nr_locuri, r.cod_bilet, r.creat_la,
                    e.id AS eveniment_id, e.titlu, e.data_eveniment, e.locatie
             FROM rezervari r
             JOIN evenimente e ON r.eveniment_id = e.id
             WHERE r.utilizator_id = $1
             ORDER BY r.creat_la DESC`,
            [req.utilizator.id]
        );
        res.json(rezultat.rows);
    } catch (err) {
        res.status(500).json({ eroare: err.message });
    }
});

// Anulare rezervare (DELETE, protejat, tranzactional)
// Sterge rezervarea si pune locurile inapoi la loc, intr-o singura tranzactie.
// Verifica si ca rezervarea apartine utilizatorului care cere anularea.
router.delete('/:id', verificaToken, async (req, res) => {
    const rezervareId = req.params.id;
    const utilizator_id = req.utilizator.id;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Gasirea rezervarii, cu verificarea ca apartine utilizatorului curent
        const rez = await client.query(
            'SELECT eveniment_id, nr_locuri, comanda_id FROM rezervari WHERE id = $1 AND utilizator_id = $2',
            [rezervareId, utilizator_id]
        );
        if (rez.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ eroare: 'Rezervarea nu exista sau nu iti apartine.' });
        }
        const { eveniment_id, nr_locuri, comanda_id } = rez.rows[0];

        // Stergere rezervare
        await client.query('DELETE FROM rezervari WHERE id = $1', [rezervareId]);
        // Punere locuri inapoi
        await client.query(
            'UPDATE evenimente SET locuri_disponibile = locuri_disponibile + $1 WHERE id = $2',
            [nr_locuri, eveniment_id]
        );
        // Comanda (venitul) e pastrata coerenta cu biletele ramase.
        await ajusteazaComanda(client, comanda_id);

        await client.query('COMMIT');
        res.json({ mesaj: 'Rezervare anulata. Locurile au fost eliberate.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ eroare: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;