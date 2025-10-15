// Quick test to check if modules are loading
const { readdir, readFile } = require('fs/promises');
const { join } = require('path');

async function testLoad() {
  const modulesDir = join(process.cwd(), 'modules');
  console.log('Modules directory:', modulesDir);

  const entries = await readdir(modulesDir, { withFileTypes: true });
  const moduleDirs = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);

  console.log('Found directories:', moduleDirs);

  for (const dir of moduleDirs) {
    const manifestPath = join(modulesDir, dir, 'module.json');
    try {
      const content = await readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);
      console.log(`\n✓ ${dir}:`);
      console.log(`  ID: ${manifest.id}`);
      console.log(`  Name: ${manifest.name}`);
      console.log(`  Enabled: ${manifest.enabled}`);
    } catch (err) {
      console.log(`\n✗ ${dir}: ${err.message}`);
    }
  }
}

testLoad().catch(console.error);
