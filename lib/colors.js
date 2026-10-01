// Un color estable por profesional, para distinguir turnos de un vistazo.
//
// El color se deriva del id de la profesional, así que es el mismo en la agenda
// del centro, en la agenda de cada una y en cualquier lado que se pinte un
// turno. No necesita columna ni configuración: agregar una profesional no
// requiere elegirle un color.
//
// Si algún día se quiere elegir a mano, alcanza con guardar un hex en
// employees.color (ver migration 003) y este módulo lo respeta: el color
// guardado gana sobre el derivado.

const PALETTE = [
  '#b56576', // rosa viejo
  '#6b8f71', // verde salvia
  '#4a7ba7', // azul
  '#c08552', // terracota
  '#8e6bbf', // violeta
  '#c9a227', // mostaza
  '#5b8c9e', // verde azulado
  '#b5651d', // terracota oscura
  '#9b4f6f', // ciruela
  '#3f7d3f', // verde bosque
  '#7a6a9b', // gris violáceo
  '#a0522d', // siena
];

// Sin profesional asignado: neutro, para que no compita con los colores.
const SIN_PROFESIONAL = '#9a9a9a';

function hash(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) {
    h = (h * 31 + String(str).charCodeAt(i)) >>> 0;
  }
  return h;
}

// Devuelve { color, bg, text } para que el turno se pinte con fondo suave y
// texto legible. `bg` es el color con poco contraste y `text` el color fuerte.
function forEmployee(employee) {
  const id = employee?.id;
  const elegido = typeof employee?.color === 'string' && /^#[0-9a-f]{6}$/i.test(employee.color)
    ? employee.color
    : id
      ? PALETTE[hash(id) % PALETTE.length]
      : SIN_PROFESIONAL;

  return {
    color: elegido,
    bg: elegido + '1f',
    border: elegido + '55',
    text: elegido
  };
}

module.exports = { PALETTE, SIN_PROFESIONAL, forEmployee };
