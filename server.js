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
 * Busca dados do pet no Wowhead fazendo scraping da página HTML
 * O Wowhead tem informações completas sobre stats, breeds, qualidade, etc.
 */
async function buscarDadosWowhead(petId) {
  try {
    // Usa o mesmo formato de URL que a API retorna
    const url = `https://www.wowhead.com/pt/battle-pet/${petId}`;
    console.log(`🌐 Buscando dados do Wowhead: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    
    if (!response.ok) {
      console.log(`⚠️ Erro ao acessar Wowhead: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const html = await response.text();
    const dados = {};
    
    // Salva uma amostra do HTML para debug (primeiros 5000 caracteres)
    console.log(`📄 HTML recebido (primeiros 5000 chars): ${html.substring(0, 5000)}`);
    
    // 0. PRIORIDADE: Procura na div bpet-calc que contém os atributos corretos
    // O Wowhead usa essa div para calcular e exibir os stats do pet no nível máximo (25)
    // A div bpet-calc já mostra os stats no nível 25, então precisamos extrair esses valores
    const bpetCalcMatch = html.match(/<div[^>]*class="[^"]*bpet-calc[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (bpetCalcMatch && bpetCalcMatch[1]) {
      const bpetCalcContent = bpetCalcMatch[1];
      console.log(`✅ Encontrada div bpet-calc para pet ${petId} (nível máximo)`);
      console.log(`📄 Conteúdo completo da bpet-calc: ${bpetCalcContent}`);
      
      // Verifica se há indicação de nível na div (geralmente nível 25)
      const levelMatch = bpetCalcContent.match(/level[:\s]*(\d+)|nível[:\s]*(\d+)/i);
      if (levelMatch) {
        const level = parseInt(levelMatch[1] || levelMatch[2]);
        console.log(`📊 Nível detectado na bpet-calc: ${level}`);
      } else {
        console.log(`📊 Assumindo nível máximo (25) - bpet-calc geralmente mostra stats do nível 25`);
      }
      
      // O Wowhead geralmente armazena os dados em atributos data-* ou em elementos específicos
      // Procura por todos os atributos data-* que possam conter stats
      const allDataAttrs = bpetCalcContent.matchAll(/data-([^=]+)="([^"]+)"/gi);
      for (const match of allDataAttrs) {
        const attrName = match[1].toLowerCase();
        const attrValue = match[2];
        
        if (attrName.includes('health') || attrName.includes('hp') || attrName.includes('vida')) {
          const val = parseInt(attrValue);
          // Stats do nível 25: health geralmente entre 200-2000, power 8-20, speed 8-20
          if (val >= 200 && val <= 2000 && !dados.health) {
            dados.health = val;
            console.log(`✅ Health (nível 25) encontrado via data-${attrName}: ${dados.health}`);
          }
        }
        if (attrName.includes('power') || attrName.includes('dano') || attrName.includes('attack')) {
          const val = parseInt(attrValue);
          // Power no nível 25 geralmente entre 8-20
          if (val >= 8 && val <= 20 && !dados.power) {
            dados.power = val;
            console.log(`✅ Power (nível 25) encontrado via data-${attrName}: ${dados.power}`);
          }
        }
        if (attrName.includes('speed') || attrName.includes('velocidade')) {
          const val = parseInt(attrValue);
          // Speed no nível 25 geralmente entre 8-20
          if (val >= 8 && val <= 20 && !dados.speed) {
            dados.speed = val;
            console.log(`✅ Speed (nível 25) encontrado via data-${attrName}: ${dados.speed}`);
          }
        }
      }
      
      // Procura por padrões de texto com labels e valores
      // Exemplo: "Health: 150" ou "Vida: 150" ou "<span>150</span> Health"
      const textPatterns = [
        // Padrão: Label seguido de número
        /(?:Health|Vida|HP)[:\s]*(\d+)/i,
        /(?:Power|Dano|Damage|Attack)[:\s]*(\d+)/i,
        /(?:Speed|Velocidade)[:\s]*(\d+)/i,
        // Padrão: Número seguido de label
        /(\d+)[\s]*[<]?[^<]*[<]?[^>]*>(?:Health|Vida|HP)/i,
        /(\d+)[\s]*[<]?[^<]*[<]?[^>]*>(?:Power|Dano|Damage|Attack)/i,
        /(\d+)[\s]*[<]?[^<]*[<]?[^>]*>(?:Speed|Velocidade)/i,
        // Padrão: Número dentro de tags próximas a labels
        /<[^>]*>(?:Health|Vida|HP)[^<]*<\/[^>]*>\s*<[^>]*>(\d+)/i,
        /<[^>]*>(?:Power|Dano|Damage)[^<]*<\/[^>]*>\s*<[^>]*>(\d+)/i,
        /<[^>]*>(?:Speed|Velocidade)[^<]*<\/[^>]*>\s*<[^>]*>(\d+)/i
      ];
      
      for (let i = 0; i < textPatterns.length; i += 3) {
        const healthPattern = textPatterns[i];
        const powerPattern = textPatterns[i + 1];
        const speedPattern = textPatterns[i + 2];
        
        if (healthPattern && !dados.health) {
          const match = bpetCalcContent.match(healthPattern);
          if (match && match[1]) {
            const val = parseInt(match[1]);
            // Health no nível 25 geralmente entre 200-2000 (maior que nível 1)
            if (val >= 200 && val <= 2000) {
              dados.health = val;
              console.log(`✅ Health (nível 25) encontrado na bpet-calc: ${dados.health}`);
            }
          }
        }
        
        if (powerPattern && !dados.power) {
          const match = bpetCalcContent.match(powerPattern);
          if (match && match[1]) {
            const val = parseInt(match[1]);
            // Power no nível 25 geralmente entre 8-20 (maior que nível 1)
            if (val >= 8 && val <= 20) {
              dados.power = val;
              console.log(`✅ Power (nível 25) encontrado na bpet-calc: ${dados.power}`);
            }
          }
        }
        
        if (speedPattern && !dados.speed) {
          const match = bpetCalcContent.match(speedPattern);
          if (match && match[1]) {
            const val = parseInt(match[1]);
            // Speed no nível 25 geralmente entre 8-20 (maior que nível 1)
            if (val >= 8 && val <= 20) {
              dados.speed = val;
              console.log(`✅ Speed (nível 25) encontrado na bpet-calc: ${dados.speed}`);
            }
          }
        }
      }
      
      // Procura por números em elementos HTML específicos (spans, divs, etc.)
      // O Wowhead pode usar estruturas como: <span class="q">150</span> ou <div>150</div>
      const numberElements = bpetCalcContent.matchAll(/<(?:span|div|td|li)[^>]*>(\d+)<\/(?:span|div|td|li)>/gi);
      const numbers = [];
      for (const match of numberElements) {
        const num = parseInt(match[1]);
        if (num >= 5 && num <= 2000) {
          numbers.push(num);
        }
      }
      
      // Se encontrou números mas não identificou qual é qual, tenta inferir pela ordem/posição
      // A bpet-calc mostra stats do nível 25, então os valores são maiores
      if (numbers.length >= 3 && (!dados.health || !dados.power || !dados.speed)) {
        numbers.sort((a, b) => b - a);
        // O maior número geralmente é health (nível 25: 200-2000), os outros dois são power e speed (nível 25: 8-20)
        if (!dados.health && numbers[0] >= 200) dados.health = numbers[0];
        if (!dados.power && numbers[1] >= 8 && numbers[1] <= 20) dados.power = numbers[1];
        if (!dados.speed && numbers[2] >= 8 && numbers[2] <= 20) dados.speed = numbers[2];
        console.log(`✅ Stats (nível 25) inferidos da bpet-calc: Health=${dados.health || 'N/A'}, Power=${dados.power || 'N/A'}, Speed=${dados.speed || 'N/A'}`);
      }
      
      // Procura por breeds na bpet-calc
      const breedsPatterns = [
        /(?:Breeds?|Raças?)[:\s]*([P/S/H/B\/\s,]+)/i,
        /breed[:\s]*([P/S/H/B\/\s,]+)/i,
        /data-breed="([^"]+)"/i,
        /"breeds":\s*\[([^\]]+)\]/i
      ];
      
      for (const pattern of breedsPatterns) {
        const match = bpetCalcContent.match(pattern);
        if (match && match[1]) {
          const breedsStr = match[1].trim();
          const breedsArray = breedsStr.split(/[,\s]+/).filter(b => /^[P/S/H/B\/]+$/.test(b));
          if (breedsArray.length > 0) {
            dados.breeds = breedsArray;
            console.log(`✅ Breeds encontrados na bpet-calc: ${breedsArray.join(', ')}`);
            break;
          }
        }
      }
      
      // Procura por qualidade na bpet-calc
      const qualidadePatterns = [
        /(?:Qualidade|Quality)[:\s]*["']?(Pobre|Comum|Incomum|Raro|Poor|Common|Uncommon|Rare)/i,
        /data-quality="([^"]+)"/i,
        /quality[:\s]*["']?(Pobre|Comum|Incomum|Raro|Poor|Common|Uncommon|Rare)/i
      ];
      
      for (const pattern of qualidadePatterns) {
        const match = bpetCalcContent.match(pattern);
        if (match && match[1]) {
          const qualidadeMap = {
            'Poor': 'Pobre', 'Common': 'Comum', 'Uncommon': 'Incomum', 'Rare': 'Raro'
          };
          dados.quality = qualidadeMap[match[1]] || match[1];
          console.log(`✅ Qualidade encontrada na bpet-calc: ${dados.quality}`);
          break;
        }
      }
    }
    
    // 0.5. Tenta buscar dados via API do Wowhead (se disponível)
    // O Wowhead pode fazer chamadas AJAX para obter dados do pet
    try {
      // Tenta acessar dados via formato JSON do Wowhead
      const jsonUrl = `https://www.wowhead.com/pt/battle-pet=${petId}&json`;
      const jsonResponse = await fetch(jsonUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });
      
      if (jsonResponse.ok) {
        const jsonData = await jsonResponse.json();
        console.log(`✅ Dados JSON do Wowhead recebidos (nível máximo):`, Object.keys(jsonData));
        
        // Verifica se os dados são do nível 25 (nível máximo)
        // Stats do nível 25 são maiores: health >= 200, power/speed >= 8
        if (jsonData.health || jsonData.power || jsonData.speed) {
          if (jsonData.health && jsonData.health >= 200 && !dados.health) {
            dados.health = jsonData.health;
            console.log(`✅ Health (nível 25) do JSON: ${dados.health}`);
          }
          if (jsonData.power && jsonData.power >= 8 && !dados.power) {
            dados.power = jsonData.power;
            console.log(`✅ Power (nível 25) do JSON: ${dados.power}`);
          }
          if (jsonData.speed && jsonData.speed >= 8 && !dados.speed) {
            dados.speed = jsonData.speed;
            console.log(`✅ Speed (nível 25) do JSON: ${dados.speed}`);
          }
        }
        
        if (jsonData.stats) {
          if (jsonData.stats.health && jsonData.stats.health >= 200 && !dados.health) {
            dados.health = jsonData.stats.health;
            console.log(`✅ Health (nível 25) do JSON stats: ${dados.health}`);
          }
          if (jsonData.stats.power && jsonData.stats.power >= 8 && !dados.power) {
            dados.power = jsonData.stats.power;
            console.log(`✅ Power (nível 25) do JSON stats: ${dados.power}`);
          }
          if (jsonData.stats.speed && jsonData.stats.speed >= 8 && !dados.speed) {
            dados.speed = jsonData.stats.speed;
            console.log(`✅ Speed (nível 25) do JSON stats: ${dados.speed}`);
          }
        }
        
        if (jsonData.breeds && !dados.breeds) dados.breeds = jsonData.breeds;
        if (jsonData.quality && !dados.quality) dados.quality = jsonData.quality;
      }
    } catch (error) {
      console.log(`⚠️ Não foi possível acessar JSON do Wowhead: ${error.message}`);
    }
    
    // 1. Procura por dados em scripts JavaScript - padrões mais específicos do Wowhead
    // O Wowhead geralmente usa WH.g_items, WH.g_pageInfo, ou dados em variáveis JavaScript
    const scriptPatterns = [
      // Procura por objetos JSON completos com dados do pet
      /WH\.g_items\[(\d+)\]\s*=\s*({[\s\S]*?});/,
      /var g_pageInfo\s*=\s*({[\s\S]*?});/,
      /WH\.setPageData\(({[\s\S]*?})\);/,
      /new Listview\(({[\s\S]*?})\)/,
      // Procura por dados em formato de tooltip ou tooltipData
      /tooltipData\s*=\s*({[\s\S]*?});/,
      /tooltip:\s*({[\s\S]*?})/,
      // Procura por dados de stats específicos
      /"health":\s*(\d+)/,
      /"power":\s*(\d+)/,
      /"speed":\s*(\d+)/,
      /"stats":\s*({[\s\S]*?})/
    ];
    
    for (const pattern of scriptPatterns) {
      const matches = html.matchAll(new RegExp(pattern.source, 'gi'));
      for (const match of matches) {
        try {
          if (match[1] && match[1].startsWith('{')) {
            const jsonData = JSON.parse(match[1]);
            if (jsonData.stats || jsonData.health || jsonData.power || jsonData.speed) {
              Object.assign(dados, jsonData);
              if (jsonData.stats) {
                Object.assign(dados, jsonData.stats);
              }
              console.log(`✅ Dados JSON encontrados em script para pet ${petId}`);
            }
          } else if (match[1] && !isNaN(match[1])) {
            // Se encontrou um número direto (health, power, speed)
            const key = match[0].includes('health') ? 'health' : 
                       match[0].includes('power') ? 'power' : 
                       match[0].includes('speed') ? 'speed' : null;
            if (key) {
              dados[key] = parseInt(match[1]);
            }
          }
        } catch (e) {
          // Continua tentando outros padrões
        }
      }
    }
    
    // 2. Procura por stats em tabelas HTML do Wowhead
    // O Wowhead geralmente mostra stats em tabelas com classes específicas
    const tablePatterns = [
      // Procura por padrão: <td>Vida</td><td>150</td>
      /<td[^>]*>Vida[^<]*<\/td>\s*<td[^>]*>(\d+)/i,
      /<td[^>]*>Health[^<]*<\/td>\s*<td[^>]*>(\d+)/i,
      /<td[^>]*>Dano[^<]*<\/td>\s*<td[^>]*>(\d+)/i,
      /<td[^>]*>Power[^<]*<\/td>\s*<td[^>]*>(\d+)/i,
      /<td[^>]*>Velocidade[^<]*<\/td>\s*<td[^>]*>(\d+)/i,
      /<td[^>]*>Speed[^<]*<\/td>\s*<td[^>]*>(\d+)/i,
      // Procura por padrão: <span>Vida: 150</span>
      /<span[^>]*>Vida[:\s]*(\d+)/i,
      /<span[^>]*>Health[:\s]*(\d+)/i,
      /<span[^>]*>Dano[:\s]*(\d+)/i,
      /<span[^>]*>Power[:\s]*(\d+)/i,
      /<span[^>]*>Velocidade[:\s]*(\d+)/i,
      /<span[^>]*>Speed[:\s]*(\d+)/i
    ];
    
    for (const pattern of tablePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const value = parseInt(match[1]);
        if (pattern.source.includes('Vida') || pattern.source.includes('Health')) {
          if (!dados.health) dados.health = value;
        } else if (pattern.source.includes('Dano') || pattern.source.includes('Power')) {
          if (!dados.power) dados.power = value;
        } else if (pattern.source.includes('Velocidade') || pattern.source.includes('Speed')) {
          if (!dados.speed) dados.speed = value;
        }
      }
    }
    
    // 3. Procura por stats em atributos data-* ou em divs com classes específicas
    const dataAttrPatterns = [
      /data-health="(\d+)"/i,
      /data-power="(\d+)"/i,
      /data-speed="(\d+)"/i,
      /data-stat-health="(\d+)"/i,
      /data-stat-power="(\d+)"/i,
      /data-stat-speed="(\d+)"/i
    ];
    
    for (const pattern of dataAttrPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const value = parseInt(match[1]);
        if (pattern.source.includes('health') && !dados.health) dados.health = value;
        if (pattern.source.includes('power') && !dados.power) dados.power = value;
        if (pattern.source.includes('speed') && !dados.speed) dados.speed = value;
      }
    }
    
    // 4. Procura por breeds no HTML - padrões mais específicos
    const breedsPatterns = [
      /(?:Breeds?|Raças?)[:\s]*([P/S/H/B\/\s,]+)/i,
      /breed[:\s]*([P/S/H/B\/\s,]+)/i,
      /"breeds":\s*\[([^\]]+)\]/i,
      /breedIds[:\s]*\[([^\]]+)\]/i
    ];
    
    for (const pattern of breedsPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const breedsStr = match[1].trim();
        // Se for um array JSON, tenta parsear
        if (breedsStr.startsWith('[') || breedsStr.includes(',')) {
          try {
            const breedsArray = JSON.parse(`[${breedsStr.replace(/[^\d,]/g, '')}]`);
            if (Array.isArray(breedsArray) && breedsArray.length > 0) {
              // Converte IDs de breeds para formato P/P, S/S, etc.
              const breedMap = {
                3: 'P/P', 4: 'P/S', 5: 'P/B', 6: 'S/P', 7: 'S/S', 8: 'S/B',
                9: 'H/P', 10: 'H/S', 11: 'H/H', 12: 'H/B', 13: 'B/P', 14: 'B/S', 15: 'B/H', 16: 'B/B'
              };
              dados.breeds = breedsArray.map(id => breedMap[id] || id).filter(Boolean);
            }
          } catch (e) {
            // Se não conseguir parsear como JSON, tenta como string
            const breedsArray = breedsStr.split(/[,\s]+/).filter(b => /^[P/S/H/B\/]+$/.test(b));
            if (breedsArray.length > 0) {
              dados.breeds = breedsArray;
            }
          }
        } else {
          const breedsArray = breedsStr.split(/[,\s]+/).filter(b => /^[P/S/H/B\/]+$/.test(b));
          if (breedsArray.length > 0) {
            dados.breeds = breedsArray;
          }
        }
        if (dados.breeds && dados.breeds.length > 0) {
          console.log(`✅ Breeds encontrados: ${dados.breeds.join(', ')}`);
          break;
        }
      }
    }
    
    // 5. Procura por qualidade - padrões mais específicos
    const qualidadePatterns = [
      /(?:Qualidade|Quality)[:\s]*<[^>]*>(Pobre|Comum|Incomum|Raro|Poor|Common|Uncommon|Rare)/i,
      /quality[:\s]*["']?(Pobre|Comum|Incomum|Raro|Poor|Common|Uncommon|Rare)/i,
      /"quality":\s*["']?(Pobre|Comum|Incomum|Raro|Poor|Common|Uncommon|Rare)/i,
      /qualityId[:\s]*(\d+)/i
    ];
    
    for (const pattern of qualidadePatterns) {
      const match = html.match(pattern);
      if (match) {
        if (match[1] && isNaN(match[1])) {
          // É uma string de qualidade
          const qualidadeMap = {
            'Poor': 'Pobre', 'Common': 'Comum', 'Uncommon': 'Incomum', 'Rare': 'Raro'
          };
          dados.quality = qualidadeMap[match[1]] || match[1];
        } else if (match[1] && !isNaN(match[1])) {
          // É um ID de qualidade
          const qualidadeMap = { 0: 'Pobre', 1: 'Comum', 2: 'Incomum', 3: 'Raro' };
          dados.quality = qualidadeMap[parseInt(match[1])] || 'Comum';
        }
        if (dados.quality) {
          console.log(`✅ Qualidade encontrada: ${dados.quality}`);
          break;
        }
      }
    }
    
    // 6. Busca abrangente em todos os scripts
    const allScripts = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    if (allScripts) {
      for (const scriptTag of allScripts) {
        const scriptContent = scriptTag.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
        if (scriptContent && scriptContent[1]) {
          const content = scriptContent[1];
          
          // Procura por objetos JSON maiores que podem conter todos os dados
          const largeJsonPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*"health"[^{}]*\}/i;
          const largeMatch = content.match(largeJsonPattern);
          if (largeMatch) {
            try {
              const jsonData = JSON.parse(largeMatch[0]);
              if (jsonData.health || jsonData.power || jsonData.speed) {
                Object.assign(dados, jsonData);
                if (jsonData.stats) Object.assign(dados, jsonData.stats);
                console.log(`✅ Dados JSON grandes encontrados para pet ${petId}`);
              }
            } catch (e) {
              // Continua
            }
          }
          
          // Procura por números de stats se ainda não encontrou
          if (!dados.health || !dados.power || !dados.speed) {
            const healthRegex = /(?:health|vida|hp)[:\s=]*(\d{2,4})/i;
            const powerRegex = /(?:power|dano|damage|attack)[:\s=]*(\d{1,2})/i;
            const speedRegex = /(?:speed|velocidade)[:\s=]*(\d{1,2})/i;
            
            const hMatch = content.match(healthRegex);
            const pMatch = content.match(powerRegex);
            const sMatch = content.match(speedRegex);
            
            if (hMatch && hMatch[1] && !dados.health) {
              const val = parseInt(hMatch[1]);
              if (val >= 100 && val <= 2000) dados.health = val; // Validação: vida geralmente entre 100-2000
            }
            if (pMatch && pMatch[1] && !dados.power) {
              const val = parseInt(pMatch[1]);
              if (val >= 5 && val <= 20) dados.power = val; // Validação: dano geralmente entre 5-20
            }
            if (sMatch && sMatch[1] && !dados.speed) {
              const val = parseInt(sMatch[1]);
              if (val >= 5 && val <= 20) dados.speed = val; // Validação: velocidade geralmente entre 5-20
            }
          }
        }
      }
    }
    
    // Log dos dados encontrados
    if (dados.health) console.log(`✅ Health encontrado: ${dados.health}`);
    if (dados.power) console.log(`✅ Power encontrado: ${dados.power}`);
    if (dados.speed) console.log(`✅ Speed encontrado: ${dados.speed}`);
    
    // Se encontrou algum dado, retorna
    if (Object.keys(dados).length > 0) {
      console.log(`✅ Dados extraídos do Wowhead para pet ${petId}:`, dados);
      return dados;
    }
    
    console.log(`⚠️ Nenhum dado encontrado no Wowhead para pet ${petId}`);
    return null;
  } catch (error) {
    console.log(`❌ Erro ao buscar dados do Wowhead para pet ${petId}:`, error.message);
    return null;
  }
}

