const db = require('./db');
const { hashPassword } = require('./auth-utils');

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

const data = db.load();

if (!data.admins.find((a) => a.username === ADMIN_USER)) {
  data.admins.push({
    id: db.nextId(data, 'admin'),
    username: ADMIN_USER,
    passwordHash: hashPassword(ADMIN_PASS),
  });
  console.log(`Created admin account -> username: ${ADMIN_USER}  password: ${ADMIN_PASS}`);
} else {
  console.log('Admin account already exists, skipping.');
}

if (data.menuItems.length === 0) {
  const items = [
    ['Chicken Karahi', 'Half karahi, cooked in tomato-ginger base', 1200, 'Mains'],
    ['Beef Seekh Kabab (6pc)', 'Charcoal grilled, served with mint chutney', 650, 'Starters'],
    ['Dal Makhani', 'Slow-cooked black lentils, finished with cream', 450, 'Mains'],
    ['Chicken Biryani (Plate)', 'Basmati rice, house spice mix, salan on the side', 380, 'Rice'],
    ['Garlic Naan', 'Tandoor-baked, brushed with garlic butter', 90, 'Bread'],
    ['Kashmiri Chai', 'Pink tea, served hot', 150, 'Drinks'],
    ['Gulab Jamun (2pc)', 'Warm, soaked in rose syrup', 180, 'Desserts'],
  ];
  items.forEach(([name, description, price, category], i) => {
    data.menuItems.push({
      id: db.nextId(data, 'menuItem'),
      name,
      description,
      price,
      category,
      available: true,
      sort_order: i,
    });
  });
  console.log(`Seeded ${items.length} menu items.`);
} else {
  console.log('Menu already has items, skipping seed.');
}

db.save(data);