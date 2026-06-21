FROM dhi.io/node:22-alpine-sfw-dev

WORKDIR /app
COPY package.json package-lock.json /app/
RUN npm ci --omit=dev
COPY main.js app.js /app/

ENTRYPOINT ["node"]
CMD ["/app/main.js"]