/* ════════════════════════════════════════════════════════════
   CORUJA PRESENTE · app.js
   Plataforma de Inteligência Urbana e Territorial
   v2.0.0

   Módulos:
   ├── Utils            — helpers $() e $$()
   ├── ModuleConfig     — arquitetura modular de categorias
   ├── SidebarSystem    — colapso via translateX (fix completo)
   ├── ModalSystem      — abertura / fechamento de modais
   ├── CategorySystem   — categorias + subcategorias expansíveis
   ├── PeriodSystem     — filtro de período
   ├── ViewSystem       — modos de visualização do mapa
   ├── TabSystem        — tabs nos modais
   ├── CityDropdown     — seletor de cidade
   ├── NeighborhoodSystem — foco de bairro no mapa
   ├── ToastSystem      — notificações
   ├── MapLoader        — controle do loading overlay
   ├── TimestampSystem  — atualização de horário
   └── App.init()       — bootstrap geral
════════════════════════════════════════════════════════════ */

'use strict';


/* ════════════════════════════════════════════════════════════
   UTILS — Helpers de seleção DOM
════════════════════════════════════════════════════════════ */
const $ = (selector, context = document) => context.querySelector(selector);
const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];


/* ════════════════════════════════════════════════════════════
   MODULE CONFIG
   Arquitetura modular de categorias.
   Permite ativar/desativar módulos e controlar acesso premium
   com uma única alteração de configuração.

   Uso futuro:
     ModuleConfig.gruposCriminosos.enabled = true;  // ativa módulo
     ModuleConfig.estimativas.premium = false;       // libera acesso
════════════════════════════════════════════════════════════ */
const ModuleConfig = {
  crimes:               { enabled: true,  premium: false },
  acidentes:            { enabled: true,  premium: false },
  'crimes-mulheres':    { enabled: true,  premium: false },
  'acidentes-natureza': { enabled: true,  premium: false },
  'grupos-criminosos':  { enabled: false, premium: true  },
  'crimes-seguranca':   { enabled: false, premium: true  },
  estimativas:          { enabled: false, premium: true  },
};


/* ════════════════════════════════════════════════════════════
   SIDEBAR SYSTEM
   FIX COMPLETO: colapso via transform translateX.
   - Sidebar desaparece 100% — sem resíduos visuais.
   - Botão de toggle move junto com a sidebar.
   - map.resize() chamado após cada transição.
════════════════════════════════════════════════════════════ */
const SidebarSystem = (() => {
  const leftSidebar  = $('#sidebar-left');
  const rightSidebar = $('#sidebar-right');
  const toggleLeft   = $('#toggle-left');
  const toggleRight  = $('#toggle-right');
  const iconLeft     = $('#toggle-left-icon');
  const iconRight    = $('#toggle-right-icon');

  let leftOpen  = true;
  let rightOpen = true;

  /* Lê larguras das variáveis CSS para posicionar os toggles */
  function getSidebarWidths() {
    const styles = getComputedStyle(document.documentElement);
    const slW = parseInt(styles.getPropertyValue('--sl-w')) || 272;
    const srW = parseInt(styles.getPropertyValue('--sr-w')) || 320;
    return { slW, srW };
  }

  function updateTogglePosition() {
    const { slW, srW } = getSidebarWidths();

    if (toggleLeft)  toggleLeft.style.left  = leftOpen  ? `${slW}px` : '0';
    if (toggleRight) toggleRight.style.right = rightOpen ? `${srW}px` : '0';
  }

  function collapseLeft() {
    leftOpen = false;
    leftSidebar?.classList.add('collapsed');
    document.body.classList.add('sl-collapsed');
    toggleLeft?.setAttribute('aria-expanded', 'false');
    if (iconLeft) iconLeft.innerHTML = '<polyline points="9,18 15,12 9,6"/>';
    updateTogglePosition();
    triggerMapResize();
  }

  function expandLeft() {
    leftOpen = true;
    leftSidebar?.classList.remove('collapsed');
    document.body.classList.remove('sl-collapsed');
    toggleLeft?.setAttribute('aria-expanded', 'true');
    if (iconLeft) iconLeft.innerHTML = '<polyline points="15,18 9,12 15,6"/>';
    updateTogglePosition();
    triggerMapResize();
  }

  function collapseRight() {
    rightOpen = false;
    rightSidebar?.classList.add('collapsed');
    document.body.classList.add('sr-collapsed');
    toggleRight?.setAttribute('aria-expanded', 'false');
    if (iconRight) iconRight.innerHTML = '<polyline points="15,18 9,12 15,6"/>';
    updateTogglePosition();
    triggerMapResize();
  }

  function expandRight() {
    rightOpen = true;
    rightSidebar?.classList.remove('collapsed');
    document.body.classList.remove('sr-collapsed');
    toggleRight?.setAttribute('aria-expanded', 'true');
    if (iconRight) iconRight.innerHTML = '<polyline points="9,18 15,12 9,6"/>';
    updateTogglePosition();
    triggerMapResize();
  }

  /* Recalcula o mapa Mapbox após animação da sidebar */
  function triggerMapResize() {
    setTimeout(() => {
      const map = window.CorujaPresente?.mapInstance;
      if (map && typeof map.resize === 'function') {
        map.resize();
      }
    }, 420); // leve delay para aguardar transição CSS (--t4: 480ms)
  }

  function init() {
    /* Botões de toggle principais */
    toggleLeft?.addEventListener('click',  () => leftOpen  ? collapseLeft()  : expandLeft());
    toggleRight?.addEventListener('click', () => rightOpen ? collapseRight() : expandRight());

    /* Triggers mobile no topbar */
    $('#mobile-trigger-left')?.addEventListener('click',  () => leftOpen  ? collapseLeft()  : expandLeft());
    $('#mobile-trigger-right')?.addEventListener('click', () => rightOpen ? collapseRight() : expandRight());

    /* Defaults responsivos */
    if (window.innerWidth < 1200) collapseRight();
    if (window.innerWidth < 768)  { collapseLeft(); collapseRight(); }

    /* Atualiza posição inicial dos toggles */
    updateTogglePosition();

    /* Re-posiciona toggles em resize de janela */
    window.addEventListener('resize', updateTogglePosition);
  }

  return {
    init,
    collapseLeft,
    expandLeft,
    collapseRight,
    expandRight,
    isLeftOpen:  () => leftOpen,
    isRightOpen: () => rightOpen,
  };
})();


