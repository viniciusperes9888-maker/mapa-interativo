// ========================================
// CORUJA PRESENTE
// APP.JS
// ========================================

// ========================================
// MAPBOX TOKEN
// ========================================

mapboxgl.accessToken = 'COLE_SEU_TOKEN_MAPBOX_AQUI';

// ========================================
// MAPA
// ========================================

const map = new mapboxgl.Map({
    container: 'map',

    style: 'mapbox://styles/mapbox/dark-v11',

    center: [-41.944, -22.529],

    zoom: 11.5,

    pitch: 0,

    bearing: 0,

    antialias: true
});

// ========================================
// CONTROLES
// ========================================

map.addControl(
    new mapboxgl.NavigationControl(),
    'top-right'
);

// ========================================
// LOADING
// ========================================

map.on('load', () => {

    console.log('Mapa carregado');

    const loading = document.getElementById('map-loading');

    if (loading) {
        loading.style.display = 'none';
    }

});

// ========================================
// MARKERS TESTE
// ========================================

const ocorrencias = [

    {
        categoria: 'crime',
        titulo: 'Roubo no Centro',
        bairro: 'Centro',
        coords: [-41.944, -22.529],
        cor: '#E05252'
    },

    {
        categoria: 'acidente',
        titulo: 'Colisão traseira',
        bairro: 'Operário',
        coords: [-41.923, -22.515],
        cor: '#D4853A'
    },

    {
        categoria: 'natureza',
        titulo: 'Afogamento',
        bairro: 'Costazul',
        coords: [-41.960, -22.540],
        cor: '#4B9FD4'
    },

    {
        categoria: 'crime',
        titulo: 'Tráfico monitorado',
        bairro: 'Nova Cidade',
        coords: [-41.931, -22.501],
        cor: '#E05252'
    }

];

// ========================================
// CRIAR MARKERS
// ========================================

ocorrencias.forEach(item => {

    const popup = new mapboxgl.Popup({
        offset: 25
    }).setHTML(`

        <div style="
            background:#0f1724;
            color:white;
            padding:10px;
            border-radius:12px;
            font-family:Arial;
            min-width:180px;
        ">

            <h3 style="
                margin:0 0 8px 0;
                color:${item.cor};
            ">
                ${item.titulo}
            </h3>

            <p style="margin:0;">
                Bairro: ${item.bairro}
            </p>

            <p style="
                margin-top:8px;
                opacity:0.7;
                font-size:12px;
            ">
                Categoria: ${item.categoria}
            </p>

        </div>

    `);

    new mapboxgl.Marker({
        color: item.cor
    })

    .setLngLat(item.coords)

    .setPopup(popup)

    .addTo(map);

});

// ========================================
// SIDEBARS
// ========================================

const leftSidebar = document.getElementById('sidebar-left');
const rightSidebar = document.getElementById('sidebar-right');

const leftToggle = document.getElementById('toggle-left');
const rightToggle = document.getElementById('toggle-right');

// ========================================
// TOGGLE ESQUERDA
// ========================================

if (leftToggle) {

    leftToggle.addEventListener('click', () => {

        leftSidebar.classList.toggle('collapsed');

    });

}

// ========================================
// TOGGLE DIREITA
// ========================================

if (rightToggle) {

    rightToggle.addEventListener('click', () => {

        rightSidebar.classList.toggle('collapsed');

    });

}

// ========================================
// MODAIS
// ========================================

const openButtons = document.querySelectorAll('[data-open-modal]');
const closeButtons = document.querySelectorAll('[data-close-modal]');

// ABRIR
openButtons.forEach(button => {

    button.addEventListener('click', () => {

        const modalId = button.dataset.openModal;

        const modal = document.getElementById(modalId);

        if (modal) {
            modal.classList.add('active');
        }

    });

});

// FECHAR
closeButtons.forEach(button => {

    button.addEventListener('click', () => {

        const modalId = button.dataset.closeModal;

        const modal = document.getElementById(modalId);

        if (modal) {
            modal.classList.remove('active');
        }

    });

});

// ========================================
// FECHAR CLICANDO FORA
// ========================================

document.querySelectorAll('.modal-backdrop').forEach(modal => {

    modal.addEventListener('click', (e) => {

        if (e.target === modal) {
            modal.classList.remove('active');
        }

    });

});

// ========================================
// RELÓGIO HUD
// ========================================

function atualizarHorario() {

    const agora = new Date();

    const hora = agora.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
    });

    const el = document.getElementById('map-updated');

    if (el) {
        el.textContent = hora;
    }

}

setInterval(atualizarHorario, 1000);

atualizarHorario();

console.log('Coruja Presente iniciado');