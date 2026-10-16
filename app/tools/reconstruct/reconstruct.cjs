// Reconstruye fuente modular a partir de la salida de wakaru del bundle 8b3-1-1.
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

const SRC = process.argv[2];
const OUT = process.argv[3];
const code = fs.readFileSync(SRC, 'utf8');
const ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });

const DROP = new Set('ks As qe ua De Ma Os _a ws e b Ds He La Ps Is Ts Ms ss _s Ls H es Es Fe Z as Za Rs'.split(' '));
const ICONS = {
  Fs: 'ArrowDownToLine', Us: 'ArrowLeft', $s: 'ArrowUpRight', ts: 'ChartColumn', zs: 'ChevronLeft', ye: 'ChevronRight',
  Ne: 'CircleCheck', ns: 'ClipboardCheck', is: 'CloudUpload', Bs: 'Database', Sa: 'Download', qs: 'FileCheck2',
  aa: 'FileSearch', ja: 'FileSpreadsheet', Hs: 'FilterX', Vs: 'History', Gs: 'LayoutDashboard', Ws: 'Leaf', Xs: 'MapPin',
  Js: 'Menu', Qs: 'Printer', Ks: 'RefreshCw', rs: 'Search', Ys: 'Settings', Ee: 'ShieldCheck', ya: 'SlidersHorizontal',
  Je: 'Sprout', Zs: 'Tractor', sa: 'TriangleAlert', ls: 'Upload', et: 'Users', Te: 'X',
};
const RENAME = JSON.parse(fs.readFileSync(path.join(__dirname, 'names.json'), 'utf8'));
const MODULES = JSON.parse(fs.readFileSync(path.join(__dirname, 'modules.json'), 'utf8'));


// 0) Transformaciones seguras de desminificado
const splitSequence = (p, exprs, last) => {
  const stmts = exprs.map((e) => t.expressionStatement(e));
  if (last) stmts.push(last);
  if (Array.isArray(p.container)) p.replaceWithMultiple(stmts);
  else p.replaceWith(t.blockStatement(stmts));
};
traverse(ast, {
  UnaryExpression(p) {
    const n = p.node;
    if (n.operator === '!' && n.argument.type === 'NumericLiteral' && (n.argument.value === 0 || n.argument.value === 1)) {
      p.replaceWith(t.booleanLiteral(n.argument.value === 0));
    } else if (n.operator === 'void' && n.argument.type === 'NumericLiteral' && n.argument.value === 0 && !p.scope.getBinding('undefined')) {
      p.replaceWith(t.identifier('undefined'));
    }
  },
});
let changed = true;
while (changed) {
  changed = false;
  traverse(ast, {
    ExpressionStatement(p) {
      if (p.node.expression.type === 'SequenceExpression') { splitSequence(p, p.node.expression.expressions, null); changed = true; }
    },
    ReturnStatement(p) {
      const a = p.node.argument;
      if (a && a.type === 'SequenceExpression') {
        const ex = a.expressions.slice(0, -1);
        splitSequence(p, ex, t.returnStatement(a.expressions.at(-1)));
        changed = true;
      }
    },
    VariableDeclaration(p) {
      // const a = 1, b = 2;  ->  declaraciones separadas (dentro de funciones)
      if (p.node.declarations.length > 1 && Array.isArray(p.container) && p.parent.type !== 'Program' && p.parent.type !== 'ForStatement') {
        p.replaceWithMultiple(p.node.declarations.map((d) => t.variableDeclaration(p.node.kind, [d])));
        changed = true;
      }
    },
  });
}