/* ════════════════════════════════════════════════════════════
   MODAL SYSTEM
════════════════════════════════════════════════════════════ */
const ModalSystem = (() => {

  function open(id) {
    const el = $('#' + id);
    if (!el) return;
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    /* Focus management — acessibilidade */
    const firstFocusable = el.querySelector('button, input, select, [tabindex="0"]');
    if (firstFocusable) setTimeout(() => firstFocusable.focus(), 60);
  }

  function close(id) {
    const el = $('#' + id);
    if (!el) return;
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function closeAll() {
    $$('.modal-backdrop.open').forEach(m => close(m.id));
  }

  function init() {
    /* Abrir via data-open-modal="id" */
    $$('[data-open-modal]').forEach(btn => {
      btn.addEventListener('click', () => open(btn.dataset.openModal));
    });

    /* Fechar via data-close-modal="id" */
    $$('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => close(btn.dataset.closeModal));
    });

    /* Fechar ao clicar no backdrop (fora do modal) */
    $$('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', e => {
        if (e.target === backdrop) close(backdrop.id);
      });
    });

    /* Fechar com Escape */
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAll();
    });
  }

  return { init, open, close, closeAll };
})();


/* ════════════════════════════════════════════════════════════
   CATEGORY SYSTEM
   Módulos expansíveis com subcategorias.
   Integra com ModuleConfig para controle premium.
════════════════════════════════════════════════════════════ */
const CategorySystem = (() => {

  function init() {
    $$('.cat-group').forEach(group => {
      const isPremium = group.dataset.premium === 'true';
      const header    = group.querySelector('.cat-group__header');
      if (!header) return;

      /* Módulos premium — clicar exibe upsell */
      if (isPremium) {
        header.addEventListener('click', () => {
          ToastSystem.show('Este módulo requer o plano Coruja Premium.', 'info');
        });
        return;
      }

      /* Click no header — duas ações possíveis:
         1. Clicou na checkbox → toggle ativo/inativo
         2. Clicou em qualquer outro lugar → expande/colapsa subcategorias */
      header.addEventListener('click', e => {
        const isCheckArea = e.target.closest('.cat-check');

        if (isCheckArea) {
          /* Toggle de ativação do módulo no mapa */
          const isActive = group.classList.toggle('active');
          header.setAttribute('aria-checked', isActive.toString());
          e.stopPropagation();
          // TODO: disparar evento de atualização do mapa
          //   MapSystem.toggleLayer(group.dataset.module, isActive);
          return;
        }

        /* Expansão/colapso das subcategorias */
        const isExpanded = group.classList.toggle('expanded');
        header.setAttribute('aria-expanded', isExpanded.toString());
      });

      /* Teclado — acessibilidade */
      header.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          header.click();
        }
      });
    });

    /* Subcategorias individuais */
    $$('.cat-sub').forEach(sub => {
      sub.addEventListener('click', () => {
        const isActive = sub.classList.toggle('active');
        sub.setAttribute('aria-checked', isActive.toString());
        // TODO: filtrar mapa por subcategoria
        //   MapSystem.toggleSubLayer(sub.dataset.sub, isActive);
      });

      sub.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          sub.click();
        }
      });
    });
  }

  return { init };
})();


