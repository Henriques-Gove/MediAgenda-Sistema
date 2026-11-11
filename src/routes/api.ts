import { Router } from 'express';
import type { Container } from '../container';
import { ErroNaoAutenticado, ErroNaoEncontrado } from '../domain/errors';
import { asyncHandler } from '../middleware/asyncHandler';
import { dataDaQuery, numeroDaQuery, textoDaQuery } from './helpers';

/** API REST publica/autenticada (consumivel por web, mobile ou integracoes). */
export function rotasApi(container: Container): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ estado: 'ok', servico: 'MediAgenda', hora: new Date().toISOString() });
  });

  router.get(
    '/especialidades',
    asyncHandler(async (_req, res) => {
      const especialidades = await container.especialidades.listar();
      res.json(
        especialidades.map((e) => ({
          id: e.id,
          nome: e.nome,
          descricao: e.descricao,
          duracaoPadraoMinutos: e.duracaoPadraoMinutos,
          medicos: e._count.medicos,
        })),
      );
    }),
  );

  router.get(
    '/medicos',
    asyncHandler(async (req, res) => {
      const medicos = await container.medicos.listar({
        busca: textoDaQuery(req.query.busca),
        especialidadeId: textoDaQuery(req.query.especialidade),
        localizacao: textoDaQuery(req.query.localizacao),
        avaliacaoMinima: numeroDaQuery(req.query.avaliacao),
      });

      res.json(
        medicos.map((medico) => ({
          id: medico.id,
          nome: medico.utilizador.nome,
          numeroRegisto: medico.numeroRegisto,
          localizacao: medico.localizacao,
          bio: medico.bio,
          especialidades: medico.especialidades.map((e) => ({
            id: e.especialidade.id,
            nome: e.especialidade.nome,
          })),
          avaliacaoMedia: medico.avaliacaoMedia,
          totalAvaliacoes: medico.totalAvaliacoes,
          duracaoConsultaMinutos: medico.duracaoConsultaMinutos,
        })),
      );
    }),
  );

  router.get(
    '/medicos/:id',
    asyncHandler(async (req, res) => {
      const medico = await container.medicos.obterPorId(req.params.id);
      const media = await container.avaliacoes.media(medico.id);
      res.json({
        id: medico.id,
        nome: medico.utilizador.nome,
        email: medico.utilizador.email,
        numeroRegisto: medico.numeroRegisto,
        localizacao: medico.localizacao,
        bio: medico.bio,
        ativo: medico.ativo,
        duracaoConsultaMinutos: medico.duracaoConsultaMinutos,
        maxConsultasDia: medico.maxConsultasDia,
        especialidades: medico.especialidades.map((e) => ({
          id: e.especialidade.id,
          nome: e.especialidade.nome,
          duracaoPadraoMinutos: e.especialidade.duracaoPadraoMinutos,
        })),
        disponibilidade: medico.disponibilidades.map((d) => ({
          diaSemana: d.diaSemana,
          horaInicio: d.horaInicio,
          horaFim: d.horaFim,
        })),
        avaliacaoMedia: media.media,
        totalAvaliacoes: media.total,
      });
    }),
  );

  router.get(
    '/medicos/:id/slots',
    asyncHandler(async (req, res) => {
      const medico = await container.medicos.obterPorId(req.params.id);
      const data = dataDaQuery(req.query.data);
      const slots = await container.agenda.gerarSlots(medico.id, data);
      res.json(
        slots.map((slot) => ({
          hora: slot.hora,
          disponivel: slot.disponivel,
          motivo: slot.motivo ?? null,
        })),
      );
    }),
  );

  router.get(
    '/consultas/:id',
    asyncHandler(async (req, res) => {
      const utilizador = req.session.utilizador;
      if (!utilizador) throw new ErroNaoAutenticado();

      const consulta = await container.consultas.obterPorId(req.params.id);
      const autorizado =
        utilizador.perfil === 'ADMINISTRADOR' ||
        utilizador.perfil === 'SECRETARIO' ||
        (utilizador.perfil === 'PACIENTE' &&
          consulta.paciente.utilizadorId === utilizador.id) ||
        (utilizador.perfil === 'MEDICO' && consulta.medico.utilizadorId === utilizador.id);

      if (!autorizado) throw new ErroNaoEncontrado('Consulta nao encontrada.');

      res.json({
        id: consulta.id,
        estado: consulta.estado,
        inicio: consulta.inicio,
        fim: consulta.fim,
        medico: { id: consulta.medicoId, nome: consulta.medico.utilizador.nome },
        paciente: { id: consulta.pacienteId, nome: consulta.paciente.utilizador.nome },
        especialidade: consulta.especialidade?.nome ?? null,
        motivo: consulta.motivo,
        motivoCancelamento: consulta.motivoCancelamento,
      });
    }),
  );

  return router;
}
