// Build flat list of all unique books
const allBooks = [];
const bookMap = {};
DATA.forEach(tab => {
  tab.items.forEach(item => {
    const key = item.nome + '|' + item.nivel;
    if (!bookMap[key]) {
      bookMap[key] = true;
      allBooks.push({ ...item, tab: tab.titulo });
    }
  });
});

// State
let owned = JSON.parse(localStorage.getItem('pw_owned') || '[]');
let presets = JSON.parse(localStorage.getItem('pw_presets') || '{}');
let activeTab = 'Aba I';
let searchQ = '';
let statFilter = '';
let ownedFilterMode = 'all';
let modalBook = null;

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('fade-out'), 2500);
  setTimeout(() => toast.remove(), 3000);
}

function getGlobalOwnedNames() {
  return owned.map(x => x.startsWith('@') ? x.split('|')[1] : x);
}

function getOwnedCount(name) {
  return getGlobalOwnedNames().filter(x => x === name).length;
}

function isOwned(name) {
  return getOwnedCount(name) > 0;
}

function isCraftable(nome) {
  if (getOwnedCount(nome) > 0) return false;
  const book = allBooks.find(b => b.nome === nome);
  if (!book || !book.materiais || !book.materiais.length) return false;
  
  let pool = {};
  getGlobalOwnedNames().forEach(n => pool[n] = (pool[n] || 0) + 1);
  
  return book.materiais.every(m => {
    const sub = allBooks.find(b => b.nome === m.nome);
    if (!sub) return true;
    if (pool[m.nome] > 0) {
      pool[m.nome]--;
      return true;
    }
    return false;
  });
}

function getBaseCost(rootBookName) {
  let rem = {};
  let tempPool = {};
  owned.forEach(x => {
    if (!x.startsWith('@')) tempPool[x] = (tempPool[x] || 0) + 1;
  });

  function traverse(bName, path, multiplier=1) {
    const book = allBooks.find(b => b.nome === bName);
    if (!book) {
      rem[bName] = (rem[bName] || 0) + multiplier;
      return;
    }
    const specificKey = '@' + path + '|' + bName;
    if (owned.includes(specificKey)) return;
    if (tempPool[bName] > 0) {
      tempPool[bName]--;
      return;
    }
    book.materiais.forEach((m, idx) => {
      traverse(m.nome, path + '-' + idx, (m.quantidade || 1) * multiplier);
    });
  }
  
  traverse(rootBookName, rootBookName, 1);
  return rem;
}

function getTotalBaseCost(rootBookName) {
  let total = {};
  function traverse(bName, multiplier=1) {
    const book = allBooks.find(b => b.nome === bName);
    if (!book) {
      total[bName] = (total[bName] || 0) + multiplier;
      return;
    }
    book.materiais.forEach((m) => {
      traverse(m.nome, (m.quantidade || 1) * multiplier);
    });
  }
  traverse(rootBookName, 1);
  return total;
}

// Tabs
const tabs = DATA.filter(d => d.items.length > 0);

function saveOwned() {
  localStorage.setItem('pw_owned', JSON.stringify(owned));
}

function isOwned(nome) {
  return owned.includes(nome);
}

function toggleOwned(nome) {
  if (getOwnedCount(nome) > 0) {
    const idx = owned.findIndex(x => x === nome);
    if (idx > -1) {
      owned.splice(idx, 1);
    } else {
      const specIdx = owned.findIndex(x => x.endsWith('|' + nome));
      if (specIdx > -1) owned.splice(specIdx, 1);
    }
  } else {
    owned.push(nome);
  }
  saveOwned();
  renderAll();
}

// Render tabs
function renderTabs() {
  const row = document.getElementById('tabsRow');
  row.innerHTML = '';
  tabs.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (t.titulo === activeTab ? ' active' : '');
    btn.textContent = t.titulo;
    btn.onclick = () => { activeTab = t.titulo; renderAll(); };
    row.appendChild(btn);
  });
}

