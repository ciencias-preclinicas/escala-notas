/*
 * Cohen modificado (Taylor, 2011): misma fórmula que Cohen, con percentil 90 y
 * multiplicador 0,65. Usar el P90 en lugar del P95 reduce el peso de un único
 * resultado sobresaliente.
 */
(function (root) {
  'use strict';

  const Metodos = typeof require === 'function' ? require('./index.js') : root.Metodos;
  const Cohen = typeof require === 'function' ? require('./cohen.js') : root.MetodoCohen;

  const metodo = Cohen.construir({
    id: 'cohen-mod',
    nombre: 'Cohen modificado',
    descripcionCorta: 'Variante más estable: 65 % del percentil 90 del curso.',
    referenciaBibliografica:
      'Taylor CA. Development of a modified Cohen method of standard setting. Med Teach. 2011;33(12):e678-e682.',
    percentil: 0.90,
    mult: 0.65,
    corregirAzar: false,
  });

  Metodos.registrar(metodo);
  if (typeof module === 'object' && module.exports) module.exports = metodo;
})(typeof window !== 'undefined' ? window : globalThis);