/* ════════════════════════════════════════════════════════════
   PERIOD SYSTEM
════════════════════════════════════════════════════════════ */
const PeriodSystem = (() => {

  function init() {
    $$('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        /* Desativa todos, ativa o clicado */
        $$('.period-btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        // TODO: filtrar dados por período
        //   DataService.fetchByPeriod(btn.dataset.period);
      });
    });
  }

  return { init };
})();


/* ════════════════════════════════════════════════════════════
   VIEW SYSTEM — Modos de visualização do mapa
════════════════════════════════════════════════════════════ */
const ViewSystem = (() => {

  function init() {
    $$('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.view-btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        // TODO: mudar visualização
        //   MapSystem.setView(btn.dataset.view);
      });
    });
  }

  return { init };
})();


/* ════════════════════════════════════════════════════════════
   TAB SYSTEM — Tabs nos modais
════════════════════════════════════════════════════════════ */
const TabSystem = (() => {

  function init() {
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        /* Encontra o grupo de tabs mais próximo */
        const tabList = btn.closest('[role="tablist"]') ?? btn.parentElement;
        tabList?.querySelectorAll('.tab-btn').forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        // TODO: mostrar painel correspondente
      });
    });
  }

  return { init };
})();


/* ════════════════════════════════════════════════════════════
   CITY DROPDOWN
════════════════════════════════════════════════════════════ */
const CityDropdown = (() => {
  const dropdown = $('#city-dropdown');
  const trigger  = $('[data-action="open-city-dropdown"]');

  function open() {
    if (!dropdown || !trigger) return;

    /* Posiciona o dropdown acima do trigger */
    const rect = trigger.getBoundingClientRect();
    dropdown.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    dropdown.style.left   = `${rect.left}px`;
    dropdown.style.top    = 'auto';

    dropdown.classList.add('open');
    dropdown.setAttribute('aria-hidden', 'false');

    /* Foca no campo de busca */
    const searchInput = $('#city-search');
    if (searchInput) setTimeout(() => searchInput.focus(), 50);
  }

  function close() {
    dropdown?.classList.remove('open');
    dropdown?.setAttribute('aria-hidden', 'true');
  }

  function selectCity(opt) {
    /* Remove seleção anterior */
    $$('.city-opt').forEach(o => {
      o.classList.remove('current');
      o.setAttribute('aria-selected', 'false');
      o.querySelector('.city-opt__tag')?.remove();
    });

    /* Aplica seleção nova */
    opt.classList.add('current');
    opt.setAttribute('aria-selected', 'true');

    /* Adiciona badge ATIVO */
    const tag = document.createElement('span');
    tag.className   = 'city-opt__tag';
    tag.textContent = 'ATIVO';
    opt.appendChild(tag);

    /* Atualiza textos na interface */
    const name  = opt.querySelector('.city-opt__name')?.textContent  ?? '';
    const state = opt.querySelector('.city-opt__state')?.textContent ?? '';
    const stateSuffix = state ? `, ${state.slice(0, 2).toUpperCase()}` : '';

    const elActiveCity = $('#active-city');
    const elMapLabel   = $('#map-city-label');
    const elStatName   = $('#stat-city-name');

    if (elActiveCity) elActiveCity.textContent = name + stateSuffix;
    if (elMapLabel)   elMapLabel.textContent   = name;
    if (elStatName)   elStatName.textContent   = name;

    close();
    // TODO: recarregar dados da cidade
    //   DataService.loadCity(opt.dataset.city);
  }

  function init() {
    /* Toggle do dropdown */
    trigger?.addEventListener('click', e => {
      e.stopPropagation();
      dropdown?.classList.contains('open') ? close() : open();
    });

    /* Fecha ao clicar fora */
    document.addEventListener('click', e => {
      if (!dropdown?.contains(e.target) && e.target !== trigger) close();
    });

    /* Seleção de cidade */
    $$('.city-opt').forEach(opt => {
      opt.addEventListener('click', () => selectCity(opt));
      opt.addEventListener('keydown', e => {
        if (e.key === 'Enter') selectCity(opt);
      });
    });
  }

  return { init, open, close };
})();