// Filter books for current tab
function getFilteredBooks() {
  const tab = DATA.find(d => d.titulo === activeTab);
  if (!tab) return [];
  return tab.items.filter(item => {
    const matchSearch = !searchQ || item.nome.toLowerCase().includes(searchQ.toLowerCase());
    const matchStat = !statFilter || item.efeitos.some(e => e.includes(statFilter));
    const matchOwned = ownedFilterMode === 'all' ||
      (ownedFilterMode === 'owned' && isOwned(item.nome)) ||
      (ownedFilterMode === 'missing' && !isOwned(item.nome));
    return matchSearch && matchStat && matchOwned;
  });
}

// Render grid
function renderGrid() {
  const grid = document.getElementById('booksGrid');
  const books = getFilteredBooks();
  grid.innerHTML = '';

  if (!books.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">📖</div><p>Nenhum livro encontrado.</p></div>';
    return;
  }

  books.forEach(item => {
    const craftable = isCraftable(item.nome);
    const ownedCount = getOwnedCount(item.nome);
    const card = document.createElement('div');
    card.className = 'book-card' + (ownedCount > 0 ? ' owned' : '') + (craftable ? ' craftable' : '');

    const matImgs = item.materiais.slice(0, 4).map(m => {
      if (m.imagem) return `<img class="mat-thumb" src="${m.imagem}" alt="${m.nome}" title="${m.nome}">`;
      return `<span class="mat-thumb-placeholder">?</span>`;
    }).join('');

    card.innerHTML = `
      ${craftable ? '<div class="craftable-badge">✨ Pode Criar!</div>' : ''}
      <div class="card-top">
        <div class="card-img-wrap"><img src="${item.imagem || ''}" alt="${item.nome}" onerror="this.style.opacity=0.3"></div>
        <div class="card-info">
          <div class="card-name">${item.nome}</div>
          <span class="card-level">Nível ${item.nivel}</span>
        </div>
      </div>
      <div class="card-effects">${item.efeitos.map(e => `<span class="effect-tag">${e}</span>`).join('')}</div>
      <div class="card-mats">${matImgs}</div>
      <button class="toggle-owned-btn">${ownedCount > 0 ? '✓ Obtido (' + ownedCount + ') - Remover 1' : '+ Marcar como Obtido'}</button>
    `;

    card.querySelector('.toggle-owned-btn').onclick = (e) => {
      e.stopPropagation();
      toggleOwned(item.nome);
    };

    card.onclick = () => openModal(item);
    grid.appendChild(card);
  });
}

// Owned sidebar
function renderOwnedSidebar() {
  const list = document.getElementById('ownedList');
  const ownedBooks = allBooks.filter(b => isOwned(b.nome));

  if (!ownedBooks.length) {
    list.innerHTML = '<div class="empty-owned">Nenhum livro obtido ainda.</div>';
    return;
  }

  list.innerHTML = ownedBooks.map(b => `
    <div class="owned-item" onclick="jumpToBook('${b.nome}','${b.tab}')">
      <img src="${b.imagem || ''}" alt="${b.nome}" onerror="this.style.opacity=0.2">
      <span class="owned-item-name">${b.nome}</span>
      <span class="owned-item-lvl">Nv${b.nivel}</span>
    </div>
  `).join('');
}

function jumpToBook(nome, tab) {
  activeTab = tab;
  renderAll();
}

// Materials needed for owned books' next tier
function renderMaterials() {
  const matsDiv = document.getElementById('materialsNeeded');
  const matsList = document.getElementById('matsList');
  if (!owned.length) { matsDiv.style.display = 'none'; return; }

  // Collect all materials needed for owned books
  const matCount = {};
  const matImg = {};
  owned.forEach(ownedName => {
    const book = allBooks.find(b => b.nome === ownedName);
    if (!book) return;
    book.materiais.forEach(m => {
      if (!m.imagem) return; // skip basic mats from aba1
      matCount[m.nome] = (matCount[m.nome] || 0) + (m.quantidade || 1);
      matImg[m.nome] = m.imagem;
    });
  });

  const entries = Object.entries(matCount);
  if (!entries.length) { matsDiv.style.display = 'none'; return; }

  matsDiv.style.display = 'block';
  matsList.innerHTML = entries.map(([nome, qty]) => `
    <div class="mat-item">
      <img src="${matImg[nome]}" alt="${nome}" onerror="this.style.opacity=0.2">
      <span>${nome}</span>
      <span class="mat-item-qty">${qty}x</span>
    </div>
  `).join('');
}

