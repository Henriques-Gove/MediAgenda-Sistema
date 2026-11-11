import { z, type ZodTypeAny } from 'zod';
import { ErroValidacao } from '../domain/errors';

const email = z
  .string({ error: 'Indique o e-mail.' })
  .trim()
  .min(1, 'Indique o e-mail.')
  .email('Introduza um e-mail válido.')
  .transform((valor) => valor.toLowerCase());

const password = z
  .string({ error: 'Indique a palavra-passe.' })
  .min(8, 'A palavra-passe deve ter pelo menos 8 caracteres.');

const textoOpcional = z.string().trim().default('');

const numeroOpcional = (padrao: number, minimo: number, maximo: number) =>
  z.preprocess(
    (valor) => (valor === '' || valor === null || valor === undefined ? undefined : valor),
    z.coerce
      .number()
      .min(minimo, `O valor mínimo é ${minimo}.`)
      .max(maximo, `O valor máximo é ${maximo}.`)
      .optional()
      .default(padrao),
  );

export const esquemaLogin = z.object({
  email,
  password: z.string().min(1, 'Indique a palavra-passe.'),
  next: z.string().optional().default(''),
});

/**
 * Registo público. Apenas os pacientes se podem inscrever por conta própria;
 * contas da equipa (médicos e secretaria) são criadas pela secretaria ou pelo
 * administrador.
 */
export const esquemaRegistoPaciente = z.object({
  nome: z
    .string({ error: 'Indique o nome completo.' })
    .trim()
    .min(3, 'Indique o nome completo.'),
  email,
  password,
  telefone: textoOpcional,
  preferenciaNotificacao: z.enum(['EMAIL', 'SMS']).optional().default('EMAIL'),
  dataNascimento: z
    .string({ error: 'Indique a data de nascimento.' })
    .trim()
    .min(1, 'Indique a data de nascimento.'),
  endereco: z
    .string({ error: 'Indique o endereço.' })
    .trim()
    .min(1, 'Indique o endereço.'),
  aceiteTermos: z
    .union([z.literal('on'), z.literal('true'), z.boolean()])
    .transform((valor) => valor === true || valor === 'on' || valor === 'true')
    .refine((valor) => valor, 'Tem de aceitar os termos e a política de privacidade.'),
});

/**
 * Criação de contas pela equipa clínica (secretaria e administrador).
 * A palavra-passe pode ficar vazia, caso em que o sistema gera uma inicial.
 */
export const esquemaCriarUtilizador = z
  .object({
    nome: z
      .string({ error: 'Indique o nome completo.' })
      .trim()
      .min(3, 'Indique o nome completo.'),
    email,
    password: textoOpcional,
    perfil: z.enum(['PACIENTE', 'MEDICO', 'SECRETARIO', 'ADMINISTRADOR'], {
      error: 'Escolha um perfil válido.',
    }),
    telefone: textoOpcional,
    preferenciaNotificacao: z.enum(['EMAIL', 'SMS']).optional().default('EMAIL'),
    dataNascimento: textoOpcional,
    endereco: textoOpcional,
    numeroRegisto: textoOpcional,
    localizacao: textoOpcional,
    bio: textoOpcional,
    especialidadeId: textoOpcional,
    duracaoConsultaMinutos: numeroOpcional(60, 60, 120),
    maxConsultasDia: numeroOpcional(10, 1, 40),
  })
  .superRefine((dados, contexto) => {
    if (dados.perfil === 'PACIENTE') {
      if (!dados.dataNascimento) {
        contexto.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['dataNascimento'],
          message: 'Indique a data de nascimento.',
        });
      }
      if (!dados.endereco) {
        contexto.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['endereco'],
          message: 'Indique o endereço.',
        });
      }
    }
    if (dados.perfil === 'MEDICO') {
      if (!dados.numeroRegisto) {
        contexto.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['numeroRegisto'],
          message: 'Indique o número de registo.',
        });
      }
      if (!dados.localizacao) {
        contexto.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['localizacao'],
          message: 'Indique a localização.',
        });
      }
      if (!dados.especialidadeId) {
        contexto.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['especialidadeId'],
          message: 'Escolha uma especialidade.',
        });
      }
    }
    if (dados.password && dados.password.length < 8) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'A palavra-passe deve ter pelo menos 8 caracteres.',
      });
    }
  });

export const esquemaRecuperacao = z.object({
  email,
});

export const esquemaReporPassword = z
  .object({
    password,
    confirmar: z.string().min(1, 'Confirme a nova palavra-passe.'),
  })
  .refine((dados) => dados.password === dados.confirmar, {
    path: ['confirmar'],
    message: 'As palavras-passe não coincidem.',
  });

export const esquemaAlterarPassword = z
  .object({
    atual: z.string().min(1, 'Indique a palavra-passe atual.'),
    nova: password,
    confirmar: z.string().min(1, 'Confirme a nova palavra-passe.'),
  })
  .refine((dados) => dados.nova === dados.confirmar, {
    path: ['confirmar'],
    message: 'As palavras-passe não coincidem.',
  });

export const esquema2FA = z.object({
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Introduza o código de seis dígitos.'),
});

export const esquemaDesativar2FA = z.object({
  password: z.string().min(1, 'Indique a palavra-passe.'),
});

export const esquemaListaEspera = z.object({
  medicoId: z.string().min(1, 'Escolha o médico pretendido.'),
  especialidadeId: textoOpcional,
  dataPreferida: textoOpcional,
  periodo: z.enum(['', 'MANHA', 'TARDE', 'DIA']).optional().default(''),
});

/**
 * Valida dados com Zod e converte o primeiro erro de cada campo num
 * ErroValidacao, mantendo as mensagens em português e sem detalhes técnicos.
 */
export function validarEsquema<T extends ZodTypeAny>(esquema: T, dados: unknown): z.output<T> {
  const resultado = esquema.safeParse(dados);
  if (resultado.success) return resultado.data;

  const campos: Record<string, string> = {};
  for (const problema of resultado.error.issues) {
    const campo = problema.path[0]?.toString() ?? 'formulario';
    if (!campos[campo]) campos[campo] = problema.message;
  }

  const mensagem = Object.values(campos)[0] ?? 'Dados inválidos.';
  throw new ErroValidacao(mensagem, campos);
}
