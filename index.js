/**
 * Constrói a URL da API com base no ambiente atual.
 * @param {string} endpoint O endpoint desejado (ex: '/api/busca').
 * @returns {string} A URL completa da API.
 */
function getApiUrl(endpoint) {
    // Se estiver em ambiente de desenvolvimento (localhost), monta a URL completa.
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return `http://localhost:3000${endpoint}`;
    }
    // Em produção (Render), usa um caminho relativo. O navegador usa o mesmo domínio.
    return endpoint; 
}
/**
 * Função para chamar nosso próprio backend, que por sua vez chama a API da Blizzard.
 * @param {string} prompt O prompt com o termo de busca.
 * @returns {Promise<string>} O texto da resposta da API.
 */
async function gerarConteudoPeloBackend(prompt) {
    const apiUrl = getApiUrl('/api/busca');
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
    });
    
    if (!response.ok) {
        if (response.status === 405) {
            throw new Error(`Servidor não suporta este método. Certifique-se de que o servidor Express está rodando na porta 3000 (npm start).`);
        }
        
        // Tenta obter a mensagem de erro do servidor
        let errorMessage = response.statusText;
        try {
            const errorData = await response.json();
            if (errorData.error) {
                errorMessage = errorData.error;
            }
        } catch (e) {
            // Se não conseguir parsear JSON, usa a mensagem padrão
        }
        
        throw new Error(`Erro na requisição ao backend (${response.status}): ${errorMessage}`);
    }
    const data = await response.json();
    return data.text;
}

// Variável global para armazenar informações de paginação
let paginacaoAtual = {
    paginaAtual: 1,
    totalPaginas: 1,
    totalPets: 0,
    limite: 9
};

/**
 * Carrega pets iniciais para exibir na tela
 */
async function carregarPetsIniciais(pagina = 1) {
    const section = document.getElementById("resultados-pesquisa");
    section.innerHTML = `<p class="mensagem-inicial">🔮 Carregando criaturas do grimório... Página ${pagina}</p>`;
    
    // Limpa dadosCompletos para indicar que estamos na página inicial (não em busca)
    paginacaoAtual.dadosCompletos = null;

    try {
        const apiUrl = getApiUrl(`/api/pets-iniciais?pagina=${pagina}&limite=9`);
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`Erro ao carregar pets: ${response.statusText}`);
        }
        
        const data = await response.json();
        const dados = data.pets || [];
        
        // Atualiza informações de paginação
        if (data.paginacao) {
            paginacaoAtual = data.paginacao;
        }
        
        console.log(`📦 Pets recebidos: ${dados.length} (Página ${pagina} de ${paginacaoAtual.totalPaginas})`);
        
        renderizarPetsComPaginacao(dados, section);
    } catch (error) {
        console.error("Erro ao carregar pets:", error);
        section.innerHTML = `<p class="mensagem-inicial">❌ Não foi possível carregar as criaturas. ${error.message}</p>`;
    }
}

/**
 * Renderiza os pets com controles de paginação
 */
function renderizarPetsComPaginacao(dados, section) {
    if (dados.length === 0) {
        section.innerHTML = `<p class="mensagem-inicial">Nenhuma criatura encontrada.</p>`;
        return;
    }

    // Renderiza os cards (retorna HTML como string)
    let resultadosHtml = renderizarPets(dados, null);
    
    // Adiciona controles de paginação
    const controlesPaginacao = criarControlesPaginacao();
    
    section.innerHTML = resultadosHtml + controlesPaginacao;
}

/**
 * Pagina os resultados da busca (dados já carregados)
 */
function paginarResultadosBusca(pagina) {
    const { dadosCompletos, limite } = paginacaoAtual;
    
    if (!dadosCompletos || dadosCompletos.length === 0) {
        return;
    }
    
    const inicio = (pagina - 1) * limite;
    const fim = inicio + limite;
    const dadosPagina = dadosCompletos.slice(inicio, fim);
    
    // Atualiza a página atual
    paginacaoAtual.paginaAtual = pagina;
    
    // Renderiza a página
    const section = document.getElementById("resultados-pesquisa");
    renderizarPetsComPaginacao(dadosPagina, section);
}

