FROM node:20.20.0-slim
WORKDIR /tmp
COPY package.json /tmp/package.json
RUN npm install
COPY main.js /tmp/main.js
ENTRYPOINT ["node"]
CMD ["/tmp/main.js"]