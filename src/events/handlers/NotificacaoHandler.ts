import { env } from '../../config/env';
import { TiposEvento } from '../../domain/enums';
import { formatarDataHora } from '../../lib/date';
import type { NotificacaoService } from '../../services/NotificacaoService';
import type { EventoDominio } from '../eventos';
import type { IObservador } from '../EventBus';

/**
 * Consumidor da EDA responsavel por toda a comunicacao com pacientes e medicos
 * (RF-06). Nao conhece o ConsultaService: apenas reage aos eventos publicados.
 */
export class NotificacaoHandler implements IObservador {
  readonly nome = 'NotificacaoHandler';

  constructor(private readonly notificacoes: NotificacaoService) {}

  async aoOcorrer(evento: EventoDominio): Promise<void> {
    const consulta = evento.consulta;
    if (!consulta) return;

    const paciente = {
      email: consulta.pacienteEmail,
      telefone: consulta.pacienteTelefone,
      preferencia: consulta.preferenciaPaciente,
    };
    const medico = {
      email: consulta.medicoEmail,
      telefone: consulta.medicoTelefone,
      preferencia: 'EMAIL',
    };
    const quando = formatarDataHora(consulta.inicio);
    const especialidade = consulta.especialidade ?? 'Consulta geral';

    switch (evento.tipo) {
      case TiposEvento.CONSULTA_CRIADA: {
        const link = `${env.appUrl}/confirmar/${consulta.confirmacaoToken ?? ''}`;
        await this.notificacoes.enviarParaUtilizador(
          paciente,
          'Marcacao registada - confirme em 2 horas',
          `Ola ${consulta.pacienteNome},\n\nA sua marcacao de ${especialidade} com ${consulta.medicoNome} para ${quando} foi registada.\n\nConfirme a marcacao no link abaixo dentro de 2 horas:\n${link}\n\nSe nao confirmar, a vaga sera libertada automaticamente.\n\nMediAgenda`,
          consulta.consultaId,
        );
        await this.notificacoes.enviarParaUtilizador(
          medico,
          'Nova marcacao pendente',
          `Ola ${consulta.medicoNome},\n\nO paciente ${consulta.pacienteNome} registou uma marcacao de ${especialidade} para ${quando}. A consulta aguarda confirmacao do paciente.\n\nMediAgenda`,
          consulta.consultaId,
        );
        break;
      }

      case TiposEvento.CONSULTA_CONFIRMADA:
        await this.notificacoes.enviarParaUtilizador(
          paciente,
          'Consulta confirmada',
          `Ola ${consulta.pacienteNome},\n\nA sua consulta de ${especialidade} com ${consulta.medicoNome} para ${quando} esta confirmada.\n\nMediAgenda`,
          consulta.consultaId,
        );
        await this.notificacoes.enviarParaUtilizador(
          medico,
          'Consulta confirmada',
          `Ola ${consulta.medicoNome},\n\nA consulta com ${consulta.pacienteNome} para ${quando} foi confirmada.\n\nMediAgenda`,
          consulta.consultaId,
        );
        break;

      case TiposEvento.CONSULTA_CANCELADA:
        await this.notificacoes.enviarParaUtilizador(
          paciente,
          'Consulta cancelada',
          `Ola ${consulta.pacienteNome},\n\nA sua consulta de ${especialidade} com ${consulta.medicoNome} para ${quando} foi cancelada.\nMotivo: ${consulta.motivoCancelamento ?? 'nao indicado'}.\n\nMediAgenda`,
          consulta.consultaId,
        );
        await this.notificacoes.enviarParaUtilizador(
          medico,
          'Consulta cancelada',
          `Ola ${consulta.medicoNome},\n\nA consulta com ${consulta.pacienteNome} para ${quando} foi cancelada.\nMotivo: ${consulta.motivoCancelamento ?? 'nao indicado'}.\n\nMediAgenda`,
          consulta.consultaId,
        );
        break;

      case TiposEvento.CONSULTA_REAGENDADA:
        await this.notificacoes.enviarParaUtilizador(
          paciente,
          'Consulta reagendada',
          `Ola ${consulta.pacienteNome},\n\nA sua consulta de ${especialidade} com ${consulta.medicoNome} foi reagendada para ${quando}.\n\nMediAgenda`,
          consulta.consultaId,
        );
        await this.notificacoes.enviarParaUtilizador(
          medico,
          'Consulta reagendada',
          `Ola ${consulta.medicoNome},\n\nA consulta com ${consulta.pacienteNome} foi reagendada para ${quando}.\n\nMediAgenda`,
          consulta.consultaId,
        );
        break;

      case TiposEvento.CONSULTA_REALIZADA:
        await this.notificacoes.enviarParaUtilizador(
          paciente,
          'Consulta realizada - avalie o atendimento',
          `Ola ${consulta.pacienteNome},\n\nA sua consulta de ${especialidade} com ${consulta.medicoNome} foi realizada.\nPode avaliar o atendimento na sua area de paciente.\n\nMediAgenda`,
          consulta.consultaId,
        );
        break;

      case TiposEvento.LEMBRETE_DEVIDO: {
        const antecedencia = String(evento.meta?.antecedencia ?? '');
        const assunto = antecedencia === '1h'
          ? '[LEMBRETE_1H] Consulta em 1 hora'
          : '[LEMBRETE_24H] Consulta amanha';
        await this.notificacoes.enviarParaUtilizador(
          paciente,
          assunto,
          `Ola ${consulta.pacienteNome},\n\nLembrete: tem uma consulta de ${especialidade} com ${consulta.medicoNome} em ${quando}.\n\nMediAgenda`,
          consulta.consultaId,
        );
        await this.notificacoes.enviarParaUtilizador(
          medico,
          assunto,
          `Ola ${consulta.medicoNome},\n\nLembrete: consulta com ${consulta.pacienteNome} em ${quando}.\n\nMediAgenda`,
          consulta.consultaId,
        );
        break;
      }

      default:
        break;
    }
  }
}
