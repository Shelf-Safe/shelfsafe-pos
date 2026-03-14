const state = {
  token: null,
  inventory: [],
  inventoryMap: new Map(),
  cursor: 0,
  pollHandle: null,
  search: '',
  itemCount: 250
}

const els = {
  loginView: document.getElementById('loginView'),
  dashboardView: document.getElementById('dashboardView'),
  loginForm: document.getElementById('loginForm'),
  username: document.getElementById('username'),
  password: document.getElementById('password'),
  loginError: document.getElementById('loginError'),
  inventoryBody: document.getElementById('inventoryBody'),
  activityFeed: document.getElementById('activityFeed'),
  totalItems: document.getElementById('totalItems'),
  totalUnits: document.getElementById('totalUnits'),
  pendingEntityChanges: document.getElementById('pendingEntityChanges'),
  lastCycleAt: document.getElementById('lastCycleAt'),
  forceChangeBtn: document.getElementById('forceChangeBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  searchInput: document.getElementById('searchInput'),
  collectionCounts: document.getElementById('collectionCounts'),
  itemCountInput: document.getElementById('itemCountInput'),
  applyConfigBtn: document.getElementById('applyConfigBtn'),
  configMessage: document.getElementById('configMessage')
}

function fmtDate (value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function getBadge (status) {
  if (status === 'In Stock') return '<span class="badge good">In Stock</span>'
  if (status === 'Low Stock') return '<span class="badge warn">Low Stock</span>'
  return `<span class="badge bad">${status}</span>`
}

async function api (path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }
  if (state.token) headers.Authorization = `Bearer ${state.token}`

  const response = await fetch(path, { ...options, headers })
  const data = await response.json()
  if (!response.ok) throw new Error(data.message || 'Request failed')
  return data
}

function renderCollectionCounts (collectionCounts = {}) {
  els.collectionCounts.innerHTML = Object.entries(collectionCounts)
    .map(
      ([key, value]) =>
        `<div class="count-tile"><span>${key}</span><strong>${value}</strong></div>`
    )
    .join('')
}

function renderInventory (changedIds = new Map()) {
  const filter = state.search.trim().toLowerCase()
  const rows = state.inventory
    .filter(item => {
      if (!filter) return true
      return [
        item.medicationName,
        item.sku,
        item.barcodeData,
        item.batchLotNumber
      ].some(value =>
        String(value || '')
          .toLowerCase()
          .includes(filter)
      )
    })
    .sort((a, b) => a.medicationName.localeCompare(b.medicationName))
    .map(item => {
      const change = changedIds.get(item.id)
      const rowClass = change
        ? change.delta >= 0
          ? 'flash-up'
          : 'flash-down'
        : ''
      const stockCell = change
        ? `<span class="delta ${change.delta >= 0 ? 'up' : 'down'}">${
            item.currentStock
          } (${change.delta >= 0 ? '+' : ''}${change.delta})</span>`
        : item.currentStock
      const imageCell = item.imageUrl
        ? `<img class="thumb" src="${item.imageUrl}" alt="${item.medicationName}" />`
        : '<div class="thumb-fallback">N/A</div>'

      return `
        <tr class="${rowClass}">
          <td>${item.medicationName}</td>
          <td>${item.sku}</td>
          <td>${item.batchLotNumber}</td>
          <td>${item.category}</td>
          <td>${stockCell}</td>
          <td>${getBadge(item.status)}</td>
          <td>${imageCell}</td>
          <td>${fmtDate(item.updatedAt)}</td>
        </tr>
      `
    })
    .join('')

  els.inventoryBody.innerHTML =
    rows || '<tr><td colspan="8">No matching items.</td></tr>'
}

function renderActivity (items = []) {
  els.activityFeed.innerHTML = items
    .map(
      item => `
      <div class="activity-item">
        <div class="row"><strong>${
          item.medicationName
        }</strong><span class="delta ${item.delta >= 0 ? 'up' : 'down'}">${
        item.delta >= 0 ? '+' : ''
      }${item.delta}</span></div>
        <div class="row"><span>${item.changeType}</span><small>${fmtDate(
        item.changedAt
      )}</small></div>
        <small>${item.note || ''}</small>
      </div>
    `
    )
    .join('')
}

function renderStats (sync = {}, inventory = state.inventory) {
  const totalUnits = inventory.reduce(
    (sum, item) => sum + Number(item.currentStock || 0),
    0
  )
  state.itemCount = sync.itemCount || state.itemCount || inventory.length
  els.totalItems.textContent = inventory.length
  els.totalUnits.textContent = totalUnits
  els.pendingEntityChanges.textContent = sync.pendingEntityChanges ?? 0
  els.lastCycleAt.textContent = fmtDate(sync.lastCycleAt)
  if (els.itemCountInput) els.itemCountInput.value = state.itemCount
}

async function loadInitialData () {
  const [configResponse, statusResponse, activityResponse, bootstrapResponse] =
    await Promise.all([
      api('/api/simulator/config'),
      api('/api/simulator/status'),
      api('/api/activity?limit=12'),
      api('/api/bootstrap/full-dataset')
    ])

  state.itemCount = configResponse.config.itemCount
  if (els.itemCountInput) els.itemCountInput.value = state.itemCount

  const inventoryResponse = await api(`/api/inventory?limit=${state.itemCount}`)
  state.inventory = inventoryResponse.items || []
  state.inventoryMap = new Map(state.inventory.map(item => [item.id, item]))
  state.cursor = 0

  renderInventory()
  renderStats(statusResponse.sync, state.inventory)
  renderActivity(activityResponse.items || [])
  renderCollectionCounts(
    bootstrapResponse.collectionCounts || statusResponse.collectionCounts || {}
  )
}

async function pollChanges () {
  try {
    const [changesResponse, statusResponse, activityResponse] =
      await Promise.all([
        api(`/api/inventory/changes?cursor=${state.cursor}`),
        api('/api/simulator/status'),
        api('/api/activity?limit=12')
      ])

    const changedIds = new Map()
    ;(changesResponse.changes || []).forEach(change => {
      const item = state.inventoryMap.get(change.productId)
      if (!item) return
      item.currentStock = change.newStock
      item.updatedAt = change.changedAt
      item.status = change.status
      item.risk = change.risk
      changedIds.set(item.id, change)
    })

    state.cursor = changesResponse.nextCursor || state.cursor
    renderInventory(changedIds)
    renderStats(statusResponse.sync, state.inventory)
    renderActivity(activityResponse.items || [])
    renderCollectionCounts(statusResponse.collectionCounts || {})
  } catch (error) {
    console.error(error)
  }
}

async function login (event) {
  event.preventDefault()
  els.loginError.textContent = ''

  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: els.username.value.trim(),
        password: els.password.value
      })
    })

    state.token = data.token
    els.loginView.classList.add('hidden')
    els.dashboardView.classList.remove('hidden')
    await loadInitialData()

    if (state.pollHandle) clearInterval(state.pollHandle)
    state.pollHandle = setInterval(pollChanges, 3000)
  } catch (error) {
    els.loginError.textContent = error.message
  }
}