// Stats bar
function updateStats() {
  const allItems = DATA.flatMap(d => d.items);
  const unique = [...new Set(allItems.map(i => i.nome))];
  const uniqueOwnedCount = [...new Set(getGlobalOwnedNames())].length;
  document.getElementById('totalCount').textContent = unique.length;
  document.getElementById('ownedCount').textContent = uniqueOwnedCount;
  document.getElementById('visibleCount').textContent = getFilteredBooks().length;
}

// Modal
function openModal(item) {
  modalBook = item;
  document.getElementById('modalImg').src = item.imagem || '';
  document.getElementById('modalName').textContent = item.nome;
  document.getElementById('modalLevel').textContent = 'Nível ' + item.nivel;
  document.getElementById('modalEffects').innerHTML = item.efeitos.map(e => `<span class="modal-effect-tag">${e}</span>`).join('');

  const mats = document.getElementById('modalMats');
  mats.innerHTML = item.materiais.map(m => `
    <div class="modal-mat-row">
      ${m.imagem ? `<img src="${m.imagem}" alt="${m.nome}">` : ''}
      <span class="modal-mat-name">${m.nome}</span>
      ${m.quantidade ? `<span class="modal-mat-qty">${m.quantidade}x</span>` : ''}
    </div>
  `).join('');

  const count = getOwnedCount(item.nome);
  const btn = document.getElementById('modalToggleBtn');
  btn.textContent = count > 0 ? '✓ Obtido (' + count + ') - Remover 1' : '+ Marcar como Obtido';
  btn.className = 'modal-toggle-btn' + (count > 0 ? ' owned-state' : '');
  btn.onclick = () => {
    toggleOwned(item.nome);
    openModal(item); // refresh
  };

  const total = getTotalBaseCost(item.nome);
  const rem = getBaseCost(item.nome);
  let totalItems=0; Object.values(total).forEach(v=>totalItems+=v);
  let remItems=0; Object.values(rem).forEach(v=>remItems+=v);
  let pct = totalItems > 0 ? Math.round(((totalItems - remItems)/totalItems)*100) : 100;
  if(isOwned(item.nome)||remItems===0) pct = 100;
  
  const progressDiv = document.getElementById('modalProgress');
  if(totalItems > 0 && item.nivel > 1) {
    progressDiv.classList.add('visible');
    document.getElementById('modalProgressText').textContent = pct + '%';
    document.getElementById('modalProgressBar').style.width = pct + '%';
    if(pct===100) document.getElementById('modalProgressBar').style.background = '#88c5ff';
    else document.getElementById('modalProgressBar').style.background = '';
  } else {
    progressDiv.classList.remove('visible');
  }
  
  const treeBtn = document.getElementById('viewTreeBtn');
  if(item.nivel > 1) {
    treeBtn.classList.add('visible');
    treeBtn.onclick = () => openTree(item);
  } else {
    treeBtn.classList.remove('visible');
  }

  document.getElementById('modalOverlay').classList.add('open');
}

document.getElementById('modalClose').onclick = () => {
  document.getElementById('modalOverlay').classList.remove('open');
};
document.getElementById('modalOverlay').onclick = (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
};

// Filters
document.getElementById('searchInput').oninput = (e) => {
  searchQ = e.target.value;
  renderAll();
};

document.getElementById('statFilter').onchange = (e) => {
  statFilter = e.target.value;
  renderAll();
};

document.querySelectorAll('#ownedFilter .pill').forEach(p => {
  p.onclick = () => {
    document.querySelectorAll('#ownedFilter .pill').forEach(x => x.classList.remove('active'));
    p.classList.add('active');
    ownedFilterMode = p.dataset.filter;
    renderAll();
  };
});

