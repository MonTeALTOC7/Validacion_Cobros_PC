// Renombra variables locales dentro de una función (por nombre de función), respetando el ámbito.
// Uso: node tools/rename-locals.cjs <archivo> <mapa.json>   mapa: { "NombreFuncion": { "viejo": "nuevo" } }
const fs = require('fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const [file, mapFile] = process.argv.slice(2);
const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
const code = fs.readFileSync(file, 'utf8');
const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
const done = new Set();
traverse(ast, {
  Function(p) {
    const name = p.node.id?.name ?? (p.parentPath.isVariableDeclarator() ? p.parentPath.node.id.name : null);
    const renames = name && map[name];
    if (!renames) return;
    for (const [from, to] of Object.entries(renames)) {
      const binding = p.scope.getBinding(from);
      if (!binding) { console.error(`AVISO ${name}: no existe la variable ${from}`); continue; }
      if (p.scope.hasBinding(to) && p.scope.getBinding(to) !== binding) { console.error(`ERROR ${name}: ${to} ya existe`); process.exitCode = 1; continue; }
      p.scope.rename(from, to);
      done.add(`${name}.${from}`);
    }
  },
});
// También renombra las propiedades destructuradas { rows: a } → { rows } cuando coinciden.
traverse(ast, {
  ObjectProperty(p) {
    if (p.parentPath.isObjectPattern() && !p.node.computed && p.node.key.type === 'Identifier' && p.node.value.type === 'Identifier' && p.node.key.name === p.node.value.name) p.node.shorthand = true;
  },
});
fs.writeFileSync(file, generate(ast, { retainLines: false, jsescOption: { minimal: true } }).code);
console.log('renombrados', done.size);
