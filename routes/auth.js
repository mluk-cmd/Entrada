const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const pool = require('../db');
const verificaToken = require('../middleware/auth');
const router = express.Router();

const SALT_ROUNDS = 10;

// Lista emailurilor de administrator, citita din .env (ADMIN_EMAILS).
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

function esteAdmin(email) {
    return ADMIN_EMAILS.includes(String(email).trim().toLowerCase());
}

// Inregistrare
router.post('/register', async (req, res) => {
    const { nume, email, parola } = req.body;

//campuri obligatorii
    if (!nume || !email || !parola) {
        return res.status(400).json({ eroare: 'Nume, email si parola sunt obligatorii.' });
    }

    try {
        const parolaHash = await bcrypt.hash(parola, SALT_ROUNDS);

        // doar hash-ul ajunge in db
        const rezultat = await pool.query(
            'INSERT INTO utilizatori (nume, email, parola_hash) VALUES ($1, $2, $3) RETURNING id, nume, email',
            [nume, email, parolaHash]
        );

        res.status(201).json({
            mesaj: 'Cont creat cu succes.',
            utilizator: rezultat.rows[0]
        });
    } catch (err) {
        // Codul 23505 incalcarea constrangerii UNIQUE (email deja folosit)
        if (err.code === '23505') {
            return res.status(409).json({ eroare: 'Exista deja un cont cu acest email.' });
        }
        res.status(500).json({ eroare: err.message });
    }
});

// Autentificare
router.post('/login', async (req, res) => {
    const { email, parola } = req.body;

    if (!email || !parola) {
        return res.status(400).json({ eroare: 'Email si parola sunt obligatorii.' });
    }

    try {
        // cautare dupa email
        const rezultat = await pool.query(
            'SELECT * FROM utilizatori WHERE email = $1',
            [email]
        );

        if (rezultat.rows.length === 0) {
            return res.status(401).json({ eroare: 'Email sau parola incorecte.' });
        }

        const utilizator = rezultat.rows[0];

        // comparare parola cu hash stocat
        const parolaCorecta = await bcrypt.compare(parola, utilizator.parola_hash);

        if (!parolaCorecta) {
            return res.status(401).json({ eroare: 'Email sau parola incorecte.' });
        }

        const admin = esteAdmin(utilizator.email);

        // JWT semnat cu termen de expirare, ce contine si rolul de admin,
        // ca sa fie verificat la rutele protejate fara a mai interoga baza.
        const token = jwt.sign(
            { id: utilizator.id, email: utilizator.email, admin },
            process.env.JWT_SECRET,
            { expiresIn: '2h' }
        );

        res.json({
            mesaj: 'Autentificare reusita.',
            token: token,
            utilizator: { id: utilizator.id, nume: utilizator.nume, email: utilizator.email, admin }
        });
    } catch (err) {
        res.status(500).json({ eroare: err.message });
    }
});

// Actualizare profil (nume + email)
// Emailul intra in token (si decide rolul de admin), deci se emite un token nou.
router.patch('/profil', verificaToken, async (req, res) => {
    const nume = String(req.body.nume || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!nume || !email) {
        return res.status(400).json({ eroare: 'Numele si emailul sunt obligatorii.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ eroare: 'Adresa de email nu este valida.' });
    }

    try {
        const rezultat = await pool.query(
            'UPDATE utilizatori SET nume = $1, email = $2 WHERE id = $3 RETURNING id, nume, email',
            [nume, email, req.utilizator.id]
        );
        const utilizator = rezultat.rows[0];
        const admin = esteAdmin(utilizator.email);
        const token = jwt.sign(
            { id: utilizator.id, email: utilizator.email, admin },
            process.env.JWT_SECRET,
            { expiresIn: '2h' }
        );
        res.json({
            mesaj: 'Profil actualizat.',
            token,
            utilizator: { id: utilizator.id, nume: utilizator.nume, email: utilizator.email, admin },
        });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ eroare: 'Exista deja un cont cu acest email.' });
        }
        res.status(500).json({ eroare: err.message });
    }
});

// Schimbare parola
router.patch('/parola', verificaToken, async (req, res) => {
    const { parola_veche, parola_noua } = req.body;

    if (!parola_veche || !parola_noua) {
        return res.status(400).json({ eroare: 'Ambele parole sunt obligatorii.' });
    }
    if (String(parola_noua).length < 6) {
        return res.status(400).json({ eroare: 'Parola noua trebuie sa aiba minim 6 caractere.' });
    }

    try {
        const rezultat = await pool.query(
            'SELECT parola_hash FROM utilizatori WHERE id = $1',
            [req.utilizator.id]
        );
        if (rezultat.rows.length === 0) {
            return res.status(404).json({ eroare: 'Contul nu exista.' });
        }
        const corecta = await bcrypt.compare(parola_veche, rezultat.rows[0].parola_hash);
        if (!corecta) {
            return res.status(401).json({ eroare: 'Parola veche este incorecta.' });
        }
        const hashNou = await bcrypt.hash(parola_noua, SALT_ROUNDS);
        await pool.query('UPDATE utilizatori SET parola_hash = $1 WHERE id = $2', [hashNou, req.utilizator.id]);
        res.json({ mesaj: 'Parola a fost schimbata.' });
    } catch (err) {
        res.status(500).json({ eroare: err.message });
    }
});

module.exports = router;