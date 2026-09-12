function extFromMime(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  return 'jpg';
}

async function putPhoto(env, { mimeType, arrayBuffer }) {
  const key = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFromMime(mimeType)}`;
  await env.PHOTOS.put(key, arrayBuffer, { httpMetadata: { contentType: mimeType } });
  return key;
}

async function getPhoto(env, key) {
  return env.PHOTOS.get(key);
}

export { putPhoto, getPhoto };
