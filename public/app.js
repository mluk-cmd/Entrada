const API = '/api';
let token = null;
let numeUtilizator = null;
let utilizatorCurent = null;
let esteAdmin = false;
let evenimenteCache = [];
let favoriteIds = new Set();
let cerereInCurs = false;

// Coșul: { eveniment_id, titlu, pret, nr_locuri }. Salvat in localStorage ca sa supravietuiasca reincarcarii.
let cos = [];
try { cos = JSON.parse(localStorage.getItem('cos_entrada') || '[]'); } catch { cos = []; }

const LUNI = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','noi','dec'];
const LUNI_LUNG = ['ianuarie','februarie','martie','aprilie','mai','iunie','iulie','august','septembrie','octombrie','noiembrie','decembrie'];

const modal = document.getElementById('modal');
const modalDet = document.getElementById('modal-detalii');
const btnAuth = document.getElementById('btn-auth');
const btnContAvatar = document.getElementById('btn-cont-avatar');
const btnAnuleazaTot = document.getElementById('btn-anuleaza-tot');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const formLogin = document.getElementById('form-login');
const formRegister = document.getElementById('form-register');

btnAuth.addEventListener('click', () => modal.classList.remove('ascuns'));
document.getElementById('modal-close').addEventListener('click', () => modal.classList.add('ascuns'));
modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('ascuns'); });
document.getElementById('detalii-close').addEventListener('click', () => modalDet.classList.add('ascuns'));
modalDet.addEventListener('click', e => { if (e.target === modalDet) modalDet.classList.add('ascuns'); });

//Coș: referințe DOM și deschidere/închidere
const modalCos = document.getElementById('modal-cos');
const btnCos = document.getElementById('btn-cos');
const cosNr = document.getElementById('cos-nr');
const pasCos = document.getElementById('cos-pas-cos');
const pasPlata = document.getElementById('cos-pas-plata');
const pasGata = document.getElementById('cos-pas-gata');

// Buton "Salvate" din bara de sus
const btnSalvate = document.getElementById('btn-salvate');
const salvateNr = document.getElementById('salvate-nr');
btnSalvate.addEventListener('click', () => {
    document.getElementById('sectiune-salvate')?.scrollIntoView({ behavior: 'smooth' });
});
function actualizeazaBadgeSalvate() {
    const n = favoriteIds.size;
    salvateNr.textContent = n;
    salvateNr.classList.toggle('ascuns', n === 0);
}

btnCos.addEventListener('click', () => { aratapas('cos'); renderCos(); modalCos.classList.remove('ascuns'); });
document.getElementById('cos-close').addEventListener('click', () => modalCos.classList.add('ascuns'));
modalCos.addEventListener('click', e => { if (e.target === modalCos) modalCos.classList.add('ascuns'); });
document.getElementById('btn-inapoi-cos').addEventListener('click', () => aratapas('cos'));
document.getElementById('btn-gata-close').addEventListener('click', () => {
    modalCos.classList.add('ascuns');
    document.getElementById('sectiune-rezervari')?.scrollIntoView({ behavior: 'smooth' });
});

tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('activ'); tabRegister.classList.remove('activ');
    formLogin.classList.remove('ascuns'); formRegister.classList.add('ascuns');
});
tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('activ'); tabLogin.classList.remove('activ');
    formRegister.classList.remove('ascuns'); formLogin.classList.add('ascuns');
});

function toast(text, tip='') {
    const t = document.getElementById('toast');
    t.textContent = text; t.className = 'toast ' + tip;
    setTimeout(() => t.classList.add('ascuns'), 3200);
}
const ora = d => d.toLocaleTimeString('ro-RO',{hour:'2-digit',minute:'2-digit'});
const dataLunga = d => `${d.getDate()} ${LUNI_LUNG[d.getMonth()]} ${d.getFullYear()}`;
// imaginea cu codul QR a unui bilet (generata de un serviciu gratuit)
const qrSrc = cod => `https://api.qrserver.com/v1/create-qr-code/?size=130x130&margin=0&data=${encodeURIComponent(cod)}`;

formRegister.addEventListener('submit', async e => {
    e.preventDefault();
    const m = document.getElementById('mesaj-register'); m.textContent=''; m.className='mesaj';
    try {
        const r = await fetch(`${API}/auth/register`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
                nume: document.getElementById('reg-nume').value,
                email: document.getElementById('reg-email').value,
                parola: document.getElementById('reg-parola').value
            })
        });
        const d = await r.json();
        if (r.ok) { m.textContent='Cont creat. Te poți autentifica.'; m.classList.add('succes'); formRegister.reset(); setTimeout(()=>tabLogin.click(),900); }
        else { m.textContent = d.eroare || 'Eroare la înregistrare.'; m.classList.add('eroare'); }
    } catch { m.textContent='Serverul nu răspunde.'; m.classList.add('eroare'); }
});

formLogin.addEventListener('submit', async e => {
    e.preventDefault();
    const m = document.getElementById('mesaj-login'); m.textContent=''; m.className='mesaj';
    try {
        const r = await fetch(`${API}/auth/login`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
                email: document.getElementById('login-email').value,
                parola: document.getElementById('login-parola').value
            })
        });
        const d = await r.json();
        if (r.ok) { token=d.token; utilizatorCurent=d.utilizator; numeUtilizator=d.utilizator.nume; esteAdmin=!!d.utilizator.admin; salveazaSesiune(); modal.classList.add('ascuns'); dupaAutentificare(); toast(`Bine ai venit, ${numeUtilizator.split(' ')[0]}!`,'ok'); }
        else { m.textContent = d.eroare || 'Autentificare eșuată.'; m.classList.add('eroare'); }
    } catch { m.textContent='Serverul nu răspunde.'; m.classList.add('eroare'); }
});

