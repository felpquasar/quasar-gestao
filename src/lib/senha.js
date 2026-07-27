// Regra de senha do produto: mín. 8 caracteres, 1 maiúscula, 1 caractere especial.
// Mais rígida que o mínimo do Supabase Auth (6) — essa é sempre a que vale.
export const REGRA_SENHA = "A senha precisa ter ao menos 8 caracteres, 1 letra maiúscula e 1 caractere especial.";

export const validarSenha = (senha) => {
  if (senha.length < 8) return REGRA_SENHA;
  if (!/[A-Z]/.test(senha)) return REGRA_SENHA;
  if (!/[^A-Za-z0-9]/.test(senha)) return REGRA_SENHA;
  return null;
};
