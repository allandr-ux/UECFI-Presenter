/**
 * Community Slide Templates & Admin Moderation Router
 *
 * Stores submitted slide templates in Cloudflare R2 (via S3-compatible API)
 * partitioned by moderation status:
 *   - templates/pending/<id>.json
 *   - templates/approved/<id>.json
 *   - templates/rejected/<id>.json
 *
 * Falls back to local disk (.templates-cache/) when R2 env vars are unset so
 * local development works without Cloudflare credentials.
 */

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand
} = require('@aws-sdk/client-s3');

const STATUSES = ['pending', 'approved', 'rejected'];
const VALID_CATEGORIES = ['General', 'Worship', 'Tema', 'Logo', 'Announcement', 'Youth', 'Event'];
const COOKIE_NAME = 'uecfi_admin_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function createR2Store() {
  const accountId = (process.env.R2_ACCOUNT_ID || '').trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = (process.env.R2_BUCKET_NAME || '').trim();

  if (accountId && accessKeyId && secretAccessKey && bucket) {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey }
    });
    console.log(`[TEMPLATES] Using Cloudflare R2 bucket "${bucket}"`);
    return {
      mode: 'r2',
      async listByStatus(status) {
        const prefix = `templates/${status}/`;
        const items = [];
        let continuationToken;
        do {
          const res = await client.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: prefix,
              ContinuationToken: continuationToken
            })
          );
          for (const obj of res.Contents || []) {
            if (!obj.Key || !obj.Key.endsWith('.json')) continue;
            try {
              const data = await client.send(new GetObjectCommand({ Bucket: bucket, Key: obj.Key }));
              const body = await data.Body.transformToString('utf-8');
              items.push(JSON.parse(body));
            } catch (err) {
              console.warn(`[TEMPLATES] Failed to read ${obj.Key}:`, err.message);
            }
          }
          continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
        } while (continuationToken);
        return items;
      },
      async get(status, id) {
        try {
          const res = await client.send(
            new GetObjectCommand({ Bucket: bucket, Key: `templates/${status}/${id}.json` })
          );
          const body = await res.Body.transformToString('utf-8');
          return JSON.parse(body);
        } catch {
          return null;
        }
      },
      async put(status, template) {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `templates/${status}/${template.id}.json`,
            Body: JSON.stringify(template),
            ContentType: 'application/json'
          })
        );
      },
      async remove(status, id) {
        await client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: `templates/${status}/${id}.json`
          })
        );
      },
      async putAsset(assetId, fileName, buffer, contentType) {
        await client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: `templates/assets/${assetId}/${fileName}`,
            Body: buffer,
            ContentType: contentType || 'application/octet-stream'
          })
        );
      },
      async getAsset(assetId, fileName) {
        try {
          const res = await client.send(
            new GetObjectCommand({
              Bucket: bucket,
              Key: `templates/assets/${assetId}/${fileName}`
            })
          );
          const bytes = await res.Body.transformToByteArray();
          return {
            buffer: Buffer.from(bytes),
            contentType: res.ContentType || guessContentType(fileName)
          };
        } catch {
          return null;
        }
      },
      async removeAssets(templateId) {
        const prefix = `templates/assets/${templateId}/`;
        let continuationToken;
        do {
          const res = await client.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: prefix,
              ContinuationToken: continuationToken
            })
          );
          for (const obj of res.Contents || []) {
            if (!obj.Key) continue;
            await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: obj.Key }));
          }
          continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
        } while (continuationToken);
      }
    };
  }

  // Local fallback for development when R2 credentials are not set
  const baseDir = path.join(__dirname, '.templates-cache');
  for (const s of [...STATUSES, 'assets']) {
    fs.mkdirSync(path.join(baseDir, s), { recursive: true });
  }
  console.warn('[TEMPLATES] R2 env vars not set; using ephemeral local cache (.templates-cache/)');
  return {
    mode: 'local',
    async listByStatus(status) {
      const dir = path.join(baseDir, status);
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
      return files
        .map((f) => {
          try {
            return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    },
    async get(status, id) {
      const p = path.join(baseDir, status, `${id}.json`);
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf-8'));
    },
    async put(status, template) {
      const p = path.join(baseDir, status, `${template.id}.json`);
      fs.writeFileSync(p, JSON.stringify(template, null, 2), 'utf-8');
    },
    async remove(status, id) {
      const p = path.join(baseDir, status, `${id}.json`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    },
    async putAsset(assetId, fileName, buffer) {
      const dir = path.join(baseDir, 'assets', assetId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, fileName), buffer);
    },
    async getAsset(assetId, fileName) {
      const p = path.join(baseDir, 'assets', assetId, fileName);
      if (!fs.existsSync(p)) return null;
      return {
        buffer: fs.readFileSync(p),
        contentType: guessContentType(fileName)
      };
    },
    async removeAssets(templateId) {
      const dir = path.join(baseDir, 'assets', templateId);
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  };
}

function guessContentType(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase();
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm'
  };
  return map[ext] || 'application/octet-stream';
}

function getSessionSecret() {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    crypto
      .createHash('sha256')
      .update(`uecfi-admin:${process.env.ADMIN_PASSWORD || 'dev-insecure-secret'}`)
      .digest('hex')
  );
}

function signSessionToken(expiresAt) {
  const payload = `${expiresAt}`;
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const exp = Number(payload);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = crypto.createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'ADMIN_PASSWORD is not configured on the server.' });
  }
  const cookies = parseCookies(req.headers.cookie);
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const token = bearer || cookies[COOKIE_NAME];
  if (!verifySessionToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function sanitizeTemplateId(raw) {
  return String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 80);
}