async function dupaAutentificare() {
    btnAuth.classList.add('ascuns');
    document.getElementById('sectiune-rezervari').classList.remove('ascuns');
    document.getElementById('sectiune-salvate').classList.remove('ascuns');
    btnSalvate.classList.remove('ascuns');
    // Butonul-avatar din bara de sus (initiala + prenume).
    const prenume = numeUtilizator.split(' ')[0];
    document.getElementById('avatar-initiala').textContent = prenume.charAt(0).toUpperCase();
    document.getElementById('avatar-nume').textContent = prenume;
    btnContAvatar.classList.remove('ascuns');
    await incarcaFavoriteIds();
    actualizeazaBadgeSalvate();
    incarcaEvenimente();
    incarcaRezervari();
    incarcaSalvate();
    if (esteAdmin) {
        document.getElementById('btn-admin').classList.remove('ascuns');
    }
}
// Butonul Admin din bara de sus deschide pagina de administrare (#admin).
document.getElementById('btn-admin').addEventListener('click', () => { location.hash = 'admin'; });
// Butonul-avatar deschide pagina de cont (#cont).
btnContAvatar.addEventListener('click', () => { location.hash = 'cont'; });

async function incarcaEvenimente() {
    const c = document.getElementById('lista-evenimente');
    try {
        const r = await fetch(`${API}/evenimente`);
        evenimenteCache = await r.json();
        document.getElementById('stat-nr').textContent = evenimenteCache.length;
        randeazaEvenimente();
    } catch { c.innerHTML='<p class="gol">Programul nu s-a putut încărca.</p>'; }
}

// Cautarea si filtrele active pentru lista de evenimente.
let textCautare = '';
let filtruActiv = 'toate';

function randeazaEvenimente() {
    const c = document.getElementById('lista-evenimente');
    const q = textCautare.trim().toLowerCase();
    const lista = evenimenteCache.filter(ev => {
        if (q && !(`${ev.titlu} ${ev.locatie || ''}`.toLowerCase().includes(q))) return false;
        if (filtruActiv === 'gratuite') return Number(ev.pret) === 0;
        if (filtruActiv === 'disponibile') return ev.locuri_disponibile > 0;
        return true;
    });
    c.innerHTML = '';
    if (!lista.length) { c.innerHTML='<p class="gol">Niciun eveniment găsit.</p>'; return; }
    lista.forEach((ev,i) => c.appendChild(creeazaCardEveniment(ev, i)));
}

document.getElementById('cauta-eveniment').addEventListener('input', e => {
    textCautare = e.target.value;
    randeazaEvenimente();
});
document.querySelectorAll('.chip[data-filtru]').forEach(b => {
    b.addEventListener('click', () => {
        filtruActiv = b.dataset.filtru;
        document.querySelectorAll('.chip[data-filtru]').forEach(x => x.classList.toggle('activ', x === b));
        randeazaEvenimente();
    });
});

// Construieste cardul unui eveniment (refolosit la "Program" si la "Evenimente salvate").
function creeazaCardEveniment(ev, i) {
    const d = new Date(ev.data_eveniment);
    const disp = ev.locuri_disponibile;
    let cls, txt;
    if (disp<=0){cls='zero';txt='Epuizat';}
    else if (disp<=10){cls='putine';txt=`${disp} locuri`;}
    else {cls='ok';txt=`${disp} locuri`;}
    const pret = Number(ev.pret)===0 ? '<span class="pret gratis">Gratuit</span>' : `<span class="pret">${ev.pret} lei</span>`;
    const fav = favoriteIds.has(ev.id);
    const el = document.createElement('article');
    el.className='eveniment'; el.style.animationDelay=`${i*0.05}s`;
    el.innerHTML = `
        <div class="ev-banner g${i%5}"><div class="zi">${d.getDate()}</div><div class="luna">${LUNI[d.getMonth()]}</div></div>
        <div class="ev-info">
            <h3>${ev.titlu}</h3>
            <div class="meta"><span>📍 ${ev.locatie || 'Locație nestabilită'}</span><span>🕒 ${ora(d)}</span></div>
            <div class="ev-butoane">
                <button class="btn-detalii" type="button">Vezi detalii</button>
                <button class="btn-favorit ${fav?'activ':''}" type="button">${fav?'♥ Salvat':'♡ Salvează'}</button>
            </div>
        </div>
        <div class="ev-actiune">${pret}<span class="stoc ${cls}">${txt}</span><button class="btn-rez ${esteInCos(ev.id)?'in-cos':''}" ${disp<=0?'disabled':''}>${disp<=0?'Indisponibil':(esteInCos(ev.id)?'În coș ✓':'Adaugă în coș')}</button></div>`;
    el.querySelector('.ev-info h3').addEventListener('click', () => deschideDetalii(ev.id));
    el.querySelector('.btn-detalii').addEventListener('click', () => deschideDetalii(ev.id));
    el.querySelector('.btn-favorit').addEventListener('click', e => toggleFavorit(ev.id, e.currentTarget));
    const btnRez = el.querySelector('.btn-rez');
    if (disp>0) btnRez.addEventListener('click', () => adaugaInCos(ev.id));
    return el;
}

