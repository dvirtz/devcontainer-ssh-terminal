import Module from 'node:module';
import * as path from 'node:path';

const originalRequire = Module.prototype.require;
Module.prototype.require = function (this: Module, id: string) {
  return originalRequire.call(this, id === 'vscode' ? path.join(__dirname, 'mocks', 'vscode.ts') : id);
} as typeof originalRequire;
