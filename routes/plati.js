// routes/plati.js
// Sistemul de plati (plata simulata cu cardul):
//   POST /api/plati/checkout        - plateste cosul si genereaza biletele (protejat, tranzactional)
//   GET  /api/plati/comenzile-mele  - istoricul comenzilor utilizatorului curent (protejat)
//
// Plata este simulata: cardul e validat corect (algoritm Luhn, data de expirare,
// CVV), dar nu se misca bani reali si nu se contacteaza niciun procesator extern.
// Nu se salveaza niciodata numarul complet al cardului sau CVV-ul, doar ultimele 4 cifre.

const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const verificaToken = require('../middleware/auth');

const router = express.Router();

// Validarea cardului (simulata, dar realista)

// Algoritmul Luhn: verifica daca un numar de card este valid din punct de vedere matematic.
// Este aceeasi verificare folosita de procesatorii reali pentru a respinge greselile de tastare.
function luhnValid(numar) {
    let suma = 0;
    let dublez = false;
    for (let i = numar.length - 1; i >= 0; i--) {
        let cifra = parseInt(numar[i], 10);
        if (dublez) {
            cifra *= 2;
            if (cifra > 9) cifra -= 9;
        }
        suma += cifra;
        dublez = !dublez;
    }
    return suma % 10 === 0;
}

// Verifica datele cardului si intoarce { ok, eroare, ultim4 }.
function verificaCard(card) {
    if (!card || typeof card !== 'object') {
        return { ok: false, eroare: 'Lipsesc datele cardului.' };
    }

    const numar = String(card.numar || '').replace(/[\s-]/g, '');
    const nume = String(card.nume || '').trim();
    const exp = String(card.exp || '').trim(); // format ll/aa
    const cvv = String(card.cvv || '').trim();

    if (!/^\d{13,19}$/.test(numar)) {
        return { ok: false, eroare: 'Numarul cardului trebuie sa aiba intre 13 si 19 cifre.' };
    }
    if (!luhnValid(numar)) {
        return { ok: false, eroare: 'Numarul cardului este invalid.' };
    }
    if (nume.length < 3) {
        return { ok: false, eroare: 'Numele titularului este obligatoriu.' };
    }
    const potrivireExp = exp.match(/^(\d{2})\s*\/\s*(\d{2})$/);
    if (!potrivireExp) {
        return { ok: false, eroare: 'Data de expirare trebuie sa fie in formatul LL/AA.' };
    }
    const luna = parseInt(potrivireExp[1], 10);
    const an = 2000 + parseInt(potrivireExp[2], 10);
    if (luna < 1 || luna > 12) {
        return { ok: false, eroare: 'Luna de expirare este invalida.' };
    }
    // Cardul e valabil pana la finalul lunii de expirare.
    const expira = new Date(an, luna, 1); // prima zi a lunii urmatoare
    if (expira <= new Date()) {
        return { ok: false, eroare: 'Cardul este expirat.' };
    }
    if (!/^\d{3,4}$/.test(cvv)) {
        return { ok: false, eroare: 'Codul CVV trebuie sa aiba 3 sau 4 cifre.' };
    }

    return { ok: true, ultim4: numar.slice(-4) };
}