// Favorite
async function incarcaFavoriteIds() {
    if (!token) { favoriteIds = new Set(); return; }
    try {
        const r = await fetch(`${API}/favorite/id-uri`, { headers:{'Authorization':`Bearer ${token}`} });
        favoriteIds = new Set(await r.json());
    } catch { favoriteIds = new Set(); }
}

async function toggleFavorit(id, buton) {
    if (!token) { modal.classList.remove('ascuns'); toast('Autentifică-te pentru a salva evenimente.'); return; }
    const eraFav = favoriteIds.has(id);
    try {
        const r = await fetch(`${API}/favorite${eraFav?'/'+id:''}`, {
            method: eraFav ? 'DELETE' : 'POST',
            headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
            body: eraFav ? undefined : JSON.stringify({ eveniment_id: id }),
        });
        if (!r.ok) { toast('Operațiunea a eșuat.','err'); return; }
        if (eraFav) { favoriteIds.delete(id); toast('Scos de la favorite.'); }
        else { favoriteIds.add(id); toast('Eveniment salvat.','ok'); }
        // Actualizare buton, badge si lista de salvate.
        if (buton) {
            const acum = favoriteIds.has(id);
            buton.classList.toggle('activ', acum);
            buton.textContent = acum ? '♥ Salvat' : '♡ Salvează';
        }
        actualizeazaBadgeSalvate();
        incarcaSalvate();
    } catch { toast('Serverul nu răspunde.','err'); }
}

async function incarcaSalvate() {
    const c = document.getElementById('lista-salvate');
    if (!token) return;
    try {
        const r = await fetch(`${API}/favorite`, { headers:{'Authorization':`Bearer ${token}`} });
        const salvate = await r.json();
        if (!salvate.length) { c.innerHTML='<p class="gol">Nu ai evenimente salvate. Apasă „♡ Salvează” pe un eveniment.</p>'; return; }
        c.innerHTML='';
        salvate.forEach((ev,i) => c.appendChild(creeazaCardEveniment(ev, i)));
    } catch { c.innerHTML='<p class="gol">Favoritele nu s-au putut încărca.</p>'; }
}

function deschideDetalii(id) {
    const ev = evenimenteCache.find(e => e.id === id);
    if (!ev) return;
    const i = evenimenteCache.indexOf(ev);
    const d = new Date(ev.data_eveniment);
    const disp = ev.locuri_disponibile;
    const pret = Number(ev.pret)===0 ? '<span class="pret gratis">Gratuit</span>' : `<span class="pret">${ev.pret} lei</span>`;
    const descriere = ev.descriere || 'Detaliile complete ale evenimentului vor fi anunțate în curând.';
    document.getElementById('detalii-continut').innerHTML = `
        <div class="detalii-banner g${i%5}"><div class="data-pin"><div class="zi">${d.getDate()}</div><div class="luna">${LUNI[d.getMonth()]}</div></div></div>
        <h2 class="detalii-titlu">${ev.titlu}</h2>
        <div class="detalii-meta">
            <div>📅 ${dataLunga(d)}, ora ${ora(d)}</div>
            <div>📍 ${ev.locatie || 'Locație nestabilită'}</div>
            <div>🎟️ ${disp>0 ? disp+' locuri disponibile' : 'Epuizat'}</div>
        </div>
        <p class="detalii-descriere">${descriere}</p>
        <div class="detalii-footer">${pret}<button class="btn btn-fill" id="det-rezerva" ${disp<=0?'disabled':''} style="width:auto;padding:0.7rem 1.6rem;">${disp<=0?'Indisponibil':'Adaugă în coș'}</button></div>`;
    const btn = document.getElementById('det-rezerva');
    if (disp>0) btn.addEventListener('click', () => { modalDet.classList.add('ascuns'); adaugaInCos(ev.id); });
    modalDet.classList.remove('ascuns');
}

//Funcțiile coșului
const formatPret = n => (Number(n) === 0 ? 'Gratuit' : `${Number(n).toLocaleString('ro-RO')} lei`);
const esteInCos = id => cos.some(x => x.eveniment_id === id);
const totalCos = () => cos.reduce((s, x) => s + Number(x.pret) * x.nr_locuri, 0);
const nrBileteCos = () => cos.reduce((s, x) => s + x.nr_locuri, 0);

function salveazaCos() {
    localStorage.setItem('cos_entrada', JSON.stringify(cos));
    actualizeazaBadge();
}
function actualizeazaBadge() {
    const n = nrBileteCos();
    cosNr.textContent = n;
    cosNr.classList.toggle('ascuns', n === 0);
}

function adaugaInCos(id) {
    const ev = evenimenteCache.find(e => e.id === id);
    if (!ev) return;
    const linie = cos.find(x => x.eveniment_id === id);
    const inCos = linie ? linie.nr_locuri : 0;
    if (inCos + 1 > ev.locuri_disponibile) {
        toast('Nu mai sunt locuri disponibile pentru acest eveniment.', 'err');
        return;
    }
    if (linie) linie.nr_locuri += 1;
    else cos.push({ eveniment_id: id, titlu: ev.titlu, pret: Number(ev.pret), nr_locuri: 1 });
    salveazaCos();
    incarcaEvenimente(); // reactualizeaza eticheta butonului ("În coș ✓")
    toast(`„${ev.titlu}” a fost adăugat în coș.`, 'ok');
}

