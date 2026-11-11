import { ConfiguracaoSistema } from './config/ConfiguracaoSistema';
import { eventBus } from './events/EventBus';
import { AuditoriaHandler } from './events/handlers/AuditoriaHandler';
import { NotificacaoHandler } from './events/handlers/NotificacaoHandler';
import { RelatorioHandler } from './events/handlers/RelatorioHandler';
import { prisma } from './lib/prisma';
import { AdapterEmail } from './patterns/adapter/AdapterEmail';
import { AdapterSMS } from './patterns/adapter/AdapterSMS';
import { AgendamentoFacade } from './patterns/facade/AgendamentoFacade';
import { NotificacaoFactory } from './patterns/factory/NotificacaoFactory';
import { PortaAgendaPrisma } from './repositories/PortaAgendaPrisma';
import { AgendaService } from './services/AgendaService';
import { AuditoriaService } from './services/AuditoriaService';
import { AuthService } from './services/AuthService';
import { AvaliacaoService } from './services/AvaliacaoService';
import { ConsultaService } from './services/ConsultaService';
import { DocumentoClinicoService } from './services/DocumentoClinicoService';
import { EspecialidadeService } from './services/EspecialidadeService';
import { LembreteScheduler } from './services/LembreteScheduler';
import { ListaEsperaService } from './services/ListaEsperaService';
import { MedicoService } from './services/MedicoService';
import { NotificacaoService } from './services/NotificacaoService';
import { PacienteService } from './services/PacienteService';
import { RelatorioService } from './services/RelatorioService';

export interface Container {
  config: ConfiguracaoSistema;
  auditoria: AuditoriaService;
  notificacoes: NotificacaoService;
  consultas: ConsultaService;
  medicos: MedicoService;
  pacientes: PacienteService;
  especialidades: EspecialidadeService;
  agenda: AgendaService;
  listaEspera: ListaEsperaService;
  documentos: DocumentoClinicoService;
  facade: AgendamentoFacade;
  auth: AuthService;
  avaliacoes: AvaliacaoService;
  relatorios: RelatorioService;
  relatorioHandler: RelatorioHandler;
  scheduler: LembreteScheduler;
}

let observadoresRegistados = false;

export function criarContainer(): Container {
  const config = ConfiguracaoSistema.getInstance(prisma);
  const notificacaoFactory = new NotificacaoFactory(new AdapterEmail(), new AdapterSMS());
  const notificacoes = new NotificacaoService(notificacaoFactory, prisma);
  const auditoria = new AuditoriaService(prisma);
  const consultas = new ConsultaService(prisma, eventBus, config);
  const medicos = new MedicoService(prisma, consultas, eventBus);
  const pacientes = new PacienteService(prisma);
  const especialidades = new EspecialidadeService(prisma);
  const agenda = new AgendaService(prisma, medicos, consultas, config);
  const listaEspera = new ListaEsperaService(prisma, agenda);
  const documentos = new DocumentoClinicoService(prisma);
  const facade = new AgendamentoFacade(
    consultas,
    medicos,
    pacientes,
    new PortaAgendaPrisma(prisma),
    config,
  );
  const auth = new AuthService(prisma, notificacoes, eventBus);
  const avaliacoes = new AvaliacaoService(prisma, consultas, eventBus);
  const relatorios = new RelatorioService(prisma, config);
  const relatorioHandler = new RelatorioHandler();
  const scheduler = new LembreteScheduler(consultas, prisma);

  return {
    config,
    auditoria,
    notificacoes,
    consultas,
    medicos,
    pacientes,
    especialidades,
    agenda,
    listaEspera,
    documentos,
    facade,
    auth,
    avaliacoes,
    relatorios,
    relatorioHandler,
    scheduler,
  };
}

/** Liga os consumidores da EDA ao Event Bus (Observer). */
export function registarObservadores(container: Container): void {
  if (observadoresRegistados) return;
  observadoresRegistados = true;

  eventBus.inscrever('*', new NotificacaoHandler(container.notificacoes));
  eventBus.inscrever('*', new AuditoriaHandler(container.auditoria));
  eventBus.inscrever('*', container.relatorioHandler);
}

/** Usado nos testes de integracao para recomecar o barramento. */
export function reiniciarObservadores(): void {
  observadoresRegistados = false;
}