// 1) Eliminar runtime/vendor y el polyfill/render final
ast.program.body = ast.program.body.filter((n) => {
  if (n.type === 'ImportDeclaration') return false;
  if (n.type === 'ExpressionStatement') return false;
  if (n.type === 'VariableDeclaration') {
    n.declarations = n.declarations.filter((d) => !(d.id.type === 'Identifier' && (DROP.has(d.id.name) || ICONS[d.id.name])));
    return n.declarations.length > 0;
  }
  if ((n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') && DROP.has(n.id.name)) return false;
  return true;
});

traverse.cache.clear();
// 2) Renombrar ligaduras de nivel superior (con alcance)
const REACT_HOOKS = new Set(['useState', 'useEffect', 'useMemo', 'useRef', 'useCallback', 'Fragment', 'StrictMode']);
traverse(ast, {
  Program(p) {
    const all = { ...RENAME };
    for (const [k, v] of Object.entries(all)) if (p.scope.hasOwnBinding(k)) p.scope.rename(k, v);
  },
});
// identificadores libres (vendor eliminados): iconos, XLSX, React
traverse(ast, {
  Identifier(p) {
    if (p.scope.hasBinding(p.node.name)) return;
    const n = p.node.name;
    if (ICONS[n] && p.isReferencedIdentifier()) p.node.name = ICONS[n];
    else if (n === 'Fe' && p.isReferencedIdentifier()) p.node.name = 'readWorkbook';
    else if (n === 'as' && p.isReferencedIdentifier()) p.node.name = 'writeWorkbook';
    else if (n === 'Z' && p.isReferencedIdentifier()) p.node.name = 'XLSXUtils';
  },
  MemberExpression(p) {
    const o = p.node.object;
    if (o.type === 'Identifier' && o.name === 'b' && !p.scope.hasBinding('b') && REACT_HOOKS.has(p.node.property.name)) {
      p.replaceWith(t.identifier(p.node.property.name));
    }
  },
});

traverse.cache.clear();
// 3) jsx()/jsxs() -> JSX
const isJsxCall = (n) =>
  n && n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' &&
  n.callee.object.name === 'e' && ['jsx', 'jsxs'].includes(n.callee.property.name);
const isFragmentRef = (n) => n.type === 'MemberExpression' && n.object.type === 'Identifier' && n.object.name === 'e' && n.property.name === 'Fragment';
const toJsxName = (n) => {
  if (n.type === 'StringLiteral') return t.jsxIdentifier(n.value);
  if (n.type === 'Identifier') return t.jsxIdentifier(n.name);
  if (n.type === 'MemberExpression' && !n.computed) return t.jsxMemberExpression(toJsxName(n.object), t.jsxIdentifier(n.property.name));
  return null;
};
const SAFE_TEXT = /^[^{}<>\n\r]+$/;
const childNode = (c) => {
  if (c.type === 'StringLiteral') {
    if (SAFE_TEXT.test(c.value) && c.value === c.value.trim() && !c.value.includes('&')) return t.jsxText(c.value);
    return t.jsxExpressionContainer(c);
  }
  if (c.type === 'JSXElement' || c.type === 'JSXFragment') return c;
  return t.jsxExpressionContainer(c);
};
traverse(ast, {
  CallExpression: {
    exit(p) {
      const n = p.node;
      if (!isJsxCall(n)) return;
      const [typeArg, propsArg, keyArg] = n.arguments;
      const fragment = isFragmentRef(typeArg);
      const name = fragment ? null : toJsxName(typeArg);
      if (!fragment && !name) return;
      const attrs = [];
      let children = [];
      if (propsArg && propsArg.type === 'ObjectExpression') {
        for (const prop of propsArg.properties) {
          if (prop.type === 'SpreadElement') { attrs.push(t.jsxSpreadAttribute(prop.argument)); continue; }
          const key = prop.key.type === 'Identifier' ? prop.key.name : prop.key.value;
          if (key === 'children') {
            const v = prop.value;
            children = v.type === 'ArrayExpression' ? v.elements : [v];
            continue;
          }
          const v = prop.value;
          let value;
          if (v.type === 'StringLiteral' && !/["\\\n]/.test(v.value)) value = t.stringLiteral(v.value);
          else value = t.jsxExpressionContainer(v);
          attrs.push(t.jsxAttribute(t.jsxIdentifier(key), value));
        }
      } else if (propsArg) {
        attrs.push(t.jsxSpreadAttribute(propsArg));
      }
      if (keyArg) attrs.unshift(t.jsxAttribute(t.jsxIdentifier('key'), t.jsxExpressionContainer(keyArg)));
      const kids = children.filter((c) => c !== null).map(childNode);
      if (fragment && attrs.length === 0) {
        p.replaceWith(t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), kids));
      } else {
        const tag = fragment ? t.jsxIdentifier('Fragment') : name;
        const selfClose = kids.length === 0;
        p.replaceWith(t.jsxElement(t.jsxOpeningElement(tag, attrs, selfClose), selfClose ? null : t.jsxClosingElement(tag), kids, selfClose));
      }
    },
  },
});

traverse.cache.clear();
// 4) Dividir en módulos con imports/exports automáticos
ast.program.body = ast.program.body.flatMap((n) =>
  n.type === 'VariableDeclaration' && n.declarations.length > 1 ? n.declarations.map((d) => t.variableDeclaration(n.kind, [d])) : [n],
);
const topNames = (node) => {
  if (node.type === 'VariableDeclaration') return node.declarations.map((d) => d.id.name);
  return [node.id.name];
};
const owner = new Map();
const chunks = new Map();
for (const node of ast.program.body) {
  const names = topNames(node);
  const file = MODULES[names[0]];
  if (!file) throw new Error('Sin módulo para ' + names.join(','));
  for (const nm of names) owner.set(nm, file);
  if (!chunks.has(file)) chunks.set(file, []);
  // dividir declaraciones múltiples en declaraciones separadas
  if (node.type === 'VariableDeclaration' && node.declarations.length > 1) {
    for (const d of node.declarations) {
      if (MODULES[d.id.name] && MODULES[d.id.name] !== file) throw new Error('Declaración múltiple dividida entre módulos: ' + d.id.name);
      chunks.get(file).push(t.variableDeclaration(node.kind, [d]));
    }
  } else chunks.get(file).push(node);
}
// referencias libres por chunk
const fileAst = t.file(t.program(ast.program.body));
const refs = new Map();
traverse(fileAst, {
  Identifier(p) {
    if (!p.isReferencedIdentifier()) return;
    const b = p.scope.getBinding(p.node.name);
    if (!b || b.scope.block.type !== 'Program') return;
    let top = p;
    while (top.parentPath && top.parentPath.node.type !== 'Program') top = top.parentPath;
    const names = topNames(top.node);
    const from = owner.get(names[0]);
    const to = owner.get(p.node.name);
    if (from !== to) {
      if (!refs.has(from)) refs.set(from, new Map());
      const m = refs.get(from);
      if (!m.has(to)) m.set(to, new Set());
      m.get(to).add(p.node.name);
    }
  },
  JSXIdentifier(p) {
    if (!(p.parentPath.isJSXOpeningElement() || p.parentPath.isJSXClosingElement() || p.parentPath.isJSXMemberExpression())) return;
    const nm = p.node.name;
    const b = p.scope.getBinding(nm);
    if (!b || b.scope.block.type !== 'Program') return;
    let top = p;
    while (top.parentPath && top.parentPath.node.type !== 'Program') top = top.parentPath;
    const from = owner.get(topNames(top.node)[0]);
    const to = owner.get(nm);
    if (from !== to) {
      if (!refs.has(from)) refs.set(from, new Map());
      const m = refs.get(from);
      if (!m.has(to)) m.set(to, new Set());
      m.get(to).add(nm);
    }
  },
});
const exported = new Map();
for (const [, m] of refs) for (const [to, set] of m) { if (!exported.has(to)) exported.set(to, new Set()); set.forEach((x) => exported.get(to).add(x)); }

const rel = (from, to) => {
  let r = path.relative(path.dirname(from), to).replace(/\.(jsx?|js)$/, '');
  if (!r.startsWith('.')) r = './' + r;
  return r;
};
const findFreeUses = (nodes, names) => {
  const src = generate(t.program(nodes)).code;
  return names.filter((n) => new RegExp('\\b' + n.replace('$', '\\$') + '\\b').test(src));
};
for (const [file, nodes] of chunks) {
  const exp = exported.get(file) ?? new Set();
  const body = nodes.map((n) => {
    const names = topNames(n);
    return names.some((x) => exp.has(x)) ? t.exportNamedDeclaration(n, []) : n;
  });
  const header = [];
  const src0 = generate(t.program(nodes)).code;
  const hooks = ['useState', 'useEffect', 'useMemo', 'useRef', 'useCallback', 'Fragment', 'StrictMode'].filter((h) => new RegExp('\\b' + h + '\\b').test(src0));
  if (hooks.length) header.push(`import { ${hooks.join(', ')} } from 'react';`);
  const icons = [...new Set(Object.values(ICONS))].filter((i) => new RegExp('<' + i + '\\b|\\b' + i + '\\b').test(src0));
  if (icons.length) header.push(`import { ${icons.join(', ')} } from 'lucide-react';`);
  const x = ['readWorkbook', 'writeWorkbook', 'XLSXUtils'].filter((h) => new RegExp('\\b' + h + '\\b').test(src0));
  if (x.length) header.push(`import { ${x.map((v) => ({ readWorkbook: 'read as readWorkbook', writeWorkbook: 'write as writeWorkbook', XLSXUtils: 'utils as XLSXUtils' })[v]).join(', ')} } from 'xlsx';`);
  if (/\bDexie\b/.test(src0)) header.push(`import Dexie from 'dexie';`);
  const m = refs.get(file) ?? new Map();
  for (const [to, set] of [...m].sort()) header.push(`import { ${[...set].sort().join(', ')} } from '${rel(file, to)}';`);
  const out = header.join('\n') + '\n\n' + generate(t.program(body), { jsescOption: { minimal: true } }).code + '\n';
  const dest = path.join(OUT, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
}
console.log('módulos', chunks.size);
