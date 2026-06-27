// La anularea unui bilet, totalul comenzii se recalculeaza din biletele ramase.
// Daca nu mai ramane niciunul, comanda este marcata ca anulata, ca sa nu mai conteze la venit.
async function ajusteazaComanda(client, comanda_id) {
    // rezervarile gratuite nu au comanda
    if (!comanda_id) return;

    const rest = await client.query(
        `SELECT COALESCE(SUM(nr_locuri * pret_unitar), 0) AS total, COUNT(*) AS nr
         FROM rezervari WHERE comanda_id = $1`,
        [comanda_id]
    );
    const bileteRamase = parseInt(rest.rows[0].nr, 10);

    if (bileteRamase === 0) {
        await client.query(
            "UPDATE comenzi SET total = 0, status = 'anulata' WHERE id = $1",
            [comanda_id]
        );
    } else {
        await client.query(
            'UPDATE comenzi SET total = $1 WHERE id = $2',
            [Number(rest.rows[0].total), comanda_id]
        );
    }
}

module.exports = { ajusteazaComanda };