/* ════════════════════════════════════════════════════════════
   NEIGHBORHOOD SYSTEM — Foco de bairro no mapa
════════════════════════════════════════════════════════════ */
const NeighborhoodSystem = (() => {

  function focusNeighborhood(nbhd) {
    console.info('[Coruja Presente] Focus neighborhood:', nbhd);
    // TODO: centralizar mapa no bairro
    //   MapSystem.flyToNeighborhood(nbhd);
  }

  function init() {
    $$('[data-nbhd]').forEach(item => {
      item.addEventListener('click', () => focusNeighborhood(item.dataset.nbhd));
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter') focusNeighborhood(item.dataset.nbhd);
      });
    });
  }

  return { init };
})();


/* ════════════════════════════════════════════════════════════
   TOAST SYSTEM
════════════════════════════════════════════════════════════ */
const ToastSystem = (() => {
  const container = $('#toasts');

  const ICONS = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="#4ADE80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20,6 9,17 4,12"/>
              </svg>`,
    info:    `<svg viewBox="0 0 24 24" fill="none" stroke="#6B8ECC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
              </svg>`,
    warn:    `<svg viewBox="0 0 24 24" fill="none" stroke="#D4853A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
              </svg>`,
    error:   `<svg viewBox="0 0 24 24" fill="none" stroke="#E05252" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>`,
  };

  const AUTO_DISMISS_MS = 4000;
  const FADE_MS         = 260;

  function show(message, type = 'info') {
    if (!container) return;

    const el = document.createElement('div');
    el.className = `toast t-${type}`;
    el.setAttribute('role', 'alert');
    el.innerHTML = (ICONS[type] ?? ICONS.info) + `<span>${message}</span>`;
    container.appendChild(el);

    /* Auto-dismiss */
    setTimeout(() => {
      el.style.transition = `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`;
      el.style.opacity    = '0';
      el.style.transform  = 'translateX(12px)';
      setTimeout(() => el.remove(), FADE_MS);
    }, AUTO_DISMISS_MS);
  }

  return { show };
})();


/* ════════════════════════════════════════════════════════════
   MAP LOADER — Controle do overlay de carregamento
════════════════════════════════════════════════════════════ */
const MapLoader = (() => {

  function hide() {
    const el = $('#map-loading');
    if (!el) return;
    el.classList.add('hidden');
    setTimeout(() => el.remove(), 400);
  }

  function init() {
    /* Esconde após 1.5s se o Mapbox não estiver configurado.
       Substituir por: map.on('load', MapLoader.hide) ao integrar Mapbox. */
    setTimeout(hide, 1500);
  }

  return { init, hide };
})();


/* ════════════════════════════════════════════════════════════
   TIMESTAMP SYSTEM — Atualiza horário do HUD
════════════════════════════════════════════════════════════ */
const TimestampSystem = (() => {
  const UPDATE_INTERVAL_MS = 60_000;

  function update() {
    const el = $('#map-updated');
    if (!el) return;

    const now = new Date();
    el.setAttribute('datetime', now.toISOString());
    el.textContent = now.toLocaleTimeString('pt-BR', {
      hour:   '2-digit',
      minute: '2-digit',
    });
  }

  function init() {
    update();
    setInterval(update, UPDATE_INTERVAL_MS);
  }

  return { init, update };
})();


/* ════════════════════════════════════════════════════════════
   PUBLIC API — window.CorujaPresente
   Interface pública para integração com Mapbox,
   backend, e outros scripts futuros.
════════════════════════════════════════════════════════════ */
window.CorujaPresente = {
  version: '2.0.0',
  modules: ModuleConfig,

  /* Métodos de UI */
  toast:  (msg, type) => ToastSystem.show(msg, type),
  modal:  {
    open:     id => ModalSystem.open(id),
    close:    id => ModalSystem.close(id),
    closeAll: ()  => ModalSystem.closeAll(),
  },
  sidebar: SidebarSystem,
  map:     MapLoader,

  /* Referência ao mapa Mapbox.
     Preencher ao inicializar:
       CorujaPresente.mapInstance = map;
     Usado por SidebarSystem.triggerMapResize() */
  mapInstance: null,
};


/* ════════════════════════════════════════════════════════════
   APP INIT — Bootstrap de todos os módulos
════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  SidebarSystem.init();
  ModalSystem.init();
  CategorySystem.init();
  PeriodSystem.init();
  ViewSystem.init();
  TabSystem.init();
  CityDropdown.init();
  NeighborhoodSystem.init();
  MapLoader.init();
  TimestampSystem.init();

  /* Toast de boas-vindas */
  setTimeout(() => {
    ToastSystem.show('Sistema inicializado · Rio das Ostras, RJ', 'success');
  }, 2000);
});
