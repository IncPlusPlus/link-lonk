FROM node:16 as base

WORKDIR /home/node/app

COPY package.json ./

RUN npm i

COPY . .

FROM base as production

ENV NODE_PATH=./build
# Allows for ts-node to be referenced
ENV PATH="/home/node/app/node_modules/.bin:$PATH"

# "tsconfig.json(4,19): error TS4124: Compiler option 'module' of value 'nodenext' is unstable. Use nightly TypeScript to silence this error. Try updating with 'npm install -D typescript@next'."
#RUN npm install -D typescript@next
#RUN npm run build

ENTRYPOINT ["ts-node"]
CMD ["src/Bot.ts"]
#CMD node -r ts-node/register dist/Bot.js
#CMD ["node", "dist/Bot.js"]
