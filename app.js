/* ════════════════════════════════════════════════════════════
   CORUJA PRESENTE · app.js v5.0
════════════════════════════════════════════════════════════ */

'use strict';

/* ── Config ── */
const CONFIG = {
  mapboxToken: 'pk.eyJ1IjoidnBzOTA5MCIsImEiOiJjbW9zcTcxaGowMXlnMnNwcnVzbmU0Y2VnIn0.nhpXVRVOFPbGjy_zBmnV-w',
  sheetsURL:   'https://docs.google.com/spreadsheets/d/e/2PACX-1vTgXkVwHtnAUHymxilLI8PLSIe8vqTC-sZHNNy5RpgGlCCUYku0DDYXyFxXI8OWKQWZNxnhA820PGyA/pub?output=csv',
  mapCenter:   [-41.785, -22.380],
  mapZoom:     10,
  cores: {
    'Crime':                 '#E05252',
    'Acidente':              '#D4853A',
    'Incêndio':              '#E08040',
    'Afogamento':            '#4A8FCC',
    'Acidente natural':      '#48A8B8',
    'Crime contra a mulher': '#C070CC',
    'Facções criminosas':    '#8870CC',
    'default':               '#808080'
  },
  timelineVelocidade:    400,
  alertaMinOcorrencias:  5,
  alertaJanelaDias:      7,
};

/* ── Estado ── */
let dados         = [];      // todos os registros
let todosMarkers  = [];
let periodoAtivo  = 'Tudo';
let cidadeFiltro  = null;    // null = todas
let modoVisu      = 'markers';
let modoMapa      = 'dark';
let timelineAtiva = false;
let timelineTimer = null;
let timelineIndex = 0;
let timelineDatas = [];

const categoriasAtivas = new Set([
  'crime','acidente','incêndio','afogamento',
  'acidente natural','crime contra a mulher','facções criminosas'
]);

const MAPA_CAT = {
  'crimes':                 ['crime'],
  'acidentes':              ['acidente'],
  'incendios':              ['incêndio'],
  'crimes contra mulheres': ['crime contra a mulher'],
  'acidentes naturais':     ['afogamento','acidente natural'],
  'faccoes criminosas':     ['facções criminosas'],
};

function getCats(key) { return MAPA_CAT[(key||'').toLowerCase().trim()] || [key]; }

/* ════════════════════════════════════════════════════════════
   MAPA
════════════════════════════════════════════════════════════ */
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
  const z = map.getZoom();
  const lat  = document.getElementById('hud-lat');
  const lng  = document.getElementById('hud-lng');
  const zoom = document.getElementById('hud-zoom');
  if (lat)  lat.textContent  = c.lat.toFixed(3);
  if (lng)  lng.textContent  = c.lng.toFixed(3);
  if (zoom) zoom.textContent = z.toFixed(1);
});

/* Click em label de cidade no mapa → filtrar por cidade */
map.on('click', (e) => {
  const features = map.queryRenderedFeatures(e.point, {
    layers: ['settlement-label','place-label','poi-label']
  });
  if (features.length > 0) {
    const nome = features[0].properties?.name_pt || features[0].properties?.name;
    if (nome) {
      const cidadeNaBase = dados.find(d =>
        (d.Cidade||'').toLowerCase().includes(nome.toLowerCase()) ||
        nome.toLowerCase().includes((d.Cidade||'').toLowerCase())
      );
      if (cidadeNaBase) {
        definirFiltroCidade(cidadeNaBase.Cidade);
      }
    }
  }
});

/* ════════════════════════════════════════════════════════════
   CARREGAR DADOS
════════════════════════════════════════════════════════════ */
async function carregarDados() {
  try {
    const r = await fetch(CONFIG.sheetsURL);
    if (!r.ok) throw new Error('Falha na planilha');
    const csv = await r.text();
    dados = parseCSV(csv);
    console.log(`✅ ${dados.length} registros carregados`);

    // Cidade mais frequente
    const contCidades = {};
    dados.forEach(d => { if(d.Cidade) contCidades[d.Cidade] = (contCidades[d.Cidade]||0)+1; });
    const cidadePrincipal = Object.entries(contCidades).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
    const estado = dados.find(d=>d.Estado)?.Estado||'';

    const el = document.getElementById('cidade-ativa-label');
    if (el) el.textContent = cidadePrincipal ? `${cidadePrincipal}, ${estado}` : 'Todas as cidades';

    const sc = document.getElementById('stat-cidade');
    if (sc) sc.textContent = 'Todas as cidades';

    // Datas para timeline
    timelineDatas = [...new Set(
      dados.map(d=>d.Data).filter(Boolean)
           .map(d=>{ const p=parseData(d); return p?p.toISOString().split('T')[0]:null; })
           .filter(Boolean)
    )].sort();

    // Popula select de cidades no relatório
    const selCidade = document.getElementById('report-cidade');
    if (selCidade) {
      [...new Set(dados.map(d=>d.Cidade).filter(Boolean))].sort().forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        selCidade.appendChild(opt);
      });
    }

    inicializarHeatmap();
    criarMarkers(dados);
    atualizarContadores(dados);
    filtrar();
    verificarAlertas(dados);
    atualizarImpactCard(dados, null);
    atualizarIA(dados);
    lerURL();

  } catch(e) {
    console.error('Erro:', e);
    toast('Erro ao carregar dados da planilha', 'error');
  }
}

