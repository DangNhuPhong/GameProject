const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const isCustomCharacter = id => typeof id==='string' && new RegExp(`^custom:${UUID}$`,'i').test(id);
