/** Załączniki: uproszczone powiązanie dwóch obiektów (np. aura). */
export function createAttachment({ parentId, childId, kind = 'aura' }) {
  if (!parentId || !childId) throw new TypeError('Załącznik wymaga dwóch obiektów');
  return Object.freeze({ kind, parentId, childId, attached: true });
}
export function detach(attachment) {
  return Object.freeze({ ...attachment, attached: false });
}
