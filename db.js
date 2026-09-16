const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

function defaultData() {
  return {
    admins: [],
    menuItems: [],
    orders: [],
    nextIds: { admin: 1, menuItem: 1, order: 1 },
  };
}

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    save(defaultData());
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function nextId(data, kind) {
  const id = data.nextIds[kind];
  data.nextIds[kind] = id + 1;
  return id;
}

module.exports = { load, save, nextId };