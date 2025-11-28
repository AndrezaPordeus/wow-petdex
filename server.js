import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { 
  BLIZZARD_CLIENT_ID, 
  BLIZZARD_CLIENT_SECRET, 
  BLIZZARD_REGION, 
  BLIZZARD_LOCALE 
} from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Cache para o access token
let accessToken = null;
let tokenExpiry = null;

/**
 * Obtém um access token OAuth2 da Blizzard
 * Este token é necessário para fazer chamadas à API da Blizzard
 */
async function obterAccessToken() {
  // Verifica se as credenciais estão configuradas
  if (!BLIZZARD_CLIENT_ID || !BLIZZARD_CLIENT_SECRET) {
    throw new Error('Credenciais da Blizzard não configuradas. Configure BLIZZARD_CLIENT_ID e BLIZZARD_CLIENT_SECRET no arquivo .env');
  }

  // Se temos um token válido, retorna ele (evita fazer requisições desnecessárias)
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    console.log('Usando token de acesso em cache');
    return accessToken;
  }

  try {
    console.log('🔑 Obtendo novo token de acesso da Blizzard...');
    const response = await fetch(
      `https://${BLIZZARD_REGION}.battle.net/oauth/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: BLIZZARD_CLIENT_ID,
          client_secret: BLIZZARD_CLIENT_SECRET,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro ao obter token:', errorText);
      throw new Error(`Erro ao obter token: ${response.status} ${response.statusText}. Verifique suas credenciais.`);
    }

    const data = await response.json();
    
    if (!data.access_token) {
      throw new Error('Token de acesso não recebido da Blizzard API');
    }

    accessToken = data.access_token;
    // Expira 5 minutos antes do tempo real para evitar problemas
    tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
    console.log('Token de acesso obtido com sucesso!');
    return accessToken;
  } catch (error) {
    console.error('Erro ao obter access token:', error);
    throw error;
  }
}

/**
 * Busca pets na API da Blizzard
 */
async function buscarPetsNaBlizzard(termoBusca) {
  try {
    // Primeiro, obtém o token de acesso
    const token = await obterAccessToken();
    
    const baseUrl = `https://${BLIZZARD_REGION}.api.blizzard.com/data/wow`;
    
    // Tenta diferentes formatos de namespace (a API pode usar diferentes formatos)
    const namespaceFormats = [
      `static-${BLIZZARD_REGION}`,  // Formato padrão para dados estáticos
      `static-classic-${BLIZZARD_REGION}`,  // Para Classic
      `static-classic1x-${BLIZZARD_REGION}`,  // Para Classic 1.x
      `static-${BLIZZARD_REGION}-${BLIZZARD_REGION}`,  // Formato alternativo
    ];
    
    let indexData = null;
    let workingBaseUrl = baseUrl;
    let workingNamespace = null;
    let lastError = null;
    
    // Tenta diferentes namespaces até encontrar um que funcione
    for (const namespace of namespaceFormats) {
      try {
        // O token deve ser enviado no header Authorization, não como query parameter
        const indexUrl = `${baseUrl}/pet/index?namespace=${namespace}&locale=${BLIZZARD_LOCALE}`;
        console.log(`Tentando buscar índice de pets com namespace: ${namespace}`);
        
        const indexResponse = await fetch(indexUrl, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (indexResponse.ok) {
          indexData = await indexResponse.json();
          workingNamespace = namespace;
          console.log('Sucesso ao buscar índice de pets!');
          break;
        } else {
          let errorText = '';
          try {
            errorText = await indexResponse.text();
          } catch (e) {
            errorText = 'Não foi possível ler a resposta de erro';
          }
          console.log(`Falhou com namespace ${namespace}: ${indexResponse.status} ${indexResponse.statusText}`);
          if (errorText) {
            console.log(`   Detalhes do erro: ${errorText.substring(0, 200)}`);
          }
          // Se for 404, tenta o próximo namespace
          if (indexResponse.status === 404) {
            lastError = new Error(`Endpoint não encontrado com namespace ${namespace}. Tentando próximo...`);
            continue;
          }
          lastError = new Error(`Erro ao buscar índice de pets: ${indexResponse.status} ${indexResponse.statusText}`);
        }
      } catch (error) {
        console.log(`Erro ao tentar namespace ${namespace}:`, error.message);
        lastError = error;
        continue;
      }
    }
    
    if (!indexData) {
      throw lastError || new Error('Não foi possível acessar a API da Blizzard. Verifique suas credenciais e a documentação da API.');
    }

    if (!indexData || !Array.isArray(indexData.pets)) {
      console.error('Formato de dados inesperado:', indexData);
      throw new Error('Formato de dados inesperado da API da Blizzard');
    }
    
    const pets = indexData.pets || [];
    
    // Filtra pets pelo termo de busca (nome)
    const termoLower = termoBusca.toLowerCase();
    const petsFiltrados = pets.filter(pet => 
      pet.name?.toLowerCase().includes(termoLower)
    ).slice(0, 10); // Limita a 10 resultados

    // Busca detalhes de cada pet
    const finalNamespace = workingNamespace || `static-${BLIZZARD_REGION}`;
    const resultados = await Promise.all(
      petsFiltrados.map(async (pet) => {
        try {
          const petUrl = `${workingBaseUrl}/pet/${pet.id}?namespace=${finalNamespace}&locale=${BLIZZARD_LOCALE}`;
          const petResponse = await fetch(petUrl, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!petResponse.ok) {
            return null;
          }

          const petData = await petResponse.json();
          
          // Mapeia o tipo do pet
          const tipoMap = {
            'BEAST': 'Fera',
            'DRAGONKIN': 'Dragão',
            'FLYING': 'Voador',
            'MAGIC': 'Mágico',
            'MECHANICAL': 'Mecânico',
            'UNDEAD': 'Morto-vivo',
            'AQUATIC': 'Aquático',
            'ELEMENTAL': 'Elemental',
            'CRITTER': 'Bicho',
            'HUMANOID': 'Humanóide'
          };

          const tipo = tipoMap[petData.battle_pet_type?.type] || petData.battle_pet_type?.type || 'Desconhecido';
          
          // Obtém a URL da imagem do pet
          let imagemUrl = null;
          
          try {
            // Primeiro, tenta obter da API de media da Blizzard
            if (petData.media && petData.media.key && petData.media.key.href) {
              console.log(`Buscando imagem do pet ${petData.id} via API de media...`);
              const mediaUrl = petData.media.key.href.startsWith('http') 
                ? petData.media.key.href 
                : `https://${BLIZZARD_REGION}.api.blizzard.com${petData.media.key.href}`;
              
              console.log(`   URL da media: ${mediaUrl.replace(/access_token=[^&]+/, 'access_token=***')}`);
              
              const mediaResponse = await fetch(mediaUrl, {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });
              
              if (mediaResponse.ok) {
                const mediaData = await mediaResponse.json();
                console.log(`   Resposta da media:`, JSON.stringify(mediaData).substring(0, 200));
                
                // Tenta diferentes formatos de resposta da API
                if (mediaData.assets && mediaData.assets.length > 0) {
                  // Procura por diferentes tipos de assets
                  const imageAsset = mediaData.assets.find(asset => 
                    asset.value && (asset.value.includes('.jpg') || asset.value.includes('.png') || asset.value.includes('render'))
                  ) || mediaData.assets[0];
                  
                  if (imageAsset && imageAsset.value) {
                    imagemUrl = imageAsset.value;
                    console.log(`Imagem encontrada: ${imagemUrl.substring(0, 100)}...`);
                  }
                }
              } else {
                console.log(`Erro ao buscar media: ${mediaResponse.status} ${mediaResponse.statusText}`);
              }
            } else {
              console.log(`Pet ${petData.id} não tem media.key.href`);
            }
          } catch (error) {
            console.log(`Erro ao obter imagem do pet ${petData.id}:`, error.message);
          }
          
          // Fallback 1: Usa o formato do render.worldofwarcraft.com
          if (!imagemUrl && petData.id) {
            imagemUrl = `https://render-${BLIZZARD_REGION}.worldofwarcraft.com/portrait/${petData.id}.jpg`;
            console.log(`Usando fallback 1 (render): ${imagemUrl}`);
          }
          
          // Fallback 2: Usa o Wowhead (formato alternativo)
          if (!imagemUrl && petData.id) {
            imagemUrl = `https://wow.zamimg.com/images/wow/icons/large/petbattle_${petData.id}.jpg`;
            console.log(`Usando fallback 2 (wowhead): ${imagemUrl}`);
          }
          
          // Fallback 3: Usa o formato de ícone genérico
          if (!imagemUrl && petData.id) {
            imagemUrl = `https://wow.zamimg.com/images/wow/icons/large/inv_pet_${petData.id}.jpg`;
            console.log(`Usando fallback 3 (inv_pet): ${imagemUrl}`);
          }
          
          console.log(`URL final da imagem para pet ${petData.id}: ${imagemUrl || 'NENHUMA'}`);
          
          return {
            titulo: petData.name,
            tipo: tipo,
            descricao: petData.description || `Um ${tipo.toLowerCase()} de Azeroth.`,
            link: `https://www.wowhead.com/pt/battle-pet/${petData.id}`,
            imagem: imagemUrl
          };
        } catch (error) {
          console.error(`Erro ao buscar detalhes do pet ${pet.id}:`, error);
          return null;
        }
      })
    );

    return resultados.filter(pet => pet !== null);
  } catch (error) {
    console.error('Erro ao buscar pets na Blizzard:', error);
    throw error;
  }
}

/**
 * Busca todos os pets (sem filtro de busca) para exibir na tela inicial
 */
async function buscarPetsIniciais() {
  try {
    const token = await obterAccessToken();
    const baseUrl = `https://${BLIZZARD_REGION}.api.blizzard.com/data/wow`;
    
    const namespaceFormats = [
      `static-${BLIZZARD_REGION}`,
      `static-classic-${BLIZZARD_REGION}`,
      `static-classic1x-${BLIZZARD_REGION}`,
      `static-${BLIZZARD_REGION}-${BLIZZARD_REGION}`,
    ];
    
    let indexData = null;
    let workingBaseUrl = baseUrl;
    let workingNamespace = null;
    let lastError = null;
    
    for (const namespace of namespaceFormats) {
      try {
        const indexUrl = `${baseUrl}/pet/index?namespace=${namespace}&locale=${BLIZZARD_LOCALE}`;
        const indexResponse = await fetch(indexUrl, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (indexResponse.ok) {
          indexData = await indexResponse.json();
          workingNamespace = namespace;
          break;
        } else {
          if (indexResponse.status === 404) {
            lastError = new Error(`Endpoint não encontrado com namespace ${namespace}. Tentando próximo...`);
            continue;
          }
          lastError = new Error(`Erro ao buscar índice de pets: ${indexResponse.status} ${indexResponse.statusText}`);
        }
      } catch (error) {
        lastError = error;
        continue;
      }
    }
    
    if (!indexData) {
      throw lastError || new Error('Não foi possível acessar a API da Blizzard.');
    }

    if (!indexData || !Array.isArray(indexData.pets)) {
      throw new Error('Formato de dados inesperado da API da Blizzard');
    }
    
    const pets = indexData.pets || [];
    
    // Limita a apenas 27 pets (9 + 9 + 9 = 27 pets em 3 páginas) - pega os últimos adicionados
    const petsSelecionados = pets.slice(-27);

    // Busca detalhes de cada pet
    const finalNamespace = workingNamespace || `static-${BLIZZARD_REGION}`;
    const resultados = await Promise.all(
      petsSelecionados.map(async (pet) => {
        try {
          const petUrl = `${workingBaseUrl}/pet/${pet.id}?namespace=${finalNamespace}&locale=${BLIZZARD_LOCALE}`;
          const petResponse = await fetch(petUrl, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!petResponse.ok) {
            return null;
          }

          const petData = await petResponse.json();
          
          const tipoMap = {
            'BEAST': 'Fera',
            'DRAGONKIN': 'Dragão',
            'FLYING': 'Voador',
            'MAGIC': 'Mágico',
            'MECHANICAL': 'Mecânico',
            'UNDEAD': 'Morto-vivo',
            'AQUATIC': 'Aquático',
            'ELEMENTAL': 'Elemental',
            'CRITTER': 'Bicho',
            'HUMANOID': 'Humanóide'
          };

          const tipo = tipoMap[petData.battle_pet_type?.type] || petData.battle_pet_type?.type || 'Desconhecido';
          
          let imagemUrl = null;
          
          try {
            if (petData.media && petData.media.key && petData.media.key.href) {
              const mediaUrl = petData.media.key.href.startsWith('http') 
                ? petData.media.key.href 
                : `https://${BLIZZARD_REGION}.api.blizzard.com${petData.media.key.href}`;
              
              const mediaResponse = await fetch(mediaUrl, {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });
              
              if (mediaResponse.ok) {
                const mediaData = await mediaResponse.json();
                if (mediaData.assets && mediaData.assets.length > 0) {
                  const imageAsset = mediaData.assets.find(asset => 
                    asset.value && (asset.value.includes('.jpg') || asset.value.includes('.png') || asset.value.includes('render'))
                  ) || mediaData.assets[0];
                  
                  if (imageAsset && imageAsset.value) {
                    imagemUrl = imageAsset.value;
                  }
                }
              }
            }
          } catch (error) {
            console.log(`Erro ao obter imagem do pet ${petData.id}:`, error.message);
          }
          
          if (!imagemUrl && petData.id) {
            imagemUrl = `https://render-${BLIZZARD_REGION}.worldofwarcraft.com/portrait/${petData.id}.jpg`;
          }
          
          if (!imagemUrl && petData.id) {
            imagemUrl = `https://wow.zamimg.com/images/wow/icons/large/petbattle_${petData.id}.jpg`;
          }
          
          if (!imagemUrl && petData.id) {
            imagemUrl = `https://wow.zamimg.com/images/wow/icons/large/inv_pet_${petData.id}.jpg`;
          }
          
          // Valida se o pet tem nome antes de retornar
          if (!petData.name) {
            console.warn(`Pet ${petData.id} não tem nome, ignorando...`);
            return null;
          }
          
          return {
            titulo: petData.name,
            tipo: tipo,
            descricao: petData.description || `Um ${tipo.toLowerCase()} de Azeroth.`,
            link: `https://www.wowhead.com/pt/battle-pet/${petData.id}`,
            imagem: imagemUrl
          };
        } catch (error) {
          console.error(`Erro ao buscar detalhes do pet ${pet.id}:`, error);
          return null;
        }
      })
    );

    const petsFiltrados = resultados.filter(pet => {
      const valido = pet !== null && pet && pet.titulo && typeof pet.titulo === 'string';
      if (!valido && pet) {
        console.warn('Pet inválido filtrado:', pet);
      }
      return valido;
    });
    
    console.log(`📊 Pets válidos após filtro: ${petsFiltrados.length} de ${resultados.length}`);
    
    if (petsFiltrados.length === 0) {
      console.warn('⚠️ Nenhum pet válido encontrado após filtrar');
      return [];
    }
    
    // Ordena os pets alfabeticamente pelo título
    try {
      petsFiltrados.sort((a, b) => {
        const tituloA = (a.titulo || '').toLowerCase();
        const tituloB = (b.titulo || '').toLowerCase();
        return tituloA.localeCompare(tituloB, 'pt-BR');
      });
    } catch (error) {
      console.error('Erro ao ordenar pets:', error);
      // Retorna sem ordenar se houver erro
    }
    
    return petsFiltrados;
  } catch (error) {
    console.error('Erro ao buscar pets iniciais:', error);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

// Validação das credenciais da Blizzard
if (!BLIZZARD_CLIENT_ID || !BLIZZARD_CLIENT_SECRET) {
  console.warn('AVISO: BLIZZARD_CLIENT_ID ou BLIZZARD_CLIENT_SECRET não configurados!');
  console.warn('Configure as variáveis de ambiente no arquivo .env');
  console.warn('Veja CONFIGURACAO.md para mais detalhes');
}

// Nova rota para pets iniciais - deve vir antes da rota /api/busca
app.get("/api/pets-iniciais", async (req, res) => {
  console.log('📥 Requisição recebida em /api/pets-iniciais');
  try {
    if (!BLIZZARD_CLIENT_ID || !BLIZZARD_CLIENT_SECRET) {
      return res.status(500).json({ 
        error: 'Credenciais da Blizzard não configuradas. Configure BLIZZARD_CLIENT_ID e BLIZZARD_CLIENT_SECRET no arquivo .env' 
      });
    }

    const pagina = parseInt(req.query.pagina) || 1;
    const limite = parseInt(req.query.limite) || 9;
    
    console.log(`Buscando pets - Página ${pagina}, ${limite} por página...`);
    
    let todosPets;
    try {
      todosPets = await buscarPetsIniciais();
    } catch (error) {
      console.error('❌ Erro ao chamar buscarPetsIniciais:', error);
      throw error;
    }
    
    if (!Array.isArray(todosPets)) {
      console.error('❌ buscarPetsIniciais não retornou um array. Tipo:', typeof todosPets);
      throw new Error(`Formato de dados inválido retornado pela função buscarPetsIniciais. Tipo recebido: ${typeof todosPets}`);
    }
    
    console.log(`📊 Total de pets retornados pela função: ${todosPets.length}`);
    
    // Limita a apenas 27 pets (9 + 9 + 9 = 27 pets em 3 páginas)
    const petsLimitados = todosPets.slice(0, 27);
    
    if (petsLimitados.length === 0) {
      console.warn('⚠️ Nenhum pet válido encontrado');
      return res.json({ 
        pets: [],
        paginacao: {
          paginaAtual: 1,
          totalPaginas: 1,
          totalPets: 0,
          limite: limite
        }
      });
    }
    
    // Calcula a paginação
    const totalPets = petsLimitados.length;
    const totalPaginas = Math.ceil(totalPets / limite);
    const inicio = Math.max(0, (pagina - 1) * limite);
    const fim = Math.min(totalPets, inicio + limite);
    const petsPagina = petsLimitados.slice(inicio, fim);
    
    console.log(`✅ Retornando ${petsPagina.length} pets da página ${pagina} de ${totalPaginas} (total: ${totalPets})`);
    return res.json({ 
      pets: petsPagina,
      paginacao: {
        paginaAtual: pagina,
        totalPaginas: totalPaginas,
        totalPets: totalPets,
        limite: limite
      }
    });
  } catch (error) {
    console.error('❌ Erro na rota /api/pets-iniciais:', error);
    console.error('Stack trace:', error.stack);
    console.error('Tipo do erro:', error.constructor.name);
    
    // Retorna uma resposta de erro mais detalhada
    const errorResponse = {
      error: error.message || 'Erro desconhecido ao buscar pets iniciais',
      tipo: error.constructor.name
    };
    
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = error.stack;
      errorResponse.fullError = JSON.stringify(error, Object.getOwnPropertyNames(error));
    }
    
    res.status(500).json(errorResponse);
  }
});

// Rota da API - deve vir antes do middleware de arquivos estáticos
app.post("/api/busca", async (req, res) => {
  const { prompt } = req.body;
  
  try {
    // Verifica se as credenciais estão configuradas
    if (!BLIZZARD_CLIENT_ID || !BLIZZARD_CLIENT_SECRET) {
      return res.status(500).json({ 
        error: 'Credenciais da Blizzard não configuradas. Configure BLIZZARD_CLIENT_ID e BLIZZARD_CLIENT_SECRET no arquivo .env' 
      });
    }

    // Extrai o termo de busca do prompt
    const match = prompt.match(/termo:\s*"([^"]+)"/i);
    const termoBusca = match ? match[1] : '';

    const pets = await buscarPetsNaBlizzard(termoBusca);
    console.log(`Retornando ${pets.length} pets encontrados`);
    pets.forEach((pet, index) => {
      console.log(`   Pet ${index + 1}: ${pet.titulo} - Imagem: ${pet.imagem ? 'SIM (' + pet.imagem.substring(0, 50) + '...)' : 'NÃO'}`);
    });
    return res.json({ text: JSON.stringify(pets) });
  } catch (error) {
    console.error('Erro na rota /api/busca:', error);
    res.status(500).json({ 
      error: error.message || 'Erro desconhecido ao buscar pets'
    });
  }
});

// Rota para gerar estratégia
app.post("/api/estrategia", async (req, res) => {
  const { nomePet, tipoPet } = req.body;
  
  try {
    // Estratégias baseadas em tipo
    const estrategias = {
      'Fera': {
        forte: 'Contra Dragões e Mágicos.',
        fraqueza: 'Vulnerável a Mecânicos.',
        dica: 'Use habilidades de ataque físico para maximizar dano.'
      },
      'Dragão': {
        forte: 'Contra Mágicos e Aquáticos.',
        fraqueza: 'Vulnerável a Feras.',
        dica: 'Habilidades de respiração são poderosas em combate.'
      },
      'Morto-vivo': {
        forte: 'Contra Humanos e Feras.',
        fraqueza: 'Vulnerável a Mágicos.',
        dica: 'Resistência a stuns e habilidades de sobrevivência são chave.'
      },
      'Mágico': {
        forte: 'Contra Morto-vivo e Mecânicos.',
        fraqueza: 'Vulnerável a Dragões.',
        dica: 'Foque em habilidades de controle e dano mágico.'
      },
      'Mecânico': {
        forte: 'Contra Feras.',
        fraqueza: 'Vulnerável a Mágicos.',
        dica: 'Habilidades de auto-reparo aumentam sobrevivência.'
      },
      'Voador': {
        forte: 'Contra Aquáticos.',
        fraqueza: 'Vulnerável a Mágicos.',
        dica: 'Velocidade e evasão são suas principais vantagens.'
      },
      'Humanóide': {
        forte: 'Contra Elementais.',
        fraqueza: 'Vulnerável a Voadores.',
        dica: 'Habilidades de controles são essenciais.'
      },
      'Aquático': {
        forte: 'Contra Dragões.',
        fraqueza: 'Vulnerável a Voadores.',
        dica: 'Habilidades de cura e resistência são importantes.'
      },
      'Elemental': {
        forte: 'Contra Mecânicos.',
        fraqueza: 'Vulnerável a Aquáticos',
        dica: 'Dano elemental puro é sua especialidade.'
        
      }
    };

    const estrategia = estrategias[tipoPet] || {
      forte: 'Varia conforme o pet',
      fraqueza: 'Depende do pet específico',
      dica: 'Estude as habilidades do pet para criar estratégias eficazes.'
    };

    const resposta = `⚔️ Qual sua principal vantagem?\n${estrategia.forte}\n\n 🛡️ Qual sua principal fraqueza?\n${estrategia.fraqueza}\n\n 💡 Uma dica tática rápida.\n${estrategia.dica}`;

    return res.json({ text: resposta });
  } catch (error) {
    console.error('Erro ao gerar estratégia:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve arquivos estáticos (HTML, CSS, JS, imagens, etc.) - deve vir depois das rotas da API
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
