import { ConfiguracaoSistema } from '../../config/ConfiguracaoSistema';
import { CadeiaValidacaoMarcacao } from '../../domain/chain/CadeiaValidacaoMarcacao';
import type { MedicoAgendaInfo, PedidoMarcacao, PortaAgenda } from '../../domain/chain/PedidoMarcacao';
import { ErroNaoEncontrado, ErroValidacao, ValidacaoMarcacaoError } from '../../domain/errors';
import { combinarDataHora } from '../../lib/date';
import { SeletorDuracaoConsulta } from '../strategy/DuracaoConsultaStrategy';
import type { ConsultaService, ConsultaComRelacoes } from '../../services/ConsultaService';
import type { MedicoService } from '../../services/MedicoService';
import type { PacienteService } from '../../services/PacienteService';

export interface PedidoMarcacaoFacade {
  pacienteId: string;
  medicoId: string;
  especialidadeId?: string | null;
  data: string;
  hora: string;
  motivo?: string | null;
  atorId: string;
  atorPerfil?: string | null;
}

export interface PedidoReagendamentoFacade {
  consultaId: string;
  medicoId: string;
  data: string;
  hora: string;
  atorId: string;
  atorPerfil?: string | null;
}

/**
 * Facade (padrao de projeto): o frontend faz uma unica chamada e a Facade
 * orquestra validacao (Chain), calculo de duracao (Strategy), persistencia e
 * publicacao de evento. Cumpre a RNF-05 (marcar em poucos cliques).
 */
export class AgendamentoFacade {
  private readonly cadeia: CadeiaValidacaoMarcacao;

  constructor(
    private readonly consultas: ConsultaService,
    private readonly medicos: MedicoService,
    private readonly pacientes: PacienteService,
    porta: PortaAgenda,
    private readonly config: ConfiguracaoSistema = ConfiguracaoSistema.getInstance(),
    private readonly seletorDuracao = new SeletorDuracaoConsulta(),
  ) {
    this.cadeia = new CadeiaValidacaoMarcacao(porta, config);
  }

  async marcar(pedido: PedidoMarcacaoFacade): Promise<ConsultaComRelacoes> {
    const paciente = await this.pacientes.obterPorId(pedido.pacienteId);
    const medico = await this.medicos.obterPorId(pedido.medicoId);
    const especialidade = this.escolherEspecialidade(medico, pedido.especialidadeId);
    const duracao = this.seletorDuracao.calcular(medico, especialidade);
    const inicio = combinarDataHora(pedido.data, pedido.hora);
    const fim = new Date(inicio.getTime() + duracao * 60_000);

    const info = this.montarInfo(medico);
    const pedidoValidacao: PedidoMarcacao = {
      pacienteId: paciente.id,
      medico: info,
      inicio,
      fim,
      agora: new Date(),
    };

    const resultado = await this.cadeia.validar(pedidoValidacao);
    if (!resultado.valido) {
      throw new ValidacaoMarcacaoError(
        resultado.motivo ?? 'Marcação recusada.',
      );
    }

    return this.consultas.criar({
      pacienteId: paciente.id,
      medicoId: medico.id,
      especialidadeId: especialidade?.id ?? null,
      inicio,
      fim,
      motivo: pedido.motivo ?? null,
      atorId: pedido.atorId,
      atorPerfil: pedido.atorPerfil ?? null,
    });
  }

  async reagendar(pedido: PedidoReagendamentoFacade): Promise<ConsultaComRelacoes> {
    const consulta = await this.consultas.obterPorId(pedido.consultaId);
    const medico = await this.medicos.obterPorId(pedido.medicoId);
    const especialidade = this.escolherEspecialidade(
      medico,
      consulta.especialidadeId ?? undefined,
    );
    const duracao = this.seletorDuracao.calcular(medico, especialidade);
    const inicio = combinarDataHora(pedido.data, pedido.hora);
    const fim = new Date(inicio.getTime() + duracao * 60_000);

    const pedidoValidacao: PedidoMarcacao = {
      pacienteId: consulta.pacienteId,
      medico: this.montarInfo(medico),
      inicio,
      fim,
      agora: new Date(),
      ignorarConsultaId: consulta.id,
    };

    const resultado = await this.cadeia.validar(pedidoValidacao);
    if (!resultado.valido) {
      throw new ValidacaoMarcacaoError(
        resultado.motivo ?? 'Reagendamento recusado.',
      );
    }

    return this.consultas.reagendar(
      consulta.id,
      inicio,
      fim,
      pedido.atorId,
      pedido.atorPerfil ?? null,
    );
  }

  private escolherEspecialidade(
    medico: Awaited<ReturnType<MedicoService['obterPorId']>>,
    especialidadeId?: string | null,
  ) {
    if (!medico.especialidades.length) return null;
    if (!especialidadeId) return medico.especialidades[0]!.especialidade;

    const vinculo = medico.especialidades.find((e) => e.especialidadeId === especialidadeId);
    if (!vinculo) {
      throw new ErroValidacao('O medico selecionado nao atende esta especialidade.');
    }
    return vinculo.especialidade;
  }

  private montarInfo(medico: Awaited<ReturnType<MedicoService['obterPorId']>>): MedicoAgendaInfo {
    if (!medico) throw new ErroNaoEncontrado('Medico nao encontrado.');
    return {
      id: medico.id,
      nome: medico.utilizador.nome,
      ativo: medico.ativo && medico.utilizador.ativo,
      maxConsultasDia: medico.maxConsultasDia,
      duracaoConsultaMinutos: medico.duracaoConsultaMinutos,
      disponibilidades: medico.disponibilidades.map((d) => ({
        diaSemana: d.diaSemana,
        horaInicio: d.horaInicio,
        horaFim: d.horaFim,
      })),
      bloqueios: medico.bloqueios.map((b) => ({
        inicio: b.inicio,
        fim: b.fim,
        motivo: b.motivo,
      })),
    };
  }
}
