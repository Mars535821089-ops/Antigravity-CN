import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { isApprovedSource } from './source-fingerprint.mjs';

export async function readApprovedManifest(root) {
  const manifest = JSON.parse(await fs.readFile(`${root}/bundle-manifest.json`, 'utf8'));
  if (manifest.approved !== true || manifest.previewOnly !== false ||
      manifest.fingerprintSchemaVersion !== 1 ||
      !/^[0-9]+[.][0-9]+[.][0-9]+$/.test(manifest.appVersion ?? '') ||
      !/^[a-f0-9]{64}$/.test(manifest.originalSHA256 ?? '') ||
      !/^[a-f0-9]{64}$/.test(manifest.localizedSHA256 ?? '')) {
    throw new Error('Localization manifest is not an approved runtime build');
  }
  const fingerprints = JSON.parse(await fs.readFile(`${root}/source-fingerprints.json`, 'utf8'));
  if (!isApprovedSource(manifest.appVersion, manifest.originalSHA256, fingerprints)) {
    throw new Error('Localization manifest source fingerprint is not approved');
  }
  return manifest;
}

export async function loadBundle(root) {
  const manifest = await readApprovedManifest(root);
  const body=await fs.readFile(`${root}/main.zh-CN.js`);
  if(crypto.createHash('sha256').update(body).digest('hex')!==manifest.localizedSHA256) {
    throw new Error('Localized component bundle failed integrity verification');
  }
  return {manifest,body:body.toString('base64')};
}

export async function interceptBundle(client,message,bundle,notify) {
  const p=message.params;
  let finished=false;
  try {
    const url=new URL(p.request.url);
    if(url.protocol!=='https:'||url.hostname!=='127.0.0.1'||url.pathname!=='/main.js'||
       p.responseStatusCode!==200) {
      await client.send('Fetch.continueRequest',{requestId:p.requestId});return;
    }
    const response=await client.send('Fetch.getResponseBody',{requestId:p.requestId});
    const bytes=Buffer.from(response.body,response.base64Encoded?'base64':'utf8');
    if(crypto.createHash('sha256').update(bytes).digest('hex')!==bundle.manifest.originalSHA256) {
      notify(false,'Official UI bundle changed; source replacement skipped');
      await client.send('Fetch.continueRequest',{requestId:p.requestId});return;
    }
    const headers=(p.responseHeaders??[]).filter(h=>![
      'content-length','content-encoding','etag','cache-control','content-md5',
    ].includes(h.name.toLowerCase()));
    headers.push({name:'Cache-Control',value:'no-store'});
    await client.send('Fetch.fulfillRequest',{
      requestId:p.requestId,responseCode:200,responseHeaders:headers,body:bundle.body,
    });
    finished=true;notify(true);
  } catch(error) {
    notify(false,error.message);
    if(!finished)await client.send('Fetch.continueRequest',{requestId:p.requestId}).catch(()=>{});
  }
}
