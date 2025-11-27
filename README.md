# 📖 WoW Pet Tracker

`WoW Pet Tracker` é uma enciclopédia de mascotes de batalha do World of Warcraft que utiliza dados oficiais da **Blizzard API**. A aplicação permite aos usuários pesquisar por mascotes de batalha e obter informações detalhadas, além de dicas e estratégias baseadas nos tipos de pets.

A interface é temática e inspirada no universo do jogo, proporcionando uma experiência imersiva para os jogadores.

## ✨ Funcionalidades

- **Busca de Mascotes:** Pesquise mascotes por nome usando dados oficiais da Blizzard API.
- **Informações Detalhadas:** Veja informações básicas sobre as mascotes encontradas, incluindo tipo e descrição.
- **Estratégias de Batalha:** Obtenha dicas e estratégias baseadas nos tipos de pets e suas vantagens/desvantagens.
- **Interface Temática:** Design sombrio e elementos que remetem ao universo de World of Warcraft.

## 🛠️ Tecnologias Utilizadas

Este projeto foi construído com as seguintes tecnologias:

- **Frontend:**
  - **HTML5:** Estrutura semântica da página.
  - **CSS3:** Estilização avançada com `Flexbox`, `Grid`, Variáveis CSS e gradientes para criar a atmosfera do jogo.
  - **JavaScript (ES6+):** Manipulação dinâmica do DOM e comunicação com o backend através de `fetch API`.

- **Backend:**
  - **Node.js:** Ambiente de execução para o servidor que processa as requisições e se comunica com a API da Blizzard.
  - **Express:** Framework web para Node.js.

- **APIs e Ferramentas:**
  - **Blizzard API:** Utilizada para obter dados oficiais de Battle Pets do World of Warcraft.
  - **Google Fonts:** Para as fontes personalizadas `Cinzel` e `Open Sans`.

## 🚀 Como Configurar

1. **Clone o repositório:**
   ```bash
   git clone <url-do-repositorio>
   cd wow-petdex
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Configure as variáveis de ambiente:**
   - Copie o arquivo `.env.example` para `.env`
   - Obtenha suas credenciais da Blizzard em: https://develop.battle.net/
   - Preencha `BLIZZARD_CLIENT_ID` e `BLIZZARD_CLIENT_SECRET` no arquivo `.env`

4. **Inicie o servidor:**
   ```bash
   npm start
   ```

5. **Acesse a aplicação:**
   - Abra seu navegador em `http://localhost:3000`
   - ⚠️ **IMPORTANTE:** Use o servidor Express (porta 3000), não um servidor de arquivos estáticos como Live Server

## ⚠️ Solução de Problemas

### Erro 405 (Method Not Allowed)
Se você receber o erro `405 Method Not Allowed`, isso significa que você está usando um servidor de arquivos estáticos (como Live Server na porta 5500) ao invés do servidor Express.

**Solução:**
1. Certifique-se de que o servidor Express está rodando: `npm start`
2. Acesse a aplicação em `http://localhost:3000` (não use Live Server ou outros servidores de arquivos estáticos)
3. O servidor Express é necessário porque ele processa as requisições POST para a API da Blizzard

## 📝 Variáveis de Ambiente

- `BLIZZARD_CLIENT_ID`: Seu Client ID da Blizzard API
- `BLIZZARD_CLIENT_SECRET`: Seu Client Secret da Blizzard API
- `BLIZZARD_REGION`: Região da API (us, eu, kr, tw, cn) - padrão: us
- `BLIZZARD_LOCALE`: Locale para os dados (pt_BR, en_US, es_MX, etc) - padrão: pt_BR
- `PORT`: Porta do servidor - padrão: 3000

---

Desenvolvido por **Andreza Pordeus**.