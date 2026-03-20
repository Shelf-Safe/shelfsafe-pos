const crypto = require('crypto');
const baseMedications = require('./data/medications_dummy_data.json');

const APP_TAG = 'shelfsafe-pos-simulator';
const COLLECTIONS = {
  ORGANIZATIONS: 'organizations',
  USERS: 'users',
  LOCATIONS: 'locations',
  SUPPLIERS: 'suppliers',
  PRODUCTS: 'products',
  MEDICATIONS: 'medications',
  INVENTORY_LOTS: 'inventoryLots',
  STOCK_TXNS: 'stockTxns',
  ALERTS: 'alerts',
  NOTIFICATIONS: 'notifications',
  RECALLS: 'recalls',
  REPORTS: 'reports',
  AUDIT_LOGS: 'auditLogs'
};
const dosageForms = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Inhaler', 'Spray'];
const suppliers = [
  { name: 'Demo Supplier Inc.', contact: '+1-555-0101' },
  { name: 'HealthSource Rx', contact: '+1-555-0102' },
  { name: 'MedLine Wholesale', contact: '+1-555-0103' },
  { name: 'NorthCare Supply', contact: '+1-555-0104' },
  { name: 'PrimeDose Partners', contact: '+1-555-0105' }
];
const shelves = ['Aisle 1', 'Aisle 2', 'Aisle 3', 'Aisle 4', 'Cold Storage', 'Front Counter', 'Controlled Cabinet', 'Back Room'];
const packSizes = ['10ct', '12ct', '20ct', '24ct', '30ct', '60ct', '90ct', '100ct'];
const strengthVariants = ['5mg', '10mg', '20mg', '25mg', '40mg', '50mg', '100mg', '200mg', '250mg', '400mg', '500mg', '50mcg', '90mcg'];
const prefixes = ['Ultra', 'Plus', 'Care', 'Max', 'Daily', 'Prime', 'Advanced', 'Relief'];
const suffixes = ['XR', 'IR', 'Forte', 'Adult', 'Junior', 'PM', 'DS', 'Plus'];
const notificationChannels = ['in_app', 'email'];
const transactionTypes = ['IN', 'OUT', 'ADJUST', 'MOVE'];