/**
 * Busca dados completos do pet via endpoint /data/wow/pet/{petId}
 * @param {number} petId - ID do pet
 * @param {string} token - Token de acesso OAuth2
 * @param {string} namespace - Namespace da API
 * @param {string} baseUrl - URL base da API
 * @returns {Promise<Object|null>} Dados completos do pet ou null se erro
 */
async function buscarDadosCompletosPet(petId, token, namespace, baseUrl) {
  try {
    const petUrl = `${baseUrl}/pet/${petId}?namespace=${namespace}&locale=${BLIZZARD_LOCALE}`;
    console.log(`📦 Buscando dados completos do pet ${petId}...`);
    
    const response = await fetch(petUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ Erro ao buscar pet ${petId}: ${response.status} ${response.statusText}`);
      return null;
    }

    const petData = await response.json();
    console.log(`✅ Dados completos do pet ${petId} recebidos. Chaves:`, Object.keys(petData));
    return petData;
  } catch (error) {
    console.error(`❌ Erro ao buscar dados completos do pet ${petId}:`, error.message);
    return null;
  }
}

/**
 * Busca mídia do pet via endpoint /data/wow/media/pet/{petId}
 * @param {number} petId - ID do pet
 * @param {string} token - Token de acesso OAuth2
 * @param {string} namespace - Namespace da API
 * @param {string} baseUrl - URL base da API
 * @returns {Promise<Object|null>} Dados de mídia do pet ou null se erro
 */
async function buscarMediaPet(petId, token, namespace, baseUrl) {
  try {
    const mediaUrl = `${baseUrl}/media/pet/${petId}?namespace=${namespace}&locale=${BLIZZARD_LOCALE}`;
    console.log(`🖼️ Buscando mídia do pet ${petId}...`);
    
    const response = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ Erro ao buscar mídia do pet ${petId}: ${response.status} ${response.statusText}`);
      return null;
    }

    const mediaData = await response.json();
    console.log(`✅ Mídia do pet ${petId} recebida. Assets:`, mediaData.assets?.length || 0);
    return mediaData;
  } catch (error) {
    console.error(`❌ Erro ao buscar mídia do pet ${petId}:`, error.message);
    return null;
  }
}