/**
 * Cria os controles de paginação
 */
function criarControlesPaginacao() {
    const { paginaAtual, totalPaginas, totalPets, dadosCompletos } = paginacaoAtual;
    
    if (totalPaginas <= 1) {
        return '';
    }
    
    // Determina qual função usar para navegação
    const funcaoNavegacao = dadosCompletos ? 'paginarResultadosBusca' : 'carregarPetsIniciais';
    
    let botoesHtml = '<div class="paginacao-container">';
    botoesHtml += '<div class="paginacao-botoes">';
    
    // Botão Anterior
    if (paginaAtual > 1) {
        botoesHtml += `<button class="btn-paginacao" onclick="${funcaoNavegacao}(${paginaAtual - 1})">← Anterior</button>`;
    } else {
        botoesHtml += `<button class="btn-paginacao" disabled>← Anterior</button>`;
    }
    
    // Números das páginas
    botoesHtml += '<div class="paginacao-numeros">';
    
    // Mostra até 5 números de página ao redor da página atual
    let inicio = Math.max(1, paginaAtual - 2);
    let fim = Math.min(totalPaginas, paginaAtual + 2);
    
    if (inicio > 1) {
        botoesHtml += `<button class="btn-paginacao-numero" onclick="${funcaoNavegacao}(1)">1</button>`;
        if (inicio > 2) {
            botoesHtml += `<span class="paginacao-ellipsis">...</span>`;
        }
    }
    
    for (let i = inicio; i <= fim; i++) {
        if (i === paginaAtual) {
            botoesHtml += `<button class="btn-paginacao-numero ativo" disabled>${i}</button>`;
        } else {
            botoesHtml += `<button class="btn-paginacao-numero" onclick="${funcaoNavegacao}(${i})">${i}</button>`;
        }
    }
    
    if (fim < totalPaginas) {
        if (fim < totalPaginas - 1) {
            botoesHtml += `<span class="paginacao-ellipsis">...</span>`;
        }
        botoesHtml += `<button class="btn-paginacao-numero" onclick="${funcaoNavegacao}(${totalPaginas})">${totalPaginas}</button>`;
    }
    
    botoesHtml += '</div>';
    
    // Botão Próximo
    if (paginaAtual < totalPaginas) {
        botoesHtml += `<button class="btn-paginacao" onclick="${funcaoNavegacao}(${paginaAtual + 1})">Próximo →</button>`;
    } else {
        botoesHtml += `<button class="btn-paginacao" disabled>Próximo →</button>`;
    }
    
    botoesHtml += '</div>'; // Fecha paginacao-botoes
    botoesHtml += `<div class="paginacao-info">Página ${paginaAtual} de ${totalPaginas} (${totalPets} encontrados)</div>`;
    botoesHtml += '</div>'; // Fecha paginacao-container
    
    return botoesHtml;
}

/**
 * Renderiza os cards de pets na tela (retorna HTML como string)
 */
