// ════════════════════════════════════════════════════════════
// CORUJA PRESENTE · app.js v3.0
// Funcionalidades:
//   ✓ Leitura Google Sheets
//   ✓ Markers com popup
//   ✓ Filtros categoria + período
//   ✓ Mapa de calor (heatmap)
//   ✓ Linha do tempo animada
//   ✓ Alertas de cluster automáticos
//   ✓ Comparativo entre cidades
//   ✓ Modo satélite
//   ✓ Compartilhar filtro por link
// ════════════════════════════════════════════════════════════


// ════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ════════════════════════════════════════════════════════════

const CONFIG = {

    mapboxToken: 'pk.eyJ1IjoidnBzOTA5MCIsImEiOiJjbW9zcTcxaGowMXlnMnNwcnVzbmU0Y2VnIn0.nhpXVRVOFPbGjy_zBmnV-w',

    sheetsURL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTgXkVwHtnAUHymxilLI8PLSIe8vqTC-sZHNNy5RpgGlCCUYku0DDYXyFxXI8OWKQWZNxnhA820PGyA/pub?output=csv',

    mapCenter: [-41.785, -22.371],
    mapZoom:   12,

    cores: {
        'Crime':                  '#ef4444',
        'Acidente':               '#f59e0b',
        'Incêndio':               '#f97316',
        'Afogamento':             '#3b82f6',
        'Crimes contra mulheres': '#ec4899',
        'Acidentes naturais':     '#06b6d4',
        'Facções criminosas':     '#a855f7',
        'default':                '#94a3b8'
    },

    // Velocidade da animação da linha do tempo (ms por dia)
    timelineVelocidade: 600,

    // Alertas: mínimo de ocorrências num bairro em N dias
    alertaMinOcorrencias: 3,
    alertaJanelaDias:     2,

};


// ════════════════════════════════════════════════════════════
// ESTADO GLOBAL
// ════════════════════════════════════════════════════════════

let todasOcorrencias = [];
let todosMarkers     = [];

const categoriasAtivas = new Set([
    'crime', 'acidente', 'incêndio', 'afogamento',
    'crimes contra mulheres', 'acidentes naturais', 'facções criminosas'
]);

let periodoAtivo    = 'Tudo';
let modoVisualizacao = 'markers';  // 'markers' | 'heatmap'
let modoMapa        = 'dark';      // 'dark'    | 'satellite'

// Timeline
let timelineAtiva    = false;
let timelineTimer    = null;
let timelineDataAtual = null;
let timelineDatas    = [];
let timelineIndex    = 0;


// ════════════════════════════════════════════════════════════
// MAPA
// ════════════════════════════════════════════════════════════

mapboxgl.accessToken = CONFIG.mapboxToken;

const map = new mapboxgl.Map({
    container: 'map',
    style:     'mapbox://styles/mapbox/dark-v11',
    center:    CONFIG.mapCenter,
    zoom:      CONFIG.mapZoom,
    antialias: true
});

map.addControl(new mapboxgl.NavigationControl(), 'top-right');

map.on('move', () => {
    const c = map.getCenter();
    atualizarHUD(c.lat, c.lng, map.getZoom());
});


// ════════════════════════════════════════════════════════════
// HUD
// ════════════════════════════════════════════════════════════

function atualizarHUD(lat, lng, zoom) {
    const boxes = document.querySelectorAll('.hud-box');
    if (boxes[0]) boxes[0].textContent = 'LAT '  + lat.toFixed(3);
    if (boxes[1]) boxes[1].textContent = 'LNG '  + lng.toFixed(3);
    if (boxes[2]) boxes[2].textContent = 'ZOOM ' + zoom.toFixed(1);
}


// ════════════════════════════════════════════════════════════
// CARREGAR DADOS DO GOOGLE SHEETS
// ════════════════════════════════════════════════════════════