/* ════════════════════════════════════════════════════════════
   PARSE CSV
════════════════════════════════════════════════════════════ */
function parseCSV(txt) {
  const lines = txt.trim().split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(c=>c.trim().replace(/"/g,''));
  const rows = [];
  for (let i=1;i<lines.length;i++) {
    const vals = splitLine(lines[i]);
    if (vals.length < 2) continue;
    const obj = {};
    header.forEach((k,idx) => { obj[k] = (vals[idx]||'').trim().replace(/"/g,''); });
    obj.Latitude        = parseFloat(obj.Latitude)||0;
    obj.Longitude       = parseFloat(obj.Longitude)||0;
    obj.VitimasMortas   = parseInt(obj.VitimasMortas)||0;
    obj.VitimasFeridas  = parseInt(obj.VitimasFeridas)||0;
    obj.VitimasIlesas   = parseInt(obj.VitimasIlesas)||0;
    if (obj.Latitude<-90||obj.Latitude>90||obj.Longitude<-180||obj.Longitude>180) continue;
    if (obj.Latitude===0&&obj.Longitude===0) continue;
    rows.push(obj);
  }
  return rows;
}

function splitLine(l) {
  const r=[];let c='';let q=false;
  for(const ch of l){if(ch==='"')q=!q;else if(ch===','&&!q){r.push(c);c='';}else c+=ch;}
  r.push(c); return r;
}

function parseData(s) {
  if(!s)return null;
  const p=s.split('/');
  if(p.length===3)return new Date(+p[2],+p[1]-1,+p[0]);
  const d=new Date(s); return isNaN(d)?null:d;
}

function dataISO(s) {
  const d=parseData(s);
  return d?d.toISOString().split('T')[0]:'';
}

/* ════════════════════════════════════════════════════════════
   MARKERS
════════════════════════════════════════════════════════════ */
function corCat(cat) { return CONFIG.cores[cat?.trim()]||CONFIG.cores['default']; }

function criarMarkers(arr) {
  limparMarkers();
  arr.forEach(item => {
    if (!item.Latitude||!item.Longitude) return;
    const cor = corCat(item.Categoria);
    const popup = new mapboxgl.Popup({ offset:25, closeButton:false, maxWidth:'300px' })
      .setHTML(`
        <div style="background:#1a1a1a;color:#f2f2f2;padding:16px;border-radius:12px;font-family:Inter,sans-serif;min-width:220px;">
          <div style="font-size:9px;opacity:.5;letter-spacing:.12em;text-transform:uppercase;margin-bottom:3px;">${item.Categoria||''}</div>
          <div style="font-size:12px;font-weight:600;color:${cor};margin-bottom:2px;">${item.Subcategoria||item.Categoria||''}</div>
          <div style="font-size:11px;opacity:.55;margin-bottom:10px;">${item.Detalhe||''}</div>
          <div style="font-size:13px;color:#e0e0e0;margin-bottom:12px;line-height:1.4;border-left:2px solid ${cor};padding-left:8px;">${item.Descricao||'Ocorrência registrada'}</div>
          <div style="display:flex;flex-direction:column;gap:4px;font-size:11.5px;opacity:.85;">
            ${item.Bairro?`<span>📍 ${item.Bairro}${item.Cidade?', '+item.Cidade:''}</span>`:''}
            ${item.Data?`<span>📅 ${item.Data}${item.Hora?' às '+item.Hora:''}</span>`:''}
            ${item.Gravidade?`<span>⚠️ ${item.Gravidade}</span>`:''}
            ${item.VitimasMortas>0?`<span style="color:#E05252">☠ Mortes: ${item.VitimasMortas}</span>`:''}
            ${item.VitimasFeridas>0?`<span style="color:#D4853A">🚑 Feridos: ${item.VitimasFeridas}</span>`:''}
            ${item.Confirmado?`<span style="opacity:.4;font-size:10px;">✓ ${item.Confirmado} · ${item.Fonte||''}</span>`:''}
          </div>
          ${item.Link?`<a href="${item.Link}" target="_blank" style="display:inline-block;margin-top:10px;font-size:10px;color:${cor};opacity:.7;text-decoration:none;">Ver notícia →</a>`:''}
        </div>
      `);
    try {
      const m = new mapboxgl.Marker({ color:cor })
        .setLngLat([item.Longitude, item.Latitude])
        .setPopup(popup)
        .addTo(map);
      todosMarkers.push({
        marker:    m,
        categoria: (item.Categoria||'').toLowerCase().trim(),
        cidade:    (item.Cidade||'').toLowerCase().trim(),
        dataISO:   dataISO(item.Data),
        data:      item.Data||'',
        dados:     item
      });
    } catch(e) { console.warn('Marker inválido:', item.ID); }
  });
}

function limparMarkers() {
  todosMarkers.forEach(i=>i.marker.remove());
  todosMarkers=[];
}

/* ════════════════════════════════════════════════════════════
   FILTRAR
════════════════════════════════════════════════════════════ */
function filtrar(dataLimite=null) {
  todosMarkers.forEach(item => {
    const el = item.marker.getElement();
    const catOk    = categoriasAtivas.has(item.categoria);
    const cidadeOk = !cidadeFiltro || item.cidade === cidadeFiltro.toLowerCase().trim();
    const dataOk   = dataLimite
      ? (item.dataISO <= dataLimite)
      : periodoOk(item.data);
    const show = catOk && cidadeOk && dataOk && modoVisu==='markers';
    el.style.display       = show?'block':'none';
    el.style.opacity       = show?'1':'0';
    el.style.pointerEvents = show?'auto':'none';
  });

  const vis = todosMarkers
    .filter(i=>i.marker.getElement().style.display!=='none')
    .map(i=>i.dados);

  atualizarStats(vis);
  atualizarImpactCard(vis, cidadeFiltro);
  if (modoVisu==='heatmap') atualizarHeatmap(dataLimite);
}

function periodoOk(dateStr) {
  if (periodoAtivo==='Tudo'||!dateStr) return true;
  const d=parseData(dateStr);
  if(!d)return true;
  const diff=(new Date()-d)/86400000;
  if(periodoAtivo==='24h')return diff<=1;
  if(periodoAtivo==='7d') return diff<=7;
  if(periodoAtivo==='30d')return diff<=30;
  if(periodoAtivo==='3m') return diff<=90;
  if(periodoAtivo==='1a') return diff<=365;
  return true;
}

/* ════════════════════════════════════════════════════════════
   FILTRO DE CIDADE
════════════════════════════════════════════════════════════ */
function definirFiltroCidade(cidade) {
  cidadeFiltro = cidade;

  // Badge na sidebar header
  const badge = document.getElementById('city-filter-badge');
  const name  = document.getElementById('city-filter-name');
  if (badge && name) {
    badge.style.display = cidade ? 'flex' : 'none';
    name.textContent    = cidade || '';
  }

  // Badge na search box
  const sb   = document.getElementById('search-city-badge');
  const sbTx = document.getElementById('search-badge-text');
  if (sb && sbTx) {
    sb.style.display  = cidade ? 'flex' : 'none';
    sbTx.textContent  = cidade || '';
  }

  // Label cidade ativa
  const label = document.getElementById('cidade-ativa-label');
  if (label) label.textContent = cidade || 'Todas as cidades';

  // Fly to cidade no mapa
  if (cidade) {
    const registros = dados.filter(d => d.Cidade===cidade && d.Latitude && d.Longitude);
    if (registros.length > 0) {
      const lats = registros.map(d=>d.Latitude);
      const lngs = registros.map(d=>d.Longitude);
      const bounds = new mapboxgl.LngLatBounds(
        [Math.min(...lngs)-0.05, Math.min(...lats)-0.05],
        [Math.max(...lngs)+0.05, Math.max(...lats)+0.05]
      );
      map.fitBounds(bounds, { padding:60, maxZoom:13, duration:800 });
    }
  } else {
    map.flyTo({ center:CONFIG.mapCenter, zoom:CONFIG.mapZoom, duration:800 });
  }

  filtrar();
}

function limparFiltroCidade() { definirFiltroCidade(null); }

document.getElementById('city-filter-clear')?.addEventListener('click', limparFiltroCidade);
document.getElementById('search-clear')?.addEventListener('click', () => {
  document.getElementById('search-input').value = '';
  fecharDropdown();
  limparFiltroCidade();
});

/* ════════════════════════════════════════════════════════════
   SEARCH COM AUTOCOMPLETE (cidades do mundo via Mapbox Geocoder)
════════════════════════════════════════════════════════════ */
const searchInput    = document.getElementById('search-input');
const searchDropdown = document.getElementById('search-dropdown');
let   searchTimer    = null;

function fecharDropdown() {
  searchDropdown.classList.remove('open');
  searchDropdown.innerHTML = '';
}

function mostrarDropdown(sugestoes) {
  searchDropdown.innerHTML = '';
  if (!sugestoes.length) {
    searchDropdown.innerHTML = `<div class="search-dd-no-data">Nenhuma cidade encontrada</div>`;
    searchDropdown.classList.add('open');
    return;
  }
  sugestoes.forEach(s => {
    const item = document.createElement('div');
    item.className = 'search-dd-item';
    const countLocal = dados.filter(d=>(d.Cidade||'').toLowerCase()===s.nome.toLowerCase()).length;
    const temDados   = countLocal > 0;
    item.innerHTML = `
      <span class="search-dd-item-icon">${temDados?'📍':'🌍'}</span>
      <div>
        <div class="search-dd-item-name">${s.nome}</div>
        <div class="search-dd-item-sub">${s.local}</div>
      </div>
      ${temDados?`<span class="search-dd-item-count">${countLocal} registros</span>`:''}
    `;
    item.addEventListener('click', () => {
      searchInput.value = s.nome;
      fecharDropdown();
      if (temDados) {
        definirFiltroCidade(dados.find(d=>(d.Cidade||'').toLowerCase()===s.nome.toLowerCase())?.Cidade);
      } else {
        // Cidade sem dados: voa para ela e mostra aviso
        limparFiltroCidade();
        map.flyTo({ center:[s.lng, s.lat], zoom:11, duration:1000 });
        toast(`📍 ${s.nome} — Ainda não temos dados para esta cidade`, 'info');
      }
    });
    searchDropdown.appendChild(item);
  });
  searchDropdown.classList.add('open');
}

async function buscarCidades(q) {
  if (q.length < 2) { fecharDropdown(); return; }

  // Primeiro: busca nas cidades que temos dados
  const locais = [...new Set(dados.map(d=>d.Cidade).filter(Boolean))]
    .filter(c => c.toLowerCase().includes(q.toLowerCase()))
    .map(c => {
      const r = dados.find(d=>d.Cidade===c);
      return { nome:c, local:`${r?.Estado||'RJ'}, Brasil`, lat:r?.Latitude||0, lng:r?.Longitude||0, local_dados:true };
    });

  // Depois: busca via Mapbox Geocoding para cidades do mundo
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?types=place,region&language=pt&limit=5&access_token=${CONFIG.mapboxToken}`;
    const resp = await fetch(url);
    const json = await resp.json();
    const geo  = (json.features||[]).map(f => ({
      nome:  f.text_pt||f.text,
      local: f.place_name_pt||f.place_name,
      lat:   f.center[1],
      lng:   f.center[0],
    }));

    // Mescla: dados locais primeiro, depois geocoding (sem duplicar)
    const nomesDados = new Set(locais.map(l=>l.nome.toLowerCase()));
    const extras     = geo.filter(g => !nomesDados.has(g.nome.toLowerCase()));

    mostrarDropdown([...locais, ...extras].slice(0, 7));
  } catch {
    mostrarDropdown(locais);
  }
}

searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const v = searchInput.value.trim();
  if (!v) { fecharDropdown(); return; }
  searchTimer = setTimeout(() => buscarCidades(v), 280);
});

searchInput?.addEventListener('keydown', e => {
  if (e.key==='Escape') { fecharDropdown(); searchInput.blur(); }
  if (e.key==='Enter')  {
    const first = searchDropdown.querySelector('.search-dd-item');
    if (first) first.click();
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('#search-wrap')) fecharDropdown();
});

/* ════════════════════════════════════════════════════════════
   ESTATÍSTICAS
════════════════════════════════════════════════════════════ */
function atualizarStats(vis) {
  const total   = vis.length;
  const mortes  = vis.reduce((a,d)=>a+d.VitimasMortas,0);
  const feridos = vis.reduce((a,d)=>a+d.VitimasFeridas,0);

  const contCat={};
  vis.forEach(d=>{const c=d.Categoria||'?';contCat[c]=(contCat[c]||0)+1;});
  const catDom = Object.entries(contCat).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';

  const contB={};
  vis.forEach(d=>{if(d.Bairro)contB[d.Bairro]=(contB[d.Bairro]||0)+1;});
  const topB = Object.entries(contB).sort((a,b)=>b[1]-a[1]).slice(0,3);

  const s=id=>document.getElementById(id);
  if(s('stat-total'))     s('stat-total').textContent    =total;
  if(s('stat-mortes'))    s('stat-mortes').textContent   =mortes;
  if(s('stat-feridos'))   s('stat-feridos').textContent  =feridos;
  if(s('stat-categoria')) s('stat-categoria').textContent=catDom;

  const ul=document.getElementById('stat-bairros');
  if(ul) ul.innerHTML=topB.map(([b,n])=>`<li>${b} — ${n}</li>`).join('')||'<li>—</li>';
}

function atualizarContadores(arr) {
  const cont={};
  arr.forEach(d=>{const c=(d.Categoria||'').toLowerCase().trim();cont[c]=(cont[c]||0)+1;});
  document.querySelectorAll('.category-card').forEach(card=>{
    const badge=card.querySelector('.category-badge');
    if(!badge)return;
    const cats=getCats(card.dataset.categoria||'');
    const total=cats.reduce((a,c)=>a+(cont[c]||0),0);
    badge.textContent=total>0?total:'—';
  });
}

/* ── Card de impacto: Homicídios ── */
function atualizarImpactCard(vis, cidade) {
  const homicidios = vis.filter(d=>
    (d.Subcategoria||'').toLowerCase().includes('homicídio') ||
    (d.Subcategoria||'').toLowerCase().includes('feminicídio')
  );
  const n   = document.getElementById('impact-number');
  const lbl = document.getElementById('impact-label');
  const sub = document.getElementById('impact-sub');
  if (n)   n.textContent   = homicidios.length || '—';
  if (lbl) lbl.textContent = homicidios.length===1?'homicídio registrado':'homicídios registrados';
  if (sub) sub.textContent = cidade ? `em ${cidade}` : 'em todas as cidades';
}

/* ── IA: análise automática ── */
function atualizarIA(arr) {
  const el = document.getElementById('ia-texto');
  if (!el||!arr.length) return;

  const contCat={};
  arr.forEach(d=>{const c=d.Categoria||'?';contCat[c]=(contCat[c]||0)+1;});
  const [[catTop,qtdTop]=[]] = Object.entries(contCat).sort((a,b)=>b[1]-a[1]);

  const contSub={};
  arr.forEach(d=>{if(d.Subcategoria)contSub[d.Subcategoria]=(contSub[d.Subcategoria]||0)+1;});
  const [[subTop]=[]] = Object.entries(contSub).sort((a,b)=>b[1]-a[1]);

  const contB={};
  arr.forEach(d=>{if(d.Bairro)contB[d.Bairro]=(contB[d.Bairro]||0)+1;});
  const [[bairroTop,bQtd]=[]] = Object.entries(contB).sort((a,b)=>b[1]-a[1]);

  el.textContent=`A categoria mais registrada é ${catTop||'Crime'} (${qtdTop||0}). A subcategoria de maior incidência é ${subTop||'—'}. ${bairroTop?`O bairro ${bairroTop} concentra ${bQtd} ocorrências, sendo o mais crítico da seleção atual.`:''}`;
}

/* ════════════════════════════════════════════════════════════
   FILTROS — CATEGORIAS
════════════════════════════════════════════════════════════ */
document.querySelectorAll('.category-card').forEach(card=>{
  const cb      = card.querySelector('.category-checkbox');
  const expBtn  = card.querySelector('.expand-btn');
  const subList = card.querySelector('.subcategory-list');
  const dataCat = card.dataset.categoria||'';

  if(expBtn&&subList){
    expBtn.textContent=card.classList.contains('expanded')?'−':'+';
    expBtn.addEventListener('click',e=>{
      e.stopPropagation();
      expBtn.textContent=card.classList.toggle('expanded')?'−':'+';
    });
  }

  if(cb){
    cb.addEventListener('click',e=>{
      e.stopPropagation();
      const ativo=card.classList.toggle('active');
      const cats=getCats(dataCat);
      if(ativo){
        cats.forEach(c=>categoriasAtivas.add(c));
        card.querySelectorAll('.subcategory-item').forEach(s=>s.classList.add('active'));
      }else{
        cats.forEach(c=>categoriasAtivas.delete(c));
        card.querySelectorAll('.subcategory-item').forEach(s=>s.classList.remove('active'));
      }
      filtrar();
    });
  }

  card.addEventListener('mouseenter',()=>card.style.transform='translateY(-1px)');
  card.addEventListener('mouseleave',()=>card.style.transform='');
});

document.querySelectorAll('.subcategory-item').forEach(item=>{
  item.addEventListener('click',e=>{
    e.stopPropagation();
    item.classList.toggle('active');
    const card=item.closest('.category-card');
    const subs=[...(card?.querySelectorAll('.subcategory-item')||[])];
    const algum=subs.some(s=>s.classList.contains('active'));
    const cats=getCats(card?.dataset.categoria||'');
    if(!algum){card?.classList.remove('active');cats.forEach(c=>categoriasAtivas.delete(c));}
    else if(!card?.classList.contains('active')){card?.classList.add('active');cats.forEach(c=>categoriasAtivas.add(c));}
    filtrar();
  });
});

/* ════════════════════════════════════════════════════════════
   PERÍODO
════════════════════════════════════════════════════════════ */
document.querySelectorAll('.period-button').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.period-button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    periodoAtivo=btn.textContent.trim();
    filtrar();
  });
});

/* ════════════════════════════════════════════════════════════
   ABAS SIDEBAR
════════════════════════════════════════════════════════════ */
document.querySelectorAll('.sidebar-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.sidebar-tab').forEach(t=>t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
    tab.classList.add('active');
    const target=document.getElementById('tab-'+tab.dataset.tab);
    if(target)target.classList.add('active');
  });
});

/* ════════════════════════════════════════════════════════════
   RANKING
════════════════════════════════════════════════════════════ */
document.getElementById('ranking-gerar')?.addEventListener('click',()=>{
  const sel   = document.getElementById('ranking-select');
  const subcat = sel?.value||'Homicídio';
  gerarRanking(subcat);
});

function gerarRanking(subcat) {
  const lista=document.getElementById('ranking-list');
  if(!lista)return;

  const filtrados=dados.filter(d=>{
    const sub=(d.Subcategoria||'').toLowerCase();
    return sub.includes(subcat.toLowerCase());
  });

  if(!filtrados.length){
    lista.innerHTML=`<div class="ranking-empty">Nenhuma ocorrência encontrada para "${subcat}"</div>`;
    return;
  }

  const contCidade={};
  filtrados.forEach(d=>{if(d.Cidade)contCidade[d.Cidade]=(contCidade[d.Cidade]||0)+1;});
  const sorted=Object.entries(contCidade).sort((a,b)=>b[1]-a[1]);
  const max=sorted[0]?.[1]||1;

  lista.innerHTML=sorted.map(([cidade,qtd],i)=>{
    const pos=i+1;
    const posClass=pos===1?'gold':pos===2?'silver':pos===3?'bronze':'';
    const pct=Math.round((qtd/max)*100);
    return `
      <div class="ranking-item" data-cidade="${cidade}" style="cursor:pointer">
        <span class="ranking-pos ${posClass}">${pos}°</span>
        <div class="ranking-info">
          <div class="ranking-cidade">${cidade}</div>
          <div class="ranking-bar-track"><div class="ranking-bar-fill" style="width:${pct}%;background:${CONFIG.cores['Crime']}"></div></div>
        </div>
        <span class="ranking-count">${qtd}</span>
      </div>
    `;
  }).join('');

  // Click no ranking = filtrar por cidade
  lista.querySelectorAll('.ranking-item').forEach(item=>{
    item.addEventListener('click',()=>{
      definirFiltroCidade(item.dataset.cidade);
      // Volta para aba filtros
      document.querySelectorAll('.sidebar-tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
      document.querySelector('[data-tab="filtros"]')?.classList.add('active');
      document.getElementById('tab-filtros')?.classList.add('active');
    });
  });
}

/* ════════════════════════════════════════════════════════════
   HEATMAP
════════════════════════════════════════════════════════════ */
function inicializarHeatmap() {
  map.addSource('heatmap-src',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({
    id:'heatmap-layer',type:'heatmap',source:'heatmap-src',
    layout:{visibility:'none'},
    paint:{
      'heatmap-weight':['interpolate',['linear'],['get','peso'],0,0,5,1],
      'heatmap-intensity':['interpolate',['linear'],['zoom'],0,1,13,3],
      'heatmap-radius':['interpolate',['linear'],['zoom'],0,2,13,28],
      'heatmap-opacity':0.75,
      'heatmap-color':['interpolate',['linear'],['heatmap-density'],
        0,'rgba(0,0,255,0)',0.2,'rgba(0,180,255,0.6)',
        0.4,'rgba(0,255,180,0.7)',0.6,'rgba(255,255,0,0.8)',
        0.8,'rgba(255,120,0,0.9)',1,'rgba(255,0,0,1)']
    }
  });
}

function atualizarHeatmap(dataLimite=null) {
  const features=dados.filter(d=>{
    const catOk   =categoriasAtivas.has((d.Categoria||'').toLowerCase().trim());
    const cidOk   =!cidadeFiltro||(d.Cidade||'').toLowerCase()===cidadeFiltro.toLowerCase();
    const dtOk    =dataLimite?(dataISO(d.Data)<=dataLimite):periodoOk(d.Data);
    return catOk&&cidOk&&dtOk&&d.Latitude&&d.Longitude;
  }).map(d=>({
    type:'Feature',
    properties:{peso:1+d.VitimasMortas*2+d.VitimasFeridas*0.5},
    geometry:{type:'Point',coordinates:[d.Longitude,d.Latitude]}
  }));
  map.getSource('heatmap-src')?.setData({type:'FeatureCollection',features});
}

/* ════════════════════════════════════════════════════════════
   TOOLBAR BUTTONS — com banner de modo ativo
════════════════════════════════════════════════════════════ */
function mostrarBanner(msg) {
  const b=document.getElementById('mode-banner');
  const t=document.getElementById('mode-banner-text');
  if(!b||!t)return;
  t.textContent=msg; b.style.display='flex';
}

function esconderBanner() {
  const b=document.getElementById('mode-banner');
  if(b)b.style.display='none';
}

// Heatmap
document.getElementById('btn-heatmap')?.addEventListener('click',()=>{
  const btn=document.getElementById('btn-heatmap');
  if(modoVisu==='markers'){
    modoVisu='heatmap';
    map.setLayoutProperty('heatmap-layer','visibility','visible');
    atualizarHeatmap(); filtrar();
    btn.classList.add('active');
    btn.textContent='📍 Markers';
    mostrarBanner('🔥 Heatmap ativo — mostrando densidade de ocorrências');
  }else{
    modoVisu='markers';
    map.setLayoutProperty('heatmap-layer','visibility','none');
    filtrar();
    btn.classList.remove('active');
    btn.textContent='🔥 Heatmap';
    esconderBanner();
  }
});

// Timeline
document.getElementById('btn-timeline')?.addEventListener('click',()=>{
  const btn=document.getElementById('btn-timeline');
  const panel=document.getElementById('timeline-panel');
  if(!panel)return;
  const visivel=panel.style.display==='flex';
  if(visivel){
    // DESATIVAR — para completamente
    pararTimeline();
    panel.style.display='none';
    btn.classList.remove('active');
    btn.textContent='⏱ Timeline';
    esconderBanner();
    // Restaura filtro normal
    filtrar();
  }else{
    // ATIVAR
    panel.style.display='flex';
    btn.classList.add('active');
    btn.textContent='⏱ Timeline ✓';
    if(timelineDatas.length>0){
      const slider=document.getElementById('timeline-slider');
      if(slider){slider.min=0;slider.max=timelineDatas.length-1;slider.value=0;}
      timelineIndex=0;
      aplicarTimeline(0);
    }
    mostrarBanner('⏱ Timeline ativa — filtros normais desativados. Clique novamente para sair.');
  }
});

document.getElementById('mode-banner-close')?.addEventListener('click',()=>{
  // Botão "Desativar" no banner fecha o modo ativo
  if(modoVisu==='heatmap') document.getElementById('btn-heatmap')?.click();
  const tBtn=document.getElementById('btn-timeline');
  if(tBtn?.classList.contains('active')) tBtn.click();
});

// Comparar
document.getElementById('btn-comparar')?.addEventListener('click',()=>{
  const m=document.getElementById('modal-comparar');
  if(!m)return;
  m.style.display='flex';
  gerarComparativo('comparar-body-2');
});

// Satélite
document.getElementById('btn-satelite')?.addEventListener('click',()=>{
  const btn=document.getElementById('btn-satelite');
  if(modoMapa==='dark'){
    modoMapa='satellite';
    map.setStyle('mapbox://styles/mapbox/satellite-streets-v12');
    btn.classList.add('active'); btn.textContent='🌑 Mapa Escuro';
  }else{
    modoMapa='dark';
    map.setStyle('mapbox://styles/mapbox/dark-v11');
    btn.classList.remove('active'); btn.textContent='🛰 Satélite';
  }
  map.once('style.load',()=>{
    inicializarHeatmap();
    if(modoVisu==='heatmap'){ map.setLayoutProperty('heatmap-layer','visibility','visible'); atualizarHeatmap(); }
    todosMarkers.forEach(i=>i.marker.addTo(map));
    filtrar();
  });
});

// Compartilhar
document.getElementById('btn-compartilhar')?.addEventListener('click',()=>{
  const p=new URLSearchParams();
  p.set('cats',[...categoriasAtivas].join(','));
  p.set('periodo',periodoAtivo);
  p.set('modo',modoVisu);
  if(cidadeFiltro)p.set('cidade',cidadeFiltro);
  const c=map.getCenter();
  p.set('lat',c.lat.toFixed(4));p.set('lng',c.lng.toFixed(4));p.set('zoom',map.getZoom().toFixed(1));
  const url=`${location.origin}${location.pathname}?${p}`;
  navigator.clipboard.writeText(url)
    .then(()=>toast('🔗 Link copiado!','success'))
    .catch(()=>prompt('Copie o link:',url));
});

/* ════════════════════════════════════════════════════════════
   TIMELINE
════════════════════════════════════════════════════════════ */
function aplicarTimeline(idx) {
  timelineIndex=idx;
  const dt=timelineDatas[idx]||null;
  const label=document.getElementById('timeline-label');
  if(label&&dt){const[y,m,d]=dt.split('-');label.textContent=`${d}/${m}/${y}`;}
  filtrar(dt);
}

document.getElementById('timeline-slider')?.addEventListener('input',e=>{
  aplicarTimeline(parseInt(e.target.value));
});

document.getElementById('timeline-play')?.addEventListener('click',()=>{
  if(timelineAtiva)return;
  timelineAtiva=true;
  timelineTimer=setInterval(()=>{
    if(timelineIndex>=timelineDatas.length-1){pararTimeline();return;}
    timelineIndex++;
    const s=document.getElementById('timeline-slider');
    if(s)s.value=timelineIndex;
    aplicarTimeline(timelineIndex);
  },CONFIG.timelineVelocidade);
});

document.getElementById('timeline-pause')?.addEventListener('click',pararTimeline);

document.getElementById('timeline-reset')?.addEventListener('click',()=>{
  pararTimeline();
  timelineIndex=0;
  const s=document.getElementById('timeline-slider');
  if(s)s.value=0;
  aplicarTimeline(0);
});

function pararTimeline(){ timelineAtiva=false; clearInterval(timelineTimer); }

/* ════════════════════════════════════════════════════════════
   MODAIS: SOBRE / RELATÓRIOS / ESTATÍSTICAS
════════════════════════════════════════════════════════════ */
// Abrir
document.getElementById('nav-sobre')?.addEventListener('click',()=>{
  document.querySelectorAll('.nav-button').forEach(b=>b.classList.remove('active'));
  document.getElementById('nav-sobre').classList.add('active');
  document.getElementById('modal-sobre').style.display='flex';
});

document.getElementById('nav-relatorios')?.addEventListener('click',()=>{
  document.querySelectorAll('.nav-button').forEach(b=>b.classList.remove('active'));
  document.getElementById('nav-relatorios').classList.add('active');
  document.getElementById('modal-relatorios').style.display='flex';
});

document.getElementById('nav-stats')?.addEventListener('click',()=>{
  document.querySelectorAll('.nav-button').forEach(b=>b.classList.remove('active'));
  document.getElementById('nav-stats').classList.add('active');
  abrirStats();
});

// Fechar
document.querySelectorAll('.modal-close,[data-modal]').forEach(btn=>{
  const id=btn.dataset.modal;
  if(!id)return;
  btn.addEventListener('click',()=>{
    document.getElementById(id).style.display='none';
    // Remove active dos nav buttons quando fecha modal
    document.querySelectorAll('.nav-button').forEach(b=>b.classList.remove('active'));
    document.getElementById('nav-stats')?.classList.add('active');
  });
});

// Fechar ao clicar fora
document.querySelectorAll('.modal-overlay').forEach(m=>{
  m.addEventListener('click',e=>{ if(e.target===m) m.style.display='none'; });
});

// ESC
document.addEventListener('keydown',e=>{
  if(e.key==='Escape') document.querySelectorAll('.modal-overlay').forEach(m=>m.style.display='none');
});

/* ── Relatórios: filtrar e renderizar tabela ── */
document.getElementById('report-gerar')?.addEventListener('click',gerarRelatorio);

function gerarRelatorio() {
  const cidade    = document.getElementById('report-cidade')?.value||'';
  const categoria = document.getElementById('report-categoria')?.value||'';
  const gravidade = document.getElementById('report-gravidade')?.value||'';

  let filtrados = [...dados];
  if(cidade)    filtrados=filtrados.filter(d=>d.Cidade===cidade);
  if(categoria) filtrados=filtrados.filter(d=>d.Categoria===categoria);
  if(gravidade) filtrados=filtrados.filter(d=>d.Gravidade===gravidade);

  // Summary
  const mortes  = filtrados.reduce((a,d)=>a+d.VitimasMortas,0);
  const feridos = filtrados.reduce((a,d)=>a+d.VitimasFeridas,0);
  const sum=document.getElementById('report-summary');
  if(sum){
    sum.style.display='block';
    sum.textContent=`${filtrados.length} ocorrências encontradas · ${mortes} mortes · ${feridos} feridos`;
  }

  const count=document.getElementById('report-count');
  if(count) count.textContent=`${filtrados.length} registros`;

  const tbody=document.getElementById('report-tbody');
  if(!tbody)return;

  if(!filtrados.length){
    tbody.innerHTML=`<tr><td colspan="10" style="text-align:center;padding:20px;color:#666">Nenhum resultado</td></tr>`;
    return;
  }

  tbody.innerHTML=filtrados.slice(0,200).map((d,i)=>{
    const gravClass=d.Gravidade==='Fatal'?'grav-fatal':d.Gravidade==='Grave'?'grav-grave':d.Gravidade==='Médio'?'grav-medio':'';
    return `<tr>
      <td style="color:#484848;font-family:monospace">${i+1}</td>
      <td>${d.Data||'—'}</td>
      <td>${d.Cidade||'—'}</td>
      <td>${d.Bairro||'—'}</td>
      <td style="color:${CONFIG.cores[d.Categoria]||'#808080'}">${d.Categoria||'—'}</td>
      <td>${d.Subcategoria||'—'}</td>
      <td style="color:#808080;font-size:11px">${d.Detalhe||'—'}</td>
      <td class="${gravClass}">${d.Gravidade||'—'}</td>
      <td style="color:#E05252;font-weight:600">${d.VitimasMortas||0}</td>
      <td style="color:#D4853A">${d.VitimasFeridas||0}</td>
    </tr>`;
  }).join('');
}

/* ── Estatísticas modal ── */
function abrirStats() {
  document.getElementById('modal-stats').style.display='flex';

  // KPIs
  const vis = todosMarkers.filter(i=>i.marker.getElement().style.display!=='none').map(i=>i.dados);
  const total  = vis.length||dados.length;
  const mortes = (vis.length?vis:dados).reduce((a,d)=>a+d.VitimasMortas,0);
  const feridos= (vis.length?vis:dados).reduce((a,d)=>a+d.VitimasFeridas,0);
  const cidades= new Set(dados.map(d=>d.Cidade).filter(Boolean)).size;

  const s=id=>document.getElementById(id);
  if(s('kpi-total'))   s('kpi-total').textContent  =total;
  if(s('kpi-mortes'))  s('kpi-mortes').textContent =mortes;
  if(s('kpi-feridos')) s('kpi-feridos').textContent=feridos;
  if(s('kpi-cidades')) s('kpi-cidades').textContent=cidades;

  // Barras por categoria
  const contCat={};
  dados.forEach(d=>{if(d.Categoria)contCat[d.Categoria]=(contCat[d.Categoria]||0)+1;});
  const sorted=Object.entries(contCat).sort((a,b)=>b[1]-a[1]);
  const maxCat=sorted[0]?.[1]||1;
  const barsEl=document.getElementById('stats-cat-bars');
  if(barsEl) barsEl.innerHTML=sorted.map(([cat,n])=>`
    <div class="stat-cat-bar">
      <span class="stat-cat-bar-label">${cat}</span>
      <div class="stat-cat-bar-track"><div class="stat-cat-bar-fill" style="width:${Math.round(n/maxCat*100)}%;background:${CONFIG.cores[cat]||'#808080'}"></div></div>
      <span class="stat-cat-bar-num">${n}</span>
    </div>
  `).join('');

  gerarComparativo('comparar-body');
}

/* ── Comparativo de cidades ── */
function gerarComparativo(containerId) {
  const el=document.getElementById(containerId);
  if(!el)return;
  const porCidade={};
  dados.forEach(d=>{if(d.Cidade){if(!porCidade[d.Cidade])porCidade[d.Cidade]=[];porCidade[d.Cidade].push(d);}});
  const cidades=Object.keys(porCidade);
  const maxT=Math.max(...cidades.map(c=>porCidade[c].length));
  el.innerHTML=cidades.sort((a,b)=>porCidade[b].length-porCidade[a].length).map(c=>{
    const l=porCidade[c];
    const t=l.length;
    const m=l.reduce((a,d)=>a+d.VitimasMortas,0);
    const f=l.reduce((a,d)=>a+d.VitimasFeridas,0);
    const cc={};l.forEach(d=>{cc[d.Categoria]=(cc[d.Categoria]||0)+1;});
    const dom=Object.entries(cc).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';
    const pct=Math.round(t/maxT*100);
    return `<div class="comparar-cidade">
      <div class="comparar-cidade-nome">${c}</div>
      <div class="comparar-barra-track"><div class="comparar-barra-fill" style="width:${pct}%"></div></div>
      <div class="comparar-stats"><span>📊 ${t}</span><span>☠ ${m}</span><span>🚑 ${f}</span><span>⚡ ${dom}</span></div>
    </div>`;
  }).join('');
}

/* ════════════════════════════════════════════════════════════
   ALERTAS CLUSTER
════════════════════════════════════════════════════════════ */
function verificarAlertas(arr) {
  const agora=new Date();
  const janela=CONFIG.alertaJanelaDias*86400000;
  const porBairro={};
  arr.forEach(d=>{
    const dt=parseData(d.Data);
    if(!dt||(agora-dt)>janela)return;
    const b=d.Bairro||'?';
    if(!porBairro[b])porBairro[b]=[];
    porBairro[b].push(d);
  });
  const alertas=Object.entries(porBairro)
    .filter(([,l])=>l.length>=CONFIG.alertaMinOcorrencias)
    .map(([b,l])=>({bairro:b,total:l.length}));
  const cont=document.getElementById('cluster-alerts');
  if(!cont)return;
  if(!alertas.length){cont.style.display='none';return;}
  cont.style.display='flex';
  cont.innerHTML=alertas.map(a=>`
    <div class="cluster-alert">
      <span class="cluster-alert-icon">⚠️</span>
      <div class="cluster-alert-text">
        <strong>${a.bairro}</strong>
        ${a.total} ocorrências nos últimos ${CONFIG.alertaJanelaDias} dias
      </div>
      <button class="cluster-alert-close" onclick="this.parentElement.remove()">✕</button>
    </div>
  `).join('');
}

/* ════════════════════════════════════════════════════════════
   COMPARTILHAR — ler URL
════════════════════════════════════════════════════════════ */
function lerURL() {
  const p=new URLSearchParams(location.search);
  if(p.has('cats')){
    const cats=p.get('cats').split(',').map(c=>c.trim()).filter(Boolean);
    if(cats.length){
      categoriasAtivas.clear();
      cats.forEach(c=>categoriasAtivas.add(c));
    }
  }
  if(p.has('periodo'))periodoAtivo=p.get('periodo');
  if(p.has('cidade'))definirFiltroCidade(p.get('cidade'));
  if(p.has('lat')&&p.has('lng')){
    map.flyTo({center:[parseFloat(p.get('lng')),parseFloat(p.get('lat'))],zoom:parseFloat(p.get('zoom')||'12'),duration:0});
  }
}

/* ════════════════════════════════════════════════════════════
   TOAST
════════════════════════════════════════════════════════════ */
function toast(msg, tipo='info') {
  const c=document.getElementById('toast-container');
  if(!c)return;
  const el=document.createElement('div');
  el.className=`toast ${tipo}`;
  el.textContent=msg;
  c.appendChild(el);
  setTimeout(()=>{
    el.style.transition='opacity .25s,transform .25s';
    el.style.opacity='0'; el.style.transform='translateX(10px)';
    setTimeout(()=>el.remove(),260);
  },3500);
}

/* ════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════ */
map.on('load',()=>{
  map.setFog({color:'rgb(10,10,16)','high-color':'rgb(30,80,200)','space-color':'rgb(4,6,12)','star-intensity':0.12});
  carregarDados();
});

document.addEventListener('DOMContentLoaded',()=>{
  // Sincroniza estado inicial dos cards
  document.querySelectorAll('.category-card').forEach(card=>{
    const cats=getCats(card.dataset.categoria||'');
    const isActive=card.classList.contains('active');
    if(isActive) cats.forEach(c=>categoriasAtivas.add(c));
    else cats.forEach(c=>categoriasAtivas.delete(c));
    const expBtn=card.querySelector('.expand-btn');
    if(expBtn) expBtn.textContent=card.classList.contains('expanded')?'−':'+';
  });
});

console.log('Coruja Presente v5.0 iniciado');
