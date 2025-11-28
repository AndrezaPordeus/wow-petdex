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

    let resultadosHtml = "";
    for (const dado of dadosOrdenados) {
        const titulo = dado.titulo || 'Sem nome';
        const tipo = dado.tipo || 'Desconhecido';
        const idResposta = `resposta-${titulo.replace(/\s+/g, '').toLowerCase()}`;
        const tituloEscapado = titulo.replace(/'/g, "\\'");
        const tipoEscapado = tipo.replace(/'/g, "\\'");
        
        const imagemHtml = dado.imagem 
            ? `<div class="pet-imagem-container">
                 <img src="${dado.imagem}" alt="${titulo}" class="pet-imagem" 
                      onerror="console.error('Erro ao carregar imagem:', this.src); this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'70\\' height=\\'70\\'%3E%3Crect fill=\\'%231b1f27\\' width=\\'70\\' height=\\'70\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' dy=\\'.3em\\' fill=\\'%23b38836\\' font-size=\\'12\\'%3E?%3C/text%3E%3C/svg%3E';"
                      onload="console.log('Imagem carregada com sucesso:', this.src.substring(0, 50) + '...')">
               </div>`
            : `<div class="pet-imagem-container">
                 <div class="pet-imagem-placeholder">?</div>
               </div>`;
        
        const link = dado.link || '#';
        const descricao = dado.descricao || `Um ${tipo.toLowerCase()} de Azeroth.`;
        
        resultadosHtml += `
            <div class="item-resultado">
                <div class="pet-header">
                    ${imagemHtml}
                    <div class="pet-info">
                        <div class="pet-nome-container">
                            <h2><a href="${link}" target="_blank">${titulo} 🔗</a></h2>
                        </div>
                        <span class="tipo-pet">${tipo}</span>
                    </div>
                </div>
                <p class="descricao-meta">${descricao}</p>
                <button class="btn-ia" onclick="gerarEstrategia('${tituloEscapado}', '${tipoEscapado}', '${idResposta}')">
                   🔮 Revelar Estratégia de Batalha
                </button>
                <div id="${idResposta}" class="box-resposta-ia"></div>
            </div>
        `;
    }
    
    if (section) {
        section.innerHTML = resultadosHtml;
    }
    
    return resultadosHtml;
}

async function pesquisar() {
    const section = document.getElementById("resultados-pesquisa");
    const campoPesquisa = document.getElementById("campo-pesquisa").value.toLowerCase();
    const filtroTipo = document.getElementById("filtro-tipo").value;

    // Permite busca apenas por tipo ou por nome, ou ambos
    if (!campoPesquisa && !filtroTipo) {
        section.innerHTML = `<p class="mensagem-inicial">Você precisa digitar o nome de uma criatura ou selecionar um tipo para consultar o grimório.</p>`;
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
        
        console.log(`📤 Enviando prompt: "${prompt}"`);
        
        let text = await gerarConteudoPeloBackend(prompt);

        
        text = text.trim();
        if (text.startsWith("```json")) {
            text = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (text.startsWith("```")) {
            text = text.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

        const dados = JSON.parse(text);
        
        console.log('📦 Dados recebidos:', dados);
        
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

async function gerarEstrategia(nomePet, tipoPet, idElemento) {
    let divResposta = document.getElementById(idElemento);

    divResposta.style.display = "block";
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