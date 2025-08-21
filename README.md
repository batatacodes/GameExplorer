```md
# Cubo Explorador

Jogo 3D "Cubo Explorador" construído com React, Three.js, HTML e CSS.

Visão geral:
- Controle um cubo que explora plataformas geradas proceduralmente.
- Três posições laterais (esquerda, centro, direita) via botões/teclado/swipe.
- Plataformas antigas fazem fade-out suave e são removidas para manter a aplicação leve.
- Árvores e elementos naturais gerados por seção (instancing/objetos simples).
- Partículas e brilhos para uma atmosfera mágica.
- Otimizado para mobile e desktop (geometrias simples, sem sombras pesadas).

Como rodar
1. Tenha Node 16+.
2. Instale dependências:
   ```bash
   npm install
   ```
3. Rode em dev:
   ```bash
   npm start
   ```
4. Abra o navegador em http://localhost:1234 (Parcel deve abrir automaticamente).

Estrutura recomendada
- index.html
- package.json
- src/
  - index.jsx
  - App.jsx
  - Game.jsx
  - styles.css

Observações técnicas
- As plataformas são geradas adiante conforme o jogador avança. Quando saem da área, iniciam um fade-out (opacity decresce) e são removidas.
- Árvores são criadas em grupos por seção; para performance usamos geometrias pequenas e poucos polígonos.
- Partículas são Points com blending aditivo para um visual leve e "brilhante".
- Controles: setas/A/D para mudar de faixa; toque/swap e botões na tela para mobile.
- O jogo não tem objetivo final — foco em exploração visual.

Se quiser, posso:
- Empacotar um build pronto para deploy (GitHub Pages / Netlify).
- Adicionar som, efeitos de colisão/ação e coleta de itens.
- Implementar pooling mais agressivo para CPU/GPU muito limitados.
```