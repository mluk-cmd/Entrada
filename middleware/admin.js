// middleware/admin.js
// Se foloseste dupa verificaToken: permite accesul doar daca utilizatorul
// autentificat are rol de administrator (campul "admin" din token-ul JWT).
// ex  router.delete('/:id', verificaToken, verificaAdmin, handler)

function verificaAdmin(req, res, next) {
    if (!req.utilizator || !req.utilizator.admin) {
        return res.status(403).json({ eroare: 'Acces permis doar administratorilor.' });
    }
    next();
}

module.exports = verificaAdmin;
