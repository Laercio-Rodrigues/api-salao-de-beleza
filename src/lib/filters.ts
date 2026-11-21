// Registro ativo = "deletedAt" é null OU nem existe no documento (MongoDB trata os dois casos de forma diferente).
export const notDeletedFilter = {
  OR: [{ deletedAt: null }, { deletedAt: { isSet: false } }],
}