document.getElementById('clearAll').onclick = () => {
  if (confirm('Limpar todos os livros obtidos?')) {
    owned = [];
    saveOwned();
    renderAll();
  }
};

function renderAll() {
  renderTabs();
  renderGrid();
  renderOwnedSidebar();
  renderMaterials();
  updateStats();
  renderPresets();
}

let currentGlobalPool = {};

// Tree logic
function openTree(book) {
  document.getElementById('modalOverlay').classList.remove('open');
  const overlay = document.getElementById('treeOverlay');
  document.getElementById('treeTitleImg').src = book.imagem || '';
  document.getElementById('treeTitleName').textContent = 'Árvore: ' + book.nome;
  
  currentGlobalPool = {};
  owned.forEach(x => {
    if (!x.startsWith('@')) currentGlobalPool[x] = (currentGlobalPool[x] || 0) + 1;
  });
  
  document.getElementById('craftTreeContainer').innerHTML = buildTreeNodeHtml(book.nome, 1, book.nome);
  bindTreeEvents();
  updateTreeCosts(book.nome);

  overlay.classList.add('open');
}

document.getElementById('treeClose').onclick = () => {
  document.getElementById('treeOverlay').classList.remove('open');
  if(modalBook) openModal(modalBook);
};

function buildTreeNodeHtml(bookName, qty, path) {
  const book = allBooks.find(b => b.nome === bookName);
  const isBaseMat = !book;
  const imgUrl = book ? book.imagem : 'images/fragmentodeescritadivina.jpg';
  const nameLabel = book ? book.nome : bookName;
  
  const specificKey = '@' + path + '|' + nameLabel;
  let isSpecOwned = owned.includes(specificKey);
  let isGlobOwned = false;
  
  if (!isSpecOwned && currentGlobalPool[nameLabel] > 0) {
    isGlobOwned = true;
    currentGlobalPool[nameLabel]--;
  }
  
  const isNodeOwned = isSpecOwned || isGlobOwned;
  const ownedClass = isNodeOwned && book ? ' owned' : '';
  const dataAttr = `data-name="${nameLabel}" data-path="${path}" data-spec="${isSpecOwned}" data-glob="${isGlobOwned}"`;
  
  let html = `<div class="tree-node-wrapper">`;
  html += `
    <div class="tree-node${ownedClass}" ${dataAttr}>
      <img src="${imgUrl}" onerror="this.src=''; this.style.opacity=0.3">
      <div class="tree-node-name">${nameLabel}</div>
      ${qty > 1 ? `<div class="tree-node-qty">${qty}x</div>` : ''}
    </div>
  `;
  
  if (book && book.materiais && book.materiais.length) {
    html += `<div class="tree-children">`;
    book.materiais.forEach((m, idx) => {
      html += `<div class="tree-child-wrapper">${buildTreeNodeHtml(m.nome, m.quantidade || 1, path + '-' + idx)}</div>`;
    });
    html += `</div>`;
  }
  
  html += `</div>`;
  return html;
}

function bindTreeEvents() {
  document.querySelectorAll('.tree-node').forEach(node => {
    node.onclick = (e) => {
      e.stopPropagation();
      const name = node.dataset.name;
      const b = allBooks.find(bk => bk.nome === name);
      if(!b) return; // don't toggle raw base mats
      
      const path = node.dataset.path;
      const specificKey = '@' + path + '|' + name;
      const isSpec = node.dataset.spec === 'true';
      const isGlob = node.dataset.glob === 'true';
      
      if (isSpec) {
        owned = owned.filter(x => x !== specificKey);
      } else if (isGlob) {
        const idx = owned.indexOf(name);
        if (idx > -1) owned.splice(idx, 1);
      } else {
        owned.push(specificKey);
      }
      
      saveOwned();
      
      const rootName = document.getElementById('treeTitleName').textContent.replace('Árvore: ', '');
      currentGlobalPool = {};
      owned.forEach(x => {
        if (!x.startsWith('@')) currentGlobalPool[x] = (currentGlobalPool[x] || 0) + 1;
      });
      document.getElementById('craftTreeContainer').innerHTML = buildTreeNodeHtml(rootName, 1, rootName);
      bindTreeEvents();
      updateTreeCosts(rootName);
    };
  });
}

