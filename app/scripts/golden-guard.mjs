// Guardián de la CI para las cifras de referencia (tests/golden):
// - REGISTRO.md solo puede crecer: las entradas de la rama base no se editan ni se borran;
// - si expected.json o legacy-allowlist.json cambian respecto de la base, debe existir una entrada nueva en el registro,
//   y el cambio se muestra en el resumen de la ejecución (y como aviso) para que nadie lo apruebe sin verlo.
// Uso: node scripts/golden-guard.mjs <ref-base>
import { execFileSync } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';

const base = process.argv[2];
const GOLDEN = 'app/tests/golden';
const FILES = [`${GOLDEN}/expected.json`, `${GOLDEN}/legacy-allowlist.json`];
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const show = (ref, file) => {
  try {
    return git('show', `${ref}:${file}`);
  } catch {
    return null;
  }
};
const rowsOf = (text) => (text ?? '').split('\n').filter((line) => /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(line));
const summary = async (text) =>
  process.env.GITHUB_STEP_SUMMARY && (await appendFile(process.env.GITHUB_STEP_SUMMARY, text + '\n'));

if (!base) {
  console.log('Sin rama base (ejecución manual): se omite la comparación del registro.');
  process.exit(0);
}
const root = git('rev-parse', '--show-toplevel').trim();
process.chdir(root);
const failures = [];
const baseRows = rowsOf(show(base, `${GOLDEN}/REGISTRO.md`));
const headRows = rowsOf(await readFile(`${GOLDEN}/REGISTRO.md`, 'utf8'));
baseRows.forEach((row, index) => {
  if (headRows[index] !== row) failures.push(`REGISTRO.md: la entrada ${index + 1} de la rama base fue modificada o eliminada.`);
});
const changed = FILES.filter((file) => show(base, file) !== (show('HEAD', file) ?? null));
if (changed.length) {
  if (headRows.length <= baseRows.length) failures.push(`Cambiaron ${changed.join(', ')} sin una entrada nueva en REGISTRO.md.`);
  const newEntries = headRows.slice(baseRows.length);
  const diff =
    git('diff', '--stat', base, 'HEAD', '--', ...FILES) +
    '\n' +
    git('diff', '-U1', base, 'HEAD', '--', `${GOLDEN}/expected.json`);
  console.log(
    `::warning title=Cifras de referencia modificadas::${changed.join(', ')} cambió respecto de ${base}. Revise la justificación en REGISTRO.md.`,
  );
  await summary(
    `## ⚠️ Cifras de referencia modificadas respecto de \`${base}\`\n\n` +
      `Archivos: ${changed.map((f) => '`' + f + '`').join(', ')}\n\nEntradas nuevas del registro:\n\n` +
      newEntries.map((row) => '    ' + row).join('\n') +
      '\n\n<details><summary>Diferencias</summary>\n\n```diff\n' +
      diff.slice(0, 60000) +
      '\n```\n</details>\n',
  );
} else {
  console.log('Las cifras de referencia no cambiaron respecto de la base.');
  await summary(`Cifras de referencia sin cambios respecto de \`${base}\`.`);
}
if (failures.length) {
  failures.forEach((failure) => console.error('FALLA · ' + failure));
  process.exitCode = 1;
}