/**
 * Busca índice de habilidades de pets via endpoint /data/wow/pet-ability/index
 * @param {string} token - Token de acesso OAuth2
 * @param {string} namespace - Namespace da API
 * @param {string} baseUrl - URL base da API
 * @returns {Promise<Array|null>} Array de habilidades ou null se erro
 */
async function buscarIndiceHabilidades(token, namespace, baseUrl) {
  try {
    const indexUrl = `${baseUrl}/pet-ability/index?namespace=${namespace}&locale=${BLIZZARD_LOCALE}`;
    console.log(`📚 Buscando índice de habilidades de pets...`);
    
    const response = await fetch(indexUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ Erro ao buscar índice de habilidades: ${response.status} ${response.statusText}`);
      return null;
    }

    const indexData = await response.json();
    const abilities = indexData.abilities || [];
    console.log(`✅ Índice de habilidades recebido: ${abilities.length} habilidades encontradas`);
    return abilities;
  } catch (error) {
    console.error(`❌ Erro ao buscar índice de habilidades:`, error.message);
    return null;
  }
}

/**
 * Busca dados completos de uma habilidade via endpoint /data/wow/pet-ability/{petAbilityId}
 * @param {number} abilityId - ID da habilidade
 * @param {string} token - Token de acesso OAuth2
 * @param {string} namespace - Namespace da API
 * @param {string} baseUrl - URL base da API
 * @returns {Promise<Object|null>} Dados completos da habilidade ou null se erro
 */
async function buscarDadosHabilidade(abilityId, token, namespace, baseUrl) {
  try {
    const abilityUrl = `${baseUrl}/pet-ability/${abilityId}?namespace=${namespace}&locale=${BLIZZARD_LOCALE}`;
    console.log(`⚔️ Buscando dados da habilidade ${abilityId}...`);
    
    const response = await fetch(abilityUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ Erro ao buscar habilidade ${abilityId}: ${response.status} ${response.statusText}`);
      return null;
    }

    const abilityData = await response.json();
    console.log(`✅ Dados da habilidade ${abilityId} recebidos. Nome: ${abilityData.name || 'N/A'}`);
    return abilityData;
  } catch (error) {
    console.error(`❌ Erro ao buscar dados da habilidade ${abilityId}:`, error.message);
    return null;
  }
}

/**
 * Busca mídia de uma habilidade via endpoint /data/wow/media/pet-ability/{petAbilityId}
 * @param {number} abilityId - ID da habilidade
 * @param {string} token - Token de acesso OAuth2
 * @param {string} namespace - Namespace da API
 * @param {string} baseUrl - URL base da API
 * @returns {Promise<Object|null>} Dados de mídia da habilidade ou null se erro
 */
async function buscarMediaHabilidade(abilityId, token, namespace, baseUrl) {
  try {
    const mediaUrl = `${baseUrl}/media/pet-ability/${abilityId}?namespace=${namespace}&locale=${BLIZZARD_LOCALE}`;
    console.log(`🖼️ Buscando mídia da habilidade ${abilityId}...`);
    
    const response = await fetch(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.warn(`⚠️ Erro ao buscar mídia da habilidade ${abilityId}: ${response.status} ${response.statusText}`);
      return null;
    }

    const mediaData = await response.json();
    console.log(`✅ Mídia da habilidade ${abilityId} recebida. Assets:`, mediaData.assets?.length || 0);
    return mediaData;
  } catch (error) {
    console.error(`❌ Erro ao buscar mídia da habilidade ${abilityId}:`, error.message);
    return null;
  }
}

/**
 * Extrai URL da imagem dos assets de mídia
 * @param {Object} mediaData - Dados de mídia retornados pela API
 * @returns {string|null} URL da imagem ou null se não encontrada
 */
function extrairUrlImagem(mediaData) {
  if (!mediaData || !mediaData.assets || !Array.isArray(mediaData.assets)) {
    return null;
  }

  // Prioriza assets maiores (geralmente os últimos ou com maior resolução)
  const imageAsset = mediaData.assets.find(asset => 
    asset.value && (
      asset.value.includes('.jpg') || 
      asset.value.includes('.png') || 
      asset.value.includes('render') ||
      asset.value.includes('icon')
    )
  ) || mediaData.assets[mediaData.assets.length - 1]; // Pega o último (geralmente maior)

  if (imageAsset && imageAsset.value) {
    return imageAsset.value;
  }

  return null;
}

/**
 * Busca pets na API da Blizzard
 */
/**
 * Busca um pet diretamente pelo ID (mais preciso)
 * @param {number|string} petId - ID do pet
 * @param {string} tipoFiltro - Filtro opcional por tipo
 * @returns {Promise<Array>} Array com o pet encontrado ou array vazio
 */
