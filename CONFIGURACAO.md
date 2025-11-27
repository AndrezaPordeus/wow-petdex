# 🔧 Configuração da API da Blizzard

Para usar esta aplicação, você precisa configurar as credenciais da API da Blizzard.

## 📋 Passos para Obter as Credenciais

1. Acesse o [Portal de Desenvolvedores da Blizzard](https://develop.battle.net/)
2. Faça login com sua conta Battle.net
3. Crie uma nova aplicação
4. Anote o **Client ID** e **Client Secret**

## 🔐 Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com o seguinte conteúdo:

```env
# Credenciais da API da Blizzard
BLIZZARD_CLIENT_ID=seu_client_id_aqui
BLIZZARD_CLIENT_SECRET=seu_client_secret_aqui

# Região da API (us, eu, kr, tw, cn)
BLIZZARD_REGION=us

# Locale para os dados (pt_BR, en_US, es_MX, etc)
BLIZZARD_LOCALE=pt_BR

# Porta do servidor (opcional)
PORT=3000
```

## ⚙️ Configurações Disponíveis

- **BLIZZARD_CLIENT_ID**: Seu Client ID obtido no portal de desenvolvedores (obrigatório)
- **BLIZZARD_CLIENT_SECRET**: Seu Client Secret obtido no portal de desenvolvedores (obrigatório)
- **BLIZZARD_REGION**: Região da API. Valores possíveis: `us`, `eu`, `kr`, `tw`, `cn` (padrão: `us`)
- **BLIZZARD_LOCALE**: Idioma dos dados retornados. Exemplos: `pt_BR`, `en_US`, `es_MX` (padrão: `pt_BR`)
- **PORT**: Porta onde o servidor será executado (padrão: `3000`)

## ⚠️ Importante

- Nunca commite o arquivo `.env` no repositório
- Mantenha suas credenciais seguras e privadas
- A API da Blizzard usa OAuth2 e os tokens são renovados automaticamente

