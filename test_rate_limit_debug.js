const { RollingWindow } = require('./dist/core/limits/RollingWindow.js');

const window = new RollingWindow({ windowMs: 60000 });

window.add(50);
console.log('After adding 50:');
console.log('- getTotal():', window.getTotal());
console.log('- getCount():', window.getCount());

window.add(30);
console.log('\nAfter adding 30:');
console.log('- getTotal():', window.getTotal());
console.log('- getCount():', window.getCount());