function schimbaCant(id, delta) {
    const linie = cos.find(x => x.eveniment_id === id);
    if (!linie) return;
    const ev = evenimenteCache.find(e => e.id === id);
    const max = ev ? ev.locuri_disponibile : linie.nr_locuri;
    const nou = linie.nr_locuri + delta;
    if (nou < 1) { scoateDinCos(id); return; }
    if (nou > max) { toast(`Mai sunt doar ${max} locuri disponibile.`, 'err'); return; }
    linie.nr_locuri = nou;
    salveazaCos();
    renderCos();
}

function scoateDinCos(id) {
    cos = cos.filter(x => x.eveniment_id !== id);
    salveazaCos();
    renderCos();
    incarcaEvenimente();
}

function aratapas(pas) {
    pasCos.classList.toggle('ascuns', pas !== 'cos');
    pasPlata.classList.toggle('ascuns', pas !== 'plata');
    pasGata.classList.toggle('ascuns', pas !== 'gata');
}

function renderCos() {
    const lista = document.getElementById('cos-lista');
    const rezumat = document.getElementById('cos-rezumat');
    if (!cos.length) {
        lista.innerHTML = '<p class="gol">Coșul este gol. Alege un eveniment din program.</p>';
        rezumat.classList.add('ascuns');
        return;
    }
    rezumat.classList.remove('ascuns');
    lista.innerHTML = '';
    cos.forEach(x => {
        const el = document.createElement('div');
        el.className = 'cos-articol';
        const subtotal = Number(x.pret) * x.nr_locuri;
        el.innerHTML = `
            <div class="cos-art-info">
                <div class="cos-art-titlu">${x.titlu}</div>
                <div class="cos-art-pret">${formatPret(x.pret)} × ${x.nr_locuri} = ${formatPret(subtotal)}</div>
            </div>
            <div class="cos-cant">
                <button type="button" class="c-minus">−</button>
                <span>${x.nr_locuri}</span>
                <button type="button" class="c-plus">+</button>
            </div>
            <button type="button" class="cos-art-sterge" aria-label="Elimină">&times;</button>`;
        el.querySelector('.c-minus').addEventListener('click', () => schimbaCant(x.eveniment_id, -1));
        el.querySelector('.c-plus').addEventListener('click', () => schimbaCant(x.eveniment_id, +1));
        el.querySelector('.cos-art-sterge').addEventListener('click', () => scoateDinCos(x.eveniment_id));
        lista.appendChild(el);
    });
    document.getElementById('cos-total').textContent = formatPret(totalCos());
}

// Coș -> pasul de plată
document.getElementById('btn-spre-plata').addEventListener('click', () => {
    if (!cos.length) return;
    if (!token) { modalCos.classList.add('ascuns'); modal.classList.remove('ascuns'); toast('Autentifică-te pentru a finaliza plata.'); return; }
    const total = totalCos();
    document.getElementById('plata-suma').textContent = total > 0 ? formatPret(total) : '';
    // Pre-completare nume din cont, daca exista.
    const fNume = document.getElementById('fact-nume');
    if (!fNume.value && numeUtilizator) fNume.value = numeUtilizator;
    document.getElementById('mesaj-plata').textContent = '';
    aratapas('plata');
});

// Formatare prietenoasa la introducerea cardului
document.getElementById('card-numar').addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
});
document.getElementById('card-exp').addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
    e.target.value = v;
});
document.getElementById('card-cvv').addEventListener('input', e => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
});

// Trimiterea plății
document.getElementById('cos-pas-plata').addEventListener('submit', async e => {
    e.preventDefault();
    if (cerereInCurs) return;
    const m = document.getElementById('mesaj-plata'); m.textContent = ''; m.className = 'mesaj';
    const btn = document.getElementById('btn-plateste');

    const total = totalCos();
    const facturare = {
        nume: document.getElementById('fact-nume').value.trim(),
        email: document.getElementById('fact-email').value.trim(),
    };
    if (!facturare.nume || !facturare.email) {
        m.textContent = 'Completează numele și emailul de facturare.'; m.classList.add('eroare'); return;
    }
    const card = {
        numar: document.getElementById('card-numar').value,
        nume: document.getElementById('card-nume').value,
        exp: document.getElementById('card-exp').value,
        cvv: document.getElementById('card-cvv').value,
    };
    // Cardul este necesar doar daca exista ceva de platit.
    if (total > 0 && (!card.numar || !card.nume || !card.exp || !card.cvv)) {
        m.textContent = 'Completează toate datele cardului.'; m.classList.add('eroare'); return;
    }

    cerereInCurs = true;
    btn.disabled = true; const eticheta = btn.innerHTML; btn.textContent = 'Se procesează plata...';
    try {
        const r = await fetch(`${API}/plati/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                articole: cos.map(x => ({ eveniment_id: x.eveniment_id, nr_locuri: x.nr_locuri })),
                card, facturare,
            }),
        });
        const d = await r.json();
        if (r.ok) {
            // Golire cos si afisare confirmare cu codurile biletelor.
            const biletePlatite = cos.map((x, i) => ({ titlu: x.titlu, cod: d.bilete[i] ? d.bilete[i].cod_bilet : '' }));
            cos = []; salveazaCos();
            const gt = document.getElementById('gata-text');
            gt.textContent = d.comanda.total > 0
                ? `Comanda #${d.comanda.id} · ${formatPret(d.comanda.total)} achitați cu cardul ···· ${d.comanda.card_ultim4}.`
                : `Comanda #${d.comanda.id} · bilete gratuite confirmate.`;
            const cont = document.getElementById('gata-bilete');
            cont.innerHTML = '';
            biletePlatite.forEach(b => {
                const el = document.createElement('div');
                el.className = 'gata-bilet';
                el.innerHTML = `
                    <div class="gb-info"><span class="gb-titlu">${b.titlu}</span><span class="gb-cod">${b.cod}</span></div>
                    <img class="gb-qr" src="${qrSrc(b.cod)}" alt="Cod QR ${b.cod}" loading="lazy">`;
                cont.appendChild(el);
            });
            aratapas('gata');
            e.target.reset();
            await incarcaEvenimente();
            await incarcaRezervari();
        } else {
            m.textContent = d.eroare || 'Plata a eșuat.'; m.classList.add('eroare');
        }
    } catch { m.textContent = 'Serverul nu răspunde.'; m.classList.add('eroare'); }
    finally {
        cerereInCurs = false;
        btn.disabled = false; btn.innerHTML = eticheta;
    }
});