function renderizarPets(dados, section) {
    if (dados.length === 0) {
        if (section) {
            section.innerHTML = `<p class="mensagem-inicial">Nenhuma criatura encontrada.</p>`;
        }
        return '';
    }

    // Filtra dados inválidos e ordena os pets alfabeticamente pelo título
    const dadosValidos = dados.filter(dado => dado && dado.titulo);
    const dadosOrdenados = [...dadosValidos].sort((a, b) => {
        const tituloA = a.titulo?.toLowerCase() || '';
        const tituloB = b.titulo?.toLowerCase() || '';
        return tituloA.localeCompare(tituloB, 'pt-BR');
    });

    // Função auxiliar para escapar HTML
    const escapeHtml = (text) => {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
    
    let resultadosHtml = "";
    for (const dado of dadosOrdenados) {
        const titulo = dado.titulo || 'Sem nome';
        const tipo = dado.tipo || 'Desconhecido';
        
        // Define variáveis HTML escapadas primeiro (antes de serem usadas)
        const tituloHtml = escapeHtml(titulo);
        const tipoHtml = escapeHtml(tipo);
        
        // Cria um ID seguro removendo todos os caracteres especiais
        const idResposta = `resposta-${titulo.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 30)}`;
        // Escapa corretamente para uso em atributos HTML/JavaScript - precisa escapar para JavaScript dentro de HTML
        const tituloEscapado = titulo
            .replace(/\\/g, '\\\\')  // Escapa barras invertidas primeiro
            .replace(/'/g, "\\'")    // Escapa aspas simples
            .replace(/"/g, '\\"')    // Escapa aspas duplas
            .replace(/\n/g, ' ')     // Remove quebras de linha
            .replace(/\r/g, '')      // Remove carriage return
            .replace(/</g, '&lt;')   // Escapa <
            .replace(/>/g, '&gt;'); // Escapa >
        const tipoEscapado = tipo
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"')
            .replace(/\n/g, ' ')
            .replace(/\r/g, '')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        const imagemUrlEscapada = escapeHtml(dado.imagem || '');
        const imagemHtml = dado.imagem 
            ? `<div class="pet-imagem-container">
                 <img src="${imagemUrlEscapada}" alt="${tituloHtml}" class="pet-imagem" 
                      onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;70&quot; height=&quot;70&quot;%3E%3Crect fill=&quot;%231b1f27&quot; width=&quot;70&quot; height=&quot;70&quot;/%3E%3Ctext x=&quot;50%25&quot; y=&quot;50%25&quot; text-anchor=&quot;middle&quot; dy=&quot;.3em&quot; fill=&quot;%23b38836&quot; font-size=&quot;12&quot;%3E?%3C/text%3E%3C/svg%3E';">
               </div>`
            : `<div class="pet-imagem-container">
                 <div class="pet-imagem-placeholder">?</div>
               </div>`;
        
        const link = dado.link || '#';
        const descricao = escapeHtml(dado.descricao || `Um ${tipo.toLowerCase()} de Azeroth.`);
        
        // Informações adicionais (apenas se disponíveis - resultados de busca)
        // Debug: verifica se os dados estão presentes
        console.log(`Pet: ${titulo}`, JSON.stringify({
            habilidades: dado.habilidades?.length || 0,
            ehDeCombate: dado.ehDeCombate,
            ehCapturavel: dado.ehCapturavel,
            ehNegociavel: dado.ehNegociavel,
            ondeObter: dado.ondeObter
        }));
        
        // Cria um ID único para o container expansível
        const infoId = `info-${titulo.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 30)}-${Math.random().toString(36).substr(2, 9)}`;
        
        let infoAdicionalHtml = '';
        let infoForaCardHtml = '';
        
        // Verifica se há habilidades ou outras informações para exibir
        const temHabilidades = dado.habilidades && Array.isArray(dado.habilidades) && dado.habilidades.length > 0;
        const temOutrasInfo = dado.ehDeCombate !== undefined || dado.ehCapturavel !== undefined || dado.ehNegociavel !== undefined || dado.ondeObter;
        const ehDeCombate = dado.ehDeCombate === true;
        
        // Card de habilidades (expansível)
        if (temHabilidades || !ehDeCombate) {
            // Determina o texto do botão: "Habilidades" se não é de combate ou se tem habilidades, "Atributos" caso contrário
            const textoBotao = (!ehDeCombate || temHabilidades) ? 'Habilidades' : 'Atributos';
            
            // Botão para expandir/contrair
            infoAdicionalHtml = `
                <button class="btn-expandir-atributos" onclick="toggleAtributos('${infoId}')" aria-expanded="false">
                    <span class="btn-expandir-texto">${textoBotao}</span>
                    <span class="btn-expandir-icone">▼</span>
                </button>
                <div id="${infoId}" class="pet-info-adicional collapsed">
            `;
            
            // Habilidades
            if (temHabilidades && ehDeCombate) {
                // Se é de combate e tem habilidades, mostra as habilidades
                infoAdicionalHtml += '<div class="pet-habilidades">';
                infoAdicionalHtml += '<div class="habilidades-grid">';
                
                dado.habilidades.forEach((habilidade, index) => {
                    const nomeHabilidade = escapeHtml(habilidade.nome || `Habilidade ${index + 1}`);
                    const imagemHabilidade = habilidade.imagem || '';
                    const imagemUrlEscapada = escapeHtml(imagemHabilidade);
                    
                    infoAdicionalHtml += '<div class="habilidade-item">';
                    
                    // Imagem da habilidade
                    if (imagemHabilidade) {
                        infoAdicionalHtml += `
                            <div class="habilidade-imagem-container">
                                <img src="${imagemUrlEscapada}" alt="${nomeHabilidade}" class="habilidade-imagem"
                                     onerror="this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=&quot;http://www.w3.org/2000/svg&quot; width=&quot;56&quot; height=&quot;56&quot;%3E%3Crect fill=&quot;%231b1f27&quot; width=&quot;56&quot; height=&quot;56&quot;/%3E%3Ctext x=&quot;50%25&quot; y=&quot;50%25&quot; text-anchor=&quot;middle&quot; dy=&quot;.3em&quot; fill=&quot;%23b38836&quot; font-size=&quot;10&quot;%3E?%3C/text%3E%3C/svg%3E';">
                            </div>
                        `;
                    } else {
                        infoAdicionalHtml += `
                            <div class="habilidade-imagem-container">
                                <div class="habilidade-imagem-placeholder">?</div>
                            </div>
                        `;
                    }
                    
                    // Nome da habilidade
                    infoAdicionalHtml += `
                        <div class="habilidade-info">
                            <div class="habilidade-nome">${nomeHabilidade}</div>
                        </div>
                    `;
                    
                    infoAdicionalHtml += '</div>';
                });
                
                infoAdicionalHtml += '</div></div>';
            } else if (!ehDeCombate) {
                // Se não é de combate (uma ou menos habilidade), SEMPRE mostra a mensagem
                infoAdicionalHtml += '<div class="pet-habilidades">';
                infoAdicionalHtml += '<div class="pet-sem-combate">';
                infoAdicionalHtml += '<p class="mensagem-sem-combate">Esta criatura não pode lutar</p>';
                infoAdicionalHtml += '</div></div>';
            }
            
            infoAdicionalHtml += '</div>';
        }
        
        // Informações que aparecem fora do card de habilidades
        if (temOutrasInfo) {
            // Combate
            if (dado.ehDeCombate !== undefined) {
                const ehDeCombate = dado.ehDeCombate;
                const combateTexto = ehDeCombate ? 'Sim' : 'Não';
                const combateClass = ehDeCombate ? 'combate-sim' : 'combate-nao';
                infoForaCardHtml += `<div class="pet-combate"><span class="combate-label">⚔️ Pet de Combate:</span> <span class="combate-valor ${combateClass}">${combateTexto}</span></div>`;
            }
            
            // Capturável
            if (dado.ehCapturavel !== undefined) {
                const ehCapturavel = dado.ehCapturavel;
                const capturavelTexto = ehCapturavel ? 'Sim' : 'Não';
                const capturavelClass = ehCapturavel ? 'capturavel-sim' : 'capturavel-nao';
                infoForaCardHtml += '<div class="pet-capturavel">';
                infoForaCardHtml += '<span class="capturavel-label">🪤 Capturável:</span> ';
                infoForaCardHtml += `<span class="capturavel-valor ${capturavelClass}">${capturavelTexto}</span>`;
                infoForaCardHtml += '</div>';
            }
            
            // Negociável
            if (dado.ehNegociavel !== undefined) {
                const ehNegociavel = dado.ehNegociavel;
                const negociavelTexto = ehNegociavel ? 'Sim' : 'Não';
                const negociavelClass = ehNegociavel ? 'negociavel-sim' : 'negociavel-nao';
                infoForaCardHtml += '<div class="pet-negociavel">';
                infoForaCardHtml += '<span class="negociavel-label">⚖️ Negociável:</span> ';
                infoForaCardHtml += `<span class="negociavel-valor ${negociavelClass}">${negociavelTexto}</span>`;
                infoForaCardHtml += '</div>';
            }
            
            // Onde obter
            if (dado.ondeObter && dado.ondeObter !== 'Informação não disponível') {
                const ondeObterEscapado = escapeHtml(dado.ondeObter);
                infoForaCardHtml += `<div class="pet-onde-obter"><span class="onde-obter-label">🔍 Como obter:</span> <span class="onde-obter-valor">${ondeObterEscapado}</span></div>`;
            }
        }
        
        // Botão de estratégia apenas para pets de combate
        let estrategiaHtml = '';
        if (ehDeCombate) {
            estrategiaHtml = `
                <button class="btn-ia" data-titulo="${escapeHtml(titulo)}" data-tipo="${escapeHtml(tipo)}" data-resposta-id="${idResposta}" onclick="toggleEstrategia(this)" aria-expanded="false">
                   <span class="btn-ia-texto">🔮 Revelar Estratégia de Batalha</span>
                   <span class="btn-ia-icone">▼</span>
                </button>
                <div id="${idResposta}" class="box-resposta-ia collapsed"></div>
            `;
        }
        
        resultadosHtml += `
            <div class="item-resultado">
                <div class="pet-header">
                    ${imagemHtml}
                    <div class="pet-info">
                        <div class="pet-nome-container">
                            <h2><a href="${link}" target="_blank">${tituloHtml} 🔗</a></h2>
                        </div>
                        <span class="tipo-pet">${tipoHtml}</span>
                    </div>
                </div>
                <p class="descricao-meta">${descricao}</p>
                ${infoForaCardHtml}
                ${infoAdicionalHtml}
                ${estrategiaHtml}
            </div>
        `;
    }
    
    if (section) {
        section.innerHTML = resultadosHtml;
    }
    
    return resultadosHtml;
}

/**
 * Alterna a exibição dos atributos/habilidades do pet (expandir/contrair)
 * Função global para ser acessível via onclick
 */
window.toggleAtributos = function(infoId) {
    const container = document.getElementById(infoId);
    if (!container) return;
    
    const button = container.previousElementSibling;
    if (!button || !button.classList.contains('btn-expandir-atributos')) return;
    
    const isExpanded = container.classList.contains('expanded');
    const textoElement = button.querySelector('.btn-expandir-texto');
    const iconeElement = button.querySelector('.btn-expandir-icone');
    
    // Mantém o texto original (Habilidades ou Atributos)
    const textoOriginal = textoElement ? textoElement.textContent : 'Habilidades';
    
    if (isExpanded) {
        // Contrair
        container.classList.remove('expanded');
        container.classList.add('collapsed');
        button.setAttribute('aria-expanded', 'false');
        if (textoElement) textoElement.textContent = textoOriginal;
        if (iconeElement) iconeElement.textContent = '▼';
    } else {
        // Expandir
        container.classList.remove('collapsed');
        container.classList.add('expanded');
        button.setAttribute('aria-expanded', 'true');
        if (textoElement) textoElement.textContent = textoOriginal;
        if (iconeElement) iconeElement.textContent = '▲';
    }
};

async function pesquisar() {
    const section = document.getElementById("resultados-pesquisa");
    const campoPesquisa = document.getElementById("campo-pesquisa").value.toLowerCase();
    const filtroTipo = document.getElementById("filtro-tipo").value;
    const elementoCombate = document.getElementById("filtro-combate");
    const filtroCombate = elementoCombate ? elementoCombate.value : "";

    // Permite busca apenas por tipo ou por nome, ou ambos
    if (!campoPesquisa && !filtroTipo && !filtroCombate) {
        section.innerHTML = `<p class="mensagem-inicial">Você precisa digitar o nome de uma criatura, selecionar um tipo ou filtrar por combate para consultar o grimório.</p>`;
        return;
    }

    section.innerHTML = `<p class="mensagem-inicial">🔮 Consultando o Grimório com magia arcana... Aguarde...</p>`;

    try {
        // Passa o termo de busca e o filtro de tipo para a API
        let prompt = '';
        if (campoPesquisa) {
            prompt += `termo: "${campoPesquisa}"`;
        }
        if (filtroTipo) {
            if (prompt) prompt += ' ';
            prompt += `tipo: "${filtroTipo}"`;
        }
        if (filtroCombate) {
            if (prompt) prompt += ' ';
            prompt += `combate: "${filtroCombate}"`;
        }
        
        console.log(`📤 Enviando prompt: "${prompt}"`);
        
        // A função gerarConteudoPeloBackend retorna uma string JSON (data.text)
        let text = await gerarConteudoPeloBackend(prompt);
        
        // Limpa a string se vier com markdown code blocks
        text = text.trim();
        if (text.startsWith("```json")) {
            text = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (text.startsWith("```")) {
            text = text.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

        // Faz o parse da string JSON
        const dados = JSON.parse(text);
        
        console.log('📦 Dados recebidos:', dados);
        console.log('📦 Tipo dos dados:', Array.isArray(dados) ? 'Array' : typeof dados);
        console.log('📦 Quantidade:', Array.isArray(dados) ? dados.length : 'N/A');
        
        // Se houver mais de 9 pets, usa paginação
        if (dados.length > 9) {
            // Atualiza informações de paginação para os resultados da busca
            const limite = 9;
            const totalPaginas = Math.ceil(dados.length / limite);
            paginacaoAtual = {
                paginaAtual: 1,
                totalPaginas: totalPaginas,
                totalPets: dados.length,
                limite: limite,
                dadosCompletos: dados // Armazena todos os dados para paginação
            };
            
            // Renderiza apenas a primeira página
            const primeiraPagina = dados.slice(0, limite);
            renderizarPetsComPaginacao(primeiraPagina, section);
        } else {
            // Se houver 9 ou menos pets, limpa dadosCompletos e renderiza sem paginação
            paginacaoAtual.dadosCompletos = null;
            renderizarPets(dados, section);
        }

    } catch (error) {
        console.error("Erro ao buscar dados da API:", error);
        let mensagemErro = "❌ Ocorreu um erro mágico! ";
        
        if (error.message.includes("405") || error.message.includes("Method Not Allowed")) {
            mensagemErro += `<br><strong>O servidor Express não está rodando!</strong><br>Execute <code>npm start</code> no terminal e acesse <code>http://localhost:3000</code>`;
        } else if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
            mensagemErro += `<br><strong>Não foi possível conectar ao servidor.</strong><br>Certifique-se de que o servidor está rodando (npm start) na porta 3000.`;
        } else if (error.message.includes("500") || error.message.includes("Internal Server Error")) {
            mensagemErro += `<br><strong>Erro no servidor.</strong><br>`;
            
            // Extrai a mensagem de erro específica se disponível
            const errorMatch = error.message.match(/Erro na requisição ao backend \(500\): (.+)/);
            if (errorMatch && errorMatch[1]) {
                mensagemErro += `<br><strong>Detalhes:</strong> ${errorMatch[1]}`;
            }
            
            mensagemErro += `<br><br><strong>Possíveis causas:</strong>`;
            mensagemErro += `<br>• Credenciais da Blizzard não configuradas (veja CONFIGURACAO.md)`;
            mensagemErro += `<br>• Erro na conexão com a API da Blizzard`;
            mensagemErro += `<br>• Verifique o console do servidor para mais detalhes`;
        } else {
            mensagemErro += `<br>${error.message}`;
        }
        section.innerHTML = `<p class="mensagem-inicial">${mensagemErro}</p>`;
    }
}

/**
 * Alterna a exibição da estratégia de batalha (expandir/contrair)
 * Função global para ser acessível via onclick
 */
window.toggleEstrategia = function(button) {
    const idElemento = button.dataset.respostaId;
    const divResposta = document.getElementById(idElemento);
    
    if (!divResposta) return;
    
    const isExpanded = divResposta.classList.contains('expanded');
    const textoElement = button.querySelector('.btn-ia-texto');
    const iconeElement = button.querySelector('.btn-ia-icone');
    
    if (isExpanded) {
        // Contrair
        divResposta.classList.remove('expanded');
        divResposta.classList.add('collapsed');
        button.setAttribute('aria-expanded', 'false');
        if (textoElement) textoElement.textContent = '🔮 Revelar Estratégia de Batalha';
        if (iconeElement) iconeElement.textContent = '▼';
    } else {
        // Expandir - se ainda não carregou, carrega a estratégia
        if (!divResposta.dataset.carregado) {
            gerarEstrategia(button.dataset.titulo, button.dataset.tipo, idElemento, button);
        } else {
            divResposta.classList.remove('collapsed');
            divResposta.classList.add('expanded');
            button.setAttribute('aria-expanded', 'true');
            if (textoElement) textoElement.textContent = '🔮 Ocultar Estratégia de Batalha';
            if (iconeElement) iconeElement.textContent = '▲';
        }
    }
};

async function gerarEstrategia(nomePet, tipoPet, idElemento, button) {
    let divResposta = document.getElementById(idElemento);
    const textoElement = button ? button.querySelector('.btn-ia-texto') : null;
    const iconeElement = button ? button.querySelector('.btn-ia-icone') : null;

    // Expande o container
    divResposta.classList.remove('collapsed');
    divResposta.classList.add('expanded');
    if (button) {
        button.setAttribute('aria-expanded', 'true');
        if (textoElement) textoElement.textContent = '🔮 Ocultar Estratégia de Batalha';
        if (iconeElement) iconeElement.textContent = '▲';
    }
    
    divResposta.innerHTML = "🧙‍♂️ Consultando os espíritos ancestrais... (Aguarde)";

    try {
        const apiUrl = getApiUrl('/api/estrategia');
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ nomePet, tipoPet }),
        });

        if (!response.ok) {
            if (response.status === 405) {
                throw new Error(`Servidor não suporta este método. Certifique-se de que o servidor Express está rodando na porta 3000 (npm start).`);
            }
            throw new Error(`Erro na requisição ao backend: ${response.statusText}`);
        }

        const data = await response.json();
        let texto = data.text;

        texto = texto.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        texto = texto.replace(/\n/g, '<br>');

        divResposta.innerHTML = texto;
        divResposta.dataset.carregado = 'true';

    } catch (error) {
        console.error("Erro ao gerar estratégia:", error);
        let mensagemErro = "❌ Ocorreu um erro ao consultar os espíritos. ";
        if (error.message.includes("405") || error.message.includes("Method Not Allowed")) {
            mensagemErro += "Certifique-se de que o servidor Express está rodando (npm start) na porta 3000.";
        } else {
            mensagemErro += error.message;
        }
        divResposta.innerHTML = mensagemErro;
    }
}

/**
 * Volta para a página inicial
 */
function voltarPaginaInicial() {
    // Limpa os campos de busca
    document.getElementById("campo-pesquisa").value = '';
    document.getElementById("filtro-tipo").value = '';
    const elementoCombate = document.getElementById("filtro-combate");
    if (elementoCombate) elementoCombate.value = '';
    
    // Recarrega os pets iniciais na página 1
    carregarPetsIniciais(1);
}

// Carrega pets iniciais quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    carregarPetsIniciais();
});

// Adiciona o evento de clique ao botão de pesquisa
document.getElementById('btn-consultar').addEventListener('click', pesquisar);

// Adiciona o evento de clique ao botão de voltar
document.getElementById('btn-voltar-inicio').addEventListener('click', voltarPaginaInicial);

// Permite que a tecla Enter no campo de texto também inicie a pesquisa
document.getElementById('campo-pesquisa').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        pesquisar();
    }
});

// Disponibiliza as funções para uso global
window.gerarEstrategia = gerarEstrategia;
window.carregarPetsIniciais = carregarPetsIniciais;
window.paginarResultadosBusca = paginarResultadosBusca;