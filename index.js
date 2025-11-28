/**
 * Constrói a URL da API com base no ambiente atual.
 * @param {string} endpoint O endpoint desejado (ex: '/api/busca').
 * @returns {string} A URL completa da API.
 */
function getApiUrl(endpoint) {
    const porta = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    // Se a porta não for 3000, assume que o backend está rodando em localhost:3000
    if (porta !== '3000' && porta !== '') {
        return `http://localhost:3000${endpoint}`;
    }
    // Caso contrário, usa um caminho relativo
    return endpoint;
}
/**
 * Função para chamar nosso próprio backend, que por sua vez chama a API da Blizzard.
 * @param {string} prompt O prompt com o termo de busca.
 * @returns {Promise<string>} O texto da resposta da API.
 */
function renderizarCards(pets) {
    const section = document.getElementById("resultados-pesquisa");

    if (pets.length === 0) {
        section.innerHTML = `<p class="mensagem-inicial">Nenhuma criatura encontrada com esse nome no grimório.</p>`;
        return;
    }

    let resultadosHtml = "";
    for (const dado of pets) {
        const idResposta = `resposta-${dado.titulo.replace(/\s+/g, '').toLowerCase()}`;
        // Escapa aspas simples para evitar problemas no onclick
        const tituloEscapado = dado.titulo.replace(/'/g, "\\'");
        const tipoEscapado = dado.tipo.replace(/'/g, "\\'");
        // Adiciona a imagem do pet se disponível, envolvida em um container
        const imagemHtml = dado.imagem
            ? `<div class="pet-imagem-container">
                    <img src="${dado.imagem}" alt="${dado.titulo}" class="pet-imagem"
                        onerror="console.error('Erro ao carregar imagem:', this.src); this.onerror=null; this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'70\\' height=\\'70\\'%3E%3Crect fill=\\'%231b1f27\\' width=\\'70\\' height=\\'70\\'/%3E%3Ctext x=\\'50%25\\' y=\\'50%25\\' text-anchor=\\'middle\\' dy=\\'.3em\\' fill=\\'%23b38836\\' font-size=\\'12\\'%3E?%3C/text%3E%3C/svg%3E';"
                        onload="console.log('Imagem carregada com sucesso:', this.src.substring(0, 50) + '...')">
                </div>`
            : `<div class="pet-imagem-container">
                    <div class="pet-imagem-placeholder">?</div>
                </div>`;

        resultadosHtml += `
            <div class="item-resultado">
                <div class="pet-header">
                    ${imagemHtml}
                    <div class="pet-info">
                        <div class="pet-nome-container">
                            <h2><a href="${dado.link}" target="_blank">${dado.titulo} 🔗</a></h2>
                        </div>
                        <span class="tipo-pet">${dado.tipo}</span>
                    </div>
                </div>
                <p class="descricao-meta">${dado.descricao}</p>
                <button class="btn-ia" onclick="gerarEstrategia('${tituloEscapado}', '${tipoEscapado}', '${idResposta}')">
                    🔮 Revelar Estratégia de Batalha
                </button>
                <div id="${idResposta}" class="box-resposta-ia"></div>
            </div>
        `;
    }
    section.innerHTML = resultadosHtml;
}

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

async function buscarPets(termo) {
    const section = document.getElementById("resultados-pesquisa");

    // Se termo for vazio (espaço), mostra mensagem diferente
    const mensagemCarregando = termo.trim() === ''
        ? "🔮 Invocando mascotes do grimório..."
        : "🔮 Consultando o Grimório com magia arcana... Aguarde...";

    section.innerHTML = `<p class="mensagem-inicial">${mensagemCarregando}</p>`;

    try {
        // Passa o termo de busca diretamente para a API
        const prompt = `termo: "${termo}"`;
        
        let text = await gerarConteudoPeloBackend(prompt);

        text = text.trim();
        if (text.startsWith("```json")) {
            text = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
        } else if (text.startsWith("```")) {
            text = text.replace(/^```\s*/, "").replace(/\s*```$/, "");
        }

        const dadosResposta = JSON.parse(text);
        
        console.log('📦 Dados recebidos:', dadosResposta);
        dadosResposta.forEach((dado, index) => {
            console.log(`   Pet ${index + 1}: ${dado.titulo} - Imagem: ${dado.imagem ? 'SIM (' + dado.imagem.substring(0, 50) + '...)' : 'NÃO'}`);
        });

        renderizarCards(dadosResposta);

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

async function pesquisar() {
    const section = document.getElementById("resultados-pesquisa");
    const campoPesquisa = document.getElementById("campo-pesquisa").value.toLowerCase();

    if (!campoPesquisa) {
        section.innerHTML = `<p class="mensagem-inicial">Você precisa digitar o nome de uma criatura para consultar o grimório.</p>`;
        return;
    }

    await buscarPets(campoPesquisa);
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

// Adiciona o evento de clique ao botão de pesquisa
document.querySelector('.busca-container button').addEventListener('click', pesquisar);

// Permite que a tecla Enter no campo de texto também inicie a pesquisa
document.getElementById('campo-pesquisa').addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        pesquisar();
    }
});

// Disponibiliza a função para os botões criados dinamicamente
window.gerarEstrategia = gerarEstrategia;

// Renderiza os cards iniciais
// Usa um espaço vazio para buscar os primeiros pets da lista (sem filtro)
buscarPets(" ");