function updateTreeCosts(bookName) {
  const total = getTotalBaseCost(bookName);
  const rem = getBaseCost(bookName);
  
  let totalItems=0; Object.values(total).forEach(v=>totalItems+=v);
  let remItems=0; Object.values(rem).forEach(v=>remItems+=v);
  let pct = totalItems > 0 ? Math.round(((totalItems - remItems)/totalItems)*100) : 100;
  if(isOwned(bookName)||remItems===0) pct = 100;
  
  const panel = document.getElementById('treeCostPanel');
  const matsDiv = document.getElementById('treeCostMats');
  const bar = document.getElementById('treeProgressBar');
  
  if(Object.keys(rem).length === 0) {
    panel.classList.remove('visible');
  } else {
    panel.classList.add('visible');
    matsDiv.innerHTML = '';
    
    Object.keys(rem).forEach(matName => {
      const bookRef = allBooks.find(b => b.materiais && b.materiais.some(m => m.nome === matName));
      const matInfo = bookRef ? bookRef.materiais.find(m => m.nome === matName) : null;
      const img = matInfo ? matInfo.imagem : '';
      
      matsDiv.innerHTML += `
        <div class="cost-mat-item">
          <img src="${img}" onerror="this.style.opacity=0.3">
          <div><span style="font-size:0.75rem">${matName}</span> <span class="cost-mat-qty" style="margin-left:0.5rem">${rem[matName]}x</span></div>
        </div>
      `;
    });
  }
  
  bar.style.width = pct + '%';
  if(pct === 100) bar.style.background = '#88c5ff';
  else bar.style.background = 'linear-gradient(90deg, var(--gold-dark), #88c5ff)';
}

// Presets
function savePresets() {
  localStorage.setItem('pw_presets', JSON.stringify(presets));
  renderPresets();
}

function renderPresets() {
  const list = document.getElementById('presetList');
  list.innerHTML = '';
  for (const name in presets) {
    const item = document.createElement('div');
    item.className = 'preset-item';
    item.innerHTML = `
      <span class="preset-item-name">${name}</span>
      <button class="preset-del" title="Excluir">✕</button>
    `;
    item.querySelector('.preset-item-name').onclick = () => {
      owned = [...presets[name]];
      saveOwned();
      renderAll();
      showToast(`Preset '${name}' carregado!`);
    };
    item.querySelector('.preset-del').onclick = () => {
      if(confirm(`Excluir preset '${name}'?`)) {
        delete presets[name];
        savePresets();
        showToast(`Preset excluido!`);
      }
    };
    list.appendChild(item);
  }
}

document.getElementById('savePresetBtn').onclick = () => {
  const input = document.getElementById('presetName');
  const name = input.value.trim();
  if(!name) { showToast('Digite um nome para o preset.'); return; }
  presets[name] = [...owned];
  savePresets();
  input.value = '';
  showToast(`Preset '${name}' salvo!`);
};

// Import/Export
document.getElementById('exportBtn').onclick = () => {
  const data = JSON.stringify({ owned, presets });
  const b64 = btoa(unescape(encodeURIComponent(data)));
  navigator.clipboard.writeText(b64);
  showToast('Código copiado para a área de transferência!');
};

document.getElementById('importBtn').onclick = () => {
  const b64 = prompt('Cole o código exportado:');
  if(!b64) return;
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if(data.owned) owned = data.owned;
    if(data.presets) presets = data.presets;
    saveOwned();
    savePresets();
    renderAll();
    showToast('Dados importados com sucesso!');
  } catch(e) {
    showToast('Código inválido. Tente novamente.');
  }
};

renderAll();