async function incarcaRezervari() {
    const c = document.getElementById('lista-rezervari');
    if (!token) return;
    try {
        const r = await fetch(`${API}/rezervari/mele`, { headers:{'Authorization':`Bearer ${token}`} });
        const rez = await r.json();
        if (!rez.length) {
            c.innerHTML='<p class="gol">Încă nu ai bilete. Alege un eveniment din program.</p>';
            btnAnuleazaTot.classList.add('ascuns');
            return;
        }
        btnAnuleazaTot.classList.remove('ascuns');
        c.innerHTML='';
        rez.forEach(x => {
            const d = new Date(x.data_eveniment);
            const el = document.createElement('div');
            el.className='bilet';
            el.innerHTML = `
                <div class="bilet-info">
                    <div class="b-titlu">${x.titlu}</div>
                    <div class="b-meta">${dataLunga(d)} · ${x.locatie||''} · ${x.nr_locuri} loc(uri)</div>
                    <div class="b-jos"><span class="b-cod">${x.cod_bilet}</span><button class="btn-anuleaza">Anulează</button></div>
                </div>
                <img class="bilet-qr" src="${qrSrc(x.cod_bilet)}" alt="Cod QR ${x.cod_bilet}" loading="lazy">`;
            el.querySelector('.btn-anuleaza').addEventListener('click', () => anuleaza(x.id, x.titlu));
            c.appendChild(el);
        });
    } catch { c.innerHTML='<p class="gol">Biletele nu s-au putut încărca.</p>'; }
}

async function anuleaza(id, titlu) {
    if (cerereInCurs) return;
    if (!confirm(`Anulezi biletul pentru „${titlu}”? Locul va fi eliberat.`)) return;
    cerereInCurs = true;
    try {
        const r = await fetch(`${API}/rezervari/${id}`, { method:'DELETE', headers:{'Authorization':`Bearer ${token}`} });
        const d = await r.json();
        if (r.ok) { toast('Bilet anulat. Locul a fost eliberat.','ok'); }
        else { toast(d.eroare || 'Anularea a eșuat.','err'); }
    } catch { toast('Serverul nu răspunde.','err'); }
    finally {
        cerereInCurs = false;
        await incarcaEvenimente();
        await incarcaRezervari();
    }
}

btnAnuleazaTot.addEventListener('click', async () => {
    if (cerereInCurs) return;
    if (!confirm('Anulezi toate biletele? Toate locurile vor fi eliberate.')) return;
    cerereInCurs = true;
    try {
        const r = await fetch(`${API}/rezervari/mele`, { headers:{'Authorization':`Bearer ${token}`} });
        const rez = await r.json();
        for (const x of rez) {
            await fetch(`${API}/rezervari/${x.id}`, { method:'DELETE', headers:{'Authorization':`Bearer ${token}`} });
        }
        toast('Toate biletele au fost anulate.','ok');
    } catch { toast('Serverul nu răspunde.','err'); }
    finally {
        cerereInCurs = false;
        await incarcaEvenimente();
        await incarcaRezervari();
    }
});

//Administrator
async function incarcaAdmin() {
    if (!esteAdmin) return;
    incarcaSumarAdmin();
    incarcaBileteAdmin();
    incarcaEvenimenteAdmin();
}

function arataPanouAdmin(nume) {
    document.querySelectorAll('.cont-tab[data-apanou]').forEach(t =>
        t.classList.toggle('activ', t.dataset.apanou === nume));
    document.querySelectorAll('.admin-panou').forEach(p =>
        p.classList.toggle('ascuns', p.dataset.apanou !== nume));
}
document.querySelectorAll('.cont-tab[data-apanou]').forEach(t => {
    t.addEventListener('click', () => arataPanouAdmin(t.dataset.apanou));
});

