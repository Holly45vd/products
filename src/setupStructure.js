const fs = require('fs');
const path = require('path');

const structure = [
  'src/App.jsx',
  'src/firebase.js',
  'src/pages/CatalogPage.jsx',
  'src/pages/SavedPage.jsx',
  'src/components/ProductCard.jsx',
  'src/components/Navbar.jsx',
  'src/hooks/useSavedProducts.js',
  'src/styles/globals.css',
  'src/index.js',
];

structure.forEach((filePath) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '');
  }
});

console.log('📁 새 프로젝트 구조 생성 완료!');