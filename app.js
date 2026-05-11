// ============================================================
// CORUJA PRESENTE · app.js
// Lê dados reais do Google Sheets e popula o mapa e
// as estatísticas automaticamente.
// ============================================================


// ============================================================
// CONFIGURAÇÃO
// ============================================================

const CONFIG = {

    // Token Mapbox
    mapboxToken: 'pk.eyJ1IjoidnBzOTA5MCIsImEiOiJjbW9zcTcxaGowMXlnMnNwcnVzbmU0Y2VnIn0.nhpXVRVOFPbGjy_zBmnV-w',

    // URL da planilha Google Sheets publicada como CSV
    sheetsURL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTgXkVwHtnAUHymxilLI8PLSIe8vqTC-sZHNNy5RpgGlCCUYku0DDYXyFxXI8OWKQWZNxnhA820PGyA/pub?output=csv',

    // Centro inicial do mapa (Rio das Ostras)
    mapCenter: [-41.944, -22.529],
    mapZoom:   11.2,

    // Cores por categoria
    cores: {
        'Acidente':               '#f59e0b',
        'Crime':                  '#ef4444',
        'Incêndio':               '#f97316',
        'Afogamento':             '#3b82f6',
        'Crimes contra mulheres': '#ec4899',
        'Acidentes naturais':     '#06b6d4',
        'Facções criminosas':     '#a855f7',
        'default':                '#94a3b8'
    }

};


// ============================================================
// ESTADO GLOBAL
// ============================================================

let todasOcorrencias = [];
let todosMarkers     = [];

// Valores EXATOS da coluna Categoria da planilha
// A comparação sempre usa .toLowerCase() dos dois lados
const categoriasAtivas = new Set([
    'acidente',
    'crime',
    'incêndio',
    'afogamento',
    'crimes contra mulheres',
    'acidentes naturais',
    'facções criminosas'
]);

let periodoAtivo = 'Tudo';


// ============================================================
// MAPA
// ============================================================

mapboxgl.accessToken = CONFIG.mapboxToken;

const map = new mapboxgl.Map({
    container: 'map',
    style:     'mapbox://styles/mapbox/dark-v11',
    center:    CONFIG.mapCenter,
    zoom:      CONFIG.mapZoom,
    pitch:     0,
    bearing:   0,
    antialias: true
});

map.addControl(new mapboxgl.NavigationControl(), 'top-right');

// Atualiza HUD enquanto o mapa move
map.on('move', () => {
    const c = map.getCenter();
    atualizarHUD(c.lat, c.lng, map.getZoom());
});


// ============================================================
// HUD
// ============================================================

function atualizarHUD(lat, lng, zoom) {
    const boxes = document.querySelectorAll('.hud-box');
    if (boxes[0]) boxes[0].textContent = 'LAT '  + lat.toFixed(3);
    if (boxes[1]) boxes[1].textContent = 'LNG '  + lng.toFixed(3);
    if (boxes[2]) boxes[2].textContent = 'ZOOM ' + zoom.toFixed(1);
}


// ============================================================
// CARREGAR DADOS DO GOOGLE SHEETS
// ============================================================

async function carregarDados() {

    try {

        console.log('Coruja Presente: carregando planilha...');

        const resposta = await fetch(CONFIG.sheetsURL);

        if (!resposta.ok) throw new Error('Falha ao acessar a planilha.');

        const csv = await resposta.text();

        todasOcorrencias = parseCSV(csv);

        console.log(`Coruja Presente: ${todasOcorrencias.length} registros carregados.`);

        criarMarkers(todasOcorrencias);
        atualizarEstatisticas(todasOcorrencias);
        atualizarContadoresCategorias(todasOcorrencias);

    } catch (erro) {

        console.error('Erro ao carregar dados:', erro);

    }

}


// ============================================================
// PARSE CSV → ARRAY DE OBJETOS
// ============================================================