async function incarcaSumarAdmin() {
    const c = document.getElementById('admin-statistici');
    try {
        const r = await fetch(`${API}/admin/sumar`, { headers:{'Authorization':`Bearer ${token}`} });
        const s = await r.json();
        const carduri = [
            { val: `${Number(s.venit_total).toLocaleString('ro-RO')} lei`, et: 'Venit total' },
            { val: s.bilete_vandute, et: 'Bilete vândute' },
            { val: s.comenzi, et: 'Comenzi' },
            { val: s.evenimente, et: 'Evenimente' },
            { val: s.utilizatori, et: 'Utilizatori' },
        ];
        c.innerHTML = carduri.map(x => `<div class="admin-stat"><div class="as-val">${x.val}</div><div class="as-et">${x.et}</div></div>`).join('');
    } catch { c.innerHTML='<p class="gol">Statisticile nu s-au putut încărca.</p>'; }
}

async function incarcaBileteAdmin() {
    const c = document.getElementById('admin-bilete');
    try {
        const r = await fetch(`${API}/admin/rezervari`, { headers:{'Authorization':`Bearer ${token}`} });
        const bilete = await r.json();
        if (!bilete.length) { c.innerHTML='<p class="gol">Nu există bilete vândute.</p>'; return; }
        c.innerHTML='';
        bilete.forEach(b => {
            const d = new Date(b.data_eveniment);
            const el = document.createElement('div');
            el.className='admin-rand';
            el.innerHTML = `
                <div class="admin-rand-info">
                    <div class="admin-rand-titlu">${b.titlu} · <span class="admin-rand-cod">${b.cod_bilet}</span></div>
                    <div class="admin-rand-meta">${b.nume_utilizator} (${b.email_utilizator}) · ${b.nr_locuri} loc(uri) · ${dataLunga(d)}</div>
                </div>
                <div class="admin-actiuni">
                    <button class="btn-mic" data-act="edit">Modifică locuri</button>
                    <button class="btn-mic pericol" data-act="anuleaza">Anulează</button>
                </div>`;
            el.querySelector('[data-act="edit"]').addEventListener('click', () => modificaBiletAdmin(b.id, b.nr_locuri));
            el.querySelector('[data-act="anuleaza"]').addEventListener('click', () => anuleazaBiletAdmin(b.id, b.cod_bilet));
            c.appendChild(el);
        });
    } catch { c.innerHTML='<p class="gol">Biletele nu s-au putut încărca.</p>'; }
}

async function modificaBiletAdmin(id, nrCurent) {
    const intrare = prompt('Număr nou de locuri pentru acest bilet:', nrCurent);
    if (intrare === null) return;
    const nr = parseInt(intrare, 10);
    if (!Number.isInteger(nr) || nr < 1) { toast('Număr invalid.','err'); return; }
    try {
        const r = await fetch(`${API}/admin/rezervari/${id}`, {
            method:'PATCH', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
            body: JSON.stringify({ nr_locuri: nr })
        });
        const d = await r.json();
        if (r.ok) { toast('Bilet actualizat.','ok'); reincarcaTot(); }
        else { toast(d.eroare || 'Modificarea a eșuat.','err'); }
    } catch { toast('Serverul nu răspunde.','err'); }
}

async function anuleazaBiletAdmin(id, cod) {
    if (!confirm(`Anulezi biletul ${cod}? Locurile vor fi eliberate.`)) return;
    try {
        const r = await fetch(`${API}/admin/rezervari/${id}`, { method:'DELETE', headers:{'Authorization':`Bearer ${token}`} });
        const d = await r.json();
        if (r.ok) { toast('Bilet anulat.','ok'); reincarcaTot(); }
        else { toast(d.eroare || 'Anularea a eșuat.','err'); }
    } catch { toast('Serverul nu răspunde.','err'); }
}

async function incarcaEvenimenteAdmin() {
    const c = document.getElementById('admin-evenimente');
    try {
        // Refolosire cache de evenimente daca exista, altfel se incarca.
        const lista = evenimenteCache.length ? evenimenteCache : await (await fetch(`${API}/evenimente`)).json();
        if (!lista.length) { c.innerHTML='<p class="gol">Nu există evenimente.</p>'; return; }
        c.innerHTML='';
        lista.forEach(ev => {
            const d = new Date(ev.data_eveniment);
            const vandute = ev.locuri_totale - ev.locuri_disponibile;
            const el = document.createElement('div');
            el.className='admin-rand';
            el.innerHTML = `
                <div class="admin-rand-info">
                    <div class="admin-rand-titlu">${ev.titlu}</div>
                    <div class="admin-rand-meta">${dataLunga(d)} · ${ev.locatie||'—'} · ${vandute}/${ev.locuri_totale} locuri vândute · ${formatPret(ev.pret)}</div>
                </div>
                <div class="admin-actiuni">
                    <button class="btn-mic pericol" data-act="sterge">Șterge</button>
                </div>`;
            el.querySelector('[data-act="sterge"]').addEventListener('click', () => stergeEvenimentAdmin(ev.id, ev.titlu));
            c.appendChild(el);
        });
    } catch { c.innerHTML='<p class="gol">Evenimentele nu s-au putut încărca.</p>'; }
}

async function stergeEvenimentAdmin(id, titlu) {
    if (!confirm(`Ștergi evenimentul „${titlu}”?`)) return;
    try {
        const r = await fetch(`${API}/evenimente/${id}`, { method:'DELETE', headers:{'Authorization':`Bearer ${token}`} });
        const d = await r.json();
        if (r.ok) { toast('Eveniment șters.','ok'); reincarcaTot(); }
        else { toast(d.eroare || 'Ștergerea a eșuat.','err'); }
    } catch { toast('Serverul nu răspunde.','err'); }
}