async function carregarDados() {

    try {

        const resposta = await fetch(CONFIG.sheetsURL);
        if (!resposta.ok) throw new Error('Falha ao acessar planilha.');

        const csv = await resposta.text();
        todasOcorrencias = parseCSV(csv);

        console.log(`Coruja Presente: ${todasOcorrencias.length} registros.`);

        // Cidade automática
        const cidades = {};
        todasOcorrencias.forEach(d => {
            if (d.Cidade) cidades[d.Cidade] = (cidades[d.Cidade] || 0) + 1;
        });
        const cidadePrincipal = Object.entries(cidades).sort((a,b)=>b[1]-a[1])[0]?.[0] || '';
        const estado = todasOcorrencias.find(d => d.Estado)?.Estado || '';

        const elLabel = document.getElementById('cidade-ativa-label');
        if (elLabel) elLabel.textContent = cidadePrincipal + (estado ? ', ' + estado : '');

        const elStat = document.querySelector('#stat-cidade');
        if (elStat) elStat.textContent = cidadePrincipal;

        // Prepara datas para timeline (ordenadas)
        timelineDatas = [...new Set(
            todasOcorrencias
                .map(d => d.Data)
                .filter(Boolean)
                .map(d => parseData(d))
                .filter(d => d)
                .map(d => d.toISOString().split('T')[0])
        )].sort();

        inicializarHeatmapLayer();
        criarMarkers(todasOcorrencias);
        atualizarContadoresCategorias(todasOcorrencias);
        filtrarMarkers();
        verificarAlertasCluster(todasOcorrencias);
        lerFiltrosDaURL();

    } catch (e) {
        console.error('Erro ao carregar dados:', e);
    }

}


// ════════════════════════════════════════════════════════════
// PARSE CSV
// ════════════════════════════════════════════════════════════

