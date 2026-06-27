// routes/admin.js
// Rute disponibile doar administratorilor (verificaToken + verificaAdmin):
//   GET    /api/admin/sumar              - statistici generale (tablou de bord)
//   GET    /api/admin/rezervari          - toate biletele, ale tuturor utilizatorilor
//   PATCH  /api/admin/rezervari/:id      - modifica numarul de locuri de pe un bilet
//   DELETE /api/admin/rezervari/:id      - anuleaza orice bilet si elibereaza locurile
//   GET    /api/admin/comenzi            - toate platile efectuate

const express = require('express');
const pool = require('../db');
const verificaToken = require('../middleware/auth');
const verificaAdmin = require('../middleware/admin');
const { ajusteazaComanda } = require('../helpers/comenzi');

const router = express.Router();

// Toate rutele din acest fisier cer token valid si rol de admin.
router.use(verificaToken, verificaAdmin);

// Tablou de bord (statistici)
router.get('/sumar', async (req, res) => {
    try {
        const [utilizatori, evenimente, bilete, venit] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM utilizatori'),
            pool.query('SELECT COUNT(*) FROM evenimente'),
            pool.query('SELECT COALESCE(SUM(nr_locuri), 0) AS total FROM rezervari'),
            pool.query("SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS comenzi FROM comenzi WHERE status = 'platita'"),
        ]);
        res.json({
            utilizatori: parseInt(utilizatori.rows[0].count, 10),
            evenimente: parseInt(evenimente.rows[0].count, 10),
            bilete_vandute: parseInt(bilete.rows[0].total, 10),
            venit_total: Number(venit.rows[0].total),
            comenzi: parseInt(venit.rows[0].comenzi, 10),
        });
    } catch (err) {
        res.status(500).json({ eroare: err.message });
    }
});

// Toate biletele (rezervarile tuturor)
router.get('/rezervari', async (req, res) => {
    try {
        const rezultat = await pool.query(
            `SELECT r.id, r.nr_locuri, r.cod_bilet, r.pret_unitar, r.creat_la, r.comanda_id,
                    u.nume AS nume_utilizator, u.email AS email_utilizator,
                    e.id AS eveniment_id, e.titlu, e.data_eveniment, e.locuri_disponibile
             FROM rezervari r
             JOIN utilizatori u ON r.utilizator_id = u.id
             JOIN evenimente e  ON r.eveniment_id  = e.id
             ORDER BY r.creat_la DESC`
        );
        res.json(rezultat.rows);
    } catch (err) {
        res.status(500).json({ eroare: err.message });
    }
});

// Modificare nr locuri bilet
// Ajusteaza si locurile disponibile ale evenimentului, tranzactional.
router.patch('/rezervari/:id', async (req, res) => {
    const nrNou = parseInt(req.body.nr_locuri, 10);
    if (!Number.isInteger(nrNou) || nrNou < 1) {
        return res.status(400).json({ eroare: 'Numarul de locuri trebuie sa fie cel putin 1.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const rez = await client.query(
            'SELECT eveniment_id, nr_locuri, comanda_id FROM rezervari WHERE id = $1',
            [req.params.id]
        );
        if (rez.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ eroare: 'Biletul nu exista.' });
        }
        const { eveniment_id, nr_locuri: nrVechi, comanda_id } = rez.rows[0];
        const diferenta = nrNou - nrVechi; // > 0 inseamna mai multe locuri cerute

        // Blocare eveniment si verificare disponibilitate la marirea numarului de locuri.
        const ev = await client.query(
            'SELECT locuri_disponibile FROM evenimente WHERE id = $1 FOR UPDATE',
            [eveniment_id]
        );
        if (diferenta > 0 && ev.rows[0].locuri_disponibile < diferenta) {
            await client.query('ROLLBACK');
            return res.status(409).json({ eroare: `Locuri insuficiente. Mai sunt disponibile: ${ev.rows[0].locuri_disponibile}.` });
        }

        await client.query('UPDATE rezervari SET nr_locuri = $1 WHERE id = $2', [nrNou, req.params.id]);
        // La mai multe locuri pe bilet, se scad din disponibile (si invers).
        await client.query(
            'UPDATE evenimente SET locuri_disponibile = locuri_disponibile - $1 WHERE id = $2',
            [diferenta, eveniment_id]
        );
        // Totalul comenzii depinde de numarul de locuri, deci se recalculeaza.
        await ajusteazaComanda(client, comanda_id);

        await client.query('COMMIT');
        res.json({ mesaj: 'Bilet actualizat.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ eroare: err.message });
    } finally {
        client.release();
    }
});

// Anulare orice bilet
router.delete('/rezervari/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const rez = await client.query(
            'SELECT eveniment_id, nr_locuri, comanda_id FROM rezervari WHERE id = $1',
            [req.params.id]
        );
        if (rez.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ eroare: 'Biletul nu exista.' });
        }
        const { eveniment_id, nr_locuri, comanda_id } = rez.rows[0];

        await client.query('DELETE FROM rezervari WHERE id = $1', [req.params.id]);
        await client.query(
            'UPDATE evenimente SET locuri_disponibile = locuri_disponibile + $1 WHERE id = $2',
            [nr_locuri, eveniment_id]
        );
        // Daca biletul facea parte dintr-o plata, se recalculeaza totalul; daca nu mai ramane
        // niciun bilet pe comanda, e marcata anulata ca sa nu mai conteze la venit.
        await ajusteazaComanda(client, comanda_id);

        await client.query('COMMIT');
        res.json({ mesaj: 'Bilet anulat. Locurile au fost eliberate.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ eroare: err.message });
    } finally {
        client.release();
    }
});

// Toate platile
router.get('/comenzi', async (req, res) => {
    try {
        const rezultat = await pool.query(
            `SELECT c.id, c.total, c.card_ultim4, c.nume_facturare, c.email_facturare, c.status, c.creat_la,
                    u.nume AS nume_utilizator, u.email AS email_utilizator
             FROM comenzi c
             JOIN utilizatori u ON c.utilizator_id = u.id
             ORDER BY c.creat_la DESC`
        );
        res.json(rezultat.rows);
    } catch (err) {
        res.status(500).json({ eroare: err.message });
    }
});

module.exports = router;