// Creare eveniment (admin)
document.getElementById('form-eveniment').addEventListener('submit', async e => {
    e.preventDefault();
    const m = document.getElementById('mesaj-eveniment'); m.textContent=''; m.className='mesaj';
    try {
        const r = await fetch(`${API}/evenimente`, {
            method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
            body: JSON.stringify({
                titlu: document.getElementById('ev-titlu').value,
                locatie: document.getElementById('ev-locatie').value,
                data_eveniment: document.getElementById('ev-data').value,
                locuri_totale: parseInt(document.getElementById('ev-locuri').value, 10),
                pret: parseFloat(document.getElementById('ev-pret').value) || 0,
                descriere: document.getElementById('ev-descriere').value,
            })
        });
        const d = await r.json();
        if (r.ok) { m.textContent='Eveniment creat.'; m.classList.add('succes'); e.target.reset(); document.getElementById('ev-pret').value='0'; reincarcaTot(); }
        else { m.textContent = d.eroare || 'Crearea a eșuat.'; m.classList.add('eroare'); }
    } catch { m.textContent='Serverul nu răspunde.'; m.classList.add('eroare'); }
});

// Reincarca toate listele afectate dupa o actiune de admin.
async function reincarcaTot() {
    await incarcaEvenimente();
    incarcaRezervari();
    incarcaSalvate();
    if (esteAdmin) incarcaAdmin();
}

//Pagina de cont (Profil / Securitate / Comenzi / Favorite)
function populeazaCont() {
    if (!utilizatorCurent) return;
    const prenume = (utilizatorCurent.nume || '').split(' ')[0] || '?';
    document.getElementById('cont-avatar-mare').textContent = prenume.charAt(0).toUpperCase();
    document.getElementById('cont-nume-mare').textContent = utilizatorCurent.nume || '';
    document.getElementById('cont-email-mare').textContent = utilizatorCurent.email || '';
    document.getElementById('profil-nume').value = utilizatorCurent.nume || '';
    document.getElementById('profil-email').value = utilizatorCurent.email || '';
    arataPanouCont('profil');
}

function arataPanouCont(nume) {
    document.querySelectorAll('.cont-tab[data-panou]').forEach(t =>
        t.classList.toggle('activ', t.dataset.panou === nume));
    document.querySelectorAll('.cont-panou').forEach(p =>
        p.classList.toggle('ascuns', p.dataset.panou !== nume));
    if (nume === 'comenzi') incarcaComenziCont();
    if (nume === 'favorite') incarcaFavoriteCont();
}

document.querySelectorAll('.cont-tab[data-panou]').forEach(t => {
    t.addEventListener('click', () => arataPanouCont(t.dataset.panou));
});

// Actualizare profil (nume + email)
document.getElementById('form-profil').addEventListener('submit', async e => {
    e.preventDefault();
    const m = document.getElementById('mesaj-profil'); m.textContent=''; m.className='mesaj';
    try {
        const r = await fetch(`${API}/auth/profil`, {
            method:'PATCH', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
            body: JSON.stringify({
                nume: document.getElementById('profil-nume').value,
                email: document.getElementById('profil-email').value,
            })
        });
        const d = await r.json();
        if (r.ok) {
            // Emailul/rolul pot schimba token-ul: se actualizeaza cel curent.
            token = d.token; utilizatorCurent = d.utilizator;
            numeUtilizator = d.utilizator.nume; esteAdmin = !!d.utilizator.admin;
            salveazaSesiune();
            const prenume = numeUtilizator.split(' ')[0];
            document.getElementById('avatar-initiala').textContent = prenume.charAt(0).toUpperCase();
            document.getElementById('avatar-nume').textContent = prenume;
            populeazaCont();
            m.textContent='Profil actualizat.'; m.classList.add('succes');
        } else { m.textContent = d.eroare || 'Actualizarea a eșuat.'; m.classList.add('eroare'); }
    } catch { m.textContent='Serverul nu răspunde.'; m.classList.add('eroare'); }
});

// Schimbare parola
document.getElementById('form-parola').addEventListener('submit', async e => {
    e.preventDefault();
    const m = document.getElementById('mesaj-parola'); m.textContent=''; m.className='mesaj';
    const noua = document.getElementById('parola-noua').value;
    const confirm = document.getElementById('parola-confirm').value;
    if (noua !== confirm) { m.textContent='Parolele noi nu coincid.'; m.classList.add('eroare'); return; }
    try {
        const r = await fetch(`${API}/auth/parola`, {
            method:'PATCH', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
            body: JSON.stringify({
                parola_veche: document.getElementById('parola-veche').value,
                parola_noua: noua,
            })
        });
        const d = await r.json();
        if (r.ok) { m.textContent='Parola a fost schimbată.'; m.classList.add('succes'); e.target.reset(); }
        else { m.textContent = d.eroare || 'Schimbarea a eșuat.'; m.classList.add('eroare'); }
    } catch { m.textContent='Serverul nu răspunde.'; m.classList.add('eroare'); }
});

