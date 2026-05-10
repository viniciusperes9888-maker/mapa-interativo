// ========================================
// CORUJA PRESENTE
// APP.JS
// ========================================

// ========================================
// TOKEN MAPBOX
// ========================================

mapboxgl.accessToken = 'pk.eyJ1IjoidnBzOTA5MCIsImEiOiJjbW9zcTcxaGowMXlnMnNwcnVzbmU0Y2VnIn0.nhpXVRVOFPbGjy_zBmnV-w';

// ========================================
// MAPA
// ========================================

const map = new mapboxgl.Map({

    container: 'map',

    style: 'mapbox://styles/mapbox/dark-v11',

    center: [-41.944, -22.529],

    zoom: 11.2,

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
// DADOS DAS OCORRÊNCIAS
// ========================================

const ocorrencias = [

    // ====================================
    // CRIMES
    // ====================================

    {
        categoria: 'crime',
        subcategoria: 'Roubo',
        titulo: 'Roubo a pedestre',
        bairro: 'Centro',
        mortes: 0,
        feridos: 1,
        coordenadas: [-41.944, -22.529],
        cor: '#ef4444'
    },

    {
        categoria: 'crime',
        subcategoria: 'Tráfico',
        titulo: 'Área monitorada pelo tráfico',
        bairro: 'Nova Cidade',
        mortes: 2,
        feridos: 0,
        coordenadas: [-41.931, -22.501],
        cor: '#ef4444'
    },

    {
        categoria: 'crime',
        subcategoria: 'Latrocínio',
        titulo: 'Latrocínio registrado',
        bairro: 'Operário',
        mortes: 1,
        feridos: 0,
        coordenadas: [-41.921, -22.513],
        cor: '#ef4444'
    },

    // ====================================
    // ACIDENTES
    // ====================================

    {
        categoria: 'acidente',
        subcategoria: 'Colisão',
        titulo: 'Colisão entre veículos',
        bairro: 'Costazul',
        mortes: 0,
        feridos: 3,
        coordenadas: [-41.960, -22.540],
        cor: '#f59e0b'
    },

    {
        categoria: 'acidente',
        subcategoria: 'Atropelamento',
        titulo: 'Atropelamento em cruzamento',
        bairro: 'Centro',
        mortes: 0,
        feridos: 1,
        coordenadas: [-41.948, -22.524],
        cor: '#f59e0b'
    },

    // ====================================
    // CRIMES CONTRA MULHERES
    // ====================================

    {
        categoria: 'mulheres',
        subcategoria: 'Violência doméstica',
        titulo: 'Ocorrência doméstica',
        bairro: 'Nova Esperança',
        mortes: 0,
        feridos: 1,
        coordenadas: [-41.952, -22.517],
        cor: '#ec4899'
    },

    // ====================================
    // NATUREZA
    // ====================================

    {
        categoria: 'natureza',
        subcategoria: 'Afogamento',
        titulo: 'Afogamento em praia',
        bairro: 'Praia do Bosque',
        mortes: 1,
        feridos: 0,
        coordenadas: [-41.972, -22.536],
        cor: '#3b82f6'
    },

    {
        categoria: 'natureza',
        subcategoria: 'Enchente',
        titulo: 'Alagamento urbano',
        bairro: 'Cidade Praiana',
        mortes: 0,
        feridos: 2,
        coordenadas: [-41.936, -22.548],
        cor: '#3b82f6'
    }

];

// ========================================
// ARRAY DE MARKERS
// ========================================

const markers = [];

// ========================================
// CRIAR MARKERS
// ========================================

function criarMarkers() {

    ocorrencias.forEach(item => {

        // POPUP
        const popup = new mapboxgl.Popup({

            offset: 25,

            closeButton: false

        })

        .setHTML(`

            <div style="
                background:#0f1724;
                color:white;
                padding:14px;
                border-radius:16px;
                min-width:220px;
                font-family:Inter,sans-serif;
            ">

                <div style="
                    font-size:12px;
                    opacity:0.7;
                    margin-bottom:8px;
                    text-transform:uppercase;
                ">
                    ${item.subcategoria}
                </div>

                <h3 style="
                    margin-bottom:12px;
                    color:${item.cor};
                    font-size:18px;
                ">
                    ${item.titulo}
                </h3>

                <div style="
                    display:flex;
                    flex-direction:column;
                    gap:6px;
                    font-size:14px;
                ">

                    <span>
                        📍 ${item.bairro}
                    </span>

                    <span>
                        ☠ Mortes: ${item.mortes}
                    </span>

                    <span>
                        🚑 Feridos: ${item.feridos}
                    </span>

                </div>

            </div>

        `);

        // MARKER
        const marker = new mapboxgl.Marker({

            color: item.cor

        })

        .setLngLat(item.coordenadas)

        .setPopup(popup)

        .addTo(map);

        // SALVAR
        markers.push({

            categoria: item.categoria,

            marker

        });

    });

}

// ========================================
// CRIAR MARKERS
// ========================================

map.on('load', () => {

    criarMarkers();

});

// ========================================
// FILTROS
// ========================================

const categoryCards = document.querySelectorAll('.category-card');

// ========================================
// FILTRO CLICK
// ========================================

categoryCards.forEach((card, index) => {

    card.addEventListener('click', () => {

        // TOGGLE VISUAL
        card.classList.toggle('active');

        atualizarFiltros();

    });

});

// ========================================
// ATUALIZAR FILTROS
// ========================================

function atualizarFiltros() {

    const ativos = [];

    // PEGAR ATIVOS
    categoryCards.forEach(card => {

        if (card.classList.contains('active')) {

            const titulo = card.querySelector('h3')
                .innerText
                .toLowerCase();

            ativos.push(titulo);

        }

    });

    // MOSTRAR / ESCONDER
    markers.forEach(item => {

        const el = item.marker.getElement();

        if (

            ativos.includes('crimes') &&
            item.categoria === 'crime'

        ) {

            el.style.display = 'block';

        }

        else if (

            ativos.includes('acidentes') &&
            item.categoria === 'acidente'

        ) {

            el.style.display = 'block';

        }

        else if (

            ativos.includes('crimes contra mulheres') &&
            item.categoria === 'mulheres'

        ) {

            el.style.display = 'block';

        }

        else if (

            ativos.includes('acidentes naturais') &&
            item.categoria === 'natureza'

        ) {

            el.style.display = 'block';

        }

        else {

            el.style.display = 'none';

        }

    });

}

// ========================================
// SEARCH BOX
// ========================================

const searchInput = document.querySelector('.search-box input');

// ========================================
// BUSCAR CIDADE
// ========================================

searchInput.addEventListener('keydown', (e) => {

    if (e.key === 'Enter') {

        const cidade = searchInput.value.toLowerCase();

        // RIO DAS OSTRAS
        if (

            cidade.includes('rio') ||
            cidade.includes('ostras')

        ) {

            map.flyTo({

                center: [-41.944, -22.529],

                zoom: 11.5,

                speed: 0.8

            });

        }

        // MACAÉ
        if (

            cidade.includes('macae') ||
            cidade.includes('macaé')

        ) {

            map.flyTo({

                center: [-41.785, -22.371],

                zoom: 11,

                speed: 0.8

            });

        }

    }

});

// ========================================
// BOTÕES SUPERIORES
// ========================================

const navButtons = document.querySelectorAll('.nav-button');

navButtons.forEach(button => {

    button.addEventListener('click', () => {

        navButtons.forEach(btn => {

            btn.classList.remove('active');

        });

        button.classList.add('active');

    });

});

// ========================================
// DEBUG
// ========================================

console.log('Coruja Presente iniciado com sucesso');

// ========================================
// FILTROS INTERATIVOS AVANÇADOS
// COLE NO FINAL DO APP.JS
// ========================================

// ========================================
// BOTÕES DE PERÍODO
// ========================================

const periodButtons = document.querySelectorAll('.period-button');

// ========================================
// CLICK PERÍODO
// ========================================

periodButtons.forEach(button => {

    button.addEventListener('click', () => {

        // REMOVER ACTIVE
        periodButtons.forEach(btn => {

            btn.classList.remove('active');

        });

        // ADICIONAR ACTIVE
        button.classList.add('active');

        // DEBUG
        console.log(
            'Período selecionado:',
            button.innerText
        );

    });

});

// ========================================
// SUBCATEGORIAS
// ========================================

const subItems = document.querySelectorAll('.subcategory-item');

// ========================================
// CLICK SUBCATEGORIA
// ========================================

subItems.forEach(item => {

    item.addEventListener('click', (e) => {

        // EVITAR PROPAGAÇÃO
        e.stopPropagation();

        // TOGGLE
        item.classList.toggle('selected');

        // VISUAL
        if (item.classList.contains('selected')) {

            item.style.background =
                'rgba(59,130,246,0.12)';

            item.style.border =
                '1px solid rgba(59,130,246,0.22)';

        }

        else {

            item.style.background = '';

            item.style.border = '';

        }

        // PEGAR TEXTO
        const texto =
            item.querySelector('span').innerText;

        console.log(
            'Subcategoria:',
            texto
        );

    });

});

// ========================================
// EXPANDIR / RECOLHER
// ========================================

categoryCards.forEach(card => {

    const top = card.querySelector('.category-top');

    if (!top) return;

    top.addEventListener('click', () => {

        card.classList.toggle('active');

    });

});

// ========================================
// EFEITO CHECKBOX
// ========================================

categoryCards.forEach(card => {

    card.addEventListener('mouseenter', () => {

        card.style.transform = 'translateY(-2px)';

    });

    card.addEventListener('mouseleave', () => {

        card.style.transform = '';

    });

});

// ========================================
// FILTRO REAL DE MARKERS
// ========================================

function atualizarMarkers() {

    // PEGAR CATEGORIAS ATIVAS
    const ativos = [];

    categoryCards.forEach(card => {

        if (card.classList.contains('active')) {

            const titulo = card
                .querySelector('h3')
                .innerText
                .toLowerCase();

            ativos.push(titulo);

        }

    });

    // LOOP MARKERS
    markers.forEach(item => {

        const el =
            item.marker.getElement();

        let mostrar = false;

        // CRIMES
        if (

            ativos.includes('crimes') &&
            item.categoria === 'crime'

        ) {

            mostrar = true;

        }

        // ACIDENTES
        if (

            ativos.includes('acidentes') &&
            item.categoria === 'acidente'

        ) {

            mostrar = true;

        }

        // MULHERES
        if (

            ativos.includes('crimes contra mulheres') &&
            item.categoria === 'mulheres'

        ) {

            mostrar = true;

        }

        // NATUREZA
        if (

            ativos.includes('acidentes naturais') &&
            item.categoria === 'natureza'

        ) {

            mostrar = true;

        }

        // MOSTRAR / ESCONDER
        el.style.display =
            mostrar ? 'block' : 'none';

    });

}

// ========================================
// ATUALIZAR AO CLICAR
// ========================================

categoryCards.forEach(card => {

    card.addEventListener('click', () => {

        atualizarMarkers();

    });

});

// ========================================
// ESTATÍSTICAS DINÂMICAS
// ========================================

function atualizarEstatisticas() {

    let total = 0;

    let mortes = 0;

    let feridos = 0;

    markers.forEach(item => {

        const el =
            item.marker.getElement();

        if (el.style.display !== 'none') {

            total++;

        }

    });

    ocorrencias.forEach(item => {

        mortes += item.mortes;

        feridos += item.feridos;

    });

    // TOTAL
    const totalCard =
        document.querySelector(
            '.stats-card strong'
        );

    if (totalCard) {

        totalCard.innerText = total;

    }

}

// ========================================
// CHAMAR ESTATÍSTICAS
// ========================================

categoryCards.forEach(card => {

    card.addEventListener('click', () => {

        atualizarEstatisticas();

    });

});

// ========================================
// SEARCH AVANÇADA
// ========================================

searchInput.addEventListener('input', () => {

    const valor =
        searchInput.value.toLowerCase();

    markers.forEach((item, index) => {

        const dados =
            ocorrencias[index];

        const el =
            item.marker.getElement();

        const encontrou =

            dados.titulo
                .toLowerCase()
                .includes(valor)

            ||

            dados.bairro
                .toLowerCase()
                .includes(valor)

            ||

            dados.subcategoria
                .toLowerCase()
                .includes(valor);

        el.style.display =
            encontrou ? 'block' : 'none';

    });

});

// ========================================
// EFEITO MAPA
// ========================================

map.on('load', () => {

    map.setFog({

        color: 'rgb(10,10,18)',

        'high-color': 'rgb(36,92,223)',

        'space-color': 'rgb(4,6,12)',

        'star-intensity': 0.2

    });

});

// ========================================
// MENSAGEM SISTEMA
// ========================================

console.log(
    'Filtros avançados ativados'
);