async function forceChange () {
  await api('/api/simulator/force-change', { method: 'POST' })
  await pollChanges()
}

async function applyItemCount () {
  els.configMessage.textContent = ''
  const nextCount = Number(els.itemCountInput.value)

  if (!Number.isFinite(nextCount) || nextCount < 25 || nextCount > 1000) {
    els.configMessage.textContent = 'Enter a value between 25 and 1000.'
    return
  }

  try {
    els.applyConfigBtn.disabled = true
    await api('/api/simulator/config', {
      method: 'POST',
      body: JSON.stringify({ itemCount: nextCount })
    })

    state.search = ''
    els.searchInput.value = ''
    await loadInitialData()
    els.configMessage.textContent = `Simulator reset to ${nextCount} items.`
  } catch (error) {
    els.configMessage.textContent = error.message
  } finally {
    els.applyConfigBtn.disabled = false
  }
}

function logout () {
  state.token = null
  state.inventory = []
  state.inventoryMap = new Map()
  state.cursor = 0
  clearInterval(state.pollHandle)
  state.pollHandle = null
  els.dashboardView.classList.add('hidden')
  els.loginView.classList.remove('hidden')
}

els.loginForm.addEventListener('submit', login)
els.forceChangeBtn.addEventListener('click', forceChange)
els.applyConfigBtn.addEventListener('click', applyItemCount)
els.logoutBtn.addEventListener('click', logout)
els.searchInput.addEventListener('input', event => {
  state.search = event.target.value
  renderInventory()
})
