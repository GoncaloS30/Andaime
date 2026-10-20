# Frontend do Andaime (SPA Vite/React) servido por nginx sem privilégios, com proxy de /api para o backend.
#
#   docker build -f infra/web/Dockerfile -t andaime-web .        (contexto = raiz do repositório)
#
# A versão do Node segue o .nvmrc (24). As imagens estão fixadas em versões concretas; atualizar de propósito.

FROM node:24.22.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build \
    # Ficheiros de configuração de outros alojamentos (Netlify/Vercel): o nginx trata do fallback da SPA.
    && rm -f dist/_redirects dist/vercel.json

FROM nginxinc/nginx-unprivileged:1.31.7-alpine
# O nginx.conf é um template: o entrypoint da imagem substitui ${ANDAIME_BACKEND} e ${NGINX_LOCAL_RESOLVERS}
# (resolver DNS lido do /etc/resolv.conf do contentor, para voltar a resolver o backend se este mudar de IP).
ENV ANDAIME_BACKEND=backend:8088 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_ENVSUBST_FILTER="^(ANDAIME_|NGINX_LOCAL_RESOLVERS)"
COPY infra/web/nginx.conf /etc/nginx/templates/default.conf.template
COPY infra/web/security-headers.conf infra/web/proxy-headers.conf /etc/nginx/snippets/
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
