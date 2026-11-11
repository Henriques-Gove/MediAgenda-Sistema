/** Validade máxima de uma palavra-passe, em dias. */
export const PRAZO_PASSWORD_DIAS = 180;

export const REQUISITOS_PASSWORD = [
  'Pelo menos 8 caracteres.',
  'Pelo menos uma letra maiúscula.',
  'Pelo menos uma letra minúscula.',
  'Pelo menos um número.',
  'Pelo menos um caractere especial.',
];

export function validarPassword(password: string): string[] {
  const erros: string[] = [];
  if (!password || password.length < 8) erros.push(REQUISITOS_PASSWORD[0]);
  if (!/[A-Z]/.test(password)) erros.push(REQUISITOS_PASSWORD[1]);
  if (!/[a-z]/.test(password)) erros.push(REQUISITOS_PASSWORD[2]);
  if (!/[0-9]/.test(password)) erros.push(REQUISITOS_PASSWORD[3]);
  if (!/[^A-Za-z0-9]/.test(password)) erros.push(REQUISITOS_PASSWORD[4]);
  return erros;
}

export function passwordExpirada(data: Date | string | null | undefined, agora = new Date()): boolean {
  if (!data) return false;
  const alteradaEm = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(alteradaEm.getTime())) return false;
  const limite = new Date(agora.getTime() - PRAZO_PASSWORD_DIAS * 24 * 60 * 60 * 1000);
  return alteradaEm < limite;
}
