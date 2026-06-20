FROM dhi.io/node:22-alpine-sfw-dev

WORKDIR /app
COPY package.json package-lock.json /app/
RUN npm ci --omit=dev
COPY main.js /app/main.js

ENTRYPOINT ["node"]
CMD ["/app/main.js"]