// Checkout: plateste cosul si genereaza biletele
// Body: {
//   articole: [{ eveniment_id, nr_locuri }, ...],
//   card: { numar, nume, exp, cvv },
//   facturare: { nume, email }
// }
router.post('/checkout', verificaToken, async (req, res) => {
    const utilizator_id = req.utilizator.id;
    const { articole, card, facturare } = req.body;

    if (!Array.isArray(articole) || articole.length === 0) {
        return res.status(400).json({ eroare: 'Cosul este gol.' });
    }

    // Normalizare articolele si comasare linii duplicate pentru acelasi eveniment.
    const cantitatiPeEveniment = new Map();
    for (const art of articole) {
        const id = parseInt(art.eveniment_id, 10);
        const locuri = parseInt(art.nr_locuri, 10);
        if (!Number.isInteger(id) || !Number.isInteger(locuri) || locuri < 1) {
            return res.status(400).json({ eroare: 'Cosul contine un articol invalid.' });
        }
        cantitatiPeEveniment.set(id, (cantitatiPeEveniment.get(id) || 0) + locuri);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1) Blocare fiecare eveniment, verificare disponibilitate si calculare total.
        let total = 0;
        const liniiVerificate = [];
        for (const [eveniment_id, nr_locuri] of cantitatiPeEveniment) {
            const ev = await client.query(
                'SELECT titlu, pret, locuri_disponibile FROM evenimente WHERE id = $1 FOR UPDATE',
                [eveniment_id]
            );
            if (ev.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ eroare: `Un eveniment din cos nu mai exista (id ${eveniment_id}).` });
            }
            const { titlu, pret, locuri_disponibile } = ev.rows[0];
            if (locuri_disponibile < nr_locuri) {
                await client.query('ROLLBACK');
                return res.status(409).json({
                    eroare: `Locuri insuficiente pentru „${titlu}”. Mai sunt disponibile: ${locuri_disponibile}.`
                });
            }
            const pretUnitar = Number(pret);
            total += pretUnitar * nr_locuri;
            liniiVerificate.push({ eveniment_id, nr_locuri, pretUnitar });
        }
        total = Math.round(total * 100) / 100;

        // 2) Daca este ceva de platit, se valideaza cardul. Evenimentele gratuite trec fara card.
        let ultim4 = null;
        if (total > 0) {
            const rezCard = verificaCard(card);
            if (!rezCard.ok) {
                await client.query('ROLLBACK');
                return res.status(402).json({ eroare: rezCard.eroare });
            }
            ultim4 = rezCard.ultim4;
        }

        // 3) Inregistrare comanda (plata).
        const comanda = await client.query(
            `INSERT INTO comenzi (utilizator_id, total, card_ultim4, nume_card, nume_facturare, email_facturare, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'platita') RETURNING id, total, creat_la`,
            [
                utilizator_id,
                total,
                ultim4,
                card && card.nume ? String(card.nume).trim().slice(0, 120) : null,
                facturare && facturare.nume ? String(facturare.nume).trim().slice(0, 120) : null,
                facturare && facturare.email ? String(facturare.email).trim().slice(0, 160) : null,
            ]
        );
        const comanda_id = comanda.rows[0].id;

        // 4) Generare cate un bilet pentru fiecare linie si scaderea locurilor.
        const bilete = [];
        for (const linie of liniiVerificate) {
            const codBilet = crypto.randomBytes(6).toString('hex').toUpperCase();
            const rez = await client.query(
                `INSERT INTO rezervari (utilizator_id, eveniment_id, nr_locuri, cod_bilet, comanda_id, pret_unitar)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, cod_bilet, nr_locuri`,
                [utilizator_id, linie.eveniment_id, linie.nr_locuri, codBilet, comanda_id, linie.pretUnitar]
            );
            await client.query(
                'UPDATE evenimente SET locuri_disponibile = locuri_disponibile - $1 WHERE id = $2',
                [linie.nr_locuri, linie.eveniment_id]
            );
            bilete.push(rez.rows[0]);
        }

        await client.query('COMMIT');
        res.status(201).json({
            mesaj: 'Plata a fost confirmata.',
            comanda: { id: comanda_id, total, card_ultim4: ultim4 },
            bilete,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ eroare: err.message });
    } finally {
        client.release();
    }
});

// Istoricul comenzilor (GET, protejat)
router.get('/comenzile-mele', verificaToken, async (req, res) => {
    try {
        const rezultat = await pool.query(
            `SELECT id, total, card_ultim4, status, creat_la
             FROM comenzi
             WHERE utilizator_id = $1
             ORDER BY creat_la DESC`,
            [req.utilizator.id]
        );
        res.json(rezultat.rows);
    } catch (err) {
        res.status(500).json({ eroare: err.message });
    }
});

module.exports = router;
