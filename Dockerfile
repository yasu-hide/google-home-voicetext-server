FROM node:current-stretch-slim
WORKDIR /tmp
COPY package.json /tmp/package.json
RUN npm config set unsafe-perm true \
    && npm update -y -g npm \
    && npm install \
    && npm config set unsafe-perm false
COPY main.js /tmp/main.js
ENTRYPOINT ["node"]
CMD ["/tmp/main.js"]