# Ativar SQL direto (uma vez só)

Isso permite que o Claude rode SQL neste projeto sem você precisar copiar/colar no Supabase Dashboard.

1. Abra https://supabase.com/dashboard e entre no projeto **quasar-gestao**.
2. No menu lateral, vá em **Project Settings** (ícone de engrenagem) → **Database**.
3. Na seção **Connection string**, escolha a aba **URI**.
4. Copie a string (começa com `postgresql://postgres...`).
5. Abra o arquivo `.env` na raiz deste projeto (`D:\Quasares\quasar-gestao\.env`) num editor de texto.
6. Adicione uma linha nova:
   ```
   DATABASE_URL=cole_aqui_a_string_copiada
   ```
   Troque `[YOUR-PASSWORD]` na string pela senha do banco (a mesma tela do Supabase mostra ou deixa copiar já preenchida).
7. Salve o arquivo. **Não cole essa string no chat** — é a chave-mestra do banco.
8. Pronto. Na próxima vez que pedir para mexer no banco, o Claude já roda direto.
