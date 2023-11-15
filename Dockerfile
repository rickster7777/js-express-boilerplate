FROM node:18.13-alpine
WORKDIR /usr/src/app
COPY --chown=node:node . .
RUN npm install -g gulp husky --silent
RUN npm install --silent
ARG NODE_ENV
ENV NODE_ENV=$NODE_ENV
RUN npm run build
EXPOSE 3003
USER node
CMD if [ "$NODE_ENV" = "production" ] ; then npm run start:prod ; elif [ "$NODE_ENV" = "staging" ] ; then npm run start:staging ; else npm run start:dev ; fi