// ========================================
// CORUJA PRESENTE
// APP.JS
// ========================================

// ========================================
// TOKEN MAPBOX
// ========================================

mapboxgl.accessToken = 'pk.eyJ1IjoidnBzOTA5MCIsImEiOiJjbW9zcTcxaGowMXlnMnNwcnVzbmU0Y2VnIn0.nhpXVRVOFPbGjy_zBmnV-w';

// ========================================
// INICIAR MAPA
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
// REMOVER LOADING
// ========================================

map.on('load', () => {

    console.log('Mapa carregado com sucesso');

    const loading = document.getElementById('map-loading');

    if (loading) {
        loading.style.display = 'none';
    }

});

// ========================================
// DADOS TESTE
// ========================================

const ocorrencias = [

    {
        categoria: 'crime',
        titulo: 'Roubo no Centro',
        bairro: 'Centro',
        coords: [-41.944, -22.529],
        cor: '#ff5a5a'
    },

    {
        categoria: 'acidente',
        titulo: 'Colisão traseira',
        bairro: 'Operário',
        coords: [-41.923, -22.515],
        cor: '#ffb347'
    },

    {
        categoria: 'natureza',
        titulo: 'Afogamento',
        bairro: 'Costazul',
        coords: [-41.960, -22.540],
        cor: '#5aa9ff'
    },

    {
        categoria: 'crime',
        titulo: 'Tráfico monitorado',
        bairro: 'Nova Cidade',
        coords: [-41.931, -22.501],
        cor: '#ff5a5a'
    }

];

// ========================================
// ADICIONAR MARKERS
// ========================================

ocorrencias.forEach(item => {

    const popup = new mapboxgl.Popup({
        offset: 25
    })

    .setHTML(`

        <div style="
            background:#0f1724;
            color:white;
            padding:12px;
            border-radius:12px;
            min-width:180px;
            font-family:Arial;
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

// FECHAR AO CLICAR FORA
document.querySelectorAll('.modal-backdrop').forEach(modal => {

    modal.addEventListener('click', (e) => {

        if (e.target === modal) {
            modal.classList.remove('active');
        }

    });

});

// ========================================
// HORÁRIO HUD
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

// ========================================
// DEBUG
// ========================================

console.log('Coruja Presente iniciado com sucesso');