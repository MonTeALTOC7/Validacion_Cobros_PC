// Detecta etiquetas JSX en minúscula que en realidad son variables (componentes) del ámbito.
const fs = require('fs'); const path = require('path');
const parser = require(require.resolve('@babel/parser', { paths: [process.cwd() + '/node_modules/vite', process.cwd()] }));
const traverse = require(require.resolve('@babel/traverse', { paths: [process.cwd() + '/node_modules/vite', process.cwd()] })).default;
const files = process.argv.slice(2);
let issues = 0;
for (const f of files) {
  const ast = parser.parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  traverse(ast, { JSXOpeningElement(p) { const n = p.node.name; if (n.type === 'JSXIdentifier' && /^[a-z]/.test(n.name) && p.scope.hasBinding(n.name)) { issues++; console.log(`${f}:${n.loc.start.line} <${n.name}> es variable en el ámbito`); } } });
}
console.log('problemas:', issues);
