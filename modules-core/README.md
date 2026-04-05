All ARI core modules must be placed in the modules-core folder. This folder is overwritten during upgrades, and any changes made here will be lost.

All custom modules must be placed in the modules-custom folder. This folder is preserved during upgrades.

To modify a core module, duplicate it into the modules-custom folder and make your changes there. If a module with the same name exists in both folders, only the version in modules-custom will be loaded. This provides a safe way to customize core modules without losing changes during upgrades.