function createTemplatesRouter() {
  const router = express.Router();
  const store = createR2Store();

  let approvedCache = null;
  async function getApprovedTemplates(forceRefresh = false) {
    if (!forceRefresh && Array.isArray(approvedCache)) return approvedCache;
    const list = await store.listByStatus('approved');
    list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    approvedCache = list;
    return list;
  }

  async function findTemplateAcrossStatuses(id) {
    for (const status of STATUSES) {
      const tpl = await store.get(status, id);
      if (tpl) return { status, template: tpl };
    }
    return null;
  }

  // Public: list approved templates
  router.get('/api/templates', async (req, res) => {
    try {
      const templates = await getApprovedTemplates();
      res.setHeader('Cache-Control', 'no-cache');
      res.json({ templates, storageMode: store.mode });
    } catch (err) {
      console.error('[TEMPLATES] GET /api/templates error:', err);
      res.status(500).json({ error: 'Failed to load templates' });
    }
  });

  // Public: upload a single binary asset file (image, background, 3D .glb, thumbnail)
  router.post(
    '/api/templates/assets',
    express.raw({ type: '*/*', limit: '50mb' }),
    async (req, res) => {
      try {
        const buffer = Buffer.isBuffer(req.body) ? req.body : null;
        if (!buffer || buffer.length === 0) {
          return res.status(400).json({ error: 'Empty file body.' });
        }
        const rawName = String(req.query.name || req.headers['x-file-name'] || 'asset.bin');
        const safeFileName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'asset.bin';
        const requestedFolder = sanitizeTemplateId(req.query.templateId || req.headers['x-template-id']);
        const assetId = requestedFolder || `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        const contentType =
          typeof req.headers['content-type'] === 'string' &&
          req.headers['content-type'] !== 'application/octet-stream'
            ? req.headers['content-type'].split(';')[0].trim()
            : guessContentType(safeFileName);
        await store.putAsset(assetId, safeFileName, buffer, contentType);
        res.status(201).json({
          ok: true,
          url: `/api/templates/assets/${assetId}/${safeFileName}`
        });
      } catch (err) {
        console.error('[TEMPLATES] POST /api/templates/assets error:', err);
        res.status(500).json({ error: 'Failed to upload template asset' });
      }
    }
  );

  // Public: serve a binary template asset file from R2 / local cache
  router.get('/api/templates/assets/:assetId/:fileName', async (req, res) => {
    try {
      const assetId = sanitizeTemplateId(req.params.assetId);
      const fileName = String(req.params.fileName || '').replace(/[^a-zA-Z0-9._-]/g, '');
      if (!assetId || !fileName) {
        return res.status(400).json({ error: 'Invalid asset path' });
      }
      const asset = await store.getAsset(assetId, fileName);
      if (!asset) {
        return res.status(404).json({ error: 'Asset not found' });
      }
      res.setHeader('Content-Type', asset.contentType || guessContentType(fileName));
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(asset.buffer);
    } catch (err) {
      console.error('[TEMPLATES] GET /api/templates/assets error:', err);
      res.status(500).json({ error: 'Failed to load asset' });
    }
  });

  // Public: submit a new template for moderation
  router.post('/api/templates', express.json({ limit: '50mb' }), async (req, res) => {
    try {
      const { id: requestedIdRaw, title, category, author, thumbnailUrl, thumbnailDataUrl, slide, mediaAssets } = req.body || {};
      const cleanTitle = String(title || '').trim().slice(0, 80);
      if (!cleanTitle) {
        return res.status(400).json({ error: 'Template title is required.' });
      }
      if (!slide || !Array.isArray(slide.canvasElements)) {
        return res.status(400).json({ error: 'Slide payload is invalid.' });
      }
      const cleanCategory = VALID_CATEGORIES.includes(category) ? category : 'General';
      const cleanAuthor = String(author || 'Community').trim().slice(0, 60) || 'Community';
      const cleanThumbUrl =
        typeof thumbnailUrl === 'string' && thumbnailUrl.startsWith('/api/templates/assets/')
          ? thumbnailUrl.slice(0, 300)
          : undefined;
      const cleanThumb =
        !cleanThumbUrl &&
        typeof thumbnailDataUrl === 'string' &&
        thumbnailDataUrl.startsWith('data:image/')
          ? thumbnailDataUrl.slice(0, 600_000)
          : undefined;
      let cleanMediaAssets;
      if (mediaAssets && typeof mediaAssets === 'object' && !Array.isArray(mediaAssets)) {
        const entries = Object.entries(mediaAssets).filter(
          ([k, v]) => /^[a-zA-Z0-9._-]+$/.test(k) && typeof v === 'string' && v.length > 0
        );
        if (entries.length > 0) {
          cleanMediaAssets = Object.fromEntries(entries);
        }
      }

      const requestedId = sanitizeTemplateId(requestedIdRaw);
      const existing = requestedId ? await findTemplateAcrossStatuses(requestedId) : null;
      const id =
        requestedId && !existing
          ? requestedId
          : `tpl-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const record = {
        id,
        title: cleanTitle,
        category: cleanCategory,
        author: cleanAuthor,
        ...(cleanThumbUrl ? { thumbnailUrl: cleanThumbUrl } : {}),
        ...(cleanThumb ? { thumbnailDataUrl: cleanThumb } : {}),
        ...(cleanMediaAssets ? { mediaAssets: cleanMediaAssets } : {}),
        slide: {
          backgroundColor: typeof slide.backgroundColor === 'string' ? slide.backgroundColor : undefined,
          backgroundGradient: typeof slide.backgroundGradient === 'string' ? slide.backgroundGradient : undefined,
          canvasElements: slide.canvasElements
        },
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      await store.put('pending', record);
      res.status(201).json({ ok: true, id, status: 'pending' });
    } catch (err) {
      console.error('[TEMPLATES] POST /api/templates error:', err);
      res.status(500).json({ error: 'Failed to submit template' });
    }
  });

  // Admin auth
  router.post('/api/admin/login', express.json(), (req, res) => {
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      return res.status(503).json({ error: 'ADMIN_PASSWORD is not configured on the server.' });
    }
    const provided = String(req.body?.password || '');
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    const exp = Date.now() + SESSION_TTL_MS;
    const token = signSessionToken(exp);
    const isProd = process.env.NODE_ENV === 'production';
    res.setHeader(
      'Set-Cookie',
      `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax${isProd ? '; Secure' : ''}`
    );
    res.json({ ok: true, token });
  });

  router.post('/api/admin/logout', (req, res) => {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
    res.json({ ok: true });
  });

  router.get('/api/admin/me', requireAdmin, (req, res) => {
    res.json({ authenticated: true, storageMode: store.mode });
  });

  // Admin: list all templates grouped by status
  router.get('/api/admin/templates', requireAdmin, async (req, res) => {
    try {
      const [pending, approved, rejected] = await Promise.all([
        store.listByStatus('pending'),
        store.listByStatus('approved'),
        store.listByStatus('rejected')
      ]);
      const byNewest = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
      pending.sort(byNewest);
      approved.sort(byNewest);
      rejected.sort(byNewest);
      res.json({ pending, approved, rejected, storageMode: store.mode });
    } catch (err) {
      console.error('[TEMPLATES] GET /api/admin/templates error:', err);
      res.status(500).json({ error: 'Failed to list templates' });
    }
  });

  async function moveTemplate(id, targetStatus) {
    const cleanId = sanitizeTemplateId(id);
    if (!cleanId) return null;
    const found = await findTemplateAcrossStatuses(cleanId);
    if (!found) return null;
    const updated = {
      ...found.template,
      status: targetStatus,
      moderatedAt: new Date().toISOString()
    };
    await store.put(targetStatus, updated);
    if (found.status !== targetStatus) {
      await store.remove(found.status, cleanId);
    }
    await getApprovedTemplates(true);
    return updated;
  }

  router.post('/api/admin/templates/:id/approve', requireAdmin, async (req, res) => {
    try {
      const updated = await moveTemplate(req.params.id, 'approved');
      if (!updated) return res.status(404).json({ error: 'Template not found' });
      res.json({ ok: true, template: updated });
    } catch (err) {
      console.error('[TEMPLATES] Approve error:', err);
      res.status(500).json({ error: 'Failed to approve template' });
    }
  });

  router.post('/api/admin/templates/:id/reject', requireAdmin, async (req, res) => {
    try {
      const updated = await moveTemplate(req.params.id, 'rejected');
      if (!updated) return res.status(404).json({ error: 'Template not found' });
      res.json({ ok: true, template: updated });
    } catch (err) {
      console.error('[TEMPLATES] Reject error:', err);
      res.status(500).json({ error: 'Failed to reject template' });
    }
  });

  router.delete('/api/admin/templates/:id', requireAdmin, async (req, res) => {
    try {
      const cleanId = sanitizeTemplateId(req.params.id);
      const found = cleanId ? await findTemplateAcrossStatuses(cleanId) : null;
      if (!found) return res.status(404).json({ error: 'Template not found' });
      await store.remove(found.status, cleanId);
      await store.removeAssets(cleanId);
      await getApprovedTemplates(true);
      res.json({ ok: true });
    } catch (err) {
      console.error('[TEMPLATES] Delete error:', err);
      res.status(500).json({ error: 'Failed to delete template' });
    }
  });

  // Serve the Admin Moderation Portal at /admin
  router.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  });

  return router;
}

module.exports = { createTemplatesRouter };
