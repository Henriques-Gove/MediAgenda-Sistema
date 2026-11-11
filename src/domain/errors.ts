export class ErroAplicacao extends Error {
  constructor(
    mensagem: string,
    public readonly status = 400,
    public readonly codigo = 'ERRO_APLICACAO',
  ) {
    super(mensagem);
    this.name = new.target.name;
  }
}

export class ErroValidacao extends ErroAplicacao {
  constructor(
    mensagem: string,
    public readonly campos: Record<string, string> = {},
  ) {
    super(mensagem, 422, 'ERRO_VALIDACAO');
  }
}

export class ErroNaoAutenticado extends ErroAplicacao {
  constructor(mensagem = 'Precisa de iniciar sessao para continuar.') {
    super(mensagem, 401, 'NAO_AUTENTICADO');
  }
}

export class ErroNaoAutorizado extends ErroAplicacao {
  constructor(mensagem = 'Nao tem permissao para executar esta accao.') {
    super(mensagem, 403, 'NAO_AUTORIZADO');
  }
}

export class ErroNaoEncontrado extends ErroAplicacao {
  constructor(mensagem = 'Registo nao encontrado.') {
    super(mensagem, 404, 'NAO_ENCONTRADO');
  }
}

export class ErroConflito extends ErroAplicacao {
  constructor(mensagem = 'Operacao em conflito com o estado actual.') {
    super(mensagem, 409, 'CONFLITO');
  }
}

export class TransicaoInvalidaError extends ErroAplicacao {
  constructor(mensagem: string) {
    super(mensagem, 409, 'TRANSICAO_INVALIDA');
  }
}

export class ValidacaoMarcacaoError extends ErroAplicacao {
  constructor(mensagem: string) {
    super(mensagem, 409, 'VALIDACAO_MARCACAO');
  }
}
