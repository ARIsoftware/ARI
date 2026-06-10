1. All ARI core modules are placed in the modules-core folder. The modules-core folder is overwritten during upgrades, and any changes made in modules-core will be lost.

2. All custom modules you build or add must be placed in the modules-custom folder. The modules-custom folder is preserved during upgrades.

3. To modify a core module, duplicate it into the modules-custom folder and make your changes there. If a module with the same name exists in both folders, only the version in modules-custom will be loaded. This provides a safe way to customize core modules without losing changes during upgrades.