async function incarcaComenziCont() {
    const c = document.getElementById('cont-comenzi');
    c.innerHTML = '<p class="gol">Se încarcă...</p>';
    try {
        const r = await fetch(`${API}/plati/comenzile-mele`, { headers:{'Authorization':`Bearer ${token}`} });
        const comenzi = await r.json();
        if (!comenzi.length) { c.innerHTML='<p class="gol">Nu ai nicio comandă încă.</p>'; return; }
        c.innerHTML='';
        comenzi.forEach(co => {
            const d = new Date(co.creat_la);
            const stare = co.status === 'platita' ? 'plătită' : co.status;
            const card = co.card_ultim4 ? ` · card ···· ${co.card_ultim4}` : '';
            const el = document.createElement('div');
            el.className = 'cont-rand';
            el.innerHTML = `
                <div>
                    <div class="cont-rand-titlu">Comanda #${co.id}</div>
                    <div class="cont-rand-meta">${dataLunga(d)}${card}</div>
                </div>
                <div class="cont-rand-dreapta">
                    <div class="cont-rand-suma">${formatPret(co.total)}</div>
                    <span class="cont-stare cont-stare-${co.status}">${stare}</span>
                </div>`;
            c.appendChild(el);
        });
    } catch { c.innerHTML='<p class="gol">Comenzile nu s-au putut încărca.</p>'; }
}

async function incarcaFavoriteCont() {
    const c = document.getElementById('cont-favorite');
    c.innerHTML = '<p class="gol">Se încarcă...</p>';
    try {
        const r = await fetch(`${API}/favorite`, { headers:{'Authorization':`Bearer ${token}`} });
        const salvate = await r.json();
        if (!salvate.length) { c.innerHTML='<p class="gol">Nu ai evenimente salvate. Apasă „♡ Salvează” pe un eveniment.</p>'; return; }
        c.innerHTML='';
        salvate.forEach((ev,i) => c.appendChild(creeazaCardEveniment(ev, i)));
    } catch { c.innerHTML='<p class="gol">Favoritele nu s-au putut încărca.</p>'; }
}

// Deconectare din meniul de cont.
document.getElementById('cont-deconectare').addEventListener('click', () => {
    token = null;
    stergeSesiune();
    location.hash = '';
    location.reload();
});

// Navigare intre pagini
// Schimbare pagina afisata dupa hash-ul din URL (ex: #contact, #cont, #admin).
const vedereAcasa = document.getElementById('vedere-acasa');
const paginiInfo = document.querySelectorAll('.pagina-info');
const PAGINI_VALIDE = ['despre', 'contact', 'termeni', 'confidentialitate'];

function ruteaza(neted = true) {
    const nume = location.hash.replace(/^#\/?/, '');
    if (nume === 'cont') {
        // Pagina de cont cere autentificare.
        if (!token) { location.hash = ''; modal.classList.remove('ascuns'); return; }
        vedereAcasa.classList.add('ascuns');
        paginiInfo.forEach(p => p.classList.add('ascuns'));
        document.getElementById('pagina-cont').classList.remove('ascuns');
        populeazaCont();
    } else if (nume === 'admin') {
        // Pagina de administrare cere rol de admin.
        if (!token || !esteAdmin) { location.hash = ''; return; }
        vedereAcasa.classList.add('ascuns');
        paginiInfo.forEach(p => p.classList.add('ascuns'));
        document.getElementById('pagina-admin').classList.remove('ascuns');
        arataPanouAdmin('statistici');
        incarcaAdmin();
    } else if (PAGINI_VALIDE.includes(nume)) {
        vedereAcasa.classList.add('ascuns');
        paginiInfo.forEach(p => p.classList.add('ascuns'));
        document.getElementById('pagina-' + nume).classList.remove('ascuns');
    } else {
        // Orice altceva (gol, #, #evenimente) inseamna pagina de acasa.
        vedereAcasa.classList.remove('ascuns');
        paginiInfo.forEach(p => p.classList.add('ascuns'));
    }
    window.scrollTo({ top: 0, behavior: neted ? 'smooth' : 'auto' });
}

// Sesiune
// Login-ul e pastrat in localStorage ca sa nu se piarda la refresh.
function salveazaSesiune() {
    if (token && utilizatorCurent) {
        localStorage.setItem('sesiune_entrada', JSON.stringify({ token, utilizator: utilizatorCurent }));
    }
}
function stergeSesiune() {
    localStorage.removeItem('sesiune_entrada');
}
function tokenExpirat(t) {
    try {
        const payload = JSON.parse(atob(t.split('.')[1]));
        return !payload.exp || payload.exp * 1000 <= Date.now();
    } catch { return true; }
}
function restaureazaSesiune() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem('sesiune_entrada') || 'null'); } catch { s = null; }
    if (s && s.token && s.utilizator && !tokenExpirat(s.token)) {
        token = s.token;
        utilizatorCurent = s.utilizator;
        numeUtilizator = s.utilizator.nume;
        esteAdmin = !!s.utilizator.admin;
        dupaAutentificare();
        return true;
    }
    stergeSesiune();
    return false;
}

window.addEventListener('hashchange', () => ruteaza(true));

const eraLogat = restaureazaSesiune(); // reconecteaza utilizatorul daca exista o sesiune valida
ruteaza(false); // la incarcare, afisare pagina corecta fara scroll animat

actualizeazaBadge();
if (!eraLogat) incarcaEvenimente(); // daca e logat, dupaAutentificare a incarcat deja evenimentele