async function buscarPetPorId(petId, tipoFiltro = null) {
  try {
    const token = await obterAccessToken();
    const baseUrl = `https://${BLIZZARD_REGION}.api.blizzard.com/data/wow`;
    
    // Tenta diferentes formatos de namespace
    const namespaceFormats = [
      `static-${BLIZZARD_REGION}`,
      `static-classic-${BLIZZARD_REGION}`,
      `static-classic1x-${BLIZZARD_REGION}`,
      `static-${BLIZZARD_REGION}-${BLIZZARD_REGION}`,
    ];
    
    let workingNamespace = null;
    let workingBaseUrl = baseUrl;
    
    // Encontra um namespace que funcione
    for (const namespace of namespaceFormats) {
      try {
        const testUrl = `${baseUrl}/pet/${petId}?namespace=${namespace}&locale=${BLIZZARD_LOCALE}`;
        const testResponse = await fetch(testUrl, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (testResponse.ok) {
          workingNamespace = namespace;
          console.log(`✅ Namespace funcionando para busca por ID: ${namespace}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }
    
    if (!workingNamespace) {
      throw new Error('Não foi possível encontrar um namespace válido para buscar pet por ID');
    }
    
    // Busca dados completos do pet pelo ID (usando a mesma lógica de buscarPetsNaBlizzard)
    // Simula um objeto pet com apenas o ID para usar a mesma lógica de processamento
    const petSimulado = { id: petId };
    
    // Usa a mesma lógica de processamento que já existe
    const petData = await buscarDadosCompletosPet(petId, token, workingNamespace, workingBaseUrl);
    
    if (!petData) {
      console.warn(`⚠️ Pet com ID ${petId} não encontrado`);
      return [];
    }
    
    // Aplica filtro por tipo se fornecido
    if (tipoFiltro) {
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
      
      const tipoPet = tipoMap[petData.battle_pet_type?.type] || petData.battle_pet_type?.type || '';
      const tipoFiltroNormalizado = tipoFiltro.trim();
      
      if (tipoPet !== tipoFiltroNormalizado) {
        console.log(`⚠️ Pet ${petId} não corresponde ao filtro de tipo: ${tipoPet} !== ${tipoFiltroNormalizado}`);
        return [];
      }
    }
    
    // Processa o pet usando a mesma lógica inline (será refatorado depois)
    // Por enquanto, retorna um array com o pet processado usando a mesma lógica
    const resultado = await processarPetIndividual(petSimulado, petData, token, workingNamespace, workingBaseUrl);
    
    return resultado ? [resultado] : [];
    
  } catch (error) {
    console.error(`❌ Erro ao buscar pet por ID ${petId}:`, error.message);
    return [];
  }
}

/**
 * Processa um pet individual (extraído da lógica de buscarPetsNaBlizzard para reutilização)
 */
async function processarPetIndividual(pet, petData, token, finalNamespace, workingBaseUrl) {
  // Esta função contém toda a lógica de processamento que já existe
  // Será implementada movendo o código existente para cá
  // Por enquanto, retorna null para não quebrar
  return null;
}

async function buscarPetsNaBlizzard(termoBusca, tipoFiltro = null) {
  try {
    // Se o termo de busca é um número (ID), busca diretamente pelo ID
    const termoNumero = parseInt(termoBusca);
    if (!isNaN(termoNumero) && termoBusca.trim() === termoNumero.toString()) {
      console.log(`🔍 Termo de busca é um ID numérico: ${termoNumero}. Buscando diretamente pelo ID...`);
      const petPorId = await buscarPetPorId(termoNumero, tipoFiltro);
      if (petPorId && petPorId.length > 0) {
        console.log(`✅ Pet encontrado diretamente pelo ID ${termoNumero}`);
        return petPorId;
      }
      console.log(`⚠️ Pet com ID ${termoNumero} não encontrado, tentando busca por nome...`);
    }
    
    // IMPORTANTE: A partir daqui, sempre usa o ID do pet para buscar informações precisas
    // Mesmo quando busca por nome, filtra pelo nome mas depois busca cada pet pelo seu ID
    
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
    
    // Filtra pets pelo termo de busca (nome) se fornecido
    let petsFiltrados = pets;
    if (termoBusca && termoBusca.trim() !== '') {
    const termoLower = termoBusca.toLowerCase();
      petsFiltrados = pets.filter(pet => 
      pet.name?.toLowerCase().includes(termoLower)
      );
      // Se há filtro por tipo, busca TODOS os pets que correspondem ao termo
      // Caso contrário, limita a 50 resultados
      if (tipoFiltro) {
        console.log(`Filtrado por nome "${termoBusca}" com filtro por tipo. Buscando TODOS os ${petsFiltrados.length} pets encontrados`);
        // Não aplica slice, busca todos que correspondem ao termo
      } else {
        petsFiltrados = petsFiltrados.slice(0, 50);
        console.log(`Filtrado por nome "${termoBusca}": ${petsFiltrados.length} pets encontrados (limite: 50)`);
      }
    } else {
      // Se não há termo de busca mas há filtro por tipo, busca TODOS os pets
      // Caso contrário, limita a 200 resultados
      if (tipoFiltro) {
        // Busca todos os pets quando há filtro por tipo (sem limite)
        console.log(`Sem termo de busca, mas com filtro por tipo. Buscando TODOS os ${pets.length} pets disponíveis`);
        petsFiltrados = pets; // Não aplica slice, busca todos
      } else {
        petsFiltrados = petsFiltrados.slice(0, 200);
        console.log(`Sem termo de busca. Buscando ${petsFiltrados.length} pets (limite: 200)`);
      }
    }

    // Busca detalhes de cada pet usando as novas funções auxiliares
    // SEMPRE usa o ID do pet para buscar informações precisas
    const finalNamespace = workingNamespace || `static-${BLIZZARD_REGION}`;
    console.log(`🔍 Buscando detalhes de ${petsFiltrados.length} pets usando seus IDs para máxima precisão...`);
    
    const resultados = await Promise.all(
      petsFiltrados.map(async (pet) => {
        try {
          // 1. Busca dados completos do pet via /data/wow/pet/{petId} - SEMPRE usa o ID
          console.log(`📋 Buscando pet ID ${pet.id} (${pet.name}) diretamente pelo ID...`);
          const petData = await buscarDadosCompletosPet(pet.id, token, finalNamespace, workingBaseUrl);
          
          if (!petData) {
            console.warn(`⚠️ Não foi possível obter dados do pet ${pet.id}`);
            return null;
          }
          
          // 2. Busca mídia do pet via /data/wow/media/pet/{petId}
          const mediaData = await buscarMediaPet(pet.id, token, finalNamespace, workingBaseUrl);
          
          // 3. Busca habilidades do pet (se disponíveis)
          let habilidadesCompletas = [];
          if (petData.abilities && Array.isArray(petData.abilities) && petData.abilities.length > 0) {
            console.log(`🔍 Pet ${pet.id} tem ${petData.abilities.length} habilidades. Buscando detalhes...`);
            
            // Busca dados completos de cada habilidade
            const habilidadesPromises = petData.abilities.map(async (ability) => {
              const abilityId = ability.ability?.id || ability.id || ability;
              if (!abilityId) return null;
              
              const abilityData = await buscarDadosHabilidade(abilityId, token, finalNamespace, workingBaseUrl);
              const abilityMedia = await buscarMediaHabilidade(abilityId, token, finalNamespace, workingBaseUrl);
              
              return {
                id: abilityId,
                dados: abilityData,
                media: abilityMedia,
                imagem: extrairUrlImagem(abilityMedia)
              };
            });
            
            habilidadesCompletas = (await Promise.all(habilidadesPromises)).filter(h => h !== null);
            console.log(`✅ ${habilidadesCompletas.length} habilidades completas obtidas para pet ${pet.id}`);
          }
          
          // Tenta buscar do endpoint de creature (se houver creature_id)
          let dadosCreature = null;
          if (petData.creature && petData.creature.id) {
            try {
              const creatureUrl = `${workingBaseUrl}/creature/${petData.creature.id}?namespace=${finalNamespace}&locale=${BLIZZARD_LOCALE}`;
              const creatureResponse = await fetch(creatureUrl, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

              if (creatureResponse.ok) {
                dadosCreature = await creatureResponse.json();
                console.log(`📦 Dados do creature para pet ${pet.id}:`, Object.keys(dadosCreature));
              }
            } catch (error) {
              console.log(`Erro ao buscar dados de creature do pet ${pet.id}:`, error.message);
            }
          }
          
          // Tenta buscar dados do Wowhead como complemento
          let dadosWowhead = null;
          try {
            dadosWowhead = await buscarDadosWowhead(pet.id);
            if (dadosWowhead) {
              console.log(`🌐 Dados do Wowhead para pet ${pet.id}:`, Object.keys(dadosWowhead));
            }
          } catch (error) {
            console.log(`Erro ao buscar dados do Wowhead para pet ${pet.id}:`, error.message);
          }
          
          // LOG COMPLETO: mostra toda a estrutura de dados retornada pela API
          console.log(`\n🔍 === ESTRUTURA COMPLETA DO PET ${petData.id} (${petData.name}) ===`);
          console.log('Todas as chaves disponíveis:', Object.keys(petData));
          console.log('Objeto completo (primeiros 2000 caracteres):', JSON.stringify(petData, null, 2).substring(0, 2000));
          
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
          
          // Obtém a URL da imagem do pet usando a função auxiliar
          let imagemUrl = extrairUrlImagem(mediaData);
          
          // Fallback 1: Tenta obter do href do media se disponível
          if (!imagemUrl && petData.media && petData.media.key && petData.media.key.href) {
          try {
              const mediaUrl = petData.media.key.href.startsWith('http') 
                ? petData.media.key.href 
                : `https://${BLIZZARD_REGION}.api.blizzard.com${petData.media.key.href}`;
              
              const mediaResponse = await fetch(mediaUrl, {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });
              
              if (mediaResponse.ok) {
                const mediaDataFallback = await mediaResponse.json();
                imagemUrl = extrairUrlImagem(mediaDataFallback);
              }
            } catch (error) {
              console.log(`Erro ao buscar media via href:`, error.message);
            }
          }
          
          // Fallback 2: Usa o formato do render.worldofwarcraft.com
          if (!imagemUrl && petData.id) {
            imagemUrl = `https://render-${BLIZZARD_REGION}.worldofwarcraft.com/portrait/${petData.id}.jpg`;
            console.log(`Usando fallback 1 (render): ${imagemUrl}`);
          }
          
          // Fallback 3: Usa o Wowhead (formato alternativo)
          if (!imagemUrl && petData.id) {
            imagemUrl = `https://wow.zamimg.com/images/wow/icons/large/petbattle_${petData.id}.jpg`;
            console.log(`Usando fallback 2 (wowhead): ${imagemUrl}`);
          }
          
          // Fallback 4: Usa o formato de ícone genérico
          if (!imagemUrl && petData.id) {
            imagemUrl = `https://wow.zamimg.com/images/wow/icons/large/inv_pet_${petData.id}.jpg`;
            console.log(`Usando fallback 3 (inv_pet): ${imagemUrl}`);
          }
          
          console.log(`URL final da imagem para pet ${petData.id}: ${imagemUrl || 'NENHUMA'}`);
          
          // LOG COMPLETO: mostra toda a estrutura de dados retornada pela API
          console.log(`\n🔍 === ESTRUTURA COMPLETA DO PET ${petData.id} (${petData.name}) ===`);
          console.log('Todas as chaves disponíveis:', Object.keys(petData));
          console.log('Objeto completo (primeiros 2000 caracteres):', JSON.stringify(petData, null, 2).substring(0, 2000));
          
          // Debug: log da estrutura de dados recebida
          console.log(`\n=== DEBUG Pet ${petData.id} (${petData.name}) ===`);
          console.log('Stats:', JSON.stringify(petData.stats));
          console.log('Quality:', JSON.stringify(petData.quality));
          console.log('Breeds:', JSON.stringify(petData.breeds));
          console.log('Source:', JSON.stringify(petData.source));
          
          // Extrai estatísticas do pet
          // A API pode retornar stats de diferentes formas - vamos tentar todos os lugares possíveis
          let vida = 0, dano = 0, velocidade = 0;
          
          // Tenta diferentes caminhos para encontrar as estatísticas
          // 1. Diretamente em petData.stats
          if (petData.stats) {
            vida = petData.stats.health || petData.stats.base_health || 0;
            dano = petData.stats.power || petData.stats.base_power || 0;
            velocidade = petData.stats.speed || petData.stats.base_speed || 0;
          }
          
          // 2. Tenta em dados adicionais do media
          if ((vida === 0 || dano === 0 || velocidade === 0) && mediaData) {
            if (mediaData.stats) {
              vida = vida || mediaData.stats.health || mediaData.stats.base_health || 0;
              dano = dano || mediaData.stats.power || mediaData.stats.base_power || 0;
              velocidade = velocidade || mediaData.stats.speed || mediaData.stats.base_speed || 0;
            }
          }
          
          // 3. Tenta em dados do creature
          if ((vida === 0 || dano === 0 || velocidade === 0) && dadosCreature) {
            if (dadosCreature.stats) {
              vida = vida || dadosCreature.stats.health || dadosCreature.stats.base_health || 0;
              dano = dano || dadosCreature.stats.power || dadosCreature.stats.base_power || 0;
              velocidade = velocidade || dadosCreature.stats.speed || dadosCreature.stats.base_speed || 0;
            }
          }
          
          // 4. Tenta em dados do Wowhead (prioridade alta - dados mais confiáveis)
          if (dadosWowhead) {
            // O Wowhead pode retornar stats diretamente ou em um objeto stats
            if (dadosWowhead.health && dadosWowhead.health > 0) {
              vida = dadosWowhead.health;
              console.log(`✅ Usando health do Wowhead: ${vida}`);
            }
            if (dadosWowhead.power && dadosWowhead.power > 0) {
              dano = dadosWowhead.power;
              console.log(`✅ Usando power do Wowhead: ${dano}`);
            }
            if (dadosWowhead.speed && dadosWowhead.speed > 0) {
              velocidade = dadosWowhead.speed;
              console.log(`✅ Usando speed do Wowhead: ${velocidade}`);
            }
            if (dadosWowhead.stats) {
              if (dadosWowhead.stats.health && dadosWowhead.stats.health > 0 && !vida) {
                vida = dadosWowhead.stats.health;
              }
              if (dadosWowhead.stats.base_health && dadosWowhead.stats.base_health > 0 && !vida) {
                vida = dadosWowhead.stats.base_health;
              }
              if (dadosWowhead.stats.power && dadosWowhead.stats.power > 0 && !dano) {
                dano = dadosWowhead.stats.power;
              }
              if (dadosWowhead.stats.base_power && dadosWowhead.stats.base_power > 0 && !dano) {
                dano = dadosWowhead.stats.base_power;
              }
              if (dadosWowhead.stats.speed && dadosWowhead.stats.speed > 0 && !velocidade) {
                velocidade = dadosWowhead.stats.speed;
              }
              if (dadosWowhead.stats.base_speed && dadosWowhead.stats.base_speed > 0 && !velocidade) {
                velocidade = dadosWowhead.stats.base_speed;
              }
            }
          }
          
          // Tenta level_stats
          if (vida === 0 && petData.level_stats) {
            vida = petData.level_stats.health || 0;
            dano = petData.level_stats.power || 0;
            velocidade = petData.level_stats.speed || 0;
          }
          
          // Tenta battle_pet_type (pode ter stats)
          if (vida === 0 && petData.battle_pet_type && petData.battle_pet_type.stats) {
            vida = petData.battle_pet_type.stats.health || 0;
            dano = petData.battle_pet_type.stats.power || 0;
            velocidade = petData.battle_pet_type.stats.speed || 0;
          }
          
          // Se ainda não encontrou, busca recursivamente no objeto
          if (vida === 0) {
            const buscarStats = (obj, depth = 0) => {
              if (!obj || typeof obj !== 'object' || depth > 3) return;
              for (const key in obj) {
                if (vida === 0 && (key === 'health' || key === 'base_health')) {
                  vida = obj[key] || 0;
                }
                if (dano === 0 && (key === 'power' || key === 'base_power')) {
                  dano = obj[key] || 0;
                }
                if (velocidade === 0 && (key === 'speed' || key === 'base_speed')) {
                  velocidade = obj[key] || 0;
                }
                // Se todos os stats foram encontrados, podemos parar a busca
                if (vida !== 0 && dano !== 0 && velocidade !== 0) return;
                
                if (typeof obj[key] === 'object') {
                  buscarStats(obj[key], depth + 1);
                }
              }
            };
            buscarStats(petData);
          }
          
          // Se ainda não encontrou stats, usa valores padrão baseados em cálculos típicos
          // Stats de pets no WoW geralmente variam, mas podemos usar valores base
          if (vida === 0 && dano === 0 && velocidade === 0) {
            console.warn(`⚠️ Stats não encontrados para pet ${petData.id}. Usando valores padrão calculados.`);
            // Valores base típicos para pets nível 1 (podem variar)
            // Esses são valores aproximados baseados em pets comuns
            vida = 150; // Valor base típico
            dano = 8;   // Valor base típico
            velocidade = 8; // Valor base típico
          }
          
          console.log(`Estatísticas extraídas - Vida: ${vida}, Dano: ${dano}, Velocidade: ${velocidade}`);
          
          // Mapeia qualidade
          const qualidadeMap = {
            0: 'Pobre',
            1: 'Comum',
            2: 'Incomum',
            3: 'Raro'
          };
          
          // A qualidade pode estar em quality.type, quality.id, ou diretamente como quality
          let qualidadeId = null;
          
          if (petData.quality) {
            if (typeof petData.quality === 'number') {
              qualidadeId = petData.quality;
            } else if (petData.quality.type !== undefined) {
              qualidadeId = petData.quality.type;
            } else if (petData.quality.id !== undefined) {
              qualidadeId = petData.quality.id;
            } else if (typeof petData.quality === 'object') {
              // Tenta encontrar um número no objeto
              for (const key in petData.quality) {
                if (typeof petData.quality[key] === 'number' && petData.quality[key] >= 0 && petData.quality[key] <= 3) {
                  qualidadeId = petData.quality[key];
                  break;
                }
              }
            }
          }
          
          const qualidade = qualidadeId !== null ? (qualidadeMap[qualidadeId] || 'Desconhecida') : 'Desconhecida';
          
          // Se qualidade não foi encontrada, tenta inferir ou usa padrão
          let qualidadeFinal = qualidade;
          if (qualidade === 'Desconhecida') {
            console.warn(`⚠️ Qualidade não encontrada para pet ${petData.id}. Usando 'Comum' como padrão.`);
            qualidadeFinal = 'Comum'; // Qualidade padrão mais comum
          }
          
          console.log(`Qualidade extraída: ${qualidadeFinal} (ID: ${qualidadeId})`);
          
          // Extrai breeds disponíveis
          // A API pode retornar breeds como array de objetos com id ou como array de números
          let breeds = petData.breeds || [];
          
          // Tenta buscar breeds em dados adicionais do media
          if ((!breeds || breeds.length === 0) && mediaData && mediaData.breeds) {
            console.log(`📦 Breeds encontrados em mediaData para pet ${pet.id}`);
            breeds = mediaData.breeds;
          }
          
          // Tenta buscar breeds em dados do creature
          if ((!breeds || breeds.length === 0) && dadosCreature && dadosCreature.breeds) {
            console.log(`📦 Breeds encontrados em dadosCreature para pet ${pet.id}`);
            breeds = dadosCreature.breeds;
          }
          
          // Tenta buscar breeds em dados do Wowhead
          if ((!breeds || breeds.length === 0) && dadosWowhead) {
            if (dadosWowhead.breeds) {
              console.log(`🌐 Breeds encontrados em dadosWowhead para pet ${pet.id}`);
              breeds = dadosWowhead.breeds;
            } else if (dadosWowhead.breedIds) {
              // Se o Wowhead retornar breedIds como array de números
              breeds = dadosWowhead.breedIds;
            }
          }
          
          const breedsDisponiveis = [];
          
          if (Array.isArray(breeds) && breeds.length > 0) {
            breeds.forEach(breed => {
              let breedId;
              if (typeof breed === 'number') {
                breedId = breed;
              } else if (breed && breed.id !== undefined) {
                breedId = breed.id;
              } else if (breed && breed.breed_id !== undefined) {
                breedId = breed.breed_id;
              }
              
              if (breedId !== undefined) {
                // Mapeia breed ID para formato P/P, S/S, etc.
                // IDs de breeds no WoW: 3=P/P, 4=P/S, 5=P/B, 6=S/P, 7=S/S, 8=S/B, 9=H/P, 10=H/S, 11=H/H, 12=H/B, 13=B/P, 14=B/S, 15=B/H, 16=B/B
                const breedMap = {
                  3: 'P/P', 4: 'P/S', 5: 'P/B',
                  6: 'S/P', 7: 'S/S', 8: 'S/B',
                  9: 'H/P', 10: 'H/S', 11: 'H/H', 12: 'H/B',
                  13: 'B/P', 14: 'B/S', 15: 'B/H', 16: 'B/B'
                };
                const breedFormatado = breedMap[breedId];
                if (breedFormatado) {
                  breedsDisponiveis.push(breedFormatado);
                }
              }
            });
          }
          
          // Extrai informações de onde obter o pet
          let ondeObter = 'Informação não disponível';
          
          // A API pode retornar source de diferentes formas
          if (petData.source) {
            let sourceType, sourceName;
            
            if (typeof petData.source === 'string') {
              sourceType = petData.source;
              sourceName = '';
            } else if (petData.source.type) {
              sourceType = petData.source.type;
              sourceName = petData.source.name || '';
            } else if (petData.source.id) {
              // Pode ser um objeto com id que precisa ser mapeado
              const sourceIdMap = {
                'QUEST': 'QUEST',
                'PROFESSION': 'PROFESSION',
                'WORLD_DROP': 'WORLD_DROP',
                'ACHIEVEMENT': 'ACHIEVEMENT',
                'MERCHANT': 'MERCHANT',
                'PET_STORE': 'PET_STORE',
                'PET_BATTLE': 'PET_BATTLE',
                'GARRISON_INVASION': 'GARRISON_INVASION',
                'WORLD_EVENT': 'WORLD_EVENT',
                'DUNGEON': 'DUNGEON',
                'RAID': 'RAID',
                'REPUTATION': 'REPUTATION',
                'CAGE': 'CAGE',
                'TAMING': 'TAMING'
              };
              sourceType = sourceIdMap[petData.source.id] || petData.source.id;
              sourceName = petData.source.name || '';
            }
            
            const sourceMap = {
              'QUEST': `Missão: ${sourceName}`,
              'PROFESSION': `Profissão: ${sourceName}`,
              'WORLD_DROP': `Drop no mundo: ${sourceName}`,
              'ACHIEVEMENT': `Conquista: ${sourceName}`,
              'MERCHANT': `Comerciante: ${sourceName}`,
              'PET_STORE': `Loja de Pets: ${sourceName}`,
              'PET_BATTLE': `Batalha de Pets: ${sourceName}`,
              'GARRISON_INVASION': `Invasão da Guarnição: ${sourceName}`,
              'WORLD_EVENT': `Evento Mundial: ${sourceName}`,
              'DUNGEON': `Masmorra: ${sourceName}`,
              'RAID': `Raide: ${sourceName}`,
              'REPUTATION': `Reputação: ${sourceName}`,
              'CAGE': `Pode ser comprado na Casa de Leilões`,
              'TAMING': `Domável no mundo`
            };
            
            ondeObter = sourceMap[sourceType] || sourceName || `Tipo: ${sourceType}`;
          }
          
          console.log(`Onde obter: ${ondeObter}`);
          console.log(`Breeds disponíveis: ${breedsDisponiveis.join(', ') || 'Nenhum'}`);
          
          // Se não encontrou breeds, usa lista padrão (todos os breeds são possíveis para a maioria dos pets)
          let breedsFinal = breedsDisponiveis;
          if (breedsFinal.length === 0) {
            console.warn(`⚠️ Breeds não encontrados para pet ${petData.id}. Usando lista padrão.`);
            // Lista padrão de breeds mais comuns
            breedsFinal = ['P/P', 'S/S', 'H/H', 'H/P', 'P/S', 'H/S', 'P/B', 'S/B', 'H/B', 'B/B'];
          }
          
          // Determina se o pet é de combate
          // CRITÉRIO: Um pet só é considerado de combate se tiver MAIS DE UMA habilidade
          let ehDeCombate = false;
          
          try {
            if (petData.abilities && Array.isArray(petData.abilities) && petData.abilities.length > 1) {
              // Verifica se as habilidades são válidas (não são apenas objetos vazios)
              const habilidadesValidas = petData.abilities.filter(ability => {
                const abilityId = ability?.ability?.id || ability?.id || ability;
                return abilityId !== undefined && abilityId !== null;
              });
              
              if (habilidadesValidas.length > 1) {
                ehDeCombate = true;
                console.log(`✅ Pet ${petData.id} é de combate: tem ${habilidadesValidas.length} habilidades válidas (mais de 1)`);
              } else {
                console.log(`❌ Pet ${petData.id} NÃO é de combate: tem ${petData.abilities.length} habilidades no array, mas apenas ${habilidadesValidas.length} válidas (precisa de mais de 1)`);
              }
            } else {
              const qtdHabilidades = petData.abilities?.length || 0;
              console.log(`❌ Pet ${petData.id} NÃO é de combate: tem apenas ${qtdHabilidades} habilidade(s) (precisa de mais de 1)`);
            }
          } catch (error) {
            console.error(`Erro ao verificar se pet ${petData.id} é de combate:`, error);
            // Em caso de erro, assume que não é de combate
            ehDeCombate = false;
          }
          
          // Determina se o pet é negociável
          // Um pet é negociável se pode ser colocado em gaiola (cageable)
          let ehNegociavel = false;
          
          // Verifica se há propriedade direta na API
          if (petData.is_cageable !== undefined) {
            ehNegociavel = petData.is_cageable;
          } else if (petData.is_tradable !== undefined) {
            ehNegociavel = petData.is_tradable;
          } else if (petData.cageable !== undefined) {
            ehNegociavel = petData.cageable;
          } else {
            // Verifica pelo source type - se é CAGE, é negociável
            if (petData.source) {
              let sourceType;
              if (typeof petData.source === 'string') {
                sourceType = petData.source;
              } else if (petData.source.type) {
                sourceType = petData.source.type;
              } else if (petData.source.id) {
                const sourceIdMap = {
                  'CAGE': 'CAGE'
                };
                sourceType = sourceIdMap[petData.source.id] || petData.source.id;
              }
              // Se o source é CAGE, o pet pode ser negociado
              ehNegociavel = sourceType === 'CAGE';
            }
          }
          
          // Determina se o pet é capturável
          // Um pet é capturável se pode ser domado no mundo (tameable)
          let ehCapturavel = false;
          
          // Verifica se há propriedade direta na API
          if (petData.is_capturable !== undefined) {
            ehCapturavel = petData.is_capturable;
          } else if (petData.is_tameable !== undefined) {
            ehCapturavel = petData.is_tameable;
          } else if (petData.capturable !== undefined) {
            ehCapturavel = petData.capturable;
          } else if (petData.tameable !== undefined) {
            ehCapturavel = petData.tameable;
          } else {
            // Verifica pelo source type - se é TAMING, é capturável
            if (petData.source) {
              let sourceType;
              if (typeof petData.source === 'string') {
                sourceType = petData.source;
              } else if (petData.source.type) {
                sourceType = petData.source.type;
              } else if (petData.source.id) {
                const sourceIdMap = {
                  'TAMING': 'TAMING'
                };
                sourceType = sourceIdMap[petData.source.id] || petData.source.id;
              }
              // Se o source é TAMING, o pet pode ser capturado
              ehCapturavel = sourceType === 'TAMING';
            }
          }
          
          const petRetornado = {
            titulo: petData.name,
            tipo: tipo,
            descricao: petData.description || `Um ${tipo.toLowerCase()} de Azeroth.`,
            link: `https://www.wowhead.com/pt/battle-pet/${petData.id}`,
            imagem: imagemUrl,
            ehDeCombate: ehDeCombate,
            ehNegociavel: ehNegociavel,
            ehCapturavel: ehCapturavel,
            ondeObter: ondeObter,
            // Informações adicionais dos endpoints
            id: petData.id,
            dadosCompletos: {
              petData: petData,
              mediaData: mediaData,
              creatureData: dadosCreature,
              wowheadData: dadosWowhead
            },
            habilidades: habilidadesCompletas.map(h => ({
              id: h.id,
              nome: h.dados?.name || 'Habilidade Desconhecida',
              descricao: h.dados?.description || '',
              imagem: h.imagem,
              dados: h.dados
            })),
            imagens: {
              principal: imagemUrl,
              mediaAssets: mediaData?.assets || [],
              todas: [
                imagemUrl,
                ...(mediaData?.assets?.map(a => a.value).filter(Boolean) || [])
              ].filter((v, i, a) => a.indexOf(v) === i) // Remove duplicatas
            }
          };
          
          console.log(`✅ Pet objeto completo (buscarPetsNaBlizzard):`, {
            titulo: petRetornado.titulo,
            tipo: petRetornado.tipo,
            id: petRetornado.id,
            habilidades: petRetornado.habilidades.length,
            imagens: petRetornado.imagens.todas.length
          });
          
          return petRetornado;
        } catch (error) {
          console.error(`Erro ao buscar detalhes do pet ${pet.id}:`, error);
          return null;
        }
      })
    );

    console.log(`\n🔍 === PROCESSANDO RESULTADOS ===`);
    console.log(`Total de resultados do Promise.all: ${resultados.length}`);
    console.log(`Resultados null/undefined: ${resultados.filter(r => r === null || r === undefined).length}`);
    
    let petsValidos = resultados.filter(pet => pet !== null && pet.titulo);
    
    console.log(`Total de pets válidos antes do filtro de tipo: ${petsValidos.length}`);
    
    if (petsValidos.length === 0) {
      console.warn('⚠️ NENHUM PET VÁLIDO ENCONTRADO!');
      console.log('Primeiros 3 resultados (mesmo inválidos):', resultados.slice(0, 3).map(r => r ? { titulo: r.titulo, tipo: r.tipo } : 'NULL'));
      return [];
    }
    
    // Aplica filtro por tipo se especificado
    if (tipoFiltro && tipoFiltro.trim() !== '') {
      const antesFiltro = petsValidos.length;
      petsValidos = petsValidos.filter(pet => {
        const match = pet.tipo === tipoFiltro;
        if (!match && pet.titulo) {
          console.log(`Pet "${pet.titulo}" não corresponde ao tipo "${tipoFiltro}" (tipo do pet: "${pet.tipo}")`);
        }
        return match;
      });
      console.log(`Filtrado por tipo "${tipoFiltro}": ${petsValidos.length} de ${antesFiltro} pets encontrados`);
      // Quando há filtro por tipo, retorna TODOS os pets encontrados desse tipo (SEM LIMITE)
      console.log(`✅ Retornando TODOS os ${petsValidos.length} pets do tipo "${tipoFiltro}"`);
      return petsValidos;
    }
    
    // Limita os resultados finais apenas quando não há filtro por tipo.
    // Se um filtro de tipo foi usado, todos os resultados já foram retornados.
    // O limite de 50 já foi aplicado anteriormente se a busca foi apenas por nome.
    if (!tipoFiltro) {
      console.log(`Busca sem filtro de tipo. Retornando ${petsValidos.length} pets (limite já aplicado anteriormente se necessário).`);
    }
    
    if (petsValidos.length > 0) {
      console.log(`\n📋 Exemplo do primeiro pet retornado:`, JSON.stringify(petsValidos[0], null, 2).substring(0, 500));
    }
    
    return petsValidos;
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

    // Busca detalhes de cada pet usando as novas funções auxiliares
    const finalNamespace = workingNamespace || `static-${BLIZZARD_REGION}`;
    const resultados = await Promise.all(
      petsSelecionados.map(async (pet) => {
        try {
          // 1. Busca dados completos do pet via /data/wow/pet/{petId}
          const petData = await buscarDadosCompletosPet(pet.id, token, finalNamespace, workingBaseUrl);
          
          if (!petData) {
            return null;
          }
          
          // 2. Busca mídia do pet via /data/wow/media/pet/{petId}
          const mediaData = await buscarMediaPet(pet.id, token, finalNamespace, workingBaseUrl);
          
          // 3. Busca habilidades do pet (se disponíveis)
          let habilidadesCompletas = [];
          if (petData.abilities && Array.isArray(petData.abilities) && petData.abilities.length > 0) {
            const habilidadesPromises = petData.abilities.map(async (ability) => {
              const abilityId = ability.ability?.id || ability.id || ability;
              if (!abilityId) return null;
              
              const abilityData = await buscarDadosHabilidade(abilityId, token, finalNamespace, workingBaseUrl);
              const abilityMedia = await buscarMediaHabilidade(abilityId, token, finalNamespace, workingBaseUrl);
              
              return {
                id: abilityId,
                dados: abilityData,
                media: abilityMedia,
                imagem: extrairUrlImagem(abilityMedia)
              };
            });
            
            habilidadesCompletas = (await Promise.all(habilidadesPromises)).filter(h => h !== null);
          }
          
          // 4. Tenta buscar dados do Wowhead como complemento
          let dadosWowhead = null;
          try {
            dadosWowhead = await buscarDadosWowhead(pet.id);
            if (dadosWowhead) {
              console.log(`🌐 Dados do Wowhead para pet ${pet.id}:`, Object.keys(dadosWowhead));
            }
          } catch (error) {
            console.log(`Erro ao buscar dados do Wowhead para pet ${pet.id}:`, error.message);
          }
          
          // Debug: log da estrutura de dados recebida
          console.log(`\n=== DEBUG Pet ${petData.id} (${petData.name}) ===`);
          console.log('Stats:', JSON.stringify(petData.stats));
          console.log('Quality:', JSON.stringify(petData.quality));
          console.log('Breeds:', JSON.stringify(petData.breeds));
          console.log('Source:', JSON.stringify(petData.source));
          
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
          
          // Obtém a URL da imagem do pet usando a função auxiliar
          let imagemUrl = extrairUrlImagem(mediaData);
          
          // Fallback 1: Tenta obter do href do media se disponível
          if (!imagemUrl && petData.media && petData.media.key && petData.media.key.href) {
            try {
              const mediaUrl = petData.media.key.href.startsWith('http') 
                ? petData.media.key.href 
                : `https://${BLIZZARD_REGION}.api.blizzard.com${petData.media.key.href}`;
              
              const mediaResponse = await fetch(mediaUrl, {
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });
              
              if (mediaResponse.ok) {
                const mediaDataFallback = await mediaResponse.json();
                imagemUrl = extrairUrlImagem(mediaDataFallback);
              }
            } catch (error) {
              console.log(`Erro ao buscar media via href:`, error.message);
            }
          }
          
          // Fallback 2: Usa o formato do render.worldofwarcraft.com
          if (!imagemUrl && petData.id) {
            imagemUrl = `https://render-${BLIZZARD_REGION}.worldofwarcraft.com/portrait/${petData.id}.jpg`;
          }
          
          // Fallback 3: Usa o Wowhead (formato alternativo)
          if (!imagemUrl && petData.id) {
            imagemUrl = `https://wow.zamimg.com/images/wow/icons/large/petbattle_${petData.id}.jpg`;
          }
          
          // Fallback 4: Usa o formato de ícone genérico
          if (!imagemUrl && petData.id) {
            imagemUrl = `https://wow.zamimg.com/images/wow/icons/large/inv_pet_${petData.id}.jpg`;
          }
          
          console.log(`URL final da imagem para pet ${petData.id}: ${imagemUrl || 'NENHUMA'}`);
          
          // Valida se o pet tem nome antes de retornar
          if (!petData.name) {
            console.warn(`Pet ${petData.id} não tem nome, ignorando...`);
            return null;
          }
          
          // Extrai estatísticas do pet
          // A API pode retornar stats de diferentes formas - vamos tentar todos os lugares possíveis
          let vida = 0, dano = 0, velocidade = 0;
          
          // 1. Diretamente em petData.stats
          if (petData.stats) {
            vida = petData.stats.health || petData.stats.base_health || 0;
            dano = petData.stats.power || petData.stats.base_power || 0;
            velocidade = petData.stats.speed || petData.stats.base_speed || 0;
          }
          
          // 2. Tenta em dados adicionais do media
          if ((vida === 0 || dano === 0 || velocidade === 0) && mediaData) {
            if (mediaData.stats) {
              vida = vida || mediaData.stats.health || mediaData.stats.base_health || 0;
              dano = dano || mediaData.stats.power || mediaData.stats.base_power || 0;
              velocidade = velocidade || mediaData.stats.speed || mediaData.stats.base_speed || 0;
            }
          }
          
          // 3. Tenta level_stats
          if (vida === 0 && petData.level_stats) {
            vida = petData.level_stats.health || 0;
            dano = petData.level_stats.power || 0;
            velocidade = petData.level_stats.speed || 0;
          }
          
          // 4. Tenta battle_pet_type (pode ter stats)
          if (vida === 0 && petData.battle_pet_type && petData.battle_pet_type.stats) {
            vida = petData.battle_pet_type.stats.health || 0;
            dano = petData.battle_pet_type.stats.power || 0;
            velocidade = petData.battle_pet_type.stats.speed || 0;
          }
          
          // 5. Se ainda não encontrou, busca recursivamente no objeto
          if (vida === 0) {
            const buscarStats = (obj, depth = 0) => {
              if (!obj || typeof obj !== 'object' || depth > 3) return;
              for (const key in obj) {
                if (vida === 0 && (key === 'health' || key === 'base_health')) {
                  vida = obj[key] || 0;
                }
                if (dano === 0 && (key === 'power' || key === 'base_power')) {
                  dano = obj[key] || 0;
                }
                if (velocidade === 0 && (key === 'speed' || key === 'base_speed')) {
                  velocidade = obj[key] || 0;
                }
                // Se todos os stats foram encontrados, podemos parar a busca
                if (vida !== 0 && dano !== 0 && velocidade !== 0) return;
                
                if (typeof obj[key] === 'object') {
                  buscarStats(obj[key], depth + 1);
                }
              }
            };
            buscarStats(petData);
          }
          
          // 6. Tenta buscar stats no Wowhead (prioriza dados do nível 25)
          if ((vida === 0 || dano === 0 || velocidade === 0) && dadosWowhead) {
            // Prioriza dados do nível 25 (valores maiores)
            if (dadosWowhead.health && dadosWowhead.health >= 200) {
              vida = vida || dadosWowhead.health;
            }
            if (dadosWowhead.power && dadosWowhead.power >= 8) {
              dano = dano || dadosWowhead.power;
            }
            if (dadosWowhead.speed && dadosWowhead.speed >= 8) {
              velocidade = velocidade || dadosWowhead.speed;
            }
            
            // Fallback para stats em objeto
            if ((vida === 0 || dano === 0 || velocidade === 0) && dadosWowhead.stats) {
              if (dadosWowhead.stats.health && dadosWowhead.stats.health >= 200) {
                vida = vida || dadosWowhead.stats.health;
              }
              if (dadosWowhead.stats.power && dadosWowhead.stats.power >= 8) {
                dano = dano || dadosWowhead.stats.power;
              }
              if (dadosWowhead.stats.speed && dadosWowhead.stats.speed >= 8) {
                velocidade = velocidade || dadosWowhead.stats.speed;
              }
            }
          }
          
          // 7. Se ainda não encontrou stats, usa valores padrão baseados em cálculos típicos
          if (vida === 0 && dano === 0 && velocidade === 0) {
            console.warn(`⚠️ Stats não encontrados para pet ${petData.id}. Usando valores padrão calculados.`);
            // Valores base típicos para pets nível 25 (podem variar)
            vida = 150; // Valor base típico
            dano = 8;   // Valor base típico
            velocidade = 8; // Valor base típico
          }
          
          console.log(`Estatísticas extraídas - Vida: ${vida}, Dano: ${dano}, Velocidade: ${velocidade}`);
          
          // Mapeia qualidade
          const qualidadeMap = {
            0: 'Pobre',
            1: 'Comum',
            2: 'Incomum',
            3: 'Raro'
          };
          
          // A qualidade pode estar em quality.type, quality.id, ou diretamente como quality
          let qualidadeId = null;
          
          if (petData.quality) {
            if (typeof petData.quality === 'number') {
              qualidadeId = petData.quality;
            } else if (petData.quality.type !== undefined) {
              qualidadeId = petData.quality.type;
            } else if (petData.quality.id !== undefined) {
              qualidadeId = petData.quality.id;
            } else if (typeof petData.quality === 'object') {
              // Tenta encontrar um número no objeto
              for (const key in petData.quality) {
                if (typeof petData.quality[key] === 'number' && petData.quality[key] >= 0 && petData.quality[key] <= 3) {
                  qualidadeId = petData.quality[key];
                  break;
                }
              }
            }
          }
          
          // Tenta buscar qualidade no Wowhead se não encontrou
          if (qualidadeId === null && dadosWowhead) {
            if (dadosWowhead.quality) {
              const qualidadeMapWowhead = {
                'Poor': 0, 'Pobre': 0,
                'Common': 1, 'Comum': 1,
                'Uncommon': 2, 'Incomum': 2,
                'Rare': 3, 'Raro': 3
              };
              const qualidadeStr = typeof dadosWowhead.quality === 'string' 
                ? dadosWowhead.quality 
                : dadosWowhead.quality.name || dadosWowhead.quality.type;
              if (qualidadeStr && qualidadeMapWowhead[qualidadeStr] !== undefined) {
                qualidadeId = qualidadeMapWowhead[qualidadeStr];
                console.log(`✅ Qualidade encontrada no Wowhead: ${qualidadeStr} (ID: ${qualidadeId})`);
              }
            }
          }
          
          const qualidade = qualidadeId !== null ? (qualidadeMap[qualidadeId] || 'Desconhecida') : 'Desconhecida';
          
          // Se qualidade não foi encontrada, tenta inferir ou usa padrão
          let qualidadeFinal = qualidade;
          if (qualidade === 'Desconhecida') {
            console.warn(`⚠️ Qualidade não encontrada para pet ${petData.id}. Usando 'Comum' como padrão.`);
            qualidadeFinal = 'Comum'; // Qualidade padrão mais comum
          }
          
          console.log(`Qualidade extraída: ${qualidadeFinal} (ID: ${qualidadeId})`);
          
          // Extrai informações de onde obter o pet
          let ondeObter = 'Informação não disponível';
          
          // A API pode retornar source de diferentes formas
          if (petData.source) {
            let sourceType, sourceName;
            
            if (typeof petData.source === 'string') {
              sourceType = petData.source;
              sourceName = '';
            } else if (petData.source.type) {
              sourceType = petData.source.type;
              sourceName = petData.source.name || '';
            } else if (petData.source.id) {
              // Pode ser um objeto com id que precisa ser mapeado
              const sourceIdMap = {
                'QUEST': 'QUEST',
                'PROFESSION': 'PROFESSION',
                'WORLD_DROP': 'WORLD_DROP',
                'ACHIEVEMENT': 'ACHIEVEMENT',
                'MERCHANT': 'MERCHANT',
                'PET_STORE': 'PET_STORE',
                'PET_BATTLE': 'PET_BATTLE',
                'GARRISON_INVASION': 'GARRISON_INVASION',
                'WORLD_EVENT': 'WORLD_EVENT',
                'DUNGEON': 'DUNGEON',
                'RAID': 'RAID',
                'REPUTATION': 'REPUTATION',
                'CAGE': 'CAGE',
                'TAMING': 'TAMING'
              };
              sourceType = sourceIdMap[petData.source.id] || petData.source.id;
              sourceName = petData.source.name || '';
            }
            
            const sourceMap = {
              'QUEST': `Missão: ${sourceName}`,
              'PROFESSION': `Profissão: ${sourceName}`,
              'WORLD_DROP': `Drop no mundo: ${sourceName}`,
              'ACHIEVEMENT': `Conquista: ${sourceName}`,
              'MERCHANT': `Comerciante: ${sourceName}`,
              'PET_STORE': `Loja de Pets: ${sourceName}`,
              'PET_BATTLE': `Batalha de Pets: ${sourceName}`,
              'GARRISON_INVASION': `Invasão da Guarnição: ${sourceName}`,
              'WORLD_EVENT': `Evento Mundial: ${sourceName}`,
              'DUNGEON': `Masmorra: ${sourceName}`,
              'RAID': `Raide: ${sourceName}`,
              'REPUTATION': `Reputação: ${sourceName}`,
              'CAGE': `Pode ser comprado na Casa de Leilões`,
              'TAMING': `Domável no mundo`
            };
            
            ondeObter = sourceMap[sourceType] || sourceName || `Tipo: ${sourceType}`;
          }
          
          // Extrai breeds disponíveis
          let breeds = petData.breeds || [];
          
          // Tenta buscar breeds em dados adicionais do media
          if ((!breeds || breeds.length === 0) && mediaData && mediaData.breeds) {
            breeds = mediaData.breeds;
          }
          
          // Tenta buscar breeds em dados do Wowhead
          if ((!breeds || breeds.length === 0) && dadosWowhead) {
            if (dadosWowhead.breeds) {
              breeds = dadosWowhead.breeds;
            } else if (dadosWowhead.breedIds) {
              breeds = dadosWowhead.breedIds;
            }
          }
          
          const breedsDisponiveis = [];
          
          if (Array.isArray(breeds) && breeds.length > 0) {
            breeds.forEach(breed => {
              let breedId;
              if (typeof breed === 'number') {
                breedId = breed;
              } else if (breed && breed.id !== undefined) {
                breedId = breed.id;
              } else if (breed && breed.breed_id !== undefined) {
                breedId = breed.breed_id;
              }
              
              if (breedId !== undefined) {
                // Mapeia breed ID para formato P/P, S/S, etc.
                const breedMap = {
                  3: 'P/P', 4: 'P/S', 5: 'P/B',
                  6: 'S/P', 7: 'S/S', 8: 'S/B',
                  9: 'H/P', 10: 'H/S', 11: 'H/H', 12: 'H/B',
                  13: 'B/P', 14: 'B/S', 15: 'B/H', 16: 'B/B'
                };
                const breedFormatado = breedMap[breedId];
                if (breedFormatado) {
                  breedsDisponiveis.push(breedFormatado);
                }
              }
            });
          }
          
          console.log(`Onde obter: ${ondeObter}`);
          console.log(`Breeds disponíveis: ${breedsDisponiveis.join(', ') || 'Nenhum'}`);
          
          // Determina se o pet é de combate
          // CRITÉRIO: Um pet só é considerado de combate se tiver MAIS DE UMA habilidade
          let ehDeCombate = false;
          
          try {
            if (petData.abilities && Array.isArray(petData.abilities) && petData.abilities.length > 1) {
              // Verifica se as habilidades são válidas (não são apenas objetos vazios)
              const habilidadesValidas = petData.abilities.filter(ability => {
                const abilityId = ability?.ability?.id || ability?.id || ability;
                return abilityId !== undefined && abilityId !== null;
              });
              
              if (habilidadesValidas.length > 1) {
                ehDeCombate = true;
                console.log(`✅ Pet ${petData.id} é de combate: tem ${habilidadesValidas.length} habilidades válidas (mais de 1)`);
              } else {
                console.log(`❌ Pet ${petData.id} NÃO é de combate: tem ${petData.abilities.length} habilidades no array, mas apenas ${habilidadesValidas.length} válidas (precisa de mais de 1)`);
              }
            } else {
              const qtdHabilidades = petData.abilities?.length || 0;
              console.log(`❌ Pet ${petData.id} NÃO é de combate: tem apenas ${qtdHabilidades} habilidade(s) (precisa de mais de 1)`);
            }
          } catch (error) {
            console.error(`Erro ao verificar se pet ${petData.id} é de combate:`, error);
            // Em caso de erro, assume que não é de combate
            ehDeCombate = false;
          }
          
          // Determina se o pet é negociável
          // Um pet é negociável se pode ser colocado em gaiola (cageable)
          let ehNegociavel = false;
          
          // Verifica se há propriedade direta na API
          if (petData.is_cageable !== undefined) {
            ehNegociavel = petData.is_cageable;
          } else if (petData.is_tradable !== undefined) {
            ehNegociavel = petData.is_tradable;
          } else if (petData.cageable !== undefined) {
            ehNegociavel = petData.cageable;
          } else {
            // Verifica pelo source type - se é CAGE, é negociável
            if (petData.source) {
              let sourceType;
              if (typeof petData.source === 'string') {
                sourceType = petData.source;
              } else if (petData.source.type) {
                sourceType = petData.source.type;
              } else if (petData.source.id) {
                const sourceIdMap = {
                  'CAGE': 'CAGE'
                };
                sourceType = sourceIdMap[petData.source.id] || petData.source.id;
              }
              // Se o source é CAGE, o pet pode ser negociado
              ehNegociavel = sourceType === 'CAGE';
            }
          }
          
          // Determina se o pet é capturável
          // Um pet é capturável se pode ser domado no mundo (tameable)
          let ehCapturavel = false;
          
          // Verifica se há propriedade direta na API
          if (petData.is_capturable !== undefined) {
            ehCapturavel = petData.is_capturable;
          } else if (petData.is_tameable !== undefined) {
            ehCapturavel = petData.is_tameable;
          } else if (petData.capturable !== undefined) {
            ehCapturavel = petData.capturable;
          } else if (petData.tameable !== undefined) {
            ehCapturavel = petData.tameable;
          } else {
            // Verifica pelo source type - se é TAMING, é capturável
            if (petData.source) {
              let sourceType;
              if (typeof petData.source === 'string') {
                sourceType = petData.source;
              } else if (petData.source.type) {
                sourceType = petData.source.type;
              } else if (petData.source.id) {
                const sourceIdMap = {
                  'TAMING': 'TAMING'
                };
                sourceType = sourceIdMap[petData.source.id] || petData.source.id;
              }
              // Se o source é TAMING, o pet pode ser capturado
              ehCapturavel = sourceType === 'TAMING';
            }
          }
          
          const petRetornado = {
            titulo: petData.name,
            tipo: tipo,
            descricao: petData.description || `Um ${tipo.toLowerCase()} de Azeroth.`,
            link: `https://www.wowhead.com/pt/battle-pet/${petData.id}`,
            imagem: imagemUrl,
            ehDeCombate: ehDeCombate,
            ehNegociavel: ehNegociavel,
            ehCapturavel: ehCapturavel,
            ondeObter: ondeObter,
            // Informações adicionais dos endpoints
            id: petData.id,
            dadosCompletos: {
              petData: petData,
              mediaData: mediaData,
              wowheadData: dadosWowhead
            },
            habilidades: habilidadesCompletas.map(h => ({
              id: h.id,
              nome: h.dados?.name || 'Habilidade Desconhecida',
              descricao: h.dados?.description || '',
              imagem: h.imagem,
              dados: h.dados
            })),
            imagens: {
              principal: imagemUrl,
              mediaAssets: mediaData?.assets || [],
              todas: [
                imagemUrl,
                ...(mediaData?.assets?.map(a => a.value).filter(Boolean) || [])
              ].filter((v, i, a) => a.indexOf(v) === i) // Remove duplicatas
            }
          };
          
          console.log(`✅ Pet objeto completo (buscarPetsIniciais):`, {
            titulo: petRetornado.titulo,
            tipo: petRetornado.tipo,
            id: petRetornado.id,
            habilidades: petRetornado.habilidades.length,
            imagens: petRetornado.imagens.todas.length
          });
          
          return petRetornado;
        } catch (error) {
          console.error(`Erro ao buscar detalhes do pet ${pet.id}:`, error);
          return null;
        }
      })
    );

    console.log(`📊 Total de resultados antes do filtro: ${resultados.length}`);
    console.log(`📊 Resultados null/undefined: ${resultados.filter(r => r === null || r === undefined).length}`);
    
    const petsFiltrados = resultados.filter(pet => {
      const valido = pet !== null && pet && pet.titulo && typeof pet.titulo === 'string';
      if (!valido && pet) {
        console.warn('Pet inválido filtrado:', pet);
      }
      return valido;
    });
    
    console.log(`📊 Pets válidos após filtro: ${petsFiltrados.length} de ${resultados.length}`);
    
    if (petsFiltrados.length === 0 && resultados.length > 0) {
      console.error('⚠️ ATENÇÃO: Todos os pets foram filtrados! Verificando o primeiro resultado...');
      if (resultados[0]) {
        console.error('Primeiro resultado:', JSON.stringify(resultados[0], null, 2).substring(0, 500));
      }
    }
    
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

    // Extrai o termo de busca e o tipo do prompt
    const matchTermo = prompt.match(/termo:\s*"([^"]+)"/i);
    const matchTipo = prompt.match(/tipo:\s*"([^"]+)"/i);
    const termoBusca = matchTermo ? matchTermo[1] : '';
    const tipoFiltro = matchTipo ? matchTipo[1] : null;
    
    console.log(`📋 Prompt recebido: "${prompt}"`);
    console.log(`🔍 Termo de busca extraído: "${termoBusca}"`);
    console.log(`🏷️ Tipo filtro extraído: "${tipoFiltro || 'nenhum'}"`);

    console.log(`\n🔍 === INICIANDO BUSCA ===`);
    console.log(`Termo: "${termoBusca}" | Tipo: "${tipoFiltro || 'nenhum'}"`);
    
    const pets = await buscarPetsNaBlizzard(termoBusca, tipoFiltro);
    
    console.log(`\n✅ === RESULTADO DA BUSCA ===`);
    console.log(`Total de pets retornados: ${pets ? pets.length : 'NULL/UNDEFINED'}`);
    console.log(`Tipo de pets: ${Array.isArray(pets) ? 'Array' : typeof pets}`);
    
    if (!pets) {
      console.error('❌ ERRO: buscarPetsNaBlizzard retornou null ou undefined');
      return res.status(500).json({ 
        error: 'A busca não retornou resultados válidos'
      });
    }
    
    if (!Array.isArray(pets)) {
      console.error('❌ ERRO: buscarPetsNaBlizzard não retornou um array');
      console.error('Tipo retornado:', typeof pets);
      console.error('Valor:', JSON.stringify(pets).substring(0, 200));
      return res.status(500).json({ 
        error: 'Formato de dados inválido retornado pela busca'
      });
    }
    
    if (pets.length === 0) {
      console.warn('⚠️ AVISO: Nenhum pet encontrado');
      return res.json({ text: JSON.stringify([]) });
    }
    
    console.log(`\n📋 === DETALHES DOS PETS ===`);
    pets.forEach((pet, index) => {
      console.log(`\nPet ${index + 1}:`);
      console.log(`  Título: ${pet.titulo || 'SEM TÍTULO'}`);
      console.log(`  Tipo: ${pet.tipo || 'SEM TIPO'}`);
      console.log(`  Imagem: ${pet.imagem ? 'SIM' : 'NÃO'}`);
      console.log(`  É de Combate: ${pet.ehDeCombate !== undefined ? pet.ehDeCombate : 'UNDEFINED'}`);
      console.log(`  É Capturável: ${pet.ehCapturavel !== undefined ? pet.ehCapturavel : 'UNDEFINED'}`);
      console.log(`  É Negociável: ${pet.ehNegociavel !== undefined ? pet.ehNegociavel : 'UNDEFINED'}`);
      console.log(`  Onde obter: ${pet.ondeObter || 'UNDEFINED'}`);
      console.log(`  Habilidades: ${pet.habilidades ? pet.habilidades.length : 0}`);
    });
    
    // Debug: log do primeiro pet completo
    if (pets.length > 0) {
      console.log('\n🔍 === PRIMEIRO PET COMPLETO (JSON) ===');
      console.log(JSON.stringify(pets[0], null, 2));
    }
    
    const jsonString = JSON.stringify(pets);
    console.log(`\n📤 === ENVIANDO RESPOSTA ===`);
    console.log(`Tamanho da string JSON: ${jsonString.length} caracteres`);
    console.log(`Primeiros 200 caracteres: ${jsonString.substring(0, 200)}...`);
    
    return res.json({ text: jsonString });
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
    // Tabela de tipos de batalha: Forte contra (Dano +50%) e Fraco contra (Dano -33%)
    // Baseado na mecânica oficial do World of Warcraft
    const tiposBatalha = {
      'Aquático': {
        forteContra: ['Elemental'],
        fracoContra: ['Mágico']
      },
      'Bicho': {
        forteContra: ['Morto-vivo'],
        fracoContra: ['Humanóide']
      },
      'Dragão': {
        forteContra: ['Mágico'],
        fracoContra: ['Morto-vivo']
      },
      'Draconiano': {
        forteContra: ['Mágico'],
        fracoContra: ['Morto-vivo']
      },
      'Elemental': {
        forteContra: ['Mecânico'],
        fracoContra: ['Fera']
      },
      'Fera': {
        forteContra: ['Bicho'],
        fracoContra: ['Voador']
      },
      'Humanóide': {
        forteContra: ['Morto-vivo'],
        fracoContra: ['Bicho']
      },
      'Mágico': {
        forteContra: ['Voador'],
        fracoContra: ['Aquático']
      },
      'Mecânico': {
        forteContra: ['Fera'],
        fracoContra: ['Elemental']
      },
      'Morto-vivo': {
        forteContra: ['Humanóide'],
        fracoContra: ['Dragão', 'Draconiano']
      },
      'Voador': {
        forteContra: ['Aquático'],
        fracoContra: ['Mecânico']
      }
    };

    // Normaliza o tipo do pet (primeira letra maiúscula, resto minúscula)
    const tipoNormalizado = tipoPet?.trim() || '';
    const tipoCapitalizado = tipoNormalizado.charAt(0).toUpperCase() + tipoNormalizado.slice(1).toLowerCase();
    
    // Busca o tipo (tenta exato primeiro, depois capitalizado)
    const tipoInfo = tiposBatalha[tipoNormalizado] || tiposBatalha[tipoCapitalizado];

    if (!tipoInfo) {
      return res.json({ 
        text: `⚠️ Tipo "${tipoPet}" não reconhecido. Não é possível determinar estratégia de batalha.` 
      });
    }

    // Monta a resposta apenas com forte contra e fraco contra
    let resposta = '';
    
    if (tipoInfo.forteContra && tipoInfo.forteContra.length > 0) {
      resposta += `⚔️ <strong>Forte contra:</strong> ${tipoInfo.forteContra.join(', ')} (Dano +50%)\n\n`;
    }
    
    if (tipoInfo.fracoContra && tipoInfo.fracoContra.length > 0) {
      resposta += `🛡️ <strong>Fraco contra:</strong> ${tipoInfo.fracoContra.join(', ')} (Dano -33%)`;
    }

    if (!resposta) {
      resposta = '⚠️ Informações de batalha não disponíveis para este tipo.';
    }

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