function createSeedMeta(runId, source, extra = {}) {
  return { appTag: APP_TAG, runId, source, createdAt: new Date().toISOString(), ...extra };
}
function hashInput(value) { return crypto.createHash('md5').update(value).digest('hex').slice(0, 8); }
function pick(list, index, offset = 0) { return list[(index + offset) % list.length]; }
function addDays(date, days) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function isoDate(date) { return new Date(date).toISOString(); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function inferForm(name, category, index) {
  const lower = `${name} ${category}`.toLowerCase();
  if (lower.includes('inhaler')) return 'Inhaler';
  if (lower.includes('spray')) return 'Spray';
  if (lower.includes('drops')) return 'Drops';
  if (lower.includes('ointment')) return 'Ointment';
  if (lower.includes('suspension') || lower.includes('syrup')) return 'Syrup';
  return pick(dosageForms, index);
}
function getExpiryDays(expiryDate) {
  return Math.ceil((new Date(expiryDate) - new Date()) / 86400000);
}
function statusFromStockAndExpiry(currentStock, expiryDate, reorderLevel = 8) {
  const diffDays = getExpiryDays(expiryDate);
  if (diffDays < 0) return { status: 'Expired', risk: 'High' };
  if (currentStock <= 0) return { status: 'Out of Stock', risk: diffDays <= 30 ? 'High' : 'Medium' };
  if (diffDays <= 60) return { status: 'Expiring Soon', risk: diffDays <= 21 ? 'High' : 'Medium' };
  if (currentStock <= Math.max(2, Math.floor(reorderLevel * 0.55))) return { status: 'Low Stock', risk: 'High' };
  if (currentStock <= reorderLevel) return { status: 'Low Stock', risk: 'Medium' };
  if (diffDays <= 120) return { status: 'In Stock', risk: 'Medium' };
  return { status: 'In Stock', risk: 'Low' };
}
function buildMedicationName(base, index) {
  const parts = base.medicationName.split(' ');
  const baseBrand = base.brandName || parts[0];
  const form = inferForm(base.medicationName, base.category, index);
  const strength = pick(strengthVariants, index, index % 3);
  const prefix = pick(prefixes, index);
  const suffix = pick(suffixes, index, 2);
  if (index % 5 === 0) return `${baseBrand} ${strength}`;
  if (index % 5 === 1) return `${prefix} ${baseBrand} ${strength}`;
  if (index % 5 === 2) return `${baseBrand} ${suffix} ${strength}`;
  if (index % 5 === 3) return `${baseBrand} ${form} ${strength}`;
  return `${prefix} ${baseBrand} ${form} ${strength}`;
}
function buildBalancedProfiles(count) {
  const expiryBuckets = [
    { key: 'safe', percent: 0.30, min: 121, max: 320 },
    { key: 'attention', percent: 0.22, min: 61, max: 120 },
    { key: 'criticalSoon', percent: 0.18, min: 1, max: 60 },
    { key: 'expired', percent: 0.12, min: -90, max: -1 },
    { key: 'thresholdMix', percent: 0.18, min: 30, max: 150 }
  ];
  const stockBuckets = [
    { key: 'healthy', percent: 0.22, min: 28, max: 75 },
    { key: 'attention', percent: 0.22, min: 12, max: 24 },
    { key: 'low', percent: 0.23, min: 5, max: 9 },
    { key: 'veryLow', percent: 0.13, min: 1, max: 4 },
    { key: 'out', percent: 0.08, min: 0, max: 0 },
    { key: 'mixed', percent: 0.12, min: 6, max: 32 }
  ];

  function expandBuckets(buckets) {
    const list = [];
    buckets.forEach((bucket) => {
      const size = Math.round(count * bucket.percent);
      for (let i = 0; i < size; i += 1) list.push(bucket.key);
    });
    while (list.length < count) list.push(buckets[list.length % buckets.length].key);
    return list.slice(0, count);
  }

  const expiryList = expandBuckets(expiryBuckets);
  const stockList = expandBuckets(stockBuckets);
  const profiles = [];

  for (let index = 0; index < count; index += 1) {
    const expiryBucket = expiryBuckets.find((bucket) => bucket.key === expiryList[index]) || expiryBuckets[0];
    const stockBucket = stockBuckets.find((bucket) => bucket.key === stockList[index]) || stockBuckets[0];
    const reorderLevel = [6, 8, 10, 12, 14][index % 5];
    let expiryDays = randomInt(expiryBucket.min, expiryBucket.max);
    if (expiryBucket.key === 'thresholdMix') {
      const mix = [58, 62, 89, 118, 121, 15, -3, 145][index % 8];
      expiryDays = mix + (index % 3) - 1;
    }

    let currentStock = randomInt(stockBucket.min, stockBucket.max);
    if (stockBucket.key === 'mixed') {
      const mixed = [7, 10, 14, 18, 25, 32, 2, 0, 42][index % 9];
      currentStock = mixed;
    }

    if (expiryDays < 0 && currentStock > 0 && index % 3 === 0) currentStock = randomInt(0, Math.max(2, reorderLevel - 2));
    if (expiryDays <= 21 && currentStock > reorderLevel + 6) currentStock = randomInt(Math.max(1, reorderLevel - 3), reorderLevel + 2);
    if (stockBucket.key === 'healthy' && expiryDays <= 60) expiryDays = randomInt(70, 180);
    if (stockBucket.key === 'out') currentStock = 0;

    const { status, risk } = statusFromStockAndExpiry(currentStock, addDays(new Date(), expiryDays), reorderLevel);
    profiles.push({ expiryDays, currentStock, reorderLevel, status, risk, expiryBucket: expiryBucket.key, stockBucket: stockBucket.key });
  }

  return profiles.sort((a, b) => {
    const order = { expired: 0, criticalSoon: 1, thresholdMix: 2, attention: 3, safe: 4 };
    return order[a.expiryBucket] - order[b.expiryBucket];
  });
}
function makeTemplateRecord(base, index, runId, organizationId, profile) {
  const shelfName = pick(shelves, index, index % 4);
  const supplier = pick(suppliers, index, base.medicationName.length % suppliers.length);
  const form = inferForm(base.medicationName, base.category, index);
  const medicationName = buildMedicationName(base, index);
  const baseDate = new Date();
  const expiryDate = addDays(baseDate, profile.expiryDays);
  const receivedAt = addDays(expiryDate, -1 * (45 + (index % 70)));
  const openedAt = profile.currentStock > 0 ? addDays(receivedAt, 5 + (index % 20)) : null;
  const barcode = String(100000000000 + index).padStart(12, '0');
  const sku = `${base.sku.split('-')[0]}-${pick(packSizes, index).replace('ct', '')}-${String(index + 1).padStart(3, '0')}`;
  const lotCode = `LOT-${base.sku.split('-')[0]}-${new Date().getFullYear()}-${String(index + 1).padStart(4, '0')}`;
  const normalizedName = medicationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const medicationKey = `${normalizedName}-${hashInput(`${base.medicationName}-${index}`)}`;
  const locationKey = shelfName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const supplierKey = supplier.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const statusMeta = statusFromStockAndExpiry(profile.currentStock, expiryDate, profile.reorderLevel);
  return {
    seedIndex: index,
    organizationId,
    medicationKey,
    locationKey,
    supplierKey,
    profile,
    raw: {
      orgId: organizationId,
      medicationName,
      brandName: base.brandName,
      genericName: base.medicationName,
      form,
      category: base.category,
      sku,
      barcodeData: barcode,
      batchLotNumber: lotCode,
      expiryDate: isoDate(expiryDate),
      currentStock: profile.currentStock,
      reorderLevel: profile.reorderLevel,
      supplierName: supplier.name,
      supplierContact: supplier.contact,
      status: statusMeta.status,
      risk: statusMeta.risk,
      shelfId: shelfName,
      photoUrl: base.photoUrl,
      receivedAt: isoDate(receivedAt),
      openedAt: openedAt ? isoDate(openedAt) : null,
      notes: `Generated from template ${base.medicationName}`,
      demoProfile: {
        expiryBucket: profile.expiryBucket,
        stockBucket: profile.stockBucket,
        expiryDays: profile.expiryDays
      },
      seedMeta: createSeedMeta(runId, 'generated-template', { templateName: base.medicationName })
    }
  };
}
function buildReports(records, organizationId, runId) {
  const total = records.length;
  const summary = { total, expired: 0, expiringSoon: 0, lowStock: 0, outOfStock: 0, inStock: 0, riskHigh: 0, riskMedium: 0, riskLow: 0, categories: {}, suppliers: {} };
  for (const item of records) {
    const { category, status, supplierName, risk } = item.raw;
    summary.categories[category] = (summary.categories[category] || 0) + 1;
    summary.suppliers[supplierName] = (summary.suppliers[supplierName] || 0) + 1;
    if (risk === 'High') summary.riskHigh += 1;
    else if (risk === 'Medium') summary.riskMedium += 1;
    else summary.riskLow += 1;
    if (status === 'Expired') summary.expired += 1;
    else if (status === 'Expiring Soon') summary.expiringSoon += 1;
    else if (status === 'Low Stock') summary.lowStock += 1;
    else if (status === 'Out of Stock') summary.outOfStock += 1;
    else summary.inStock += 1;
  }
  return [
    { _id: `${organizationId}_inventory_overview`, orgId: organizationId, type: 'inventoryOverview', title: 'Inventory Overview', generatedAt: new Date().toISOString(), metrics: summary, seedMeta: createSeedMeta(runId, 'report', { reportType: 'inventoryOverview' }) },
    { _id: `${organizationId}_expiry_breakdown`, orgId: organizationId, type: 'expiryBreakdown', title: 'Expiry Breakdown', generatedAt: new Date().toISOString(), metrics: { expired: summary.expired, expiringSoon: summary.expiringSoon, healthy: summary.inStock + summary.lowStock + summary.outOfStock }, seedMeta: createSeedMeta(runId, 'report', { reportType: 'expiryBreakdown' }) },
    { _id: `${organizationId}_supplier_summary`, orgId: organizationId, type: 'supplierSummary', title: 'Supplier Summary', generatedAt: new Date().toISOString(), metrics: summary.suppliers, seedMeta: createSeedMeta(runId, 'report', { reportType: 'supplierSummary' }) }
  ];
}
function generateRecords({ count = 65 } = {}) {
  const runId = `seed_${Date.now()}`;
  const organizationId = 'dummy01';
  const safeCount = Math.max(1, Number(count || 1));
  const profiles = buildBalancedProfiles(safeCount);
  const sourceRecords = [];
  for (let index = 0; index < safeCount; index += 1) {
    const template = baseMedications[index % baseMedications.length];
    sourceRecords.push(makeTemplateRecord(template, index, runId, organizationId, profiles[index]));
  }

  const organizations = [];
  const users = [];
  const locations = [];
  const suppliersDocs = [];
  const products = [];
  const medications = [];
  const inventoryLots = [];
  const stockTxns = [];
  const alerts = [];
  const notifications = [];
  const recalls = [];
  const auditLogs = [];

  const organizationsMap = new Map();
  const usersMap = new Map();
  const locationsMap = new Map();
  const suppliersMap = new Map();

  for (const item of sourceRecords) {
    const currentOrganizationId = item.organizationId;
    const medicationId = `${currentOrganizationId}_${item.medicationKey}`;
    const productId = `${currentOrganizationId}_product_${item.medicationKey}`;
    const locationId = `${currentOrganizationId}_${item.locationKey}`;
    const supplierId = `${currentOrganizationId}_${item.supplierKey}`;
    const lotId = `${medicationId}_${hashInput(item.raw.batchLotNumber)}`;
    const adminUserId = `${currentOrganizationId}_seed_admin`;
    const managerUserId = `${currentOrganizationId}_inventory_manager`;
    const expiryDate = new Date(item.raw.expiryDate);
    const diffDays = getExpiryDays(expiryDate);

    if (!organizationsMap.has(currentOrganizationId)) organizationsMap.set(currentOrganizationId, { _id: currentOrganizationId, name: 'ShelfSafe Demo Pharmacy', type: 'pharmacy', timezone: 'America/Vancouver', status: 'active', seedMeta: createSeedMeta(runId, 'organization') });
    if (!usersMap.has(adminUserId)) usersMap.set(adminUserId, { _id: adminUserId, orgId: currentOrganizationId, fullName: 'Seed Admin', email: 'seed.admin@shelfsafe.local', role: 'admin', status: 'active', seedMeta: createSeedMeta(runId, 'user', { purpose: 'seed-admin' }) });
    if (!usersMap.has(managerUserId)) usersMap.set(managerUserId, { _id: managerUserId, orgId: currentOrganizationId, fullName: 'Inventory Manager', email: 'inventory.manager@shelfsafe.local', role: 'manager', status: 'active', seedMeta: createSeedMeta(runId, 'user', { purpose: 'inventory-manager' }) });
    if (!locationsMap.has(locationId)) locationsMap.set(locationId, { _id: locationId, orgId: currentOrganizationId, name: item.raw.shelfId, type: item.raw.shelfId.toLowerCase().includes('cold') ? 'cold-storage' : 'shelf', status: 'active', seedMeta: createSeedMeta(runId, 'location', { shelf: item.raw.shelfId }) });
    if (!suppliersMap.has(supplierId)) suppliersMap.set(supplierId, { _id: supplierId, orgId: currentOrganizationId, name: item.raw.supplierName, contactPhone: item.raw.supplierContact, email: `${item.supplierKey}@example-supplier.test`, status: 'active', seedMeta: createSeedMeta(runId, 'supplier', { supplierName: item.raw.supplierName }) });

    products.push({ _id: productId, orgId: currentOrganizationId, sku: item.raw.sku, barcodeData: item.raw.barcodeData, medicationId, name: item.raw.medicationName, brandName: item.raw.brandName, genericName: item.raw.genericName, category: item.raw.category, dosageForm: item.raw.form, supplierId, primaryLocationId: locationId, totalQuantityOnHand: item.raw.currentStock, expiryStatusSummary: { status: item.raw.status, risk: item.raw.risk, earliestExpiryDate: item.raw.expiryDate, expiringInDays: diffDays }, imageUrl: item.raw.photoUrl, photoUrl: item.raw.photoUrl, seedMeta: createSeedMeta(runId, 'product', { parentMedicationId: medicationId }) });
    medications.push({ _id: medicationId, orgId: currentOrganizationId, productId, locationId, supplierId, medicationName: item.raw.medicationName, brandName: item.raw.brandName, genericName: item.raw.genericName, category: item.raw.category, dosageForm: item.raw.form, sku: item.raw.sku, barcodeData: item.raw.barcodeData, batchLotNumber: item.raw.batchLotNumber, expiryDate: item.raw.expiryDate, expiryMonth: String(expiryDate.getUTCMonth() + 1).padStart(2, '0'), expiryYear: String(expiryDate.getUTCFullYear()), currentStock: item.raw.currentStock, quantityOnHand: item.raw.currentStock, reorderLevel: item.raw.reorderLevel, supplierName: item.raw.supplierName, supplierContact: item.raw.supplierContact, supplier: item.raw.supplierName, shelfId: item.raw.shelfId, shelf: item.raw.shelfId, status: item.raw.status, risk: item.raw.risk, imageUrl: item.raw.photoUrl, photoUrl: item.raw.photoUrl, receivedAt: item.raw.receivedAt, openedAt: item.raw.openedAt, searchText: [item.raw.medicationName, item.raw.brandName, item.raw.category, item.raw.form, item.raw.supplierName, item.raw.batchLotNumber].join(' ').toLowerCase(), notes: item.raw.notes, createdBy: adminUserId, seedMeta: item.raw.seedMeta });
    inventoryLots.push({ _id: lotId, orgId: currentOrganizationId, productId, medicationId, locationId, supplierId, batchLotNumber: item.raw.batchLotNumber, receivedAt: item.raw.receivedAt, openedAt: item.raw.openedAt, expiryDate: item.raw.expiryDate, quantityOnHand: item.raw.currentStock, currentStock: item.raw.currentStock, status: item.raw.status, risk: item.raw.risk, imageUrl: item.raw.photoUrl, seedMeta: createSeedMeta(runId, 'inventory-lot', { parentMedicationId: medicationId }) });

    const txCount = 2 + (item.seedIndex % 3);
    for (let i = 0; i < txCount; i += 1) {
      const type = pick(transactionTypes, item.seedIndex, i);
      stockTxns.push({ _id: `${lotId}_txn_${i + 1}`, orgId: currentOrganizationId, productId, medicationId, inventoryLotId: lotId, type, quantity: type === 'OUT' ? Math.min(5 + i, Math.max(1, item.raw.currentStock || 1)) : 5 + i, occurredAt: addDays(new Date(item.raw.receivedAt), i * 7).toISOString(), notes: `${type} transaction generated for testing`, createdBy: i % 2 === 0 ? adminUserId : managerUserId, seedMeta: createSeedMeta(runId, 'stock-txn', { parentMedicationId: medicationId }) });
    }

    if (['Expired', 'Expiring Soon', 'Low Stock', 'Out of Stock'].includes(item.raw.status)) {
      const alertType = item.raw.status === 'Expired' || item.raw.status === 'Expiring Soon' ? 'expiry' : 'stock';
      const alertId = `${medicationId}_${alertType}`;
      alerts.push({ _id: alertId, orgId: currentOrganizationId, productId, medicationId, inventoryLotId: lotId, type: alertType, severity: item.raw.risk.toLowerCase(), title: `${item.raw.status}: ${item.raw.medicationName}`, message: `${item.raw.medicationName} is marked as ${item.raw.status} with quantity ${item.raw.currentStock}.`, status: 'open', createdAt: new Date().toISOString(), seedMeta: createSeedMeta(runId, 'alert', { parentMedicationId: medicationId }) });
      notificationChannels.forEach((channel) => notifications.push({ _id: `${alertId}_${channel}`, orgId: currentOrganizationId, userId: managerUserId, alertId, channel, status: 'queued', title: `${item.raw.status} alert`, message: `${item.raw.medicationName} requires attention.`, createdAt: new Date().toISOString(), seedMeta: createSeedMeta(runId, 'notification', { parentMedicationId: medicationId }) }));
    }

    if (item.seedIndex % 17 === 0 || item.raw.status === 'Expired' || (item.raw.risk === 'High' && item.seedIndex % 9 === 0)) {
      recalls.push({ _id: `${productId}_recall`, orgId: currentOrganizationId, productId, medicationId, inventoryLotId: lotId, title: `Demo Recall - ${item.raw.medicationName}`, reason: `Demo only - ${item.raw.status.toLowerCase()} packaging issue`, status: item.seedIndex % 2 === 0 ? 'ACTIVE' : 'RESOLVED', issuedAt: addDays(new Date(), -(10 + (item.seedIndex % 20))).toISOString(), source: 'Health Authority (demo)', isDeleted: false, seedMeta: createSeedMeta(runId, 'recall', { parentMedicationId: medicationId }) });
    }

    auditLogs.push({ _id: `${medicationId}_audit_create`, orgId: currentOrganizationId, entityType: COLLECTIONS.MEDICATIONS, entityId: medicationId, action: 'create', actorId: adminUserId, createdAt: new Date().toISOString(), details: { medicationName: item.raw.medicationName, status: item.raw.status, currentStock: item.raw.currentStock, supplierName: item.raw.supplierName, shelfId: item.raw.shelfId }, seedMeta: createSeedMeta(runId, 'audit-log', { parentMedicationId: medicationId }) });
  }

  organizations.push(...organizationsMap.values());
  users.push(...usersMap.values());
  locations.push(...locationsMap.values());
  suppliersDocs.push(...suppliersMap.values());
  const reports = buildReports(sourceRecords, 'dummy01', runId);

  return {
    runId,
    sourceCount: safeCount,
    inventory: sourceRecords.map((item) => ({
      id: `${item.organizationId}_${item.medicationKey}`,
      externalProductId: `${item.organizationId}_product_${item.medicationKey}`,
      medicationId: `${item.organizationId}_${item.medicationKey}`,
      productId: `${item.organizationId}_product_${item.medicationKey}`,
      lotId: `${item.organizationId}_${item.medicationKey}_${hashInput(item.raw.batchLotNumber)}`,
      medicationName: item.raw.medicationName,
      brandName: item.raw.brandName,
      genericName: item.raw.genericName,
      sku: item.raw.sku,
      barcodeData: item.raw.barcodeData,
      batchLotNumber: item.raw.batchLotNumber,
      category: item.raw.category,
      supplierName: item.raw.supplierName,
      shelfId: item.raw.shelfId,
      currentStock: item.raw.currentStock,
      reorderLevel: item.raw.reorderLevel,
      form: item.raw.form,
      source: 'SIMULATED_POS',
      expiryDate: item.raw.expiryDate,
      updatedAt: new Date().toISOString(),
      status: item.raw.status,
      risk: item.raw.risk,
      imageUrl: item.raw.photoUrl,
      photoUrl: item.raw.photoUrl,
      organizationId: item.organizationId
    })),
    collections: {
      [COLLECTIONS.ORGANIZATIONS]: organizations,
      [COLLECTIONS.USERS]: users,
      [COLLECTIONS.LOCATIONS]: locations,
      [COLLECTIONS.SUPPLIERS]: suppliersDocs,
      [COLLECTIONS.PRODUCTS]: products,
      [COLLECTIONS.MEDICATIONS]: medications,
      [COLLECTIONS.INVENTORY_LOTS]: inventoryLots,
      [COLLECTIONS.STOCK_TXNS]: stockTxns,
      [COLLECTIONS.ALERTS]: alerts,
      [COLLECTIONS.NOTIFICATIONS]: notifications,
      [COLLECTIONS.RECALLS]: recalls,
      [COLLECTIONS.REPORTS]: reports,
      [COLLECTIONS.AUDIT_LOGS]: auditLogs
    }
  };
}

function createSimulator({ intervalMs = 15000, initialItemCount = 65, illusionMode = false, maxCatchUpCycles = 6 } = {}) {
  let configuredItemCount = clamp(Number(initialItemCount) || 65, 25, 1000);
  let seed = generateRecords({ count: configuredItemCount });
  let collections = seed.collections;
  let inventory = seed.inventory;
  let inventoryMap = new Map(inventory.map((item) => [item.id, item]));
  let collectionMaps = Object.fromEntries(Object.entries(collections).map(([name, docs]) => [name, new Map(docs.map((doc) => [doc._id, doc]))]));
  const activity = [];
  const inventoryChanges = [];
  const entityChanges = [];
  let cursor = 0;
  let lastCycleAt = new Date().toISOString();
  let lastBootstrapAt = new Date().toISOString();
  let lastAdvanceAt = new Date().toISOString();

  function reseed(itemCount = configuredItemCount) {
    configuredItemCount = clamp(Number(itemCount) || configuredItemCount, 25, 1000);
    seed = generateRecords({ count: configuredItemCount });
    collections = seed.collections;
    inventory = seed.inventory;
    inventoryMap = new Map(inventory.map((item) => [item.id, item]));
    collectionMaps = Object.fromEntries(Object.entries(collections).map(([name, docs]) => [name, new Map(docs.map((doc) => [doc._id, doc]))]));
    activity.length = 0;
    inventoryChanges.length = 0;
    entityChanges.length = 0;
    cursor = 0;
    lastCycleAt = new Date().toISOString();
    lastBootstrapAt = new Date().toISOString();
    lastAdvanceAt = new Date().toISOString();
    return { itemCount: configuredItemCount, sync: getSyncState(), collectionCounts: getCollectionCounts() };
  }

  function getCollectionCounts() {
    return Object.fromEntries(Object.entries(collectionMaps).map(([name, map]) => [name, map.size]));
  }
  function getInventory() { return inventory.map((item) => ({ ...item })); }
  function getInventoryCount() { return inventory.length; }
  function getConfig() { return { itemCount: configuredItemCount, minItemCount: 25, maxItemCount: 1000, intervalMs, illusionMode, maxCatchUpCycles }; }
  function getRecentActivity(limit = 25) { return activity.slice(0, limit).map((item) => ({ ...item })); }
  function getSyncState() { return { cursor, pendingInventoryChanges: inventoryChanges.length, pendingEntityChanges: entityChanges.length, lastCycleAt, lastBootstrapAt, lastAdvanceAt, intervalMs, itemCount: configuredItemCount, illusionMode }; }
  function getDashboardState() {
    const lowStockItems = inventory.filter((item) => item.currentStock <= item.reorderLevel && item.currentStock > 0).length;
    const outOfStockItems = inventory.filter((item) => item.currentStock === 0).length;
    const highRiskItems = inventory.filter((item) => item.risk === 'High').length;
    const expiringSoonItems = inventory.filter((item) => item.status === 'Expiring Soon' || item.status === 'Expired').length;
    const totalUnits = inventory.reduce((sum, item) => sum + item.currentStock, 0);
    return { inventoryCount: inventory.length, totalUnits, lowStockItems, outOfStockItems, highRiskItems, expiringSoonItems, recentActivity: getRecentActivity(10), sync: getSyncState(), collectionCounts: getCollectionCounts(), config: getConfig() };
  }
  function snapshotCollectionDoc(collectionName, id) {
    const doc = collectionMaps[collectionName].get(id);
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  }
  function pushEntityChange(collectionName, operation, document, relatedId, batchId) {
    cursor += 1;
    entityChanges.push({ cursor, changeId: `entity-${String(cursor).padStart(6, '0')}`, batchId, collection: collectionName, operation, relatedInventoryId: relatedId, changedAt: new Date().toISOString(), document: JSON.parse(JSON.stringify(document)) });
  }
  function replaceDoc(collectionName, document, relatedId, batchId, operation = 'upsert') {
    collectionMaps[collectionName].set(document._id, document);
    pushEntityChange(collectionName, operation, document, relatedId, batchId);
  }
  function removeDocsByPredicate(collectionName, predicate, relatedId, batchId) {
    const removed = [];
    for (const [id, doc] of collectionMaps[collectionName].entries()) {
      if (predicate(doc)) {
        removed.push({ ...doc });
        collectionMaps[collectionName].delete(id);
      }
    }
    removed.forEach((doc) => pushEntityChange(collectionName, 'delete', { _id: doc._id }, relatedId, batchId));
  }
  function makeAlertDocs(item) {
    const medId = item.medicationId;
    const alertType = item.status === 'Expired' || item.status === 'Expiring Soon' ? 'expiry' : 'stock';
    const alertId = `${medId}_${alertType}`;
    const alert = { _id: alertId, orgId: item.organizationId, productId: item.productId, medicationId: item.medicationId, inventoryLotId: item.lotId, type: alertType, severity: item.risk.toLowerCase(), title: `${item.status}: ${item.medicationName}`, message: `${item.medicationName} is marked as ${item.status} with quantity ${item.currentStock}.`, status: 'open', createdAt: new Date().toISOString(), seedMeta: createSeedMeta(seed.runId, 'alert-sync', { parentMedicationId: item.medicationId }) };
    const docs = notificationChannels.map((channel) => ({ _id: `${alertId}_${channel}`, orgId: item.organizationId, userId: `${item.organizationId}_inventory_manager`, alertId, channel, status: 'queued', title: `${item.status} alert`, message: `${item.medicationName} requires attention.`, createdAt: new Date().toISOString(), seedMeta: createSeedMeta(seed.runId, 'notification-sync', { parentMedicationId: item.medicationId }) }));
    return { alert, notifications: docs, alertId };
  }
  function maybeUpsertRecall(item, batchId) {
    const recallId = `${item.productId}_recall`;
    if (item.risk === 'High' && (item.status === 'Expired' || item.status === 'Expiring Soon' || item.currentStock === 0 || Math.random() < 0.12)) {
      const recall = { _id: recallId, orgId: item.organizationId, productId: item.productId, medicationId: item.medicationId, inventoryLotId: item.lotId, title: `Demo Recall - ${item.medicationName}`, reason: `Automated follow-up for ${item.status.toLowerCase()} inventory condition`, status: item.currentStock === 0 || item.status === 'Expired' ? 'ACTIVE' : 'RESOLVED', issuedAt: new Date().toISOString(), source: 'Health Authority (demo)', isDeleted: false, seedMeta: createSeedMeta(seed.runId, 'recall-sync', { parentMedicationId: item.medicationId }) };
      replaceDoc(COLLECTIONS.RECALLS, recall, item.id, batchId);
      return;
    }
    if (collectionMaps[COLLECTIONS.RECALLS].has(recallId) && item.risk === 'Low') {
      const existing = snapshotCollectionDoc(COLLECTIONS.RECALLS, recallId);
      existing.status = 'RESOLVED';
      existing.resolvedAt = new Date().toISOString();
      replaceDoc(COLLECTIONS.RECALLS, existing, item.id, batchId);
    }
  }
  function refreshReports(batchId, relatedId) {
    const sourceRecords = inventory.map((item) => ({ raw: { category: item.category, status: item.status, supplierName: item.supplierName, risk: item.risk } }));
    const nextReports = buildReports(sourceRecords, 'dummy01', seed.runId);
    nextReports.forEach((report) => replaceDoc(COLLECTIONS.REPORTS, report, relatedId, batchId));
    collections[COLLECTIONS.REPORTS] = [...collectionMaps[COLLECTIONS.REPORTS].values()];
  }
  function updateRelatedCollections(item, previousStock, newStock, changeType, note, batchId) {
    const product = snapshotCollectionDoc(COLLECTIONS.PRODUCTS, item.productId);
    product.totalQuantityOnHand = newStock;
    product.expiryStatusSummary = { status: item.status, risk: item.risk, earliestExpiryDate: item.expiryDate, expiringInDays: getExpiryDays(item.expiryDate) };
    replaceDoc(COLLECTIONS.PRODUCTS, product, item.id, batchId);

    const medication = snapshotCollectionDoc(COLLECTIONS.MEDICATIONS, item.medicationId);
    medication.currentStock = newStock;
    medication.quantityOnHand = newStock;
    medication.status = item.status;
    medication.risk = item.risk;
    medication.expiryDate = item.expiryDate;
    medication.expiryMonth = String(new Date(item.expiryDate).getUTCMonth() + 1).padStart(2, '0');
    medication.expiryYear = String(new Date(item.expiryDate).getUTCFullYear());
    medication.updatedAt = new Date().toISOString();
    replaceDoc(COLLECTIONS.MEDICATIONS, medication, item.id, batchId);

    const lot = snapshotCollectionDoc(COLLECTIONS.INVENTORY_LOTS, item.lotId);
    lot.currentStock = newStock;
    lot.quantityOnHand = newStock;
    lot.status = item.status;
    lot.risk = item.risk;
    lot.expiryDate = item.expiryDate;
    lot.updatedAt = new Date().toISOString();
    replaceDoc(COLLECTIONS.INVENTORY_LOTS, lot, item.id, batchId);

    const quantityDelta = Math.abs(newStock - previousStock);
    const txnId = `${item.lotId}_txn_live_${Date.now()}_${Math.floor(Math.random() * 999)}`;
    const txn = { _id: txnId, orgId: item.organizationId, productId: item.productId, medicationId: item.medicationId, inventoryLotId: item.lotId, type: changeType === 'SALE' ? 'OUT' : changeType === 'RESTOCK' ? 'IN' : 'ADJUST', quantity: quantityDelta === 0 ? 1 : quantityDelta, occurredAt: new Date().toISOString(), notes: note, createdBy: `${item.organizationId}_inventory_manager`, seedMeta: createSeedMeta(seed.runId, 'live-stock-txn', { parentMedicationId: item.medicationId }) };
    replaceDoc(COLLECTIONS.STOCK_TXNS, txn, item.id, batchId, 'insert');

    const audit = { _id: `${item.medicationId}_audit_${Date.now()}`, orgId: item.organizationId, entityType: COLLECTIONS.MEDICATIONS, entityId: item.medicationId, action: 'update', actorId: `${item.organizationId}_inventory_manager`, createdAt: new Date().toISOString(), details: { medicationName: item.medicationName, previousStock, newStock, changeType, status: item.status, expiryDate: item.expiryDate }, seedMeta: createSeedMeta(seed.runId, 'audit-log-sync', { parentMedicationId: item.medicationId }) };
    replaceDoc(COLLECTIONS.AUDIT_LOGS, audit, item.id, batchId, 'insert');

    const needsAlert = ['Expired', 'Expiring Soon', 'Low Stock', 'Out of Stock'].includes(item.status);
    removeDocsByPredicate(COLLECTIONS.ALERTS, (doc) => doc.medicationId === item.medicationId, item.id, batchId);
    removeDocsByPredicate(COLLECTIONS.NOTIFICATIONS, (doc) => doc.alertId && doc.alertId.startsWith(item.medicationId), item.id, batchId);
    if (needsAlert) {
      const { alert, notifications } = makeAlertDocs(item);
      replaceDoc(COLLECTIONS.ALERTS, alert, item.id, batchId);
      notifications.forEach((doc) => replaceDoc(COLLECTIONS.NOTIFICATIONS, doc, item.id, batchId, 'insert'));
    }
    maybeUpsertRecall(item, batchId);
    refreshReports(batchId, item.id);
  }
  function registerInventoryChange(item, previousStock, newStock, changeType, note, batchId, nextExpiryDate = item.expiryDate) {
    item.currentStock = newStock;
    item.expiryDate = nextExpiryDate;
    const statusMeta = statusFromStockAndExpiry(newStock, nextExpiryDate, item.reorderLevel);
    item.status = statusMeta.status;
    item.risk = statusMeta.risk;
    item.updatedAt = new Date().toISOString();
    inventoryMap.set(item.id, item);
    const changedAt = item.updatedAt;
    cursor += 1;
    const change = { cursor, changeId: `inv-${String(cursor).padStart(6, '0')}`, batchId, productId: item.id, externalProductId: item.externalProductId, sku: item.sku, barcodeData: item.barcodeData, batchLotNumber: item.batchLotNumber, medicationName: item.medicationName, previousStock, newStock, delta: newStock - previousStock, changeType, category: item.category, status: item.status, risk: item.risk, changedAt, note, imageUrl: item.imageUrl };
    inventoryChanges.push(change);
    activity.unshift(change);
    if (activity.length > 150) activity.length = 150;
    updateRelatedCollections(item, previousStock, newStock, changeType, note, batchId);
    change.cursor = cursor;
    return change;
  }
  function chooseScenario(item) {
    const expiryDays = getExpiryDays(item.expiryDate);
    if (item.currentStock === 0) return pick(['restock_from_zero', 'stay_zero', 'recently_expired'], randomInt(0, 2));
    if (expiryDays < 0) return pick(['restock_expired', 'stay_expired', 'zero_out_expired'], randomInt(0, 2));
    if (expiryDays <= 8) return pick(['newly_expired', 'sell_down', 'high_risk_restock'], randomInt(0, 2));
    if (item.currentStock <= Math.max(2, Math.floor(item.reorderLevel * 0.55))) return pick(['restock_low', 'sell_to_zero', 'push_expiry_closer'], randomInt(0, 2));
    if (item.currentStock <= item.reorderLevel) return pick(['restock_medium', 'sell_down', 'push_expiry_closer'], randomInt(0, 2));
    if (expiryDays <= 60) return pick(['sell_down', 'newly_expired', 'restock_keep_critical'], randomInt(0, 2));
    if (expiryDays <= 120) return pick(['push_expiry_closer', 'sell_down', 'restock_medium'], randomInt(0, 2));
    return pick(['sell_down', 'restock_small', 'stay_healthy', 'push_into_attention'], randomInt(0, 3));
  }
  function mutateItem(item, batchId) {
    const previousStock = item.currentStock;
    const previousExpiryDays = getExpiryDays(item.expiryDate);
    const scenario = chooseScenario(item);
    let nextStock = previousStock;
    let nextExpiryDate = item.expiryDate;
    let changeType = 'ADJUSTMENT';
    let note = 'Manual-style stock correction';

    if (scenario === 'restock_from_zero') {
      nextStock = randomInt(item.reorderLevel + 2, item.reorderLevel + 12);
      changeType = 'RESTOCK';
      note = `Restocked an out-of-stock item with ${nextStock} units.`;
    } else if (scenario === 'stay_zero') {
      nextStock = 0;
      nextExpiryDate = isoDate(addDays(new Date(item.expiryDate), -randomInt(1, 3)));
      note = 'Inventory reviewed; item remains out of stock.';
    } else if (scenario === 'recently_expired') {
      nextStock = previousStock;
      nextExpiryDate = isoDate(addDays(new Date(), -randomInt(1, 4)));
      note = 'Lot crossed expiry threshold during this cycle.';
    } else if (scenario === 'restock_expired') {
      nextStock = randomInt(item.reorderLevel + 3, item.reorderLevel + 16);
      nextExpiryDate = isoDate(addDays(new Date(), randomInt(110, 240)));
      changeType = 'RESTOCK';
      note = 'Expired lot replaced with fresh supplier inventory.';
    } else if (scenario === 'stay_expired') {
      nextStock = clamp(previousStock - randomInt(0, 2), 0, previousStock);
      nextExpiryDate = isoDate(addDays(new Date(item.expiryDate), -randomInt(0, 2)));
      note = 'Expired item stayed in quarantine stock.';
    } else if (scenario === 'zero_out_expired') {
      nextStock = 0;
      nextExpiryDate = isoDate(addDays(new Date(), -randomInt(4, 12)));
      changeType = 'SALE';
      note = 'Expired lot fully removed from available inventory.';
    } else if (scenario === 'newly_expired') {
      nextStock = clamp(previousStock - randomInt(0, 2), 0, previousStock);
      nextExpiryDate = isoDate(addDays(new Date(), -randomInt(1, 2)));
      note = 'Item moved from expiring soon to expired.';
    } else if (scenario === 'sell_down') {
      const decrease = randomInt(1, Math.max(2, Math.min(6, previousStock)));
      nextStock = clamp(previousStock - decrease, 0, previousStock);
      changeType = 'SALE';
      note = `Dispensed ${decrease} units via POS sales.`;
    } else if (scenario === 'high_risk_restock') {
      nextStock = randomInt(item.reorderLevel + 1, item.reorderLevel + 6);
      changeType = 'RESTOCK';
      note = 'Partial restock reduced stock risk, but expiry is still critical.';
    } else if (scenario === 'restock_low') {
      const increase = randomInt(8, 18);
      nextStock = previousStock + increase;
      changeType = 'RESTOCK';
      note = `Restocked ${increase} units after low-stock review.`;
    } else if (scenario === 'sell_to_zero') {
      nextStock = 0;
      changeType = 'SALE';
      note = 'Remaining units were sold, pushing item out of stock.';
    } else if (scenario === 'push_expiry_closer') {
      nextStock = previousStock;
      const daysToMove = previousExpiryDays > 120 ? randomInt(20, 45) : randomInt(8, 18);
      nextExpiryDate = isoDate(addDays(new Date(item.expiryDate), -daysToMove));
      note = `Inventory age advanced by ${daysToMove} days in the simulator.`;
    } else if (scenario === 'restock_medium') {
      const increase = randomInt(4, 12);
      nextStock = previousStock + increase;
      changeType = 'RESTOCK';
      note = `Moderate replenishment of ${increase} units.`;
    } else if (scenario === 'restock_keep_critical') {
      const increase = randomInt(2, 6);
      nextStock = previousStock + increase;
      changeType = 'RESTOCK';
      nextExpiryDate = isoDate(addDays(new Date(item.expiryDate), -randomInt(0, 3)));
      note = 'Stock improved slightly, but the lot remains close to expiry.';
    } else if (scenario === 'restock_small') {
      const increase = randomInt(2, 6);
      nextStock = previousStock + increase;
      changeType = 'RESTOCK';
      note = `Small supplier top-up of ${increase} units.`;
    } else if (scenario === 'push_into_attention') {
      nextStock = clamp(previousStock - randomInt(1, 3), 0, previousStock);
      nextExpiryDate = isoDate(addDays(new Date(item.expiryDate), -randomInt(25, 60)));
      changeType = 'ADJUSTMENT';
      note = 'Item moved closer to dashboard attention thresholds.';
    } else {
      nextStock = clamp(previousStock - randomInt(1, 3), 0, previousStock + 2);
      changeType = nextStock < previousStock ? 'SALE' : 'ADJUSTMENT';
      note = 'Normal inventory movement recorded.';
    }

    nextStock = clamp(nextStock, 0, 95);
    return registerInventoryChange(item, previousStock, nextStock, changeType, note, batchId, nextExpiryDate);
  }
  function pickMutationCandidates(count) {
    const buckets = {
      highRisk: inventory.filter((item) => item.risk === 'High'),
      mediumRisk: inventory.filter((item) => item.risk === 'Medium'),
      lowRisk: inventory.filter((item) => item.risk === 'Low'),
      lowStock: inventory.filter((item) => item.currentStock <= item.reorderLevel),
      safe: inventory.filter((item) => getExpiryDays(item.expiryDate) > 120 && item.currentStock > item.reorderLevel)
    };
    const selected = [];
    const used = new Set();
    const priorities = [buckets.highRisk, buckets.lowStock, buckets.mediumRisk, buckets.safe, buckets.lowRisk];
    let bucketIndex = 0;
    while (selected.length < count && bucketIndex < priorities.length * 3) {
      const bucket = priorities[bucketIndex % priorities.length];
      if (bucket.length) {
        const candidate = bucket[randomInt(0, bucket.length - 1)];
        if (!used.has(candidate.id)) {
          used.add(candidate.id);
          selected.push(candidate);
        }
      }
      bucketIndex += 1;
    }
    while (selected.length < count) {
      const candidate = inventory[randomInt(0, inventory.length - 1)];
      if (!used.has(candidate.id)) {
        used.add(candidate.id);
        selected.push(candidate);
      }
    }
    return selected;
  }
  function syncCollectionArrays() {
    [
      COLLECTIONS.PRODUCTS,
      COLLECTIONS.MEDICATIONS,
      COLLECTIONS.INVENTORY_LOTS,
      COLLECTIONS.STOCK_TXNS,
      COLLECTIONS.ALERTS,
      COLLECTIONS.NOTIFICATIONS,
      COLLECTIONS.RECALLS,
      COLLECTIONS.AUDIT_LOGS,
      COLLECTIONS.REPORTS
    ].forEach((name) => {
      collections[name] = [...collectionMaps[name].values()];
    });
  }
  function runMutationCycle(forced = false) {
    const batchId = `batch-${Date.now()}`;
    const count = forced ? randomInt(4, 7) : randomInt(3, 5);
    const targets = pickMutationCandidates(count);
    const changes = targets.map((item) => mutateItem(item, batchId));
    syncCollectionArrays();
    lastCycleAt = new Date().toISOString();
    return { batchId, forced, changedAt: lastCycleAt, count: changes.length, changes, affectedCollections: ['products', 'medications', 'inventoryLots', 'stockTxns', 'alerts', 'notifications', 'recalls', 'auditLogs', 'reports'] };
  }
  function getInventoryChangesSince(sinceCursor = 0) {
    const changes = inventoryChanges.filter((item) => item.cursor > sinceCursor);
    return { cursor, nextCursor: cursor, changeCount: changes.length, serverTime: new Date().toISOString(), changes };
  }
  function getEntityChangesSince(sinceCursor = 0) {
    const changes = entityChanges.filter((item) => item.cursor > sinceCursor);
    return { cursor, nextCursor: cursor, changeCount: changes.length, serverTime: new Date().toISOString(), changes, countsByCollection: changes.reduce((acc, item) => { acc[item.collection] = (acc[item.collection] || 0) + 1; return acc; }, {}) };
  }
  function getBootstrapPayload() {
    lastBootstrapAt = new Date().toISOString();
    return { bootstrapVersion: seed.runId, generatedAt: lastBootstrapAt, inventoryCount: inventory.length, collectionCounts: getCollectionCounts(), collections: Object.fromEntries(Object.entries(collectionMaps).map(([name, map]) => [name, [...map.values()].map((doc) => JSON.parse(JSON.stringify(doc)))])), sync: getSyncState() };
  }
  function clearChangeQueues() { inventoryChanges.length = 0; entityChanges.length = 0; }
  function advanceToNow(force = false) {
    const nowMs = Date.now();
    const lastMs = new Date(lastAdvanceAt || nowMs).getTime();
    const elapsedMs = Math.max(0, nowMs - lastMs);
    const naturalCycles = Math.floor(elapsedMs / intervalMs);
    const cycleCount = force ? Math.max(1, Math.min(maxCatchUpCycles, naturalCycles || 1)) : Math.min(maxCatchUpCycles, naturalCycles);
    if (cycleCount <= 0) return { cycleCount: 0, advancedTo: new Date(nowMs).toISOString() };
    for (let index = 0; index < cycleCount; index += 1) runMutationCycle(false);
    lastAdvanceAt = new Date(nowMs).toISOString();
    return { cycleCount, advancedTo: lastAdvanceAt };
  }
  if (!illusionMode) {
    setInterval(() => {
      runMutationCycle(false);
      lastAdvanceAt = new Date().toISOString();
    }, intervalMs);
  }
  return { getInventory, getInventoryCount, getRecentActivity, getInventoryChangesSince, getEntityChangesSince, getBootstrapPayload, getCollectionCounts, getSyncState, getDashboardState, clearChangeQueues, runMutationCycle, reseed, getConfig, advanceToNow };
}

module.exports = { createSimulator, COLLECTIONS };
