# Guia de Instalação - API ArcFace (VPS / aaPanel)

Este guia ensina como colocar sua API de reconhecimento facial para rodar no seu servidor.

## 1. Preparação

Acesse seu servidor via terminal (SSH) ou use o terminal do aaPanel.
Crie uma pasta para o projeto:

```bash
mkdir face-api
cd face-api
```

Faça upload dos arquivos `main.py` e `requirements.txt` (que estão nesta pasta `documentacao`) para dentro dessa pasta `face-api` no servidor.

## 2. Instalação das Dependências

É recomendado usar o Python 3.8 ou superior.

```bash
# Instalar as bibliotecas (pode demorar alguns minutos)
pip install -r requirements.txt
```

*Nota: Na primeira vez, ele vai baixar bibliotecas pesadas como ONNX e PyTorch.*

## 3. Rodando o Servidor

Para testar se está tudo funcionando, rode o comando:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

Se aparecer `Application startup complete`, está funcionando!
Na primeira execução, ele vai baixar o modelo de IA `buffalo_l` (aprox. 300MB) automaticamente.

## 4. Mantendo o Servidor Ligado (Produção)

Se você fechar o terminal, o servidor cai. Para manter ligado para sempre:

### Opção A: Usando o "Python Manager" do aaPanel (Recomendado)
1. Vá na App Store do aaPanel e instale o "Python Manager".
2. Crie um novo projeto.
3. Path: selecione a pasta `face-api`.
4. Run Command: `uvicorn main:app --host 0.0.0.0 --port 8000`
5. Framework: FastAPI.
6. Clique em Start.

### Opção B: Usando Nohup (Terminal Simples)
```bash
nohup uvicorn main:app --host 0.0.0.0 --port 8000 &
```

## 5. Configurando no Site

1. Pegue o IP do seu servidor (ex: `123.456.78.90`).
2. A URL da sua API será: `http://123.456.78.90:8000/search-face`
3. Vá no painel Admin do FaceFind -> Configurações.
4. Selecione "API Externa".
5. Cole a URL acima.
6. Salve.

Pronto! Agora o reconhecimento facial será feito pelo seu servidor super rápido.
