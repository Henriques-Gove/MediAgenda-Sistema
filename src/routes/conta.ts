import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import type { Container } from '../container';
import { ErroValidacao } from '../domain/errors';
import { asyncHandler } from '../middleware/asyncHandler';
import { exigirAutenticacao } from '../middleware/auth';
import { csrfDepoisDoUpload } from '../middleware/csrf';
import {
  esquema2FA,
  esquemaAlterarPassword,
  esquemaDesativar2FA,
  validarEsquema,
} from '../validation';
import { destinoPorPerfil } from './helpers';

const pastaFotos = path.join(__dirname, '..', '..', 'public', 'uploads', 'perfis');
fs.mkdirSync(pastaFotos, { recursive: true });

const uploadFoto = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, pastaFotos),
    filename: (req, file, cb) => {
      const extensao = path.extname(file.originalname).toLowerCase() || '.jpg';
      const identificador = req.session.utilizador?.id ?? 'anonimo';
      cb(null, `${identificador}-${Date.now()}${extensao}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(new ErroValidacao('Envie uma imagem JPG, PNG ou WebP.'));
      return;
    }
    cb(null, true);
  },
});

export function rotasConta(container: Container): Router {
  const router = Router();
  router.use(exigirAutenticacao);

  router.get(
    '/password',
    asyncHandler(async (req, res) => {
      const utilizador = await container.auth.obterPorId(req.session.utilizador!.id);
      res.render('conta/password', {
        titulo: 'Alterar palavra-passe',
        utilizador,
        expirada: req.query.expirada === '1',
      });
    }),
  );

  router.post(
    '/password',
    asyncHandler(async (req, res) => {
      const { atual, nova } = validarEsquema(esquemaAlterarPassword, req.body);
      await container.auth.alterarPassword(req.session.utilizador!.id, atual, nova);
      req.session.utilizador!.passwordChangedAt = new Date().toISOString();
      req.session.flash = {
        tipo: 'success',
        mensagem: 'Palavra-passe alterada com sucesso.',
      };
      res.redirect('/conta/seguranca');
    }),
  );

  router.get(
    '/seguranca',
    asyncHandler(async (req, res) => {
      const utilizador = await container.auth.obterPorId(req.session.utilizador!.id);
      let qrCode: string | null = null;
      let secret: string | null = null;

      if (!utilizador.twoFactorEnabled) {
        const gerado = await container.auth.gerarSegredo2FA(utilizador.id);
        req.session.twoFactorSecretTemp = gerado.secret;
        secret = gerado.secret;
        qrCode = await QRCode.toDataURL(gerado.otpauth, { margin: 1, width: 240 });
      }

      res.render('conta/seguranca', {
        titulo: 'Segurança',
        utilizador,
        qrCode,
        secret,
      });
    }),
  );

  router.post(
    '/seguranca/2fa/ativar',
    asyncHandler(async (req, res) => {
      const { token } = validarEsquema(esquema2FA, req.body);
      const secret = req.session.twoFactorSecretTemp;
      if (!secret) {
        throw new ErroValidacao('O código de configuração expirou. Recarregue a página e tente novamente.');
      }
      await container.auth.ativar2FA(req.session.utilizador!.id, secret, token);
      delete req.session.twoFactorSecretTemp;
      req.session.utilizador!.twoFactorEnabled = true;
      req.session.flash = {
        tipo: 'success',
        mensagem: 'Verificação em dois passos ativada. A sua conta está mais protegida.',
      };
      res.redirect('/conta/seguranca');
    }),
  );

  router.post(
    '/seguranca/2fa/desativar',
    asyncHandler(async (req, res) => {
      const { password } = validarEsquema(esquemaDesativar2FA, req.body);
      await container.auth.desativar2FA(req.session.utilizador!.id, password);
      req.session.utilizador!.twoFactorEnabled = false;
      req.session.flash = {
        tipo: 'info',
        mensagem: 'Verificação em dois passos desativada.',
      };
      res.redirect('/conta/seguranca');
    }),
  );

  router.post(
    '/foto',
    uploadFoto.single('foto'),
    csrfDepoisDoUpload,
    asyncHandler(async (req, res) => {
      if (!req.file) {
        throw new ErroValidacao('Escolha uma imagem para atualizar a fotografia.');
      }
      const utilizador = await container.auth.obterPorId(req.session.utilizador!.id);
      if (utilizador.fotoUrl?.startsWith('/uploads/perfis/')) {
        const anterior = path.join(
          __dirname,
          '..',
          '..',
          'public',
          utilizador.fotoUrl.replace(/^\//, ''),
        );
        fs.rm(anterior, { force: true }, () => undefined);
      }
      const fotoUrl = `/uploads/perfis/${req.file.filename}`;
      await container.auth.atualizarFoto(utilizador.id, fotoUrl);
      req.session.flash = {
        tipo: 'success',
        mensagem: 'Fotografia atualizada.',
      };
      res.redirect('/conta/seguranca');
    }),
  );

  router.post(
    '/foto/remover',
    asyncHandler(async (req, res) => {
      const utilizador = await container.auth.obterPorId(req.session.utilizador!.id);
      if (utilizador.fotoUrl?.startsWith('/uploads/perfis/')) {
        const anterior = path.join(
          __dirname,
          '..',
          '..',
          'public',
          utilizador.fotoUrl.replace(/^\//, ''),
        );
        fs.rm(anterior, { force: true }, () => undefined);
      }
      await container.auth.atualizarFoto(utilizador.id, null);
      req.session.flash = { tipo: 'info', mensagem: 'Fotografia removida.' };
      res.redirect('/conta/seguranca');
    }),
  );

  router.get('/', (req, res) => {
    const perfil = req.session.utilizador?.perfil;
    res.redirect(perfil ? destinoPorPerfil(perfil) : '/login');
  });

  return router;
}