function parseCSV(texto) {

    const linhas    = texto.trim().split('\n');
    if (linhas.length < 2) return [];

    const cabecalho = linhas[0].split(',').map(c => c.trim().replace(/"/g, ''));
    const dados     = [];

    for (let i = 1; i < linhas.length; i++) {

        const valores = splitCSVLinha(linhas[i]);
        if (valores.length < 2) continue;

        const obj = {};
        cabecalho.forEach((k, idx) => {
            obj[k] = (valores[idx] || '').trim().replace(/"/g, '');
        });

        obj.Latitude       = parseFloat(obj.Latitude)     || 0;
        obj.Longitude      = parseFloat(obj.Longitude)    || 0;
        obj.VitimasFeridas = parseInt(obj.VitimasFeridas) || 0;
        obj.VitimasMortas  = parseInt(obj.VitimasMortas)  || 0;

        if (obj.Latitude === 0 && obj.Longitude === 0) continue;

        dados.push(obj);
    }

    return dados;
}

function splitCSVLinha(linha) {
    const res = [];
    let   cur = '';
    let   inQ = false;
    for (const c of linha) {
        if (c === '"')          inQ = !inQ;
        else if (c === ',' && !inQ) { res.push(cur); cur = ''; }
        else                    cur += c;
    }
    res.push(cur);
    return res;
}


// ════════════════════════════════════════════════════════════
// UTILITÁRIOS DE DATA
// ════════════════════════════════════════════════════════════

function parseData(dataStr) {
    if (!dataStr) return null;
    const p = dataStr.split('/');
    if (p.length === 3) return new Date(+p[2], +p[1]-1, +p[0]);
    const d = new Date(dataStr);
    return isNaN(d) ? null : d;
}

function dataParaISO(dataStr) {
    const d = parseData(dataStr);
    return d ? d.toISOString().split('T')[0] : '';
}


// ════════════════════════════════════════════════════════════
// COR POR CATEGORIA
// ════════════════════════════════════════════════════════════

function corPorCategoria(cat) {
    return CONFIG.cores[cat?.trim()] || CONFIG.cores['default'];
}


// ════════════════════════════════════════════════════════════
// CRIAR MARKERS
// ════════════════════════════════════════════════════════════

function criarMarkers(dados) {

    limparMarkers();

    dados.forEach(item => {

        const cor = corPorCategoria(item.Categoria);

        const popup = new mapboxgl.Popup({ offset: 25, closeButton: false, maxWidth: '290px' })
            .setHTML(`
                <div style="background:#0f1724;color:white;padding:16px;border-radius:12px;font-family:Inter,sans-serif;min-width:220px;">
                    <div style="font-size:10px;opacity:.6;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px;">
                        ${item.Tipo || item.Categoria || ''}
                    </div>
                    <div style="font-size:14px;font-weight:600;color:${cor};margin-bottom:12px;line-height:1.3;">
                        ${item.Descricao || item.Categoria || 'Ocorrência'}
                    </div>
                    <div style="display:flex;flex-direction:column;gap:5px;font-size:12px;opacity:.85;">
                        ${item.Bairro    ? `<span>📍 ${item.Bairro}${item.Cidade?', '+item.Cidade:''}</span>` : ''}
                        ${item.Data      ? `<span>📅 ${item.Data}${item.Hora?' às '+item.Hora:''}</span>`     : ''}
                        ${item.Gravidade ? `<span>⚠️ ${item.Gravidade}</span>`                                 : ''}
                        ${item.VitimasMortas  > 0 ? `<span style="color:#ef4444">☠ Mortes: ${item.VitimasMortas}</span>`   : ''}
                        ${item.VitimasFeridas > 0 ? `<span style="color:#f59e0b">🚑 Feridos: ${item.VitimasFeridas}</span>` : ''}
                        ${item.Fonte     ? `<span style="opacity:.5;font-size:10px;">Fonte: ${item.Fonte}</span>` : ''}
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
            categoria:  (item.Categoria || '').toLowerCase().trim(),
            data:        item.Data || '',
            dataISO:     dataParaISO(item.Data),
            dados:       item
        });

    });

}

function limparMarkers() {
    todosMarkers.forEach(i => i.marker.remove());
    todosMarkers = [];
}


// ════════════════════════════════════════════════════════════
// FILTRAR MARKERS
// ════════════════════════════════════════════════════════════

function filtrarMarkers(dataLimite = null) {

    todosMarkers.forEach(item => {

        const el = item.marker.getElement();

        const catAtiva  = categoriasAtivas.has(item.categoria);
        const noPeriodo = dataLimite
            ? (item.dataISO <= dataLimite)
            : verificarPeriodo(item.data, periodoAtivo);

        const mostrar = catAtiva && noPeriodo && modoVisualizacao === 'markers';

        el.style.display       = mostrar ? 'block' : 'none';
        el.style.opacity       = mostrar ? '1'     : '0';
        el.style.pointerEvents = mostrar ? 'auto'  : 'none';

    });

    const dadosVisiveis = todosMarkers
        .filter(i => i.marker.getElement().style.display !== 'none')
        .map(i => i.dados);

    atualizarEstatisticas(dadosVisiveis);

    if (modoVisualizacao === 'heatmap') atualizarHeatmap(dataLimite);

}

function verificarPeriodo(dataStr, periodo) {
    if (periodo === 'Tudo' || !dataStr) return true;
    const d = parseData(dataStr);
    if (!d) return true;
    const diff = (new Date() - d) / 86400000;
    if (periodo === '24h') return diff <= 1;
    if (periodo === '7d')  return diff <= 7;
    if (periodo === '30d') return diff <= 30;
    if (periodo === '3m')  return diff <= 90;
    if (periodo === '1a')  return diff <= 365;
    return true;
}


// ════════════════════════════════════════════════════════════
// ESTATÍSTICAS
// ════════════════════════════════════════════════════════════

function atualizarEstatisticas(dados) {

    const total   = dados.length;
    const mortes  = dados.reduce((a,d) => a + d.VitimasMortas,  0);
    const feridos = dados.reduce((a,d) => a + d.VitimasFeridas, 0);

    const contCat = {};
    dados.forEach(d => { const c = d.Categoria||'?'; contCat[c]=(contCat[c]||0)+1; });
    const catDom = Object.entries(contCat).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';

    const contB = {};
    dados.forEach(d => { if(d.Bairro) contB[d.Bairro]=(contB[d.Bairro]||0)+1; });
    const topB = Object.entries(contB).sort((a,b)=>b[1]-a[1]).slice(0,3);

    const s = id => document.getElementById(id);
    if (s('stat-total'))     s('stat-total').textContent     = total;
    if (s('stat-mortes'))    s('stat-mortes').textContent    = mortes;
    if (s('stat-feridos'))   s('stat-feridos').textContent   = feridos;
    if (s('stat-categoria')) s('stat-categoria').textContent = catDom;

    const ul = document.getElementById('stat-bairros');
    if (ul) ul.innerHTML = topB.map(([b,n]) => `<li>${b} — ${n}</li>`).join('') || '<li>—</li>';

}

function atualizarContadoresCategorias(dados) {

    const cont = {};
    dados.forEach(d => {
        const c = (d.Categoria||'').toLowerCase().trim();
        cont[c] = (cont[c]||0)+1;
    });

    document.querySelectorAll('.category-card').forEach(card => {
        const badge = card.querySelector('.category-badge');
        if (!badge) return;
        const cats  = getCatsDoCard(card.dataset.categoria || '');
        const total = cats.reduce((a,c) => a+(cont[c]||0), 0);
        badge.textContent = total > 0 ? total : '—';
    });

}


// ════════════════════════════════════════════════════════════
// MAPEAMENTO CATEGORIAS
// ════════════════════════════════════════════════════════════

const MAPA_CATEGORIAS = {
    'crimes':                 ['crime'],
    'acidentes':              ['acidente'],
    'incendios':              ['incêndio'],
    'crimes contra mulheres': ['crimes contra mulheres'],
    'acidentes naturais':     ['afogamento', 'acidentes naturais'],
    'faccoes criminosas':     ['facções criminosas'],
};

function getCatsDoCard(dataCategoria) {
    return MAPA_CATEGORIAS[(dataCategoria||'').toLowerCase().trim()] || [dataCategoria];
}


// ════════════════════════════════════════════════════════════
// FILTROS — CATEGORIAS (checkbox + botão +)
// ════════════════════════════════════════════════════════════

document.querySelectorAll('.category-card').forEach(card => {

    const checkbox      = card.querySelector('.category-checkbox');
    const expandBtn     = card.querySelector('.expand-btn');
    const subList       = card.querySelector('.subcategory-list');
    const dataCategoria = card.dataset.categoria || '';

    // Botão + expande/recolhe
    if (expandBtn && subList) {
        expandBtn.textContent = card.classList.contains('expanded') ? '−' : '+';
        expandBtn.addEventListener('click', e => {
            e.stopPropagation();
            expandBtn.textContent = card.classList.toggle('expanded') ? '−' : '+';
        });
    }

    // Checkbox ativa/desativa no mapa
    if (checkbox) {
        checkbox.addEventListener('click', e => {
            e.stopPropagation();
            const isActive = card.classList.toggle('active');
            const cats = getCatsDoCard(dataCategoria);
            if (isActive) {
                cats.forEach(c => categoriasAtivas.add(c));
                card.querySelectorAll('.subcategory-item').forEach(s => s.classList.add('active'));
            } else {
                cats.forEach(c => categoriasAtivas.delete(c));
                card.querySelectorAll('.subcategory-item').forEach(s => s.classList.remove('active'));
            }
            filtrarMarkers();
        });
    }

    card.addEventListener('mouseenter', () => card.style.transform = 'translateY(-2px)');
    card.addEventListener('mouseleave', () => card.style.transform = '');

});

document.querySelectorAll('.subcategory-item').forEach(item => {
    item.addEventListener('click', e => {
        e.stopPropagation();
        item.classList.toggle('active');
        const card  = item.closest('.category-card');
        const subs  = [...(card?.querySelectorAll('.subcategory-item')||[])];
        const algum = subs.some(s => s.classList.contains('active'));
        const cats  = getCatsDoCard(card?.dataset.categoria||'');
        if (!algum) { card?.classList.remove('active'); cats.forEach(c=>categoriasAtivas.delete(c)); }
        else if (!card?.classList.contains('active')) { card?.classList.add('active'); cats.forEach(c=>categoriasAtivas.add(c)); }
        filtrarMarkers();
    });
});


// ════════════════════════════════════════════════════════════
// FILTROS — PERÍODO
// ════════════════════════════════════════════════════════════

document.querySelectorAll('.period-button').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.period-button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        periodoAtivo = btn.textContent.trim();
        filtrarMarkers();
    });
});


// ════════════════════════════════════════════════════════════
// 1. MAPA DE CALOR (HEATMAP)
// ════════════════════════════════════════════════════════════

function inicializarHeatmapLayer() {

    // GeoJSON vazio — será atualizado dinamicamente
    map.addSource('heatmap-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
        id:     'heatmap-layer',
        type:   'heatmap',
        source: 'heatmap-source',
        layout: { visibility: 'none' },
        paint: {
            'heatmap-weight':     ['interpolate', ['linear'], ['get', 'peso'], 0, 0, 5, 1],
            'heatmap-intensity':  ['interpolate', ['linear'], ['zoom'], 0, 1, 12, 3],
            'heatmap-radius':     ['interpolate', ['linear'], ['zoom'], 0, 2, 12, 30],
            'heatmap-opacity':    0.75,
            'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0,   'rgba(0,0,255,0)',
                0.2, 'rgba(0,180,255,0.6)',
                0.4, 'rgba(0,255,180,0.7)',
                0.6, 'rgba(255,255,0,0.8)',
                0.8, 'rgba(255,120,0,0.9)',
                1,   'rgba(255,0,0,1)'
            ]
        }
    });

}

function atualizarHeatmap(dataLimite = null) {

    const features = todasOcorrencias
        .filter(d => {
            const catAtiva = categoriasAtivas.has((d.Categoria||'').toLowerCase().trim());
            const noData   = dataLimite ? (dataParaISO(d.Data) <= dataLimite) : verificarPeriodo(d.Data, periodoAtivo);
            return catAtiva && noData && d.Latitude && d.Longitude;
        })
        .map(d => ({
            type: 'Feature',
            properties: { peso: 1 + d.VitimasMortas * 2 + d.VitimasFeridas * 0.5 },
            geometry:   { type: 'Point', coordinates: [d.Longitude, d.Latitude] }
        }));

    map.getSource('heatmap-source')?.setData({
        type: 'FeatureCollection',
        features
    });

}

// Botão de alternar heatmap / markers
document.getElementById('btn-heatmap')?.addEventListener('click', () => {

    const btn = document.getElementById('btn-heatmap');

    if (modoVisualizacao === 'markers') {
        modoVisualizacao = 'heatmap';
        map.setLayoutProperty('heatmap-layer', 'visibility', 'visible');
        atualizarHeatmap();
        filtrarMarkers();
        btn.textContent  = '📍 Markers';
        btn.title        = 'Voltar para marcadores';
    } else {
        modoVisualizacao = 'markers';
        map.setLayoutProperty('heatmap-layer', 'visibility', 'none');
        filtrarMarkers();
        btn.textContent  = '🔥 Heatmap';
        btn.title        = 'Ativar mapa de calor';
    }

});


// ════════════════════════════════════════════════════════════
// 2. LINHA DO TEMPO ANIMADA
// ════════════════════════════════════════════════════════════

const timelinePanel    = document.getElementById('timeline-panel');
const timelineSlider   = document.getElementById('timeline-slider');
const timelineLabel    = document.getElementById('timeline-label');
const timelinePlayBtn  = document.getElementById('timeline-play');
const timelinePauseBtn = document.getElementById('timeline-pause');
const timelineResetBtn = document.getElementById('timeline-reset');

document.getElementById('btn-timeline')?.addEventListener('click', () => {

    if (!timelinePanel) return;

    const visible = timelinePanel.style.display === 'flex';
    timelinePanel.style.display = visible ? 'none' : 'flex';

    if (!visible && timelineDatas.length > 0) {
        timelineSlider.min   = 0;
        timelineSlider.max   = timelineDatas.length - 1;
        timelineSlider.value = 0;
        timelineIndex        = 0;
        aplicarTimeline(0);
    }

});

function aplicarTimeline(idx) {

    timelineIndex    = idx;
    timelineDataAtual = timelineDatas[idx] || null;

    if (timelineLabel && timelineDataAtual) {
        // Formata data para exibição DD/MM/AAAA
        const [y, m, d] = timelineDataAtual.split('-');
        timelineLabel.textContent = `${d}/${m}/${y}`;
    }

    filtrarMarkers(timelineDataAtual);

}

timelineSlider?.addEventListener('input', () => {
    aplicarTimeline(parseInt(timelineSlider.value));
});

// Play
timelinePlayBtn?.addEventListener('click', () => {

    if (timelineAtiva) return;
    timelineAtiva = true;

    timelineTimer = setInterval(() => {

        if (timelineIndex >= timelineDatas.length - 1) {
            pararTimeline();
            return;
        }

        timelineIndex++;
        timelineSlider.value = timelineIndex;
        aplicarTimeline(timelineIndex);

    }, CONFIG.timelineVelocidade);

});

// Pause
timelinePauseBtn?.addEventListener('click', pararTimeline);

// Reset
timelineResetBtn?.addEventListener('click', () => {
    pararTimeline();
    timelineIndex        = 0;
    timelineSlider.value = 0;
    aplicarTimeline(0);
});

function pararTimeline() {
    timelineAtiva = false;
    clearInterval(timelineTimer);
}


// ════════════════════════════════════════════════════════════
// 3. ALERTAS DE CLUSTER AUTOMÁTICOS
// Verifica se há N+ ocorrências no mesmo bairro em X dias.
// ════════════════════════════════════════════════════════════

function verificarAlertasCluster(dados) {

    const agora    = new Date();
    const janela   = CONFIG.alertaJanelaDias * 86400000;
    const minimo   = CONFIG.alertaMinOcorrencias;

    // Agrupa por bairro apenas com dados recentes
    const porBairro = {};
    dados.forEach(d => {
        const dt = parseData(d.Data);
        if (!dt || (agora - dt) > janela) return;
        const b = d.Bairro || 'Desconhecido';
        if (!porBairro[b]) porBairro[b] = [];
        porBairro[b].push(d);
    });

    // Filtra bairros com cluster
    const alertas = Object.entries(porBairro)
        .filter(([, lista]) => lista.length >= minimo)
        .map(([bairro, lista]) => ({ bairro, total: lista.length, cats: contarCats(lista) }));

    if (alertas.length > 0) exibirAlertaCluster(alertas);

}

function contarCats(lista) {
    const c = {};
    lista.forEach(d => { c[d.Categoria] = (c[d.Categoria]||0)+1; });
    return Object.entries(c).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}: ${v}`).join(', ');
}

function exibirAlertaCluster(alertas) {

    const container = document.getElementById('cluster-alerts');
    if (!container) return;

    container.innerHTML = alertas.map(a => `
        <div class="cluster-alert">
            <span class="cluster-alert-icon">⚠️</span>
            <div class="cluster-alert-text">
                <strong>${a.bairro}</strong> — ${a.total} ocorrências nas últimas ${CONFIG.alertaJanelaDias * 24}h
                <span>${a.cats}</span>
            </div>
            <button onclick="this.parentElement.remove()" class="cluster-alert-close">✕</button>
        </div>
    `).join('');

    container.style.display = 'flex';

}


// ════════════════════════════════════════════════════════════
// 4. COMPARATIVO ENTRE CIDADES
// ════════════════════════════════════════════════════════════

document.getElementById('btn-comparar')?.addEventListener('click', () => {

    const modal = document.getElementById('modal-comparar');
    if (!modal) return;

    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';

    if (modal.style.display === 'flex') gerarComparativo();

});

document.getElementById('modal-comparar-fechar')?.addEventListener('click', () => {
    const modal = document.getElementById('modal-comparar');
    if (modal) modal.style.display = 'none';
});

function gerarComparativo() {

    // Agrupa por cidade
    const porCidade = {};
    todasOcorrencias.forEach(d => {
        const c = d.Cidade || 'Desconhecida';
        if (!porCidade[c]) porCidade[c] = [];
        porCidade[c].push(d);
    });

    const cidades = Object.keys(porCidade);
    const corpo   = document.getElementById('comparar-body');
    if (!corpo) return;

    corpo.innerHTML = cidades.map(cidade => {

        const lista   = porCidade[cidade];
        const total   = lista.length;
        const mortes  = lista.reduce((a,d)=>a+d.VitimasMortas, 0);
        const feridos = lista.reduce((a,d)=>a+d.VitimasFeridas, 0);

        const contCat = {};
        lista.forEach(d => { contCat[d.Categoria]=(contCat[d.Categoria]||0)+1; });
        const catDom = Object.entries(contCat).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—';

        // Barra proporcional (relativa ao maior total)
        const maxTotal = Math.max(...cidades.map(c=>porCidade[c].length));
        const pct      = maxTotal > 0 ? Math.round((total/maxTotal)*100) : 0;

        return `
            <div class="comparar-cidade">
                <div class="comparar-cidade-nome">${cidade}</div>
                <div class="comparar-barra-track">
                    <div class="comparar-barra-fill" style="width:${pct}%"></div>
                </div>
                <div class="comparar-stats">
                    <span>📊 ${total} total</span>
                    <span>☠ ${mortes} mortes</span>
                    <span>🚑 ${feridos} feridos</span>
                    <span>⚡ ${catDom}</span>
                </div>
            </div>
        `;

    }).join('');

}


// ════════════════════════════════════════════════════════════
// 5. MODO SATÉLITE
// ════════════════════════════════════════════════════════════

document.getElementById('btn-satelite')?.addEventListener('click', () => {

    const btn = document.getElementById('btn-satelite');

    if (modoMapa === 'dark') {
        modoMapa = 'satellite';
        map.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
        btn.textContent = '🌑 Mapa Escuro';
    } else {
        modoMapa = 'dark';
        map.setStyle('mapbox://styles/mapbox/dark-v11');
        btn.textContent = '🛰️ Satélite';
    }

    // Re-adiciona layers e markers após mudar o estilo
    map.once('style.load', () => {
        inicializarHeatmapLayer();
        if (modoVisualizacao === 'heatmap') {
            map.setLayoutProperty('heatmap-layer', 'visibility', 'visible');
            atualizarHeatmap();
        }
        // Re-adiciona markers
        todosMarkers.forEach(item => {
            item.marker.addTo(map);
        });
        filtrarMarkers();
    });

});


// ════════════════════════════════════════════════════════════
// 6. COMPARTILHAR FILTRO POR LINK
// ════════════════════════════════════════════════════════════

document.getElementById('btn-compartilhar')?.addEventListener('click', () => {

    // Monta parâmetros da URL com estado atual dos filtros
    const params = new URLSearchParams();

    // Categorias ativas
    params.set('cats', [...categoriasAtivas].join(','));

    // Período
    params.set('periodo', periodoAtivo);

    // Modo de visualização
    params.set('modo', modoVisualizacao);

    // Centro e zoom do mapa
    const centro = map.getCenter();
    params.set('lat',  centro.lat.toFixed(4));
    params.set('lng',  centro.lng.toFixed(4));
    params.set('zoom', map.getZoom().toFixed(1));

    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

    // Copia para área de transferência
    navigator.clipboard.writeText(url).then(() => {
        mostrarNotificacao('🔗 Link copiado para a área de transferência!');
    }).catch(() => {
        // Fallback: mostra o link num prompt
        prompt('Copie o link abaixo:', url);
    });

});

function lerFiltrosDaURL() {

    const params = new URLSearchParams(window.location.search);

    // Categorias
    if (params.has('cats')) {
        const cats = params.get('cats').split(',').map(c => c.trim()).filter(Boolean);
        if (cats.length > 0) {
            categoriasAtivas.clear();
            cats.forEach(c => categoriasAtivas.add(c));

            // Sincroniza checkboxes visuais
            document.querySelectorAll('.category-card').forEach(card => {
                const cardCats = getCatsDoCard(card.dataset.categoria || '');
                const ativo    = cardCats.some(c => categoriasAtivas.has(c));
                card.classList.toggle('active', ativo);
                card.querySelectorAll('.subcategory-item')
                    .forEach(s => s.classList.toggle('active', ativo));
            });
        }
    }

    // Período
    if (params.has('periodo')) {
        periodoAtivo = params.get('periodo');
        document.querySelectorAll('.period-button').forEach(btn => {
            const isActive = btn.textContent.trim() === periodoAtivo;
            btn.classList.toggle('active', isActive);
        });
    }

    // Centro e zoom
    if (params.has('lat') && params.has('lng')) {
        map.flyTo({
            center: [parseFloat(params.get('lng')), parseFloat(params.get('lat'))],
            zoom:   parseFloat(params.get('zoom') || '12'),
            duration: 0
        });
    }

}


// ════════════════════════════════════════════════════════════
// NOTIFICAÇÃO TOAST
// ════════════════════════════════════════════════════════════

function mostrarNotificacao(msg) {

    const el = document.createElement('div');
    el.className   = 'toast-notif';
    el.textContent = msg;
    document.body.appendChild(el);

    setTimeout(() => el.classList.add('toast-notif--show'), 10);
    setTimeout(() => {
        el.classList.remove('toast-notif--show');
        setTimeout(() => el.remove(), 400);
    }, 3000);

}


// ════════════════════════════════════════════════════════════
// SEARCH BOX
// ════════════════════════════════════════════════════════════

const searchInput = document.querySelector('.search-box input');

if (searchInput) {

    searchInput.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const v = searchInput.value.toLowerCase().trim();
        if (!v) return;
        const enc = todasOcorrencias.find(d =>
            (d.Cidade||'').toLowerCase().includes(v) ||
            (d.Bairro||'').toLowerCase().includes(v)
        );
        if (enc?.Latitude && enc?.Longitude) {
            map.flyTo({ center: [enc.Longitude, enc.Latitude], zoom: 13, speed: 0.9 });
        }
    });

    searchInput.addEventListener('input', () => {
        const v = searchInput.value.toLowerCase().trim();
        if (!v) { filtrarMarkers(); return; }
        todosMarkers.forEach(item => {
            const d  = item.dados;
            const el = item.marker.getElement();
            const ok = (d.Bairro||'').toLowerCase().includes(v) ||
                       (d.Cidade||'').toLowerCase().includes(v)  ||
                       (d.Tipo||'').toLowerCase().includes(v)    ||
                       (d.Descricao||'').toLowerCase().includes(v);
            el.style.display = ok ? 'block' : 'none';
        });
    });

}


// ════════════════════════════════════════════════════════════
// BOTÕES DE NAVEGAÇÃO
// ════════════════════════════════════════════════════════════

document.querySelectorAll('.nav-button').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});


// ════════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ════════════════════════════════════════════════════════════

map.on('load', () => {

    map.setFog({
        color:           'rgb(10,10,18)',
        'high-color':    'rgb(36,92,223)',
        'space-color':   'rgb(4,6,12)',
        'star-intensity': 0.15
    });

    carregarDados();

});

document.addEventListener('DOMContentLoaded', () => {

    document.querySelectorAll('.category-card').forEach(card => {

        const cats     = getCatsDoCard(card.dataset.categoria || '');
        const isActive = card.classList.contains('active');

        if (isActive) {
            cats.forEach(c => categoriasAtivas.add(c));
            card.querySelectorAll('.subcategory-item').forEach(s => s.classList.add('active'));
        } else {
            cats.forEach(c => categoriasAtivas.delete(c));
        }

        const expandBtn = card.querySelector('.expand-btn');
        if (expandBtn) expandBtn.textContent = card.classList.contains('expanded') ? '−' : '+';

    });

});

console.log('Coruja Presente v3.0 iniciado.');
