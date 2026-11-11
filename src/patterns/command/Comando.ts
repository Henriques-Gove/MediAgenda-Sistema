/** Padrao Command: cada accao critica e um objeto que se sabe descrever. */
export interface Comando<T = void> {
  descricao(): string;
  executar(): Promise<T>;
}