function parseCSV(texto) {

    const linhas    = texto.trim().split('\n');
    if (linhas.length < 2) return [];

    const cabecalho = linhas[0]
        .split(',')
        .map(c => c.trim().replace(/"/g, ''));

    const dados = [];

    for (let i = 1; i < linhas.length; i++) {

        const valores = splitCSVLinha(linhas[i]);
        if (valores.length < 2) continue;

        const obj = {};
        cabecalho.forEach((chave, idx) => {
            obj[chave] = (valores[idx] || '').trim().replace(/"/g, '');
        });

        obj.Latitude       = parseFloat(obj.Latitude)       || 0;
        obj.Longitude      = parseFloat(obj.Longitude)      || 0;
        obj.VitimasFeridas = parseInt(obj.VitimasFeridas)   || 0;
        obj.VitimasMortas  = parseInt(obj.VitimasMortas)    || 0;

        // Ignora linhas sem coordenadas
        if (obj.Latitude === 0 && obj.Longitude === 0) continue;

        dados.push(obj);

    }

    return dados;

}


// ============================================================
// SPLIT DE LINHA CSV (respeita campos com vírgula entre aspas)
// ============================================================

function splitCSVLinha(linha) {

    const resultado  = [];
    let   atual      = '';
    let   dentroAspas = false;

    for (const char of linha) {
        if (char === '"') {
            dentroAspas = !dentroAspas;
        } else if (char === ',' && !dentroAspas) {
            resultado.push(atual);
            atual = '';
        } else {
            atual += char;
        }
    }

    resultado.push(atual);
    return resultado;

}


// ============================================================
// COR POR CATEGORIA
// ============================================================

function corPorCategoria(categoria) {
    return CONFIG.cores[categoria?.trim()] || CONFIG.cores['default'];
}


// ============================================================
// CRIAR MARKERS NO MAPA
// ============================================================

function criarMarkers(dados) {

    limparMarkers();

    dados.forEach(item => {

        const cor = corPorCategoria(item.Categoria);

        const popup = new mapboxgl.Popup({
            offset:      25,
            closeButton: false,
            maxWidth:    '290px'
        })
        .setHTML(`
            <div style="
                background:#0f1724;
                color:white;
                padding:16px;
                border-radius:12px;
                font-family:Inter,sans-serif;
                min-width:220px;
            ">
                <div style="font-size:10px;opacity:.6;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px;">
                    ${item.Tipo || item.TipoOcorrencia || item.Categoria || ''}
                </div>
                <div style="font-size:14px;font-weight:600;color:${cor};margin-bottom:12px;line-height:1.3;">
                    ${item.Descricao || item.Categoria || 'Ocorrência'}
                </div>
                <div style="display:flex;flex-direction:column;gap:5px;font-size:12px;opacity:.85;">
                    ${item.Bairro    ? `<span>📍 ${item.Bairro}${item.Cidade ? ', ' + item.Cidade : ''}</span>`         : ''}
                    ${item.Data      ? `<span>📅 ${item.Data}${item.Hora ? ' às ' + item.Hora : ''}</span>`             : ''}
                    ${item.Gravidade ? `<span>⚠️ ${item.Gravidade}</span>`                                               : ''}
                    ${item.VitimasMortas  > 0 ? `<span style="color:#ef4444">☠ Mortes: ${item.VitimasMortas}</span>`   : ''}
                    ${item.VitimasFeridas > 0 ? `<span style="color:#f59e0b">🚑 Feridos: ${item.VitimasFeridas}</span>` : ''}
                    ${item.Fonte     ? `<span style="opacity:.5;font-size:10px;">Fonte: ${item.Fonte}</span>`            : ''}
                </div>
                ${item.Link ? `<a href="${item.Link}" target="_blank" style="display:inline-block;margin-top:10px;font-size:10px;color:${cor};opacity:.8;text-decoration:none;">Ver notícia →</a>` : ''}
            </div>
        `);

        const marker = new mapboxgl.Marker({ color: cor })
            .setLngLat([item.Longitude, item.Latitude])
            .setPopup(popup)
            .addTo(map);

        todosMarkers.push({
            marker,
            categoria: (item.Categoria || '').toLowerCase().trim(),
            data:       item.Data || '',
            dados:      item
        });

    });

}


// ============================================================
// LIMPAR MARKERS
// ============================================================

function limparMarkers() {
    todosMarkers.forEach(i => i.marker.remove());
    todosMarkers = [];
}


// ============================================================
// FILTRAR MARKERS
// Compara sempre em minúsculo dos dois lados para evitar
// problemas de maiúscula/minúscula entre planilha e código.
// ============================================================

function filtrarMarkers() {

    todosMarkers.forEach(item => {

        const el = item.marker.getElement();

        // item.categoria já está em minúsculo (gravado no criarMarkers)
        // categoriasAtivas também está em minúsculo
        const catAtiva = categoriasAtivas.has(item.categoria);

        const noPeriodo = verificarPeriodo(item.data, periodoAtivo);

        const mostrar = catAtiva && noPeriodo;

        el.style.display       = mostrar ? 'block' : 'none';
        el.style.opacity       = mostrar ? '1' : '0';
        el.style.pointerEvents = mostrar ? 'auto' : 'none';

    });

    // Recalcula estatísticas com markers visíveis
    const dadosVisiveis = todosMarkers
        .filter(i => i.marker.getElement().style.display !== 'none')
        .map(i => i.dados);

    atualizarEstatisticas(dadosVisiveis);

}


// ============================================================
// VERIFICAR PERÍODO
// ============================================================

function verificarPeriodo(dataStr, periodo) {

    if (periodo === 'Tudo' || !dataStr) return true;

    // Aceita DD/MM/AAAA ou AAAA-MM-DD
    let dataOcorrencia;
    const partes = dataStr.split('/');

    if (partes.length === 3) {
        dataOcorrencia = new Date(+partes[2], +partes[1] - 1, +partes[0]);
    } else {
        dataOcorrencia = new Date(dataStr);
    }

    if (isNaN(dataOcorrencia)) return true;

    const diffDias = (new Date() - dataOcorrencia) / 86400000;

    if (periodo === '24h') return diffDias <= 1;
    if (periodo === '7d')  return diffDias <= 7;
    if (periodo === '30d') return diffDias <= 30;
    if (periodo === '3m')  return diffDias <= 90;
    if (periodo === '1a')  return diffDias <= 365;

    return true;

}


// ============================================================
// ATUALIZAR ESTATÍSTICAS DA SIDEBAR DIREITA
// ============================================================

function atualizarEstatisticas(dados) {

    const total   = dados.length;
    const mortes  = dados.reduce((a, d) => a + d.VitimasMortas,  0);
    const feridos = dados.reduce((a, d) => a + d.VitimasFeridas, 0);

    // Categoria dominante
    const contCat = {};
    dados.forEach(d => {
        const c = d.Categoria || 'Desconhecido';
        contCat[c] = (contCat[c] || 0) + 1;
    });
    const catDom = Object.entries(contCat).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    // Top 3 bairros
    const contBairro = {};
    dados.forEach(d => {
        if (d.Bairro) contBairro[d.Bairro] = (contBairro[d.Bairro] || 0) + 1;
    });
    const topBairros = Object.entries(contBairro)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    // Atualiza elementos
    definirStat('stat-total',    total);
    definirStat('stat-mortes',   mortes);
    definirStat('stat-feridos',  feridos);
    definirStat('stat-categoria', catDom);

    const ulBairros = document.getElementById('stat-bairros');
    if (ulBairros) {
        ulBairros.innerHTML = topBairros
            .map(([b, n]) => `<li>${b} — ${n}</li>`)
            .join('');
    }

}


// ============================================================
// DEFINIR ELEMENTO DE STAT POR ID
// ============================================================

function definirStat(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
}


// ============================================================
// ATUALIZAR BADGES DE CONTAGEM NAS CATEGORIAS
// ============================================================

function atualizarContadoresCategorias(dados) {

    // Conta por categoria em minúsculo
    const contagem = {};
    dados.forEach(d => {
        const cat = (d.Categoria || '').toLowerCase().trim();
        contagem[cat] = (contagem[cat] || 0) + 1;
    });

    console.log('Categorias na planilha:', contagem);

    document.querySelectorAll('.category-card').forEach(card => {

        const titulo = card.querySelector('h3')?.textContent?.toLowerCase()?.trim() || '';
        const badge  = card.querySelector('.category-badge');
        if (!badge) return;

        // Usa o MAPA_CATEGORIAS para somar corretamente
        const cats  = getCatsDoCard(titulo);
        const total = cats.reduce((acc, cat) => acc + (contagem[cat] || 0), 0);

        badge.textContent = total > 0 ? total : '—';

    });

}


// ============================================================
// MAPEAMENTO: título do card → categoria exata da planilha
// Chave   = texto do h3 em minúsculo (nome do card na sidebar)
// Valor   = valores da coluna Categoria em minúsculo
//
// Planilha usa: Acidente, Crime, Incêndio, Afogamento
// ============================================================

const MAPA_CATEGORIAS = {
    'crimes':                 ['crime'],
    'acidentes':              ['acidente'],
    'incêndios':              ['incêndio'],
    'crimes contra mulheres': ['crimes contra mulheres'],
    'acidentes naturais':     ['acidentes naturais', 'afogamento'],
    'facções criminosas':     ['facções criminosas'],
};

function getCatsDoCard(tituloCard) {
    return MAPA_CATEGORIAS[tituloCard] || [tituloCard];
}


// ============================================================
// FILTROS — CATEGORIAS (clique nos cards)
// ============================================================

document.querySelectorAll('.category-card').forEach(card => {

    const top = card.querySelector('.category-top');
    if (!top) return;

    top.addEventListener('click', () => {

        card.classList.toggle('active');

        const titulo = card.querySelector('h3')
            ?.textContent?.toLowerCase()?.trim() || '';

        const cats = getCatsDoCard(titulo);

        if (card.classList.contains('active')) {
            cats.forEach(c => categoriasAtivas.add(c));
            card.querySelectorAll('.subcategory-item')
                .forEach(sub => sub.classList.add('active'));
        } else {
            cats.forEach(c => categoriasAtivas.delete(c));
            card.querySelectorAll('.subcategory-item')
                .forEach(sub => sub.classList.remove('active'));
        }

        filtrarMarkers();

    });

    card.addEventListener('mouseenter', () => card.style.transform = 'translateY(-2px)');
    card.addEventListener('mouseleave', () => card.style.transform = '');

});

// ============================================================
// FILTROS — SUBCATEGORIAS (clique nos subitens)
// ============================================================

document.querySelectorAll('.subcategory-item').forEach(item => {

    item.addEventListener('click', e => {

        e.stopPropagation();

        item.classList.toggle('active');

        const card      = item.closest('.category-card');
        const todasSubs = card?.querySelectorAll('.subcategory-item');
        const algumaAtiva = [...(todasSubs || [])].some(s => s.classList.contains('active'));

        const titulo = card?.querySelector('h3')?.textContent?.toLowerCase()?.trim() || '';
        const cats   = getCatsDoCard(titulo);

        if (!algumaAtiva && card) {
            card.classList.remove('active');
            cats.forEach(c => categoriasAtivas.delete(c));
        } else if (card && !card.classList.contains('active')) {
            card.classList.add('active');
            cats.forEach(c => categoriasAtivas.add(c));
        }

        filtrarMarkers();

    });

});


// ============================================================
// FILTROS — PERÍODO
// ============================================================

document.querySelectorAll('.period-button').forEach(btn => {

    btn.addEventListener('click', () => {

        document.querySelectorAll('.period-button')
            .forEach(b => b.classList.remove('active'));

        btn.classList.add('active');
        periodoAtivo = btn.textContent.trim();

        filtrarMarkers();

    });

});


// ============================================================
// SEARCH BOX
// ============================================================

const searchInput = document.querySelector('.search-box input');

if (searchInput) {

    // Enter → voa para a localização encontrada
    searchInput.addEventListener('keydown', e => {

        if (e.key !== 'Enter') return;

        const valor = searchInput.value.toLowerCase().trim();
        if (!valor) return;

        const encontrado = todasOcorrencias.find(d =>
            (d.Cidade  || '').toLowerCase().includes(valor) ||
            (d.Bairro  || '').toLowerCase().includes(valor) ||
            (d.Estado  || '').toLowerCase().includes(valor)
        );

        if (encontrado?.Latitude && encontrado?.Longitude) {
            map.flyTo({ center: [encontrado.Longitude, encontrado.Latitude], zoom: 12, speed: 0.9 });
        } else if (valor.includes('ostras') || valor.includes('rio das')) {
            map.flyTo({ center: [-41.944, -22.529], zoom: 11.5, speed: 0.9 });
        } else if (valor.includes('macaé') || valor.includes('macae')) {
            map.flyTo({ center: [-41.785, -22.371], zoom: 11,   speed: 0.9 });
        }

    });

    // Digitando → filtra markers em tempo real
    searchInput.addEventListener('input', () => {

        const valor = searchInput.value.toLowerCase().trim();

        if (!valor) {
            filtrarMarkers();
            return;
        }

        todosMarkers.forEach(item => {
            const d  = item.dados;
            const el = item.marker.getElement();

            const bate =
                (d.Bairro         || '').toLowerCase().includes(valor) ||
                (d.Cidade         || '').toLowerCase().includes(valor) ||
                (d.Categoria      || '').toLowerCase().includes(valor) ||
                (d.Tipo           || '').toLowerCase().includes(valor) ||
                (d.Descricao      || '').toLowerCase().includes(valor) ||
                (d.TipoOcorrencia || '').toLowerCase().includes(valor);

            el.style.display = bate ? 'block' : 'none';
        });

    });

}


// ============================================================
// BOTÕES DE NAVEGAÇÃO SUPERIORES
// ============================================================

document.querySelectorAll('.nav-button').forEach(btn => {

    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });

});


// ============================================================
// INICIALIZAÇÃO — aguarda mapa carregar
// ============================================================

map.on('load', () => {

    console.log('Coruja Presente: mapa pronto.');

    map.setFog({
        color:            'rgb(10, 10, 18)',
        'high-color':     'rgb(36, 92, 223)',
        'space-color':    'rgb(4, 6, 12)',
        'star-intensity':  0.15
    });

    carregarDados();

});

console.log('Coruja Presente: app.js carregado.');
